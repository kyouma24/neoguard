import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  LogOut,
  Server,
  Settings,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { TenantSwitcher } from "./TenantSwitcher";
import styles from "./Layout.module.scss";

const navItems = [
  { to: "/", icon: Activity, label: "Overview" },
  { to: "/infrastructure", icon: Server, label: "Infrastructure" },
  { to: "/metrics", icon: BarChart3, label: "Metrics" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts" },
  { to: "/dashboards", icon: LayoutDashboard, label: "Dashboards" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isImpersonating, endImpersonation } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <div className={styles.logo}>
          <Shield size={24} color="var(--color-primary-500)" />
          <span className={styles.logoText}>NeoGuard</span>
        </div>

        <div className={styles.nav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          {user?.is_super_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
              }
            >
              <ShieldCheck size={18} />
              Admin
            </NavLink>
          )}
        </div>

        {user && (
          <div className={styles.userSection}>
            <TenantSwitcher />
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout} title="Sign out">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        )}
      </nav>

      <main className={styles.main}>
        {isImpersonating && (
          <div style={{
            background: "#fbbf24",
            color: "#78350f",
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 600,
            borderBottom: "1px solid #f59e0b",
          }}>
            <span>Viewing as {user?.name} ({user?.email}) — read-only mode</span>
            <button
              onClick={async () => {
                await endImpersonation();
                navigate("/admin");
              }}
              style={{
                background: "#78350f",
                color: "#fbbf24",
                border: "none",
                borderRadius: 4,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              End Impersonation
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
