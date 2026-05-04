import { useMemo } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

type ColorScheme = "greens" | "blues" | "reds" | "oranges";

const COLOR_PALETTES: Record<ColorScheme, [string, string, string, string, string]> = {
  greens: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  blues:  ["#161b22", "#0a3069", "#0550ae", "#1f6feb", "#58a6ff"],
  reds:   ["#161b22", "#6e1b1b", "#9e2a2a", "#da3633", "#f85149"],
  oranges:["#161b22", "#5c2d0e", "#8a4b1a", "#d29922", "#e3b341"],
};

const DAY_LABELS_SUN = ["", "Mon", "", "Wed", "", "Fri", ""];
const DAY_LABELS_MON = ["Mon", "", "Wed", "", "Fri", "", ""];

const CELL_GAP = 2;
const LABEL_WIDTH = 28;
const MONTH_LABEL_HEIGHT = 16;

/**
 * Format a date as YYYY-MM-DD for bucketing.
 */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Aggregate all datapoints across all series by date, summing values per day.
 */
function aggregateByDay(data: MetricQueryResult[]): Map<string, number> {
  const dayMap = new Map<string, number>();
  for (const series of data) {
    for (const [ts, val] of series.datapoints) {
      if (val === null) continue;
      const key = toDateKey(new Date(ts));
      dayMap.set(key, (dayMap.get(key) ?? 0) + val);
    }
  }
  return dayMap;
}

/**
 * Generate the date range: from (today - monthsToShow months) to today.
 */
function buildDateRange(monthsToShow: number): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - monthsToShow);
  // Align to start of week
  start.setDate(start.getDate() - start.getDay());
  return { start, end };
}

interface CellInfo {
  date: Date;
  dateKey: string;
  col: number;
  row: number;
  value: number | null;
}

export function CalendarHeatmapWidget({ data, height = 200, displayOptions }: Props) {
  const hasData = data.some((s) => s.datapoints.length > 0);
  if (!data.length || !hasData) {
    return <ChartEmptyState height={height} />;
  }

  const cfg = displayOptions?.calendarHeatmap;
  const colorScheme: ColorScheme = cfg?.colorScheme ?? "greens";
  const monthsToShow = cfg?.monthsToShow ?? 12;
  const startDay = cfg?.startDay ?? 0;
  const unit = displayOptions?.unit;

  const palette = COLOR_PALETTES[colorScheme];

  const dayMap = useMemo(() => aggregateByDay(data), [data]);
  const { start, end } = useMemo(() => buildDateRange(monthsToShow), [monthsToShow]);

  // Build cells grid
  const { cells, totalWeeks, monthLabels } = useMemo(() => {
    const cells: CellInfo[] = [];
    const monthLabels: { label: string; col: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let lastMonth = -1;

    const current = new Date(start);
    // Adjust for startDay (0=Sunday, 1=Monday)
    if (startDay === 1) {
      const dayOfWeek = current.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      current.setDate(current.getDate() + mondayOffset);
    }

    let col = 0;
    while (current <= end) {
      const dayOfWeek = current.getDay();
      const row = startDay === 1
        ? (dayOfWeek === 0 ? 6 : dayOfWeek - 1)
        : dayOfWeek;

      // Start new week column when we hit the start day
      if (cells.length > 0 && row === 0) {
        col++;
      }

      const dateKey = toDateKey(current);
      const value = dayMap.get(dateKey) ?? null;

      // Track month labels
      if (current.getMonth() !== lastMonth) {
        monthLabels.push({ label: monthNames[current.getMonth()], col });
        lastMonth = current.getMonth();
      }

      cells.push({ date: new Date(current), dateKey, col, row, value });
      current.setDate(current.getDate() + 1);
    }

    return { cells, totalWeeks: col + 1, monthLabels };
  }, [start, end, startDay, dayMap]);

  // Compute intensity levels
  const values = cells.map((c) => c.value).filter((v): v is number => v !== null);
  const maxVal = values.length ? Math.max(...values) : 1;
  const minVal = values.length ? Math.min(...values) : 0;

  function getColorLevel(value: number | null): string {
    if (value === null || value === 0) return palette[0];
    const range = maxVal - minVal || 1;
    const normalized = (value - minVal) / range;
    if (normalized <= 0.25) return palette[1];
    if (normalized <= 0.5) return palette[2];
    if (normalized <= 0.75) return palette[3];
    return palette[4];
  }

  // Auto-fit cell size based on available width
  const availableWidth = 800;
  const cellSize = Math.max(
    6,
    Math.min(14, Math.floor((availableWidth - LABEL_WIDTH) / (totalWeeks + 1) - CELL_GAP)),
  );

  const svgWidth = LABEL_WIDTH + totalWeeks * (cellSize + CELL_GAP) + cellSize;
  const svgHeight = MONTH_LABEL_HEIGHT + 7 * (cellSize + CELL_GAP) + CELL_GAP;

  const dayLabels = startDay === 1 ? DAY_LABELS_MON : DAY_LABELS_SUN;

  return (
    <div
      style={{
        width: "100%",
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
      }}
    >
      <svg
        width="100%"
        height={Math.min(height, svgHeight + 20)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Month labels */}
        {monthLabels.map((ml, i) => (
          <text
            key={`month-${i}`}
            x={LABEL_WIDTH + ml.col * (cellSize + CELL_GAP)}
            y={MONTH_LABEL_HEIGHT - 4}
            fill="var(--text-muted)"
            fontSize={9}
            textAnchor="start"
          >
            {ml.label}
          </text>
        ))}

        {/* Day-of-week labels */}
        {dayLabels.map((label, i) => (
          label ? (
            <text
              key={`day-${i}`}
              x={LABEL_WIDTH - 4}
              y={MONTH_LABEL_HEIGHT + i * (cellSize + CELL_GAP) + cellSize / 2}
              fill="var(--text-muted)"
              fontSize={8}
              textAnchor="end"
              dominantBaseline="central"
            >
              {label}
            </text>
          ) : null
        ))}

        {/* Day cells */}
        {cells.map((cell, i) => {
          const x = LABEL_WIDTH + cell.col * (cellSize + CELL_GAP);
          const y = MONTH_LABEL_HEIGHT + cell.row * (cellSize + CELL_GAP);
          const color = getColorLevel(cell.value);

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              rx={2}
              ry={2}
              fill={color}
              stroke="none"
            >
              <title>
                {`${formatDateLabel(cell.date)}\n${cell.value !== null ? formatValue(cell.value, unit) : "No data"}`}
              </title>
            </rect>
          );
        })}

        {/* Legend */}
        {(() => {
          const legendX = svgWidth - 5 * (cellSize + CELL_GAP) - 50;
          const legendY = svgHeight - cellSize - 2;
          return (
            <g>
              <text
                x={legendX - 4}
                y={legendY + cellSize / 2}
                fill="var(--text-muted)"
                fontSize={8}
                textAnchor="end"
                dominantBaseline="central"
              >
                Less
              </text>
              {palette.map((color, i) => (
                <rect
                  key={`legend-${i}`}
                  x={legendX + i * (cellSize + CELL_GAP)}
                  y={legendY}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  ry={2}
                  fill={color}
                />
              ))}
              <text
                x={legendX + 5 * (cellSize + CELL_GAP) + 2}
                y={legendY + cellSize / 2}
                fill="var(--text-muted)"
                fontSize={8}
                textAnchor="start"
                dominantBaseline="central"
              >
                More
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
