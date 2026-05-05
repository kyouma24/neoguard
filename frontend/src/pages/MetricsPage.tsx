import { useCallback, useState, useEffect } from "react";
import { subHours } from "date-fns";
import { Plus, Save, X, TrendingUp, BarChart3, Table, Activity } from "lucide-react";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { AreaChartWidget } from "../components/charts/AreaChart";
import { BarChartWidget } from "../components/charts/BarChart";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { useURLState } from "../hooks/useURLState";
import { useAuth } from "../contexts/AuthContext";
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

type ChartType = "line" | "area" | "bar" | "table";

const CHART_TYPES: { value: ChartType; label: string; icon: typeof TrendingUp }[] = [
  { value: "line", label: "Line", icon: TrendingUp },
  { value: "area", label: "Area", icon: Activity },
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "table", label: "Table", icon: Table },
];

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
  const { user, tenant } = useAuth();
  const queryTenantId = user?.is_super_admin ? tenant?.id : undefined;
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
      if (index < selectedMetrics.length) {
        const next = [...selectedMetrics];
        next[index] = value;
        setSelectedMetrics(next);
      } else {
        const next = [...selectedMetrics, value];
        setSelectedMetrics(next);
        setExtraSlots((s) => Math.max(0, s - 1));
      }
    },
    [selectedMetrics, setSelectedMetrics],
  );

  const [extraSlots, setExtraSlots] = useState(0);

  const displayMetrics = [...selectedMetrics, ...Array(extraSlots).fill("")];

  const addQuery = useCallback(() => {
    if (displayMetrics.length < MAX_QUERIES) {
      setExtraSlots((s) => s + 1);
    }
  }, [displayMetrics.length]);

  const removeQuery = useCallback(
    (index: number) => {
      if (index < selectedMetrics.length) {
        const next = selectedMetrics.filter((_, i) => i !== index);
        setSelectedMetrics(next.length > 0 ? next : [""]);
      } else {
        setExtraSlots((s) => Math.max(0, s - 1));
      }
    },
    [selectedMetrics, setSelectedMetrics],
  );

  const { data: names } = useApi(() => api.metrics.names({ tenantId: queryTenantId }), [queryTenantId]);

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
        }, { tenantId: queryTenantId });
      }
      return api.metrics.queryBatch(
        activeMetrics.map((name) => ({
          name,
          start: start.toISOString(),
          end: now.toISOString(),
          interval,
          aggregation,
        })),
        { tenantId: queryTenantId },
      ).then((batches) => batches.flat());
    },
    [metricsStr, interval, aggregation, timeRange, queryTenantId],
  );

  useInterval(refetch, 15_000);

  const metricOptions = (names ?? []).map((n) => ({ value: n, label: n }));

  const showAddButton = displayMetrics.length < MAX_QUERIES && activeMetrics.length > 0;

  const [chartType, setChartType] = useURLState("chart", "line") as [string, (v: string) => void];
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("neoguard_recent_metrics") || "[]");
    } catch { return []; }
  });

  useEffect(() => {
    if (activeMetrics.length > 0) {
      const key = activeMetrics.join(",");
      setRecentQueries((prev) => {
        const next = [key, ...prev.filter((q) => q !== key)].slice(0, 10);
        localStorage.setItem("neoguard_recent_metrics", JSON.stringify(next));
        return next;
      });
    }
  }, [metricsStr]);

  return (
    <div>
      <PageHeader
        title="Explorer"
        subtitle={recentQueries.length > 0 ? `${recentQueries.length} recent queries` : undefined}
      />

      <Card variant="bordered" padding="md">
        {displayMetrics.map((metric, idx) => (
          <div key={idx} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: idx < displayMetrics.length - 1 ? 8 : 0 }}>
            {displayMetrics.length > 1 && (
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
            {displayMetrics.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeQuery(idx)} title="Remove query">
                <X size={14} />
              </Button>
            )}
          </div>
        ))}
        {showAddButton && (
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={addQuery}>
              <Plus size={14} /> Add metric ({displayMetrics.length}/{MAX_QUERIES})
            </Button>
          </div>
        )}
      </Card>

      {/* Chart Type Switcher */}
      <div style={{ marginTop: 12, display: "flex", gap: 4, alignItems: "center" }}>
        {CHART_TYPES.map((ct) => {
          const Icon = ct.icon;
          return (
            <button
              key={ct.value}
              onClick={() => setChartType(ct.value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: chartType === ct.value ? "var(--accent)" : "transparent",
                color: chartType === ct.value ? "var(--text-on-accent)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <Icon size={13} /> {ct.label}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 8 }}>
        <Card variant="bordered">
          {chartError ? (
            <div style={{ color: "var(--color-danger-500)", fontSize: 13, padding: 16 }}>Error loading metrics: {chartError}</div>
          ) : activeMetrics.length > 0 ? (
            chartType === "table" ? (
              <MetricsTable data={chartData ?? []} />
            ) : chartType === "area" ? (
              <AreaChartWidget data={chartData ?? []} height={400} />
            ) : chartType === "bar" ? (
              <BarChartWidget data={chartData ?? []} height={400} />
            ) : (
              <TimeSeriesChart data={chartData ?? []} height={400} />
            )
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

function MetricsTable({ data }: { data: MetricQueryResult[] }) {
  if (data.length === 0) return <EmptyState title="No data" description="No metric data available." />;

  return (
    <div style={{ overflow: "auto", maxHeight: 400, padding: 12 }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", fontFamily: "var(--typography-font-family-mono)" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            <th style={tableHeaderStyle}>Metric</th>
            <th style={tableHeaderStyle}>Last</th>
            <th style={tableHeaderStyle}>Min</th>
            <th style={tableHeaderStyle}>Max</th>
            <th style={tableHeaderStyle}>Avg</th>
            <th style={tableHeaderStyle}>Points</th>
          </tr>
        </thead>
        <tbody>
          {data.map((series, i) => {
            const values = series.datapoints.map((dp) => dp[1]).filter((v): v is number => v !== null);
            const last = values.length > 0 ? values[values.length - 1] : null;
            const min = values.length > 0 ? Math.min(...values) : null;
            const max = values.length > 0 ? Math.max(...values) : null;
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
            return (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ ...tableCellStyle, color: COLORS[i % COLORS.length], fontWeight: 600 }}>{series.name}</td>
                <td style={tableCellStyle}>{last?.toFixed(2) ?? "-"}</td>
                <td style={tableCellStyle}>{min?.toFixed(2) ?? "-"}</td>
                <td style={tableCellStyle}>{max?.toFixed(2) ?? "-"}</td>
                <td style={tableCellStyle}>{avg?.toFixed(2) ?? "-"}</td>
                <td style={tableCellStyle}>{values.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tableCellStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "var(--text-primary)",
};
