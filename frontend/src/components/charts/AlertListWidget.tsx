import type { MetricQueryResult, AlertEvent } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { ChartEmptyState } from "./ChartEmptyState";
import { CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { format } from "date-fns";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  alertEvents?: AlertEvent[];
}

const SEVERITY_CONFIG: Record<string, { color: string; Icon: typeof AlertCircle }> = {
  critical: { color: "#ef4444", Icon: AlertCircle },
  warning: { color: "#f59e0b", Icon: AlertTriangle },
  info: { color: "#3b82f6", Icon: Info },
};

function getSeverityConfig(severity: string) {
  return SEVERITY_CONFIG[severity.toLowerCase()] ?? SEVERITY_CONFIG.info;
}

function getStatusBadge(status: string): { label: string; bg: string; color: string } {
  switch (status.toLowerCase()) {
    case "firing":
      return { label: "Firing", bg: "rgba(239, 68, 68, 0.15)", color: "#ef4444" };
    case "resolved":
      return { label: "Resolved", bg: "rgba(34, 197, 94, 0.15)", color: "#22c55e" };
    case "pending":
      return { label: "Pending", bg: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" };
    case "acknowledged":
      return { label: "Ack", bg: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" };
    default:
      return { label: status, bg: "rgba(255,255,255,0.06)", color: "var(--text-muted)" };
  }
}

export function AlertListWidget({ height = 300, displayOptions, alertEvents }: Props) {
  const cfg = displayOptions?.alertList;
  const maxItems = cfg?.maxItems ?? 50;
  const showResolved = cfg?.showResolved ?? true;
  const filterSeverity = cfg?.filterSeverity;

  if (!alertEvents || alertEvents.length === 0) {
    return (
      <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--text-muted)" }}>
        <CheckCircle size={24} strokeWidth={1.5} style={{ color: "#22c55e" }} />
        <span style={{ fontSize: 13 }}>No active alerts</span>
      </div>
    );
  }

  let filtered = alertEvents;

  if (!showResolved) {
    filtered = filtered.filter((e) => e.status.toLowerCase() !== "resolved");
  }

  if (filterSeverity && filterSeverity.length > 0) {
    const allowed = new Set(filterSeverity.map((s) => s.toLowerCase()));
    filtered = filtered.filter((e) => allowed.has(e.severity.toLowerCase()));
  }

  filtered = filtered.slice(0, maxItems);

  if (filtered.length === 0) {
    return <ChartEmptyState height={height} message="No alerts match filters" />;
  }

  return (
    <div style={{ height, overflow: "auto", padding: "4px 0" }}>
      {filtered.map((event) => {
        const sevCfg = getSeverityConfig(event.severity);
        const badge = getStatusBadge(event.status);
        const Icon = sevCfg.Icon;
        const time = event.fired_at ? format(new Date(event.fired_at), "MMM d HH:mm") : "";

        return (
          <div
            key={event.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.06))",
            }}
          >
            <Icon size={16} style={{ color: sevCfg.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {event.rule_name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                {event.message}
              </div>
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: 4,
              background: badge.bg,
              color: badge.color,
              whiteSpace: "nowrap",
            }}>
              {badge.label}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
              {time}
            </span>
          </div>
        );
      })}
    </div>
  );
}
