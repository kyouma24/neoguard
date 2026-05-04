import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import type { MetricQueryResult } from "../types";

interface UseMetricQueryOptions {
  mqlQuery?: string;
  metricName?: string;
  tags?: Record<string, string>;
  aggregation?: string;
  from: Date;
  to: Date;
  interval: string;
  variables?: Record<string, string>;
  enabled?: boolean;
}

export function useMetricQuery(options: UseMetricQueryOptions) {
  const {
    mqlQuery,
    metricName,
    tags,
    aggregation,
    from,
    to,
    interval,
    variables,
    enabled = true,
  } = options;

  const hasMql = !!mqlQuery?.trim();
  const hasLegacy = !!metricName;

  return useQuery<MetricQueryResult[]>({
    queryKey: [
      "metrics",
      mqlQuery || metricName,
      from.getTime(),
      to.getTime(),
      interval,
      variables,
    ],
    queryFn: async () => {
      if (hasMql) {
        return api.mql.query({
          query: mqlQuery!,
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          ...(variables && Object.keys(variables).length > 0
            ? { variables }
            : {}),
        });
      }
      return api.metrics.query({
        name: metricName!,
        tags: tags ?? {},
        start: from.toISOString(),
        end: to.toISOString(),
        interval,
        aggregation: aggregation ?? "avg",
      });
    },
    enabled: enabled && (hasMql || hasLegacy),
    staleTime: 15_000,
  });
}
