import type { MetricQueryResult } from "../../types";

interface Props {
  data: MetricQueryResult[];
  widgetType: string;
  widgetTitle?: string;
}

/**
 * Visually hidden data table for screen reader users.
 * Flattens chart data into rows: Timestamp, Series Name, Value.
 * Capped at 100 rows to avoid overwhelming assistive technology.
 */
export function ScreenReaderTable({ data, widgetType, widgetTitle }: Props) {
  const label = widgetTitle
    ? `Data table for ${widgetTitle}`
    : `Data table for ${widgetType} widget`;

  const rows: { timestamp: string; series: string; value: string }[] = [];

  for (const series of data) {
    for (const [ts, val] of series.datapoints) {
      if (rows.length >= 100) break;
      rows.push({
        timestamp: ts,
        series: series.name,
        value: val !== null && val !== undefined ? String(val) : "N/A",
      });
    }
    if (rows.length >= 100) break;
  }

  if (rows.length === 0) return null;

  return (
    <table className="sr-only" role="table" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">Timestamp</th>
          <th scope="col">Series Name</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.timestamp}</td>
            <td>{row.series}</td>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
