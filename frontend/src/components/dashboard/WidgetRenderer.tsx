import { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../../services/api";
import type { AlertEvent, Annotation, PanelDefinition, MetricQueryResult } from "../../types";
import type { PanelBatchResult } from "../../hooks/useBatchPanelQueries";
import { getTimeRange, getIntervalForRange } from "./TimeRangePicker";
import { getWidgetDefinition } from "../charts/widgetRegistry";
import { ChartEmptyState } from "../charts/ChartEmptyState";
import { ChartLoadingState } from "../charts/ChartLoadingState";
import { ChartErrorState } from "../charts/ChartErrorState";
import { applyDataTransform } from "../../utils/dataTransforms";

interface Props {
  panel: PanelDefinition;
  from: Date;
  to: Date;
  interval: string;
  height: number;
  refreshKey?: number;
  variables?: Record<string, string>;
  onTimeRangeChange?: (from: Date, to: Date) => void;
  comparePeriodMs?: number;
  annotations?: Annotation[];
  onAnnotate?: (timestamp: Date) => void;
  onFilterChange?: (key: string, value: string) => void;
  /** Expose raw data for panel inspector */
  onDataReady?: (data: MetricQueryResult[] | null) => void;
  /** When provided from batch fetch, skip individual query */
  preloadedResult?: PanelBatchResult;
}

export function WidgetRenderer({ panel, from: dashFrom, to: dashTo, interval: dashInterval, height, refreshKey, variables, onTimeRangeChange, comparePeriodMs, annotations, onAnnotate, onFilterChange, onDataReady, preloadedResult }: Props) {
  const [data, setData] = useState<MetricQueryResult[] | null>(null);
  const [comparisonData, setComparisonData] = useState<MetricQueryResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const override = panel.display_options?.timeRangeOverride;
  const { from, to, interval } = useMemo(() => {
    if (override?.range) {
      const tr = getTimeRange(override.range, override.customFrom, override.customTo);
      const ivl = getIntervalForRange(override.range, override.customFrom, override.customTo);
      return { from: tr.from, to: tr.to, interval: ivl };
    }
    return { from: dashFrom, to: dashTo, interval: dashInterval };
  }, [override?.range, override?.customFrom, override?.customTo, dashFrom, dashTo, dashInterval]);

  // When batch result is provided, use it directly instead of individual fetch
  const useBatchData = !!preloadedResult;
  const batchStatus = preloadedResult?.status;
  const batchData = preloadedResult?.data;
  const batchError = preloadedResult?.error?.message;

  useEffect(() => {
    if (!useBatchData) return;
    if (batchStatus === "ok") {
      setData(batchData ?? []);
      setLoading(false);
      setError(null);
    } else if (batchStatus === "error") {
      setError(batchError ?? "Query failed");
      setLoading(false);
    } else if (batchStatus === "loading") {
      setLoading(true);
      setError(null);
    }
  }, [useBatchData, batchStatus, batchData, batchError]);

  // Variables are sent to the server for substitution at MQL compile time (spec D.2).
  const rawMql = panel.mql_query;
  const hasMql = !!rawMql?.trim();
  const hasLegacy = !!panel.metric_name;
  // Stable reference for variables to avoid unnecessary re-fetches.
  const variablesJson = variables ? JSON.stringify(variables) : "";

  // Substitute $variable references in legacy metric tags client-side.
  const resolvedTags = useMemo(() => {
    const tags = panel.tags ?? {};
    if (!variables || Object.keys(variables).length === 0) return tags;
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      if (v.startsWith("$")) {
        const varName = v.slice(1);
        const resolved = variables[varName];
        if (resolved && resolved !== "*") {
          result[k] = resolved;
        }
      } else {
        result[k] = v;
      }
    }
    return result;
  }, [panel.tags, variablesJson]);

  useEffect(() => {
    if (useBatchData) return;
    if (panel.panel_type === "text") return;
    if (!hasMql && !hasLegacy) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const mqlRequest = hasMql
      ? {
          query: rawMql!,
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
        }
      : null;

    const promise = mqlRequest
      ? api.mql.query(mqlRequest)
      : api.metrics.query({
          name: panel.metric_name!,
          tags: resolvedTags,
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          aggregation: panel.aggregation ?? "avg",
        });

    promise
      .then((result) => {
        if (!cancelled) { setData(result); setLoading(false); }
      })
      .catch((e) => {
        if (!cancelled) { setError(e.message); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [useBatchData, rawMql, variablesJson, resolvedTags, panel.metric_name, panel.aggregation, panel.panel_type, hasMql, hasLegacy, from.getTime(), to.getTime(), interval, refreshKey]);

  useEffect(() => {
    if (!comparePeriodMs || panel.panel_type === "text") {
      setComparisonData(null);
      return;
    }
    if (!hasMql && !hasLegacy) return;

    let cancelled = false;
    const compFrom = new Date(from.getTime() - comparePeriodMs);
    const compTo = new Date(to.getTime() - comparePeriodMs);

    const compMqlRequest = hasMql
      ? {
          query: rawMql!,
          start: compFrom.toISOString(),
          end: compTo.toISOString(),
          interval,
          ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
        }
      : null;

    const promise = compMqlRequest
      ? api.mql.query(compMqlRequest)
      : api.metrics.query({
          name: panel.metric_name!,
          tags: resolvedTags,
          start: compFrom.toISOString(),
          end: compTo.toISOString(),
          interval,
          aggregation: panel.aggregation ?? "avg",
        });

    promise
      .then((result) => { if (!cancelled) setComparisonData(result); })
      .catch(() => { if (!cancelled) setComparisonData(null); });

    return () => { cancelled = true; };
  }, [comparePeriodMs, rawMql, variablesJson, resolvedTags, panel.metric_name, panel.aggregation, panel.panel_type, hasMql, hasLegacy, from.getTime(), to.getTime(), interval, refreshKey]);

  const [alertEvents, setAlertEvents] = useState<AlertEvent[]>([]);
  const isChartPanel = panel.panel_type === "timeseries" || panel.panel_type === "area";

  useEffect(() => {
    if (!isChartPanel || !panel.metric_name) {
      setAlertEvents([]);
      return;
    }
    let cancelled = false;
    api.alerts
      .listEvents({
        start: from.toISOString(),
        end: to.toISOString(),
        limit: 50,
      })
      .then((events) => {
        if (!cancelled) setAlertEvents(events);
      })
      .catch(() => { if (!cancelled) setAlertEvents([]); });
    return () => { cancelled = true; };
  }, [isChartPanel, panel.metric_name, from.getTime(), to.getTime(), refreshKey]);

  const definition = getWidgetDefinition(panel.panel_type);
  const opts = panel.display_options;
  const transform = opts?.transform;
  const chartData = useMemo(
    () => applyDataTransform(data ?? [], transform),
    [data, transform],
  );

  const onDataReadyRef = useRef(onDataReady);
  onDataReadyRef.current = onDataReady;
  useEffect(() => {
    onDataReadyRef.current?.(data);
  }, [data]);

  if (panel.panel_type === "text" && definition) {
    const { Renderer } = definition;
    return <Renderer data={[]} content={panel.content ?? ""} height={height} />;
  }

  if (!hasMql && !hasLegacy) {
    return <ChartEmptyState height={height} message="No metric configured" />;
  }

  if (loading && !data) {
    return <ChartLoadingState height={height} />;
  }

  if (error) {
    return <ChartErrorState height={height} error={error} />;
  }

  if (!definition) {
    return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Unknown widget type</div>;
  }

  const { Renderer } = definition;

  return (
    <Renderer
      data={chartData}
      height={height}
      displayOptions={opts}
      onTimeRangeChange={onTimeRangeChange}
      comparisonData={comparisonData ?? undefined}
      annotations={annotations}
      onAnnotate={onAnnotate}
      alertEvents={alertEvents}
      stacked={opts?.stacked !== false}
      limit={opts?.limit ?? 10}
      content={panel.content}
      onFilterChange={onFilterChange}
    />
  );
}

