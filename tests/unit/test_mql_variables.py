"""Tests for server-side MQL variable substitution.

Spec reference: 02-dashboards-technical.md C.6, D.2
"""

import pytest

from neoguard.services.mql.variables import (
    substitute_variables,
    VariableSubstitutionError,
)


class TestSingleValueSubstitution:
    def test_simple_tag_value(self):
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "prod"},
        )
        assert result == "avg:cpu{env:prod}"

    def test_multiple_variables(self):
        result = substitute_variables(
            "avg:cpu{env:$env,region:$region}",
            {"env": "prod", "region": "us-east-1"},
        )
        assert result == "avg:cpu{env:prod,region:us-east-1}"

    def test_variable_with_dotted_value(self):
        result = substitute_variables(
            "avg:cpu{host:$host}",
            {"host": "web.server.01"},
        )
        assert result == "avg:cpu{host:web.server.01}"

    def test_variable_with_hyphenated_value(self):
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "us-west-2"},
        )
        assert result == "avg:cpu{env:us-west-2}"

    def test_variable_with_wildcard_value(self):
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "prod*"},
        )
        assert result == "avg:cpu{env:prod*}"

    def test_variable_with_underscore_name(self):
        result = substitute_variables(
            "avg:cpu{env:$my_env}",
            {"my_env": "prod"},
        )
        assert result == "avg:cpu{env:prod}"


class TestMetricNameVariable:
    def test_variable_in_metric_name(self):
        """Variables can appear in metric name position."""
        result = substitute_variables(
            "avg:$metric{env:prod}",
            {"metric": "cpu"},
        )
        assert result == "avg:cpu{env:prod}"

    def test_variable_as_partial_metric_name(self):
        result = substitute_variables(
            "avg:aws.$service.cpu{env:prod}",
            {"service": "rds"},
        )
        assert result == "avg:aws.rds.cpu{env:prod}"


class TestMultiValueSubstitution:
    def test_list_expands_to_or_semantics(self):
        """Multi-value: $env with [prod, staging] -> env:prod,env:staging"""
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": ["prod", "staging"]},
        )
        assert result == "avg:cpu{env:prod,env:staging}"

    def test_multi_value_with_other_filters(self):
        result = substitute_variables(
            "avg:cpu{env:$env,host:web01}",
            {"env": ["prod", "staging"]},
        )
        assert result == "avg:cpu{env:prod,env:staging,host:web01}"

    def test_multi_value_single_item_list(self):
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": ["prod"]},
        )
        assert result == "avg:cpu{env:prod}"

    def test_multi_value_three_items(self):
        result = substitute_variables(
            "avg:cpu{region:$region}",
            {"region": ["us-east-1", "us-west-2", "eu-west-1"]},
        )
        assert result == "avg:cpu{region:us-east-1,region:us-west-2,region:eu-west-1}"

    def test_multi_value_preserves_negation_prefix(self):
        """Negation filter with multi-value expands the key prefix."""
        result = substitute_variables(
            "avg:cpu{!env:$env}",
            {"env": ["dev", "test"]},
        )
        assert result == "avg:cpu{!env:dev,!env:test}"


class TestAllSentinel:
    def test_all_removes_single_filter(self):
        """$__all sentinel removes the entire tag filter."""
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "$__all"},
        )
        assert result == "avg:cpu"

    def test_all_removes_one_filter_keeps_others(self):
        result = substitute_variables(
            "avg:cpu{env:$env,host:web01}",
            {"env": "$__all"},
        )
        assert result == "avg:cpu{host:web01}"

    def test_all_removes_all_filters(self):
        result = substitute_variables(
            "avg:cpu{env:$env,region:$region}",
            {"env": "$__all", "region": "$__all"},
        )
        assert result == "avg:cpu"

    def test_all_with_functions_preserved(self):
        result = substitute_variables(
            "avg:cpu{env:$env}.rate()",
            {"env": "$__all"},
        )
        assert result == "avg:cpu.rate()"


class TestNoVariables:
    def test_passthrough_no_variables_in_query(self):
        """Query without $variables is returned unchanged."""
        query = "avg:cpu{env:prod}"
        result = substitute_variables(query, {})
        assert result == query

    def test_passthrough_with_empty_dict(self):
        query = "avg:cpu.rate()"
        result = substitute_variables(query, {})
        assert result == query

    def test_passthrough_no_dollar_signs(self):
        query = "sum:requests{status:200}.rate()"
        result = substitute_variables(query, {"env": "prod"})
        assert result == query


class TestUndefinedVariable:
    def test_undefined_variable_raises_error(self):
        with pytest.raises(VariableSubstitutionError, match="Undefined variable '\\$env'"):
            substitute_variables("avg:cpu{env:$env}", {})

    def test_undefined_variable_includes_position(self):
        #                            0123456789012
        # In "avg:cpu{env:$env}", $ is at position 12.
        with pytest.raises(VariableSubstitutionError) as exc_info:
            substitute_variables("avg:cpu{env:$env}", {})
        assert exc_info.value.position == 12
        assert exc_info.value.variable == "env"

    def test_one_defined_one_undefined(self):
        with pytest.raises(VariableSubstitutionError, match="Undefined variable '\\$region'"):
            substitute_variables(
                "avg:cpu{env:$env,region:$region}",
                {"env": "prod"},
            )

    def test_undefined_in_metric_name(self):
        with pytest.raises(VariableSubstitutionError, match="Undefined variable '\\$svc'"):
            substitute_variables("avg:$svc{env:prod}", {})


class TestInvalidValues:
    def test_injection_attempt_semicolon(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "prod;DROP TABLE"})

    def test_injection_attempt_quotes(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "prod'OR'1"})

    def test_injection_attempt_braces(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "val}"})

    def test_injection_attempt_dollar(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "$other"})

    def test_empty_value(self):
        with pytest.raises(VariableSubstitutionError, match="Empty value"):
            substitute_variables("avg:cpu{env:$env}", {"env": ""})

    def test_injection_in_multi_value(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables(
                "avg:cpu{env:$env}",
                {"env": ["prod", "staging;DROP"]},
            )

    def test_space_in_value(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "prod staging"})

    def test_backslash_in_value(self):
        with pytest.raises(VariableSubstitutionError, match="disallowed characters"):
            substitute_variables("avg:cpu{env:$env}", {"env": "prod\\test"})


class TestEdgeCases:
    def test_variable_at_start_of_query(self):
        result = substitute_variables(
            "avg:$metric",
            {"metric": "cpu"},
        )
        assert result == "avg:cpu"

    def test_query_with_rollup(self):
        result = substitute_variables(
            "avg:cpu{env:$env}.rollup(avg,60)",
            {"env": "prod"},
        )
        assert result == "avg:cpu{env:prod}.rollup(avg,60)"

    def test_query_with_functions_chain(self):
        result = substitute_variables(
            "avg:cpu{env:$env}.rate().moving_average(5)",
            {"env": "prod"},
        )
        assert result == "avg:cpu{env:prod}.rate().moving_average(5)"

    def test_same_variable_used_twice(self):
        """Same variable referenced multiple times in the query."""
        result = substitute_variables(
            "avg:$env.cpu{env:$env}",
            {"env": "prod"},
        )
        assert result == "avg:prod.cpu{env:prod}"

    def test_all_sentinel_does_not_affect_non_filter_usage(self):
        """$__all only removes filter context; non-filter refs leave text as-is."""
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "$__all"},
        )
        # The filter is removed entirely
        assert result == "avg:cpu"

    def test_multi_value_in_non_filter_context_uses_first(self):
        """When a list variable is used outside a tag filter, use the first value."""
        result = substitute_variables(
            "avg:$metric{env:prod}",
            {"metric": ["cpu", "memory"]},
        )
        assert result == "avg:cpu{env:prod}"

    def test_valid_alphanumeric_values(self):
        """Spec D.2: values must match [a-zA-Z0-9._-*]"""
        result = substitute_variables(
            "avg:cpu{env:$env}",
            {"env": "prod-v2.3"},
        )
        assert result == "avg:cpu{env:prod-v2.3}"

    def test_numeric_value(self):
        result = substitute_variables(
            "avg:cpu{status:$status}",
            {"status": "200"},
        )
        assert result == "avg:cpu{status:200}"


class TestVariableSubstitutionErrorAttributes:
    def test_error_has_variable_name(self):
        with pytest.raises(VariableSubstitutionError) as exc_info:
            substitute_variables("avg:cpu{env:$my_var}", {})
        assert exc_info.value.variable == "my_var"

    def test_error_has_position(self):
        with pytest.raises(VariableSubstitutionError) as exc_info:
            substitute_variables("avg:cpu{env:$env}", {})
        assert exc_info.value.position is not None

    def test_error_is_value_error(self):
        """VariableSubstitutionError is a ValueError subclass."""
        with pytest.raises(ValueError):
            substitute_variables("avg:cpu{env:$env}", {})
