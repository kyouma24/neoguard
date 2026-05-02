import { useState } from "react";
import { api } from "../../services/api";
import {
  Card,
  Button,
  Input,
} from "../../design-system";
import { useAuth } from "../../contexts/AuthContext";
import { FormField } from "./_shared";

// ═══════════════════════════════════════════════════════════════════════════
// TENANT SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════

export function TenantSettingsTab() {
  const { tenant, role, refreshAuth } = useAuth();
  const [name, setName] = useState(tenant?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const canEdit = role === "owner" || role === "admin";
  const dirty = name.trim() !== "" && name !== tenant?.name;

  const handleSave = async () => {
    if (!tenant || !dirty) return;
    setSaving(true);
    try {
      await api.tenants.update(tenant.id, { name: name.trim() });
      await refreshAuth();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error handled by API layer
    } finally {
      setSaving(false);
    }
  };

  if (!tenant) return null;

  return (
    <div style={{ maxWidth: 600, marginTop: 16 }}>
      <Card variant="bordered" padding="md">
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "var(--color-neutral-900)" }}>Tenant Information</h3>

        <FormField label="Tenant Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Organization"
            disabled={!canEdit}
          />
        </FormField>

        <FormField label="Slug">
          <Input value={tenant.slug} disabled />
        </FormField>

        <FormField label="Tier">
          <Input value={tenant.tier} disabled />
        </FormField>

        <FormField label="Status">
          <Input value={tenant.status} disabled />
        </FormField>

        <FormField label="Created">
          <Input value={tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : "—"} disabled />
        </FormField>

        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {saved && <span style={{ fontSize: 12, color: "var(--color-success-600, #16a34a)" }}>Saved</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
