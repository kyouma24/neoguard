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
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface WaterfallBar {
  name: string;
  base: number;
  value: number;
  raw: number;
  isTotal: boolean;
}

function computeAverage(datapoints: [string, number | null][]): number {
  const values = datapoints
    .map(([, v]) => v)
    .filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function WaterfallWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const cfg = displayOptions?.waterfall;
  const showTotal = cfg?.showTotal ?? true;
  const positiveColor = cfg?.positiveColor ?? "#22c55e";
  const negativeColor = cfg?.negativeColor ?? "#ef4444";
  const totalColor = cfg?.totalColor ?? "#635bff";
  const unit = displayOptions?.unit;

  const bars: WaterfallBar[] = [];
  let cumulative = 0;

  for (const series of data) {
    const avg = computeAverage(series.datapoints);
    const tags = Object.entries(series.tags)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    const name = tags || series.name;

    const base = avg >= 0 ? cumulative : cumulative + avg;
    bars.push({
      name,
      base,
      value: Math.abs(avg),
      raw: avg,
      isTotal: false,
    });
    cumulative += avg;
  }

  if (showTotal) {
    bars.push({
      name: "Total",
      base: cumulative >= 0 ? 0 : cumulative,
      value: Math.abs(cumulative),
      raw: cumulative,
      isTotal: true,
    });
  }

  if (!bars.length) {
    return <ChartEmptyState height={height} />;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bars} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          interval={0}
          angle={bars.length > 6 ? -30 : 0}
          textAnchor={bars.length > 6 ? "end" : "middle"}
          height={bars.length > 6 ? 60 : 30}
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={60}
          tickFormatter={(v: number) => formatValue(v, unit)}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(_value: number, _name: string, entry: { payload?: WaterfallBar }) => {
            const bar = entry.payload;
            if (!bar) return [formatValue(_value, unit), ""];
            const label = bar.isTotal ? "Total" : bar.raw >= 0 ? "Increase" : "Decrease";
            return [formatValue(bar.raw, unit), label];
          }}
          labelFormatter={(label: string) => label}
          cursor={{ fill: "var(--bg-tertiary)", fillOpacity: 0.3 }}
        />
        {/* Hidden base bar for stacking offset */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        {/* Visible value bar */}
        <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {bars.map((bar, i) => {
            let fill: string;
            if (bar.isTotal) {
              fill = totalColor;
            } else if (bar.raw >= 0) {
              fill = positiveColor;
            } else {
              fill = negativeColor;
            }
            return <Cell key={i} fill={fill} fillOpacity={0.85} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
