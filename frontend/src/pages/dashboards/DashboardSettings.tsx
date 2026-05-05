import { useCallback, useEffect, useState } from "react";
import { api, formatError } from "../../services/api";
import type {
  Dashboard,
  DashboardLink,
  DashboardMyPermission,
  DashboardPermission,
  DashboardPermissionLevel,
  DashboardVariable,
  DashboardVersion,
  MembershipInfo,
} from "../../types";
import { useAuth } from "../../contexts/AuthContext";
import { Button, Input, Tabs } from "../../design-system";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { format } from "date-fns";

interface Props {
  dashboard: Dashboard;
  onBack: () => void;
  onSaved?: (updated: Dashboard) => void;
}

export function DashboardSettings({ dashboard, onBack, onSaved }: Props) {
  const { user } = useAuth();
  const queryTenantId = user?.is_super_admin ? dashboard.tenant_id : undefined;
  const [tab, setTab] = useState("general");
  const [myPerm, setMyPerm] = useState<DashboardMyPermission | null>(null);

  useEffect(() => {
    api.dashboards.getMyPermission(dashboard.id).then(setMyPerm).catch(() => {});
  }, [dashboard.id]);

  const canAdmin = myPerm?.can_admin ?? false;

  const tabItems = [
    { id: "general", label: "General", content: <GeneralTab dashboard={dashboard} onSaved={onSaved} canEdit={myPerm?.can_edit ?? false} /> },
    { id: "permissions", label: "Permissions", content: <PermissionsTab dashboard={dashboard} canAdmin={canAdmin} /> },
    { id: "variables", label: "Variables", content: <VariablesTab dashboard={dashboard} onSaved={onSaved} canEdit={myPerm?.can_edit ?? false} queryTenantId={queryTenantId} /> },
    { id: "links", label: "Links", content: <LinksTab dashboard={dashboard} onSaved={onSaved} canEdit={myPerm?.can_edit ?? false} /> },
    { id: "versions", label: "Versions", content: <VersionsTab dashboard={dashboard} /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <Button variant="ghost" size="sm" onClick={onBack} aria-label="Go back">
          <ArrowLeft size={16} />
        </Button>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Settings — {dashboard.name}
        </h2>
      </div>
      <Tabs tabs={tabItems} activeTab={tab} onChange={setTab} variant="line" />
    </div>
  );
}

// ---- General Tab ----

function GeneralTab({ dashboard, onSaved, canEdit }: { dashboard: Dashboard; onSaved?: (d: Dashboard) => void; canEdit: boolean }) {
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description);
  const [tags, setTags] = useState<string[]>(dashboard.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.dashboards.update(dashboard.id, { name, description, tags });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.(updated);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, padding: "16px 0" }}>
      <div style={{ marginBottom: 16 }}>
        <Input label="Dashboard Name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canEdit}
          rows={3}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 13,
            resize: "vertical",
            outline: "none",
          }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Tags</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 10,
                background: "var(--color-primary-500)",
                color: "var(--text-on-accent)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {tag}
              {canEdit && (
                <button
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-on-accent)", padding: 0 }}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                  e.preventDefault();
                  const val = tagInput.trim().toLowerCase();
                  if (!tags.includes(val)) setTags([...tags, val]);
                  setTagInput("");
                }
              }}
              placeholder="Add tag (Enter)"
              style={{
                flex: 1,
                minWidth: 120,
                padding: "4px 8px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        Created: {format(new Date(dashboard.created_at), "MMM d, yyyy HH:mm")}
        {dashboard.created_by && <> &middot; by {dashboard.created_by}</>}
      </div>
      {error && <div style={{ color: "var(--color-danger-500)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {canEdit && (
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save Changes</>}
        </Button>
      )}
    </div>
  );
}

// ---- Permissions Tab ----

const PERMISSION_OPTIONS: { value: DashboardPermissionLevel; label: string; desc: string }[] = [
  { value: "view", label: "Viewer", desc: "Can view the dashboard" },
  { value: "edit", label: "Editor", desc: "Can edit panels and settings" },
  { value: "admin", label: "Admin", desc: "Full control including permissions" },
];

function PermissionsTab({ dashboard, canAdmin }: { dashboard: Dashboard; canAdmin: boolean }) {
  const { tenant } = useAuth();
  const [permissions, setPermissions] = useState<DashboardPermission[]>([]);
  const [members, setMembers] = useState<MembershipInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addUserId, setAddUserId] = useState("");
  const [addPermission, setAddPermission] = useState<DashboardPermissionLevel>("view");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [perms, memberList] = await Promise.all([
        api.dashboards.getPermissions(dashboard.id).catch(() => [] as DashboardPermission[]),
        tenant ? api.tenants.members(tenant.id) : Promise.resolve([]),
      ]);
      setPermissions(perms);
      setMembers(memberList);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [dashboard.id, tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAdd = async () => {
    if (!addUserId) return;
    setError(null);
    try {
      await api.dashboards.setPermission(dashboard.id, addUserId, addPermission);
      setAddUserId("");
      fetchData();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleChange = async (userId: string, permission: DashboardPermissionLevel) => {
    setError(null);
    try {
      await api.dashboards.setPermission(dashboard.id, userId, permission);
      fetchData();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await api.dashboards.removePermission(dashboard.id, userId);
      fetchData();
    } catch (e) {
      setError(formatError(e));
    }
  };

  const existingUserIds = new Set(permissions.map((p) => p.user_id));
  const availableMembers = members.filter((m) => !existingUserIds.has(m.user_id));

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={20} className="spin" /></div>;
  }

  const selectStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div style={{ padding: "16px 0", maxWidth: 700 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Shield size={16} color="var(--color-primary-500)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Role-Based Defaults</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
          These apply to all tenant members automatically and cannot be removed:
        </div>
        <ul style={{ margin: "4px 0 0 16px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8 }}>
          <li><strong>Super Admin / Tenant Admin / Owner</strong> — Full admin access</li>
          <li><strong>Member</strong> — Edit access (can modify panels & settings)</li>
          <li><strong>Viewer</strong> — View-only access</li>
        </ul>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          Per-User Overrides
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
          Grant explicit permissions that override the role-based defaults above.
        </div>

        {permissions.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", marginBottom: 12 }}>
            No per-user overrides. Role-based defaults apply to everyone.
          </div>
        )}

        {permissions.map((perm) => (
          <div
            key={perm.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "var(--bg-secondary)",
              borderRadius: "var(--radius-sm)",
              marginBottom: 6,
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{perm.user_name || "Unknown"}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{perm.user_email}</div>
            </div>
            {canAdmin ? (
              <>
                <select
                  value={perm.permission}
                  onChange={(e) => handleChange(perm.user_id, e.target.value as DashboardPermissionLevel)}
                  style={selectStyle}
                >
                  {PERMISSION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(perm.user_id)}>
                  <Trash2 size={12} color="var(--color-danger-500)" />
                </Button>
              </>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-secondary)", textTransform: "capitalize" }}>{perm.permission}</span>
            )}
          </div>
        ))}
      </div>

      {canAdmin && availableMembers.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
            <option value="">Select a user...</option>
            {availableMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user_name || m.user_email || m.user_id} ({m.role})
              </option>
            ))}
          </select>
          <select value={addPermission} onChange={(e) => setAddPermission(e.target.value as DashboardPermissionLevel)} style={selectStyle}>
            {PERMISSION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!addUserId}>
            <Plus size={14} /> Add
          </Button>
        </div>
      )}

      {error && <div style={{ color: "var(--color-danger-500)", fontSize: 13, marginTop: 12 }}>{error}</div>}
    </div>
  );
}

// ---- Variables Tab ----

function VariablesTab({ dashboard, onSaved, canEdit, queryTenantId }: { dashboard: Dashboard; onSaved?: (d: Dashboard) => void; canEdit: boolean; queryTenantId?: string }) {
  const [variables, setVariables] = useState<DashboardVariable[]>(dashboard.variables ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<number, string[]>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});
  const [previewError, setPreviewError] = useState<Record<number, string>>({});

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.dashboards.update(dashboard.id, { variables });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.(updated);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  const previewTagValues = async (idx: number) => {
    const v = variables[idx];
    const source = v.source ?? "metrics";
    if (source === "metrics" && !v.tag_key?.trim()) return;
    setPreviewLoading((p) => ({ ...p, [idx]: true }));
    setPreviewError((p) => ({ ...p, [idx]: "" }));
    try {
      let values: string[];
      if (source === "resources") {
        const filters: Record<string, string> = {};
        if (v.depends_on) {
          const parent = variables.find((x) => x.name === v.depends_on);
          if (parent?.resource_field && parent.default_value && parent.default_value !== "*") {
            filters[parent.resource_field] = parent.default_value;
          }
        }
        values = await api.metrics.resourceValues(v.resource_field ?? "external_id", {
          resource_type: v.resource_type,
          provider: "aws",
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
      } else {
        const filters: Record<string, string> = {};
        if (v.depends_on) {
          const parent = variables.find((x) => x.name === v.depends_on);
          if (parent?.tag_key && parent.default_value && parent.default_value !== "*") {
            filters[parent.tag_key] = parent.default_value;
          }
        }
        values = await api.metrics.tagValues(v.tag_key!.trim(), {
          metric: v.metric_filter,
          metric_prefix: v.metric_prefix,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
          tenantId: queryTenantId,
        });
      }
      setPreviewValues((p) => ({ ...p, [idx]: values }));
    } catch (e) {
      setPreviewError((p) => ({ ...p, [idx]: e instanceof Error ? e.message : "Failed to fetch" }));
      setPreviewValues((p) => ({ ...p, [idx]: [] }));
    } finally {
      setPreviewLoading((p) => ({ ...p, [idx]: false }));
    }
  };

  const addVariable = () => {
    setVariables([...variables, {
      name: `var${variables.length + 1}`,
      label: "",
      type: "query",
      values: [],
      default_value: "",
      multi: false,
      include_all: false,
    }]);
  };

  const updateVariable = (idx: number, field: string, value: unknown) => {
    setVariables(variables.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const removeVariable = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx));
  };

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    outline: "none",
  };

  return (
    <div style={{ padding: "16px 0", maxWidth: 700 }}>
      {variables.length === 0 && !canEdit && (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          No variables defined.
        </div>
      )}
      {variables.map((v, i) => (
        <div
          key={i}
          style={{
            padding: 12,
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 8, alignItems: "center" }}>
            <input
              value={v.name}
              onChange={(e) => updateVariable(i, "name", e.target.value)}
              placeholder="Variable name"
              disabled={!canEdit}
              style={inputStyle}
            />
            <input
              value={v.label}
              onChange={(e) => updateVariable(i, "label", e.target.value)}
              placeholder="Label"
              disabled={!canEdit}
              style={inputStyle}
            />
            <select
              value={v.type}
              onChange={(e) => updateVariable(i, "type", e.target.value)}
              disabled={!canEdit}
              style={inputStyle}
            >
              <option value="query">Query</option>
              <option value="custom">Custom</option>
              <option value="textbox">Textbox</option>
            </select>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => removeVariable(i)}>
                <Trash2 size={12} color="var(--color-danger-500)" />
              </Button>
            )}
          </div>
          {v.type === "query" && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <select
                  value={v.source ?? "metrics"}
                  onChange={(e) => updateVariable(i, "source", e.target.value)}
                  disabled={!canEdit}
                  style={{ ...inputStyle, width: 140 }}
                  title="Source: where to load values from"
                >
                  <option value="metrics">From Metrics</option>
                  <option value="resources">From Resources</option>
                </select>
                {(v.source ?? "metrics") === "metrics" && (
                  <input
                    value={v.tag_key ?? ""}
                    onChange={(e) => updateVariable(i, "tag_key", e.target.value)}
                    placeholder="Tag key (e.g., region, account_id)"
                    disabled={!canEdit}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                )}
                {v.source === "resources" && (
                  <>
                    <select
                      value={v.resource_field ?? "external_id"}
                      onChange={(e) => updateVariable(i, "resource_field", e.target.value)}
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 140 }}
                    >
                      <option value="external_id">Instance ID</option>
                      <option value="name">Name</option>
                      <option value="region">Region</option>
                      <option value="account_id">Account ID</option>
                      <option value="resource_type">Resource Type</option>
                    </select>
                    <input
                      value={v.resource_type ?? ""}
                      onChange={(e) => updateVariable(i, "resource_type", e.target.value || undefined)}
                      placeholder="Resource type (e.g., ec2, rds)"
                      disabled={!canEdit}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => previewTagValues(i)}
                  disabled={((v.source ?? "metrics") === "metrics" && !v.tag_key?.trim()) || previewLoading[i]}
                >
                  {previewLoading[i] ? <><Loader2 size={12} className="spin" /> Loading...</> : "Preview"}
                </Button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(v.source ?? "metrics") === "metrics" && (
                  <input
                    value={v.metric_prefix ?? ""}
                    onChange={(e) => updateVariable(i, "metric_prefix", e.target.value || undefined)}
                    placeholder="Metric prefix filter (e.g., aws.ec2.)"
                    disabled={!canEdit}
                    style={{ ...inputStyle, flex: 1 }}
                    title="Only show tag values from metrics matching this prefix"
                  />
                )}
                <select
                  value={v.depends_on ?? ""}
                  onChange={(e) => updateVariable(i, "depends_on", e.target.value || undefined)}
                  disabled={!canEdit}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  <option value="">No dependency (independent)</option>
                  {variables.filter((_, j) => j !== i).map((other) => (
                    <option key={other.name} value={other.name}>Depends on: ${other.name}</option>
                  ))}
                </select>
              </div>
              {previewError[i] && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-danger-500)" }}>
                  {previewError[i]}
                </div>
              )}
              {previewValues[i] && previewValues[i].length > 0 && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>
                    Preview ({previewValues[i].length} values):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {previewValues[i].slice(0, 50).map((val) => (
                      <span key={val} style={{ padding: "2px 6px", fontSize: 11, background: "var(--color-primary-50)", color: "var(--color-primary-700)", borderRadius: 3, border: "1px solid var(--color-primary-200)" }}>
                        {val}
                      </span>
                    ))}
                    {previewValues[i].length > 50 && (
                      <span style={{ padding: "2px 6px", fontSize: 11, color: "var(--text-muted)" }}>
                        +{previewValues[i].length - 50} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              {previewValues[i] && previewValues[i].length === 0 && !previewError[i] && !previewLoading[i] && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-warning-600)" }}>
                  No values found for tag key "{v.tag_key}". Make sure metrics have been ingested with this tag.
                </div>
              )}
            </div>
          )}
          {v.type === "custom" && (
            <div style={{ marginTop: 8 }}>
              <input
                value={(v.values ?? []).join(", ")}
                onChange={(e) => updateVariable(i, "values", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Values (comma-separated)"
                disabled={!canEdit}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <input
              value={v.default_value}
              onChange={(e) => updateVariable(i, "default_value", e.target.value)}
              placeholder="Default value"
              disabled={!canEdit}
              style={{ ...inputStyle, flex: 1 }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={v.multi} onChange={(e) => updateVariable(i, "multi", e.target.checked)} disabled={!canEdit} /> Multi
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={v.include_all} onChange={(e) => updateVariable(i, "include_all", e.target.checked)} disabled={!canEdit} /> Include All
            </label>
          </div>
        </div>
      ))}
      {error && <div style={{ color: "var(--color-danger-500)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={addVariable}>
            <Plus size={14} /> Add Variable
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Links Tab ----

function LinksTab({ dashboard, onSaved, canEdit }: { dashboard: Dashboard; onSaved?: (d: Dashboard) => void; canEdit: boolean }) {
  const [links, setLinks] = useState<DashboardLink[]>(dashboard.links ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.dashboards.update(dashboard.id, { links });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.(updated);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "16px 0", maxWidth: 700 }}>
      {links.length === 0 && !canEdit && (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          No links defined.
        </div>
      )}
      {links.map((link, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <ExternalLink size={14} color="var(--color-primary-500)" style={{ flexShrink: 0 }} />
          <input
            value={link.label}
            onChange={(e) => {
              const updated = [...links];
              updated[i] = { ...link, label: e.target.value };
              setLinks(updated);
            }}
            placeholder="Label"
            disabled={!canEdit}
            style={{
              width: 150,
              padding: "6px 10px",
              fontSize: 13,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <input
            value={link.url}
            onChange={(e) => {
              const updated = [...links];
              updated[i] = { ...link, url: e.target.value };
              setLinks(updated);
            }}
            placeholder="URL (https://...)"
            disabled={!canEdit}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 13,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <input
            value={link.tooltip ?? ""}
            onChange={(e) => {
              const updated = [...links];
              updated[i] = { ...link, tooltip: e.target.value };
              setLinks(updated);
            }}
            placeholder="Tooltip"
            disabled={!canEdit}
            style={{
              width: 120,
              padding: "6px 10px",
              fontSize: 13,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setLinks(links.filter((_, j) => j !== i))}>
              <Trash2 size={12} color="var(--color-danger-500)" />
            </Button>
          )}
        </div>
      ))}
      {error && <div style={{ color: "var(--color-danger-500)", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={() => setLinks([...links, { label: "", url: "" }])}>
            <Plus size={14} /> Add Link
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : saved ? <><Check size={14} /> Saved</> : <><Save size={14} /> Save</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Versions Tab ----

function VersionsTab({ dashboard }: { dashboard: Dashboard }) {
  const [versions, setVersions] = useState<DashboardVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.dashboards.listVersions(dashboard.id)
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dashboard.id]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}><Loader2 size={20} className="spin" /></div>;
  }

  if (versions.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No version history yet. Versions are created automatically when you save changes.
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 0", maxWidth: 700 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)" }}>Version</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)" }}>Summary</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)" }}>By</th>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "var(--text-secondary)" }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 12px" }}>v{v.version_number}</td>
              <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{v.change_summary || "—"}</td>
              <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{v.created_by}</td>
              <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>{format(new Date(v.created_at), "MMM d, HH:mm")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
