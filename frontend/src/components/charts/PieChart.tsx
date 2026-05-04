import {
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  onFilterChange?: (key: string, value: string) => void;
}

export function PieChartWidget({ data, height = 300, displayOptions, onFilterChange }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;
  const donutWidth = displayOptions?.donutWidth ?? 40;
  const showLabels = displayOptions?.showLabels ?? false;

  const items = data.map((series) => {
    const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v !== null);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const tags = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
    return { name: tags || series.name, value: Math.round(avg * 100) / 100, rawTags: series.tags };
  }).filter((item) => item.value > 0);

  const handleSectorClick = (_data: unknown, index: number) => {
    if (!onFilterChange) return;
    const item = items[index];
    if (!item) return;
    const entries = Object.entries(item.rawTags);
    if (entries.length > 0) {
      const [key, val] = entries[0];
      onFilterChange(key, val);
    }
  };

  if (!items.length) {
    return <ChartEmptyState height={height} />;
  }

  const innerRadius = donutWidth > 0 ? `${100 - donutWidth}%` : "0%";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={items}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius="70%"
          paddingAngle={2}
          dataKey="value"
          isAnimationActive={false}
          label={showLabels ? ({ name, value }: { name: string; value: number }) =>
            `${name.length > 15 ? name.slice(0, 13) + "..." : name}: ${formatValue(value, unit)}` : undefined
          }
          labelLine={showLabels}
          onClick={handleSectorClick}
          style={onFilterChange ? { cursor: "pointer" } : undefined}
        >
          {items.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [formatValue(value, unit), undefined]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          formatter={(value: string) => value.length > 25 ? value.slice(0, 23) + "..." : value}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
