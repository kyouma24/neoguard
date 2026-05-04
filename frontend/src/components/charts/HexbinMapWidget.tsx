import { useState, useMemo } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface HexCell {
  seriesName: string;
  displayName: string;
  group: string;
  avgValue: number | null;
}

const DEFAULT_HEX_SIZE = 32;
const HEX_GAP = 3;

function computeAverage(datapoints: [string, number | null][]): number | null {
  let sum = 0;
  let count = 0;
  for (const [, v] of datapoints) {
    if (v !== null) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function defaultGradientColor(value: number, min: number, max: number): string {
  const range = max - min;
  const t = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0.5;

  // green (120) -> yellow (60) -> red (0)
  const hue = (1 - t) * 120;
  return `hsl(${hue}, 72%, 48%)`;
}

function hexPointsFlat(cx: number, cy: number, size: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    points.push(`${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`);
  }
  return points.join(" ");
}

function getCellColor(
  value: number | null,
  allValues: number[],
  thresholds: PanelDisplayOptions["thresholds"],
  colors: PanelDisplayOptions["colors"],
): string {
  if (value === null) return "var(--border)";

  if (thresholds?.steps?.length) {
    return getThresholdColor(value, thresholds.steps, thresholds.baseColor);
  }

  if (colors?.palette?.length) {
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    const t = range > 0 ? Math.max(0, Math.min(1, (value - min) / range)) : 0;
    const idx = Math.min(
      colors.palette.length - 1,
      Math.floor(t * colors.palette.length),
    );
    return colors.palette[idx];
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  return defaultGradientColor(value, min, max);
}

function resolveDisplayName(series: MetricQueryResult): string {
  const tagEntries = Object.entries(series.tags);
  if (tagEntries.length > 0) {
    return tagEntries.map(([k, v]) => `${k}:${v}`).join(", ");
  }
  return series.name;
}

export function HexbinMapWidget({ data, height = 300, displayOptions }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<string | null>(null);

  const hexCfg = displayOptions?.hexbin;
  const hexSize = hexCfg?.hexSize ?? DEFAULT_HEX_SIZE;
  const groupByKey = hexCfg?.groupBy;
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const colors = displayOptions?.colors;

  const cells = useMemo<HexCell[]>(() => {
    return data.map((series) => ({
      seriesName: series.name,
      displayName: resolveDisplayName(series),
      group: groupByKey ? (series.tags[groupByKey] ?? "ungrouped") : "",
      avgValue: computeAverage(series.datapoints),
    }));
  }, [data, groupByKey]);

  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const allValues = cells
    .map((c) => c.avgValue)
    .filter((v): v is number => v !== null);

  const groups = useMemo(() => {
    if (!groupByKey) return [{ label: "", cells }];

    const map = new Map<string, HexCell[]>();
    for (const cell of cells) {
      const existing = map.get(cell.group);
      if (existing) {
        existing.push(cell);
      } else {
        map.set(cell.group, [cell]);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupCells]) => ({ label, cells: groupCells }));
  }, [cells, groupByKey]);

  // Flat-top hex layout dimensions
  const hexW = hexSize * 2;
  const hexH = hexSize * Math.sqrt(3);
  const colStep = hexW * 0.75 + HEX_GAP;
  const rowStep = hexH + HEX_GAP;

  const GROUP_LABEL_HEIGHT = groupByKey ? 24 : 0;
  const GROUP_GAP = groupByKey ? 12 : 0;
  const PADDING = 8;

  // Pre-calculate SVG dimensions
  let totalSvgHeight = PADDING;
  const groupLayouts: {
    label: string;
    cells: HexCell[];
    startY: number;
    cols: number;
    rows: number;
  }[] = [];

  // Estimate available width (will use 100% of container, calculate cols from a reasonable width)
  const estimatedWidth = 600;
  const maxCols = Math.max(1, Math.floor((estimatedWidth - PADDING * 2 + HEX_GAP) / colStep));

  for (const group of groups) {
    const cols = Math.min(maxCols, group.cells.length);
    const rows = Math.ceil(group.cells.length / Math.max(1, cols));
    groupLayouts.push({
      label: group.label,
      cells: group.cells,
      startY: totalSvgHeight + GROUP_LABEL_HEIGHT,
      cols,
      rows,
    });
    totalSvgHeight += GROUP_LABEL_HEIGHT + rows * rowStep + hexSize * 0.5 + GROUP_GAP;
  }
  totalSvgHeight += PADDING;

  return (
    <div style={{ height, overflow: "auto", position: "relative" }}>
      <svg
        width="100%"
        height={Math.max(totalSvgHeight, height)}
        style={{ display: "block" }}
      >
        {groupLayouts.map((gl, gi) => {
          const groupStartX = PADDING + hexSize;

          return (
            <g key={gi}>
              {gl.label && (
                <text
                  x={PADDING}
                  y={gl.startY - 8}
                  fill="var(--text-muted)"
                  fontSize={11}
                  fontWeight={600}
                >
                  {gl.label}
                </text>
              )}

              {gl.cells.map((cell, ci) => {
                const col = ci % Math.max(1, gl.cols);
                const row = Math.floor(ci / Math.max(1, gl.cols));
                const cx = groupStartX + col * colStep;
                const cy = gl.startY + row * rowStep + hexSize * 0.87 + (col % 2 === 1 ? rowStep / 2 : 0);
                const cellKey = `${gi}-${ci}`;
                const isHovered = hoveredIdx === cellKey;

                const fillColor = getCellColor(cell.avgValue, allValues, thresholds, colors);

                return (
                  <g
                    key={ci}
                    onMouseEnter={() => setHoveredIdx(cellKey)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{ cursor: "default" }}
                  >
                    <polygon
                      points={hexPointsFlat(cx, cy, isHovered ? hexSize * 1.08 : hexSize)}
                      fill={fillColor}
                      fillOpacity={cell.avgValue === null ? 0.3 : 0.85}
                      stroke={isHovered ? "var(--text-primary)" : fillColor}
                      strokeWidth={isHovered ? 2 : 1}
                      strokeOpacity={isHovered ? 1 : 0.5}
                    />

                    {isHovered && (
                      <foreignObject
                        x={cx - 90}
                        y={cy - hexSize - 48}
                        width={180}
                        height={44}
                        style={{ pointerEvents: "none", overflow: "visible" }}
                      >
                        <div
                          style={{
                            ...CHART_TOOLTIP_STYLE,
                            padding: "6px 10px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: 180,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                          }}
                        >
                          <div style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {cell.displayName}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {cell.avgValue !== null ? formatValue(cell.avgValue, unit) : "No data"}
                          </div>
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
