import {
  Bar,
  BarChart,
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
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

function buildBuckets(values: number[], numBuckets: number, cumulative: boolean) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ range: formatValue(min), count: values.length, rangeStart: min, rangeEnd: max }];
  }
  const step = (max - min) / numBuckets;
  const buckets: { range: string; count: number; rangeStart: number; rangeEnd: number }[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const lo = min + i * step;
    const hi = i === numBuckets - 1 ? max : min + (i + 1) * step;
    buckets.push({ range: `${lo.toPrecision(3)}–${hi.toPrecision(3)}`, count: 0, rangeStart: lo, rangeEnd: hi });
  }
  for (const v of values) {
    let idx = Math.floor((v - min) / step);
    if (idx >= numBuckets) idx = numBuckets - 1;
    buckets[idx].count++;
  }
  if (cumulative) {
    for (let i = 1; i < buckets.length; i++) {
      buckets[i].count += buckets[i - 1].count;
    }
  }
  return buckets;
}

export function HistogramWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const histCfg = displayOptions?.histogram;
  const numBuckets = histCfg?.buckets ?? 20;
  const cumulative = histCfg?.cumulative ?? false;

  const allValues: number[] = [];
  for (const series of data) {
    for (const [, v] of series.datapoints) {
      if (v != null) allValues.push(v);
    }
  }

  const buckets = buildBuckets(allValues, numBuckets, cumulative);

  if (!buckets.length) {
    return <ChartEmptyState height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={buckets} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="range"
          tick={{ fill: "var(--text-muted)", fontSize: 9 }}
          stroke="var(--border)"
          interval="preserveStartEnd"
          angle={-30}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={50}
          label={{ value: cumulative ? "Cumulative Count" : "Count", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 10 }}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [value, cumulative ? "Cumulative" : "Count"]}
          labelFormatter={(label: string) => `Range: ${label}`}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {buckets.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
