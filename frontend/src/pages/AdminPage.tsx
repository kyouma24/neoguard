import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  ScrollText,
  BarChart3,
  Eye,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserX,
} from "lucide-react";
import { format } from "date-fns";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import type { AdminTenant, AdminUser, PlatformStats, PlatformAuditEntry } from "../types";

type AdminTab = "overview" | "tenants" | "users" | "audit";

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview");

  const tabs: { id: AdminTab; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "tenants", label: "Tenants", icon: Building2 },
    { id: "users", label: "Users", icon: Users },
    { id: "audit", label: "Audit Log", icon: ScrollText },
  ];

  return (
    <div>
      <div style={styles.header}>
        <ShieldCheck size={24} color="var(--color-primary-500)" />
        <h1 style={styles.title}>Admin Panel</h1>
      </div>

      <div style={styles.tabBar}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{ ...styles.tab, ...(tab === id ? styles.tabActive : {}) }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "tenants" && <TenantsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.stats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={styles.loading}>Loading stats...</div>;
  if (!stats) return <div style={styles.error}>Failed to load stats</div>;

  const cards = [
    { label: "Total Tenants", value: stats.tenants.total, sub: `${stats.tenants.active} active` },
    { label: "Total Users", value: stats.users.total, sub: `${stats.users.active} active` },
    { label: "Memberships", value: stats.memberships, sub: "across all tenants" },
    { label: "Active API Keys", value: stats.api_keys_active, sub: "enabled" },
  ];

  return (
    <div style={styles.grid}>
      {cards.map((c) => (
        <div key={c.label} style={styles.statCard}>
          <div style={styles.statValue}>{c.value}</div>
          <div style={styles.statLabel}>{c.label}</div>
          <div style={styles.statSub}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function TenantsTab() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    setLoading(true);
    api.admin.tenants().then(setTenants).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleStatus = async (id: string, status: string) => {
    await api.admin.setTenantStatus(id, status);
    fetch();
  };

  if (loading) return <div style={styles.loading}>Loading tenants...</div>;

  return (
    <div style={styles.table}>
      <div style={styles.tableHeader}>
        <span style={{ flex: 2 }}>Tenant</span>
        <span style={{ flex: 1 }}>Tier</span>
        <span style={{ flex: 1 }}>Status</span>
        <span style={{ flex: 1, textAlign: "center" }}>Members</span>
        <span style={{ flex: 1, textAlign: "center" }}>Created</span>
        <span style={{ flex: 1, textAlign: "right" }}>Actions</span>
      </div>
      {tenants.map((t) => (
        <div key={t.id} style={styles.tableRow}>
          <span style={{ flex: 2 }}>
            <div style={styles.cellPrimary}>{t.name}</div>
            <div style={styles.cellSub}>{t.slug}</div>
          </span>
          <span style={{ flex: 1 }}>
            <span style={styles.badge}>{t.tier}</span>
          </span>
          <span style={{ flex: 1 }}>
            <span style={{
              ...styles.badge,
              background: t.status === "active" ? "var(--color-success-50, #f0fdf4)" : "var(--color-danger-50, #fef2f2)",
              color: t.status === "active" ? "var(--color-success-700, #15803d)" : "var(--color-danger-700, #b91c1c)",
            }}>{t.status}</span>
          </span>
          <span style={{ flex: 1, textAlign: "center" }}>{t.member_count}</span>
          <span style={{ flex: 1, textAlign: "center", fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
            {format(new Date(t.created_at), "MMM d, yyyy")}
          </span>
          <span style={{ flex: 1, textAlign: "right" }}>
            {t.status === "active" ? (
              <button onClick={() => handleStatus(t.id, "suspended")} style={styles.dangerBtn}>Suspend</button>
            ) : (
              <button onClick={() => handleStatus(t.id, "active")} style={styles.successBtn}>Activate</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const { user: currentUser, refreshAuth } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    setLoading(true);
    api.admin.users().then(setUsers).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleSuperAdmin = async (userId: string, current: boolean) => {
    await api.admin.setSuperAdmin(userId, !current);
    fetch();
  };

  const toggleActive = async (userId: string, current: boolean) => {
    await api.admin.setUserActive(userId, !current);
    fetch();
  };

  const handleImpersonate = async (userId: string, userName: string) => {
    const reason = window.prompt(`Reason for impersonating ${userName}:`);
    if (!reason) return;
    try {
      await api.admin.impersonate(userId, reason);
      await refreshAuth();
      navigate("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impersonation failed");
    }
  };

  if (loading) return <div style={styles.loading}>Loading users...</div>;

  return (
    <div style={styles.table}>
      <div style={styles.tableHeader}>
        <span style={{ flex: 2 }}>User</span>
        <span style={{ flex: 1, textAlign: "center" }}>Tenants</span>
        <span style={{ flex: 1, textAlign: "center" }}>Super Admin</span>
        <span style={{ flex: 1, textAlign: "center" }}>Active</span>
        <span style={{ flex: 1, textAlign: "center" }}>Created</span>
        <span style={{ flex: 1, textAlign: "right" }}>Actions</span>
      </div>
      {users.map((u) => (
        <div key={u.id} style={styles.tableRow}>
          <span style={{ flex: 2 }}>
            <div style={styles.cellPrimary}>{u.name}</div>
            <div style={styles.cellSub}>{u.email}</div>
          </span>
          <span style={{ flex: 1, textAlign: "center" }}>{u.tenant_count}</span>
          <span style={{ flex: 1, textAlign: "center" }}>
            {u.is_super_admin ? (
              <ShieldCheck size={16} color="var(--color-primary-500)" />
            ) : (
              <ShieldOff size={16} color="var(--color-neutral-300)" />
            )}
          </span>
          <span style={{ flex: 1, textAlign: "center" }}>
            {u.is_active ? (
              <UserCheck size={16} color="var(--color-success-500, #22c55e)" />
            ) : (
              <UserX size={16} color="var(--color-danger-500, #ef4444)" />
            )}
          </span>
          <span style={{ flex: 1, textAlign: "center", fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
            {format(new Date(u.created_at), "MMM d, yyyy")}
          </span>
          <span style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 4 }}>
            <button
              onClick={() => toggleSuperAdmin(u.id, u.is_super_admin)}
              style={u.is_super_admin ? styles.dangerBtn : styles.primaryBtn}
              title={u.is_super_admin ? "Revoke super admin" : "Grant super admin"}
            >
              {u.is_super_admin ? "Revoke" : "Grant"}
            </button>
            <button
              onClick={() => toggleActive(u.id, u.is_active)}
              style={u.is_active ? styles.dangerBtn : styles.successBtn}
              title={u.is_active ? "Deactivate" : "Activate"}
            >
              {u.is_active ? "Disable" : "Enable"}
            </button>
            {u.id !== currentUser?.id && (
              <button
                onClick={() => handleImpersonate(u.id, u.name)}
                style={styles.ghostBtn}
                title="Impersonate user"
              >
                <Eye size={12} />
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
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

  if (loading) return <div style={styles.loading}>Loading audit log...</div>;

  if (entries.length === 0) {
    return <div style={styles.empty}>No audit log entries yet. Admin actions will appear here.</div>;
  }

  return (
    <div style={styles.table}>
      <div style={styles.tableHeader}>
        <span style={{ flex: 2 }}>Action</span>
        <span style={{ flex: 1 }}>Actor</span>
        <span style={{ flex: 1 }}>Target</span>
        <span style={{ flex: 1, textAlign: "right" }}>Time</span>
      </div>
      {entries.map((e) => (
        <div key={e.id} style={styles.tableRow}>
          <span style={{ flex: 2 }}>
            <span style={styles.actionBadge}>{e.action}</span>
          </span>
          <span style={{ flex: 1 }}>
            <div style={styles.cellPrimary}>{e.actor_name || "Unknown"}</div>
            <div style={styles.cellSub}>{e.actor_email}</div>
          </span>
          <span style={{ flex: 1 }}>
            <div style={styles.cellSub}>{e.target_type}: {e.target_id?.slice(0, 8)}...</div>
          </span>
          <span style={{ flex: 1, textAlign: "right", fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" }}>
            {format(new Date(e.created_at), "MMM d, HH:mm")}
          </span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-lg)",
  },
  title: {
    fontSize: "var(--typography-font-size-2xl)", fontWeight: 700,
    color: "var(--color-neutral-900)", margin: 0,
  },
  tabBar: {
    display: "flex", gap: "var(--spacing-xs)", marginBottom: "var(--spacing-lg)",
    borderBottom: "1px solid var(--color-neutral-200)", paddingBottom: "var(--spacing-sm)",
  },
  tab: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "var(--spacing-xs) var(--spacing-md)",
    border: "none", borderRadius: "var(--border-radius-md)",
    background: "transparent", color: "var(--color-neutral-500)",
    fontSize: "var(--typography-font-size-sm)", cursor: "pointer",
  },
  tabActive: {
    background: "var(--color-primary-50)", color: "var(--color-primary-700)", fontWeight: 600,
  },
  loading: { padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-neutral-500)" },
  error: { padding: "var(--spacing-xl)", textAlign: "center", color: "var(--color-danger-500, #ef4444)" },
  empty: { padding: "var(--spacing-2xl)", textAlign: "center", color: "var(--color-neutral-400)" },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--spacing-md)",
  },
  statCard: {
    background: "var(--color-neutral-0, #fff)", border: "1px solid var(--color-neutral-200)",
    borderRadius: "var(--border-radius-lg)", padding: "var(--spacing-lg)",
    textAlign: "center",
  },
  statValue: {
    fontSize: "var(--typography-font-size-3xl, 30px)", fontWeight: 700, color: "var(--color-neutral-900)",
  },
  statLabel: {
    fontSize: "var(--typography-font-size-sm)", fontWeight: 600, color: "var(--color-neutral-700)",
    marginTop: "var(--spacing-xs)",
  },
  statSub: { fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-400)" },
  table: {
    background: "var(--color-neutral-0, #fff)", border: "1px solid var(--color-neutral-200)",
    borderRadius: "var(--border-radius-lg)", overflow: "hidden",
  },
  tableHeader: {
    display: "flex", padding: "var(--spacing-sm) var(--spacing-md)",
    background: "var(--color-neutral-50)", borderBottom: "1px solid var(--color-neutral-200)",
    fontSize: "var(--typography-font-size-xs)", fontWeight: 600, color: "var(--color-neutral-500)",
    textTransform: "uppercase", letterSpacing: "0.05em",
  },
  tableRow: {
    display: "flex", alignItems: "center", padding: "var(--spacing-sm) var(--spacing-md)",
    borderBottom: "1px solid var(--color-neutral-100)",
    fontSize: "var(--typography-font-size-sm)",
  },
  cellPrimary: { fontWeight: 600, color: "var(--color-neutral-900)" },
  cellSub: { fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" },
  badge: {
    display: "inline-block", padding: "1px 8px", borderRadius: "var(--border-radius-sm)",
    fontSize: "var(--typography-font-size-xs)", fontWeight: 600,
    background: "var(--color-neutral-100)", color: "var(--color-neutral-600)",
    textTransform: "capitalize",
  },
  actionBadge: {
    display: "inline-block", padding: "1px 8px", borderRadius: "var(--border-radius-sm)",
    fontSize: "var(--typography-font-size-xs)", fontWeight: 500,
    background: "var(--color-primary-50)", color: "var(--color-primary-700)",
    fontFamily: "monospace",
  },
  primaryBtn: {
    padding: "2px 8px", borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-primary-200)", background: "var(--color-primary-50)",
    color: "var(--color-primary-700)", fontSize: "var(--typography-font-size-xs)",
    fontWeight: 600, cursor: "pointer",
  },
  successBtn: {
    padding: "2px 8px", borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-success-200, #bbf7d0)", background: "var(--color-success-50, #f0fdf4)",
    color: "var(--color-success-700, #15803d)", fontSize: "var(--typography-font-size-xs)",
    fontWeight: 600, cursor: "pointer",
  },
  dangerBtn: {
    padding: "2px 8px", borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-danger-200, #fecaca)", background: "var(--color-danger-50, #fef2f2)",
    color: "var(--color-danger-700, #b91c1c)", fontSize: "var(--typography-font-size-xs)",
    fontWeight: 600, cursor: "pointer",
  },
  ghostBtn: {
    display: "flex", alignItems: "center", padding: "2px 6px",
    borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-neutral-200)", background: "transparent",
    color: "var(--color-neutral-500)", cursor: "pointer",
  },
};
