import { useMemo, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

type SortDir = "asc" | "desc";
type SortColumn = "name" | "current" | "min" | "max" | "avg";

interface RowData {
  name: string;
  tags: Record<string, string>;
  current: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  datapoints: number[];
  trend: "up" | "down" | "flat";
}

function computeRow(series: MetricQueryResult): RowData {
  const tagStr = Object.entries(series.tags)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const values = series.datapoints
    .map(([, v]) => v)
    .filter((v): v is number => v != null);

  const current = values.length > 0 ? values[values.length - 1] : null;
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;
  const avg =
    values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;

  let trend: "up" | "down" | "flat" = "flat";
  if (values.length >= 2) {
    const first = values[0];
    const last = values[values.length - 1];
    if (last > first) trend = "up";
    else if (last < first) trend = "down";
  }

  return {
    name: tagStr || series.name,
    tags: series.tags,
    current,
    min,
    max,
    avg,
    datapoints: values,
    trend,
  };
}

interface SparklineProps {
  datapoints: number[];
  width: number;
  height: number;
  trend: "up" | "down" | "flat";
}

function Sparkline({ datapoints, width, height, trend }: SparklineProps) {
  if (datapoints.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="2,2"
          opacity={0.4}
        />
      </svg>
    );
  }

  const minVal = Math.min(...datapoints);
  const maxVal = Math.max(...datapoints);
  const range = maxVal - minVal || 1;
  const padding = 2;
  const drawHeight = height - padding * 2;
  const drawWidth = width - padding * 2;

  const points = datapoints
    .map((v, i) => {
      const x = padding + (i / (datapoints.length - 1)) * drawWidth;
      const y = padding + drawHeight - ((v - minVal) / range) * drawHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "var(--text-muted)";

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "flat") {
    return (
      <span
        style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}
        aria-label="No change"
      >
        →
      </span>
    );
  }
  const isUp = trend === "up";
  return (
    <span
      style={{
        color: isUp ? "#22c55e" : "#ef4444",
        fontSize: 11,
        marginLeft: 4,
        fontWeight: 600,
      }}
      aria-label={isUp ? "Trending up" : "Trending down"}
    >
      {isUp ? "▲" : "▼"}
    </span>
  );
}

export function SparklineTableWidget({
  data,
  height = 300,
  displayOptions,
}: Props) {
  const unit = displayOptions?.unit;
  const cfg = displayOptions?.sparklineTable;
  const sparklineWidth = cfg?.sparklineWidth ?? 120;
  const showTrend = cfg?.showTrend ?? false;
  const pageSize = cfg?.pageSize ?? 20;

  const [sortCol, setSortCol] = useState<SortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => data.map(computeRow), [data]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sortCol === "name") {
        return sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      const aVal = a[sortCol] ?? -Infinity;
      const bVal = b[sortCol] ?? -Infinity;
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page if it exceeds bounds after data changes
  const safePage = page >= totalPages ? 0 : page;
  if (safePage !== page) {
    setPage(safePage);
  }

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
    setPage(0);
  };

  const sortIcon = (col: SortColumn) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

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

  const thRightStyle: React.CSSProperties = {
    ...thStyle,
    textAlign: "right",
  };

  const tdStyle: React.CSSProperties = {
    padding: "5px 10px",
    fontSize: 12,
    borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.06))",
    color: "var(--text-primary)",
  };

  const tdNumStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div
      style={{ height, overflow: "auto", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "var(--bg-secondary)",
              zIndex: 1,
            }}
          >
            <tr>
              <th style={thStyle} onClick={() => handleSort("name")}>
                Name{sortIcon("name")}
              </th>
              <th style={thRightStyle} onClick={() => handleSort("current")}>
                Current{sortIcon("current")}
              </th>
              <th style={thRightStyle} onClick={() => handleSort("min")}>
                Min{sortIcon("min")}
              </th>
              <th style={thRightStyle} onClick={() => handleSort("max")}>
                Max{sortIcon("max")}
              </th>
              <th style={thRightStyle} onClick={() => handleSort("avg")}>
                Avg{sortIcon("avg")}
              </th>
              <th
                style={{
                  ...thStyle,
                  textAlign: "center",
                  cursor: "default",
                }}
              >
                Sparkline
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr
                key={i}
                style={{
                  background:
                    i % 2 === 0 ? undefined : "rgba(255,255,255,0.02)",
                }}
              >
                <td
                  style={{
                    ...tdStyle,
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.name}
                >
                  {row.name}
                </td>
                <td style={tdNumStyle}>
                  {formatValue(row.current, unit)}
                  {showTrend && <TrendArrow trend={row.trend} />}
                </td>
                <td style={tdNumStyle}>{formatValue(row.min, unit)}</td>
                <td style={tdNumStyle}>{formatValue(row.max, unit)}</td>
                <td style={tdNumStyle}>{formatValue(row.avg, unit)}</td>
                <td style={{ ...tdStyle, textAlign: "center", padding: "3px 10px" }}>
                  <Sparkline
                    datapoints={row.datapoints}
                    width={sparklineWidth}
                    height={24}
                    trend={row.trend}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            fontSize: 11,
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <span>{sorted.length} series</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: page === 0 ? "default" : "pointer",
                fontSize: 11,
                opacity: page === 0 ? 0.4 : 1,
              }}
            >
              ← Prev
            </button>
            <span>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: page >= totalPages - 1 ? "default" : "pointer",
                fontSize: 11,
                opacity: page >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
