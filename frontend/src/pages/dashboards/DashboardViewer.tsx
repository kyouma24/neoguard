import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { Annotation, Dashboard, MetricQueryResult, PanelDefinition, PanelGroup } from "../../types";
import { WidgetRenderer } from "../../components/dashboard/WidgetRenderer";
import { WidgetErrorBoundary } from "../../components/dashboard/WidgetErrorBoundary";
import { TimeRangePicker, getTimeRange, getIntervalForRange } from "../../components/dashboard/TimeRangePicker";
import { AutoRefresh, getRefreshSeconds } from "../../components/dashboard/AutoRefresh";
import { VariableBar } from "../../components/dashboard/VariableBar";
import { FullscreenPanel } from "../../components/dashboard/FullscreenPanel";
// CrosshairProvider replaced by Zustand useCrosshairStore — no Provider needed
import { AnnotationModal } from "../../components/dashboard/AnnotationModal";
import { KeyboardShortcutOverlay } from "../../components/dashboard/KeyboardShortcutOverlay";
import { LiveModePill } from "../../components/dashboard/LiveModePill";
import { ShareMenu } from "../../components/dashboard/ShareMenu";
import { FreshnessIndicator } from "../../components/dashboard/FreshnessIndicator";
import { PanelInspector } from "../../components/dashboard/PanelInspector";
import { ChangeIntelligenceBar } from "../../components/dashboard/ChangeIntelligenceBar";
import { DashboardComments } from "../../components/dashboard/DashboardComments";
import { useAuth } from "../../contexts/AuthContext";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useChangeIntelligence } from "../../hooks/useChangeIntelligence";
import { useBatchPanelQueries } from "../../hooks/useBatchPanelQueries";
import { Button, EmptyState } from "../../design-system";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Code2, Edit2, GitCompareArrows, Info, Layers, LayoutDashboard, Maximize2, MessageSquarePlus, Monitor, RefreshCw, Settings } from "lucide-react";
import { DashboardGrid } from "../../components/dashboard/DashboardGrid";
import { CorrelationOverlay } from "../../components/dashboard/CorrelationView";
import { api } from "../../services/api";
import { isSafeHref } from "../../utils/sanitize";
import {
  panelToLayoutItem,
  panelContentHeight,
} from "../../utils/dashboardLayout";
import { needsMigration, migrateToLatest } from "../../utils/layoutMigrations";

interface Props {
  dashboard: Dashboard;
  onBack: () => void;
  onEdit: () => void;
  onSettings?: () => void;
}

export function DashboardViewer({ dashboard: rawDashboard, onBack, onEdit, onSettings }: Props) {
  const { user } = useAuth();
  const authorName = user?.name || user?.email || "Anonymous";

  // Apply forward-only layout migrations if the dashboard is behind the latest version.
  const dashboard = useMemo<Dashboard>(() => {
    if (!needsMigration(rawDashboard)) return rawDashboard;
    return migrateToLatest(rawDashboard as unknown as Record<string, unknown>) as unknown as Dashboard;
  }, [rawDashboard]);

  const queryTenantId = user?.is_super_admin ? dashboard.tenant_id : undefined;

  const [dvParams, setDvParams] = useSearchParams();
  const timeRangeKey = dvParams.get("range") || "1h";
  const isKiosk = dvParams.get("kiosk") === "1";
  const setTimeRangeKey = useCallback((v: string) => {
    setDvParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "1h") next.delete("range"); else next.set("range", v);
      return next;
    }, { replace: true });
  }, [setDvParams]);
  const [autoRefreshKey, setAutoRefreshKey] = useState(isKiosk ? "30s" : "off");
  const [refreshKey, setRefreshKey] = useState(0);
  const [customFrom, setCustomFrom] = useState<string | undefined>(dvParams.get("from") ?? undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(dvParams.get("to") ?? undefined);
  const [varValues, setVarValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of dashboard.variables ?? []) {
      const urlVal = dvParams.get(`var_${v.name}`);
      initial[v.name] = urlVal ?? v.default_value ?? "";
    }
    return initial;
  });
  const [fullscreenPanel, setFullscreenPanel] = useState<PanelDefinition | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const g of dashboard.groups ?? []) {
      if (g.collapsed) initial.add(g.id);
    }
    return initial;
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotateTimestamp, setAnnotateTimestamp] = useState<Date | null>(null);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [correlationActive, setCorrelationActive] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loadAnnouncement, setLoadAnnouncement] = useState("");
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [widgetErrorCount, setWidgetErrorCount] = useState(0);
  const [inspectPanel, setInspectPanel] = useState<PanelDefinition | null>(null);
  const [panelDataMap, setPanelDataMap] = useState<Record<string, MetricQueryResult[] | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const tabVisibleRef = useRef(true);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track widget data freshness: update timestamp whenever refreshKey changes
  useEffect(() => {
    setLastUpdateTime(new Date());
    const timer = setTimeout(() => {
      const errorElements = containerRef.current?.querySelectorAll('[data-testid="widget-error-boundary"]');
      setWidgetErrorCount(errorElements?.length ?? 0);
    }, 1500);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  // Announce dashboard load status for screen readers
  useEffect(() => {
    const totalWidgets = dashboard.panels.length;
    if (totalWidgets === 0) {
      setLoadAnnouncement("Dashboard loaded with no panels");
      return;
    }
    // Announce after a short delay to allow widgets to render
    const timer = setTimeout(() => {
      const errorElements = containerRef.current?.querySelectorAll('[data-testid="widget-error-boundary"]');
      const errorCount = errorElements?.length ?? 0;
      const loaded = totalWidgets - errorCount;
      setLoadAnnouncement(
        errorCount > 0
          ? `${loaded} widgets loaded, ${errorCount} errors`
          : `${totalWidgets} widgets loaded`
      );
    }, 2000);
    return () => clearTimeout(timer);
  }, [dashboard.panels.length, refreshKey]);

  // SSE live stream — heartbeat-only skeleton, data push wired later via Redis pub/sub
  const { status: liveStatus } = useLiveStream({
    dashboardId: dashboard.id,
    enabled: isLive,
    onMessage: (msg) => {
      // Future: handle "points" messages to update panels in real-time.
      // For now, heartbeats keep the connection alive.
      if (msg.type === "close") {
        // Server closed after max duration; the hook auto-reconnects.
      }
    },
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const secs = getRefreshSeconds(autoRefreshKey);
    if (!secs) {
      refreshIntervalRef.current = null;
      return;
    }
    const id = setInterval(() => {
      if (tabVisibleRef.current) {
        setRefreshKey((k) => k + 1);
      }
    }, secs * 1000);
    refreshIntervalRef.current = id;
    return () => clearInterval(id);
  }, [autoRefreshKey]);

  useEffect(() => {
    const handler = () => {
      tabVisibleRef.current = !document.hidden;
      if (!document.hidden) {
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "?" && !showShortcuts) {
        setShowShortcuts(true);
        return;
      }
      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
        } else {
          onBack();
        }
        return;
      }
      if (showShortcuts) return;
      if (e.key === "f" || e.key === "F") {
        setDvParams((prev) => {
          const next = new URLSearchParams(prev);
          if (next.get("kiosk") === "1") {
            next.delete("kiosk");
          } else {
            next.set("kiosk", "1");
          }
          return next;
        }, { replace: true });
      } else if (e.key === "r" || e.key === "R") {
        setRefreshKey((k) => k + 1);
      } else if (e.key === "e" || e.key === "E") {
        onEdit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [setDvParams, onEdit, onBack, showShortcuts]);

  // Auto-enter live mode when time range is "now" and auto-refresh is active.
  // Auto-exit when user selects a historical (custom) time range.
  const isNowRange = timeRangeKey !== "custom";
  const isAutoRefreshActive = autoRefreshKey !== "off";
  useEffect(() => {
    if (isNowRange && isAutoRefreshActive) {
      setIsLive(true);
    } else if (!isNowRange) {
      setIsLive(false);
    }
  }, [isNowRange, isAutoRefreshActive]);

  const handleCustomRange = useCallback((f: string, t: string) => {
    setCustomFrom(f);
    setCustomTo(t);
    setDvParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("range", "custom");
      next.set("from", f);
      next.set("to", t);
      return next;
    }, { replace: true });
  }, [setDvParams]);

  const handleTimeRangeChange = useCallback((from: Date, to: Date) => {
    handleCustomRange(from.toISOString(), to.toISOString());
  }, [handleCustomRange]);

  const { from, to } = useMemo(
    () => getTimeRange(timeRangeKey, customFrom, customTo),
    [timeRangeKey, customFrom, customTo, refreshKey]
  );
  const interval = useMemo(
    () => getIntervalForRange(timeRangeKey, customFrom, customTo),
    [timeRangeKey, customFrom, customTo]
  );
  const rangeDurationMs = to.getTime() - from.getTime();
  const comparePeriodMs = compareEnabled ? rangeDurationMs : undefined;

  // Batch panel queries: single streaming request for all eligible panels
  const batchResults = useBatchPanelQueries({
    panels: dashboard.panels,
    from,
    to,
    interval,
    variables: varValues,
    refreshKey,
    dashboardId: dashboard.id,
    queryTenantId,
    enabled: dashboard.panels.length > 0,
  });

  // Change Intelligence: fetch current/previous period averages for all panels when comparison is active
  const changeIntelligencePanels = useChangeIntelligence({
    panels: dashboard.panels,
    from,
    to,
    interval,
    comparePeriodMs,
    refreshKey,
    variables: varValues,
  });

  const handleChangeBarClick = useCallback((panelId: string) => {
    const el = containerRef.current?.querySelector(`[data-panel-id="${panelId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Brief highlight flash
      el.classList.add("panel-highlight");
      setTimeout(() => el.classList.remove("panel-highlight"), 1500);
    }
  }, []);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const fetchAnnotations = useCallback(() => {
    if (!annotationsEnabled) {
      setAnnotations([]);
      return;
    }
    api.annotations
      .list({
        dashboard_id: dashboard.id,
        from: fromIso,
        to: toIso,
      }, { tenantId: queryTenantId })
      .then(setAnnotations)
      .catch(() => setAnnotations([]));
  }, [dashboard.id, fromIso, toIso, annotationsEnabled, queryTenantId]);

  useEffect(() => {
    fetchAnnotations();
  }, [fetchAnnotations, refreshKey]);

  const handleAnnotate = useCallback((timestamp: Date) => {
    setAnnotateTimestamp(timestamp);
  }, []);

  const handlePanelDataReady = useCallback((panelId: string, data: MetricQueryResult[] | null) => {
    setPanelDataMap((prev) => ({ ...prev, [panelId]: data }));
  }, []);

  const handleFilterChange = useCallback((key: string, value: string) => {
    // Find a template variable whose tag_key or name matches the filter key
    const vars = dashboard.variables ?? [];
    const match = vars.find((v) => v.tag_key === key || v.name === key);
    if (!match) return;
    const name = match.name;

    setVarValues((prev) => {
      const next = { ...prev, [name]: value };
      // Sync URL params
      setDvParams((params) => {
        const updated = new URLSearchParams(params);
        if (value) updated.set(`var_${name}`, value); else updated.delete(`var_${name}`);
        return updated;
      }, { replace: true });
      return next;
    });
  }, [dashboard.variables, setDvParams]);

  const shiftTime = useCallback((direction: 1 | -1) => {
    const shiftMs = rangeDurationMs / 2;
    const newFrom = new Date(from.getTime() + direction * shiftMs);
    const newTo = new Date(to.getTime() + direction * shiftMs);
    handleCustomRange(newFrom.toISOString(), newTo.toISOString());
  }, [rangeDurationMs, from, to, handleCustomRange]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }, []);

  const groups = dashboard.groups ?? [];
  const hasGroups = groups.length > 0;

  const toggleKiosk = useCallback(() => {
    setDvParams((prev) => {
      const next = new URLSearchParams(prev);
      if (next.get("kiosk") === "1") next.delete("kiosk"); else next.set("kiosk", "1");
      return next;
    }, { replace: true });
  }, [setDvParams]);

  if (fullscreenPanel) {
    return (
      <FullscreenPanel
        panel={fullscreenPanel}
        from={from}
        to={to}
        interval={interval}
        refreshKey={refreshKey}
        variables={varValues}
        onClose={() => setFullscreenPanel(null)}
      />
    );
  }

  return (
    <div style={isKiosk ? { padding: 20 } : undefined}>
      <div aria-live="polite" className="sr-only" role="status">
        {loadAnnouncement}
      </div>
      {!isKiosk && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button variant="ghost" size="sm" onClick={onBack} aria-label="Go back"><ArrowLeft size={16} /></Button>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{dashboard.name}</h2>
              {dashboard.description && <p style={{ fontSize: 13, color: "var(--color-neutral-500)", margin: 0 }}>{dashboard.description}</p>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--color-neutral-400)" }}>
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
            <Button variant="ghost" size="sm" onClick={() => shiftTime(-1)} title="Shift time back" aria-label="Shift time back">
              <ChevronLeft size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => shiftTime(1)} title="Shift time forward" aria-label="Shift time forward">
              <ChevronRight size={14} />
            </Button>
            <TimeRangePicker
              value={timeRangeKey}
              onChange={setTimeRangeKey}
              customFrom={customFrom}
              customTo={customTo}
              onCustomRange={handleCustomRange}
            />
            <LiveModePill
              status={liveStatus}
              isLive={isLive}
              onToggle={() => setIsLive((v) => !v)}
            />
            <AutoRefresh value={autoRefreshKey} onChange={setAutoRefreshKey} />
            <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)} title="Refresh now (R)" aria-label="Refresh now">
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCompareEnabled((v) => !v)}
              title="Compare with previous period"
              aria-label="Compare with previous period"
              style={compareEnabled ? { background: "var(--color-primary-500)", color: "var(--text-on-accent)", borderRadius: "var(--radius-sm)" } : undefined}
            >
              <Layers size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnnotationsEnabled((v) => !v)}
              title="Toggle annotations (Ctrl+Click chart to add)"
              aria-label="Toggle annotations"
              style={annotationsEnabled ? { background: "var(--color-primary-500)", color: "var(--text-on-accent)", borderRadius: "var(--radius-sm)" } : undefined}
            >
              <MessageSquarePlus size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCorrelationActive(true)}
              title="Correlate panels"
              aria-label="Correlate panels"
            >
              <GitCompareArrows size={14} />
            </Button>
            <ShareMenu dashboardId={dashboard.id} />
            <DashboardComments dashboardId={dashboard.id} authorName={authorName} />
            <Button variant="ghost" size="sm" onClick={toggleKiosk} title="Kiosk mode (F)" aria-label="Toggle kiosk mode">
              <Monitor size={14} />
            </Button>
            {onSettings && <Button variant="ghost" onClick={onSettings} aria-label="Dashboard settings"><Settings size={14} /></Button>}
            <Button variant="secondary" onClick={onEdit} aria-label="Edit dashboard"><Edit2 size={14} /> Edit</Button>
          </div>
        </div>
      )}

      {isKiosk && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, opacity: 0.6 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{dashboard.name}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Press F to exit kiosk mode</span>
        </div>
      )}

      {(dashboard.links?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {dashboard.links!.filter((link) => isSafeHref(link.url)).map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={link.tooltip || undefined}
              style={{
                padding: "4px 12px",
                borderRadius: 14,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--color-primary-500)",
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}

      {(dashboard.variables?.length ?? 0) > 0 && (
        <VariableBar
          variables={dashboard.variables}
          values={varValues}
          onChange={(vals) => {
            setVarValues(vals);
            setDvParams((prev) => {
              const next = new URLSearchParams(prev);
              for (const [k, v] of Object.entries(vals)) {
                if (v) next.set(`var_${k}`, v); else next.delete(`var_${k}`);
              }
              return next;
            }, { replace: true });
          }}
          queryTenantId={queryTenantId}
        />
      )}

      {compareEnabled && changeIntelligencePanels.length > 0 && (
        <ChangeIntelligenceBar
          panels={changeIntelligencePanels}
          onPanelClick={handleChangeBarClick}
        />
      )}

      {dashboard.panels.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard size={48} />}
          title="No panels yet"
          description="Click Edit to add panels."
        />
      ) : (
          <div ref={containerRef}>
            {hasGroups ? (
              <GroupedPanelGrid
                groups={groups}
                panels={dashboard.panels}
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
                containerWidth={containerWidth}
                from={from}
                to={to}
                interval={interval}
                refreshKey={refreshKey}
                variables={varValues}
                onFullscreen={setFullscreenPanel}
                onInspect={setInspectPanel}
                onTimeRangeChange={handleTimeRangeChange}
                comparePeriodMs={comparePeriodMs}
                annotations={annotationsEnabled ? annotations : undefined}
                onAnnotate={handleAnnotate}
                onFilterChange={handleFilterChange}
                onPanelDataReady={handlePanelDataReady}
                batchResults={batchResults}
                queryTenantId={queryTenantId}
              />
            ) : (
              <DashboardGrid
                layout={dashboard.panels.map(panelToLayoutItem)}
                width={containerWidth}
                editable={false}
              >
                {dashboard.panels.map((panel) => (
                  <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
                    <PanelHeader panel={panel} onFullscreen={() => setFullscreenPanel(panel)} onInspect={() => setInspectPanel(panel)} />
                    <div className="dashboard-panel-body">
                      <WidgetErrorBoundary title={panel.title} height={panelContentHeight(panel)} resetKey={`${refreshKey}-${timeRangeKey}`}>
                        <WidgetRenderer
                          panel={panel}
                          from={from}
                          to={to}
                          interval={interval}
                          height={panelContentHeight(panel)}
                          refreshKey={refreshKey}
                          variables={varValues}
                          onTimeRangeChange={handleTimeRangeChange}
                          comparePeriodMs={comparePeriodMs}
                          annotations={annotationsEnabled ? annotations : undefined}
                          onAnnotate={handleAnnotate}
                          onFilterChange={handleFilterChange}
                          onDataReady={(d) => handlePanelDataReady(panel.id, d)}
                          preloadedResult={batchResults[panel.id]}
                          queryTenantId={queryTenantId}
                        />
                      </WidgetErrorBoundary>
                    </div>
                  </div>
                ))}
              </DashboardGrid>
            )}
          </div>
      )}

      {/* Freshness indicator bar at the bottom */}
      {dashboard.panels.length > 0 && (
        <FreshnessIndicator
          lastUpdateTime={lastUpdateTime}
          widgetCount={dashboard.panels.length}
          errorCount={widgetErrorCount}
          liveStatus={isLive ? liveStatus : undefined}
        />
      )}

      {annotateTimestamp && (
        <AnnotationModal
          timestamp={annotateTimestamp}
          dashboardId={dashboard.id}
          onClose={() => setAnnotateTimestamp(null)}
          onCreated={fetchAnnotations}
        />
      )}

      {showShortcuts && (
        <KeyboardShortcutOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {correlationActive && (
        <CorrelationOverlay
          panels={dashboard.panels}
          from={from}
          to={to}
          interval={interval}
          refreshKey={refreshKey}
          variables={varValues}
          onClose={() => setCorrelationActive(false)}
        />
      )}

      {inspectPanel && (
        <PanelInspector
          panel={inspectPanel}
          data={panelDataMap[inspectPanel.id] ?? null}
          from={from}
          to={to}
          interval={interval}
          onClose={() => setInspectPanel(null)}
        />
      )}
    </div>
  );
}

interface GroupedPanelGridProps {
  groups: PanelGroup[];
  panels: PanelDefinition[];
  collapsedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
  containerWidth: number;
  from: Date;
  to: Date;
  interval: string;
  refreshKey: number;
  variables: Record<string, string>;
  onFullscreen: (panel: PanelDefinition) => void;
  onInspect: (panel: PanelDefinition) => void;
  onTimeRangeChange: (from: Date, to: Date) => void;
  comparePeriodMs?: number;
  annotations?: Annotation[];
  onAnnotate?: (timestamp: Date) => void;
  onFilterChange?: (key: string, value: string) => void;
  onPanelDataReady?: (panelId: string, data: MetricQueryResult[] | null) => void;
  batchResults: Record<string, import("../../hooks/useBatchPanelQueries").PanelBatchResult>;
  queryTenantId?: string;
}

function GroupedPanelGrid({
  groups, panels, collapsedGroups, onToggleGroup,
  containerWidth,
  from, to, interval, refreshKey, variables, onFullscreen, onInspect,
  onTimeRangeChange, comparePeriodMs, annotations, onAnnotate, onFilterChange, onPanelDataReady,
  batchResults, queryTenantId,
}: GroupedPanelGridProps) {
  const groupedPanelIds = new Set(groups.flatMap((g) => g.panel_ids));
  const ungroupedPanels = panels.filter((p) => !groupedPanelIds.has(p.id));

  const ordered: ({ type: "group"; group: PanelGroup } | { type: "ungrouped" })[] = [];
  for (const g of groups) ordered.push({ type: "group", group: g });
  if (ungroupedPanels.length > 0) ordered.push({ type: "ungrouped" });

  return (
    <div>
      {ordered.map((section) => {
        if (section.type === "group") {
          const { group } = section;
          const isCollapsed = collapsedGroups.has(group.id);
          const groupPanels = group.panel_ids
            .map((pid) => panels.find((p) => p.id === pid))
            .filter((p): p is PanelDefinition => !!p);
          return (
            <div key={group.id} style={{ marginBottom: 8 }}>
              <button
                onClick={() => onToggleGroup(group.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 16px",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: isCollapsed ? 0 : 8,
                }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                {group.label}
                <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginLeft: "auto" }}>
                  {groupPanels.length} panel{groupPanels.length !== 1 ? "s" : ""}
                </span>
              </button>
              {!isCollapsed && groupPanels.length > 0 && (
                <DashboardGrid
                  layout={groupPanels.map(panelToLayoutItem)}
                  width={containerWidth}
                  editable={false}
                >
                  {groupPanels.map((panel) => (
                    <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
                      <PanelHeader panel={panel} onFullscreen={() => onFullscreen(panel)} onInspect={() => onInspect(panel)} />
                      <div className="dashboard-panel-body">
                        <WidgetErrorBoundary title={panel.title} height={panelContentHeight(panel)} resetKey={`${refreshKey}-${interval}`}>
                          <WidgetRenderer
                            panel={panel}
                            from={from}
                            to={to}
                            interval={interval}
                            height={panelContentHeight(panel)}
                            refreshKey={refreshKey}
                            variables={variables}
                            onTimeRangeChange={onTimeRangeChange}
                            comparePeriodMs={comparePeriodMs}
                            annotations={annotations}
                            onAnnotate={onAnnotate}
                            onFilterChange={onFilterChange}
                            onDataReady={(d) => onPanelDataReady?.(panel.id, d)}
                            preloadedResult={batchResults[panel.id]}
                            queryTenantId={queryTenantId}
                          />
                        </WidgetErrorBoundary>
                      </div>
                    </div>
                  ))}
                </DashboardGrid>
              )}
            </div>
          );
        }
        return (
          <div key="__ungrouped" style={{ marginBottom: 8 }}>
            <DashboardGrid
              layout={ungroupedPanels.map(panelToLayoutItem)}
              width={containerWidth}
              editable={false}
            >
              {ungroupedPanels.map((panel) => (
                <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
                  <PanelHeader panel={panel} onFullscreen={() => onFullscreen(panel)} onInspect={() => onInspect(panel)} />
                  <div className="dashboard-panel-body">
                    <WidgetErrorBoundary title={panel.title} height={panelContentHeight(panel)} resetKey={`${refreshKey}-${interval}`}>
                      <WidgetRenderer
                        panel={panel}
                        from={from}
                        to={to}
                        interval={interval}
                        height={panelContentHeight(panel)}
                        refreshKey={refreshKey}
                        variables={variables}
                        onTimeRangeChange={onTimeRangeChange}
                        comparePeriodMs={comparePeriodMs}
                        annotations={annotations}
                        onAnnotate={onAnnotate}
                        onFilterChange={onFilterChange}
                        onDataReady={(d) => onPanelDataReady?.(panel.id, d)}
                        preloadedResult={batchResults[panel.id]}
                        queryTenantId={queryTenantId}
                      />
                    </WidgetErrorBoundary>
                  </div>
                </div>
              ))}
            </DashboardGrid>
          </div>
        );
      })}
    </div>
  );
}

interface PanelHeaderProps {
  panel: PanelDefinition;
  onFullscreen: () => void;
  onInspect?: () => void;
}

function PanelHeader({ panel, onFullscreen, onInspect }: PanelHeaderProps) {
  const description = panel.display_options?.description;
  return (
    <div className="dashboard-panel-header">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {panel.title}
        {description && (
          <span className="panel-description-tooltip-wrapper" aria-label={description}>
            <Info size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <span className="panel-description-tooltip" role="tooltip">{description}</span>
          </span>
        )}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        {onInspect && (
          <button
            onClick={(e) => { e.stopPropagation(); onInspect(); }}
            className="panel-inspect-btn"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, opacity: 0 }}
            title="Inspect panel"
            aria-label="Inspect panel"
          >
            <Code2 size={12} />
          </button>
        )}
        <button
          onClick={onFullscreen}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, opacity: 0.5 }}
          title="Fullscreen"
          aria-label="Fullscreen panel"
        >
          <Maximize2 size={12} />
        </button>
      </span>
    </div>
  );
}
