import { PageHeader, Tabs, EmptyState } from "../design-system";
import { useURLState } from "../hooks/useURLState";
import { usePermissions } from "../hooks/usePermissions";
import { useAuth } from "../contexts/AuthContext";
import { TeamTab } from "../components/TeamTab";
import { Globe, Shield } from "lucide-react";

import { CloudAccountsTab } from "./settings/CloudTab";
import { NotificationChannelsTab } from "./settings/NotificationsTab";
import { APIKeysTab } from "./settings/ApiKeysTab";
import { ProfileTab } from "./settings/ProfileTab";
import { AuditLogTab } from "./settings/AuditTab";
import { TenantSettingsTab } from "./settings/TenantTab";

function ComingSoonTab({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
      <EmptyState
        icon={icon}
        title={title}
        description={message}
      />
    </div>
  );
}

export function SettingsPage() {
  const { role } = useAuth();
  const { canManageKeys, canInvite } = usePermissions();
  const isAdminOrOwner = role === "owner" || role === "admin";
  const [tab, setTab] = useURLState("tab", "profile");

  type TabItem = { id: string; label: string; content: React.ReactNode };
  const tabs: TabItem[] = [
    { id: "profile", label: "Profile", content: <ProfileTab /> },
  ];

  if (isAdminOrOwner) {
    tabs.push(
      { id: "cloud", label: "Cloud Accounts", content: <CloudAccountsTab /> },
      { id: "notifications", label: "Notifications", content: <NotificationChannelsTab /> },
    );
  }

  if (canManageKeys) {
    tabs.push({ id: "apikeys", label: "API Keys", content: <APIKeysTab /> });
  }

  if (canInvite) {
    tabs.push({ id: "team", label: "Team", content: <TeamTab /> });
  }

  if (isAdminOrOwner) {
    tabs.push(
      { id: "audit", label: "Audit Log", content: <AuditLogTab /> },
      { id: "tenant", label: "Tenant", content: <TenantSettingsTab /> },
    );
  }

  tabs.push(
    {
      id: "sso",
      label: "SSO",
      content: (
        <ComingSoonTab
          icon={<Globe size={48} />}
          title="Single Sign-On"
          message="Google, GitHub, Azure AD, and AWS IAM Identity Center SSO. Needs a public domain and cloud deployment — boss, we need that approval!"
        />
      ),
    },
    {
      id: "security",
      label: "Security",
      content: (
        <ComingSoonTab
          icon={<Shield size={48} />}
          title="MFA & Security"
          message="TOTP multi-factor authentication and session management. Coming after cloud deployment. Your password is strong... right?"
        />
      ),
    },
  );

  return (
    <div>
      <PageHeader title="Settings" />

      <Tabs
        tabs={tabs}
        activeTab={tab}
        onChange={setTab}
        variant="line"
      />
    </div>
  );
}
