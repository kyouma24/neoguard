import { useState } from "react";
import { subHours } from "date-fns";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import type { MetricQueryResult } from "../types";

const INTERVALS = ["raw", "1m", "5m", "15m", "1h"];
const AGGREGATIONS = ["avg", "min", "max", "sum", "count"];
const TIME_RANGES = [
  { label: "Last 15m", hours: 0.25 },
  { label: "Last 1h", hours: 1 },
  { label: "Last 6h", hours: 6 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7d", hours: 168 },
];

export function MetricsPage() {
  const [selectedMetric, setSelectedMetric] = useState<string>("");
  const [interval, setInterval] = useState("1m");
  const [aggregation, setAggregation] = useState("avg");
  const [timeRange, setTimeRange] = useState(1);

  const { data: names } = useApi(() => api.metrics.names(), []);

  const now = new Date();
  const start = subHours(now, timeRange);

  const { data: chartData, refetch } = useApi<MetricQueryResult[]>(
    () =>
      selectedMetric
        ? api.metrics.query({
            name: selectedMetric,
            start: start.toISOString(),
            end: now.toISOString(),
            interval,
            aggregation,
          })
        : Promise.resolve([]),
    [selectedMetric, interval, aggregation, timeRange]
  );

  useInterval(refetch, 15_000);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Metrics Explorer</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="select"
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            style={{ minWidth: 250 }}
          >
            <option value="">Select a metric...</option>
            {names?.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}>
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>

          <select className="select" value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
            {AGGREGATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 4 }}>
            {TIME_RANGES.map((r) => (
              <button
                key={r.hours}
                className="btn"
                style={{
                  background: timeRange === r.hours ? "var(--accent)" : undefined,
                  color: timeRange === r.hours ? "#fff" : undefined,
                  borderColor: timeRange === r.hours ? "var(--accent)" : undefined,
                  padding: "6px 12px",
                  fontSize: 12,
                }}
                onClick={() => setTimeRange(r.hours)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        {selectedMetric ? (
          <TimeSeriesChart data={chartData ?? []} height={400} />
        ) : (
          <div className="empty-state" style={{ height: 400 }}>
            Select a metric to visualize
          </div>
        )}
      </div>
    </div>
  );
}
