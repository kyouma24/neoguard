import { useState, useEffect, useCallback } from "react";
import type { SystemStats } from "../../types";
import { api } from "../../services/api";
import { format } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  TrendingUp,
  Wifi,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Button,
  Card,
  ProgressBar as DSProgressBar,
  StatusBadge as DSStatusBadge,
} from "../../design-system";

export function SystemMonitorDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<{ status: string; degraded_reasons?: string[]; checks: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.system.stats(), api.health()]);
      setStats(s);
      setHealth(h);
      setLastRefresh(new Date());
    } catch {
      // keep stale data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  if (loading && !stats) {
    return <Card variant="bordered" padding="md"><div style={{ padding: 40, textAlign: "center" }}>Loading system stats...</div></Card>;
  }

  if (!stats) {
    return <Card variant="bordered" padding="md"><div style={{ padding: 40, textAlign: "center", color: "var(--color-danger-500)" }}>Failed to load system stats</div></Card>;
  }

  const isHealthy = health?.status === "healthy";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>NeoGuard System Monitor</h2>
          <DSStatusBadge
            label={isHealthy ? "Healthy" : "Degraded"}
            tone={isHealthy ? "success" : "danger"}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--color-neutral-400)" }}>
            Last: {format(lastRefresh, "HH:mm:ss")}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            <RefreshCw size={12} className={autoRefresh ? "spin" : ""} />
            {autoRefresh ? "Auto 10s" : "Paused"}
          </Button>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      {health && (health.degraded_reasons?.length ?? 0) > 0 && (
        <Card variant="bordered" padding="md">
          <div style={{ borderLeft: "4px solid var(--color-danger-500)", paddingLeft: 12, background: "rgba(239, 68, 68, 0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--color-danger-500)", marginBottom: 6 }}>
              <AlertTriangle size={16} /> System Degraded
            </div>
            <div style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>
              {(health.degraded_reasons ?? []).map(r => r.replace(/_/g, " ")).join(", ")}
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard icon={<Wifi size={16} />} label="Total Requests" value={fmt(stats.api.total_requests)} color="#635bff" />
        <StatCard icon={<XCircle size={16} />} label="Errors" value={fmt(stats.api.total_errors)} color={stats.api.total_errors > 0 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<Cpu size={16} />} label="CPU" value={`${stats.process.cpu_percent}%`} color={stats.process.cpu_percent > 80 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<HardDrive size={16} />} label="Memory" value={`${stats.process.memory_rss_mb} MB`} color="#3b82f6" />
        <StatCard icon={<Database size={16} />} label="Pool Active" value={`${stats.database.pool_active}/${stats.database.pool_max}`} color={stats.database.pool_utilization > 80 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<Clock size={16} />} label="Uptime" value={fmtUptime(stats.process.uptime_seconds)} color="#a855f7" />
      </div>

      <SectionHeader icon={<Zap size={16} />} title="API Performance" />
      <Card variant="bordered" padding="md">
        <div style={{ marginBottom: 20, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <Th>Endpoint</Th>
                <Th align="right">Requests</Th>
                <Th align="right">P50 (ms)</Th>
                <Th align="right">P95 (ms)</Th>
                <Th align="right">P99 (ms)</Th>
              </tr>
            </thead>
            <tbody>
              {stats.api.endpoints.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--color-neutral-400)" }}>No API traffic yet</td></tr>
              )}
              {stats.api.endpoints
                .sort((a, b) => b.request_count - a.request_count)
                .map((ep, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        display: "inline-block", width: 52, textAlign: "center", fontSize: 11, fontWeight: 700,
                        padding: "2px 6px", borderRadius: 4, marginRight: 8,
                        background: methodColor(ep.method), color: "var(--text-on-accent)",
                      }}>
                        {ep.method}
                      </span>
                      <span style={{ fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: 12 }}>
                        {ep.path_pattern}
                      </span>
                    </td>
                    <Td align="right">{fmt(ep.request_count)}</Td>
                    <Td align="right"><LatencyBadge ms={ep.latency_p50} /></Td>
                    <Td align="right"><LatencyBadge ms={ep.latency_p95} /></Td>
                    <Td align="right"><LatencyBadge ms={ep.latency_p99} /></Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div>
          <SectionHeader icon={<Database size={16} />} title="Database Pool" />
          <Card variant="bordered" padding="md">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <MiniStat label="Size" value={stats.database.pool_size} />
              <MiniStat label="Active" value={stats.database.pool_active} highlight={stats.database.pool_active > stats.database.pool_max * 0.7} />
              <MiniStat label="Idle" value={stats.database.pool_idle} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-neutral-400)", marginBottom: 4 }}>
                <span>Utilization</span>
                <span>{stats.database.pool_utilization}%</span>
              </div>
              <DSProgressBar value={stats.database.pool_utilization} />
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader icon={<Server size={16} />} title="Process" />
          <Card variant="bordered" padding="md">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <MiniStat label="Threads" value={stats.process.thread_count} />
              <MiniStat label="Open FDs" value={stats.process.open_fds ?? 0} />
              <MiniStat label="VMS (MB)" value={stats.process.memory_vms_mb ?? 0} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-neutral-400)", marginBottom: 4 }}>
                <span>CPU</span>
                <span>{stats.process.cpu_percent}%</span>
              </div>
              <DSProgressBar value={stats.process.cpu_percent} />
            </div>
          </Card>
        </div>
      </div>

      <SectionHeader icon={<TrendingUp size={16} />} title="Batch Writers" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <WriterCard label="Metrics Writer" stats={stats.writers.metrics} target="TimescaleDB" />
        <WriterCard label="Logs Writer" stats={stats.writers.logs} target="ClickHouse" />
      </div>

      <SectionHeader icon={<Activity size={16} />} title="Background Tasks" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        <TaskCard label="Discovery" stats={stats.background_tasks.orchestrator.discovery} running={stats.background_tasks.orchestrator.running} />
        <TaskCard label="Metrics Collection" stats={stats.background_tasks.orchestrator.metrics_collection} running={stats.background_tasks.orchestrator.running} />
        <TaskCard
          label="Alert Evaluation"
          stats={stats.background_tasks.alert_engine.eval}
          running={stats.background_tasks.alert_engine.running}
          extra={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-neutral-200)" }}>
              <MiniStat label="Rules Evaluated" value={stats.background_tasks.alert_engine.rules_evaluated} />
              <MiniStat label="Active Rules" value={stats.background_tasks.alert_engine.active_rules} />
              <MiniStat label="Notifications Sent" value={stats.background_tasks.alert_engine.notifications_sent} />
              <MiniStat label="Notif. Failed" value={stats.background_tasks.alert_engine.notifications_failed} highlight={stats.background_tasks.alert_engine.notifications_failed > 0} />
            </div>
          }
        />
      </div>

      {health && (
        <>
          <SectionHeader icon={<CheckCircle size={16} />} title="Connectivity Checks" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(health.checks).map(([name, status]) => (
              <Card key={name} variant="bordered" padding="sm">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%",
                    background: status === "ok" ? "var(--color-success-500)" : "var(--color-danger-500)",
                  }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{name}</div>
                    <div style={{ fontSize: 11, color: status === "ok" ? "var(--color-success-500)" : "var(--color-danger-500)" }}>{status}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card variant="bordered" padding="sm">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-neutral-900)" }}>{value}</div>
    </Card>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: highlight ? "var(--color-danger-500)" : "var(--color-neutral-900)" }}>{fmt(value)}</div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--color-neutral-500)" }}>
      {icon}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
    </div>
  );
}

function WriterCard({ label, stats, target }: { label: string; stats: import("../../types").WriterStats; target: string }) {
  return (
    <Card variant="bordered" padding="md">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--color-neutral-400)", padding: "2px 8px", background: "var(--color-neutral-100)", borderRadius: 4 }}>{target}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MiniStat label="Buffer" value={stats.buffer_size} highlight={stats.buffer_size > 1000} />
        <MiniStat label="Written" value={stats.total_written} />
        <MiniStat label="Dropped" value={stats.total_dropped} highlight={stats.total_dropped > 0} />
        <MiniStat label="Flushes" value={stats.flush_count} />
        <div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Flush Latency</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}><LatencyBadge ms={stats.last_flush_duration_ms} /></div>
        </div>
      </div>
    </Card>
  );
}

function TaskCard({ label, stats, running, extra }: { label: string; stats: import("../../types").TaskRunStats; running: boolean; extra?: React.ReactNode }) {
  const hasErrors = stats.consecutive_errors > 0;
  return (
    <Card variant="bordered" padding="md">
      <div style={{ borderLeft: hasErrors ? "3px solid var(--color-danger-500)" : running ? "3px solid var(--color-success-500)" : "3px solid var(--color-neutral-400)", paddingLeft: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4,
            background: hasErrors ? "rgba(239, 68, 68, 0.1)" : running ? "rgba(34, 197, 94, 0.1)" : "rgba(100,100,100,0.1)",
            color: hasErrors ? "var(--color-danger-500)" : running ? "var(--color-success-500)" : "var(--color-neutral-400)",
          }}>
            {hasErrors ? `${stats.consecutive_errors} errors` : running ? "Running" : "Stopped"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <MiniStat label="Successes" value={stats.success_count} />
          <MiniStat label="Failures" value={stats.failure_count} highlight={stats.failure_count > 0} />
          <div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Duration</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}><LatencyBadge ms={stats.last_duration_ms} /></div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Last Run</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-neutral-900)" }}>
              {stats.last_run_at > 0 ? format(new Date(stats.last_run_at * 1000), "HH:mm:ss") : "Never"}
            </div>
          </div>
        </div>
        {extra}
      </div>
    </Card>
  );
}

function LatencyBadge({ ms }: { ms: number }) {
  const color = ms > 1000 ? "var(--color-danger-500)" : ms > 200 ? "var(--color-warning-500)" : "var(--color-success-500)";
  const display = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(1)}ms`;
  return <span style={{ color, fontWeight: 600, fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: 13 }}>{display}</span>;
}

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{ padding: "10px 12px", textAlign: (align as CanvasTextAlign) || "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-neutral-400)", letterSpacing: "0.3px" }}>
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: string }) {
  return <td style={{ padding: "10px 12px", textAlign: (align as CanvasTextAlign) || "left" }}>{children}</td>;
}

function methodColor(method: string): string {
  const map: Record<string, string> = { GET: "#22c55e", POST: "#3b82f6", PATCH: "#f59e0b", DELETE: "#ef4444", PUT: "#a855f7", HEAD: "#6b7280" };
  return map[method] || "#6b7280";
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}
