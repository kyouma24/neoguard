import { useState } from "react";
import { format } from "date-fns";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import type { AlertEvent, AlertRule } from "../types";

export function AlertsPage() {
  const [tab, setTab] = useState<"rules" | "events">("rules");

  const { data: rules, refetch: refetchRules } = useApi<AlertRule[]>(
    () => api.alerts.listRules(),
    []
  );
  const { data: events, refetch: refetchEvents } = useApi<AlertEvent[]>(
    () => api.alerts.listEvents({ limit: 50 }),
    []
  );

  useInterval(() => {
    refetchRules();
    refetchEvents();
  }, 15_000);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Alerts</h1>
        <button className="btn btn-primary" onClick={() => alert("TODO: Alert creation modal")}>
          Create Rule
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["rules", "events"] as const).map((t) => (
          <button
            key={t}
            className="btn"
            style={{
              background: tab === t ? "var(--accent)" : undefined,
              color: tab === t ? "#fff" : undefined,
              borderColor: tab === t ? "var(--accent)" : undefined,
              textTransform: "capitalize",
            }}
            onClick={() => setTab(t)}
          >
            {t} ({t === "rules" ? rules?.length ?? 0 : events?.length ?? 0})
          </button>
        ))}
      </div>

      {tab === "rules" && (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((rule) => (
                <tr key={rule.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>{rule.name}</td>
                  <td style={tdStyle}>
                    <code style={{ color: "var(--accent)" }}>{rule.metric_name}</code>
                  </td>
                  <td style={tdStyle}>
                    {rule.condition} {rule.threshold}
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge badge-${severityColor(rule.severity)}`}>
                      {rule.severity}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span className={`badge ${rule.enabled ? "badge-success" : "badge-warning"}`}>
                      {rule.enabled ? "Active" : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))}
              {rules?.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                    No alert rules configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "events" && (
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Message</th>
                <th style={thStyle}>Value</th>
                <th style={thStyle}>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {events?.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={tdStyle}>{format(new Date(event.fired_at), "MM-dd HH:mm:ss")}</td>
                  <td style={tdStyle}>
                    <span className={`badge badge-${event.status === "firing" ? "error" : "success"}`}>
                      {event.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{event.message}</td>
                  <td style={tdStyle}>{event.value.toFixed(2)}</td>
                  <td style={tdStyle}>{event.threshold}</td>
                </tr>
              ))}
              {events?.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                    No alert events
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontWeight: 600,
  color: "var(--text-secondary)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
};

function severityColor(s: string): string {
  switch (s) {
    case "critical": return "error";
    case "warning": return "warning";
    default: return "info";
  }
}
