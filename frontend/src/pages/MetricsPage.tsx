import { useState } from "react";
import { subHours } from "date-fns";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import {
  Button,
  Card,
  NativeSelect,
  PageHeader,
  EmptyState,
} from "../design-system";
import type { MetricQueryResult } from "../types";

const INTERVALS = [
  { value: "raw", label: "raw" },
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
];

const AGGREGATIONS = [
  { value: "avg", label: "avg" },
  { value: "min", label: "min" },
  { value: "max", label: "max" },
  { value: "sum", label: "sum" },
  { value: "count", label: "count" },
];

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
    [selectedMetric, interval, aggregation, timeRange],
  );

  useInterval(refetch, 15_000);

  const metricOptions = (names ?? []).map((n) => ({ value: n, label: n }));

  return (
    <div>
      <PageHeader title="Metrics Explorer" />

      <Card variant="bordered" padding="md">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 250, flex: 1 }}>
            <NativeSelect
              label="Metric"
              placeholder="Select a metric..."
              options={metricOptions}
              value={selectedMetric}
              onChange={(v) => setSelectedMetric(v)}
            />
          </div>
          <div style={{ minWidth: 100 }}>
            <NativeSelect
              label="Interval"
              options={INTERVALS}
              value={interval}
              onChange={(v) => setInterval(v)}
            />
          </div>
          <div style={{ minWidth: 100 }}>
            <NativeSelect
              label="Aggregation"
              options={AGGREGATIONS}
              value={aggregation}
              onChange={(v) => setAggregation(v)}
            />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {TIME_RANGES.map((r) => (
              <Button
                key={r.hours}
                variant={timeRange === r.hours ? "primary" : "ghost"}
                size="sm"
                onClick={() => setTimeRange(r.hours)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card variant="bordered">
          {selectedMetric ? (
            <TimeSeriesChart data={chartData ?? []} height={400} />
          ) : (
            <EmptyState
              title="Select a metric to visualize"
              description="Choose a metric from the dropdown above to see its time series data."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
