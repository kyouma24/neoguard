import { useEffect, useState, useMemo } from "react";
import { api } from "../services/api";
import type { PanelDefinition, MetricQueryResult } from "../types";

interface PanelAverage {
  id: string;
  title: string;
  currentAvg: number | null;
  previousAvg: number | null;
}

/**
 * Computes the average value from a MetricQueryResult array.
 * Takes the mean of all non-null datapoints across all series.
 */
function computeAverage(results: MetricQueryResult[]): number | null {
  let sum = 0;
  let count = 0;
  for (const series of results) {
    for (const [, value] of series.datapoints) {
      if (value != null) {
        sum += value;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Fetch data for a single panel (current or comparison period).
 * Returns the average of all datapoints.
 */
async function fetchPanelAvg(
  panel: PanelDefinition,
  from: Date,
  to: Date,
  interval: string,
  variables?: Record<string, string>,
): Promise<number | null> {
  const hasMql = !!panel.mql_query?.trim();
  const hasLegacy = !!panel.metric_name;
  if (!hasMql && !hasLegacy) return null;
  if (panel.panel_type === "text") return null;

  try {
    const results = hasMql
      ? await api.mql.query({
          query: panel.mql_query!,
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          ...(variables && Object.keys(variables).length > 0 ? { variables } : {}),
        })
      : await api.metrics.query({
          name: panel.metric_name!,
          tags: panel.tags ?? {},
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          aggregation: panel.aggregation ?? "avg",
        });
    return computeAverage(results);
  } catch {
    return null;
  }
}

interface UseChangeIntelligenceOptions {
  panels: PanelDefinition[];
  from: Date;
  to: Date;
  interval: string;
  comparePeriodMs: number | undefined;
  refreshKey: number;
  variables?: Record<string, string>;
}

/**
 * Hook that fetches current and previous period averages for all panels
 * when comparison mode is active. Returns panel averages for the
 * ChangeIntelligenceBar component.
 */
export function useChangeIntelligence({
  panels,
  from,
  to,
  interval,
  comparePeriodMs,
  refreshKey,
  variables,
}: UseChangeIntelligenceOptions): PanelAverage[] {
  const [panelAverages, setPanelAverages] = useState<PanelAverage[]>([]);

  // Only consider panels that have data queries (not text panels)
  const queryablePanels = useMemo(
    () => panels.filter((p) => p.panel_type !== "text" && (!!p.mql_query?.trim() || !!p.metric_name)),
    [panels],
  );

  const fromMs = from.getTime();
  const toMs = to.getTime();

  useEffect(() => {
    if (!comparePeriodMs || queryablePanels.length === 0) {
      setPanelAverages([]);
      return;
    }

    let cancelled = false;
    const compFrom = new Date(fromMs - comparePeriodMs);
    const compTo = new Date(toMs - comparePeriodMs);
    const currentFrom = new Date(fromMs);
    const currentTo = new Date(toMs);

    async function fetchAll(): Promise<void> {
      const results: PanelAverage[] = [];
      // Fetch all panels in parallel (current + previous for each)
      const promises = queryablePanels.map(async (panel) => {
        const [currentAvg, previousAvg] = await Promise.all([
          fetchPanelAvg(panel, currentFrom, currentTo, interval, variables),
          fetchPanelAvg(panel, compFrom, compTo, interval, variables),
        ]);
        return {
          id: panel.id,
          title: panel.title,
          currentAvg,
          previousAvg,
        };
      });
      const resolved = await Promise.all(promises);
      if (!cancelled) {
        // Only include panels that have both current and previous data
        for (const r of resolved) {
          results.push(r);
        }
        setPanelAverages(results);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [queryablePanels, fromMs, toMs, interval, comparePeriodMs, refreshKey, variables]);

  return panelAverages;
}
