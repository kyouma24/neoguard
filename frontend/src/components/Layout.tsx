import { NavLink } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Shield,
} from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
  { to: "/", icon: Activity, label: "Overview" },
  { to: "/metrics", icon: BarChart3, label: "Metrics" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/alerts", icon: AlertTriangle, label: "Alerts" },
  { to: "/dashboards", icon: LayoutDashboard, label: "Dashboards" },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          padding: "16px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 20px 24px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 16,
          }}
        >
          <Shield size={24} color="var(--accent)" />
          <span style={{ fontSize: 18, fontWeight: 700 }}>NeoGuard</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                background: isActive ? "rgba(99, 91, 255, 0.1)" : "transparent",
                borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                transition: "all 0.15s",
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
}
