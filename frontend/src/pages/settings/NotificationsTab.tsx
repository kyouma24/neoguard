import { useState, useMemo } from "react";
import {
  Edit2,
  Plus,
  Power,
  Send,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useApi } from "../../hooks/useApi";
import { usePermissions } from "../../hooks/usePermissions";
import { api, formatError } from "../../services/api";
import type {
  NotificationChannel,
  NotificationChannelCreate,
  NotificationDelivery,
} from "../../types";
import {
  Card,
  Button,
  StatusBadge,
  Badge,
  Input,
  NativeSelect,
  Modal,
  ConfirmDialog,
  EmptyState,
  DataTable,
} from "../../design-system";
import type { DataTableColumn } from "../../design-system";
import { FormField, ErrorBanner } from "./_shared";

const CHANNEL_TYPES = [
  { value: "webhook" as const, label: "Webhook", configFields: [
    { key: "url", label: "URL", placeholder: "https://example.com/webhook" },
    { key: "signing_secret", label: "HMAC Signing Secret (optional)", placeholder: "your-signing-secret" },
  ]},
  { value: "slack" as const, label: "Slack", configFields: [
    { key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/..." },
    { key: "channel", label: "Channel (optional)", placeholder: "#alerts" },
  ]},
  { value: "email" as const, label: "Email", configFields: [
    { key: "smtp_host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
    { key: "smtp_port", label: "SMTP Port", placeholder: "587" },
    { key: "from", label: "From Address", placeholder: "neoguard@example.com" },
    { key: "to", label: "To Address(es)", placeholder: "ops@example.com" },
    { key: "smtp_user", label: "Username", placeholder: "user@example.com" },
    { key: "smtp_pass", label: "Password", placeholder: "app-password" },
  ]},
  { value: "freshdesk" as const, label: "Freshdesk", configFields: [
    { key: "domain", label: "Domain", placeholder: "company.freshdesk.com" },
    { key: "api_key", label: "API Key", placeholder: "your-freshdesk-api-key" },
    { key: "email", label: "Requester Email (optional)", placeholder: "alerts@company.com" },
    { key: "group_id", label: "Group ID (optional)", placeholder: "12345" },
    { key: "type", label: "Ticket Type (optional)", placeholder: "Incident" },
  ]},
  { value: "pagerduty" as const, label: "PagerDuty", configFields: [
    { key: "routing_key", label: "Routing Key", placeholder: "your-pagerduty-integration-key" },
  ]},
  { value: "msteams" as const, label: "MS Teams", configFields: [
    { key: "webhook_url", label: "Webhook URL", placeholder: "https://outlook.office.com/webhook/..." },
  ]},
];

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION CHANNELS TAB
// ═══════════════════════════════════════════════════════════════════════════

export function NotificationChannelsTab() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [editChannel, setEditChannel] = useState<NotificationChannel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: channels, refetch } = useApi<NotificationChannel[]>(() => api.notifications.listChannels(), []);

  const handleToggle = async (ch: NotificationChannel) => {
    try {
      await api.notifications.updateChannel(ch.id, { enabled: !ch.enabled });
      refetch();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.notifications.deleteChannel(deleteConfirm.id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.notifications.testChannel(id);
      setTestResult({ id, success: result.success });
    } catch {
      setTestResult({ id, success: false });
    } finally {
      setTestingId(null);
    }
  };

  const channelTypeLabel = (type: string) => CHANNEL_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3>Notification Channels</h3>
        {canCreate && (
          <Button variant="primary" onClick={() => { setEditChannel(null); setShowModal(true); }}>
            <Plus size={14} /> Add Channel
          </Button>
        )}
      </div>

      {channels && channels.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {channels.map((ch) => (
            <Card key={ch.id} variant="bordered" className="card" padding="md">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{ch.name}</span>
                    <Badge variant="info" size="sm">
                      {channelTypeLabel(ch.channel_type)}
                    </Badge>
                    <StatusBadge
                      label={ch.enabled ? "Enabled" : "Disabled"}
                      tone={ch.enabled ? "success" : "warning"}
                    />
                    {testResult?.id === ch.id && (
                      <StatusBadge
                        label={testResult.success ? "Test OK" : "Test Failed"}
                        tone={testResult.success ? "success" : "danger"}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>
                    {ch.channel_type === "webhook" && ch.config.url}
                    {ch.channel_type === "slack" && ch.config.webhook_url?.replace(/\/[^/]+$/, "/***")}
                    {ch.channel_type === "email" && `${ch.config.from ?? ""} → ${ch.config.to ?? ""}`}
                    {ch.channel_type === "freshdesk" && ch.config.domain}
                    {ch.channel_type === "pagerduty" && `Routing key: ${ch.config.routing_key?.slice(0, 8) ?? ""}...`}
                    {ch.channel_type === "msteams" && ch.config.webhook_url?.replace(/\/[^/]+$/, "/***")}
                    <span style={{ marginLeft: 12 }}>
                      Created {format(new Date(ch.created_at), "MMM dd, yyyy")}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTest(ch.id)}
                      disabled={testingId === ch.id}
                      title="Send test notification"
                    >
                      <Send size={14} color={testingId === ch.id ? "var(--color-neutral-400)" : "var(--color-info-500)"} />
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(ch)} title={ch.enabled ? "Disable" : "Enable"}>
                      <Power size={14} color={ch.enabled ? "var(--color-success-500)" : "var(--color-neutral-400)"} />
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => { setEditChannel(ch); setShowModal(true); }}>
                      <Edit2 size={14} />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ id: ch.id, name: ch.name })}>
                      <Trash2 size={14} color="var(--color-danger-500)" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No notification channels configured" />
      )}

      <DeliveryHistory channels={channels || []} />

      {showModal && (
        <NotificationChannelModal
          channel={editChannel}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); refetch(); }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Notification Channel"
        description={deleteConfirm ? `Are you sure you want to delete "${deleteConfirm.name}"? Active alerts will no longer send to this channel.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

function DeliveryHistory({ channels }: { channels: NotificationChannel[] }) {
  const { data: deliveries } = useApi<NotificationDelivery[]>(() => api.notifications.listDeliveries({ limit: 20 }), []);

  const channelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ch of channels) m[ch.id] = ch.name;
    return m;
  }, [channels]);

  const columns = useMemo<DataTableColumn<NotificationDelivery>[]>(() => [
    {
      key: "rule_id",
      label: "Rule",
      render: (value) => (
        <code style={{ fontSize: 12 }}>{String(value).slice(0, 8)}...</code>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (value) => {
        const s = String(value);
        return (
          <StatusBadge
            label={s}
            tone={s === "firing" ? "danger" : s === "resolved" ? "success" : "warning"}
          />
        );
      },
    },
    {
      key: "notification_meta",
      label: "Channels",
      render: (_value, row) => {
        const entries = Object.entries(row.notification_meta);
        return (
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {entries.map(([chId, result]) => (
              <StatusBadge
                key={chId}
                label={`${channelMap[chId] || chId.slice(0, 8)} ${result.delivered ? "✓" : "✗"}`}
                tone={result.delivered ? "success" : "danger"}
              />
            ))}
          </span>
        );
      },
    },
    {
      key: "fired_at",
      label: "Fired",
      render: (value) => (
        <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
          {format(new Date(String(value)), "MMM d, HH:mm")}
        </span>
      ),
    },
  ], [channelMap]);

  if (!deliveries || deliveries.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ marginBottom: 12 }}>Recent Deliveries</h3>
      <DataTable<NotificationDelivery>
        columns={columns}
        data={deliveries}
        striped={false}
        hoverable={false}
        testId="delivery-history-table"
      />
    </div>
  );
}

// ─── Notification Channel Modal ───────────────────────────────────────────

function NotificationChannelModal({ channel, onClose, onSaved }: { channel: NotificationChannel | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = channel !== null;
  const [name, setName] = useState(channel?.name ?? "");
  const [channelType, setChannelType] = useState<NotificationChannelCreate["channel_type"]>(channel?.channel_type ?? "webhook");
  const [config, setConfig] = useState<Record<string, string>>(channel?.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentType = CHANNEL_TYPES.find((t) => t.value === channelType)!;

  const updateConfig = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.notifications.updateChannel(channel.id, { name, config });
      } else {
        await api.notifications.createChannel({ name, channel_type: channelType, config });
      }
      onSaved();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEdit ? "Edit Notification Channel" : "Add Notification Channel"}
      size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !name}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </Button>
        </div>
      }
    >
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <FormField label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production Slack" />
      </FormField>

      <FormField label="Channel Type" required>
        <NativeSelect
          options={CHANNEL_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          value={channelType}
          onChange={(v) => { setChannelType(v as NotificationChannelCreate["channel_type"]); setConfig({}); }}
          disabled={isEdit}
        />
      </FormField>

      {currentType.configFields.map((field) => (
        <FormField key={field.key} label={field.label} required={!field.label.includes("optional")}>
          <Input
            type={field.key === "password" || field.key === "api_key" ? "password" : "text"}
            value={config[field.key] ?? ""}
            onChange={(e) => updateConfig(field.key, e.target.value)}
            placeholder={field.placeholder}
          />
        </FormField>
      ))}
    </Modal>
  );
}
