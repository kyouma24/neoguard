import { useEffect, useRef, useCallback, useState, useMemo } from "react";
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

const SAFE_MQL_VALUE = /^[a-zA-Z0-9_\-.*/:]+$/;

function isSafeMQLValue(value: string): boolean {
  return SAFE_MQL_VALUE.test(value) && value.length <= 256;
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
      if (resolved && resolved !== "*" && isSafeMQLValue(resolved)) {
        resolvedTags[k] = resolved;
      }
    } else if (v !== "*" && isSafeMQLValue(v)) {
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
  const [results, setResults] = useState<Record<string, PanelBatchResult>>({});
  const abortRef = useRef<AbortController | null>(null);
  const fetchedPanelIdsRef = useRef<Set<string>>(new Set());
  const variablesJson = JSON.stringify(variables, Object.keys(variables).sort());

  // Stabilize Date deps as timestamps to prevent re-triggering on every render
  const fromMs = from.getTime();
  const toMs = to.getTime();
  // Stable panel IDs key (panels array reference changes but IDs don't)
  const panelIdsKey = panels.map((p) => p.id).join(",");

  // Stabilize visiblePanelIds — Set reference changes every render but contents may not.
  // Convert to a sorted string key so useCallback/useEffect deps are stable.
  const visibleIdsKey = useMemo(() => {
    if (!visiblePanelIds) return "";
    return [...visiblePanelIds].sort().join(",");
  }, [visiblePanelIds]);

  // Reset fetched tracking when query parameters change (time range, variables, refresh).
  // This ensures auto-refresh and time range changes re-fetch visible panels.
  const invalidationKey = `${fromMs}:${toMs}:${interval}:${variablesJson}:${refreshKey}:${queryTenantId ?? ""}`;
  const prevInvalidationRef = useRef(invalidationKey);

  useEffect(() => {
    if (prevInvalidationRef.current !== invalidationKey) {
      prevInvalidationRef.current = invalidationKey;
      fetchedPanelIdsRef.current = new Set();
    }
  }, [invalidationKey]);

  const runBatch = useCallback(async (panelIdsToFetch: string[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const eligiblePanels = panels.filter((p) =>
      panelIdsToFetch.includes(p.id) && isBatchEligible(p)
    );

    if (eligiblePanels.length === 0) return;

    // Set loading state for newly-fetching panels WITHOUT wiping existing results
    setResults((prev) => {
      const next = { ...prev };
      for (const p of eligiblePanels) {
        next[p.id] = { status: "loading" };
      }
      return next;
    });

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

    if (queries.length === 0) return;

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
          // Mark as fetched
          fetchedPanelIdsRef.current.add(line.id);
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
  }, [panelIdsKey, fromMs, toMs, interval, variablesJson, dashboardId, queryTenantId]);

  // Refs to hold latest values for the effect (avoids unstable deps)
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const visibleIdsRef = useRef(visiblePanelIds);
  visibleIdsRef.current = visiblePanelIds;

  // Main effect: determine which panels need fetching and trigger batch
  useEffect(() => {
    if (!enabled) {
      setResults({});
      fetchedPanelIdsRef.current = new Set();
      return;
    }

    const currentPanels = panelsRef.current;
    const currentVisibleIds = visibleIdsRef.current;

    // Determine which panels are eligible and visible
    const targetPanels = currentPanels.filter((p) => {
      if (!isBatchEligible(p)) return false;
      if (currentVisibleIds && !currentVisibleIds.has(p.id)) return false;
      return true;
    });

    // On invalidation (refresh/time change), all visible panels need re-fetch.
    // On visibility change only, fetch only newly-visible panels not yet fetched.
    const panelsToFetch = targetPanels.filter(
      (p) => !fetchedPanelIdsRef.current.has(p.id)
    );

    if (panelsToFetch.length > 0) {
      // Set initial loading state for panels that have no result yet
      setResults((prev) => {
        const next = { ...prev };
        for (const p of panelsToFetch) {
          if (!next[p.id]) {
            next[p.id] = { status: "loading" };
          }
        }
        return next;
      });
      runBatch(panelsToFetch.map((p) => p.id));
    }

    return () => { abortRef.current?.abort(); };
  // visibleIdsKey/panelIdsKey are stable string representations that trigger re-evaluation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, panelIdsKey, visibleIdsKey, invalidationKey, runBatch]);

  return results;
}

export { isBatchEligible, panelToMQL, hasTimeRangeOverride };
