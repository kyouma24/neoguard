import { useState, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  ChevronLeftCircle,
  FileText,
  Gauge,
  LayoutDashboard,
  Moon,
  Radar,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useTenantContext } from "../hooks/useTenantContext";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette";
import styles from "./Layout.module.scss";

const SIDEBAR_KEY = "neoguard_sidebar_collapsed";

const navItems = [
  { to: "/", icon: Activity, label: "Overview" },
  { to: "/infrastructure", icon: Radar, label: "Infrastructure" },
  { to: "/metrics", icon: Gauge, label: "Explorer" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
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
  const { theme, toggleTheme } = useTheme();
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
          {!collapsed ? (
            <>
              <div className={styles.logoGroup}>
                <img src="/neoguard-logo.png" alt="NeoGuard" width={28} height={28} style={{ borderRadius: 6 }} />
                <span className={styles.logoText}>NeoGuard</span>
              </div>
              <button
                className={styles.collapseBtn}
                onClick={toggleCollapsed}
                title="Collapse sidebar"
              >
                <ChevronLeftCircle size={16} />
              </button>
            </>
          ) : (
            <button
              className={styles.collapseBtn}
              onClick={toggleCollapsed}
              title="Expand sidebar"
              style={{ width: 32, height: 32 }}
            >
              <img src="/neoguard-logo.png" alt="NeoGuard" width={24} height={24} style={{ borderRadius: 4 }} />
            </button>
          )}
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
            <CommandPaletteTrigger />
            <button
              onClick={toggleTheme}
              className={styles.themeToggle}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <UserMenu />
          </div>
        </div>

        {/* Main content */}
        <main className={styles.main}>
          {children}
        </main>
      </div>

      {/* Command palette — available on every page */}
      <CommandPalette />
    </div>
  );
}
