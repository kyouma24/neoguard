import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import { api } from "../../services/api";
import {
  Card,
  Button,
  Badge,
  Input,
} from "../../design-system";
import { useAuth } from "../../contexts/AuthContext";
import { FormField } from "./_shared";

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ═══════════════════════════════════════════════════════════════════════════

export function ProfileTab() {
  const { user, refreshAuth } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const nameDirty = name.trim() !== "" && name !== user?.name;

  const handleSaveName = async () => {
    if (!nameDirty) return;
    setSaving(true);
    setNameMsg("");
    try {
      await api.auth.updateProfile({ name: name.trim() });
      await refreshAuth();
      setNameMsg("Name updated");
      setTimeout(() => setNameMsg(""), 2000);
    } catch {
      setNameMsg("Failed to update name");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError("");
    setPwMsg("");
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api.auth.updateProfile({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg("Password changed successfully");
      setTimeout(() => setPwMsg(""), 3000);
    } catch {
      setPwError("Current password is incorrect");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 600, marginTop: 16 }}>
      <Card variant="bordered" padding="md">
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "var(--color-neutral-900)" }}>Personal Information</h3>

        <FormField label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </FormField>

        <FormField label="Email">
          <Input value={user.email} disabled />
        </FormField>

        <FormField label="Account Created">
          <Input value={user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"} disabled />
        </FormField>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Button variant="primary" onClick={handleSaveName} disabled={!nameDirty || saving}>
            {saving ? "Saving..." : "Update Name"}
          </Button>
          {nameMsg && <span style={{ fontSize: 12, color: "var(--color-success-600, #16a34a)" }}>{nameMsg}</span>}
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
      <Card variant="bordered" padding="md">
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "var(--color-neutral-900)" }}>Change Password</h3>

        <FormField label="Current Password" required>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
          />
        </FormField>

        <FormField label="New Password" required>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 8 chars)"
          />
        </FormField>

        <FormField label="Confirm New Password" required>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
          />
        </FormField>

        {pwError && <div style={{ fontSize: 13, color: "var(--color-danger-500)", marginBottom: 8 }}>{pwError}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <Button
            variant="primary"
            onClick={handleChangePassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || saving}
          >
            {saving ? "Changing..." : "Change Password"}
          </Button>
          {pwMsg && <span style={{ fontSize: 12, color: "var(--color-success-600, #16a34a)" }}>{pwMsg}</span>}
        </div>
      </Card>
      </div>

      <SessionsSection />
    </div>
  );
}

function SessionsSection() {
  const { data: sessions, refetch } = useApi<{ session_id: string; tenant_id: string; role: string; is_super_admin: boolean; ttl_seconds: number; is_current: boolean }[]>(
    () => api.auth.sessions(),
    [],
  );
  const [terminating, setTerminating] = useState(false);
  const [msg, setMsg] = useState("");

  const handleTerminateAll = async () => {
    setTerminating(true);
    setMsg("");
    try {
      const result = await api.auth.terminateAllSessions();
      setMsg(`Terminated ${result.terminated} session(s)`);
      setTimeout(() => setMsg(""), 3000);
      refetch();
    } catch {
      setMsg("Failed to terminate sessions");
    } finally {
      setTerminating(false);
    }
  };

  const formatTTL = (seconds: number): string => {
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Card variant="bordered" padding="md">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--color-neutral-900)" }}>
            Active Sessions ({sessions?.length ?? 0})
          </h3>
          {sessions && sessions.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Button variant="danger" size="sm" onClick={handleTerminateAll} disabled={terminating}>
                {terminating ? "Terminating..." : "Log Out Everywhere"}
              </Button>
              {msg && <span style={{ fontSize: 12, color: "var(--color-success-600)" }}>{msg}</span>}
            </div>
          )}
        </div>
        {!sessions || sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-neutral-400)" }}>No active sessions found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.map((s) => (
              <div
                key={s.session_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: "var(--border-radius-md)",
                  background: s.is_current ? "var(--color-primary-50, #eff6ff)" : "var(--color-neutral-50, #f9fafb)",
                  border: s.is_current ? "1px solid var(--color-primary-200)" : "1px solid var(--color-neutral-200)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-neutral-800)" }}>
                    {s.session_id}
                    {s.is_current && (
                      <Badge variant="primary">current</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginTop: 2 }}>
                    Role: {s.role} {s.is_super_admin && "· Super Admin"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>
                  Expires in {formatTTL(s.ttl_seconds)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
