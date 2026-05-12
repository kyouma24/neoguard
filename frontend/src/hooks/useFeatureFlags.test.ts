import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { useFeatureFlags, useFeatureFlag } from "./useFeatureFlags";

const mockFeatureFlags = vi.fn();
vi.mock("../services/api", () => ({
  api: {
    system: {
      featureFlags: () => mockFeatureFlags(),
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useFeatureFlags", () => {
  beforeEach(() => {
    mockFeatureFlags.mockResolvedValue({
      "dashboards.batch_queries": true,
      "dashboards.viewport_loading": true,
      "metrics.cardinality_denylist": true,
      "mql.streaming_batch": false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns defaults before fetch completes", () => {
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: createWrapper() });
    expect(result.current["dashboards.batch_queries"]).toBe(true);
    expect(result.current["mql.streaming_batch"]).toBe(true);
  });

  it("returns server values after fetch", async () => {
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current["mql.streaming_batch"]).toBe(false);
    });
  });

  it("does not poll — only fetches once", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFeatureFlags(), { wrapper: createWrapper() });

    // Flush the initial query
    await vi.advanceTimersByTimeAsync(100);
    expect(mockFeatureFlags).toHaveBeenCalledTimes(1);

    // Advance time well past staleTime — should NOT refetch
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mockFeatureFlags).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("useFeatureFlag returns individual flag value", async () => {
    const { result } = renderHook(() => useFeatureFlag("mql.streaming_batch"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
