import { useMemo, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface BoxStats {
  name: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function computeBoxStats(
  series: MetricQueryResult,
  whiskerType: "minmax" | "iqr1.5",
): BoxStats | null {
  const values = series.datapoints
    .map(([, v]) => v)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const tags = Object.entries(series.tags)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const name = tags || series.name;

  const min = values[0];
  const max = values[values.length - 1];
  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);

  let whiskerLow: number;
  let whiskerHigh: number;
  let outliers: number[] = [];

  if (whiskerType === "iqr1.5") {
    const iqr = q3 - q1;
    whiskerLow = Math.max(min, q1 - 1.5 * iqr);
    whiskerHigh = Math.min(max, q3 + 1.5 * iqr);
    // Find the actual closest data points within whisker range
    whiskerLow = values.find((v) => v >= whiskerLow) ?? min;
    whiskerHigh = [...values].reverse().find((v) => v <= whiskerHigh) ?? max;
    outliers = values.filter((v) => v < whiskerLow || v > whiskerHigh);
  } else {
    whiskerLow = min;
    whiskerHigh = max;
  }

  return { name, min, q1, median, q3, max, whiskerLow, whiskerHigh, outliers };
}

interface TooltipState {
  x: number;
  y: number;
  stats: BoxStats;
}

export function BoxPlotWidget({ data, height = 300, displayOptions }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const cfg = displayOptions?.boxPlot;
  const showOutliers = cfg?.showOutliers ?? true;
  const whiskerType = cfg?.whiskerType ?? "minmax";
  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;

  const boxes = useMemo(() => {
    const results: BoxStats[] = [];
    for (const series of data) {
      const stats = computeBoxStats(series, whiskerType);
      if (stats) results.push(stats);
    }
    return results;
  }, [data, whiskerType]);

  if (!boxes.length) {
    return <ChartEmptyState height={height} />;
  }

  // Layout constants
  const marginLeft = 60;
  const marginRight = 20;
  const marginTop = 15;
  const marginBottom = 40;
  const plotWidth = Math.max(200, boxes.length * 80);
  const plotHeight = height - marginTop - marginBottom;
  const boxWidth = Math.min(50, (plotWidth - marginLeft - marginRight) / boxes.length * 0.6);

  // Y-axis range
  const allValues = boxes.flatMap((b) => [
    b.whiskerLow,
    b.whiskerHigh,
    ...(showOutliers ? b.outliers : []),
  ]);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPadding = (yMax - yMin) * 0.1 || 1;
  const yScaleMin = yMin - yPadding;
  const yScaleMax = yMax + yPadding;

  function yScale(v: number): number {
    if (yScaleMax === yScaleMin) return marginTop + plotHeight / 2;
    return marginTop + plotHeight - ((v - yScaleMin) / (yScaleMax - yScaleMin)) * plotHeight;
  }

  function xCenter(i: number): number {
    const usableWidth = plotWidth - marginLeft - marginRight;
    const spacing = usableWidth / (boxes.length);
    return marginLeft + spacing * (i + 0.5);
  }

  // Y-axis ticks
  const tickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i <= tickCount; i++) {
    yTicks.push(yScaleMin + (i / tickCount) * (yScaleMax - yScaleMin));
  }

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${plotWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Box plot chart"
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={i}
            x1={marginLeft}
            x2={plotWidth - marginRight}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="var(--border)"
            strokeDasharray="3 3"
            opacity={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={i}
            x={marginLeft - 8}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize={11}
          >
            {formatValue(tick, unit)}
          </text>
        ))}

        {/* Box plots */}
        {boxes.map((box, i) => {
          const cx = xCenter(i);
          const color = colors[i % colors.length];
          const halfBox = boxWidth / 2;

          return (
            <g
              key={i}
              onMouseEnter={(e) => setTooltip({
                x: e.clientX,
                y: e.clientY,
                stats: box,
              })}
              onMouseMove={(e) => setTooltip((prev) =>
                prev ? { ...prev, x: e.clientX, y: e.clientY } : null,
              )}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "default" }}
            >
              {/* Whisker line (vertical) */}
              <line
                x1={cx}
                x2={cx}
                y1={yScale(box.whiskerHigh)}
                y2={yScale(box.whiskerLow)}
                stroke={color}
                strokeWidth={1.5}
              />

              {/* Whisker caps */}
              <line
                x1={cx - halfBox * 0.5}
                x2={cx + halfBox * 0.5}
                y1={yScale(box.whiskerHigh)}
                y2={yScale(box.whiskerHigh)}
                stroke={color}
                strokeWidth={1.5}
              />
              <line
                x1={cx - halfBox * 0.5}
                x2={cx + halfBox * 0.5}
                y1={yScale(box.whiskerLow)}
                y2={yScale(box.whiskerLow)}
                stroke={color}
                strokeWidth={1.5}
              />

              {/* Box (Q1 to Q3) */}
              <rect
                x={cx - halfBox}
                y={yScale(box.q3)}
                width={boxWidth}
                height={Math.max(1, yScale(box.q1) - yScale(box.q3))}
                fill={color}
                fillOpacity={0.25}
                stroke={color}
                strokeWidth={1.5}
                rx={2}
              />

              {/* Median line */}
              <line
                x1={cx - halfBox}
                x2={cx + halfBox}
                y1={yScale(box.median)}
                y2={yScale(box.median)}
                stroke={color}
                strokeWidth={2.5}
              />

              {/* Outlier dots */}
              {showOutliers &&
                box.outliers.map((val, oi) => (
                  <circle
                    key={oi}
                    cx={cx}
                    cy={yScale(val)}
                    r={3}
                    fill={color}
                    fillOpacity={0.6}
                    stroke={color}
                    strokeWidth={0.5}
                  />
                ))}

              {/* X-axis label */}
              <text
                x={cx}
                y={height - marginBottom + 16}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize={11}
              >
                {box.name.length > 12 ? box.name.slice(0, 10) + "…" : box.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 12,
            padding: "8px 10px",
            pointerEvents: "none",
            zIndex: 1000,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.stats.name}</div>
          <div>Max: {formatValue(tooltip.stats.max, unit)}</div>
          <div>Q3: {formatValue(tooltip.stats.q3, unit)}</div>
          <div>Median: {formatValue(tooltip.stats.median, unit)}</div>
          <div>Q1: {formatValue(tooltip.stats.q1, unit)}</div>
          <div>Min: {formatValue(tooltip.stats.min, unit)}</div>
          {whiskerType === "iqr1.5" && tooltip.stats.outliers.length > 0 && (
            <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
              Outliers: {tooltip.stats.outliers.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
