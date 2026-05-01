import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import type { MetricQueryResult } from "../../types";

interface Props {
  data: MetricQueryResult[];
  height?: number;
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(2);
}

export function StatWidget({ data, height = 160 }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return (
      <div className="stat-widget" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>&mdash;</span>
      </div>
    );
  }

  const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  const current = points[points.length - 1]?.[1] ?? 0;
  const prev = points[Math.max(0, points.length - Math.floor(points.length / 2))]?.[1];
  const delta = prev && prev !== 0 ? ((current - prev) / prev) * 100 : null;

  const sparkData = points.map(([ts, val]) => ({ time: ts, value: val }));
  const sparkColor = delta !== null ? (delta >= 0 ? "#22c55e" : "#ef4444") : "#635bff";

  return (
    <div className="stat-widget" style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <div style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
        {formatValue(current)}
      </div>
      {delta !== null && (
        <div style={{ fontSize: 13, fontWeight: 500, color: delta >= 0 ? "#22c55e" : "#ef4444" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
        </div>
      )}
      {sparkData.length > 2 && (
        <div style={{ width: "80%", height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                fill={sparkColor}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
