import { useCallback, useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  FileText,
  LayoutDashboard,
  Monitor,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import styles from "./CommandPalette.module.scss";

// ── Types ────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  onSelect: () => void;
}

interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

// ── Detect platform for shortcut display ─────────────────────────────────

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? "");

const MOD_KEY = isMac ? "⌘" : "Ctrl";

// ── Component ────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // ── Keyboard shortcut: Ctrl+K / Cmd+K ──────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Action helpers ─────────────────────────────────────────────────
  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate],
  );

  const isDashboardPage = location.pathname === "/dashboards";

  // ── Build command groups ───────────────────────────────────────────
  const groups: CommandGroup[] = [];

  // Navigation
  const navItems: CommandItem[] = [
    { id: "nav-overview", label: "Go to Overview", icon: Activity, keywords: ["home", "overview", "dashboard"], onSelect: () => go("/") },
    { id: "nav-infrastructure", label: "Go to Infrastructure", icon: Server, keywords: ["infra", "servers", "aws", "azure", "cloud"], onSelect: () => go("/infrastructure") },
    { id: "nav-metrics", label: "Go to Metrics Explorer", icon: BarChart3, keywords: ["metrics", "explorer", "charts", "graphs", "data"], onSelect: () => go("/metrics") },
    { id: "nav-logs", label: "Go to Logs", icon: FileText, keywords: ["logs", "events", "entries"], onSelect: () => go("/logs") },
    { id: "nav-alerts", label: "Go to Alerts", icon: AlertTriangle, keywords: ["alerts", "rules", "notifications", "firing"], onSelect: () => go("/alerts") },
    { id: "nav-dashboards", label: "Go to Insights", icon: LayoutDashboard, keywords: ["insights", "dashboards", "panels", "widgets"], onSelect: () => go("/dashboards") },
    { id: "nav-settings", label: "Go to Settings", icon: Settings, keywords: ["settings", "config", "preferences", "team", "api keys"], onSelect: () => go("/settings") },
  ];

  if (user?.is_super_admin) {
    navItems.push({
      id: "nav-admin",
      label: "Go to Admin",
      icon: ShieldCheck,
      keywords: ["admin", "super", "platform", "tenants", "users"],
      onSelect: () => go("/admin"),
    });
  }

  groups.push({ heading: "Navigation", items: navItems });

  // Dashboard actions
  const dashboardActions: CommandItem[] = [
    {
      id: "dash-create",
      label: "Create new dashboard",
      icon: Plus,
      keywords: ["new", "create", "dashboard", "add"],
      onSelect: () => go("/dashboards?action=create"),
    },
  ];

  if (isDashboardPage) {
    dashboardActions.push(
      {
        id: "dash-kiosk",
        label: "Enter kiosk mode",
        icon: Monitor,
        keywords: ["kiosk", "fullscreen", "presentation", "tv"],
        shortcut: "F",
        onSelect: () => {
          setOpen(false);
          // Dispatch a custom event that DashboardViewer can listen for
          window.dispatchEvent(new CustomEvent("neoguard:kiosk"));
        },
      },
    );
  }

  groups.push({ heading: "Insights", items: dashboardActions });

  // Time range
  const timeRanges: CommandItem[] = [
    { id: "time-5m", label: "Last 5 minutes", icon: Clock, keywords: ["time", "5", "minutes", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "5m" })); } },
    { id: "time-15m", label: "Last 15 minutes", icon: Clock, keywords: ["time", "15", "minutes", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "15m" })); } },
    { id: "time-1h", label: "Last 1 hour", icon: Clock, keywords: ["time", "1", "hour", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "1h" })); } },
    { id: "time-4h", label: "Last 4 hours", icon: Clock, keywords: ["time", "4", "hours", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "4h" })); } },
    { id: "time-24h", label: "Last 24 hours", icon: Clock, keywords: ["time", "24", "hours", "day", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "24h" })); } },
    { id: "time-7d", label: "Last 7 days", icon: Clock, keywords: ["time", "7", "days", "week", "range"], onSelect: () => { setOpen(false); window.dispatchEvent(new CustomEvent("neoguard:time-range", { detail: "7d" })); } },
  ];

  groups.push({ heading: "Time Range", items: timeRanges });

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)} data-testid="command-palette-overlay">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} data-testid="command-palette">
        <Command label="Command palette" loop>
          {/* Search input */}
          <div className={styles.inputWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <Command.Input
              className={styles.input}
              placeholder="Type a command or search..."
              autoFocus
            />
          </div>

          {/* Results list */}
          <Command.List className={styles.list}>
            <Command.Empty className={styles.empty}>
              No results found.
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group key={group.heading} heading={group.heading} className={styles.groupHeading}>
                {group.items.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    keywords={[item.label, ...(item.keywords ?? [])]}
                    onSelect={item.onSelect}
                    className={styles.item}
                  >
                    <span className={styles.itemIcon}>
                      <item.icon size={16} />
                    </span>
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.shortcut && (
                      <span className={styles.itemShortcut}>{item.shortcut}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer */}
          <div className={styles.footer}>
            <span className={styles.footerKey}>
              <kbd className={styles.footerKbd}>&uarr;</kbd>
              <kbd className={styles.footerKbd}>&darr;</kbd>
              navigate
            </span>
            <span className={styles.footerKey}>
              <kbd className={styles.footerKbd}>&crarr;</kbd>
              select
            </span>
            <span className={styles.footerKey}>
              <kbd className={styles.footerKbd}>esc</kbd>
              close
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

// ── Trigger button (for top bar) ─────────────────────────────────────────

export function CommandPaletteTrigger() {
  const handleClick = useCallback(() => {
    // Simulate Ctrl+K to open the palette
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: !isMac,
      metaKey: isMac,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, []);

  return (
    <button
      className={styles.trigger}
      onClick={handleClick}
      title={`Search commands (${MOD_KEY}+K)`}
      aria-label="Open command palette"
    >
      <Search size={14} />
      <span>Search...</span>
      <kbd className={styles.triggerKbd}>{MOD_KEY}K</kbd>
    </button>
  );
}
