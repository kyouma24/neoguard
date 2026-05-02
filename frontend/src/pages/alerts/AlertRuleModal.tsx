import { useCallback, useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { api, formatError } from "../../services/api";
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  NativeSelect,
  StatusBadge,
} from "../../design-system";
import type {
  AlertPreviewResult,
  AlertRule,
  AggregationType,
  NoDataAction,
  NotificationChannel,
} from "../../types";

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
  { value: "P1", label: "P1 — Critical" },
  { value: "P2", label: "P2 — High" },
  { value: "P3", label: "P3 — Medium" },
  { value: "P4", label: "P4 — Low" },
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

export interface AlertFormData {
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

interface AlertRuleModalProps {
  isOpen: boolean;
  mode: ModalMode;
  metricNames: string[];
  saving: boolean;
  error: string | null;
  onSave: (data: AlertFormData) => void;
  onClose: () => void;
}

export function AlertRuleModal({ isOpen, mode, metricNames, saving, error, onSave, onClose }: AlertRuleModalProps) {
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
    severity: existing?.severity ?? "P3",
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
        severity: "P3", notification: {}, aggregation: "avg",
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
      setPreviewError(formatError(e));
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
