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
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>System Overview</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className={`btn ${autoRefresh ? "btn-primary" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ fontSize: 12, padding: "6px 10px" }}
          >
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
          </button>
          <button className="btn" onClick={refetchAll} style={{ padding: 6 }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Degraded Warning */}
      {health?.status === "degraded" && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--error)",
            borderRadius: "var(--radius)",
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--error)",
            fontSize: 14,
          }}
        >
          <AlertTriangle size={16} />
          <span style={{ fontWeight: 600 }}>System Degraded</span>
          {health.degraded_reasons.length > 0 && (
            <span style={{ color: "var(--text-secondary)" }}>
              {" "}
              — {health.degraded_reasons.join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Top Stat Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          icon={<Activity size={18} />}
          label="Status"
          value={health?.status ?? "..."}
          color={
            health?.status === "healthy" ? "var(--success)" : "var(--warning)"
          }
        />
        <StatCard
          icon={<Server size={18} />}
          label="Resources"
          value={formatNum(resourceSummary?.total)}
          color="var(--accent)"
        />
        <StatCard
          icon={<TrendingUp size={18} />}
          label="Metrics Written"
          value={formatNum(health?.writers.metrics.total_written)}
          color="var(--accent)"
        />
        <StatCard
          icon={<FileText size={18} />}
          label="Logs Written"
          value={formatNum(health?.writers.logs.total_written)}
          color="var(--info)"
        />
        <StatCard
          icon={<Bell size={18} />}
          label="Firing Alerts"
          value={firingAlerts.length}
          color={firingAlerts.length > 0 ? "var(--error)" : "var(--success)"}
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Dropped"
          value={formatNum(
            (health?.writers.metrics.total_dropped ?? 0) +
              (health?.writers.logs.total_dropped ?? 0),
          )}
          color={
            (health?.writers.metrics.total_dropped ?? 0) > 0
              ? "var(--error)"
              : "var(--success)"
          }
        />
      </div>

      {/* Main Content Grid — 2 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* CPU Chart */}
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              CPU Usage (%)
            </h3>
            <div style={{ display: "flex", gap: 4 }}>
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.minutes}
                  className="btn"
                  onClick={() => setTimeRange(tr.minutes)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 11,
                    background:
                      timeRange === tr.minutes
                        ? "var(--accent)"
                        : "var(--bg-tertiary)",
                    color:
                      timeRange === tr.minutes ? "#fff" : "var(--text-muted)",
                    borderColor:
                      timeRange === tr.minutes
                        ? "var(--accent)"
                        : "var(--border)",
                  }}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
          <TimeSeriesChart data={cpuMetrics ?? []} height={200} />
        </div>

        {/* Memory Chart */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 12,
            }}
          >
            Memory RSS (MB)
          </h3>
          <TimeSeriesChart data={memMB} height={200} />
        </div>
      </div>

      {/* Second Row — 3 columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Resources by Provider */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Cloud size={16} /> Resources by Provider
          </h3>
          {resourceSummary?.by_provider &&
          Object.keys(resourceSummary.by_provider).length > 0 ? (
            <>
              {Object.entries(resourceSummary.by_provider)
                .sort(([, a], [, b]) => b - a)
                .map(([provider, count]) => {
                  const pct =
                    resourceSummary.total > 0
                      ? (count / resourceSummary.total) * 100
                      : 0;
                  return (
                    <div key={provider} style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>
                          {PROVIDER_LABELS[provider] ?? provider}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          background: "var(--bg-tertiary)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            background:
                              PROVIDER_COLORS[provider] ?? "var(--accent)",
                            borderRadius: 3,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              <div
                style={{
                  paddingTop: 8,
                  borderTop: "1px solid var(--border)",
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Total</span>
                <span style={{ fontWeight: 700 }}>{resourceSummary.total}</span>
              </div>
            </>
          ) : (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                textAlign: "center",
                padding: 24,
              }}
            >
              No resources discovered
            </div>
          )}
        </div>

        {/* Database & Writer Health */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Database size={16} /> System Health
          </h3>
          {health?.checks ? (
            <>
              {Object.entries(health.checks).map(([name, status]) => (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <span>{name}</span>
                  <span
                    className={
                      status === "ok" ? "badge badge-success" : "badge badge-error"
                    }
                  >
                    {status}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                  }}
                >
                  <span>DB Pool</span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {health.pool.active} active / {health.pool.size} total
                  </span>
                </div>
                <ProgressBar
                  value={health.pool.utilization * 100}
                  color={
                    health.pool.utilization > 0.8
                      ? "var(--error)"
                      : health.pool.utilization > 0.5
                        ? "var(--warning)"
                        : "var(--success)"
                  }
                />
              </div>
              <div style={{ marginTop: 12 }}>
                <BufferBar
                  label="Metric Buffer"
                  current={health.writers.metrics.buffer_size}
                  max={5000}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <BufferBar
                  label="Log Buffer"
                  current={health.writers.logs.buffer_size}
                  max={2000}
                />
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Loading...
            </div>
          )}
        </div>

        {/* Resource Inventory by Type */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Server size={16} /> Resource Inventory
          </h3>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {resourceSummary?.by_type &&
            Object.keys(resourceSummary.by_type).length > 0 ? (
              Object.entries(resourceSummary.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div
                    key={type}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "5px 0",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ textTransform: "uppercase" }}>{type}</span>
                    <span style={{ fontWeight: 600, color: "var(--accent)" }}>
                      {count}
                    </span>
                  </div>
                ))
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No resources
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Third Row — Alert Summary + Recent Events */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 16,
        }}
      >
        {/* Alert Summary */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertTriangle size={16} /> Alert Summary
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <MiniStat label="Total Rules" value={totalRules} color="var(--text-primary)" />
            <MiniStat
              label="Enabled"
              value={enabledRules}
              color="var(--success)"
            />
            <MiniStat
              label="Firing"
              value={firingAlerts.length}
              color={firingAlerts.length > 0 ? "var(--error)" : "var(--success)"}
            />
            <MiniStat
              label="Notifications Sent"
              value={
                health?.background_tasks.alert_engine.notifications_sent ?? 0
              }
              color="var(--info)"
            />
          </div>
          {firingAlerts.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--error)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                }}
              >
                Currently Firing
              </div>
              {firingAlerts.map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{ color: "var(--error)", fontWeight: 500 }}
                      title={evt.message}
                    >
                      {evt.message.length > 60
                        ? evt.message.slice(0, 60) + "..."
                        : evt.message}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Since{" "}
                    {formatDistanceToNow(new Date(evt.fired_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Alert Events */}
        <div className="card">
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 16,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Bell size={16} /> Recent Alert Events
          </h3>
          {recentEvents.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-muted)",
                      fontSize: 12,
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      Status
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>
                      Message
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Value
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Threshold
                    </th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>
                      Fired
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((evt) => (
                    <tr
                      key={evt.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "6px 8px" }}>
                        <span
                          className={`badge ${evt.status === "firing" ? "badge-error" : evt.status === "resolved" ? "badge-success" : "badge-warning"}`}
                        >
                          {evt.status}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          maxWidth: 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={evt.message}
                      >
                        {evt.message}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          fontFamily: "monospace",
                        }}
                      >
                        {evt.value.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          color: "var(--text-muted)",
                        }}
                      >
                        {evt.threshold}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          textAlign: "right",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {format(new Date(evt.fired_at), "MMM dd HH:mm")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                textAlign: "center",
                padding: 32,
              }}
            >
              No alert events yet
            </div>
          )}
        </div>
      </div>

      {/* Process Info Footer */}
      {health?.process && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 24,
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "8px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span>CPU: {health.process.cpu_percent.toFixed(1)}%</span>
          <span>Memory: {health.process.memory_rss_mb.toFixed(0)} MB</span>
          <span>
            Uptime:{" "}
            {health.process.uptime_seconds > 86400
              ? `${(health.process.uptime_seconds / 86400).toFixed(1)}d`
              : health.process.uptime_seconds > 3600
                ? `${(health.process.uptime_seconds / 3600).toFixed(1)}h`
                : `${(health.process.uptime_seconds / 60).toFixed(0)}m`}
          </span>
          <span>Threads: {health.process.thread_count}</span>
          {health.process.open_fds !== undefined && (
            <span>FDs: {health.process.open_fds}</span>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-secondary)",
        }}
      >
        {icon}
        <span style={{ fontSize: 12 }}>{label}</span>
      </div>
      <span style={{ fontSize: 24, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-tertiary)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function BufferBar({
  label,
  current,
  max,
}: {
  label: string;
  current: number;
  max: number;
}) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 3,
        }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>
          {current} / {max}
        </span>
      </div>
      <ProgressBar
        value={pct}
        color={pct > 80 ? "var(--warning)" : "var(--accent)"}
      />
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        height: 6,
        background: "var(--bg-tertiary)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, value)}%`,
          background: color,
          borderRadius: 3,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

function formatNum(n: number | undefined): string {
  if (n === undefined) return "...";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
