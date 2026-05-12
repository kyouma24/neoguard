import { useEffect, useMemo, useState } from "react";
import { api, formatError } from "../../services/api";
import type { Dashboard, DashboardSummary } from "../../types";
import { useDashboardList as useDashboardListQuery, useDeleteDashboard, useDuplicateDashboard } from "../../hooks/useDashboards";
import { usePermissions } from "../../hooks/usePermissions";
import { addRecentDashboard, getRecentDashboards, setRecentDashboardsTenantId } from "../../hooks/useRecentDashboards";
import { useAuth } from "../../contexts/AuthContext";
import { format } from "date-fns";
import { Clock, Copy, Download, Edit2, FileStack, LayoutDashboard, Plus, Search, Settings, Star, Trash2, Upload, X } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, Modal } from "../../design-system";
import { CreateDashboardModal } from "./CreateDashboardModal";
import { DashboardViewer } from "./DashboardViewer";
import { DashboardEditor } from "./DashboardEditor";
import { DashboardSettings } from "./DashboardSettings";
import { getTemplatesByCategory } from "../../data/dashboardTemplates";
import type { DashboardTemplate } from "../../data/dashboardTemplates";

type DashView =
  | { kind: "list" }
  | { kind: "view"; dashboard: Dashboard }
  | { kind: "edit"; dashboard: Dashboard }
  | { kind: "settings"; dashboard: Dashboard };

export function DashboardList() {
  const { tenant } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { data: dashboards, refetch } = useDashboardListQuery();

  // Scope recent dashboards localStorage by tenant to prevent cross-tenant data leaks
  setRecentDashboardsTenantId(tenant?.id ?? null);
  const deleteMutation = useDeleteDashboard();
  const duplicateMutation = useDuplicateDashboard();
  const [view, setView] = useState<DashView>({ kind: "list" });
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.dashboards.listFavorites().then((ids) => setFavoriteIds(new Set(ids))).catch(() => {});
  }, []);

  const recentDashboards = useMemo(() => getRecentDashboards(), [view]);

  const allTags = useMemo(() => {
    if (!dashboards) return [];
    const tags = new Set<string>();
    for (const d of dashboards) {
      for (const t of d.tags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  }, [dashboards]);

  const filteredDashboards = useMemo(() => {
    if (!dashboards) return [];
    let result = dashboards;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
      );
    }
    if (tagFilter) {
      result = result.filter((d) => (d.tags ?? []).includes(tagFilter));
    }
    return [...result].sort((a, b) => {
      const aFav = favoriteIds.has(a.id) ? 0 : 1;
      const bFav = favoriteIds.has(b.id) ? 0 : 1;
      return aFav - bFav;
    });
  }, [dashboards, searchQuery, tagFilter, favoriteIds]);

  const handleToggleFavorite = async (id: string) => {
    try {
      const { favorited } = await api.dashboards.toggleFavorite(id);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (favorited) next.add(id); else next.delete(id);
        return next;
      });
    } catch {
      // ignore
    }
  };

  const handleCreate = async (name: string, description: string) => {
    try {
      const d = await api.dashboards.create({ name, description, panels: [] });
      setShowCreate(false);
      refetch();
      setView({ kind: "edit", dashboard: d });
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleCreateFromTemplate = async (template: DashboardTemplate) => {
    try {
      let panelCounter = 0;
      const panels = template.panels.map((p) => ({
        ...p,
        id: `tpl-${template.id}-${++panelCounter}`,
      }));
      const variables = template.variables.map((v) => ({
        name: v.name,
        label: v.label,
        type: v.type as "query" | "custom" | "textbox",
        tag_key: v.tag_key,
        values: v.values ?? [],
        default_value: v.default_value ?? "",
        multi: false,
        include_all: true,
      }));
      const d = await api.dashboards.create({
        name: template.name,
        description: template.description,
        panels,
        variables,
      });
      setShowTemplates(false);
      refetch();
      setView({ kind: "edit", dashboard: d });
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirm(null);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const d = await duplicateMutation.mutateAsync(id);
      setView({ kind: "edit", dashboard: d });
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleExport = async (id: string) => {
    try {
      const json = await api.dashboards.exportJson(id);
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${json.name || id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(formatError(e));
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const d = await api.dashboards.importJson(payload);
        refetch();
        setView({ kind: "edit", dashboard: d });
      } catch (e) {
        setError(formatError(e));
      }
    };
    input.click();
  };

  const openDashboard = async (d: DashboardSummary) => {
    addRecentDashboard(d.id, d.name);
    try {
      const full = await api.dashboards.get(d.id);
      setView({ kind: "view", dashboard: full });
    } catch (e) {
      setError(formatError(e));
    }
  };

  const editDashboard = async (d: DashboardSummary) => {
    try {
      const full = await api.dashboards.get(d.id);
      setView({ kind: "edit", dashboard: full });
    } catch (e) {
      setError(formatError(e));
    }
  };

  if (view.kind === "view") {
    return (
      <DashboardViewer
        dashboard={view.dashboard}
        onBack={() => { setView({ kind: "list" }); refetch(); }}
        onEdit={() => setView({ kind: "edit", dashboard: view.dashboard })}
        onSettings={() => setView({ kind: "settings", dashboard: view.dashboard })}
      />
    );
  }

  if (view.kind === "edit") {
    return (
      <DashboardEditor
        dashboard={view.dashboard}
        onBack={() => { setView({ kind: "list" }); refetch(); }}
        onSettings={() => setView({ kind: "settings", dashboard: view.dashboard })}
      />
    );
  }

  if (view.kind === "settings") {
    return (
      <DashboardSettings
        dashboard={view.dashboard}
        onBack={() => { setView({ kind: "list" }); refetch(); }}
        onSaved={(updated) => setView({ kind: "settings", dashboard: updated })}
      />
    );
  }

  const dashboardToDelete = deleteConfirm ? dashboards?.find(d => d.id === deleteConfirm) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Dashboards</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {canCreate && (
            <Button variant="ghost" size="sm" onClick={handleImport} title="Import dashboard from JSON">
              <Upload size={14} /> Import
            </Button>
          )}
          {canCreate && (
            <Button variant="secondary" onClick={() => setShowTemplates(true)}>
              <FileStack size={14} /> From Template
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Dashboard
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger-500)", borderRadius: "var(--border-radius-md)", padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--color-danger-500)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}><X size={14} /></Button>
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-neutral-400)", pointerEvents: "none" }} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search dashboards..."
          style={{
            width: "100%",
            padding: "8px 12px 8px 34px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-neutral-400)", padding: 4 }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              style={{
                padding: "4px 10px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "var(--bg-secondary)",
                color: "var(--text-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              All
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              style={{
                padding: "4px 10px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: tagFilter === tag ? "var(--color-primary-500)" : "var(--bg-secondary)",
                color: tagFilter === tag ? "#fff" : "var(--text-secondary)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {!searchQuery && !tagFilter && recentDashboards.length > 0 && dashboards && dashboards.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Clock size={14} color="var(--color-neutral-400)" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-neutral-500)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Recently Viewed</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recentDashboards.slice(0, 6).map((r) => {
              const dash = dashboards.find((d) => d.id === r.id);
              if (!dash) return null;
              return (
                <button
                  key={r.id}
                  onClick={() => openDashboard(dash)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <LayoutDashboard size={12} color="var(--color-primary-500)" />
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {filteredDashboards.map((d) => (
          <Card key={d.id} variant="bordered" padding="md">
            <div style={{ position: "relative" }}>
              <div
                style={{ cursor: "pointer" }}
                onClick={() => openDashboard(d)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <LayoutDashboard size={18} color="var(--color-primary-500)" />
                  <span style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{d.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(d.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                    title={favoriteIds.has(d.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star
                      size={16}
                      color={favoriteIds.has(d.id) ? "var(--color-warning-500, #f59e0b)" : "var(--color-neutral-300)"}
                      fill={favoriteIds.has(d.id) ? "var(--color-warning-500, #f59e0b)" : "none"}
                    />
                  </button>
                </div>
                {d.description && (
                  <p style={{ fontSize: 13, color: "var(--color-neutral-500)", marginBottom: 8 }}>{d.description}</p>
                )}
                {(d.tags ?? []).length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {(d.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        onClick={(e) => { e.stopPropagation(); setTagFilter(tag); }}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: "var(--color-primary-500)",
                          color: "var(--text-on-accent)",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          opacity: 0.85,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-neutral-400)" }}>
                  <span>{d.panel_count} panel{d.panel_count !== 1 ? "s" : ""}</span>
                  <span>Updated {format(new Date(d.updated_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-neutral-200)" }}>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => editDashboard(d)}>
                    <Edit2 size={12} /> Edit
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={async () => { try { const full = await api.dashboards.get(d.id); setView({ kind: "settings", dashboard: full }); } catch (e) { setError(formatError(e)); } }} title="Dashboard settings">
                  <Settings size={12} />
                </Button>
                {canCreate && (
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(d.id)} title="Duplicate">
                    <Copy size={12} />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => handleExport(d.id)} title="Export JSON">
                  <Download size={12} />
                </Button>
                {canDelete && (
                  <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(d.id)}>
                    <Trash2 size={12} color="var(--color-danger-500)" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filteredDashboards.length === 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <EmptyState
              icon={<LayoutDashboard size={48} />}
              title={searchQuery ? "No matching dashboards" : "No dashboards yet"}
              description={searchQuery ? `No dashboards match "${searchQuery}".` : 'Click "New Dashboard" to create one.'}
            />
          </div>
        )}
      </div>

      <CreateDashboardModal
        isOpen={showCreate}
        onSave={handleCreate}
        onClose={() => setShowCreate(false)}
      />

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        onConfirm={() => { if (deleteConfirm) handleDelete(deleteConfirm); }}
        onCancel={() => setDeleteConfirm(null)}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${dashboardToDelete?.name ?? ""}"? This action cannot be undone.`}
        tone="danger"
        confirmLabel="Delete"
      />

      <Modal isOpen={showTemplates} onClose={() => setShowTemplates(false)} title="New from Template" size="lg">
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
            <div key={category} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>{category}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleCreateFromTemplate(t)}
                    style={{
                      padding: "14px 16px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md, 8px)",
                      background: "var(--bg-secondary)",
                      color: "var(--text-primary)",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-primary-500)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{t.description}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.panels.length} panels</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
