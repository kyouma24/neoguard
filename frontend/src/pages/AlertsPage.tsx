import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { BellOff, Check, Clock, Edit2, Eye, Plus, Power, Trash2, X } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { usePermissions } from "../hooks/usePermissions";
import { api } from "../services/api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Modal,
  NativeSelect,
  PageHeader,
  Pagination,
  StatusBadge,
  Tabs,
} from "../design-system";
import type { TabItem } from "../design-system";
import type {
  AlertEvent,
  AlertPreviewResult,
  AlertRule,
  AggregationType,
  NoDataAction,
  NotificationChannel,
  Silence,
  SilenceCreate,
} from "../types";

type ModalMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; rule: AlertRule };

const CONDITIONS = [
  { value: "gt", label: "> (greater than)" },
  { value: "lt", label: "< (less than)" },
  { value: "gte", label: ">= (greater or equal)" },
  { value: "lte", label: "<= (less or equal)" },
  { value: "eq", label: "= (equal)" },
  { value: "ne", label: "!= (not equal)" },
];

const SEVERITIES = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const AGGREGATIONS: { value: AggregationType; label: string }[] = [
  { value: "avg", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "sum", label: "Sum" },
  { value: "count", label: "Count" },
  { value: "last", label: "Last" },
  { value: "p95", label: "P95" },
  { value: "p99", label: "P99" },
];

const COOLDOWNS: { value: string; label: string }[] = [
  { value: "0", label: "None" },
  { value: "60", label: "1 minute" },
  { value: "300", label: "5 minutes" },
  { value: "600", label: "10 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
];

const NODATA_ACTIONS: { value: NoDataAction; label: string }[] = [
  { value: "ok", label: "Treat as OK" },
  { value: "keep", label: "Keep Current State" },
  { value: "alert", label: "Fire No-Data Alert" },
];

const EVENT_STATUSES = ["all", "firing", "resolved", "pending", "ok"];
const EVENT_SEVERITIES = ["all", "info", "warning", "critical"];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "America/Chicago", label: "America/Chicago (CT)" },
  { value: "America/Denver", label: "America/Denver (MT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
];

type SilenceModalMode =
  | { kind: "closed" }
  | { kind: "create-onetime" }
  | { kind: "create-recurring" };

function formatCooldown(sec: number): string {
  if (sec === 0) return "None";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

function nodataActionTone(action: NoDataAction): "success" | "warning" | "danger" {
  switch (action) {
    case "ok": return "success";
    case "keep": return "warning";
    case "alert": return "danger";
  }
}

function channelCountFromNotification(notification: Record<string, unknown>): number {
  if (notification && typeof notification === "object") {
    const ids = notification["channel_ids"];
    if (Array.isArray(ids)) return ids.length;
  }
  return 0;
}

export function AlertsPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [tab, setTab] = useState<"rules" | "events" | "silences">("rules");
  const [modal, setModal] = useState<ModalMode>({ kind: "closed" });
  const [silenceModal, setSilenceModal] = useState<SilenceModalMode>({ kind: "closed" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteSilenceConfirm, setDeleteSilenceConfirm] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Events pagination
  const [eventsPage, setEventsPage] = useState(0);
  const [eventsPageSize, setEventsPageSize] = useState(25);

  const { data: rules, loading: rulesLoading, refetch: refetchRules } = useApi<AlertRule[]>(
    () => api.alerts.listRules(),
    [],
  );
  const { data: events, loading: eventsLoading, refetch: refetchEvents } = useApi<AlertEvent[]>(
    () => api.alerts.listEvents({ limit: 500 }),
    [],
  );
  const { data: silences, loading: silencesLoading, refetch: refetchSilences } = useApi<Silence[]>(
    () => api.alerts.listSilences(),
    [],
  );
  const { data: metricNames } = useApi<string[]>(() => api.metrics.names(), []);

  useInterval(() => {
    refetchRules();
    refetchEvents();
    refetchSilences();
  }, 15_000);

  const filteredEvents = events?.filter((e) => {
    if (eventFilter !== "all" && e.status !== eventFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    return true;
  });

  const paginatedEvents = filteredEvents?.slice(
    eventsPage * eventsPageSize,
    (eventsPage + 1) * eventsPageSize,
  );

  const firingCount = events?.filter((e) => e.status === "firing").length ?? 0;

  // Reset page when filters change
  useEffect(() => { setEventsPage(0); }, [eventFilter, severityFilter]);

  const handleCreate = async (data: AlertFormData) => {
    setSaving(true);
    setError(null);
    try {
      await api.alerts.createRule({
        name: data.name,
        description: data.description,
        metric_name: data.metric_name,
        tags_filter: data.tags_filter,
        condition: data.condition,
        threshold: data.threshold,
        duration_sec: data.duration_sec,
        interval_sec: data.interval_sec,
        severity: data.severity,
        notification: data.notification,
        aggregation: data.aggregation,
        cooldown_sec: data.cooldown_sec,
        nodata_action: data.nodata_action,
      });
      setModal({ kind: "closed" });
      refetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (ruleId: string, data: AlertFormData) => {
    setSaving(true);
    setError(null);
    try {
      await api.alerts.updateRule(ruleId, {
        name: data.name,
        description: data.description,
        metric_name: data.metric_name,
        tags_filter: data.tags_filter,
        condition: data.condition,
        threshold: data.threshold,
        duration_sec: data.duration_sec,
        interval_sec: data.interval_sec,
        severity: data.severity,
        notification: data.notification,
        aggregation: data.aggregation,
        cooldown_sec: data.cooldown_sec,
        nodata_action: data.nodata_action,
      });
      setModal({ kind: "closed" });
      refetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await api.alerts.deleteRule(ruleId);
      setDeleteConfirm(null);
      refetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    try {
      await api.alerts.updateRule(rule.id, { enabled: !rule.enabled });
      refetchRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAcknowledge = async (eventId: string) => {
    try {
      await api.alerts.acknowledgeEvent(eventId, { acknowledged_by: "admin" });
      refetchEvents();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreateSilence = async (data: SilenceCreate) => {
    setSaving(true);
    setError(null);
    try {
      await api.alerts.createSilence(data);
      setSilenceModal({ kind: "closed" });
      refetchSilences();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSilence = async (id: string) => {
    try {
      await api.alerts.deleteSilence(id);
      setDeleteSilenceConfirm(null);
      refetchSilences();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleSilence = async (silence: Silence) => {
    try {
      await api.alerts.updateSilence(silence.id, { enabled: !silence.enabled });
      refetchSilences();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const activeSilenceCount = silences?.filter((s) => s.enabled).length ?? 0;

  /* ---------- Tab content renderers ---------- */

  const rulesContent = rulesLoading && !rules ? (
    <Card variant="bordered" padding="md">
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>Loading rules...</div>
    </Card>
  ) : (
    <Card variant="bordered" padding="sm">
      <div style={{ margin: "calc(-1 * var(--spacing-sm))" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--typography-font-size-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Metric</th>
              <th style={thStyle}>Condition</th>
              <th style={thStyle}>Aggregation</th>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Cooldown</th>
              <th style={thStyle}>No Data</th>
              <th style={thStyle}>Interval</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules?.map((rule) => {
              const channelCount = channelCountFromNotification(rule.notification);
              return (
                <tr key={rule.id} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 500 }}>{rule.name}</span>
                      {channelCount > 0 && (
                        <Badge variant="info">
                          <span style={{ fontSize: 11 }}>{channelCount} ch</span>
                        </Badge>
                      )}
                    </div>
                    {rule.description && (
                      <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", marginTop: 2 }}>
                        {rule.description}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <code style={{ color: "var(--color-primary-500)", fontSize: "var(--typography-font-size-xs)" }}>{rule.metric_name}</code>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: "monospace" }}>{conditionSymbol(rule.condition)} {rule.threshold}</span>
                    <div style={{ fontSize: 11, color: "var(--color-neutral-400)", marginTop: 2 }}>for {rule.duration_sec}s</div>
                  </td>
                  <td style={tdStyle}>
                    <Badge variant="info">
                      <span style={{ fontSize: 11, textTransform: "uppercase" }}>{rule.aggregation ?? "avg"}</span>
                    </Badge>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge label={rule.severity} tone={severityTone(rule.severity)} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-xs)" }}>{formatCooldown(rule.cooldown_sec ?? 300)}</span>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge label={rule.nodata_action ?? "ok"} tone={nodataActionTone(rule.nodata_action ?? "ok")} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "var(--color-neutral-400)" }}>{rule.interval_sec}s</span>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge label={rule.enabled ? "Active" : "Disabled"} tone={rule.enabled ? "success" : "warning"} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {canEdit && (
                        <Button variant="ghost" size="sm" title={rule.enabled ? "Disable" : "Enable"} onClick={() => handleToggle(rule)}>
                          <Power size={14} color={rule.enabled ? "var(--color-success-500)" : "var(--color-neutral-400)"} />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="sm" title="Edit" onClick={() => setModal({ kind: "edit", rule })}>
                          <Edit2 size={14} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleteConfirm(rule.id)}>
                          <Trash2 size={14} color="var(--color-danger-500)" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rules?.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 0 }}>
                  <EmptyState title="No alert rules configured" description='Click "Create Rule" to get started.' />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const eventsContent = eventsLoading && !events ? (
    <Card variant="bordered" padding="md">
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>Loading events...</div>
    </Card>
  ) : (
    <>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>Status:</span>
          {EVENT_STATUSES.map((s) => (
            <Button key={s} variant={eventFilter === s ? "primary" : "secondary"} size="sm" onClick={() => setEventFilter(s)}>
              <span style={{ textTransform: "capitalize" }}>{s}</span>
            </Button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>Severity:</span>
          {EVENT_SEVERITIES.map((s) => (
            <Button key={s} variant={severityFilter === s ? "primary" : "secondary"} size="sm" onClick={() => setSeverityFilter(s)}>
              <span style={{ textTransform: "capitalize" }}>{s}</span>
            </Button>
          ))}
        </div>
      </div>
      <Card variant="bordered" padding="sm">
        <div style={{ margin: "calc(-1 * var(--spacing-sm))" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--typography-font-size-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Rule Name</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Message</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Threshold</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Fired</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Resolved</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Ack</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents?.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <td style={tdStyle}>
                    <StatusBadge label={event.status} tone={statusTone(event.status)} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, fontSize: "var(--typography-font-size-sm)" }}>{event.rule_name || "—"}</span>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge label={event.severity || "info"} tone={severityTone(event.severity || "info")} />
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={event.message}>
                    {event.message}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace" }}>{event.value.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "var(--color-neutral-400)" }}>{event.threshold}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
                    {format(new Date(event.fired_at), "MMM dd HH:mm:ss")}
                    <div style={{ fontSize: 11 }}>{formatDistanceToNow(new Date(event.fired_at), { addSuffix: true })}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--color-neutral-400)" }}>
                    {event.resolved_at ? format(new Date(event.resolved_at), "MMM dd HH:mm:ss") : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {event.acknowledged_at ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Check size={14} color="var(--color-success-500)" />
                        <div style={{ fontSize: 11, color: "var(--color-neutral-400)", lineHeight: 1.2 }}>
                          <div>{event.acknowledged_by}</div>
                          <div>{format(new Date(event.acknowledged_at), "MMM dd HH:mm")}</div>
                        </div>
                      </div>
                    ) : event.status === "firing" ? (
                      <Button variant="secondary" size="sm" onClick={() => handleAcknowledge(event.id)} title="Acknowledge">
                        <Check size={12} /> Ack
                      </Button>
                    ) : (
                      <span style={{ color: "var(--color-neutral-300)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {(paginatedEvents?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 0 }}>
                    <EmptyState title={eventFilter === "all" && severityFilter === "all" ? "No alert events" : "No matching events"} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {(filteredEvents?.length ?? 0) > 0 && (
        <div style={{ marginTop: 12 }}>
          <Pagination
            total={filteredEvents?.length ?? 0}
            page={eventsPage}
            pageSize={eventsPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={setEventsPage}
            onPageSizeChange={setEventsPageSize}
          />
        </div>
      )}
    </>
  );

  const silencesContent = silencesLoading && !silences ? (
    <Card variant="bordered" padding="md">
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>Loading silences...</div>
    </Card>
  ) : (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {canCreate && (
          <Button variant="primary" size="sm" onClick={() => setSilenceModal({ kind: "create-onetime" })}>
            <Clock size={14} /> One-Time Silence
          </Button>
        )}
        {canCreate && (
          <Button variant="primary" size="sm" onClick={() => setSilenceModal({ kind: "create-recurring" })}>
            <BellOff size={14} /> Recurring Silence
          </Button>
        )}
        {activeSilenceCount > 0 && (
          <span style={{ fontSize: "var(--typography-font-size-sm)", color: "var(--color-neutral-400)", alignSelf: "center" }}>
            {activeSilenceCount} active silence{activeSilenceCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <Card variant="bordered" padding="sm">
        <div style={{ margin: "calc(-1 * var(--spacing-sm))" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--typography-font-size-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Targets</th>
                <th style={thStyle}>Schedule</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {silences?.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    {s.comment && <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", marginTop: 2 }}>{s.comment}</div>}
                  </td>
                  <td style={tdStyle}>
                    <Badge variant={s.recurring ? "info" : "warning"}>{s.recurring ? "Recurring" : "One-Time"}</Badge>
                  </td>
                  <td style={tdStyle}>
                    {s.rule_ids.length > 0 && <div style={{ fontSize: "var(--typography-font-size-xs)" }}>{s.rule_ids.length} rule{s.rule_ids.length !== 1 ? "s" : ""}</div>}
                    {Object.keys(s.matchers).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                        {Object.entries(s.matchers).map(([k, v]) => (
                          <Badge key={k} variant="info"><span style={{ fontSize: 11 }}>{k}={v}</span></Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {s.recurring ? (
                      <div style={{ fontSize: "var(--typography-font-size-xs)" }}>
                        <div>{s.recurrence_days.map((d) => d.toUpperCase()).join(", ")}</div>
                        <div style={{ color: "var(--color-neutral-400)" }}>{s.recurrence_start_time} - {s.recurrence_end_time} ({s.timezone})</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)" }}>
                        <div>{format(new Date(s.starts_at), "MMM dd HH:mm")}</div>
                        <div>to {format(new Date(s.ends_at), "MMM dd HH:mm")}</div>
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge label={s.enabled ? "Active" : "Disabled"} tone={s.enabled ? "success" : "warning"} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {canEdit && (
                        <Button variant="ghost" size="sm" title={s.enabled ? "Disable" : "Enable"} onClick={() => handleToggleSilence(s)}>
                          <Power size={14} color={s.enabled ? "var(--color-success-500)" : "var(--color-neutral-400)"} />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleteSilenceConfirm(s.id)}>
                          <Trash2 size={14} color="var(--color-danger-500)" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {silences?.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <EmptyState title="No silences configured" description="Create a silence to suppress alerts during known maintenance windows." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );

  const tabItems: TabItem[] = [
    { id: "rules", label: `Rules (${rules?.length ?? 0})`, content: rulesContent },
    { id: "events", label: `Events (${events?.length ?? 0})`, content: eventsContent },
    { id: "silences", label: `Silences (${silences?.length ?? 0})`, content: silencesContent },
  ];

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle={firingCount > 0 ? `${firingCount} alert${firingCount !== 1 ? "s" : ""} currently firing` : undefined}
        actions={canCreate ? <Button variant="primary" onClick={() => setModal({ kind: "create" })}><Plus size={16} /> Create Rule</Button> : undefined}
      />

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-md)", padding: "10px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--typography-font-size-sm)", color: "var(--color-danger-500)" }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}><X size={14} /></Button>
        </div>
      )}

      <Tabs tabs={tabItems} activeTab={tab} onChange={(tabId) => setTab(tabId as "rules" | "events" | "silences")} variant="pill" />

      <ConfirmDialog isOpen={deleteConfirm !== null} onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }} onCancel={() => setDeleteConfirm(null)} title="Delete Alert Rule" description="Are you sure you want to delete this alert rule? This action cannot be undone." confirmLabel="Delete" tone="danger" />
      <ConfirmDialog isOpen={deleteSilenceConfirm !== null} onConfirm={() => { if (deleteSilenceConfirm) handleDeleteSilence(deleteSilenceConfirm); }} onCancel={() => setDeleteSilenceConfirm(null)} title="Delete Silence" description="Are you sure you want to delete this silence? This action cannot be undone." confirmLabel="Delete" tone="danger" />

      <SilenceCreateModal isOpen={silenceModal.kind !== "closed"} mode={silenceModal.kind === "closed" ? "create-onetime" : silenceModal.kind} rules={rules ?? []} saving={saving} error={error} onSave={handleCreateSilence} onClose={() => { setSilenceModal({ kind: "closed" }); setError(null); }} />
      <AlertRuleModal isOpen={modal.kind !== "closed"} mode={modal} metricNames={metricNames ?? []} saving={saving} error={error} onSave={(data) => { if (modal.kind === "create") handleCreate(data); else if (modal.kind === "edit") handleUpdate(modal.rule.id, data); }} onClose={() => { setModal({ kind: "closed" }); setError(null); }} />
    </div>
  );
}

// ---- Alert Rule Modal ----

interface AlertFormData {
  name: string;
  description: string;
  metric_name: string;
  tags_filter: Record<string, string>;
  condition: string;
  threshold: number;
  duration_sec: number;
  interval_sec: number;
  severity: string;
  notification: Record<string, unknown>;
  aggregation: AggregationType;
  cooldown_sec: number;
  nodata_action: NoDataAction;
}

function AlertRuleModal({ isOpen, mode, metricNames, saving, error, onSave, onClose }: {
  isOpen: boolean;
  mode: ModalMode;
  metricNames: string[];
  saving: boolean;
  error: string | null;
  onSave: (data: AlertFormData) => void;
  onClose: () => void;
}) {
  const existing = mode.kind === "edit" ? mode.rule : null;
  const [metricSearch, setMetricSearch] = useState("");
  const [form, setForm] = useState<AlertFormData>({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    metric_name: existing?.metric_name ?? "",
    tags_filter: existing?.tags_filter ?? {},
    condition: existing?.condition ?? "gt",
    threshold: existing?.threshold ?? 80,
    duration_sec: existing?.duration_sec ?? 60,
    interval_sec: existing?.interval_sec ?? 30,
    severity: existing?.severity ?? "warning",
    notification: existing?.notification ?? {},
    aggregation: existing?.aggregation ?? "avg",
    cooldown_sec: existing?.cooldown_sec ?? 300,
    nodata_action: existing?.nodata_action ?? "ok",
  });
  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");

  // Notification channels
  const { data: channels } = useApi<NotificationChannel[]>(() => api.notifications.listChannels(), []);
  const existingChannelIds: string[] = (existing?.notification && Array.isArray(existing.notification["channel_ids"]))
    ? (existing.notification["channel_ids"] as string[])
    : [];
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(existingChannelIds);

  // Preview
  const [preview, setPreview] = useState<AlertPreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Re-initialize form when modal mode changes
  useEffect(() => {
    if (mode.kind === "edit") {
      const rule = mode.rule;
      setForm({
        name: rule.name,
        description: rule.description,
        metric_name: rule.metric_name,
        tags_filter: rule.tags_filter,
        condition: rule.condition,
        threshold: rule.threshold,
        duration_sec: rule.duration_sec,
        interval_sec: rule.interval_sec,
        severity: rule.severity,
        notification: rule.notification,
        aggregation: rule.aggregation ?? "avg",
        cooldown_sec: rule.cooldown_sec ?? 300,
        nodata_action: rule.nodata_action ?? "ok",
      });
      const ids = (rule.notification && Array.isArray(rule.notification["channel_ids"]))
        ? (rule.notification["channel_ids"] as string[])
        : [];
      setSelectedChannelIds(ids);
    } else if (mode.kind === "create") {
      setForm({
        name: "", description: "", metric_name: "", tags_filter: {},
        condition: "gt", threshold: 80, duration_sec: 60, interval_sec: 30,
        severity: "warning", notification: {}, aggregation: "avg",
        cooldown_sec: 300, nodata_action: "ok",
      });
      setSelectedChannelIds([]);
    }
    setPreview(null);
    setPreviewError(null);
    setMetricSearch("");
    setTagKey("");
    setTagValue("");
  }, [mode]);

  const update = (field: string, value: unknown) => setForm((prev) => ({ ...prev, [field]: value }));

  const addTag = () => {
    if (tagKey && tagValue) {
      update("tags_filter", { ...form.tags_filter, [tagKey]: tagValue });
      setTagKey("");
      setTagValue("");
    }
  };

  const removeTag = (key: string) => {
    const next = { ...form.tags_filter };
    delete next[key];
    update("tags_filter", next);
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]
    );
  };

  const filteredMetrics = metricSearch
    ? metricNames.filter((n) => n.toLowerCase().includes(metricSearch.toLowerCase()))
    : metricNames.slice(0, 50);

  const isValid = form.name.trim() && form.metric_name.trim() && form.threshold !== undefined;

  const handlePreview = useCallback(async () => {
    if (!form.metric_name.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const result = await api.alerts.previewRule({
        metric_name: form.metric_name,
        tags_filter: Object.keys(form.tags_filter).length > 0 ? form.tags_filter : undefined,
        condition: form.condition,
        threshold: form.threshold,
        duration_sec: form.duration_sec,
        aggregation: form.aggregation,
        lookback_hours: 24,
      });
      setPreview(result);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }, [form.metric_name, form.tags_filter, form.condition, form.threshold, form.duration_sec, form.aggregation]);

  const handleSave = () => {
    const notificationPayload: Record<string, unknown> = { ...form.notification };
    if (selectedChannelIds.length > 0) {
      notificationPayload["channel_ids"] = selectedChannelIds;
    } else {
      delete notificationPayload["channel_ids"];
    }
    onSave({ ...form, notification: notificationPayload });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? "Edit Alert Rule" : "Create Alert Rule"} size="lg" footer={
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button variant="secondary" size="sm" onClick={handlePreview} disabled={previewing || !form.metric_name.trim()}>
          <Eye size={14} /> {previewing ? "Previewing..." : "Preview Rule"}
        </Button>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!isValid || saving}>{saving ? "Saving..." : existing ? "Update Rule" : "Create Rule"}</Button>
      </div>
    }>
      {error && <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-sm)", padding: "8px 12px", marginBottom: 16, fontSize: "var(--typography-font-size-sm)", color: "var(--color-danger-500)" }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label="Rule Name">
          <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g., High CPU Alert" />
        </FormField>

        <FormField label="Description (optional)">
          <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What this alert monitors" />
        </FormField>

        <FormField label="Metric Name">
          <div>
            <Input value={form.metric_name || metricSearch} onChange={(e) => { setMetricSearch(e.target.value); update("metric_name", e.target.value); }} placeholder="Search or type metric name..." />
            {metricSearch && filteredMetrics.length > 0 && (
              <div style={{ background: "var(--color-neutral-100)", border: "1px solid var(--color-neutral-200)", borderRadius: "var(--border-radius-sm)", maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
                {filteredMetrics.map((name) => (
                  <div key={name} style={{ padding: "6px 10px", fontSize: "var(--typography-font-size-sm)", cursor: "pointer", color: "var(--color-neutral-900)" }} onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-neutral-50)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")} onClick={() => { update("metric_name", name); setMetricSearch(""); }}>
                    <code>{name}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FormField label="Condition">
            <NativeSelect options={CONDITIONS} value={form.condition} onChange={(v) => update("condition", v)} />
          </FormField>
          <FormField label="Threshold">
            <Input type="number" step="any" value={form.threshold} onChange={(e) => update("threshold", parseFloat(e.target.value))} />
          </FormField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <FormField label="Duration (sec)">
            <Input type="number" min={10} max={3600} value={form.duration_sec} onChange={(e) => update("duration_sec", parseInt(e.target.value))} />
          </FormField>
          <FormField label="Interval (sec)">
            <Input type="number" min={10} max={600} value={form.interval_sec} onChange={(e) => update("interval_sec", parseInt(e.target.value))} />
          </FormField>
          <FormField label="Severity">
            <NativeSelect options={SEVERITIES} value={form.severity} onChange={(v) => update("severity", v)} />
          </FormField>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <FormField label="Aggregation">
            <NativeSelect options={AGGREGATIONS} value={form.aggregation} onChange={(v) => update("aggregation", v as AggregationType)} />
          </FormField>
          <FormField label="Cooldown">
            <NativeSelect options={COOLDOWNS} value={String(form.cooldown_sec)} onChange={(v) => update("cooldown_sec", parseInt(v))} />
          </FormField>
          <FormField label="No Data Action">
            <NativeSelect options={NODATA_ACTIONS} value={form.nodata_action} onChange={(v) => update("nodata_action", v as NoDataAction)} />
          </FormField>
        </div>

        <FormField label="Tags Filter (optional)">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input style={{ flex: 1 }} placeholder="Key" value={tagKey} onChange={(e) => setTagKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
            <Input style={{ flex: 1 }} placeholder="Value" value={tagValue} onChange={(e) => setTagValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} />
            <Button variant="secondary" onClick={addTag} disabled={!tagKey || !tagValue}>Add</Button>
          </div>
          {Object.keys(form.tags_filter).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(form.tags_filter).map(([k, v]) => (
                <Badge key={k} variant="info">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={() => removeTag(k)}>{k}={v} <X size={10} /></span>
                </Badge>
              ))}
            </div>
          )}
        </FormField>

        <FormField label="Notification Channels">
          <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid var(--color-neutral-200)", borderRadius: "var(--border-radius-sm)" }}>
            {(!channels || channels.length === 0) ? (
              <div style={{ padding: "10px 12px", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>No notification channels configured</div>
            ) : (
              channels.map((ch) => (
                <label key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: "var(--typography-font-size-sm)", borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <input type="checkbox" checked={selectedChannelIds.includes(ch.id)} onChange={() => toggleChannel(ch.id)} />
                  <span style={{ fontWeight: 500 }}>{ch.name}</span>
                  <Badge variant="info"><span style={{ fontSize: 11 }}>{ch.channel_type}</span></Badge>
                  {!ch.enabled && <StatusBadge label="Disabled" tone="warning" />}
                </label>
              ))
            )}
          </div>
        </FormField>

        {/* Preview result */}
        {(preview || previewError) && (
          <Card variant="bordered" padding="sm">
            <div style={{ fontSize: "var(--typography-font-size-sm)" }}>
              <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Eye size={14} /> Rule Preview (last 24h)
              </div>
              {previewError ? (
                <div style={{ color: "var(--color-danger-500)" }}>{previewError}</div>
              ) : preview ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", textTransform: "uppercase" }}>Would Fire</div>
                    <StatusBadge label={preview.would_fire ? "Yes" : "No"} tone={preview.would_fire ? "danger" : "success"} />
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", textTransform: "uppercase" }}>Current Value</div>
                    <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{preview.current_value.toFixed(2)}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", textTransform: "uppercase" }}>Datapoints</div>
                    <span style={{ fontWeight: 500 }}>{preview.datapoints.toLocaleString()}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", textTransform: "uppercase" }}>Simulated Events</div>
                    <span style={{ fontWeight: 500 }}>{preview.simulated_events}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
}

// ---- Silence Modal ----

const WEEKDAYS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

function SilenceCreateModal({ isOpen, mode, rules, saving, error, onSave, onClose }: {
  isOpen: boolean;
  mode: "create-onetime" | "create-recurring";
  rules: AlertRule[];
  saving: boolean;
  error: string | null;
  onSave: (data: SilenceCreate) => void;
  onClose: () => void;
}) {
  const isRecurring = mode === "create-recurring";
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const toLocalISO = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [startsAt, setStartsAt] = useState(toLocalISO(now));
  const [endsAt, setEndsAt] = useState(toLocalISO(isRecurring ? oneYearLater : twoHoursLater));
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
  const [matcherKey, setMatcherKey] = useState("");
  const [matcherValue, setMatcherValue] = useState("");
  const [matchers, setMatchers] = useState<Record<string, string>>({});
  const [selectedDays, setSelectedDays] = useState<string[]>(isRecurring ? ["mon", "tue", "wed", "thu", "fri"] : []);
  const [recStartTime, setRecStartTime] = useState("21:00");
  const [recEndTime, setRecEndTime] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");

  const toggleDay = (day: string) => { setSelectedDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]); };
  const toggleRule = (ruleId: string) => { setSelectedRuleIds((prev) => prev.includes(ruleId) ? prev.filter((id) => id !== ruleId) : [...prev, ruleId]); };
  const addMatcher = () => { if (matcherKey && matcherValue) { setMatchers((prev) => ({ ...prev, [matcherKey]: matcherValue })); setMatcherKey(""); setMatcherValue(""); } };
  const removeMatcher = (key: string) => { setMatchers((prev) => { const next = { ...prev }; delete next[key]; return next; }); };

  const hasTarget = selectedRuleIds.length > 0 || Object.keys(matchers).length > 0;
  const isValid = name.trim() && hasTarget && startsAt && endsAt;

  const handleSubmit = () => {
    const data: SilenceCreate = {
      name: name.trim(), comment, rule_ids: selectedRuleIds, matchers,
      starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
      timezone, recurring: isRecurring,
      ...(isRecurring ? { recurrence_days: selectedDays, recurrence_start_time: recStartTime, recurrence_end_time: recEndTime } : {}),
    };
    onSave(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isRecurring ? "Create Recurring Silence" : "Create One-Time Silence"} size="lg" footer={
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!isValid || saving}>{saving ? "Creating..." : "Create Silence"}</Button>
      </div>
    }>
      {error && <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-sm)", padding: "8px 12px", marginBottom: 16, fontSize: "var(--typography-font-size-sm)", color: "var(--color-danger-500)" }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label="Silence Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isRecurring ? "e.g., Nightly shutdown window" : "e.g., Deploy maintenance"} />
        </FormField>

        <FormField label="Comment (optional)">
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why this silence exists" />
        </FormField>

        <FormField label="Timezone">
          <NativeSelect options={TIMEZONES} value={timezone} onChange={(v) => setTimezone(v)} />
        </FormField>

        <FormField label="Target Rules (select one or more)">
          <div style={{ maxHeight: 150, overflowY: "auto", border: "1px solid var(--color-neutral-200)", borderRadius: "var(--border-radius-sm)" }}>
            {rules.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "var(--color-neutral-400)", fontSize: "var(--typography-font-size-sm)" }}>No rules available</div>
            ) : (
              rules.map((r) => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", fontSize: "var(--typography-font-size-sm)", borderBottom: "1px solid var(--color-neutral-200)" }}>
                  <input type="checkbox" checked={selectedRuleIds.includes(r.id)} onChange={() => toggleRule(r.id)} />
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <code style={{ fontSize: 11, color: "var(--color-neutral-400)" }}>{r.metric_name}</code>
                </label>
              ))
            )}
          </div>
        </FormField>

        <FormField label="Tag Matchers (alternative to rule selection)">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Input style={{ flex: 1 }} placeholder="Tag key" value={matcherKey} onChange={(e) => setMatcherKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMatcher()} />
            <Input style={{ flex: 1 }} placeholder="Tag value" value={matcherValue} onChange={(e) => setMatcherValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMatcher()} />
            <Button variant="secondary" onClick={addMatcher} disabled={!matcherKey || !matcherValue}>Add</Button>
          </div>
          {Object.keys(matchers).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(matchers).map(([k, v]) => (
                <Badge key={k} variant="info">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={() => removeMatcher(k)}>{k}={v} <X size={10} /></span>
                </Badge>
              ))}
            </div>
          )}
        </FormField>

        {!isRecurring && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Starts At"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></FormField>
            <FormField label="Ends At"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></FormField>
          </div>
        )}

        {isRecurring && (
          <>
            <FormField label="Active Days">
              <div style={{ display: "flex", gap: 6 }}>
                {WEEKDAYS.map((d) => (
                  <Button key={d.value} variant={selectedDays.includes(d.value) ? "primary" : "secondary"} size="sm" onClick={() => toggleDay(d.value)}>{d.label}</Button>
                ))}
              </div>
            </FormField>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Silence Start Time"><Input type="time" value={recStartTime} onChange={(e) => setRecStartTime(e.target.value)} /></FormField>
              <FormField label="Silence End Time"><Input type="time" value={recEndTime} onChange={(e) => setRecEndTime(e.target.value)} /></FormField>
            </div>

            <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)", background: "var(--color-neutral-100)", padding: "8px 12px", borderRadius: "var(--border-radius-sm)" }}>
              Alerts will be silenced every {selectedDays.map((d) => d.toUpperCase()).join(", ") || "..."} from {recStartTime} to {recEndTime} ({timezone}). Supports cross-midnight windows.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Valid From"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></FormField>
              <FormField label="Valid Until"><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></FormField>
            </div>
          </>
        )}

        {!hasTarget && <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-danger-500)" }}>Select at least one rule or add a tag matcher.</div>}
      </div>
    </Modal>
  );
}

// ---- Helpers ----

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--color-neutral-500)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" };
const tdStyle: React.CSSProperties = { padding: "10px 16px" };

function severityTone(s: string): "danger" | "warning" | "info" {
  switch (s) { case "critical": return "danger"; case "warning": return "warning"; default: return "info"; }
}

function statusTone(s: string): "danger" | "success" | "warning" | "info" {
  switch (s) { case "firing": return "danger"; case "resolved": return "success"; case "pending": return "warning"; default: return "info"; }
}

function conditionSymbol(c: string): string {
  switch (c) { case "gt": return ">"; case "lt": return "<"; case "gte": return ">="; case "lte": return "<="; case "eq": return "="; case "ne": return "!="; default: return c; }
}
