import { useState } from "react";
import {
  Copy,
  Key,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useApi } from "../../hooks/useApi";
import { usePermissions } from "../../hooks/usePermissions";
import { api, formatError } from "../../services/api";
import type {
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
} from "../../types";
import {
  Button,
  StatusBadge,
  Badge,
  Input,
  Modal,
  ConfirmDialog,
  EmptyState,
  DataTable,
  Card,
} from "../../design-system";
import type { DataTableColumn } from "../../design-system";
import { FormField, ErrorBanner } from "./_shared";

const SCOPES = ["read", "write", "admin", "platform_admin"];

// ═══════════════════════════════════════════════════════════════════════════
// API KEYS TAB
// ═══════════════════════════════════════════════════════════════════════════

export function APIKeysTab() {
  const { canCreate: canManageKeys, canEdit, canDelete } = usePermissions();
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState<APIKeyCreated | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: keys, refetch } = useApi<APIKey[]>(() => api.apiKeys.list(), []);

  const handleToggle = async (key: APIKey) => {
    try {
      await api.apiKeys.update(key.id, { enabled: !key.enabled });
      refetch();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.apiKeys.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleCreated = (created: APIKeyCreated) => {
    setShowModal(false);
    setNewKey(created);
    refetch();
  };

  const apiKeyColumns: DataTableColumn<APIKey>[] = [
    {
      key: "name",
      label: "Name",
      render: (_v, row) => <span style={{ fontWeight: 500 }}>{row.name}</span>,
    },
    {
      key: "key_prefix",
      label: "Prefix",
      render: (_v, row) => (
        <span style={{ fontFamily: "monospace", color: "var(--color-neutral-400)" }}>
          {row.key_prefix}...
        </span>
      ),
    },
    {
      key: "scopes",
      label: "Scopes",
      render: (_v, row) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {row.scopes.map((s) => (
            <Badge
              key={s}
              variant={s === "platform_admin" ? "danger" : s === "admin" ? "warning" : "info"}
              size="sm"
            >
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "rate_limit",
      label: "Rate Limit",
      render: (_v, row) => (
        <span style={{ fontFamily: "monospace" }}>{row.rate_limit}/min</span>
      ),
    },
    {
      key: "enabled",
      label: "Status",
      render: (_v, row) => (
        <StatusBadge
          label={row.enabled ? "Active" : "Disabled"}
          tone={row.enabled ? "success" : "warning"}
        />
      ),
    },
    {
      key: "expires_at",
      label: "Expires",
      render: (_v, row) => (
        <span style={{ color: "var(--color-neutral-400)" }}>
          {row.expires_at ? format(new Date(row.expires_at), "MMM dd, yyyy") : "Never"}
        </span>
      ),
    },
    {
      key: "last_used_at",
      label: "Last Used",
      render: (_v, row) => (
        <span style={{ color: "var(--color-neutral-400)" }}>
          {row.last_used_at ? format(new Date(row.last_used_at), "MMM dd HH:mm") : "Never"}
        </span>
      ),
    },
    {
      key: "request_count",
      label: "Requests",
      render: (_v, row) => (
        <span style={{ fontFamily: "monospace" }}>{row.request_count.toLocaleString()}</span>
      ),
    },
    {
      key: "id",
      label: "Actions",
      render: (_v, row) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => handleToggle(row)} title={row.enabled ? "Disable" : "Enable"}>
              <Power size={14} color={row.enabled ? "var(--color-success-500)" : "var(--color-neutral-400)"} />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm({ id: row.id, name: row.name })}>
              <Trash2 size={14} color="var(--color-danger-500)" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* New key banner — shown once after creation */}
      {newKey && (
        <div style={{ marginBottom: 16 }}>
          <Card variant="bordered" padding="md">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Key size={16} color="var(--color-success-500)" />
                <span style={{ fontWeight: 600 }}>API Key Created — Copy it now, it won't be shown again</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewKey(null)}>
                <X size={14} />
              </Button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--color-neutral-0)", padding: "8px 12px", borderRadius: "var(--border-radius-sm)", fontFamily: "monospace", fontSize: 13 }}>
              <span style={{ flex: 1, wordBreak: "break-all" }}>{newKey.raw_key}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(newKey.raw_key)}
                title="Copy to clipboard"
              >
                <Copy size={14} />
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>API Keys</h3>
        {canManageKeys && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Create API Key
          </Button>
        )}
      </div>

      {keys && keys.length > 0 ? (
        <DataTable<APIKey>
          columns={apiKeyColumns}
          data={keys}
          striped
          hoverable
          emptyMessage="No API keys created"
        />
      ) : (
        <EmptyState title="No API keys created" />
      )}

      {showModal && (
        <APIKeyCreateModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete API Key"
        description={deleteConfirm ? `Are you sure you want to delete "${deleteConfirm.name}"? Any systems using this key will lose access immediately.` : ""}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

// ─── API Key Create Modal ─────────────────────────────────────────────────

function APIKeyCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (key: APIKeyCreated) => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "write"]);
  const [rateLimit, setRateLimit] = useState(1000);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const data: APIKeyCreate = { name, scopes, rate_limit: rateLimit };
      if (expiresAt) data.expires_at = new Date(expiresAt).toISOString();
      const created = await api.apiKeys.create(data);
      onCreated(created);
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
      title="Create API Key"
      size="md"
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving || !name || scopes.length === 0}>
            {saving ? "Creating..." : "Create Key"}
          </Button>
        </div>
      }
    >
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <FormField label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CI/CD Pipeline Key" />
      </FormField>

      <FormField label="Scopes">
        <div style={{ display: "flex", gap: 8 }}>
          {SCOPES.map((s) => {
            const selected = scopes.includes(s);
            const variant = selected
              ? s === "platform_admin" ? "danger" : s === "admin" ? "secondary" : "primary"
              : "ghost" as const;
            return (
              <Button
                key={s}
                variant={variant}
                size="sm"
                onClick={() => toggleScope(s)}
              >
                {s}
              </Button>
            );
          })}
        </div>
      </FormField>

      <FormField label="Rate Limit (requests/min)">
        <Input
          type="number"
          min={10}
          max={100000}
          value={rateLimit}
          onChange={(e) => setRateLimit(Number(e.target.value))}
        />
      </FormField>

      <FormField label="Expires At (optional)">
        <Input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </FormField>
    </Modal>
  );
}
