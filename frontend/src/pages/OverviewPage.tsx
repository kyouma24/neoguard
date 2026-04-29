import { Activity, AlertTriangle, Database, FileText } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import type { HealthStatus } from "../types";

export function OverviewPage() {
  const { data: health, refetch } = useApi<HealthStatus>(() => api.health(), []);
  useInterval(refetch, 10_000);

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>System Overview</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatCard
          icon={<Activity size={20} />}
          label="Status"
          value={health?.status ?? "..."}
          color={health?.status === "healthy" ? "var(--success)" : "var(--warning)"}
        />
        <StatCard
          icon={<Database size={20} />}
          label="Metrics Written"
          value={formatNum(health?.writers.metrics.total_written)}
          color="var(--accent)"
        />
        <StatCard
          icon={<FileText size={20} />}
          label="Logs Written"
          value={formatNum(health?.writers.logs.total_written)}
          color="var(--info)"
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          label="Dropped"
          value={formatNum(
            (health?.writers.metrics.total_dropped ?? 0) +
              (health?.writers.logs.total_dropped ?? 0)
          )}
          color={
            (health?.writers.metrics.total_dropped ?? 0) > 0
              ? "var(--error)"
              : "var(--success)"
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
            Database Health
          </h3>
          {health?.checks &&
            Object.entries(health.checks).map(([name, status]) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>{name}</span>
                <span className={status === "ok" ? "badge badge-success" : "badge badge-error"}>
                  {status}
                </span>
              </div>
            ))}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
            Writer Buffers
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <BufferBar
              label="Metric Buffer"
              current={health?.writers.metrics.buffer_size ?? 0}
              max={5000}
            />
            <BufferBar
              label="Log Buffer"
              current={health?.writers.logs.buffer_size ?? 0}
              max={2000}
            />
          </div>
        </div>
      </div>
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
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)" }}>
        {icon}
        <span style={{ fontSize: 13 }}>{label}</span>
      </div>
      <span style={{ fontSize: 28, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function BufferBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = Math.min(100, (current / max) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>
          {current} / {max}
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
            background: pct > 80 ? "var(--warning)" : "var(--accent)",
            borderRadius: 3,
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}

function formatNum(n: number | undefined): string {
  if (n === undefined) return "...";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
