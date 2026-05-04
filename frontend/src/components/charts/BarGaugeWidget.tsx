import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue, getThresholdColor } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface BarItem {
  name: string;
  value: number;
  color: string;
  formattedValue: string;
}

function computeAverage(datapoints: [string, number | null][]): number | null {
  const valid = datapoints.filter(([, v]) => v !== null) as [string, number][];
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, [, v]) => acc + v, 0);
  return sum / valid.length;
}

function seriesLabel(series: MetricQueryResult): string {
  const tagStr = Object.entries(series.tags)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  return tagStr || series.name;
}

export function BarGaugeWidget({ data, height = 200, displayOptions }: Props) {
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const barGaugeCfg = displayOptions?.barGauge;
  const orientation = barGaugeCfg?.orientation ?? "horizontal";
  const showValue = barGaugeCfg?.showValue ?? true;
  const minWidth = barGaugeCfg?.minWidth ?? 4;
  const maxItems = barGaugeCfg?.maxItems ?? 10;
  const colorPalette = displayOptions?.colors?.palette ?? DEFAULT_COLORS;

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  // Build items: one bar per series, value = average of datapoints
  const rawItems: BarItem[] = [];
  for (const series of data) {
    const avg = computeAverage(series.datapoints);
    if (avg === null) continue;

    const name = seriesLabel(series);
    const formattedValue = formatValue(avg, unit);

    const color = thresholds?.steps?.length
      ? getThresholdColor(avg, thresholds.steps, thresholds.baseColor)
      : colorPalette[rawItems.length % colorPalette.length];

    rawItems.push({ name, value: avg, color, formattedValue });
  }

  if (rawItems.length === 0) {
    return <ChartEmptyState height={height} message="No numeric data" />;
  }

  // Sort descending by value, then limit
  const items = rawItems
    .sort((a, b) => b.value - a.value)
    .slice(0, maxItems);

  // Determine the scale max: use threshold max if available, else max value
  const maxValue = thresholds?.steps?.length
    ? Math.max(
        ...thresholds.steps.map((s) => s.value),
        ...items.map((i) => i.value),
      )
    : Math.max(...items.map((i) => i.value));

  const scaleMax = maxValue > 0 ? maxValue : 1;

  if (orientation === "vertical") {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 8,
          padding: "12px 8px 8px",
          overflow: "hidden",
        }}
      >
        {items.map((item, i) => {
          const pct = Math.max((minWidth / height) * 100, (item.value / scaleMax) * 100);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                flex: 1,
                minWidth: 32,
                maxWidth: 80,
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              {showValue && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: item.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.formattedValue}
                </span>
              )}
              <div
                style={{
                  width: "100%",
                  flex: 1,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${pct}%`,
                    minHeight: minWidth,
                    background: item.color,
                    borderRadius: "var(--radius-sm, 4px) var(--radius-sm, 4px) 0 0",
                    transition: "height 0.4s ease",
                    opacity: 0.85,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
                title={item.name}
              >
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Horizontal layout (default)
  const barHeight = Math.max(
    16,
    Math.min(32, (height - 16) / items.length - 6),
  );

  return (
    <div
      style={{
        height,
        overflow: "auto",
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        justifyContent: items.length <= 3 ? "center" : "flex-start",
      }}
    >
      {items.map((item, i) => {
        const pct = Math.max(
          (minWidth / 100) * 100,
          (item.value / scaleMax) * 100,
        );
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minHeight: barHeight + 4,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                width: "25%",
                minWidth: 60,
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flexShrink: 0,
                textAlign: "right",
              }}
              title={item.name}
            >
              {item.name}
            </span>
            <div
              style={{
                flex: 1,
                height: barHeight,
                background: "var(--bg-secondary, #1a1a2e)",
                borderRadius: "var(--radius-sm, 4px)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  minWidth: minWidth,
                  background: item.color,
                  borderRadius: "var(--radius-sm, 4px)",
                  transition: "width 0.4s ease",
                  opacity: 0.85,
                }}
              />
            </div>
            {showValue && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: item.color,
                  whiteSpace: "nowrap",
                  minWidth: 48,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {item.formattedValue}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
