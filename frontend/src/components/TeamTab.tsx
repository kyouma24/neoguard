import { useState, useEffect } from "react";
import { UserPlus, Shield, Trash2, Crown } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import type { MembershipInfo } from "../types";

const ROLES = ["owner", "admin", "member", "viewer"] as const;

export function TeamTab() {
  const { user, tenant } = useAuth();
  const { canInvite, canEdit, canDelete } = usePermissions();
  const [members, setMembers] = useState<MembershipInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const fetchMembers = async () => {
    if (!tenant) return;
    try {
      const data = await api.tenants.members(tenant.id);
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [tenant?.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setInviting(true);
    setError("");
    try {
      await api.tenants.invite(tenant.id, { email: inviteEmail, role: inviteRole });
      setInviteEmail("");
      setInviteRole("member");
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (memberId: string, newRole: string) => {
    if (!tenant) return;
    setError("");
    try {
      await api.tenants.changeRole(tenant.id, memberId, newRole);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!tenant) return;
    setError("");
    try {
      await api.tenants.removeMember(tenant.id, memberId);
      await fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading team members...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>
          <Shield size={18} />
          Team Members
        </h3>
        <span style={styles.memberCount}>{members.length} member{members.length !== 1 ? "s" : ""}</span>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {canInvite && (
        <form onSubmit={handleInvite} style={styles.inviteForm}>
          <input
            type="email"
            placeholder="colleague@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={styles.input}
            required
          />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={styles.select}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button type="submit" style={styles.inviteBtn} disabled={inviting}>
            <UserPlus size={14} />
            {inviting ? "Adding..." : "Add member"}
          </button>
        </form>
      )}

      <div style={styles.memberList}>
        {members.map((m) => (
          <div key={m.user_id} style={styles.memberRow}>
            <div style={styles.memberInfo}>
              <div style={styles.memberAvatar}>
                {(m.user_name || m.user_email || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={styles.memberName}>
                  {m.user_name || "Unknown"}
                  {m.user_id === user?.id && <span style={styles.youBadge}>you</span>}
                </div>
                <div style={styles.memberEmail}>{m.user_email}</div>
              </div>
            </div>

            <div style={styles.memberActions}>
              {canEdit && m.user_id !== user?.id ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                    style={styles.roleSelect}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {canDelete && (
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      style={styles.removeBtn}
                      title="Remove member"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              ) : (
                <span style={styles.roleBadge}>
                  {m.role === "owner" && <Crown size={12} />}
                  {m.role}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: "var(--spacing-md)" },
  loading: { padding: "var(--spacing-xl)", color: "var(--color-neutral-500)", textAlign: "center" },
  sectionHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    paddingBottom: "var(--spacing-sm)", borderBottom: "1px solid var(--color-neutral-200)",
  },
  sectionTitle: {
    display: "flex", alignItems: "center", gap: "var(--spacing-sm)",
    fontSize: "var(--typography-font-size-lg)", fontWeight: 600, color: "var(--color-neutral-900)", margin: 0,
  },
  memberCount: { fontSize: "var(--typography-font-size-sm)", color: "var(--color-neutral-500)" },
  error: {
    padding: "var(--spacing-sm) var(--spacing-md)",
    background: "var(--color-danger-50, #fef2f2)", border: "1px solid var(--color-danger-200, #fecaca)",
    borderRadius: "var(--border-radius-md)", color: "var(--color-danger-700, #b91c1c)",
    fontSize: "var(--typography-font-size-sm)",
  },
  inviteForm: { display: "flex", gap: "var(--spacing-sm)", alignItems: "center" },
  input: {
    flex: 1, padding: "var(--spacing-xs) var(--spacing-sm)", borderRadius: "var(--border-radius-md)",
    border: "1px solid var(--color-neutral-300)", fontSize: "var(--typography-font-size-sm)",
    background: "var(--color-neutral-0, #fff)", color: "var(--color-neutral-900)",
  },
  select: {
    padding: "var(--spacing-xs) var(--spacing-sm)", borderRadius: "var(--border-radius-md)",
    border: "1px solid var(--color-neutral-300)", fontSize: "var(--typography-font-size-sm)",
    background: "var(--color-neutral-0, #fff)", color: "var(--color-neutral-900)", textTransform: "capitalize",
  },
  inviteBtn: {
    display: "flex", alignItems: "center", gap: "var(--spacing-xs)",
    padding: "var(--spacing-xs) var(--spacing-md)", borderRadius: "var(--border-radius-md)",
    border: "none", background: "var(--color-primary-500)", color: "#fff",
    fontSize: "var(--typography-font-size-sm)", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  memberList: { display: "flex", flexDirection: "column" },
  memberRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "var(--spacing-sm) 0",
    borderBottom: "1px solid var(--color-neutral-100)",
  },
  memberInfo: { display: "flex", alignItems: "center", gap: "var(--spacing-sm)" },
  memberAvatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "var(--color-primary-100)", color: "var(--color-primary-700)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "var(--typography-font-size-sm)", fontWeight: 600,
  },
  memberName: {
    fontSize: "var(--typography-font-size-sm)", fontWeight: 600,
    color: "var(--color-neutral-900)", display: "flex", alignItems: "center", gap: 4,
  },
  youBadge: {
    fontSize: 10, padding: "0 4px", borderRadius: "var(--border-radius-sm)",
    background: "var(--color-neutral-100)", color: "var(--color-neutral-500)",
  },
  memberEmail: { fontSize: "var(--typography-font-size-xs)", color: "var(--color-neutral-500)" },
  memberActions: { display: "flex", alignItems: "center", gap: "var(--spacing-sm)" },
  roleSelect: {
    padding: "2px var(--spacing-xs)", borderRadius: "var(--border-radius-sm)",
    border: "1px solid var(--color-neutral-200)", fontSize: "var(--typography-font-size-xs)",
    background: "var(--color-neutral-0, #fff)", color: "var(--color-neutral-900)", textTransform: "capitalize",
  },
  removeBtn: {
    display: "flex", alignItems: "center", padding: 4,
    border: "1px solid var(--color-neutral-200)", borderRadius: "var(--border-radius-sm)",
    background: "transparent", color: "var(--color-neutral-400)", cursor: "pointer",
  },
  roleBadge: {
    display: "flex", alignItems: "center", gap: 4,
    fontSize: "var(--typography-font-size-xs)", fontWeight: 600,
    color: "var(--color-primary-700)", background: "var(--color-primary-50)",
    padding: "2px 8px", borderRadius: "var(--border-radius-sm)", textTransform: "capitalize",
  },
};
