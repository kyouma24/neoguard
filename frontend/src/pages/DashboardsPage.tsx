import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { SystemStats, Dashboard, PanelDefinition, MetricQueryResult } from "../types";
import { format } from "date-fns";
import {
  Activity,
  Database,
  Cpu,
  Edit2,
  HardDrive,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
  Zap,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  TrendingUp,
  Wifi,
  XCircle,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { TimeSeriesChart } from "../components/TimeSeriesChart";

type Tab = "system" | "dashboards";

export function DashboardsPage() {
  const [tab, setTab] = useState<Tab>("system");

  return (
    <div>
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "2px solid var(--border)" }}>
        <TabButton active={tab === "system"} onClick={() => setTab("system")}>
          <Activity size={16} /> System Monitor
        </TabButton>
        <TabButton active={tab === "dashboards"} onClick={() => setTab("dashboards")}>
          <LayoutDashboard size={16} /> My Dashboards
        </TabButton>
      </div>

      {tab === "system" && <SystemMonitorDashboard />}
      {tab === "dashboards" && <DashboardsList />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        border: "none",
        background: "none",
        color: active ? "var(--accent)" : "var(--text-muted)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        marginBottom: -2,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── System Monitor Dashboard ─────────────────────────────────────────────────

function SystemMonitorDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<{ status: string; degraded_reasons: string[]; checks: Record<string, string> } | null>(null);
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
    return <div className="card" style={{ padding: 40, textAlign: "center" }}>Loading system stats...</div>;
  }

  if (!stats) {
    return <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--danger)" }}>Failed to load system stats</div>;
  }

  const isHealthy = health?.status === "healthy";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>NeoGuard System Monitor</h2>
          <StatusBadge healthy={isHealthy} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Last: {format(lastRefresh, "HH:mm:ss")}
          </span>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
              background: autoRefresh ? "rgba(99, 91, 255, 0.1)" : "transparent",
              color: autoRefresh ? "var(--accent)" : "var(--text-muted)", fontSize: 12,
            }}
          >
            <RefreshCw size={12} className={autoRefresh ? "spin" : ""} />
            {autoRefresh ? "Auto 10s" : "Paused"}
          </button>
          <button
            onClick={fetchData}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer",
              background: "transparent", color: "var(--text-secondary)", fontSize: 12,
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Degraded Warning */}
      {health && health.degraded_reasons.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "4px solid var(--danger)", background: "rgba(239, 68, 68, 0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>
            <AlertTriangle size={16} /> System Degraded
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {health.degraded_reasons.map(r => r.replace(/_/g, " ")).join(", ")}
          </div>
        </div>
      )}

      {/* Top Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard icon={<Wifi size={16} />} label="Total Requests" value={fmt(stats.api.total_requests)} color="#635bff" />
        <StatCard icon={<XCircle size={16} />} label="Errors" value={fmt(stats.api.total_errors)} color={stats.api.total_errors > 0 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<Cpu size={16} />} label="CPU" value={`${stats.process.cpu_percent}%`} color={stats.process.cpu_percent > 80 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<HardDrive size={16} />} label="Memory" value={`${stats.process.memory_rss_mb} MB`} color="#3b82f6" />
        <StatCard icon={<Database size={16} />} label="Pool Active" value={`${stats.database.pool_active}/${stats.database.pool_max}`} color={stats.database.pool_utilization > 80 ? "#ef4444" : "#22c55e"} />
        <StatCard icon={<Clock size={16} />} label="Uptime" value={fmtUptime(stats.process.uptime_seconds)} color="#a855f7" />
      </div>

      {/* API Latency Section */}
      <SectionHeader icon={<Zap size={16} />} title="API Performance" />
      <div className="card" style={{ marginBottom: 20, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <Th>Endpoint</Th>
              <Th align="right">Requests</Th>
              <Th align="right">P50 (ms)</Th>
              <Th align="right">P95 (ms)</Th>
              <Th align="right">P99 (ms)</Th>
            </tr>
          </thead>
          <tbody>
            {stats.api.endpoints.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>No API traffic yet</td></tr>
            )}
            {stats.api.endpoints
              .sort((a, b) => b.request_count - a.request_count)
              .map((ep, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      display: "inline-block", width: 52, textAlign: "center", fontSize: 11, fontWeight: 700,
                      padding: "2px 6px", borderRadius: 4, marginRight: 8,
                      background: methodColor(ep.method), color: "#fff",
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

      {/* Database & Writers Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Database Pool */}
        <div>
          <SectionHeader icon={<Database size={16} />} title="Database Pool" />
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <MiniStat label="Size" value={stats.database.pool_size} />
              <MiniStat label="Active" value={stats.database.pool_active} highlight={stats.database.pool_active > stats.database.pool_max * 0.7} />
              <MiniStat label="Idle" value={stats.database.pool_idle} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>Utilization</span>
                <span>{stats.database.pool_utilization}%</span>
              </div>
              <ProgressBar value={stats.database.pool_utilization} />
            </div>
          </div>
        </div>

        {/* Process Info */}
        <div>
          <SectionHeader icon={<Server size={16} />} title="Process" />
          <div className="card">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <MiniStat label="Threads" value={stats.process.thread_count} />
              <MiniStat label="Open FDs" value={stats.process.open_fds ?? 0} />
              <MiniStat label="VMS (MB)" value={stats.process.memory_vms_mb ?? 0} />
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                <span>CPU</span>
                <span>{stats.process.cpu_percent}%</span>
              </div>
              <ProgressBar value={stats.process.cpu_percent} />
            </div>
          </div>
        </div>
      </div>

      {/* Writers Row */}
      <SectionHeader icon={<TrendingUp size={16} />} title="Batch Writers" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <WriterCard label="Metrics Writer" stats={stats.writers.metrics} target="TimescaleDB" />
        <WriterCard label="Logs Writer" stats={stats.writers.logs} target="ClickHouse" />
      </div>

      {/* Background Tasks */}
      <SectionHeader icon={<Activity size={16} />} title="Background Tasks" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        <TaskCard label="Discovery" stats={stats.background_tasks.orchestrator.discovery} running={stats.background_tasks.orchestrator.running} />
        <TaskCard label="Metrics Collection" stats={stats.background_tasks.orchestrator.metrics_collection} running={stats.background_tasks.orchestrator.running} />
        <TaskCard
          label="Alert Evaluation"
          stats={stats.background_tasks.alert_engine.eval}
          running={stats.background_tasks.alert_engine.running}
          extra={
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <MiniStat label="Rules Evaluated" value={stats.background_tasks.alert_engine.rules_evaluated} />
              <MiniStat label="Active Rules" value={stats.background_tasks.alert_engine.active_rules} />
              <MiniStat label="Notifications Sent" value={stats.background_tasks.alert_engine.notifications_sent} />
              <MiniStat label="Notif. Failed" value={stats.background_tasks.alert_engine.notifications_failed} highlight={stats.background_tasks.alert_engine.notifications_failed > 0} />
            </div>
          }
        />
      </div>

      {/* Database Checks */}
      {health && (
        <>
          <SectionHeader icon={<CheckCircle size={16} />} title="Connectivity Checks" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(health.checks).map(([name, status]) => (
              <div key={name} className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: status === "ok" ? "var(--success)" : "var(--danger)",
                }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{name}</div>
                  <div style={{ fontSize: 11, color: status === "ok" ? "var(--success)" : "var(--danger)" }}>{status}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Reusable Components ──────────────────────────────────────────────────────

function StatusBadge({ healthy }: { healthy: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px",
      borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: healthy ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
      color: healthy ? "var(--success)" : "var(--danger)",
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {healthy ? "Healthy" : "Degraded"}
    </span>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ color }}>{icon}</div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: highlight ? "var(--danger)" : "var(--text-primary)" }}>{fmt(value)}</div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped > 80 ? "var(--danger)" : clamped > 50 ? "var(--warning)" : "var(--success)";
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--bg-tertiary)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped}%`, borderRadius: 3, background: color, transition: "width 0.5s" }} />
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, color: "var(--text-secondary)" }}>
      {icon}
      <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{title}</h3>
    </div>
  );
}

function WriterCard({ label, stats, target }: { label: string; stats: import("../types").WriterStats; target: string }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 8px", background: "var(--bg-tertiary)", borderRadius: 4 }}>{target}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <MiniStat label="Buffer" value={stats.buffer_size} highlight={stats.buffer_size > 1000} />
        <MiniStat label="Written" value={stats.total_written} />
        <MiniStat label="Dropped" value={stats.total_dropped} highlight={stats.total_dropped > 0} />
        <MiniStat label="Flushes" value={stats.flush_count} />
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Flush Latency</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}><LatencyBadge ms={stats.last_flush_duration_ms} /></div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ label, stats, running, extra }: { label: string; stats: import("../types").TaskRunStats; running: boolean; extra?: React.ReactNode }) {
  const hasErrors = stats.consecutive_errors > 0;
  return (
    <div className="card" style={{ borderLeft: hasErrors ? "3px solid var(--danger)" : running ? "3px solid var(--success)" : "3px solid var(--text-muted)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 4,
          background: hasErrors ? "rgba(239, 68, 68, 0.1)" : running ? "rgba(34, 197, 94, 0.1)" : "rgba(100,100,100,0.1)",
          color: hasErrors ? "var(--danger)" : running ? "var(--success)" : "var(--text-muted)",
        }}>
          {hasErrors ? `${stats.consecutive_errors} errors` : running ? "Running" : "Stopped"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <MiniStat label="Successes" value={stats.success_count} />
        <MiniStat label="Failures" value={stats.failure_count} highlight={stats.failure_count > 0} />
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Duration</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}><LatencyBadge ms={stats.last_duration_ms} /></div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 2 }}>Last Run</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
            {stats.last_run_at > 0 ? format(new Date(stats.last_run_at * 1000), "HH:mm:ss") : "Never"}
          </div>
        </div>
      </div>
      {extra}
    </div>
  );
}

function LatencyBadge({ ms }: { ms: number }) {
  const color = ms > 1000 ? "var(--danger)" : ms > 200 ? "var(--warning)" : "var(--success)";
  const display = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(1)}ms`;
  return <span style={{ color, fontWeight: 600, fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: 13 }}>{display}</span>;
}

function Th({ children, align }: { children: React.ReactNode; align?: string }) {
  return (
    <th style={{ padding: "10px 12px", textAlign: (align as CanvasTextAlign) || "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.3px" }}>
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

// ─── Dashboards CRUD ─────────────────────────────────────────────────────────

type DashView =
  | { kind: "list" }
  | { kind: "view"; dashboard: Dashboard }
  | { kind: "edit"; dashboard: Dashboard };

function DashboardsList() {
  const { data: dashboards, refetch } = useApi<Dashboard[]>(() => api.dashboards.list(), []);
  const [view, setView] = useState<DashView>({ kind: "list" });
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (name: string, description: string) => {
    try {
      const d = await api.dashboards.create({ name, description, panels: [] });
      setShowCreate(false);
      refetch();
      setView({ kind: "edit", dashboard: d });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.dashboards.delete(id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (view.kind === "view") {
    return (
      <DashboardViewer
        dashboard={view.dashboard}
        onBack={() => { setView({ kind: "list" }); refetch(); }}
        onEdit={() => setView({ kind: "edit", dashboard: view.dashboard })}
      />
    );
  }

  if (view.kind === "edit") {
    return (
      <DashboardEditor
        dashboard={view.dashboard}
        onBack={() => { setView({ kind: "list" }); refetch(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Dashboards</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Dashboard
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--error)", borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--error)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {dashboards?.map((d) => (
          <div key={d.id} className="card" style={{ position: "relative" }}>
            <div
              style={{ cursor: "pointer" }}
              onClick={() => setView({ kind: "view", dashboard: d })}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <LayoutDashboard size={18} color="var(--accent)" />
                <span style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</span>
              </div>
              {d.description && (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>{d.description}</p>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                <span>{d.panels.length} panel{d.panels.length !== 1 ? "s" : ""}</span>
                <span>Updated {format(new Date(d.updated_at), "MMM d, yyyy")}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setView({ kind: "edit", dashboard: d })}>
                <Edit2 size={12} /> Edit
              </button>
              {deleteConfirm === d.id ? (
                <>
                  <button className="btn btn-danger" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => handleDelete(d.id)}>Confirm Delete</button>
                  <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
                </>
              ) : (
                <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setDeleteConfirm(d.id)}>
                  <Trash2 size={12} color="var(--error)" />
                </button>
              )}
            </div>
          </div>
        ))}
        {dashboards?.length === 0 && (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            <LayoutDashboard size={48} />
            <p>No dashboards yet. Click "New Dashboard" to create one.</p>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDashboardModal
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CreateDashboardModal({ onSave, onClose }: { onSave: (name: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: 450, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>New Dashboard</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dashboard name" autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Description (optional)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this dashboard shows" />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(name, description)} disabled={!name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Viewer ────────────────────────────────────────────────────────

function DashboardViewer({ dashboard, onBack, onEdit }: { dashboard: Dashboard; onBack: () => void; onEdit: () => void }) {
  const [timeRange] = useState(60);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={onBack} style={{ padding: "6px 8px" }}><ArrowLeft size={16} /></button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{dashboard.name}</h2>
            {dashboard.description && <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{dashboard.description}</p>}
          </div>
        </div>
        <button className="btn" onClick={onEdit}><Edit2 size={14} /> Edit</button>
      </div>

      {dashboard.panels.length === 0 ? (
        <div className="empty-state">
          <LayoutDashboard size={48} />
          <p>No panels yet. Click Edit to add panels.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 16 }}>
          {dashboard.panels.map((panel) => (
            <PanelCard key={panel.id} panel={panel} timeRange={timeRange} />
          ))}
        </div>
      )}
    </div>
  );
}

function PanelCard({ panel, timeRange }: { panel: PanelDefinition; timeRange: number }) {
  const now = new Date();
  const start = new Date(now.getTime() - timeRange * 60_000);

  const { data } = useApi<MetricQueryResult[]>(
    () => panel.metric_name
      ? api.metrics.query({
          name: panel.metric_name,
          tags: panel.tags ?? {},
          start: start.toISOString(),
          end: now.toISOString(),
          interval: timeRange <= 60 ? "1m" : "5m",
          aggregation: panel.aggregation ?? "avg",
        })
      : Promise.resolve([]),
    [panel.metric_name, timeRange],
  );

  const colSpan = panel.width || 6;

  return (
    <div className="card" style={{ gridColumn: `span ${colSpan}` }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{panel.title}</div>
      {panel.panel_type === "timeseries" && panel.metric_name ? (
        <TimeSeriesChart data={data ?? []} height={(panel.height || 4) * 50} />
      ) : panel.panel_type === "stat" && data && data.length > 0 ? (
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--accent)", textAlign: "center", padding: 20 }}>
          {data[0].datapoints.length > 0
            ? (data[0].datapoints[data[0].datapoints.length - 1][1] ?? 0).toFixed(2)
            : "—"}
        </div>
      ) : (
        <div style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: 20 }}>
          {panel.metric_name ? "No data" : "No metric configured"}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Editor ────────────────────────────────────────────────────────

function DashboardEditor({ dashboard, onBack }: { dashboard: Dashboard; onBack: () => void }) {
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description);
  const [panels, setPanels] = useState<PanelDefinition[]>(dashboard.panels);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [editingPanel, setEditingPanel] = useState<PanelDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: metricNames } = useApi<string[]>(() => api.metrics.names(), []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.dashboards.update(dashboard.id, { name, description, panels });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // keep editing
    } finally {
      setSaving(false);
    }
  };

  const addPanel = (panel: PanelDefinition) => {
    setPanels([...panels, panel]);
    setShowAddPanel(false);
  };

  const updatePanel = (updated: PanelDefinition) => {
    setPanels(panels.map((p) => (p.id === updated.id ? updated : p)));
    setEditingPanel(null);
  };

  const removePanel = (id: string) => {
    setPanels(panels.filter((p) => p.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn" onClick={onBack} style={{ padding: "6px 8px" }}><ArrowLeft size={16} /></button>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Edit Dashboard</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "var(--success)" }}>Saved!</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Dashboard"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Description</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Panels ({panels.length})</h3>
        <button className="btn" onClick={() => setShowAddPanel(true)}>
          <Plus size={14} /> Add Panel
        </button>
      </div>

      {panels.length === 0 ? (
        <div className="empty-state" style={{ border: "2px dashed var(--border)", borderRadius: "var(--radius)" }}>
          <LayoutDashboard size={48} />
          <p>No panels yet. Click "Add Panel" to start building your dashboard.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
          {panels.map((panel) => (
            <div key={panel.id} className="card" style={{ gridColumn: `span ${panel.width || 6}`, position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{panel.title}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn" style={{ padding: "2px 6px" }} onClick={() => setEditingPanel(panel)}><Edit2 size={12} /></button>
                  <button className="btn" style={{ padding: "2px 6px" }} onClick={() => removePanel(panel.id)}><Trash2 size={12} color="var(--error)" /></button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {panel.panel_type} | {panel.metric_name || "no metric"} | {panel.aggregation || "avg"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Width: {panel.width}/12
              </div>
            </div>
          ))}
        </div>
      )}

      {(showAddPanel || editingPanel) && (
        <PanelEditorModal
          existing={editingPanel}
          metricNames={metricNames ?? []}
          onSave={(p) => editingPanel ? updatePanel(p) : addPanel(p)}
          onClose={() => { setShowAddPanel(false); setEditingPanel(null); }}
        />
      )}
    </div>
  );
}

function PanelEditorModal({
  existing,
  metricNames,
  onSave,
  onClose,
}: {
  existing: PanelDefinition | null;
  metricNames: string[];
  onSave: (panel: PanelDefinition) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [panelType, setPanelType] = useState<PanelDefinition["panel_type"]>(existing?.panel_type ?? "timeseries");
  const [metricName, setMetricName] = useState(existing?.metric_name ?? "");
  const [metricSearch, setMetricSearch] = useState("");
  const [aggregation, setAggregation] = useState(existing?.aggregation ?? "avg");
  const [width, setWidth] = useState(existing?.width ?? 6);
  const [height, setHeight] = useState(existing?.height ?? 4);

  const filteredMetrics = metricSearch
    ? metricNames.filter((n) => n.toLowerCase().includes(metricSearch.toLowerCase())).slice(0, 30)
    : metricNames.slice(0, 30);

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60_000);
  const { data: preview } = useApi<MetricQueryResult[]>(
    () => metricName
      ? api.metrics.query({ name: metricName, start: start.toISOString(), end: now.toISOString(), interval: "1m", aggregation })
      : Promise.resolve([]),
    [metricName, aggregation],
  );

  const handleSave = () => {
    onSave({
      id: existing?.id ?? `panel-${Date.now()}`,
      title: title || metricName || "Untitled",
      panel_type: panelType as PanelDefinition["panel_type"],
      metric_name: metricName,
      tags: existing?.tags ?? {},
      aggregation,
      width,
      height,
      position_x: existing?.position_x ?? 0,
      position_y: existing?.position_y ?? 0,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: 700, maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{existing ? "Edit Panel" : "Add Panel"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={20} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Panel Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., CPU Usage" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Panel Type</label>
              <select className="select" style={{ width: "100%" }} value={panelType} onChange={(e) => setPanelType(e.target.value as PanelDefinition["panel_type"])}>
                <option value="timeseries">Time Series Chart</option>
                <option value="stat">Single Stat</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Aggregation</label>
              <select className="select" style={{ width: "100%" }} value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
                {["avg", "min", "max", "sum", "count"].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Metric</label>
            <input
              className="input"
              value={metricName || metricSearch}
              onChange={(e) => { setMetricSearch(e.target.value); setMetricName(e.target.value); }}
              placeholder="Search metrics..."
            />
            {metricSearch && filteredMetrics.length > 0 && (
              <div style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
                {filteredMetrics.map((n) => (
                  <div key={n} style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-secondary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setMetricName(n); setMetricSearch(""); }}>
                    <code>{n}</code>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Width (1-12 columns)</label>
              <input className="input" type="number" min={1} max={12} value={width} onChange={(e) => setWidth(parseInt(e.target.value) || 6)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Height (multiplier)</label>
              <input className="input" type="number" min={1} max={12} value={height} onChange={(e) => setHeight(parseInt(e.target.value) || 4)} />
            </div>
          </div>

          {/* Live Preview */}
          {metricName && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Preview (last 1h)</label>
              <div className="card" style={{ padding: 12 }}>
                {panelType === "stat" && preview && preview.length > 0 ? (
                  <div style={{ fontSize: 32, fontWeight: 700, color: "var(--accent)", textAlign: "center", padding: 12 }}>
                    {preview[0].datapoints.length > 0
                      ? (preview[0].datapoints[preview[0].datapoints.length - 1][1] ?? 0).toFixed(2)
                      : "—"}
                  </div>
                ) : (
                  <TimeSeriesChart data={preview ?? []} height={180} />
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!title.trim() && !metricName.trim()}>
            {existing ? "Update Panel" : "Add Panel"}
          </button>
        </div>
      </div>
    </div>
  );
}
