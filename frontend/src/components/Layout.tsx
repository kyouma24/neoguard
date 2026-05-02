import { useState, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Menu,
  Server,
  Settings,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTenantContext } from "../hooks/useTenantContext";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import styles from "./Layout.module.scss";

const SIDEBAR_KEY = "neoguard_sidebar_collapsed";

const navItems = [
  { to: "/", icon: Activity, label: "Overview" },
  { to: "/infrastructure", icon: Server, label: "Infrastructure" },
  { to: "/metrics", icon: BarChart3, label: "Metrics" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts" },
  { to: "/dashboards", icon: LayoutDashboard, label: "Dashboards" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, isImpersonating, endImpersonation } = useAuth();
  const tenantContext = useTenantContext();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <nav className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
        {/* Header: logo + toggle */}
        <div className={`${styles.sidebarHeader} ${collapsed ? styles.sidebarHeaderCollapsed : ""}`}>
          {!collapsed && (
            <div className={styles.logoGroup}>
              <Shield size={22} color="var(--color-primary-500)" />
              <span className={styles.logoText}>NeoGuard</span>
            </div>
          )}
          <button
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Menu size={16} />
          </button>
        </div>

        {/* Nav links */}
        <div className={styles.nav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                [
                  styles.navLink,
                  collapsed ? styles.navLinkCollapsed : "",
                  isActive ? styles.navLinkActive : "",
                ].filter(Boolean).join(" ")
              }
              title={collapsed ? label : undefined}
            >
              <Icon size={18} />
              {!collapsed && <span className={styles.navLabel}>{label}</span>}
            </NavLink>
          ))}
          {user?.is_super_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                [
                  styles.navLink,
                  styles.navLinkAdmin,
                  collapsed ? styles.navLinkCollapsed : "",
                  isActive ? styles.navLinkActive : "",
                ].filter(Boolean).join(" ")
              }
              title={collapsed ? "Admin" : undefined}
            >
              <ShieldCheck size={18} />
              {!collapsed && <span className={styles.navLabel}>Admin</span>}
            </NavLink>
          )}
        </div>

        {/* Tenant switcher — visible when expanded */}
        <div className={`${styles.tenantSection} ${collapsed ? styles.tenantSectionHidden : ""}`}>
          <TenantSwitcher />
        </div>
      </nav>

      {/* ── Right pane (topbar + content) ── */}
      <div className={styles.rightPane}>
        {/* Impersonation banner */}
        {isImpersonating && (
          <div className={styles.impersonationBanner}>
            <span>Viewing as {user?.name} ({user?.email}) — read-only mode</span>
            <button
              className={styles.impersonationEndBtn}
              onClick={async () => {
                await endImpersonation();
                navigate("/admin");
              }}
            >
              End Impersonation
            </button>
          </div>
        )}

        {/* Top bar */}
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {tenantContext && (
              <span className={styles.tenantContext}>{tenantContext}</span>
            )}
          </div>
          <div className={styles.topbarRight}>
            <UserMenu />
          </div>
        </div>

        {/* Main content */}
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
