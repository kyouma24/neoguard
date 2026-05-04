import { useMemo, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { applyValueMapping } from "../../utils/valueMapping";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  onFilterChange?: (key: string, value: string) => void;
}

type SortDir = "asc" | "desc";

interface TableRow {
  name: string;
  tags: Record<string, string>;
  last: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export function TableWidget({ data, height = 300, displayOptions, onFilterChange }: Props) {
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const tableCfg = displayOptions?.table;
  const columns = tableCfg?.columns ?? ["last", "avg", "min", "max"];
  const showTags = tableCfg?.showTags ?? true;
  const pageSize = tableCfg?.pageSize ?? 25;

  const [sortCol, setSortCol] = useState<string>("last");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const allTags = useMemo(() => {
    if (!showTags) return [];
    const tagSet = new Set<string>();
    for (const s of data) {
      for (const k of Object.keys(s.tags)) tagSet.add(k);
    }
    return Array.from(tagSet).sort();
  }, [data, showTags]);

  const rows: TableRow[] = useMemo(() => {
    return data.map((series) => {
      const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v != null);
      const tagStr = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
      return {
        name: tagStr || series.name,
        tags: series.tags,
        last: values.length > 0 ? values[values.length - 1] : null,
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
        min: values.length > 0 ? Math.min(...values) : null,
        max: values.length > 0 ? Math.max(...values) : null,
        count: values.length,
      };
    });
  }, [data]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortCol === "name") {
        return sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortCol.startsWith("tag:")) {
        const tag = sortCol.slice(4);
        const aV = a.tags[tag] ?? "";
        const bV = b.tags[tag] ?? "";
        return sortDir === "asc" ? aV.localeCompare(bV) : bV.localeCompare(aV);
      }
      const col = sortCol as keyof TableRow;
      const aVal = (a[col] as number | null) ?? -Infinity;
      const bVal = (b[col] as number | null) ?? -Infinity;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const handleRowClick = (row: TableRow) => {
    if (!onFilterChange) return;
    const entries = Object.entries(row.tags);
    if (entries.length > 0) {
      const [key, val] = entries[0];
      onFilterChange(key, val);
    }
  };

  const thStyle: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const tdStyle: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 12,
    borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.06))",
  };

  const sortIcon = (col: string) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div style={{ height, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-secondary)" }}>
            <tr>
              <th style={thStyle} onClick={() => handleSort("name")}>
                Name{sortIcon("name")}
              </th>
              {showTags && allTags.map((tag) => (
                <th key={tag} style={thStyle} onClick={() => handleSort(`tag:${tag}`)}>
                  {tag}{sortIcon(`tag:${tag}`)}
                </th>
              ))}
              {columns.map((col) => (
                <th key={col} style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort(col)}>
                  {col.charAt(0).toUpperCase() + col.slice(1)}{sortIcon(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                onClick={() => handleRowClick(row)}
                style={{
                  background: i % 2 === 0 ? undefined : "rgba(255,255,255,0.02)",
                  cursor: onFilterChange ? "pointer" : undefined,
                }}
              >
                <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name}
                </td>
                {showTags && allTags.map((tag) => (
                  <td key={tag} style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 11 }}>
                    {row.tags[tag] ?? "—"}
                  </td>
                ))}
                {columns.map((col) => {
                  const val = row[col as keyof TableRow] as number | null;
                  const mapped = val != null ? applyValueMapping(val, displayOptions?.valueMappings) : null;
                  const color = mapped?.color
                    ?? (val != null && thresholds?.steps.length
                      ? getThresholdColor(val, thresholds.steps, thresholds.baseColor)
                      : undefined);
                  return (
                    <td key={col} style={{ ...tdStyle, textAlign: "right", color: color ?? "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                      {mapped ? mapped.text : formatValue(val, unit)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          <span>{sorted.length} series</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: page === 0 ? "default" : "pointer", fontSize: 11, opacity: page === 0 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: page >= totalPages - 1 ? "default" : "pointer", fontSize: 11, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
