import { useMemo, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { LegendConfig, LegendColumn, UnitConfig } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { seriesKey } from "./useChartInteractions";
import styles from "./ChartLegend.module.scss";

interface SeriesStats {
  key: string;
  color: string;
  last: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  total: number | null;
}

interface Props {
  data: MetricQueryResult[];
  colors: string[];
  config?: LegendConfig;
  unit?: UnitConfig;
  hiddenSeries: Set<string>;
  onToggleSeries: (key: string) => void;
  onIsolateSeries?: (key: string) => void;
}

function computeStats(data: MetricQueryResult[], colors: string[]): SeriesStats[] {
  return data.map((series, i) => {
    const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v != null);
    const key = seriesKey(series);
    return {
      key,
      color: colors[i % colors.length],
      last: values.length > 0 ? values[values.length - 1] : null,
      avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      total: values.length > 0 ? values.reduce((a, b) => a + b, 0) : null,
    };
  });
}

const COLUMN_LABELS: Record<LegendColumn, string> = {
  last: "Last",
  avg: "Avg",
  min: "Min",
  max: "Max",
  total: "Total",
};

export function ChartLegend({ data, colors, config, unit, hiddenSeries, onToggleSeries, onIsolateSeries }: Props) {
  const position = config?.position ?? "bottom";
  const mode = config?.mode ?? "list";
  const columns = config?.columns ?? ["last", "avg", "min", "max"];
  const showValues = config?.showValues ?? (mode === "table");

  const [sortBy, setSortBy] = useState<string>(config?.sortBy ?? "name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(config?.sortDirection ?? "asc");

  const allStats = useMemo(() => computeStats(data, colors), [data, colors]);

  const sortedStats = useMemo(() => {
    const copy = [...allStats];
    copy.sort((a, b) => {
      if (sortBy === "name") {
        return sortDir === "asc" ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
      }
      const col = sortBy as LegendColumn;
      const aVal = a[col] ?? -Infinity;
      const bVal = b[col] ?? -Infinity;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
    return copy;
  }, [allStats, sortBy, sortDir]);

  if (position === "hidden" || data.length === 0) return null;

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const posClass = position === "right" ? styles.legendRight : styles.legendBottom;

  if (mode === "table" || (mode === "list" && showValues)) {
    return (
      <div className={`${styles.legendContainer} ${posClass}`}>
        <table className={styles.tableLegend}>
          <thead>
            <tr>
              <th onClick={() => handleSort("name")}>
                Name {sortBy === "name" && <span className={styles.sortIcon}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
              {columns.map((col) => (
                <th key={col} onClick={() => handleSort(col)}>
                  {COLUMN_LABELS[col]}
                  {sortBy === col && <span className={styles.sortIcon}>{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((s) => (
              <tr
                key={s.key}
                className={`${styles.tableRow} ${hiddenSeries.has(s.key) ? styles.tableRowHidden : ""}`}
                onClick={(e) => {
                  if ((e.ctrlKey || e.metaKey) && onIsolateSeries) {
                    onIsolateSeries(s.key);
                  } else {
                    onToggleSeries(s.key);
                  }
                }}
              >
                <td>
                  <div className={styles.nameCell}>
                    <span className={styles.colorDot} style={{ background: s.color }} />
                    <span className={styles.seriesName}>{s.key}</span>
                  </div>
                </td>
                {columns.map((col) => (
                  <td key={col}>{formatValue(s[col], unit)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={`${styles.legendContainer} ${posClass}`}>
      <div className={styles.listLegend}>
        {sortedStats.map((s) => (
          <div
            key={s.key}
            className={`${styles.listItem} ${hiddenSeries.has(s.key) ? styles.listItemHidden : ""}`}
            onClick={(e) => {
              if ((e.ctrlKey || e.metaKey) && onIsolateSeries) {
                onIsolateSeries(s.key);
              } else {
                onToggleSeries(s.key);
              }
            }}
          >
            <span className={styles.colorDot} style={{ background: s.color }} />
            <span className={styles.seriesName}>{s.key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
