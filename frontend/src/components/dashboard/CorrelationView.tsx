import { useState, useEffect, useMemo, useCallback } from "react";
import { X, MousePointer } from "lucide-react";
import type { PanelDefinition, MetricQueryResult } from "../../types";
import { WidgetRenderer } from "./WidgetRenderer";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { correlateTimeSeries, correlationStrength } from "../../utils/correlation";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../services/api";
import { Button } from "../../design-system";

/* ---------- Panel Selection Overlay ---------- */

interface PanelSelectionOverlayProps {
  panels: PanelDefinition[];
  selectedIds: string[];
  onSelect: (panelId: string) => void;
  onCancel: () => void;
}

function PanelSelectionOverlay({ panels, selectedIds, onSelect, onCancel }: PanelSelectionOverlayProps) {
  const queryablePanels = panels.filter(
    (p) => p.panel_type !== "text" && (p.mql_query?.trim() || p.metric_name),
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: "var(--overlay-bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md, 8px)",
          padding: 24,
          maxWidth: 600,
          width: "100%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Select panels to correlate</h3>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
              {selectedIds.length === 0
                ? "Click a panel to select the first series"
                : selectedIds.length === 1
                  ? "Click a second panel to compare"
                  : "Both panels selected"}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel correlation"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary)",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {queryablePanels.length < 2 && (
          <p style={{ fontSize: 13, color: "var(--color-warning-500, #f59e0b)" }}>
            At least 2 panels with metric queries are required for correlation.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {queryablePanels.map((panel) => {
            const idx = selectedIds.indexOf(panel.id);
            const isSelected = idx >= 0;
            return (
              <button
                key={panel.id}
                onClick={() => onSelect(panel.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: isSelected ? "var(--color-primary-500)" : "var(--bg-secondary)",
                  color: isSelected ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: isSelected ? "2px solid var(--color-primary-400)" : "1px solid var(--border)",
                  borderRadius: "var(--radius-sm, 4px)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: "left",
                  width: "100%",
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      background: "var(--color-neutral-0)",
                      color: "var(--color-primary-500)",
                      borderRadius: "50%",
                      width: 20,
                      height: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </span>
                )}
                {!isSelected && <MousePointer size={14} style={{ opacity: 0.4, flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{panel.title}</span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>{panel.panel_type}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Correlation Result Overlay ---------- */

interface CorrelationResultOverlayProps {
  panelA: PanelDefinition;
  panelB: PanelDefinition;
  from: Date;
  to: Date;
  interval: string;
  refreshKey: number;
  variables: Record<string, string>;
  onClose: () => void;
}

function CorrelationResultOverlay({
  panelA,
  panelB,
  from,
  to,
  interval,
  refreshKey,
  variables,
  onClose,
}: CorrelationResultOverlayProps) {
  const { user, tenant } = useAuth();
  const queryTenantId = user?.is_super_admin ? tenant?.id : undefined;
  const [dataA, setDataA] = useState<MetricQueryResult[] | null>(null);
  const [dataB, setDataB] = useState<MetricQueryResult[] | null>(null);

  const fetchData = useCallback(
    (panel: PanelDefinition, setter: (d: MetricQueryResult[]) => void) => {
      const tenantOpts = queryTenantId ? { tenantId: queryTenantId } : undefined;
      const hasMql = !!panel.mql_query?.trim();
      const promise = hasMql
        ? api.mql.query({
            query: panel.mql_query!,
            start: from.toISOString(),
            end: to.toISOString(),
            interval,
            ...(Object.keys(variables).length > 0 ? { variables } : {}),
          }, tenantOpts)
        : panel.metric_name
          ? api.metrics.query({
              name: panel.metric_name,
              tags: panel.tags ?? {},
              start: from.toISOString(),
              end: to.toISOString(),
              interval,
              aggregation: panel.aggregation ?? "avg",
            }, tenantOpts)
          : Promise.resolve([]);

      promise.then(setter).catch(() => setter([]));
    },
    [from, to, interval, variables, queryTenantId],
  );

  useEffect(() => {
    fetchData(panelA, setDataA);
    fetchData(panelB, setDataB);
  }, [panelA, panelB, fetchData, refreshKey]);

  const correlation = useMemo(() => {
    if (!dataA?.length || !dataB?.length) return null;
    return correlateTimeSeries(dataA[0], dataB[0]);
  }, [dataA, dataB]);

  const strength = correlation ? correlationStrength(correlation.r) : null;

  // Interpret using the task-specified thresholds
  const interpretation = useMemo(() => {
    if (!correlation) return null;
    const absR = Math.abs(correlation.r);
    if (absR > 0.7) return { label: "Strong correlation", color: "var(--color-success-500)" };
    if (absR > 0.4) return { label: "Moderate correlation", color: "var(--color-warning-500)" };
    return { label: "Weak correlation", color: "var(--text-muted)" };
  }, [correlation]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const panelHeight = 220;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            Correlation: {panelA.title} vs {panelB.title}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close correlation view">
          <X size={18} />
        </Button>
      </div>

      {/* Correlation stat */}
      {correlation && interpretation && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: interpretation.color,
              }}
            >
              r = {correlation.r.toFixed(4)}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: interpretation.color, marginTop: 4 }}>
              {interpretation.label}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {correlation.n} overlapping data points
              {strength && strength.label !== interpretation.label && (
                <span> &middot; {strength.label}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {correlation.r > 0 ? "Positive" : correlation.r < 0 ? "Negative" : "No"} linear relationship
              {correlation.r !== 0 && (
                <> &mdash; when {panelA.title} goes up, {panelB.title} tends to go {correlation.r > 0 ? "up" : "down"}</>
              )}
            </div>
          </div>
        </div>
      )}

      {!correlation && dataA !== null && dataB !== null && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          Insufficient overlapping data points to compute correlation.
        </div>
      )}

      {/* Stacked panels on shared X-axis */}
      <div style={{ flex: 1, padding: 20 }}>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 8px)",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 600,
              background: "var(--bg-secondary)",
            }}
          >
            {panelA.title}
          </div>
          <div style={{ padding: 8 }}>
            <WidgetErrorBoundary title={panelA.title} height={panelHeight} resetKey={refreshKey}>
              <WidgetRenderer
                panel={panelA}
                from={from}
                to={to}
                interval={interval}
                height={panelHeight}
                refreshKey={refreshKey}
                variables={variables}
              />
            </WidgetErrorBoundary>
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md, 8px)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              fontSize: 13,
              fontWeight: 600,
              background: "var(--bg-secondary)",
            }}
          >
            {panelB.title}
          </div>
          <div style={{ padding: 8 }}>
            <WidgetErrorBoundary title={panelB.title} height={panelHeight} resetKey={refreshKey}>
              <WidgetRenderer
                panel={panelB}
                from={from}
                to={to}
                interval={interval}
                height={panelHeight}
                refreshKey={refreshKey}
                variables={variables}
              />
            </WidgetErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Exported hook + overlay ---------- */

interface UseCorrelationModeResult {
  isCorrelating: boolean;
  startCorrelation: () => void;
  cancelCorrelation: () => void;
}

export function useCorrelationMode(): UseCorrelationModeResult {
  const [isCorrelating, setIsCorrelating] = useState(false);
  const startCorrelation = useCallback(() => setIsCorrelating(true), []);
  const cancelCorrelation = useCallback(() => setIsCorrelating(false), []);
  return { isCorrelating, startCorrelation, cancelCorrelation };
}

interface CorrelationOverlayProps {
  panels: PanelDefinition[];
  from: Date;
  to: Date;
  interval: string;
  refreshKey: number;
  variables: Record<string, string>;
  onClose: () => void;
}

export function CorrelationOverlay({
  panels,
  from,
  to,
  interval,
  refreshKey,
  variables,
  onClose,
}: CorrelationOverlayProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelect = useCallback((panelId: string) => {
    setSelectedIds((prev) => {
      // Toggle off if already selected
      if (prev.includes(panelId)) return prev.filter((id) => id !== panelId);
      // Max 2 selected
      if (prev.length >= 2) return [prev[1], panelId];
      return [...prev, panelId];
    });
  }, []);

  const panelA = panels.find((p) => p.id === selectedIds[0]);
  const panelB = panels.find((p) => p.id === selectedIds[1]);

  if (panelA && panelB) {
    return (
      <CorrelationResultOverlay
        panelA={panelA}
        panelB={panelB}
        from={from}
        to={to}
        interval={interval}
        refreshKey={refreshKey}
        variables={variables}
        onClose={onClose}
      />
    );
  }

  return (
    <PanelSelectionOverlay
      panels={panels}
      selectedIds={selectedIds}
      onSelect={handleSelect}
      onCancel={onClose}
    />
  );
}
