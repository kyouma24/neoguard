import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { api, formatError } from "../services/api";
import type { SystemStats, Dashboard, PanelDefinition, PanelType } from "../types";
import { format } from "date-fns";
import {
  Activity,
  Copy,
  Database,
  Cpu,
  Edit2,
  GripVertical,
  HardDrive,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Zap,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  TrendingUp,
  Wifi,
  XCircle,
  X,
} from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { WidgetRenderer } from "../components/dashboard/WidgetRenderer";
import { TimeRangePicker, getTimeRange, getIntervalForRange } from "../components/dashboard/TimeRangePicker";
import { AutoRefresh, getRefreshSeconds } from "../components/dashboard/AutoRefresh";
import {
  Button,
  Card,
  Input,
  NativeSelect,
  Tabs,
  Modal,
  ConfirmDialog,
  EmptyState,
  ProgressBar as DSProgressBar,
  StatusBadge as DSStatusBadge,
} from "../design-system";
import { GridLayout, type Layout as GridLayoutType } from "react-grid-layout";

type Tab = "system" | "dashboards";

export function DashboardsPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_super_admin || false;
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = isAdmin ? "system" : "dashboards";
  const tab = (searchParams.get("tab") as Tab) || defaultTab;
  const setTab = useCallback((t: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === defaultTab) next.delete("tab"); else next.set("tab", t);
      return next;
    }, { replace: true });
  }, [setSearchParams, defaultTab]);

  const tabItems = isAdmin
    ? [
        {
          id: "system" as const,
          label: "System Monitor",
          content: <SystemMonitorDashboard />,
        },
        {
          id: "dashboards" as const,
          label: "My Dashboards",
          content: <DashboardsList />,
        },
      ]
    : [
        {
          id: "dashboards" as const,
          label: "My Dashboards",
          content: <DashboardsList />,
        },
      ];

  return (
    <div>
      <Tabs
        tabs={tabItems}
        activeTab={tab}
        onChange={(tabId) => setTab(tabId as Tab)}
        variant="line"
      />
    </div>
  );
}

// ─── System Monitor Dashboard ─────────────────────────────────────────────────

function SystemMonitorDashboard() {
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
      {/* Header */}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw size={12} className={autoRefresh ? "spin" : ""} />
            {autoRefresh ? "Auto 10s" : "Paused"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
          >
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </div>

      {/* Degraded Warning */}
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
      </Card>

      {/* Database & Writers Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Database Pool */}
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

        {/* Process Info */}
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-neutral-200)" }}>
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

// ─── Reusable Components ──────────────────────────────────────────────────────

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

function WriterCard({ label, stats, target }: { label: string; stats: import("../types").WriterStats; target: string }) {
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

function TaskCard({ label, stats, running, extra }: { label: string; stats: import("../types").TaskRunStats; running: boolean; extra?: React.ReactNode }) {
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

// ─── Dashboards CRUD ─────────────────────────────────────────────────────────

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 60;

type DashView =
  | { kind: "list" }
  | { kind: "view"; dashboard: Dashboard }
  | { kind: "edit"; dashboard: Dashboard };

function DashboardsList() {
  const { canCreate, canEdit, canDelete } = usePermissions();
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
      setError(formatError(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.dashboards.delete(id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const d = await api.dashboards.duplicate(id);
      refetch();
      setView({ kind: "edit", dashboard: d });
    } catch (e) {
      setError(formatError(e));
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

  const dashboardToDelete = deleteConfirm ? dashboards?.find(d => d.id === deleteConfirm) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Dashboards</h2>
        {canCreate && (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Dashboard
          </Button>
        )}
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-md)", padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--color-danger-500)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}><X size={14} /></Button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {dashboards?.map((d) => (
          <Card key={d.id} variant="bordered" padding="md">
            <div style={{ position: "relative" }}>
              <div
                style={{ cursor: "pointer" }}
                onClick={() => setView({ kind: "view", dashboard: d })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <LayoutDashboard size={18} color="var(--color-primary-500)" />
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</span>
                </div>
                {d.description && (
                  <p style={{ fontSize: 13, color: "var(--color-neutral-500)", marginBottom: 12 }}>{d.description}</p>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-neutral-400)" }}>
                  <span>{d.panels.length} panel{d.panels.length !== 1 ? "s" : ""}</span>
                  <span>Updated {format(new Date(d.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              {(canEdit || canDelete) && (
                <div style={{ display: "flex", gap: 4, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-neutral-200)" }}>
                  {canEdit && (
                    <Button variant="secondary" size="sm" onClick={() => setView({ kind: "edit", dashboard: d })}>
                      <Edit2 size={12} /> Edit
                    </Button>
                  )}
                  {canCreate && (
                    <Button variant="ghost" size="sm" onClick={() => handleDuplicate(d.id)} title="Duplicate">
                      <Copy size={12} />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(d.id)}>
                      <Trash2 size={12} color="var(--color-danger-500)" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}
        {dashboards?.length === 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <EmptyState
              icon={<LayoutDashboard size={48} />}
              title="No dashboards yet"
              description={'Click "New Dashboard" to create one.'}
            />
          </div>
        )}
      </div>

      <CreateDashboardModal
        isOpen={showCreate}
        onSave={handleCreate}
        onClose={() => setShowCreate(false)}
      />

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
        onCancel={() => setDeleteConfirm(null)}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${dashboardToDelete?.name ?? ""}"? This action cannot be undone.`}
        tone="danger"
        confirmLabel="Delete"
      />
    </div>
  );
}

function CreateDashboardModal({ isOpen, onSave, onClose }: { isOpen: boolean; onSave: (name: string, desc: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Dashboard"
      size="sm"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(name, description)} disabled={!name.trim()}>Create</Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dashboard name"
          autoFocus
        />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this dashboard shows"
        />
      </div>
    </Modal>
  );
}

// ─── Dashboard Viewer (Grid + Time Range + Auto Refresh) ────────────────────

function DashboardViewer({ dashboard, onBack, onEdit }: { dashboard: Dashboard; onBack: () => void; onEdit: () => void }) {
  const [dvParams, setDvParams] = useSearchParams();
  const timeRangeKey = dvParams.get("range") || "1h";
  const setTimeRangeKey = useCallback((v: string) => {
    setDvParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "1h") next.delete("range"); else next.set("range", v);
      return next;
    }, { replace: true });
  }, [setDvParams]);
  const [autoRefreshKey, setAutoRefreshKey] = useState("off");
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const secs = getRefreshSeconds(autoRefreshKey);
    if (!secs) return;
    const id = setInterval(() => setRefreshKey((k) => k + 1), secs * 1000);
    return () => clearInterval(id);
  }, [autoRefreshKey]);

  const { from, to } = getTimeRange(timeRangeKey);
  const interval = getIntervalForRange(timeRangeKey);

  const layout = dashboard.panels.map((p) => ({
    i: p.id,
    x: p.position_x ?? 0,
    y: p.position_y ?? 0,
    w: p.width || 6,
    h: p.height || 4,
  }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} /></Button>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{dashboard.name}</h2>
            {dashboard.description && <p style={{ fontSize: 13, color: "var(--color-neutral-500)", margin: 0 }}>{dashboard.description}</p>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TimeRangePicker value={timeRangeKey} onChange={setTimeRangeKey} />
          <AutoRefresh value={autoRefreshKey} onChange={setAutoRefreshKey} />
          <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)} title="Refresh now">
            <RefreshCw size={14} />
          </Button>
          <Button variant="secondary" onClick={onEdit}><Edit2 size={14} /> Edit</Button>
        </div>
      </div>

      {dashboard.panels.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard size={48} />}
          title="No panels yet"
          description="Click Edit to add panels."
        />
      ) : (
        <div ref={containerRef}>
          <GridLayout
            layout={layout}
            width={containerWidth}
            gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: [12, 12] as const, containerPadding: [0, 0] as const, maxRows: Infinity }}
            dragConfig={{ enabled: false, bounded: false, threshold: 3 }}
            resizeConfig={{ enabled: false, handles: ["se"] as const }}
          >
            {dashboard.panels.map((panel) => (
              <div key={panel.id} className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <span>{panel.title}</span>
                </div>
                <div className="dashboard-panel-body">
                  <WidgetRenderer
                    panel={panel}
                    from={from}
                    to={to}
                    interval={interval}
                    height={(panel.height || 4) * GRID_ROW_HEIGHT - 44}
                    refreshKey={refreshKey}
                  />
                </div>
              </div>
            ))}
          </GridLayout>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Editor (Drag/Resize Grid + Drawer) ──────────────────────────

function DashboardEditor({ dashboard, onBack }: { dashboard: Dashboard; onBack: () => void }) {
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description);
  const [panels, setPanels] = useState<PanelDefinition[]>(dashboard.panels);
  const [editingPanel, setEditingPanel] = useState<PanelDefinition | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

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

  const handleLayoutChange = (newLayout: GridLayoutType) => {
    setPanels((prev) =>
      prev.map((p) => {
        const item = newLayout.find((l) => l.i === p.id);
        if (!item) return p;
        return { ...p, position_x: item.x, position_y: item.y, width: item.w, height: item.h };
      })
    );
  };

  const openAddPanel = () => {
    setIsAddingNew(true);
    setEditingPanel({
      id: `panel-${Date.now()}`,
      title: "",
      panel_type: "timeseries",
      metric_name: "",
      tags: {},
      aggregation: "avg",
      width: 6,
      height: 4,
      position_x: 0,
      position_y: Infinity,
    });
  };

  const handleDrawerSave = (panel: PanelDefinition) => {
    if (isAddingNew) {
      setPanels((prev) => [...prev, panel]);
    } else {
      setPanels((prev) => prev.map((p) => (p.id === panel.id ? panel : p)));
    }
    setEditingPanel(null);
    setIsAddingNew(false);
  };

  const handleDrawerClose = () => {
    setEditingPanel(null);
    setIsAddingNew(false);
  };

  const removePanel = (id: string) => {
    setPanels(panels.filter((p) => p.id !== id));
  };

  const layout = panels.map((p) => ({
    i: p.id,
    x: p.position_x ?? 0,
    y: p.position_y ?? 0,
    w: p.width || 6,
    h: p.height || 4,
    minW: 2,
    minH: 2,
  }));

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60_000);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} /></Button>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Edit Dashboard</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 12, color: "var(--color-success-500)" }}>Saved!</span>}
          <Button variant="secondary" onClick={openAddPanel}>
            <Plus size={14} /> Add Panel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Dashboard"}
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {panels.length === 0 ? (
        <div
          style={{
            border: "2px dashed var(--color-neutral-200)",
            borderRadius: "var(--border-radius-md)",
            cursor: "pointer",
          }}
          onClick={openAddPanel}
        >
          <EmptyState
            icon={<LayoutDashboard size={48} />}
            title="No panels yet"
            description={'Click "Add Panel" or click here to start building.'}
          />
        </div>
      ) : (
        <div ref={containerRef}>
          <GridLayout
            layout={layout}
            width={containerWidth}
            gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: [12, 12] as const, containerPadding: [0, 0] as const, maxRows: Infinity }}
            dragConfig={{ enabled: true, bounded: false, handle: ".panel-drag-handle", threshold: 3 }}
            resizeConfig={{ enabled: true, handles: ["se"] as const }}
            onLayoutChange={handleLayoutChange}
          >
            {panels.map((panel) => (
              <div key={panel.id} className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <GripVertical size={14} className="panel-drag-handle" style={{ cursor: "grab", color: "var(--color-neutral-400)" }} />
                    <span>{panel.title || "Untitled"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      onClick={() => { setIsAddingNew(false); setEditingPanel(panel); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => removePanel(panel.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 4, borderRadius: 4 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="dashboard-panel-body">
                  <WidgetRenderer
                    panel={panel}
                    from={from}
                    to={now}
                    interval="1m"
                    height={(panel.height || 4) * GRID_ROW_HEIGHT - 44}
                  />
                </div>
              </div>
            ))}
          </GridLayout>
        </div>
      )}

      {editingPanel && (
        <PanelEditorDrawer
          panel={editingPanel}
          isNew={isAddingNew}
          onSave={handleDrawerSave}
          onClose={handleDrawerClose}
        />
      )}
    </div>
  );
}

// ─── Panel Editor Drawer ────────────────────────────────────────────────────

const PANEL_TYPE_OPTIONS: { value: PanelType; label: string }[] = [
  { value: "timeseries", label: "Time Series (Line)" },
  { value: "area", label: "Area Chart" },
  { value: "stat", label: "Single Stat" },
  { value: "top_list", label: "Top List (Bar)" },
  { value: "pie", label: "Pie / Donut" },
  { value: "text", label: "Text (Markdown)" },
];

type QueryMode = "simple" | "mql";

function PanelEditorDrawer({
  panel,
  isNew,
  onSave,
  onClose,
}: {
  panel: PanelDefinition;
  isNew: boolean;
  onSave: (panel: PanelDefinition) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(panel.title);
  const [panelType, setPanelType] = useState<PanelType>(panel.panel_type);
  const [queryMode, setQueryMode] = useState<QueryMode>(panel.mql_query ? "mql" : "simple");
  const [metricName, setMetricName] = useState(panel.metric_name ?? "");
  const [metricSearch, setMetricSearch] = useState("");
  const [aggregation, setAggregation] = useState(panel.aggregation ?? "avg");
  const [mqlQuery, setMqlQuery] = useState(panel.mql_query ?? "");
  const [mqlError, setMqlError] = useState<string | null>(null);
  const [mqlValid, setMqlValid] = useState(false);
  const [content, setContent] = useState(panel.content ?? "");
  const [stacked, setStacked] = useState(panel.display_options?.stacked !== false);
  const [limit, setLimit] = useState((panel.display_options?.limit as number) ?? 10);
  const { data: metricNames } = useApi<string[]>(() => api.metrics.names(), []);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredMetrics = metricSearch
    ? (metricNames ?? []).filter((n) => n.toLowerCase().includes(metricSearch.toLowerCase())).slice(0, 30)
    : (metricNames ?? []).slice(0, 30);

  const isTextType = panelType === "text";

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60_000);

  useEffect(() => {
    if (queryMode !== "mql" || !mqlQuery.trim()) {
      setMqlError(null);
      setMqlValid(false);
      return;
    }

    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);

    validateTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.mql.validate({
          query: mqlQuery,
          start: start.toISOString(),
          end: now.toISOString(),
        });
        if (result.valid) {
          setMqlError(null);
          setMqlValid(true);
        } else {
          setMqlError(result.error ?? "Invalid query");
          setMqlValid(false);
        }
      } catch (e) {
        setMqlError(e instanceof Error ? e.message : "Validation failed");
        setMqlValid(false);
      }
    }, 400);

    return () => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    };
  }, [mqlQuery, queryMode]);

  const handleSave = () => {
    const displayOptions: Record<string, unknown> = {};
    if (panelType === "area") displayOptions.stacked = stacked;
    if (panelType === "top_list") displayOptions.limit = limit;

    const isMql = queryMode === "mql" && !isTextType;

    onSave({
      ...panel,
      title: title || (isMql ? mqlQuery.split(":")[1]?.split("{")[0] ?? "MQL" : metricName) || "Untitled",
      panel_type: panelType,
      metric_name: isTextType || isMql ? undefined : metricName,
      aggregation: isTextType || isMql ? undefined : aggregation,
      mql_query: isMql ? mqlQuery : undefined,
      content: isTextType ? content : undefined,
      display_options: displayOptions,
    });
  };

  const hasValidSource = isTextType
    ? !!content
    : queryMode === "mql"
      ? mqlValid
      : !!metricName.trim();

  const previewPanel = {
    ...panel,
    title,
    panel_type: panelType,
    metric_name: isTextType || queryMode === "mql" ? undefined : metricName,
    aggregation: isTextType || queryMode === "mql" ? undefined : aggregation,
    mql_query: !isTextType && queryMode === "mql" ? mqlQuery : undefined,
    content: isTextType ? content : undefined,
    display_options: panelType === "area" ? { stacked } : panelType === "top_list" ? { limit } : {},
  };

  return (
    <>
      <div className="panel-drawer-overlay" onClick={onClose} />
      <div className="panel-drawer">
        <div className="panel-drawer-header">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {isNew ? "Add Panel" : "Edit Panel"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="panel-drawer-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Panel Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., CPU Usage"
              autoFocus
            />

            <NativeSelect
              label="Panel Type"
              options={PANEL_TYPE_OPTIONS}
              value={panelType}
              onChange={(v) => setPanelType(v as PanelType)}
            />

            {isTextType ? (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                  Markdown Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write markdown here..."
                  rows={8}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    resize: "vertical",
                  }}
                />
              </div>
            ) : (
              <>
                {/* Query Mode Toggle */}
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                    Query Mode
                  </label>
                  <div style={{ display: "flex", gap: 0, borderRadius: "var(--border-radius-md)", overflow: "hidden", border: "1px solid var(--color-neutral-200)" }}>
                    {(["simple", "mql"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setQueryMode(mode)}
                        style={{
                          flex: 1,
                          padding: "8px 16px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: "none",
                          background: queryMode === mode ? "var(--color-primary-500)" : "var(--color-neutral-50)",
                          color: queryMode === mode ? "#fff" : "var(--color-neutral-600)",
                          transition: "background 0.15s, color 0.15s",
                        }}
                      >
                        {mode === "simple" ? "Simple" : "MQL"}
                      </button>
                    ))}
                  </div>
                </div>

                {queryMode === "mql" ? (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                      MQL Query
                    </label>
                    <textarea
                      value={mqlQuery}
                      onChange={(e) => setMqlQuery(e.target.value)}
                      maxLength={2000}
                      placeholder="avg:aws.rds.cpu{env:prod}.rate()"
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: 13,
                        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                        background: "var(--bg-tertiary)",
                        border: `1px solid ${mqlError ? "var(--color-danger-500)" : mqlValid ? "var(--color-success-500)" : "var(--border)"}`,
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4 }}>
                      <div>
                        {mqlError && (
                          <span style={{ fontSize: 12, color: "var(--color-danger-500)" }}>
                            {mqlError}
                          </span>
                        )}
                        {mqlValid && !mqlError && (
                          <span style={{ fontSize: 12, color: "var(--color-success-500)" }}>
                            Valid query
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: mqlQuery.length > 1900 ? "var(--color-danger-500)" : "var(--color-neutral-400)", whiteSpace: "nowrap", marginLeft: 8 }}>
                        {mqlQuery.length}/2000
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-neutral-400)", marginTop: 6 }}>
                      Format: <code style={{ fontSize: 11 }}>aggregator:metric{"{"}tag:value{"}"}.function().rollup(method,seconds)</code>
                    </div>
                  </div>
                ) : (
                  <>
                    <NativeSelect
                      label="Aggregation"
                      options={["avg", "min", "max", "sum", "count", "last", "p95", "p99"].map((a) => ({ value: a, label: a }))}
                      value={aggregation}
                      onChange={(v) => setAggregation(v)}
                    />

                    <div>
                      <Input
                        label="Metric"
                        value={metricName || metricSearch}
                        onChange={(e) => { setMetricSearch(e.target.value); setMetricName(e.target.value); }}
                        placeholder="Search metrics..."
                      />
                      {metricSearch && filteredMetrics.length > 0 && (
                        <div style={{
                          background: "var(--bg-tertiary)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          maxHeight: 180,
                          overflowY: "auto",
                          marginTop: 4,
                        }}>
                          {filteredMetrics.map((n) => (
                            <div
                              key={n}
                              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,91,255,0.1)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              onClick={() => { setMetricName(n); setMetricSearch(""); }}
                            >
                              <code style={{ fontSize: 12 }}>{n}</code>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {panelType === "area" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={stacked}
                      onChange={(e) => setStacked(e.target.checked)}
                    />
                    Stacked areas
                  </label>
                )}

                {panelType === "top_list" && (
                  <Input
                    label="Max items"
                    type="number"
                    min={1}
                    max={50}
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
                  />
                )}
              </>
            )}

            {/* Preview */}
            {(isTextType ? content : hasValidSource) && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                  Preview
                </div>
                <div style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}>
                  <WidgetRenderer
                    panel={previewPanel}
                    from={start}
                    to={now}
                    interval="1m"
                    height={200}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="panel-drawer-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isTextType && !hasValidSource && !title.trim()}
          >
            {isNew ? "Add Panel" : "Update Panel"}
          </Button>
        </div>
      </div>
    </>
  );
}
