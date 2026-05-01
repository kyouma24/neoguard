import {
  Cell,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { MetricQueryResult } from "../../types";

const COLORS = [
  "#635bff", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7",
  "#ec4899", "#14b8a6", "#f97316", "#8b5cf6",
];

interface Props {
  data: MetricQueryResult[];
  height?: number;
}

export function PieChartWidget({ data, height = 300 }: Props) {
  if (!data.length) {
    return <div className="chart-empty" style={{ height }}>No data available</div>;
  }

  const items = data.map((series) => {
    const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v !== null);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const tags = Object.entries(series.tags).map(([k, v]) => `${k}:${v}`).join(", ");
    return { name: tags || series.name, value: Math.round(avg * 100) / 100 };
  }).filter((item) => item.value > 0);

  if (!items.length) {
    return <div className="chart-empty" style={{ height }}>No data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPieChart>
        <Pie
          data={items}
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="70%"
          paddingAngle={2}
          dataKey="value"
          isAnimationActive={false}
        >
          {items.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          formatter={(value: string) => value.length > 25 ? value.slice(0, 23) + "..." : value}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
