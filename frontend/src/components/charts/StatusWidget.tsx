import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { THRESHOLD_COLORS } from "../../types/display-options";
import { applyValueMapping } from "../../utils/valueMapping";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

function getStatusLabel(value: number, steps: { value: number; color: string; label?: string }[]): string {
  const sorted = [...steps].sort((a, b) => b.value - a.value);
  for (const step of sorted) {
    if (value >= step.value) {
      return step.label ?? getDefaultLabel(step.color);
    }
  }
  return "OK";
}

function getDefaultLabel(color: string): string {
  if (color === THRESHOLD_COLORS.critical || color === "#ef4444") return "Critical";
  if (color === THRESHOLD_COLORS.warning || color === "#f59e0b") return "Warning";
  return "OK";
}

export function StatusWidget({ data, height = 120, displayOptions }: Props) {
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const items = data.map((series) => {
    const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
    const current = points.length > 0 ? points[points.length - 1][1] : null;
    const tagStr = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
    const name = tagStr || series.name;

    const mapped = current != null ? applyValueMapping(current, displayOptions?.valueMappings) : null;

    const color = mapped?.color
      ?? (current != null && thresholds?.steps.length
        ? getThresholdColor(current, thresholds.steps, thresholds.baseColor)
        : THRESHOLD_COLORS.ok);

    const label = mapped?.text
      ?? (current != null && thresholds?.steps.length
        ? getStatusLabel(current, thresholds.steps)
        : current != null ? "OK" : "No Data");

    return { name, current, color, label };
  });

  const isSingle = items.length === 1;

  if (isSingle) {
    const item = items[0];
    return (
      <div
        style={{
          height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: item.color,
            boxShadow: `0 0 8px ${item.color}60`,
          }} />
          <span style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.label}</span>
        </div>
        {item.current != null && (
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
            {formatValue(item.current, unit)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        height,
        overflow: "auto",
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${Math.min(180, Math.max(120, 300 / Math.ceil(items.length / 2)))}px, 1fr))`,
        gap: 4,
        padding: 8,
        alignContent: "start",
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            background: `${item.color}10`,
            border: `1px solid ${item.color}30`,
          }}
        >
          <div style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: item.color,
            flexShrink: 0,
            boxShadow: `0 0 6px ${item.color}50`,
          }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {item.name}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: item.color }}>
              {item.label}
              {item.current != null && (
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>
                  {formatValue(item.current, unit)}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
