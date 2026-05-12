import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";
import type { FacetValue } from "../types";

interface LogFacetsSidebarProps {
  start: string;
  end: string;
  query?: string;
  service?: string;
  severity?: string;
  onFilterAdd: (key: string, value: string, exclude?: boolean) => void;
}

export function LogFacetsSidebar({ start, end, query, service, severity, onFilterAdd }: LogFacetsSidebarProps) {
  const [severityFacets, setSeverityFacets] = useState<FacetValue[]>([]);
  const [serviceFacets, setServiceFacets] = useState<FacetValue[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFacets = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.logs.facets({ start, end, query, service, severity });
      setSeverityFacets(result.severity);
      setServiceFacets(result.service);
    } catch {
      setSeverityFacets([]);
      setServiceFacets([]);
    } finally {
      setLoading(false);
    }
  }, [start, end, query, service, severity]);

  useEffect(() => {
    fetchFacets();
  }, [fetchFacets]);

  if (loading && severityFacets.length === 0 && serviceFacets.length === 0) {
    return <div style={styles.sidebar}><div style={styles.loading}>Loading facets...</div></div>;
  }

  if (!loading && severityFacets.length === 0 && serviceFacets.length === 0) {
    return null;
  }

  const maxSevCount = Math.max(...severityFacets.map((f) => f.count), 1);
  const maxSvcCount = Math.max(...serviceFacets.map((f) => f.count), 1);

  return (
    <div style={styles.sidebar}>
      <FacetSection
        title="Severity"
        facets={severityFacets}
        maxCount={maxSevCount}
        onInclude={(v) => onFilterAdd("severity", v)}
        onExclude={(v) => onFilterAdd("severity", v, true)}
        colorFn={severityColor}
      />
      <FacetSection
        title="Service"
        facets={serviceFacets}
        maxCount={maxSvcCount}
        onInclude={(v) => onFilterAdd("service", v)}
        onExclude={(v) => onFilterAdd("service", v, true)}
      />
    </div>
  );
}

function severityColor(value: string): string {
  const map: Record<string, string> = {
    fatal: "var(--color-danger-600)",
    error: "var(--color-danger-400)",
    warn: "var(--color-warning-400)",
    info: "var(--color-primary-400)",
    debug: "var(--color-neutral-400)",
    trace: "var(--color-neutral-300)",
  };
  return map[value] ?? "var(--color-neutral-400)";
}

interface FacetSectionProps {
  title: string;
  facets: FacetValue[];
  maxCount: number;
  onInclude: (value: string) => void;
  onExclude: (value: string) => void;
  colorFn?: (value: string) => string;
}

function FacetSection({ title, facets, maxCount, onInclude, onExclude, colorFn }: FacetSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (facets.length === 0) return null;

  return (
    <div style={styles.section}>
      <button style={styles.sectionHeader} onClick={() => setCollapsed(!collapsed)}>
        <span>{title}</span>
        <span style={styles.chevron}>{collapsed ? "+" : "-"}</span>
      </button>
      {!collapsed && (
        <div style={styles.facetList}>
          {facets.map((f) => {
            const pct = (f.count / maxCount) * 100;
            const color = colorFn?.(f.value) ?? "var(--color-primary-300)";
            return (
              <div key={f.value} style={styles.facetRow}>
                <div style={styles.facetBarBg}>
                  <div style={{ ...styles.facetBar, width: `${pct}%`, background: color }} />
                </div>
                <span
                  style={styles.facetLabel}
                  onClick={() => onInclude(f.value)}
                  title={`Include ${f.value}`}
                >
                  {f.value}
                </span>
                <span style={styles.facetCount}>{f.count.toLocaleString()}</span>
                <button
                  style={styles.excludeBtn}
                  onClick={() => onExclude(f.value)}
                  title={`Exclude ${f.value}`}
                >
                  -
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 220,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    padding: "8px 0",
    overflow: "auto",
    background: "var(--bg-secondary)",
    borderRadius: "8px 0 0 8px",
  },
  loading: {
    padding: 16,
    color: "var(--text-muted)",
    fontSize: 12,
    textAlign: "center",
  },
  section: {
    marginBottom: 4,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "6px 12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  chevron: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  facetList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    padding: "0 8px",
  },
  facetRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 4px",
    borderRadius: 4,
    position: "relative" as const,
  },
  facetBarBg: {
    position: "absolute" as const,
    inset: 0,
    borderRadius: 4,
    overflow: "hidden",
    opacity: 0.15,
  },
  facetBar: {
    height: "100%",
    borderRadius: 4,
  },
  facetLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: "var(--typography-font-family-mono)",
    color: "var(--text-primary)",
    cursor: "pointer",
    zIndex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  facetCount: {
    fontSize: 10,
    color: "var(--text-muted)",
    fontFamily: "var(--typography-font-family-mono)",
    zIndex: 1,
  },
  excludeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    padding: "0 2px",
    borderRadius: 3,
    zIndex: 1,
  },
};
