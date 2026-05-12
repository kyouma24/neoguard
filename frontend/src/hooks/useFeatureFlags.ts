import { useQuery } from "@tanstack/react-query";
import { api } from "../services/api";

export interface FeatureFlags {
  "dashboards.batch_queries": boolean;
  "dashboards.viewport_loading": boolean;
  "metrics.cardinality_denylist": boolean;
  "mql.streaming_batch": boolean;
}

const DEFAULTS: FeatureFlags = {
  "dashboards.batch_queries": true,
  "dashboards.viewport_loading": true,
  "metrics.cardinality_denylist": true,
  "mql.streaming_batch": true,
};

export function useFeatureFlags(): FeatureFlags {
  const { data } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => api.system.featureFlags(),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
  });

  return { ...DEFAULTS, ...(data as Partial<FeatureFlags>) };
}

export function useFeatureFlag(flag: keyof FeatureFlags): boolean {
  const flags = useFeatureFlags();
  return flags[flag];
}
