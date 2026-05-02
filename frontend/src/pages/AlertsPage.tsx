import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { BellOff, Check, Clock, Edit2, Plus, Power, Trash2, X } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { usePermissions } from "../hooks/usePermissions";
import { api, formatError } from "../services/api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
  Tabs,
} from "../design-system";
import type { TabItem } from "../design-system";
import type {
  AlertEvent,
  AlertRule,
  NoDataAction,
  Silence,
  SilenceCreate,
} from "../types";
import { AlertRuleModal } from "./alerts/AlertRuleModal";
import type { AlertFormData } from "./alerts/AlertRuleModal";
import { SilenceCreateModal } from "./alerts/SilenceCreateModal";

type ModalMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; rule: AlertRule };

const EVENT_STATUSES = ["all", "firing", "resolved", "pending", "ok"];
const EVENT_SEVERITIES = ["all", "P1", "P2", "P3", "P4"];

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
  const navigate = useNavigate();
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
      setError(formatError(e));
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
      setError(formatError(e));
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
      setError(formatError(e));
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    try {
      await api.alerts.updateRule(rule.id, { enabled: !rule.enabled });
      refetchRules();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleAcknowledge = async (eventId: string) => {
    try {
      await api.alerts.acknowledgeEvent(eventId, { acknowledged_by: "admin" });
      refetchEvents();
    } catch (e) {
      setError(formatError(e));
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
      setError(formatError(e));
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
      setError(formatError(e));
    }
  };

  const handleToggleSilence = async (silence: Silence) => {
    try {
      await api.alerts.updateSilence(silence.id, { enabled: !silence.enabled });
      refetchSilences();
    } catch (e) {
      setError(formatError(e));
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
                      <span
                        style={{ fontWeight: 500, color: "var(--color-primary-600)", cursor: "pointer" }}
                        onClick={() => navigate(`/alerts/${rule.id}`)}
                      >{rule.name}</span>
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

// ---- Helpers ----

const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--color-neutral-500)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" };
const tdStyle: React.CSSProperties = { padding: "10px 16px" };

function severityTone(s: string): "danger" | "warning" | "info" {
  switch (s) { case "P1": return "danger"; case "P2": return "warning"; default: return "info"; }
}

function statusTone(s: string): "danger" | "success" | "warning" | "info" {
  switch (s) { case "firing": return "danger"; case "resolved": return "success"; case "pending": return "warning"; default: return "info"; }
}

function conditionSymbol(c: string): string {
  switch (c) { case "gt": return ">"; case "lt": return "<"; case "gte": return ">="; case "lte": return "<="; case "eq": return "="; case "ne": return "!="; default: return c; }
}
