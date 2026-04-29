import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import { format } from "date-fns";
import { LayoutDashboard } from "lucide-react";
import type { Dashboard } from "../types";

export function DashboardsPage() {
  const { data: dashboards } = useApi<Dashboard[]>(() => api.dashboards.list(), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Dashboards</h1>
        <button className="btn btn-primary" onClick={() => alert("TODO: Dashboard creation modal")}>
          New Dashboard
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {dashboards?.map((d) => (
          <div key={d.id} className="card" style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <LayoutDashboard size={18} color="var(--accent)" />
              <span style={{ fontSize: 16, fontWeight: 600 }}>{d.name}</span>
            </div>
            {d.description && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                {d.description}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
              <span>{d.panels.length} panels</span>
              <span>Updated {format(new Date(d.updated_at), "MMM d, yyyy")}</span>
            </div>
          </div>
        ))}

        {dashboards?.length === 0 && (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            <LayoutDashboard size={48} />
            <p>No dashboards yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
