import { useCallback, useState } from "react";
import { subHours } from "date-fns";
import { Plus, Save, X } from "lucide-react";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { useURLState } from "../hooks/useURLState";
import { api, formatError } from "../services/api";
import {
  Button,
  Card,
  Modal,
  NativeSelect,
  PageHeader,
  EmptyState,
} from "../design-system";
import type { Dashboard, MetricQueryResult } from "../types";

const COLORS = ["#635bff", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];
const MAX_QUERIES = 5;

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
  const [metricsStr, setMetricsStr] = useURLState("metrics", "");
  const [interval, setInterval] = useURLState("interval", "1m");
  const [aggregation, setAggregation] = useURLState("aggregation", "avg");
  const [timeRangeStr, setTimeRangeStr] = useURLState("range", "1");
  const timeRange = parseFloat(timeRangeStr) || 1;

  const selectedMetrics = metricsStr ? metricsStr.split(",") : [""];

  const setSelectedMetrics = useCallback(
    (metrics: string[]) => {
      const cleaned = metrics.filter((m) => m !== "");
      setMetricsStr(cleaned.join(","));
    },
    [setMetricsStr],
  );

  const updateMetric = useCallback(
    (index: number, value: string) => {
      const next = [...selectedMetrics];
      next[index] = value;
      setSelectedMetrics(next);
    },
    [selectedMetrics, setSelectedMetrics],
  );

  const addQuery = useCallback(() => {
    if (selectedMetrics.length < MAX_QUERIES) {
      const next = [...selectedMetrics.filter((m) => m !== ""), ""];
      setMetricsStr(next.filter((m) => m !== "").join(","));
    }
  }, [selectedMetrics, setMetricsStr]);

  const removeQuery = useCallback(
    (index: number) => {
      const next = selectedMetrics.filter((_, i) => i !== index);
      setSelectedMetrics(next.length > 0 ? next : [""]);
    },
    [selectedMetrics, setSelectedMetrics],
  );

  const { data: names } = useApi(() => api.metrics.names(), []);

  const now = new Date();
  const start = subHours(now, timeRange);

  const activeMetrics = selectedMetrics.filter((m) => m !== "");

  const { data: chartData, error: chartError, refetch } = useApi<MetricQueryResult[]>(
    () => {
      if (activeMetrics.length === 0) return Promise.resolve([]);
      if (activeMetrics.length === 1) {
        return api.metrics.query({
          name: activeMetrics[0],
          start: start.toISOString(),
          end: now.toISOString(),
          interval,
          aggregation,
        });
      }
      return api.metrics.queryBatch(
        activeMetrics.map((name) => ({
          name,
          start: start.toISOString(),
          end: now.toISOString(),
          interval,
          aggregation,
        })),
      ).then((batches) => batches.flat());
    },
    [metricsStr, interval, aggregation, timeRange],
  );

  useInterval(refetch, 15_000);

  const metricOptions = (names ?? []).map((n) => ({ value: n, label: n }));

  const showAddButton = selectedMetrics.length < MAX_QUERIES && activeMetrics.length > 0;

  const [showSaveModal, setShowSaveModal] = useState(false);

  return (
    <div>
      <PageHeader title="Metrics Explorer" />

      <Card variant="bordered" padding="md">
        {selectedMetrics.map((metric, idx) => (
          <div key={idx} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: idx < selectedMetrics.length - 1 ? 8 : 0 }}>
            {selectedMetrics.length > 1 && (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: COLORS[idx % COLORS.length],
                  flexShrink: 0,
                  alignSelf: "center",
                  marginBottom: 4,
                }}
              />
            )}
            <div style={{ minWidth: 250, flex: 1 }}>
              <NativeSelect
                label={idx === 0 ? "Metric" : undefined}
                placeholder="Select a metric..."
                options={metricOptions}
                value={metric}
                onChange={(v) => updateMetric(idx, v)}
              />
            </div>
            {idx === 0 && (
              <>
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
                      onClick={() => setTimeRangeStr(String(r.hours))}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </>
            )}
            {selectedMetrics.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeQuery(idx)} title="Remove query">
                <X size={14} />
              </Button>
            )}
          </div>
        ))}
        {showAddButton && (
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={addQuery}>
              <Plus size={14} /> Add metric ({selectedMetrics.length}/{MAX_QUERIES})
            </Button>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card variant="bordered">
          {chartError ? (
            <div style={{ color: "var(--color-danger-500)", fontSize: 13, padding: 16 }}>Error loading metrics: {chartError}</div>
          ) : activeMetrics.length > 0 ? (
            <TimeSeriesChart data={chartData ?? []} height={400} />
          ) : (
            <EmptyState
              title="Select a metric to visualize"
              description="Choose a metric from the dropdown above. Add up to 5 metrics to overlay on one chart."
            />
          )}
        </Card>
      </div>

      {activeMetrics.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
            {activeMetrics.length > 1 && chartData && chartData.length > 0 && chartData.map((series, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length] }} />
                <span style={{ color: "var(--color-neutral-600)" }}>{series.name}</span>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowSaveModal(true)}>
            <Save size={14} /> Save to Dashboard
          </Button>
        </div>
      )}

      {showSaveModal && (
        <SaveToDashboardModal
          metrics={activeMetrics}
          aggregation={aggregation}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}

function SaveToDashboardModal({
  metrics,
  aggregation,
  onClose,
}: {
  metrics: string[];
  aggregation: string;
  onClose: () => void;
}) {
  const { data: dashboards } = useApi<Dashboard[]>(() => api.dashboards.list(), []);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      const dashboard = await api.dashboards.get(selectedId);
      const existingCount = dashboard.panels.length;
      const newPanels = metrics.map((metric, i) => ({
        id: crypto.randomUUID(),
        title: metric,
        panel_type: "timeseries" as const,
        metric_name: metric,
        aggregation,
        width: 6,
        height: 4,
        position_x: ((existingCount + i) % 2) * 6,
        position_y: Math.floor((existingCount + i) / 2) * 4,
      }));
      await api.dashboards.update(selectedId, {
        panels: [...dashboard.panels, ...newPanels],
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1000);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const options = (dashboards ?? []).map((d) => ({ value: d.id, label: d.name }));

  return (
    <Modal
      isOpen
      title="Save to Dashboard"
      onClose={onClose}
      size="sm"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!selectedId || saving}>
            {saving ? "Saving..." : success ? "Saved!" : "Add Widget"}
          </Button>
        </div>
      }
    >
      {error && <div style={{ color: "var(--color-danger-500)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <p style={{ fontSize: 13, color: "var(--color-neutral-500)", marginBottom: 12 }}>
        Add {metrics.length} metric{metrics.length > 1 ? "s" : ""} as widget{metrics.length > 1 ? "s" : ""} to an existing dashboard.
      </p>
      <NativeSelect
        label="Dashboard"
        placeholder="Select a dashboard..."
        options={options}
        value={selectedId}
        onChange={setSelectedId}
      />
    </Modal>
  );
}
