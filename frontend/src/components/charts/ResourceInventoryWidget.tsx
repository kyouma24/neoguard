import { useMemo, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

type SortDir = "asc" | "desc";

interface ResourceRow {
  name: string;
  type: string;
  region: string;
  value: number | null;
  tags: Record<string, string>;
}

export function ResourceInventoryWidget({ data, height = 300, displayOptions }: Props) {
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const cfg = displayOptions?.resourceInventory;
  const showHealth = cfg?.showHealth ?? true;
  const pageSize = cfg?.pageSize ?? 20;

  const [filter, setFilter] = useState("");
  const [sortCol, setSortCol] = useState<string>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const rows: ResourceRow[] = useMemo(() => {
    return data.map((series) => {
      const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v != null);
      const lastValue = values.length > 0 ? values[values.length - 1] : null;
      return {
        name: series.tags["name"] ?? series.name,
        type: series.tags["type"] ?? series.tags["resource_type"] ?? "",
        region: series.tags["region"] ?? series.tags["az"] ?? "",
        value: lastValue,
        tags: series.tags,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    if (!filter) return rows;
    const q = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortCol === "value") {
        const aV = a.value ?? -Infinity;
        const bV = b.value ?? -Infinity;
        return sortDir === "asc" ? aV - bV : bV - aV;
      }
      const aS = a[sortCol as keyof ResourceRow] as string;
      const bS = b[sortCol as keyof ResourceRow] as string;
      return sortDir === "asc" ? aS.localeCompare(bS) : bS.localeCompare(aS);
    });
    return copy;
  }, [filtered, sortCol, sortDir]);

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
      setSortDir("asc");
    }
  };

  const sortIcon = (col: string) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  function getHealthColor(value: number | null): string {
    if (value == null) return "var(--text-muted)";
    if (thresholds?.steps.length) {
      return getThresholdColor(value, thresholds.steps, thresholds.baseColor);
    }
    return "#22c55e";
  }

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

  return (
    <div style={{ height, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
        <input
          type="text"
          placeholder="Filter resources..."
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(0); }}
          style={{
            width: "100%",
            padding: "4px 8px",
            fontSize: 11,
            background: "var(--bg-tertiary, rgba(255,255,255,0.04))",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 4px)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--bg-secondary)" }}>
            <tr>
              {showHealth && <th style={{ ...thStyle, width: 32, cursor: "default" }} />}
              <th style={thStyle} onClick={() => handleSort("name")}>Name{sortIcon("name")}</th>
              <th style={thStyle} onClick={() => handleSort("type")}>Type{sortIcon("type")}</th>
              <th style={thStyle} onClick={() => handleSort("region")}>Region{sortIcon("region")}</th>
              <th style={{ ...thStyle, textAlign: "right" }} onClick={() => handleSort("value")}>Value{sortIcon("value")}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => {
              const healthColor = getHealthColor(row.value);
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? undefined : "rgba(255,255,255,0.02)" }}>
                  {showHealth && (
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <div style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: healthColor,
                        boxShadow: `0 0 6px ${healthColor}50`,
                        display: "inline-block",
                      }} />
                    </td>
                  )}
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.name}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 11 }}>{row.type || "—"}</td>
                  <td style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 11 }}>{row.region || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: healthColor }}>
                    {formatValue(row.value, unit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
          <span>{sorted.length} resources</span>
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
