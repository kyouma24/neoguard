import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { subHours, format } from "date-fns";
import { ArrowLeft, Clock, Activity } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../services/api";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  StatusBadge,
  EmptyState,
} from "../design-system";
import type { AlertRule, AlertEvent, MetricQueryResult } from "../types";

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

function severityVariant(s: string): "danger" | "warning" | "info" {
  if (s === "P1") return "danger";
  if (s === "P2") return "warning";
  return "info";
}

function statusTone(s: string): "danger" | "success" | "neutral" {
  if (s === "firing") return "danger";
  if (s === "resolved") return "success";
  return "neutral";
}

function conditionLabel(c: string): string {
  const map: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=", neq: "!=" };
  return map[c] ?? c;
}

export function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, tenant } = useAuth();
  const queryTenantId = user?.is_super_admin ? tenant?.id : undefined;
  const [timeRange, setTimeRange] = useState(6);

  const { data: rule, loading: ruleLoading } = useApi<AlertRule>(
    () => (id ? api.alerts.getRule(id) : Promise.reject("no id")),
    [id],
  );

  const { data: events } = useApi<AlertEvent[]>(
    () => (id ? api.alerts.listEvents({ rule_id: id, limit: 50 }, { tenantId: queryTenantId }) : Promise.resolve([])),
    [id, queryTenantId],
  );

  const now = new Date();
  const start = subHours(now, timeRange);

  const { data: chartData, refetch } = useApi<MetricQueryResult[]>(
    () =>
      rule
        ? api.metrics.query({
            name: rule.metric_name,
            tags: rule.tags_filter,
            start: start.toISOString(),
            end: now.toISOString(),
            interval: timeRange <= 1 ? "1m" : timeRange <= 6 ? "5m" : "15m",
            aggregation: rule.aggregation,
          }, { tenantId: queryTenantId })
        : Promise.resolve([]),
    [rule?.id, timeRange, queryTenantId],
  );

  useInterval(refetch, 30_000);

  if (ruleLoading) {
    return <div style={{ padding: 32, color: "var(--color-neutral-500)" }}>Loading...</div>;
  }

  if (!rule) {
    return (
      <div style={{ padding: 32 }}>
        <EmptyState title="Alert rule not found" description="This rule may have been deleted." />
        <div style={{ marginTop: 16 }}>
          <Button variant="ghost" onClick={() => navigate("/alerts")}>
            <ArrowLeft size={14} /> Back to Alerts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={rule.name}
        breadcrumbs={
          <Button variant="ghost" size="sm" onClick={() => navigate("/alerts")}>
            <ArrowLeft size={14} /> Alerts
          </Button>
        }
        actions={
          <Badge variant={severityVariant(rule.severity)}>{rule.severity}</Badge>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <Card variant="bordered" padding="md">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
            <InfoItem label="Metric" value={rule.metric_name} />
            <InfoItem label="Condition" value={`${conditionLabel(rule.condition)} ${rule.threshold}`} />
            <InfoItem label="Duration" value={`${rule.duration_sec}s`} />
            <InfoItem label="Aggregation" value={rule.aggregation} />
            <InfoItem label="Interval" value={`${rule.interval_sec}s`} />
            <InfoItem label="Cooldown" value={`${rule.cooldown_sec}s`} />
            <InfoItem label="No-Data Action" value={rule.nodata_action} />
            <InfoItem label="Status" value={rule.enabled ? "Enabled" : "Disabled"} />
          </div>
          {rule.description && (
            <p style={{ marginTop: 12, fontSize: 13, color: "var(--color-neutral-500)" }}>{rule.description}</p>
          )}
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Card variant="bordered">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 0" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-neutral-700)" }}>
              <Activity size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Metric: {rule.metric_name}
            </h3>
            <div style={{ display: "flex", gap: 4 }}>
              {TIME_RANGES.map((r) => (
                <Button
                  key={r.hours}
                  variant={timeRange === r.hours ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(r.hours)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <TimeSeriesChart data={chartData ?? []} height={300} />
            <ThresholdOverlay threshold={rule.threshold} condition={rule.condition} />
          </div>
        </Card>
      </div>

      <Card variant="bordered" padding="md">
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-neutral-700)" }}>
          <Clock size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Alert History ({events?.length ?? 0} events)
        </h3>
        {!events || events.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>No alert events recorded for this rule.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-neutral-200)", textAlign: "left" }}>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Fired At</th>
                  <th style={thStyle}>Resolved At</th>
                  <th style={thStyle}>Acknowledged</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--color-neutral-100)" }}>
                    <td style={tdStyle}>
                      <StatusBadge tone={statusTone(ev.status)} label={ev.status} />
                    </td>
                    <td style={tdStyle}>
                      <Badge variant={severityVariant(ev.severity)}>{ev.severity}</Badge>
                    </td>
                    <td style={tdStyle}>{typeof ev.value === "number" ? ev.value.toFixed(2) : "—"}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {format(new Date(ev.fired_at), "MMM d, HH:mm:ss")}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {ev.resolved_at ? format(new Date(ev.resolved_at), "MMM d, HH:mm:ss") : "—"}
                    </td>
                    <td style={tdStyle}>
                      {ev.acknowledged_at ? (
                        <span style={{ color: "var(--color-success-600)" }}>
                          {ev.acknowledged_by || "Yes"} — {format(new Date(ev.acknowledged_at), "MMM d, HH:mm")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-neutral-400)" }}>No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontWeight: 500, color: "var(--color-neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px" };

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-neutral-400)", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-neutral-800)" }}>{value}</div>
    </div>
  );
}

function ThresholdOverlay({ threshold, condition }: { threshold: number; condition: string }) {
  const isUpper = condition === "gt" || condition === "gte";
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 16,
        top: isUpper ? 16 : undefined,
        bottom: isUpper ? undefined : 40,
        borderTop: "2px dashed var(--color-danger-400)",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: 0,
          top: -16,
          fontSize: 10,
          color: "var(--color-danger-500)",
          fontWeight: 600,
          background: "var(--color-neutral-50, #f9fafb)",
          padding: "1px 4px",
          borderRadius: 2,
        }}
      >
        Threshold: {threshold}
      </span>
    </div>
  );
}
