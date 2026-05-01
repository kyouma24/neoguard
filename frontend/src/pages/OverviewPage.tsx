import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Cloud,
  Database,
  FileText,
  RefreshCw,
  Server,
  TrendingUp,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import {
  Card,
  Badge,
  StatusBadge,
  Button,
  PageHeader,
  ProgressBar,
  DataTable,
} from "../design-system";
import type { DataTableColumn } from "../design-system";
import type {
  AlertEvent,
  AlertRule,
  HealthStatus,
  MetricQueryResult,
  ResourceSummary,
} from "../types";

const TIME_RANGES: { label: string; minutes: number }[] = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
];

const PROVIDER_COLORS: Record<string, string> = {
  aws: "#f59e0b",
  azure: "#3b82f6",
  gcp: "#ef4444",
  local: "#8b92a8",
};

const PROVIDER_LABELS: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  local: "Local",
};

const eventColumns: DataTableColumn<AlertEvent>[] = [
  {
    key: "status",
    label: "Status",
    render: (_v, row) => (
      <StatusBadge
        label={row.status}
        tone={
          row.status === "firing"
            ? "danger"
            : row.status === "resolved"
              ? "success"
              : "warning"
        }
      />
    ),
  },
  {
    key: "message",
    label: "Message",
    render: (v) => (
      <span
        style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
        title={String(v)}
      >
        {String(v)}
      </span>
    ),
  },
  {
    key: "value",
    label: "Value",
    render: (v) => (
      <span style={{ fontFamily: "var(--typography-font-family-mono)" }}>
        {Number(v).toFixed(2)}
      </span>
    ),
  },
  {
    key: "threshold",
    label: "Threshold",
    render: (v) => (
      <span style={{ fontFamily: "var(--typography-font-family-mono)", color: "var(--color-neutral-500)" }}>
        {String(v)}
      </span>
    ),
  },
  {
    key: "fired_at",
    label: "Fired",
    render: (v) => (
      <span style={{ color: "var(--color-neutral-500)", whiteSpace: "nowrap" }}>
        {format(new Date(String(v)), "MMM dd HH:mm")}
      </span>
    ),
  },
];

export function OverviewPage() {
  const [timeRange, setTimeRange] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: health, refetch: refetchHealth } = useApi<HealthStatus>(
    () => api.health(),
    [],
  );
  const { data: resourceSummary, refetch: refetchResources } =
    useApi<ResourceSummary>(() => api.resources.summary(), []);
  const { data: alertRules } = useApi<AlertRule[]>(
    () => api.alerts.listRules(),
    [],
  );
  const { data: alertEvents, refetch: refetchEvents } = useApi<AlertEvent[]>(
    () => api.alerts.listEvents({ limit: 20 }),
    [],
  );

  const now = new Date();
  const start = new Date(now.getTime() - timeRange * 60_000);

  const { data: cpuMetrics } = useApi<MetricQueryResult[]>(
    () =>
      api.metrics.query({
        name: "neoguard.process.cpu_percent",
        start: start.toISOString(),
        end: now.toISOString(),
        interval: timeRange <= 60 ? "1m" : "5m",
        aggregation: "avg",
      }),
    [timeRange],
  );

  const { data: memMetrics } = useApi<MetricQueryResult[]>(
    () =>
      api.metrics.query({
        name: "neoguard.process.memory_rss_bytes",
        start: start.toISOString(),
        end: now.toISOString(),
        interval: timeRange <= 60 ? "1m" : "5m",
        aggregation: "avg",
      }),
    [timeRange],
  );

  const refetchAll = () => {
    refetchHealth();
    refetchResources();
    refetchEvents();
  };

  useInterval(autoRefresh ? refetchAll : () => {}, autoRefresh ? 10_000 : null);

  const firingAlerts = alertEvents?.filter((e) => e.status === "firing") ?? [];
  const recentEvents = alertEvents?.slice(0, 10) ?? [];
  const enabledRules = alertRules?.filter((r) => r.enabled).length ?? 0;
  const totalRules = alertRules?.length ?? 0;

  const memMB: MetricQueryResult[] = (memMetrics ?? []).map((s) => ({
    ...s,
    name: "Memory RSS (MB)",
    datapoints: s.datapoints.map(([ts, val]) => [
      ts,
      val !== null ? val / (1024 * 1024) : null,
    ]),
  }));

  return (
    <div>
      <PageHeader
        title="System Overview"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant={autoRefresh ? "primary" : "secondary"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </Button>
            <Button variant="ghost" size="sm" onClick={refetchAll}>
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />

      {health?.status === "degraded" && (
        <Card variant="bordered" padding="sm">
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-danger-500)" }}>
            <AlertTriangle size={16} />
            <span style={{ fontWeight: 600 }}>System Degraded</span>
            {health.degraded_reasons.length > 0 && (
              <span style={{ color: "var(--color-neutral-500)" }}>
                — {health.degraded_reasons.join(", ")}
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 24 }}>
        <StatCard icon={<Activity size={18} />} label="Status" value={health?.status ?? "..."} color={health?.status === "healthy" ? "var(--color-success-500)" : "var(--color-warning-500)"} />
        <StatCard icon={<Server size={18} />} label="Resources" value={formatNum(resourceSummary?.total)} color="var(--color-primary-500)" />
        <StatCard icon={<TrendingUp size={18} />} label="Metrics Written" value={formatNum(health?.writers.metrics.total_written)} color="var(--color-primary-500)" />
        <StatCard icon={<FileText size={18} />} label="Logs Written" value={formatNum(health?.writers.logs.total_written)} color="var(--color-info-500)" />
        <StatCard icon={<Bell size={18} />} label="Firing Alerts" value={firingAlerts.length} color={firingAlerts.length > 0 ? "var(--color-danger-500)" : "var(--color-success-500)"} />
        <StatCard icon={<AlertTriangle size={18} />} label="Dropped" value={formatNum((health?.writers.metrics.total_dropped ?? 0) + (health?.writers.logs.total_dropped ?? 0))} color={(health?.writers.metrics.total_dropped ?? 0) > 0 ? "var(--color-danger-500)" : "var(--color-success-500)"} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card variant="bordered">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: "var(--typography-font-size-sm)", fontWeight: 600, color: "var(--color-neutral-500)" }}>
              CPU Usage (%)
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {TIME_RANGES.map((tr) => (
                <Button
                  key={tr.minutes}
                  variant={timeRange === tr.minutes ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(tr.minutes)}
                >
                  {tr.label}
                </Button>
              ))}
            </div>
          </div>
          <TimeSeriesChart data={cpuMetrics ?? []} height={200} />
        </Card>

        <Card variant="bordered">
          <span style={{ fontSize: "var(--typography-font-size-sm)", fontWeight: 600, color: "var(--color-neutral-500)", display: "block", marginBottom: 12 }}>
            Memory RSS (MB)
          </span>
          <TimeSeriesChart data={memMB} height={200} />
        </Card>
      </div>

      {/* Second Row — 3 columns */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Resources by Provider */}
        <Card variant="bordered" header={<CardTitle icon={<Cloud size={16} />} text="Resources by Provider" />}>
          {resourceSummary?.by_provider && Object.keys(resourceSummary.by_provider).length > 0 ? (
            <>
              {Object.entries(resourceSummary.by_provider)
                .sort(([, a], [, b]) => b - a)
                .map(([provider, count]) => {
                  const pct = resourceSummary.total > 0 ? (count / resourceSummary.total) * 100 : 0;
                  return (
                    <div key={provider} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--typography-font-size-sm)", marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{PROVIDER_LABELS[provider] ?? provider}</span>
                        <span style={{ color: "var(--color-neutral-500)" }}>{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div style={{ height: 6, background: "var(--color-neutral-100)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: PROVIDER_COLORS[provider] ?? "var(--color-primary-500)", borderRadius: 3, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  );
                })}
              <div style={{ paddingTop: 8, borderTop: "1px solid var(--color-neutral-200)", fontSize: "var(--typography-font-size-sm)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-neutral-500)" }}>Total</span>
                <span style={{ fontWeight: 700 }}>{resourceSummary.total}</span>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)", textAlign: "center", padding: 24 }}>
              No resources discovered
            </div>
          )}
        </Card>

        {/* System Health */}
        <Card variant="bordered" header={<CardTitle icon={<Database size={16} />} text="System Health" />}>
          {health?.checks ? (
            <>
              {Object.entries(health.checks).map(([name, status]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-neutral-200)", fontSize: "var(--typography-font-size-sm)" }}>
                  <span>{name}</span>
                  <StatusBadge label={status} tone={status === "ok" ? "success" : "danger"} />
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--typography-font-size-sm)", marginBottom: 4 }}>
                  <span>DB Pool</span>
                  <span style={{ color: "var(--color-neutral-500)" }}>{health.pool.active} active / {health.pool.size} total</span>
                </div>
                <ProgressBar value={health.pool.utilization * 100} label={`${(health.pool.utilization * 100).toFixed(0)}%`} />
              </div>
              <div style={{ marginTop: 12 }}>
                <BufferBar label="Metric Buffer" current={health.writers.metrics.buffer_size} max={5000} />
              </div>
              <div style={{ marginTop: 8 }}>
                <BufferBar label="Log Buffer" current={health.writers.logs.buffer_size} max={2000} />
              </div>
            </>
          ) : (
            <div style={{ color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>Loading...</div>
          )}
        </Card>

        {/* Resource Inventory */}
        <Card variant="bordered" header={<CardTitle icon={<Server size={16} />} text="Resource Inventory" />}>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {resourceSummary?.by_type && Object.keys(resourceSummary.by_type).length > 0 ? (
              Object.entries(resourceSummary.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--color-neutral-200)", fontSize: "var(--typography-font-size-sm)" }}>
                    <span style={{ textTransform: "uppercase" }}>{type}</span>
                    <Badge variant="primary">{count}</Badge>
                  </div>
                ))
            ) : (
              <span style={{ color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>No resources</span>
            )}
          </div>
        </Card>
      </div>

      {/* Third Row — Alert Summary + Events */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <Card variant="bordered" header={<CardTitle icon={<AlertTriangle size={16} />} text="Alert Summary" />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <MiniStat label="Total Rules" value={totalRules} color="var(--color-neutral-900)" />
            <MiniStat label="Enabled" value={enabledRules} color="var(--color-success-500)" />
            <MiniStat label="Firing" value={firingAlerts.length} color={firingAlerts.length > 0 ? "var(--color-danger-500)" : "var(--color-success-500)"} />
            <MiniStat label="Notifications" value={health?.background_tasks.alert_engine.notifications_sent ?? 0} color="var(--color-info-500)" />
          </div>
          {firingAlerts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: "var(--typography-font-size-xs)", fontWeight: 600, color: "var(--color-danger-500)", marginBottom: 8, textTransform: "uppercase" }}>
                Currently Firing
              </div>
              {firingAlerts.map((evt) => (
                <div key={evt.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--color-neutral-200)", fontSize: "var(--typography-font-size-sm)" }}>
                  <span style={{ color: "var(--color-danger-500)", fontWeight: 500 }} title={evt.message}>
                    {evt.message.length > 60 ? evt.message.slice(0, 60) + "..." : evt.message}
                  </span>
                  <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", marginTop: 2 }}>
                    Since {formatDistanceToNow(new Date(evt.fired_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card variant="bordered" header={<CardTitle icon={<Bell size={16} />} text="Recent Alert Events" />}>
          {recentEvents.length > 0 ? (
            <DataTable columns={eventColumns} data={recentEvents} striped hoverable />
          ) : (
            <div style={{ color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)", textAlign: "center", padding: 32 }}>
              No alert events yet
            </div>
          )}
        </Card>
      </div>

      {/* Process Info Footer */}
      {health?.process && (
        <div style={{ marginTop: 16, display: "flex", gap: 24, fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", padding: "8px 0", borderTop: "1px solid var(--color-neutral-200)" }}>
          <span>CPU: {health.process.cpu_percent.toFixed(1)}%</span>
          <span>Memory: {health.process.memory_rss_mb.toFixed(0)} MB</span>
          <span>Uptime: {health.process.uptime_seconds > 86400 ? `${(health.process.uptime_seconds / 86400).toFixed(1)}d` : health.process.uptime_seconds > 3600 ? `${(health.process.uptime_seconds / 3600).toFixed(1)}h` : `${(health.process.uptime_seconds / 60).toFixed(0)}m`}</span>
          <span>Threads: {health.process.thread_count}</span>
          {health.process.open_fds !== undefined && <span>FDs: {health.process.open_fds}</span>}
        </div>
      )}
    </div>
  );
}

function CardTitle({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--typography-font-size-sm)", fontWeight: 600, color: "var(--color-neutral-500)" }}>
      {icon} {text}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card variant="bordered" padding="sm">
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-neutral-500)" }}>
        {icon}
        <span style={{ fontSize: "var(--typography-font-size-xs)" }}>{label}</span>
      </div>
      <span style={{ fontSize: "var(--typography-font-size-2xl)", fontWeight: 700, color }}>{value}</span>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "var(--color-neutral-100)", borderRadius: "var(--border-radius-sm)", padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: "var(--typography-font-size-xl)", fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", marginTop: 2, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function BufferBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--typography-font-size-xs)", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "var(--color-neutral-500)" }}>{current} / {max}</span>
      </div>
      <ProgressBar value={pct} />
    </div>
  );
}

function formatNum(n: number | undefined): string {
  if (n === undefined) return "...";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
