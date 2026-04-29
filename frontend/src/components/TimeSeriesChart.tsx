import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import type { MetricQueryResult } from "../types";

const COLORS = ["#635bff", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#a855f7"];

interface Props {
  data: MetricQueryResult[];
  height?: number;
}

export function TimeSeriesChart({ data, height = 300 }: Props) {
  if (!data.length || !data[0].datapoints.length) {
    return (
      <div className="empty-state" style={{ height }}>
        No data available
      </div>
    );
  }

  const merged = mergeDatapoints(data);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="time"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={(v) => format(new Date(v), "HH:mm")}
          stroke="var(--border)"
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
          labelFormatter={(v) => format(new Date(v as string), "yyyy-MM-dd HH:mm:ss")}
        />
        {data.map((series, i) => {
          const key = seriesKey(series);
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

function seriesKey(s: MetricQueryResult): string {
  const tags = Object.entries(s.tags)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return tags ? `${s.name}{${tags}}` : s.name;
}

function mergeDatapoints(data: MetricQueryResult[]): Record<string, unknown>[] {
  const timeMap = new Map<string, Record<string, unknown>>();

  for (const series of data) {
    const key = seriesKey(series);
    for (const [ts, val] of series.datapoints) {
      const t = ts;
      if (!timeMap.has(t)) {
        timeMap.set(t, { time: t });
      }
      timeMap.get(t)![key] = val;
    }
  }

  return Array.from(timeMap.values()).sort(
    (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime()
  );
}
