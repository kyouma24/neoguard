import { useCallback, useMemo, useRef, useState } from "react";
import type { MetricQueryResult } from "../../types";
import type { HeatmapDisplayConfig, PanelDisplayOptions } from "../../types/display-options";
import { formatAxisTick, formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface CellData {
  timeIdx: number;
  valueIdx: number;
  count: number;
  timeStart: number;
  timeEnd: number;
  valueStart: number;
  valueEnd: number;
}

type ColorScheme = NonNullable<HeatmapDisplayConfig["colorScheme"]>;

const COLOR_SCALES: Record<ColorScheme, [string, string, string]> = {
  greens: ["#e5f5e0", "#31a354", "#006d2c"],
  blues: ["#deebf7", "#3182bd", "#08306b"],
  reds: ["#fee0d2", "#de2d26", "#67000d"],
  purples: ["#efedf5", "#756bb1", "#3f007d"],
  oranges: ["#fee6ce", "#e6550d", "#7f2704"],
  viridis: ["#440154", "#21918c", "#fde725"],
  inferno: ["#000004", "#bb3754", "#fcffa4"],
  plasma: ["#0d0887", "#cc4778", "#f0f921"],
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function interpolateColor(scale: [string, string, string], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [c0, c1, c2] = scale.map(hexToRgb);
  let from: [number, number, number];
  let to: [number, number, number];
  let local: number;
  if (clamped < 0.5) {
    from = c0;
    to = c1;
    local = clamped * 2;
  } else {
    from = c1;
    to = c2;
    local = (clamped - 0.5) * 2;
  }
  const r = Math.round(from[0] + (to[0] - from[0]) * local);
  const g = Math.round(from[1] + (to[1] - from[1]) * local);
  const b = Math.round(from[2] + (to[2] - from[2]) * local);
  return `rgb(${r},${g},${b})`;
}

function formatTimeLabel(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const mon = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${mon}/${day} ${h}:${m}`;
}

const MARGIN = { top: 10, right: 16, bottom: 50, left: 72 };

export function HeatmapWidget({ data, height = 300, displayOptions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    cell: CellData;
  } | null>(null);

  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (node) {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        setContainerWidth(node.clientWidth);
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) setContainerWidth(entry.contentRect.width);
        });
        observer.observe(node);
        resizeObserverRef.current = observer;
      }
    },
    [],
  );

  const heatmapCfg = displayOptions?.heatmap;
  const valueBucketCount = heatmapCfg?.bucketCount ?? 10;
  const colorScheme: ColorScheme = heatmapCfg?.colorScheme ?? "greens";
  const showCellValues = heatmapCfg?.showCellValues ?? false;
  const unit = displayOptions?.unit;

  const { cells, timeBuckets, valueBuckets, maxCount } = useMemo(() => {
    const allPoints: { ts: number; val: number }[] = [];
    for (const series of data) {
      for (const [tsStr, val] of series.datapoints) {
        if (val != null) {
          allPoints.push({ ts: new Date(tsStr).getTime(), val });
        }
      }
    }

    if (allPoints.length === 0) {
      return { cells: [], timeBuckets: [], valueBuckets: [], maxCount: 0 };
    }

    let minTs = Infinity;
    let maxTs = -Infinity;
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const p of allPoints) {
      if (p.ts < minTs) minTs = p.ts;
      if (p.ts > maxTs) maxTs = p.ts;
      if (p.val < minVal) minVal = p.val;
      if (p.val > maxVal) maxVal = p.val;
    }

    const numTimeBuckets = Math.max(1, Math.min(60, Math.ceil(Math.sqrt(allPoints.length))));
    const numValueBuckets = Math.max(1, valueBucketCount);

    const timeRange = maxTs - minTs || 1;
    const timeStep = timeRange / numTimeBuckets;

    const valueRange = maxVal - minVal;
    const valueStep = valueRange === 0 ? 1 : valueRange / numValueBuckets;

    const tBuckets: { start: number; end: number }[] = [];
    for (let i = 0; i < numTimeBuckets; i++) {
      tBuckets.push({
        start: minTs + i * timeStep,
        end: i === numTimeBuckets - 1 ? maxTs : minTs + (i + 1) * timeStep,
      });
    }

    const vBuckets: { start: number; end: number }[] = [];
    for (let i = 0; i < numValueBuckets; i++) {
      vBuckets.push({
        start: minVal + i * valueStep,
        end: i === numValueBuckets - 1 ? maxVal : minVal + (i + 1) * valueStep,
      });
    }

    const grid: number[][] = Array.from({ length: numTimeBuckets }, () =>
      Array.from({ length: numValueBuckets }, () => 0),
    );

    for (const p of allPoints) {
      let tIdx = Math.floor((p.ts - minTs) / timeStep);
      if (tIdx >= numTimeBuckets) tIdx = numTimeBuckets - 1;

      let vIdx: number;
      if (valueRange === 0) {
        vIdx = 0;
      } else {
        vIdx = Math.floor((p.val - minVal) / valueStep);
        if (vIdx >= numValueBuckets) vIdx = numValueBuckets - 1;
      }

      grid[tIdx][vIdx]++;
    }

    let peak = 0;
    const cellList: CellData[] = [];
    for (let ti = 0; ti < numTimeBuckets; ti++) {
      for (let vi = 0; vi < numValueBuckets; vi++) {
        const count = grid[ti][vi];
        if (count > peak) peak = count;
        cellList.push({
          timeIdx: ti,
          valueIdx: vi,
          count,
          timeStart: tBuckets[ti].start,
          timeEnd: tBuckets[ti].end,
          valueStart: vBuckets[vi].start,
          valueEnd: vBuckets[vi].end,
        });
      }
    }

    return { cells: cellList, timeBuckets: tBuckets, valueBuckets: vBuckets, maxCount: peak };
  }, [data, valueBucketCount]);

  if (!data.length || cells.length === 0) {
    return <ChartEmptyState height={height} />;
  }

  const scale = COLOR_SCALES[colorScheme];
  const chartWidth = containerWidth - MARGIN.left - MARGIN.right;
  const chartHeight = height - MARGIN.top - MARGIN.bottom;
  const cellWidth = Math.max(1, chartWidth / timeBuckets.length);
  const cellHeight = Math.max(1, chartHeight / valueBuckets.length);

  const maxTimeLabelCount = Math.max(1, Math.floor(chartWidth / 70));
  const timeTickInterval = Math.max(1, Math.ceil(timeBuckets.length / maxTimeLabelCount));

  const maxValueLabelCount = Math.max(1, Math.floor(chartHeight / 24));
  const valueTickInterval = Math.max(1, Math.ceil(valueBuckets.length / maxValueLabelCount));

  return (
    <div
      ref={containerCallbackRef}
      style={{ width: "100%", height, position: "relative" }}
    >
      <svg width={containerWidth} height={height}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {cells.map((cell) => {
            const x = cell.timeIdx * cellWidth;
            const y = chartHeight - (cell.valueIdx + 1) * cellHeight;
            const t = maxCount > 0 ? cell.count / maxCount : 0;
            const fill = cell.count === 0 ? "var(--bg-secondary)" : interpolateColor(scale, t);

            return (
              <rect
                key={`${cell.timeIdx}-${cell.valueIdx}`}
                x={x}
                y={y}
                width={Math.max(0.5, cellWidth - 1)}
                height={Math.max(0.5, cellHeight - 1)}
                fill={fill}
                rx={1}
                onMouseEnter={(e) => {
                  const svgRect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                  if (svgRect) {
                    setTooltip({
                      x: e.clientX - svgRect.left,
                      y: e.clientY - svgRect.top,
                      cell,
                    });
                  }
                }}
                onMouseMove={(e) => {
                  const svgRect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                  if (svgRect) {
                    setTooltip({
                      x: e.clientX - svgRect.left,
                      y: e.clientY - svgRect.top,
                      cell,
                    });
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "crosshair" }}
              />
            );
          })}

          {showCellValues &&
            cellWidth > 20 &&
            cellHeight > 14 &&
            cells
              .filter((c) => c.count > 0)
              .map((cell) => {
                const x = cell.timeIdx * cellWidth + cellWidth / 2;
                const y = chartHeight - (cell.valueIdx + 1) * cellHeight + cellHeight / 2;
                const t = maxCount > 0 ? cell.count / maxCount : 0;
                const textColor = t > 0.5 ? "#fff" : "var(--text-primary)";
                return (
                  <text
                    key={`v-${cell.timeIdx}-${cell.valueIdx}`}
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={textColor}
                    fontSize={Math.min(10, cellHeight * 0.6)}
                    pointerEvents="none"
                  >
                    {cell.count}
                  </text>
                );
              })}

          {timeBuckets.map((bucket, i) => {
            if (i % timeTickInterval !== 0) return null;
            const x = i * cellWidth + cellWidth / 2;
            return (
              <text
                key={`t-${i}`}
                x={x}
                y={chartHeight + 14}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize={9}
                transform={`rotate(-35, ${x}, ${chartHeight + 14})`}
              >
                {formatTimeLabel(bucket.start)}
              </text>
            );
          })}

          {valueBuckets.map((bucket, i) => {
            if (i % valueTickInterval !== 0) return null;
            const y = chartHeight - (i + 0.5) * cellHeight;
            return (
              <text
                key={`v-${i}`}
                x={-6}
                y={y}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--text-muted)"
                fontSize={9}
              >
                {formatAxisTick(bucket.start, unit)} - {formatAxisTick(bucket.end, unit)}
              </text>
            );
          })}

          <line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={chartHeight}
            stroke="var(--border)"
            strokeWidth={1}
          />
        </g>
      </svg>

      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 4px)",
            color: "var(--text-primary)",
            fontSize: 12,
            padding: "6px 10px",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {formatTimeLabel(tooltip.cell.timeStart)} - {formatTimeLabel(tooltip.cell.timeEnd)}
          </div>
          <div style={{ color: "var(--text-muted)" }}>
            {formatValue(tooltip.cell.valueStart, unit)} - {formatValue(tooltip.cell.valueEnd, unit)}
          </div>
          <div style={{ marginTop: 2, fontWeight: 600 }}>
            Count: {tooltip.cell.count}
          </div>
        </div>
      )}
    </div>
  );
}
