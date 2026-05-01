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

const COLORS = [
  "#635bff", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7",
  "#ec4899", "#14b8a6", "#f97316", "#8b5cf6",
];

interface Props {
  data: MetricQueryResult[];
  height?: number;
  limit?: number;
}

export function BarChartWidget({ data, height = 300, limit = 10 }: Props) {
  if (!data.length) {
    return <div className="chart-empty" style={{ height }}>No data available</div>;
  }

  const items = data
    .map((series) => {
      const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v !== null);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      const tags = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
      return { name: tags || series.name, value: Math.round(avg * 100) / 100 };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  if (!items.length) {
    return <div className="chart-empty" style={{ height }}>No data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={items} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
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
          contentStyle={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {items.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
