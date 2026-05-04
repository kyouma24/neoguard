"""Server-side MQL variable substitution.

Spec reference: 02-dashboards-technical.md C.6, D.2
- Substitution happens SERVER-SIDE at MQL compile time (NOT client-side string replace).
- $env in avg:cpu{env:$env} -> if env=prod -> avg:cpu{env:prod}
- Multi-value: $env with [prod, staging] -> env:prod,env:staging (OR semantics)
- $__all sentinel -> removes the tag filter entirely
- Invalid substitution (undefined variable) -> query rejected with explicit error
"""

from __future__ import annotations

import re

# Matches $variable_name references in an MQL query string.
# Variable names: letters, digits, underscores (must start with letter or underscore).
_VARIABLE_REF = re.compile(r"\$([a-zA-Z_][a-zA-Z0-9_]*)")

# Security: variable values must match this pattern (spec D.2).
_SAFE_VALUE = re.compile(r"^[a-zA-Z0-9._\-*]+$")

# The sentinel value that means "remove this tag filter entirely".
ALL_SENTINEL = "$__all"


class VariableSubstitutionError(ValueError):
    """Raised when variable substitution fails."""

    def __init__(self, message: str, variable: str, position: int | None = None) -> None:
        self.variable = variable
        self.position = position
        super().__init__(message)


def _validate_value(value: str, variable_name: str) -> None:
    """Validate a single variable value against the allowed character set."""
    if not value:
        raise VariableSubstitutionError(
            f"Empty value for variable '${variable_name}'",
            variable=variable_name,
        )
    if not _SAFE_VALUE.match(value):
        raise VariableSubstitutionError(
            f"Invalid value for variable '${variable_name}': "
            f"'{value}' contains disallowed characters. "
            f"Allowed: [a-zA-Z0-9._\\-*]",
            variable=variable_name,
        )


def substitute_variables(
    query: str,
    variables: dict[str, str | list[str]],
) -> str:
    """Substitute $variable references in an MQL query string.

    Args:
        query: The raw MQL query, e.g. "avg:cpu{env:$env,region:$region}"
        variables: Mapping of variable names to values. Values can be:
            - str: single value substitution
            - list[str]: multi-value (OR semantics in tag filters)
            - "$__all": remove the tag filter containing this variable

    Returns:
        The query with all variables substituted.

    Raises:
        VariableSubstitutionError: If a variable is referenced but not defined,
            or if a value contains disallowed characters.
    """
    # First pass: find all referenced variables and check they are defined.
    refs = list(_VARIABLE_REF.finditer(query))
    if not refs:
        return query

    for m in refs:
        var_name = m.group(1)
        if var_name not in variables:
            raise VariableSubstitutionError(
                f"Undefined variable '${var_name}' at position {m.start()}",
                variable=var_name,
                position=m.start(),
            )

    # Validate all values upfront before doing any substitution.
    for m in refs:
        var_name = m.group(1)
        val = variables[var_name]
        if isinstance(val, list):
            for v in val:
                if v != ALL_SENTINEL:
                    _validate_value(v, var_name)
        elif val != ALL_SENTINEL:
            _validate_value(val, var_name)

    # Second pass: handle $__all by removing entire tag filters.
    result = _remove_all_sentinel_filters(query, variables)

    # Third pass: expand multi-value variables in tag filters.
    result = _expand_multi_value_filters(result, variables)

    # Fourth pass: simple single-value substitution for remaining $vars.
    result = _substitute_single_values(result, variables)

    return result


def _remove_all_sentinel_filters(
    query: str,
    variables: dict[str, str | list[str]],
) -> str:
    """Remove tag filters whose variable value is $__all."""
    all_vars = {
        name for name, val in variables.items()
        if val == ALL_SENTINEL or (isinstance(val, list) and ALL_SENTINEL in val)
    }
    if not all_vars:
        return query

    # Find the tag filter section: everything between { and }
    brace_start = query.find("{")
    if brace_start == -1:
        return query
    brace_end = query.find("}", brace_start)
    if brace_end == -1:
        return query

    filter_section = query[brace_start + 1:brace_end]
    filters = _split_filters(filter_section)

    # Keep filters that don't reference $__all variables
    kept: list[str] = []
    for f in filters:
        f_stripped = f.strip()
        should_remove = False
        for var_name in all_vars:
            if f"${var_name}" in f_stripped:
                should_remove = True
                break
        if not should_remove:
            kept.append(f_stripped)

    if kept:
        new_filter_section = ",".join(kept)
        return query[:brace_start + 1] + new_filter_section + query[brace_end:]
    else:
        # All filters removed — remove the braces entirely
        return query[:brace_start] + query[brace_end + 1:]


def _split_filters(filter_section: str) -> list[str]:
    """Split a comma-separated filter section, respecting IN(...) parentheses."""
    filters: list[str] = []
    depth = 0
    current: list[str] = []

    for ch in filter_section:
        if ch == "(":
            depth += 1
            current.append(ch)
        elif ch == ")":
            depth -= 1
            current.append(ch)
        elif ch == "," and depth == 0:
            filters.append("".join(current))
            current = []
        else:
            current.append(ch)

    if current:
        filters.append("".join(current))

    return filters


def _expand_multi_value_filters(
    query: str,
    variables: dict[str, str | list[str]],
) -> str:
    """Expand multi-value variables in tag filters.

    e.g. env:$env with $env=[prod, staging] -> env:prod,env:staging
    """
    multi_vars = {
        name: val for name, val in variables.items()
        if isinstance(val, list) and ALL_SENTINEL not in val
    }
    if not multi_vars:
        return query

    brace_start = query.find("{")
    if brace_start == -1:
        return query
    brace_end = query.find("}", brace_start)
    if brace_end == -1:
        return query

    filter_section = query[brace_start + 1:brace_end]
    filters = _split_filters(filter_section)

    expanded: list[str] = []
    for f in filters:
        f_stripped = f.strip()
        matched_var = None
        for var_name, values in multi_vars.items():
            if f"${var_name}" in f_stripped:
                matched_var = (var_name, values)
                break

        if matched_var:
            var_name, values = matched_var
            # Find the key:$var pattern and expand to key:val1,key:val2,...
            colon_idx = f_stripped.find(":")
            if colon_idx != -1:
                key_part = f_stripped[:colon_idx]
                for v in values:
                    expanded.append(f"{key_part}:{v}")
            else:
                # Fallback: just do simple replacement for each value
                for v in values:
                    expanded.append(f_stripped.replace(f"${var_name}", v))
        else:
            expanded.append(f_stripped)

    new_filter_section = ",".join(expanded)
    return query[:brace_start + 1] + new_filter_section + query[brace_end:]


def _substitute_single_values(
    query: str,
    variables: dict[str, str | list[str]],
) -> str:
    """Replace remaining $var references with single string values."""

    def replace_match(m: re.Match[str]) -> str:
        var_name = m.group(1)
        val = variables.get(var_name)
        if val is None:
            # Variable was already handled (e.g. $__all removal)
            return m.group(0)
        if isinstance(val, list):
            # Multi-value in non-filter context: use first value
            return val[0] if val else m.group(0)
        if val == ALL_SENTINEL:
            # $__all in non-filter context: leave as-is (already handled)
            return m.group(0)
        return val

    return _VARIABLE_REF.sub(replace_match, query)
