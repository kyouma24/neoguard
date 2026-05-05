import { useEffect, useRef, useCallback, useState } from "react";
import { api } from "../services/api";
import type {
  PanelDefinition,
  BatchQueryItem,
  BatchQueryResultLine,
  MetricQueryResult,
} from "../types";

export interface PanelBatchResult {
  status: "ok" | "error" | "loading";
  data?: MetricQueryResult[];
  error?: { code: string; message: string };
  meta?: { total_series: number; truncated_series: boolean; max_points: number };
}

interface UseBatchPanelQueriesOptions {
  panels: PanelDefinition[];
  from: Date;
  to: Date;
  interval: string;
  variables: Record<string, string>;
  refreshKey: number;
  dashboardId: string;
  queryTenantId?: string;
  visiblePanelIds?: Set<string>;
  enabled?: boolean;
}

function hasTimeRangeOverride(panel: PanelDefinition): boolean {
  return !!panel.display_options?.timeRangeOverride?.range;
}

function panelToMQL(panel: PanelDefinition, variables: Record<string, string>): string | null {
  if (panel.mql_query?.trim()) return panel.mql_query;
  if (!panel.metric_name) return null;

  const agg = panel.aggregation ?? "avg";
  const tags = panel.tags ?? {};
  const resolvedTags: Record<string, string> = {};

  for (const [k, v] of Object.entries(tags)) {
    if (v.startsWith("$")) {
      const varName = v.slice(1);
      const resolved = variables[varName];
      if (resolved && resolved !== "*") {
        resolvedTags[k] = resolved;
      }
    } else if (v !== "*") {
      resolvedTags[k] = v;
    }
  }

  const tagParts = Object.entries(resolvedTags).map(([k, v]) => `${k}:${v}`);
  const filterStr = tagParts.length > 0 ? `{${tagParts.join(",")}}` : "";
  return `${agg}:${panel.metric_name}${filterStr}`;
}

function isBatchEligible(panel: PanelDefinition): boolean {
  if (panel.panel_type === "text") return false;
  if (hasTimeRangeOverride(panel)) return false;
  if (!panel.mql_query?.trim() && !panel.metric_name) return false;
  return true;
}

export function useBatchPanelQueries({
  panels,
  from,
  to,
  interval,
  variables,
  refreshKey,
  dashboardId,
  queryTenantId,
  visiblePanelIds,
  enabled = true,
}: UseBatchPanelQueriesOptions) {
  // Initialize with loading state for all eligible panels so WidgetRenderer
  // sees preloadedResult={status:"loading"} on first render and skips individual fetch.
  const [results, setResults] = useState<Record<string, PanelBatchResult>>(() => {
    if (!enabled) return {};
    const init: Record<string, PanelBatchResult> = {};
    for (const p of panels) {
      if (isBatchEligible(p) && (!visiblePanelIds || visiblePanelIds.has(p.id))) {
        init[p.id] = { status: "loading" };
      }
    }
    return init;
  });
  const abortRef = useRef<AbortController | null>(null);
  const variablesJson = JSON.stringify(variables);

  // Stabilize Date deps as timestamps to prevent re-triggering on every render
  const fromMs = from.getTime();
  const toMs = to.getTime();
  // Stable panel IDs key (panels array reference changes but IDs don't)
  const panelIdsKey = panels.map((p) => p.id).join(",");

  const runBatch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const eligiblePanels = panels.filter((p) => {
      if (!isBatchEligible(p)) return false;
      if (visiblePanelIds && !visiblePanelIds.has(p.id)) return false;
      return true;
    });

    if (eligiblePanels.length === 0) {
      setResults({});
      return;
    }

    const initialState: Record<string, PanelBatchResult> = {};
    for (const p of eligiblePanels) {
      initialState[p.id] = { status: "loading" };
    }
    setResults(initialState);

    const queries: BatchQueryItem[] = [];
    const vars = JSON.parse(variablesJson) as Record<string, string>;

    const startIso = new Date(fromMs).toISOString();
    const endIso = new Date(toMs).toISOString();

    for (const panel of eligiblePanels) {
      const mql = panelToMQL(panel, vars);
      if (!mql) continue;
      queries.push({
        id: panel.id,
        query: mql,
        start: startIso,
        end: endIso,
        interval,
        max_points: 500,
        max_series: 50,
      });
    }

    if (queries.length === 0) {
      setResults({});
      return;
    }

    try {
      const stream = api.mql.batchQueryStream(
        {
          queries,
          variables: vars,
          dashboard_id: dashboardId,
        },
        controller.signal,
        queryTenantId ? { tenantId: queryTenantId } : undefined,
      );

      for await (const msg of stream) {
        if (controller.signal.aborted) break;
        if (msg.type === "query_result") {
          const line = msg as BatchQueryResultLine;
          setResults((prev) => ({
            ...prev,
            [line.id]: {
              status: line.status,
              data: line.series,
              error: line.error,
              meta: line.meta,
            },
          }));
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      const errorMsg = e instanceof Error ? e.message : "Batch query failed";
      setResults((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].status === "loading") {
            next[key] = { status: "error", error: { code: "network_error", message: errorMsg } };
          }
        }
        return next;
      });
    }
  }, [panelIdsKey, fromMs, toMs, interval, variablesJson, dashboardId, queryTenantId, visiblePanelIds]);

  useEffect(() => {
    if (!enabled) {
      setResults({});
      return;
    }
    runBatch();
    return () => { abortRef.current?.abort(); };
  }, [runBatch, enabled, refreshKey]);

  return results;
}

export { isBatchEligible, panelToMQL, hasTimeRangeOverride };
