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

export function ChangeWidget({ data, height = 160, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;

  const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  if (points.length < 2) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)" }}>
          {formatValue(points[0]?.[1] ?? 0, unit)}
        </span>
      </div>
    );
  }

  const current = points[points.length - 1][1];
  const previous = points[0][1];
  const absoluteChange = current - previous;
  const percentChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;

  const isPositive = absoluteChange >= 0;
  const changeColor = isPositive ? "#22c55e" : "#ef4444";

  const thresholdColor = thresholds?.steps.length
    ? getThresholdColor(current, thresholds.steps, thresholds.baseColor)
    : null;

  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 16px",
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 700, color: thresholdColor ?? "var(--text-primary)", lineHeight: 1 }}>
        {formatValue(current, unit)}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 }}>
        <span style={{ color: changeColor, display: "flex", alignItems: "center", gap: 3 }}>
          <svg width={16} height={16} viewBox="0 0 16 16" style={{ transform: isPositive ? "rotate(0)" : "rotate(180deg)" }}>
            <path d="M8 3L13 10H3L8 3Z" fill={changeColor} />
          </svg>
          {formatValue(Math.abs(absoluteChange), unit)}
        </span>
        {percentChange !== null && (
          <span style={{ color: changeColor, fontSize: 13 }}>
            ({Math.abs(percentChange).toFixed(1)}%)
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        vs previous: {formatValue(previous, unit)}
      </div>
    </div>
  );
}
