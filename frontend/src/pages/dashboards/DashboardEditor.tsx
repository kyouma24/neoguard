import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import type { Dashboard, DashboardLink, PanelDefinition, PanelGroup, PanelType } from "../../types";
import { useEditModeStore } from "../../stores/editModeStore";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { WidgetRenderer } from "../../components/dashboard/WidgetRenderer";
import { WidgetErrorBoundary } from "../../components/dashboard/WidgetErrorBoundary";
import { Button, EmptyState, Input } from "../../design-system";
import { ArrowLeft, ChevronDown, ChevronRight, ClipboardPaste, Copy, Edit2, ExternalLink, FolderPlus, GripVertical, History, LayoutDashboard, Loader2, Plus, Redo2, Settings, Tag, Trash2, Undo2, X } from "lucide-react";
import { DashboardGrid, type GridLayoutItem } from "../../components/dashboard/DashboardGrid";
import { PanelEditorDrawer } from "./components/PanelEditorDrawer";
import { VersionHistoryDrawer } from "./components/VersionHistoryDrawer";
import {
  editorPanelToLayoutItem,
  panelContentHeight,
} from "../../utils/dashboardLayout";
import { isSafeHref } from "../../utils/sanitize";

const VALID_PANEL_TYPES: readonly PanelType[] = [
  "timeseries", "area", "stat", "top_list", "pie", "text",
  "gauge", "table", "scatter", "histogram", "change", "status",
  "hexbin_map", "heatmap", "treemap", "geomap", "sankey",
  "topology", "sparkline_table", "bar_gauge", "radar",
  "candlestick", "calendar_heatmap", "bubble", "waterfall",
  "box_plot", "funnel", "slo_tracker", "alert_list",
  "log_stream", "resource_inventory", "progress", "forecast_line",
  "diff_comparison",
] as const;

const ALLOWED_PANEL_KEYS = new Set<string>([
  "id", "title", "panel_type", "metric_name", "tags", "aggregation",
  "mql_query", "content", "display_options", "width", "height",
  "position_x", "position_y",
]);

/**
 * Sanitize a pasted panel object: strip unrecognized top-level keys,
 * validate panel_type, and filter unsafe URLs in display_options.dataLinks.
 * Returns null if the panel is invalid.
 */
function sanitizePastedPanel(raw: Record<string, unknown>): PanelDefinition | null {
  // Must have required fields
  if (typeof raw.panel_type !== "string" || typeof raw.title !== "string") return null;
  if (!VALID_PANEL_TYPES.includes(raw.panel_type as PanelType)) return null;

  // Strip unrecognized top-level keys
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (ALLOWED_PANEL_KEYS.has(key)) {
      cleaned[key] = raw[key];
    }
  }

  // Sanitize display_options.dataLinks URLs
  if (cleaned.display_options && typeof cleaned.display_options === "object" && cleaned.display_options !== null) {
    const opts = cleaned.display_options as Record<string, unknown>;
    if (Array.isArray(opts.dataLinks)) {
      opts.dataLinks = opts.dataLinks.filter(
        (link: unknown) =>
          typeof link === "object" &&
          link !== null &&
          typeof (link as Record<string, unknown>).url === "string" &&
          isSafeHref((link as Record<string, unknown>).url as string),
      );
    }
  }

  return cleaned as unknown as PanelDefinition;
}

interface Props {
  dashboard: Dashboard;
  onBack: () => void;
  onSettings?: () => void;
}

export function DashboardEditor({ dashboard, onBack, onSettings }: Props) {
  const { user } = useAuth();
  const queryTenantId = user?.is_super_admin ? dashboard.tenant_id : undefined;
  const [name, setName] = useState(dashboard.name);
  const [description, setDescription] = useState(dashboard.description);
  const [tags, setTags] = useState<string[]>(dashboard.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [links, setLinks] = useState<DashboardLink[]>(dashboard.links ?? []);
  const { current: panels, set: setPanels, undo: undoPanels, redo: redoPanels, canUndo, canRedo } = useUndoRedo<PanelDefinition[]>(dashboard.panels);
  const [groups, setGroups] = useState<PanelGroup[]>(dashboard.groups ?? []);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingPanel, setEditingPanel] = useState<PanelDefinition | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Zustand edit mode store integration
  const { enterEditMode, exitEditMode, markDirty, markClean, hasUnsavedChanges } = useEditModeStore();

  // Enter edit mode on mount, exit on unmount
  useEffect(() => {
    enterEditMode();
    return () => { exitEditMode(); };
  }, [enterEditMode, exitEditMode]);

  // Mark dirty when any editable state changes (skip initial render)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    markDirty();
  }, [name, description, tags, links, panels, groups, markDirty]);

  // beforeunload prompt when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditModeStore.getState().hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Undo/Redo keyboard shortcuts (Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z)
  const handleUndoRedo = useCallback(
    (e: KeyboardEvent) => {
      // Skip when user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoPanels();
      } else if (
        (e.key === "y" && !e.shiftKey) ||
        (e.key === "z" && e.shiftKey)
      ) {
        e.preventDefault();
        redoPanels();
      }
    },
    [undoPanels, redoPanels],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleUndoRedo);
    return () => window.removeEventListener("keydown", handleUndoRedo);
  }, [handleUndoRedo]);

  const handleSave = async () => {
    if (saving) return; // prevent double-click re-entry
    setSaving(true);
    setSaveError(null);
    try {
      // Filter out incomplete links — only send links with both label and valid url
      const validLinks = links.filter((l) => l.label.trim() && l.url.trim());
      await api.dashboards.update(dashboard.id, { name, description, panels, groups, tags, links: validLinks });
      setLinks(validLinks);
      markClean();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save dashboard");
    } finally {
      setSaving(false);
    }
  };

  const handleLayoutChange = (newLayout: GridLayoutItem[]) => {
    setPanels((prev) =>
      prev.map((p) => {
        const item = newLayout.find((l) => l.i === p.id);
        if (!item) return p;
        return { ...p, position_x: item.x, position_y: item.y, width: item.w, height: item.h };
      })
    );
  };

  const openAddPanel = () => {
    setIsAddingNew(true);
    setEditingPanel({
      id: `panel-${crypto.randomUUID()}`,
      title: "",
      panel_type: "timeseries",
      metric_name: "",
      tags: {},
      aggregation: "avg",
      width: 6,
      height: 4,
      position_x: 0,
      position_y: Infinity,
    });
  };

  const handleDrawerSave = (panel: PanelDefinition) => {
    if (isAddingNew) {
      setPanels((prev) => [...prev, panel]);
    } else {
      setPanels((prev) => prev.map((p) => (p.id === panel.id ? panel : p)));
    }
    setEditingPanel(null);
    setIsAddingNew(false);
  };

  const handleDrawerClose = () => {
    setEditingPanel(null);
    setIsAddingNew(false);
  };

  const removePanel = (id: string) => {
    setPanels((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => prev.map((g) => ({
      ...g,
      panel_ids: g.panel_ids.filter((pid) => pid !== id),
    })));
  };

  const duplicatePanel = (id: string) => {
    const source = panels.find((p) => p.id === id);
    if (!source) return;
    const newPanel: PanelDefinition = {
      ...source,
      id: `panel-${crypto.randomUUID()}`,
      title: `${source.title} (copy)`,
      position_y: source.position_y + source.height,
    };
    setPanels((prev) => [...prev, newPanel]);
  };

  const copyPanelJson = async (id: string) => {
    const panel = panels.find((p) => p.id === id);
    if (!panel) return;
    const json = JSON.stringify(panel, null, 2);
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS, permissions denied) — fall back to localStorage
      localStorage.setItem("neoguard_clipboard_panel", json);
    }
  };

  const pastePanelFromClipboard = async () => {
    let json = "";
    try {
      json = await navigator.clipboard.readText();
    } catch {
      json = localStorage.getItem("neoguard_clipboard_panel") ?? "";
    }
    if (!json) return;
    try {
      const raw = JSON.parse(json) as Record<string, unknown>;
      const sanitized = sanitizePastedPanel(raw);
      if (!sanitized) return;
      const newPanel: PanelDefinition = {
        ...sanitized,
        id: `panel-${crypto.randomUUID()}`,
        title: `${sanitized.title} (pasted)`,
        position_y: Infinity,
      };
      setPanels((prev) => [...prev, newPanel]);
    } catch {
      // invalid JSON, ignore
    }
  };

  const addGroup = () => {
    const newGroup: PanelGroup = {
      id: `group-${crypto.randomUUID()}`,
      label: "New Group",
      collapsed: false,
      panel_ids: [],
    };
    setGroups((prev) => [...prev, newGroup]);
  };

  const removeGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const renameGroup = (groupId: string, label: string) => {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, label } : g));
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const assignPanelToGroup = (panelId: string, groupId: string) => {
    setGroups((prev) => prev.map((g) => {
      if (g.id === groupId) {
        if (g.panel_ids.includes(panelId)) return g;
        return { ...g, panel_ids: [...g.panel_ids, panelId] };
      }
      return { ...g, panel_ids: g.panel_ids.filter((pid) => pid !== panelId) };
    }));
  };

  const unassignPanel = (panelId: string) => {
    setGroups((prev) => prev.map((g) => ({
      ...g,
      panel_ids: g.panel_ids.filter((pid) => pid !== panelId),
    })));
  };

  const groupedPanelIds = new Set(groups.flatMap((g) => g.panel_ids));
  const ungroupedPanels = panels.filter((p) => !groupedPanelIds.has(p.id));

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60_000);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Go back"><ArrowLeft size={16} /></Button>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Edit Dashboard</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveError && <span style={{ fontSize: 12, color: "var(--color-danger-500)" }}>{saveError}</span>}
          {saved && <span style={{ fontSize: 12, color: "var(--color-success-500)" }}>Saved!</span>}
          {onSettings && (
            <Button variant="ghost" size="sm" onClick={onSettings} title="Dashboard settings" aria-label="Dashboard settings">
              <Settings size={14} /> Settings
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} title="Version history" aria-label="Version history">
            <History size={14} /> History
          </Button>
          <Button variant="ghost" size="sm" onClick={addGroup} title="Add collapsible group" aria-label="Add collapsible group">
            <FolderPlus size={14} /> Group
          </Button>
          <Button variant="ghost" size="sm" onClick={pastePanelFromClipboard} title="Paste panel from clipboard" aria-label="Paste panel from clipboard">
            <ClipboardPaste size={14} /> Paste
          </Button>
          <Button variant="ghost" size="sm" onClick={undoPanels} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <Undo2 size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={redoPanels} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
            <Redo2 size={14} />
          </Button>
          <Button variant="secondary" onClick={openAddPanel} aria-label="Add panel">
            <Plus size={14} /> Add Panel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} aria-label="Save dashboard">
            {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : hasUnsavedChanges ? "Save Dashboard *" : "Save Dashboard"}
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Tags</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 10,
                background: "var(--color-primary-500)",
                color: "var(--text-on-accent)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <Tag size={10} />
              {tag}
              <button
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-on-accent)", padding: 0, display: "flex", alignItems: "center" }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                e.preventDefault();
                const val = tagInput.trim().toLowerCase();
                if (!tags.includes(val)) setTags([...tags, val]);
                setTagInput("");
              } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                setTags(tags.slice(0, -1));
              }
            }}
            placeholder={tags.length === 0 ? "Add tags (press Enter)" : ""}
            style={{
              flex: 1,
              minWidth: 120,
              padding: "4px 8px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
      </div>

      {links.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Dashboard Links</label>
          {links.map((link, i) => {
            const labelInvalid = !link.label.trim();
            const urlInvalid = !link.url.trim() || (!link.url.startsWith("http://") && !link.url.startsWith("https://") && !link.url.startsWith("mailto:") && !link.url.startsWith("/"));
            return (
              <div key={i} style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <ExternalLink size={12} color="var(--color-primary-500)" style={{ flexShrink: 0 }} />
                  <input
                    value={link.label}
                    onChange={(e) => {
                      const updated = [...links];
                      updated[i] = { ...link, label: e.target.value };
                      setLinks(updated);
                    }}
                    placeholder="Label (required)"
                    style={{ width: 140, padding: "4px 8px", fontSize: 12, border: `1px solid ${labelInvalid ? "var(--color-danger-400)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", outline: "none" }}
                  />
                  <input
                    value={link.url}
                    onChange={(e) => {
                      const updated = [...links];
                      updated[i] = { ...link, url: e.target.value };
                      setLinks(updated);
                    }}
                    placeholder="https://... or /path (required)"
                    style={{ flex: 1, padding: "4px 8px", fontSize: 12, border: `1px solid ${urlInvalid && link.url.length > 0 ? "var(--color-danger-400)" : "var(--border)"}`, borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", outline: "none" }}
                  />
                  <button
                    onClick={() => setLinks(links.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 2 }}
                    title="Remove link"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", paddingLeft: 18 }}>
                  <input
                    value={link.tooltip ?? ""}
                    onChange={(e) => {
                      const updated = [...links];
                      updated[i] = { ...link, tooltip: e.target.value };
                      setLinks(updated);
                    }}
                    placeholder="Tooltip (optional)"
                    style={{ width: 140, padding: "3px 6px", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", outline: "none" }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={link.include_vars ?? false} onChange={(e) => { const updated = [...links]; updated[i] = { ...link, include_vars: e.target.checked }; setLinks(updated); }} />
                    Include variables
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={link.include_time ?? false} onChange={(e) => { const updated = [...links]; updated[i] = { ...link, include_time: e.target.checked }; setLinks(updated); }} />
                    Include time range
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setLinks([...links, { label: "", url: "", tooltip: "", include_vars: false, include_time: false }])}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
            background: "none", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)",
            cursor: "pointer", fontSize: 12, color: "var(--color-primary-500)", fontWeight: 500,
          }}
        >
          <Plus size={12} /> Add Dashboard Link
        </button>
      </div>

      {panels.length === 0 && groups.length === 0 ? (
        <div
          style={{
            border: "2px dashed var(--color-neutral-200)",
            borderRadius: "var(--border-radius-md)",
            cursor: "pointer",
          }}
          onClick={openAddPanel}
        >
          <EmptyState
            icon={<LayoutDashboard size={48} />}
            title="No panels yet"
            description={'Click "Add Panel" or click here to start building.'}
          />
        </div>
      ) : (
        <div ref={containerRef}>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.id);
            const groupPanels = group.panel_ids
              .map((pid) => panels.find((p) => p.id === pid))
              .filter((p): p is PanelDefinition => !!p);
            return (
              <div key={group.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: isCollapsed ? 0 : 8,
                  }}
                >
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", padding: 2 }}
                  >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <input
                    value={group.label}
                    onChange={(e) => renameGroup(group.id, e.target.value)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {groupPanels.length} panel{groupPanels.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => removeGroup(group.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 4, borderRadius: 4 }}
                    title="Delete group (panels move to ungrouped)"
                    aria-label="Delete group"
                  >
                    <X size={14} />
                  </button>
                </div>
                {!isCollapsed && groupPanels.length > 0 && (
                  <DashboardGrid
                    layout={groupPanels.map(editorPanelToLayoutItem)}
                    width={containerWidth}
                    editable={true}
                    onLayoutChange={(newLayout: GridLayoutItem[]) => {
                      setPanels((prev) =>
                        prev.map((p) => {
                          const item = newLayout.find((l) => l.i === p.id);
                          if (!item) return p;
                          return { ...p, position_x: item.x, position_y: item.y, width: item.w, height: item.h };
                        })
                      );
                    }}
                  >
                    {groupPanels.map((panel) => (
                      <div key={panel.id} className="dashboard-panel">
                        <div className="dashboard-panel-header">
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <GripVertical size={14} className="panel-drag-handle" style={{ cursor: "grab", color: "var(--color-neutral-400)" }} />
                            <span>{panel.title || "Untitled"}</span>
                          </div>
                          <div style={{ display: "flex", gap: 2 }}>
                            <button
                              onClick={() => unassignPanel(panel.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4, fontSize: 10 }}
                              title="Move to ungrouped"
                              aria-label="Move to ungrouped"
                            >
                              <X size={10} />
                            </button>
                            <button
                              onClick={() => { setIsAddingNew(false); setEditingPanel(panel); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                              title="Edit panel"
                              aria-label="Edit panel"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => duplicatePanel(panel.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                              title="Duplicate panel"
                              aria-label="Duplicate panel"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              onClick={() => copyPanelJson(panel.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                              title="Copy panel JSON"
                              aria-label="Copy panel JSON"
                            >
                              <ClipboardPaste size={12} />
                            </button>
                            <button
                              onClick={() => removePanel(panel.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 4, borderRadius: 4 }}
                              title="Delete panel"
                              aria-label="Delete panel"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="dashboard-panel-body">
                          <WidgetErrorBoundary title={panel.title || "Untitled"} height={panelContentHeight(panel)}>
                            <WidgetRenderer panel={panel} from={from} to={now} interval="1m" height={panelContentHeight(panel)} />
                          </WidgetErrorBoundary>
                        </div>
                      </div>
                    ))}
                  </DashboardGrid>
                )}
                {!isCollapsed && groupPanels.length === 0 && (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)" }}>
                    Drag panels here or use the assign button on ungrouped panels below.
                  </div>
                )}
              </div>
            );
          })}

          {ungroupedPanels.length > 0 && (
            <>
              {groups.length > 0 && (
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", padding: "8px 0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ungrouped Panels
                </div>
              )}
              <DashboardGrid
                layout={ungroupedPanels.map(editorPanelToLayoutItem)}
                width={containerWidth}
                editable={true}
                onLayoutChange={handleLayoutChange}
              >
                {ungroupedPanels.map((panel) => (
                  <div key={panel.id} className="dashboard-panel">
                    <div className="dashboard-panel-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <GripVertical size={14} className="panel-drag-handle" style={{ cursor: "grab", color: "var(--color-neutral-400)" }} />
                        <span>{panel.title || "Untitled"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 2 }}>
                        {groups.length > 0 && (
                          <GroupAssignMenu groups={groups} onAssign={(gid) => assignPanelToGroup(panel.id, gid)} />
                        )}
                        <button
                          onClick={() => { setIsAddingNew(false); setEditingPanel(panel); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                          title="Edit panel"
                          aria-label="Edit panel"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => duplicatePanel(panel.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                          title="Duplicate panel"
                          aria-label="Duplicate panel"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={() => copyPanelJson(panel.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
                          title="Copy panel JSON"
                          aria-label="Copy panel JSON"
                        >
                          <ClipboardPaste size={12} />
                        </button>
                        <button
                          onClick={() => removePanel(panel.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger-500)", padding: 4, borderRadius: 4 }}
                          title="Delete panel"
                          aria-label="Delete panel"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="dashboard-panel-body">
                      <WidgetErrorBoundary title={panel.title || "Untitled"} height={panelContentHeight(panel)}>
                        <WidgetRenderer panel={panel} from={from} to={now} interval="1m" height={panelContentHeight(panel)} />
                      </WidgetErrorBoundary>
                    </div>
                  </div>
                ))}
              </DashboardGrid>
            </>
          )}
        </div>
      )}

      {editingPanel && (
        <PanelEditorDrawer
          panel={editingPanel}
          isNew={isAddingNew}
          onSave={handleDrawerSave}
          onClose={handleDrawerClose}
          queryTenantId={queryTenantId}
        />
      )}

      {showHistory && (
        <VersionHistoryDrawer
          dashboardId={dashboard.id}
          onRestore={() => {
            setShowHistory(false);
            onBack();
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function GroupAssignMenu({ groups, onAssign }: { groups: PanelGroup[]; onAssign: (groupId: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4, borderRadius: 4 }}
        title="Assign to group"
        aria-label="Assign to group"
      >
        <FolderPlus size={12} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              zIndex: 100,
              minWidth: 140,
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { onAssign(g.id); setOpen(false); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 14px",
                  fontSize: 13,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {g.label || "Unnamed Group"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
