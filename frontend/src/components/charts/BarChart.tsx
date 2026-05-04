import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatAxisTick, formatValue, getThresholdColor } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  limit?: number;
  displayOptions?: PanelDisplayOptions;
  onFilterChange?: (key: string, value: string) => void;
}

export function BarChartWidget({ data, height = 300, limit = 10, displayOptions, onFilterChange }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;

  const items = data
    .map((series) => {
      const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v !== null);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const tags = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
      return { name: tags || series.name, value: Math.round(avg * 100) / 100, tags: series.tags };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  const handleBarClick = (item: { name: string; tags: Record<string, string> }) => {
    if (!onFilterChange) return;
    const entries = Object.entries(item.tags);
    if (entries.length > 0) {
      const [key, val] = entries[0];
      onFilterChange(key, val);
    }
  };

  if (!items.length) {
    return <ChartEmptyState height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={items} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={140}
          tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + "..." : v}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [formatValue(value, unit), undefined]}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          onClick={(_data: unknown, index: number) => handleBarClick(items[index])}
          style={onFilterChange ? { cursor: "pointer" } : undefined}
        >
          {items.map((item, i) => (
            <Cell
              key={i}
              fill={
                thresholds?.steps.length
                  ? getThresholdColor(item.value, thresholds.steps, thresholds.baseColor)
                  : colors[i % colors.length]
              }
            />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
