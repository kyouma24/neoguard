import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import type { Dashboard, PanelDefinition, PanelGroup } from "../../types";
import { WidgetRenderer } from "../../components/dashboard/WidgetRenderer";
import { WidgetErrorBoundary } from "../../components/dashboard/WidgetErrorBoundary";
import { getTimeRange, getIntervalForRange } from "../../components/dashboard/TimeRangePicker";
import { VariableBar } from "../../components/dashboard/VariableBar";
import { DashboardGrid } from "../../components/dashboard/DashboardGrid";
import { api } from "../../services/api";
import {
  panelToLayoutItem,
  panelContentHeight,
} from "../../utils/dashboardLayout";
import { needsMigration, migrateToLatest } from "../../utils/layoutMigrations";

const EMBED_REFRESH_INTERVAL_MS = 60_000;

/**
 * Embeddable read-only dashboard viewer.
 * Renders panels and optional variable bar with no header, sidebar, or navigation.
 * Auto-refreshes every 60 seconds.
 */
export function DashboardEmbed() {
  const { id } = useParams<{ id: string }>();
  const [rawDashboard, setRawDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // Fetch dashboard on mount
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.dashboards
      .get(id)
      .then((d) => {
        setRawDashboard(d);
        setError(null);
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Failed to load dashboard";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, EMBED_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Track container width for responsive grid
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(Math.floor(w));
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Apply layout migrations
  const dashboard = useMemo<Dashboard | null>(() => {
    if (!rawDashboard) return null;
    if (!needsMigration(rawDashboard)) return rawDashboard;
    return migrateToLatest(rawDashboard as unknown as Record<string, unknown>) as unknown as Dashboard;
  }, [rawDashboard]);

  // Variable state
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  // Initialize variable values when dashboard loads
  useEffect(() => {
    if (!dashboard) return;
    const initial: Record<string, string> = {};
    for (const v of dashboard.variables ?? []) {
      initial[v.name] = v.default_value ?? "";
    }
    setVarValues(initial);
  }, [dashboard]);

  // Fixed time range: last 1 hour (no user controls in embed mode)
  const timeRangeKey = "1h";
  const { from, to } = getTimeRange(timeRangeKey, undefined, undefined);
  const interval = getIntervalForRange(timeRangeKey, undefined, undefined);

  if (loading) {
    return (
      <div style={embedContainerStyle}>
        <div style={centeredStyle}>
          <span style={{ color: "var(--text-muted, #5a6178)", fontSize: 14 }}>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div style={embedContainerStyle}>
        <div style={centeredStyle}>
          <span style={{ color: "var(--error, #ef4444)", fontSize: 14 }}>
            {error ?? "Dashboard not found"}
          </span>
        </div>
      </div>
    );
  }

  const groups = dashboard.groups ?? [];
  const hasGroups = groups.length > 0;

  return (
    <div style={embedContainerStyle}>
      {(dashboard.variables?.length ?? 0) > 0 && (
        <VariableBar
          variables={dashboard.variables}
          values={varValues}
          onChange={setVarValues}
        />
      )}

      {dashboard.panels.length === 0 ? (
        <div style={centeredStyle}>
          <span style={{ color: "var(--text-muted, #5a6178)", fontSize: 14 }}>No panels</span>
        </div>
      ) : (
        <div ref={containerRef}>
          {hasGroups ? (
            <EmbedGroupedGrid
              groups={groups}
              panels={dashboard.panels}
              containerWidth={containerWidth}
              from={from}
              to={to}
              interval={interval}
              refreshKey={refreshKey}
              variables={varValues}
            />
          ) : (
            <DashboardGrid
              layout={dashboard.panels.map(panelToLayoutItem)}
              width={containerWidth}
              editable={false}
            >
              {dashboard.panels.map((panel) => (
                <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
                  <EmbedPanelHeader title={panel.title} />
                  <div className="dashboard-panel-body">
                    <WidgetErrorBoundary
                      title={panel.title}
                      height={panelContentHeight(panel)}
                      resetKey={`${refreshKey}-${timeRangeKey}`}
                    >
                      <WidgetRenderer
                        panel={panel}
                        from={from}
                        to={to}
                        interval={interval}
                        height={panelContentHeight(panel)}
                        refreshKey={refreshKey}
                        variables={varValues}
                      />
                    </WidgetErrorBoundary>
                  </div>
                </div>
              ))}
            </DashboardGrid>
          )}
        </div>
      )}
    </div>
  );
}

// --- Internal sub-components ---

function EmbedPanelHeader({ title }: { title: string }) {
  return (
    <div className="dashboard-panel-header">
      <span>{title}</span>
    </div>
  );
}

interface EmbedGroupedGridProps {
  groups: PanelGroup[];
  panels: PanelDefinition[];
  containerWidth: number;
  from: Date;
  to: Date;
  interval: string;
  refreshKey: number;
  variables: Record<string, string>;
}

function EmbedGroupedGrid({
  groups,
  panels,
  containerWidth,
  from,
  to,
  interval,
  refreshKey,
  variables,
}: EmbedGroupedGridProps) {
  const groupedPanelIds = new Set(groups.flatMap((g) => g.panel_ids));
  const ungroupedPanels = panels.filter((p) => !groupedPanelIds.has(p.id));

  return (
    <div>
      {groups.map((group) => {
        const groupPanels = group.panel_ids
          .map((pid) => panels.find((p) => p.id === pid))
          .filter((p): p is PanelDefinition => !!p);

        if (groupPanels.length === 0) return null;

        return (
          <div key={group.id} style={{ marginBottom: 8 }}>
            <div
              style={{
                padding: "8px 16px",
                background: "var(--bg-tertiary, #242836)",
                border: "1px solid var(--border, #2d3348)",
                borderRadius: "var(--radius-sm, 4px)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary, #e4e7ef)",
                marginBottom: 8,
              }}
            >
              {group.label}
            </div>
            <DashboardGrid
              layout={groupPanels.map(panelToLayoutItem)}
              width={containerWidth}
              editable={false}
            >
              {groupPanels.map((panel) => (
                <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
                  <EmbedPanelHeader title={panel.title} />
                  <div className="dashboard-panel-body">
                    <WidgetErrorBoundary
                      title={panel.title}
                      height={panelContentHeight(panel)}
                      resetKey={`${refreshKey}-${interval}`}
                    >
                      <WidgetRenderer
                        panel={panel}
                        from={from}
                        to={to}
                        interval={interval}
                        height={panelContentHeight(panel)}
                        refreshKey={refreshKey}
                        variables={variables}
                      />
                    </WidgetErrorBoundary>
                  </div>
                </div>
              ))}
            </DashboardGrid>
          </div>
        );
      })}

      {ungroupedPanels.length > 0 && (
        <DashboardGrid
          layout={ungroupedPanels.map(panelToLayoutItem)}
          width={containerWidth}
          editable={false}
        >
          {ungroupedPanels.map((panel) => (
            <div key={panel.id} className="dashboard-panel" data-panel-id={panel.id}>
              <EmbedPanelHeader title={panel.title} />
              <div className="dashboard-panel-body">
                <WidgetErrorBoundary
                  title={panel.title}
                  height={panelContentHeight(panel)}
                  resetKey={`${refreshKey}-${interval}`}
                >
                  <WidgetRenderer
                    panel={panel}
                    from={from}
                    to={to}
                    interval={interval}
                    height={panelContentHeight(panel)}
                    refreshKey={refreshKey}
                    variables={variables}
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

// --- Styles ---

const embedContainerStyle: React.CSSProperties = {
  background: "var(--bg-primary, #0f1117)",
  color: "var(--text-primary, #e4e7ef)",
  minHeight: "100vh",
  padding: 16,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
};

const centeredStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 200,
};
