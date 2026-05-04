import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../services/api";
import type { DashboardVariable } from "../../types";

const ALL_VALUE = "*";

interface Props {
  variables: DashboardVariable[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function VariableBar({ variables, values, onChange }: Props) {
  if (!variables.length) return null;

  return (
    <div style={{
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      alignItems: "center",
      padding: "8px 0",
      marginBottom: 8,
      borderBottom: "1px solid var(--border)",
    }}>
      {variables.map((v) => (
        <VariableDropdown
          key={v.name}
          variable={v}
          value={values[v.name] ?? v.default_value ?? ""}
          allValues={values}
          onChange={(val) => onChange({ ...values, [v.name]: val })}
        />
      ))}
    </div>
  );
}

/** Shared hook: fetches options for query-type variables and handles cascading */
function useVariableOptions(
  variable: DashboardVariable,
  allValues: Record<string, string>,
) {
  const [options, setOptions] = useState<string[]>(variable.values);
  const [loading, setLoading] = useState(false);

  const fetchOptions = useCallback(async () => {
    if (variable.type !== "query" || !variable.tag_key) return;
    setLoading(true);
    try {
      const vals = await api.metrics.tagValues(variable.tag_key);
      setOptions(vals);
    } catch {
      // keep existing options on error
    } finally {
      setLoading(false);
    }
  }, [variable.type, variable.tag_key]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Refetch when dependent variable changes
  const depValue = variable.depends_on ? allValues[variable.depends_on] : undefined;
  useEffect(() => {
    if (variable.depends_on && depValue) {
      fetchOptions();
    }
  }, [depValue, variable.depends_on, fetchOptions]);

  return { options, loading };
}

function VariableDropdown({
  variable,
  value,
  allValues,
  onChange,
}: {
  variable: DashboardVariable;
  value: string;
  allValues: Record<string, string>;
  onChange: (val: string) => void;
}) {
  const { options, loading } = useVariableOptions(variable, allValues);
  const label = variable.label || `$${variable.name}`;

  if (variable.type === "textbox") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.default_value || variable.name}
          style={{
            padding: "4px 8px",
            fontSize: 12,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            width: 120,
          }}
        />
      </div>
    );
  }

  if (variable.multi) {
    return (
      <MultiSelectDropdown
        label={label}
        options={options}
        value={value}
        includeAll={variable.include_all}
        loading={loading}
        onChange={onChange}
      />
    );
  }

  const displayOptions = variable.include_all ? [ALL_VALUE, ...options] : options;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        style={{
          padding: "4px 8px",
          fontSize: 12,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          minWidth: 100,
          cursor: "pointer",
        }}
      >
        {!value && <option value="">Select...</option>}
        {displayOptions.map((opt) => (
          <option key={opt} value={opt}>
            {opt === ALL_VALUE ? "All" : opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Parse a multi-value string into an array of selected values */
function parseMultiValue(value: string): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

/** Format selected values for display in the trigger button */
function formatMultiSummary(selected: string[], includeAll: boolean): string {
  if (selected.length === 0) return "Select...";
  if (selected.includes(ALL_VALUE) && includeAll) return "All";
  if (selected.length === 1) return selected[0];
  if (selected.length <= 2) return selected.join(", ");
  return `${selected.length} selected`;
}

function MultiSelectDropdown({
  label,
  options,
  value,
  includeAll,
  loading,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  includeAll: boolean;
  loading: boolean;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = parseMultiValue(value);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const allOptions = includeAll ? [ALL_VALUE, ...options] : options;
  const isAllSelected = selected.includes(ALL_VALUE);

  function toggleValue(opt: string) {
    if (opt === ALL_VALUE) {
      // Toggle "All": if already selected, clear; otherwise select only "All"
      if (isAllSelected) {
        onChange("");
      } else {
        onChange(ALL_VALUE);
      }
      return;
    }

    // When selecting a specific value, remove "All" if it was selected
    let next: string[];
    if (isAllSelected) {
      // Switching from "All" to specific: select only this value
      next = [opt];
    } else if (selected.includes(opt)) {
      next = selected.filter((v) => v !== opt);
    } else {
      next = [...selected, opt];
    }

    // If all individual options are now selected and include_all is on, collapse to "All"
    if (includeAll && next.length === options.length && options.length > 0) {
      onChange(ALL_VALUE);
    } else {
      onChange(next.join(","));
    }
  }

  const summary = formatMultiSummary(selected, includeAll);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>{label}</span>
      <div ref={containerRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => { if (!loading) setOpen(!open); }}
          disabled={loading}
          style={{
            padding: "4px 24px 4px 8px",
            fontSize: 12,
            background: "var(--bg-tertiary)",
            border: open ? "1px solid var(--accent, #635bff)" : "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            minWidth: 100,
            cursor: loading ? "default" : "pointer",
            textAlign: "left",
            position: "relative",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
          }}
        >
          {loading ? "Loading..." : summary}
          <span style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: `translateY(-50%) rotate(${open ? "180deg" : "0deg"})`,
            fontSize: 10,
            lineHeight: 1,
            pointerEvents: "none",
            transition: "transform 150ms ease",
          }}>
            &#9660;
          </span>
        </button>

        {open && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 1000,
            background: "var(--bg-secondary, #1e1e2e)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            minWidth: 160,
            maxHeight: 240,
            overflowY: "auto",
            padding: "4px 0",
          }}>
            {allOptions.map((opt) => {
              const checked = opt === ALL_VALUE ? isAllSelected : selected.includes(opt);
              return (
                <label
                  key={opt}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    fontSize: 12,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    background: checked ? "var(--color-primary-50, rgba(99,91,255,0.08))" : "transparent",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!checked) (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = checked
                      ? "var(--color-primary-50, rgba(99,91,255,0.08))"
                      : "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(opt)}
                    style={{
                      accentColor: "var(--accent, #635bff)",
                      margin: 0,
                      cursor: "pointer",
                    }}
                  />
                  <span>{opt === ALL_VALUE ? "All" : opt}</span>
                </label>
              );
            })}
            {allOptions.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>
                No options available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Substitute template variables into a query string.
 *
 * For multi-select variables (comma-separated values):
 *   - Plain `$var` is replaced with comma-separated values: `val1,val2,val3`
 *   - `IN($var)` pattern is replaced with `IN (val1, val2, val3)` for MQL filter syntax
 *   - `{$var}` is replaced with `{val1,val2,val3}` (MQL tag filter set notation)
 *
 * For single-select, the variable token is replaced with the value directly.
 * Variables with value "*" (All) are left unsubstituted (the backend handles wildcard).
 */
export function substituteVariables(
  query: string,
  variables: Record<string, string>,
): string {
  let result = query;
  for (const [name, value] of Object.entries(variables)) {
    if (!value || value === ALL_VALUE) continue;

    const token = `$${name}`;
    const isMulti = value.includes(",");

    if (isMulti) {
      const parts = value.split(",").filter(Boolean);

      // Replace IN($var) with IN (val1, val2, val3)
      const inPattern = `IN(${token})`;
      if (result.includes(inPattern)) {
        result = result.split(inPattern).join(`IN (${parts.join(", ")})`);
      }

      // Also handle lowercase in($var)
      const inPatternLower = `in(${token})`;
      if (result.includes(inPatternLower)) {
        result = result.split(inPatternLower).join(`in (${parts.join(", ")})`);
      }

      // Replace {$var} with {val1,val2,val3} (MQL set notation)
      const setPattern = `{${token}}`;
      if (result.includes(setPattern)) {
        result = result.split(setPattern).join(`{${parts.join(",")}}`);
      }

      // Replace remaining bare $var with comma-separated values
      result = result.split(token).join(parts.join(","));
    } else {
      result = result.split(token).join(value);
    }
  }
  return result;
}
