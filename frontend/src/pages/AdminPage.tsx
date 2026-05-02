import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useURLState } from "../hooks/useURLState";
import {
  Eye,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import { format } from "date-fns";
import { api, formatError } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Tabs,
} from "../design-system";
import type { DataTableColumn } from "../design-system";
import type { AdminTenant, AdminUser, PlatformStats, PlatformAuditEntry, SecurityLogEntry } from "../types";

interface DestructiveConfirm {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning" | "info";
  targetName?: string;
  onConfirm: () => Promise<void>;
}

function TypedConfirmDialog({
  confirm,
  onClose,
}: {
  confirm: DestructiveConfirm | null;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const requiresTyping = confirm?.targetName != null;
  const canConfirm = !requiresTyping || typed === confirm?.targetName;

  const handleConfirm = async () => {
    if (!confirm || !canConfirm) return;
    setLoading(true);
    try {
      await confirm.onConfirm();
    } finally {
      setLoading(false);
      setTyped("");
      onClose();
    }
  };

  const handleCancel = () => {
    setTyped("");
    onClose();
  };

  if (!confirm) return null;

  if (requiresTyping) {
    return (
      <Modal isOpen title={confirm.title} onClose={handleCancel} size="sm">
        <p style={{ fontSize: 13, color: "var(--color-neutral-600)", marginBottom: 16 }}>
          {confirm.description}
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--color-neutral-700)" }}>
            Type <strong>{confirm.targetName}</strong> to confirm
          </label>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirm.targetName}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" onClick={handleCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canConfirm || loading}>
            {loading ? "Working..." : confirm.confirmLabel}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <ConfirmDialog
      isOpen
      title={confirm.title}
      description={confirm.description}
      confirmLabel={confirm.confirmLabel}
      tone={confirm.tone}
      loading={loading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}

export function AdminPage() {
  const [tab, setTab] = useURLState("tab", "overview");

  const tabItems = [
    { id: "overview", label: "Overview", content: <OverviewTab /> },
    { id: "tenants", label: "Tenants", content: <TenantsTab /> },
    { id: "users", label: "Users", content: <UsersTab /> },
    { id: "audit", label: "Audit Log", content: <AuditTab /> },
    { id: "security", label: "Security Log", content: <SecurityTab /> },
  ];

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px", marginBottom: "var(--spacing-md)",
        background: "var(--color-danger-50, #fef2f2)",
        border: "1px solid var(--color-danger-200, #fecaca)",
        borderLeft: "4px solid var(--color-danger-600, #dc2626)",
        borderRadius: "var(--border-radius-md)",
        color: "var(--color-danger-700, #b91c1c)",
        fontSize: "var(--typography-font-size-sm)", fontWeight: 700,
        letterSpacing: "0.05em", textTransform: "uppercase",
      }}>
        <ShieldCheck size={16} />
        <span>SUPER ADMIN MODE</span>
      </div>

      <PageHeader
        title="[ADMIN] Platform Administration"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={20} color="var(--color-danger-600, #dc2626)" />
          </div>
        }
      />

      <Tabs
        tabs={tabItems}
        activeTab={tab}
        onChange={setTab}
        variant="pill"
      />
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" }}>Loading stats...</div>;
  if (!stats) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-danger-500)" }}>Failed to load stats</div>;

  const cards = [
    { label: "Total Tenants", value: stats.tenants.total, sub: `${stats.tenants.active} active` },
    { label: "Total Users", value: stats.users.total, sub: `${stats.users.active} active` },
    { label: "Memberships", value: stats.memberships, sub: "across all tenants" },
    { label: "Active API Keys", value: stats.api_keys_active, sub: "enabled" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--spacing-md)" }}>
      {cards.map((c) => (
        <Card key={c.label} variant="bordered" padding="lg">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--typography-font-size-3xl, 30px)", fontWeight: 700, color: "var(--color-neutral-900)" }}>{c.value}</div>
            <div style={{ fontSize: "var(--typography-font-size-sm)", fontWeight: 600, color: "var(--color-neutral-700)", marginTop: "var(--spacing-xs)" }}>{c.label}</div>
            <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)" }}>{c.sub}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

type TenantRow = AdminTenant & { _actions?: never };

function TenantsTab() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<DestructiveConfirm | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchTenants = useCallback(() => {
    setLoading(true);
    api.admin.tenants().then(setTenants).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return;
    setCreating(true);
    try {
      await api.admin.createTenant({ name: newTenantName.trim() });
      setNewTenantName("");
      setShowCreate(false);
      fetchTenants();
    } catch { /* handled by API layer */ }
    finally { setCreating(false); }
  };

  const requestDelete = (t: AdminTenant) => {
    setConfirm({
      title: `Delete "${t.name}"?`,
      description: `This will permanently mark "${t.name}" as deleted. All members will lose access. Type the tenant name to confirm.`,
      confirmLabel: "Delete Tenant",
      tone: "danger",
      targetName: t.name,
      onConfirm: async () => {
        await api.admin.deleteTenant(t.id);
        fetchTenants();
      },
    });
  };

  const requestSuspend = (t: AdminTenant) => {
    setConfirm({
      title: `Suspend "${t.name}"?`,
      description: `This will immediately block all members of "${t.name}" from accessing the platform. Type the tenant name to confirm.`,
      confirmLabel: "Suspend Tenant",
      tone: "danger",
      targetName: t.name,
      onConfirm: async () => {
        await api.admin.setTenantStatus(t.id, "suspended");
        fetchTenants();
      },
    });
  };

  const requestActivate = (t: AdminTenant) => {
    setConfirm({
      title: `Activate "${t.name}"?`,
      description: `This will restore access for all members of "${t.name}".`,
      confirmLabel: "Activate",
      tone: "info",
      onConfirm: async () => {
        await api.admin.setTenantStatus(t.id, "active");
        fetchTenants();
      },
    });
  };

  const statusTone = (s: string) =>
    s === "active" ? "success" as const : s === "deleted" ? "neutral" as const : "danger" as const;

  const columns: DataTableColumn<TenantRow>[] = [
    {
      key: "name",
      label: "Tenant",
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--color-neutral-900)" }}>{row.name}</div>
          <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>{row.slug}</div>
        </div>
      ),
    },
    {
      key: "tier",
      label: "Tier",
      render: (_, row) => <Badge variant="info" size="sm">{row.tier}</Badge>,
    },
    {
      key: "status",
      label: "Status",
      render: (_, row) => <StatusBadge label={row.status} tone={statusTone(row.status)} />,
    },
    {
      key: "member_count",
      label: "Members",
    },
    {
      key: "created_at",
      label: "Created",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {format(new Date(row.created_at), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "_actions",
      label: "",
      render: (_, row) => (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
          {row.status !== "deleted" && (
            <>
              {row.status === "active" ? (
                <Button variant="danger" size="sm" onClick={() => requestSuspend(row)}>Suspend</Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => requestActivate(row)}>Activate</Button>
              )}
              <Button variant="danger" size="sm" onClick={() => requestDelete(row)}>Delete</Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" }}>Loading tenants...</div>;

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        {showCreate ? (
          <>
            <Input
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
              placeholder="New tenant name"
              style={{ maxWidth: 300 }}
            />
            <Button variant="primary" size="sm" onClick={handleCreateTenant} disabled={creating || !newTenantName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewTenantName(""); }}>Cancel</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create Tenant</Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={tenants as TenantRow[]}
        emptyMessage="No tenants found."
        striped
        hoverable
      />
      <TypedConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

type UserRow = AdminUser & { _actions?: never };

function UsersTab() {
  const { user: currentUser, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<DestructiveConfirm | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchUsers = useCallback(() => {
    setLoading(true);
    api.admin.users().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const requestToggleSuperAdmin = (u: AdminUser) => {
    if (u.is_super_admin) {
      setConfirm({
        title: `Revoke super admin from "${u.name}"?`,
        description: `This will remove platform-level admin access for ${u.email}. They will retain their tenant-level roles.`,
        confirmLabel: "Revoke",
        tone: "danger",
        onConfirm: async () => {
          await api.admin.setSuperAdmin(u.id, false);
          fetchUsers();
        },
      });
    } else {
      setConfirm({
        title: `Grant super admin to "${u.name}"?`,
        description: `This will give ${u.email} full platform-level admin access including tenant management and user management.`,
        confirmLabel: "Grant Admin",
        tone: "warning",
        onConfirm: async () => {
          await api.admin.setSuperAdmin(u.id, true);
          fetchUsers();
        },
      });
    }
  };

  const requestToggleActive = (u: AdminUser) => {
    if (u.is_active) {
      setConfirm({
        title: `Deactivate "${u.name}"?`,
        description: `This will immediately prevent ${u.email} from logging in. All active sessions will be invalidated. Type the user's name to confirm.`,
        confirmLabel: "Deactivate",
        tone: "danger",
        targetName: u.name,
        onConfirm: async () => {
          await api.admin.setUserActive(u.id, false);
          fetchUsers();
        },
      });
    } else {
      setConfirm({
        title: `Activate "${u.name}"?`,
        description: `This will restore login access for ${u.email}.`,
        confirmLabel: "Activate",
        tone: "info",
        onConfirm: async () => {
          await api.admin.setUserActive(u.id, true);
          fetchUsers();
        },
      });
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      await api.admin.createUser({
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
      });
      setNewUser({ name: "", email: "", password: "" });
      setShowCreate(false);
      fetchUsers();
    } catch (err) {
      setCreateError(formatError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleImpersonate = async (userId: string, userName: string) => {
    const reason = window.prompt(`Reason for impersonating ${userName}:`);
    if (!reason) return;
    try {
      await api.admin.impersonate(userId, reason);
      await refreshAuth();
      navigate("/");
    } catch (err) {
      alert(formatError(err));
    }
  };

  const columns: DataTableColumn<UserRow>[] = [
    {
      key: "name",
      label: "User",
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--color-neutral-900)" }}>{row.name}</div>
          <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>{row.email}</div>
        </div>
      ),
    },
    { key: "tenant_count", label: "Tenants" },
    {
      key: "is_super_admin",
      label: "Super Admin",
      render: (_, row) => row.is_super_admin
        ? <ShieldCheck size={16} color="var(--color-primary-500)" />
        : <ShieldOff size={16} color="var(--color-neutral-300)" />,
    },
    {
      key: "is_active",
      label: "Active",
      render: (_, row) => row.is_active
        ? <UserCheck size={16} color="var(--color-success-500, #22c55e)" />
        : <UserX size={16} color="var(--color-danger-500, #ef4444)" />,
    },
    {
      key: "created_at",
      label: "Created",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {format(new Date(row.created_at), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "_actions",
      label: "",
      render: (_, row) => (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
          <Button
            variant={row.is_super_admin ? "danger" : "primary"}
            size="sm"
            onClick={() => requestToggleSuperAdmin(row)}
            title={row.is_super_admin ? "Revoke super admin" : "Grant super admin"}
          >
            {row.is_super_admin ? "Revoke" : "Grant"}
          </Button>
          <Button
            variant={row.is_active ? "danger" : "ghost"}
            size="sm"
            onClick={() => requestToggleActive(row)}
            title={row.is_active ? "Deactivate" : "Activate"}
          >
            {row.is_active ? "Disable" : "Enable"}
          </Button>
          {row.id !== currentUser?.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleImpersonate(row.id, row.name)}
              title="Impersonate user"
            >
              <Eye size={12} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" }}>Loading users...</div>;

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {showCreate ? (
          <>
            <Input
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              placeholder="Full name"
              style={{ maxWidth: 180 }}
            />
            <Input
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              placeholder="email@example.com"
              style={{ maxWidth: 220 }}
            />
            <Input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              placeholder="Password (min 8)"
              style={{ maxWidth: 180 }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateUser}
              disabled={creating || !newUser.name.trim() || !newUser.email.trim() || newUser.password.length < 8}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setNewUser({ name: "", email: "", password: "" }); setCreateError(""); }}>
              Cancel
            </Button>
            {createError && <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-danger-500)" }}>{createError}</span>}
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>Create User</Button>
        )}
      </div>
      <DataTable
        columns={columns}
        data={users as UserRow[]}
        emptyMessage="No users found."
        striped
        hoverable
      />
      <TypedConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<PlatformAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    setLoading(true);
    api.admin.auditLog().then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const columns: DataTableColumn<PlatformAuditEntry>[] = [
    {
      key: "action",
      label: "Action",
      render: (_, row) => <Badge variant="info">{row.action}</Badge>,
    },
    {
      key: "actor_name",
      label: "Actor",
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, color: "var(--color-neutral-900)" }}>{row.actor_name || "Unknown"}</div>
          <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>{row.actor_email}</div>
        </div>
      ),
    },
    {
      key: "target_type",
      label: "Target",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {row.target_type}: {row.target_id?.slice(0, 8)}...
        </span>
      ),
    },
    {
      key: "created_at",
      label: "Time",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {format(new Date(row.created_at), "MMM d, HH:mm")}
        </span>
      ),
    },
  ];

  if (loading) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" }}>Loading audit log...</div>;

  if (entries.length === 0) {
    return <div style={{ padding: "var(--spacing-2xl)", textAlign: "center", color: "var(--color-neutral-400)" }}>No audit log entries yet. Admin actions will appear here.</div>;
  }

  return (
    <DataTable
      columns={columns}
      data={entries}
      emptyMessage="No audit log entries yet."
      striped
      hoverable
    />
  );
}

function SecurityTab() {
  const [entries, setEntries] = useState<SecurityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchEntries = useCallback(() => {
    setLoading(true);
    const params: { event_type?: string; success?: boolean; limit: number } = { limit: 100 };
    if (filter === "failures") params.success = false;
    if (filter !== "all" && filter !== "failures") params.event_type = filter;
    api.admin.securityLog(params).then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const columns: DataTableColumn<SecurityLogEntry>[] = [
    {
      key: "event_type",
      label: "Event",
      render: (_, row) => <Badge variant="info">{row.event_type}</Badge>,
    },
    {
      key: "success",
      label: "Result",
      render: (_, row) => (
        <StatusBadge
          label={row.success ? "success" : "failure"}
          tone={row.success ? "success" : "danger"}
        />
      ),
    },
    {
      key: "user_name",
      label: "User",
      render: (_, row) => row.user_name ? (
        <div>
          <div style={{ fontWeight: 600, color: "var(--color-neutral-900)" }}>{row.user_name}</div>
          <div style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>{row.user_email}</div>
        </div>
      ) : (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {(row.details?.email as string) || "—"}
        </span>
      ),
    },
    {
      key: "ip_address",
      label: "IP Address",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)", fontFamily: "monospace" }}>
          {row.ip_address || "—"}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "Time",
      render: (_, row) => (
        <span style={{ fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
          {format(new Date(row.created_at), "MMM d, HH:mm:ss")}
        </span>
      ),
    },
  ];

  if (loading) return <div style={{ padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" }}>Loading security log...</div>;

  return (
    <>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["all", "login", "logout", "signup", "password_change", "failures"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "ghost"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "password_change" ? "password" : f}
          </Button>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={entries}
        emptyMessage="No security log entries match this filter."
        striped
        hoverable
      />
    </>
  );
}
