import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { BellOff, Clock, Edit2, Plus, Power, Trash2, X } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import type { AlertEvent, AlertRule, Silence, SilenceCreate } from "../types";

type ModalMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; rule: AlertRule };

const CONDITIONS = [
  { value: "gt", label: "> (greater than)" },
  { value: "lt", label: "< (less than)" },
  { value: "gte", label: ">= (greater or equal)" },
  { value: "lte", label: "<= (less or equal)" },
  { value: "eq", label: "= (equal)" },
  { value: "ne", label: "!= (not equal)" },
];

const SEVERITIES = ["info", "warning", "critical"];

const EVENT_STATUSES = ["all", "firing", "resolved", "pending", "ok"];

type SilenceModalMode =
  | { kind: "closed" }
  | { kind: "create-onetime" }
  | { kind: "create-recurring" };

export function AlertsPage() {
  const [tab, setTab] = useState<"rules" | "events" | "silences">("rules");
  const [modal, setModal] = useState<ModalMode>({ kind: "closed" });
  const [silenceModal, setSilenceModal] = useState<SilenceModalMode>({ kind: "closed" });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteSilenceConfirm, setDeleteSilenceConfirm] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rules, refetch: refetchRules } = useApi<AlertRule[]>(
    () => api.alerts.listRules(),
    [],
  );
  const { data: events, refetch: refetchEvents } = useApi<AlertEvent[]>(
    () => api.alerts.listEvents({ limit: 100 }),
    [],
  );
  const { data: silences, refetch: refetchSilences } = useApi<Silence[]>(
    () => api.alerts.listSilences(),
    [],
  );
  const { data: metricNames } = useApi<string[]>(() => api.metrics.names(), []);

  useInterval(() => {
    refetchRules();
    refetchEvents();
    refetchSilences();
  }, 15_000);

  const filteredEvents =
    eventFilter === "all"
      ? events
      : events?.filter((e) => e.status === eventFilter);

  const firingCount = events?.filter((e) => e.status === "firing").length ?? 0;

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
        threshold: data.threshold,
        duration_sec: data.duration_sec,
        interval_sec: data.interval_sec,
        severity: data.severity,
        notification: data.notification,
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

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Alerts</h1>
          {firingCount > 0 && (
            <div
              style={{
                fontSize: 13,
                color: "var(--error)",
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              {firingCount} alert{firingCount !== 1 ? "s" : ""} currently firing
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setModal({ kind: "create" })}
        >
          <Plus size={16} /> Create Rule
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid var(--error)",
            borderRadius: "var(--radius)",
            padding: "10px 16px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
            color: "var(--error)",
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--error)",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {(["rules", "events", "silences"] as const).map((t) => (
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
            {t} (
            {t === "rules"
              ? (rules?.length ?? 0)
              : t === "events"
                ? (events?.length ?? 0)
                : (silences?.length ?? 0)}
            )
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {tab === "rules" && (
        <div className="card" style={{ padding: 0 }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Severity</th>
                <th style={thStyle}>Interval</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules?.map((rule) => (
                <tr
                  key={rule.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{rule.name}</div>
                    {rule.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {rule.description}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <code style={{ color: "var(--accent)", fontSize: 12 }}>
                      {rule.metric_name}
                    </code>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontFamily: "monospace" }}>
                      {conditionSymbol(rule.condition)} {rule.threshold}
                    </span>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      for {rule.duration_sec}s
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span
                      className={`badge badge-${severityBadge(rule.severity)}`}
                    >
                      {rule.severity}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {rule.interval_sec}s
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      className={`badge ${rule.enabled ? "badge-success" : "badge-warning"}`}
                    >
                      {rule.enabled ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button
                        className="btn"
                        style={{ padding: "4px 8px" }}
                        title={rule.enabled ? "Disable" : "Enable"}
                        onClick={() => handleToggle(rule)}
                      >
                        <Power
                          size={14}
                          color={
                            rule.enabled
                              ? "var(--success)"
                              : "var(--text-muted)"
                          }
                        />
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "4px 8px" }}
                        title="Edit"
                        onClick={() => setModal({ kind: "edit", rule })}
                      >
                        <Edit2 size={14} />
                      </button>
                      {deleteConfirm === rule.id ? (
                        <>
                          <button
                            className="btn btn-danger"
                            style={{ padding: "4px 8px", fontSize: 12 }}
                            onClick={() => handleDelete(rule.id)}
                          >
                            Confirm
                          </button>
                          <button
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: 12 }}
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn"
                          style={{ padding: "4px 8px" }}
                          title="Delete"
                          onClick={() => setDeleteConfirm(rule.id)}
                        >
                          <Trash2 size={14} color="var(--error)" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rules?.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: 40,
                      color: "var(--text-muted)",
                    }}
                  >
                    No alert rules configured. Click "Create Rule" to get
                    started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Events Tab */}
      {tab === "events" && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
            {EVENT_STATUSES.map((s) => (
              <button
                key={s}
                className="btn"
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  textTransform: "capitalize",
                  background:
                    eventFilter === s ? "var(--accent)" : undefined,
                  color: eventFilter === s ? "#fff" : undefined,
                  borderColor:
                    eventFilter === s ? "var(--accent)" : undefined,
                }}
                onClick={() => setEventFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Message</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Threshold</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Fired</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents?.map((event) => (
                  <tr
                    key={event.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={tdStyle}>
                      <span
                        className={`badge ${statusBadge(event.status)}`}
                      >
                        {event.status}
                      </span>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        maxWidth: 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={event.message}
                    >
                      {event.message}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontFamily: "monospace",
                      }}
                    >
                      {event.value.toFixed(2)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontFamily: "monospace",
                        color: "var(--text-muted)",
                      }}
                    >
                      {event.threshold}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {format(new Date(event.fired_at), "MMM dd HH:mm:ss")}
                      <div style={{ fontSize: 11 }}>
                        {formatDistanceToNow(new Date(event.fired_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        color: "var(--text-muted)",
                      }}
                    >
                      {event.resolved_at
                        ? format(
                            new Date(event.resolved_at),
                            "MMM dd HH:mm:ss",
                          )
                        : "—"}
                    </td>
                  </tr>
                ))}
                {(filteredEvents?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: "center",
                        padding: 40,
                        color: "var(--text-muted)",
                      }}
                    >
                      {eventFilter === "all"
                        ? "No alert events"
                        : `No ${eventFilter} events`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Silences Tab */}
      {tab === "silences" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              className="btn btn-primary"
              onClick={() => setSilenceModal({ kind: "create-onetime" })}
            >
              <Clock size={14} /> One-Time Silence
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setSilenceModal({ kind: "create-recurring" })}
            >
              <BellOff size={14} /> Recurring Silence
            </button>
            {activeSilenceCount > 0 && (
              <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
                {activeSilenceCount} active silence{activeSilenceCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
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
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      {s.comment && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          {s.comment}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span className={`badge ${s.recurring ? "badge-info" : "badge-warning"}`}>
                        {s.recurring ? "Recurring" : "One-Time"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {s.rule_ids.length > 0 && (
                        <div style={{ fontSize: 12 }}>
                          {s.rule_ids.length} rule{s.rule_ids.length !== 1 ? "s" : ""}
                        </div>
                      )}
                      {Object.keys(s.matchers).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                          {Object.entries(s.matchers).map(([k, v]) => (
                            <span key={k} className="badge badge-info" style={{ fontSize: 11 }}>
                              {k}={v}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {s.recurring ? (
                        <div style={{ fontSize: 12 }}>
                          <div>{s.recurrence_days.map((d) => d.toUpperCase()).join(", ")}</div>
                          <div style={{ color: "var(--text-muted)" }}>
                            {s.recurrence_start_time} - {s.recurrence_end_time} ({s.timezone})
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          <div>{format(new Date(s.starts_at), "MMM dd HH:mm")}</div>
                          <div>to {format(new Date(s.ends_at), "MMM dd HH:mm")}</div>
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span className={`badge ${s.enabled ? "badge-success" : "badge-warning"}`}>
                        {s.enabled ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button
                          className="btn"
                          style={{ padding: "4px 8px" }}
                          title={s.enabled ? "Disable" : "Enable"}
                          onClick={() => handleToggleSilence(s)}
                        >
                          <Power
                            size={14}
                            color={s.enabled ? "var(--success)" : "var(--text-muted)"}
                          />
                        </button>
                        {deleteSilenceConfirm === s.id ? (
                          <>
                            <button
                              className="btn btn-danger"
                              style={{ padding: "4px 8px", fontSize: 12 }}
                              onClick={() => handleDeleteSilence(s.id)}
                            >
                              Confirm
                            </button>
                            <button
                              className="btn"
                              style={{ padding: "4px 8px", fontSize: 12 }}
                              onClick={() => setDeleteSilenceConfirm(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: "4px 8px" }}
                            title="Delete"
                            onClick={() => setDeleteSilenceConfirm(s.id)}
                          >
                            <Trash2 size={14} color="var(--error)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {silences?.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}
                    >
                      No silences configured. Create a silence to suppress alerts during known
                      maintenance windows.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Silence Create Modal */}
      {silenceModal.kind !== "closed" && (
        <SilenceCreateModal
          mode={silenceModal.kind}
          rules={rules ?? []}
          saving={saving}
          error={error}
          onSave={handleCreateSilence}
          onClose={() => {
            setSilenceModal({ kind: "closed" });
            setError(null);
          }}
        />
      )}

      {/* Create/Edit Modal */}
      {modal.kind !== "closed" && (
        <AlertRuleModal
          mode={modal}
          metricNames={metricNames ?? []}
          saving={saving}
          error={error}
          onSave={(data) => {
            if (modal.kind === "create") handleCreate(data);
            else handleUpdate(modal.rule.id, data);
          }}
          onClose={() => {
            setModal({ kind: "closed" });
            setError(null);
          }}
        />
      )}
    </div>
  );
}

// ---- Modal ----

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
}

function AlertRuleModal({
  mode,
  metricNames,
  saving,
  error,
  onSave,
  onClose,
}: {
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
  });

  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");

  const update = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

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

  const filteredMetrics = metricSearch
    ? metricNames.filter((n) =>
        n.toLowerCase().includes(metricSearch.toLowerCase()),
      )
    : metricNames.slice(0, 50);

  const isValid = form.name.trim() && form.metric_name.trim() && form.threshold !== undefined;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          width: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {existing ? "Edit Alert Rule" : "Create Alert Rule"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--error)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <FormField label="Rule Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g., High CPU Alert"
            />
          </FormField>

          {/* Description */}
          <FormField label="Description (optional)">
            <input
              className="input"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What this alert monitors"
            />
          </FormField>

          {/* Metric */}
          <FormField label="Metric Name">
            {!existing ? (
              <div>
                <input
                  className="input"
                  value={form.metric_name || metricSearch}
                  onChange={(e) => {
                    setMetricSearch(e.target.value);
                    update("metric_name", e.target.value);
                  }}
                  placeholder="Search or type metric name..."
                />
                {metricSearch && filteredMetrics.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      maxHeight: 150,
                      overflowY: "auto",
                      marginTop: 4,
                    }}
                  >
                    {filteredMetrics.map((name) => (
                      <div
                        key={name}
                        style={{
                          padding: "6px 10px",
                          fontSize: 13,
                          cursor: "pointer",
                          color: "var(--text-primary)",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "var(--bg-secondary)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                        onClick={() => {
                          update("metric_name", name);
                          setMetricSearch("");
                        }}
                      >
                        <code>{name}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <code
                style={{
                  color: "var(--accent)",
                  fontSize: 13,
                  padding: "8px 12px",
                  background: "var(--bg-tertiary)",
                  borderRadius: "var(--radius-sm)",
                  display: "block",
                }}
              >
                {form.metric_name}
              </code>
            )}
          </FormField>

          {/* Condition + Threshold row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Condition">
              <select
                className="select"
                style={{ width: "100%" }}
                value={form.condition}
                onChange={(e) => update("condition", e.target.value)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Threshold">
              <input
                className="input"
                type="number"
                step="any"
                value={form.threshold}
                onChange={(e) => update("threshold", parseFloat(e.target.value))}
              />
            </FormField>
          </div>

          {/* Duration + Interval + Severity row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Duration (sec)">
              <input
                className="input"
                type="number"
                min={10}
                max={3600}
                value={form.duration_sec}
                onChange={(e) =>
                  update("duration_sec", parseInt(e.target.value))
                }
              />
            </FormField>
            <FormField label="Interval (sec)">
              <input
                className="input"
                type="number"
                min={10}
                max={600}
                value={form.interval_sec}
                onChange={(e) =>
                  update("interval_sec", parseInt(e.target.value))
                }
              />
            </FormField>
            <FormField label="Severity">
              <select
                className="select"
                style={{ width: "100%" }}
                value={form.severity}
                onChange={(e) => update("severity", e.target.value)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Tags Filter */}
          <FormField label="Tags Filter (optional)">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Key"
                value={tagKey}
                onChange={(e) => setTagKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Value"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <button
                className="btn"
                onClick={addTag}
                disabled={!tagKey || !tagValue}
              >
                Add
              </button>
            </div>
            {Object.keys(form.tags_filter).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(form.tags_filter).map(([k, v]) => (
                  <span
                    key={k}
                    className="badge badge-info"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                    }}
                    onClick={() => removeTag(k)}
                  >
                    {k}={v} <X size={10} />
                  </span>
                ))}
              </div>
            )}
          </FormField>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onSave(form)}
            disabled={!isValid || saving}
          >
            {saving
              ? "Saving..."
              : existing
                ? "Update Rule"
                : "Create Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
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

function SilenceCreateModal({
  mode,
  rules,
  saving,
  error,
  onSave,
  onClose,
}: {
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
  const [selectedDays, setSelectedDays] = useState<string[]>(
    isRecurring ? ["mon", "tue", "wed", "thu", "fri"] : [],
  );
  const [recStartTime, setRecStartTime] = useState("21:00");
  const [recEndTime, setRecEndTime] = useState("09:00");

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleRule = (ruleId: string) => {
    setSelectedRuleIds((prev) =>
      prev.includes(ruleId) ? prev.filter((id) => id !== ruleId) : [...prev, ruleId],
    );
  };

  const addMatcher = () => {
    if (matcherKey && matcherValue) {
      setMatchers((prev) => ({ ...prev, [matcherKey]: matcherValue }));
      setMatcherKey("");
      setMatcherValue("");
    }
  };

  const removeMatcher = (key: string) => {
    setMatchers((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const hasTarget = selectedRuleIds.length > 0 || Object.keys(matchers).length > 0;
  const isValid = name.trim() && hasTarget && startsAt && endsAt;

  const handleSubmit = () => {
    const data: SilenceCreate = {
      name: name.trim(),
      comment,
      rule_ids: selectedRuleIds,
      matchers,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      timezone: "Asia/Kolkata",
      recurring: isRecurring,
      ...(isRecurring
        ? {
            recurrence_days: selectedDays,
            recurrence_start_time: recStartTime,
            recurrence_end_time: recEndTime,
          }
        : {}),
    };
    onSave(data);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          width: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {isRecurring ? "Create Recurring Silence" : "Create One-Time Silence"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--error)",
              borderRadius: "var(--radius-sm)",
              padding: "8px 12px",
              marginBottom: 16,
              fontSize: 13,
              color: "var(--error)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FormField label="Silence Name">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRecurring ? "e.g., Nightly shutdown window" : "e.g., Deploy maintenance"}
            />
          </FormField>

          <FormField label="Comment (optional)">
            <input
              className="input"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why this silence exists"
            />
          </FormField>

          {/* Target rules */}
          <FormField label="Target Rules (select one or more)">
            <div
              style={{
                maxHeight: 150,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {rules.length === 0 ? (
                <div style={{ padding: "10px 12px", color: "var(--text-muted)", fontSize: 13 }}>
                  No rules available
                </div>
              ) : (
                rules.map((r) => (
                  <label
                    key={r.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontSize: 13,
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRuleIds.includes(r.id)}
                      onChange={() => toggleRule(r.id)}
                    />
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    <code style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {r.metric_name}
                    </code>
                  </label>
                ))
              )}
            </div>
          </FormField>

          {/* Tag matchers */}
          <FormField label="Tag Matchers (alternative to rule selection)">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Tag key"
                value={matcherKey}
                onChange={(e) => setMatcherKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMatcher()}
              />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Tag value"
                value={matcherValue}
                onChange={(e) => setMatcherValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addMatcher()}
              />
              <button className="btn" onClick={addMatcher} disabled={!matcherKey || !matcherValue}>
                Add
              </button>
            </div>
            {Object.keys(matchers).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(matchers).map(([k, v]) => (
                  <span
                    key={k}
                    className="badge badge-info"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                    onClick={() => removeMatcher(k)}
                  >
                    {k}={v} <X size={10} />
                  </span>
                ))}
              </div>
            )}
          </FormField>

          {/* Time window */}
          {!isRecurring && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FormField label="Starts At">
                <input
                  className="input"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </FormField>
              <FormField label="Ends At">
                <input
                  className="input"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </FormField>
            </div>
          )}

          {/* Recurring schedule */}
          {isRecurring && (
            <>
              <FormField label="Active Days">
                <div style={{ display: "flex", gap: 6 }}>
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      className="btn"
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        background: selectedDays.includes(d.value) ? "var(--accent)" : undefined,
                        color: selectedDays.includes(d.value) ? "#fff" : undefined,
                        borderColor: selectedDays.includes(d.value) ? "var(--accent)" : undefined,
                      }}
                      onClick={() => toggleDay(d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Silence Start Time">
                  <input
                    className="input"
                    type="time"
                    value={recStartTime}
                    onChange={(e) => setRecStartTime(e.target.value)}
                  />
                </FormField>
                <FormField label="Silence End Time">
                  <input
                    className="input"
                    type="time"
                    value={recEndTime}
                    onChange={(e) => setRecEndTime(e.target.value)}
                  />
                </FormField>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  background: "var(--bg-tertiary)",
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                Alerts will be silenced every{" "}
                {selectedDays.map((d) => d.toUpperCase()).join(", ") || "..."} from{" "}
                {recStartTime} to {recEndTime} (IST). Supports cross-midnight windows.
              </div>

              {/* Recurring overall validity window */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Valid From">
                  <input
                    className="input"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </FormField>
                <FormField label="Valid Until">
                  <input
                    className="input"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </FormField>
              </div>
            </>
          )}

          {!hasTarget && (
            <div style={{ fontSize: 12, color: "var(--error)" }}>
              Select at least one rule or add a tag matcher.
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!isValid || saving}
          >
            {saving ? "Creating..." : "Create Silence"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Helpers ----

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

function severityBadge(s: string): string {
  switch (s) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

function statusBadge(s: string): string {
  switch (s) {
    case "firing":
      return "badge-error";
    case "resolved":
      return "badge-success";
    case "pending":
      return "badge-warning";
    default:
      return "badge-info";
  }
}

function conditionSymbol(c: string): string {
  switch (c) {
    case "gt":
      return ">";
    case "lt":
      return "<";
    case "gte":
      return ">=";
    case "lte":
      return "<=";
    case "eq":
      return "=";
    case "ne":
      return "!=";
    default:
      return c;
  }
}
