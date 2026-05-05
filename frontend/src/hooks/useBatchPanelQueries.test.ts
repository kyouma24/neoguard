import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useBatchPanelQueries, isBatchEligible, panelToMQL } from "./useBatchPanelQueries";
import type { PanelDefinition } from "../types";

// Mock the api module
vi.mock("../services/api", () => ({
  api: {
    mql: {
      batchQueryStream: vi.fn(),
    },
  },
}));

import { api } from "../services/api";

const mockBatchQueryStream = api.mql.batchQueryStream as ReturnType<typeof vi.fn>;

function makePanel(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return {
    id: "panel-1",
    title: "Test Panel",
    panel_type: "timeseries",
    metric_name: "aws.ec2.cpuutilization",
    tags: { region: "ap-south-1" },
    aggregation: "avg",
    width: 6,
    height: 4,
    position_x: 0,
    position_y: 0,
    ...overrides,
  };
}

describe("isBatchEligible", () => {
  it("returns false for text panels", () => {
    expect(isBatchEligible(makePanel({ panel_type: "text" }))).toBe(false);
  });

  it("returns false for panels with timeRangeOverride", () => {
    expect(
      isBatchEligible(
        makePanel({
          display_options: { timeRangeOverride: { range: "5m" } } as any,
        })
      )
    ).toBe(false);
  });

  it("returns false for panels with no metric or mql", () => {
    expect(
      isBatchEligible(
        makePanel({ metric_name: undefined, mql_query: undefined })
      )
    ).toBe(false);
  });

  it("returns true for legacy metric panels", () => {
    expect(isBatchEligible(makePanel())).toBe(true);
  });

  it("returns true for MQL panels", () => {
    expect(
      isBatchEligible(makePanel({ mql_query: "avg:aws.ec2.cpuutilization{}" }))
    ).toBe(true);
  });
});

describe("panelToMQL", () => {
  it("returns mql_query directly if present", () => {
    const panel = makePanel({ mql_query: "max:custom.metric{env:prod}" });
    expect(panelToMQL(panel, {})).toBe("max:custom.metric{env:prod}");
  });

  it("converts legacy metric to MQL format", () => {
    const panel = makePanel({
      metric_name: "aws.ec2.cpuutilization",
      aggregation: "avg",
      tags: { region: "us-east-1" },
    });
    expect(panelToMQL(panel, {})).toBe("avg:aws.ec2.cpuutilization{region:us-east-1}");
  });

  it("resolves $variable references in tags", () => {
    const panel = makePanel({
      metric_name: "aws.ec2.cpuutilization",
      aggregation: "avg",
      tags: { region: "$region" },
    });
    expect(panelToMQL(panel, { region: "ap-south-1" })).toBe(
      "avg:aws.ec2.cpuutilization{region:ap-south-1}"
    );
  });

  it("omits tags with * variable value", () => {
    const panel = makePanel({
      metric_name: "aws.ec2.cpuutilization",
      aggregation: "avg",
      tags: { region: "$region" },
    });
    expect(panelToMQL(panel, { region: "*" })).toBe("avg:aws.ec2.cpuutilization");
  });

  it("handles multiple tags", () => {
    const panel = makePanel({
      metric_name: "aws.ec2.cpuutilization",
      aggregation: "max",
      tags: { region: "us-east-1", resource_id: "i-12345" },
    });
    const result = panelToMQL(panel, {});
    expect(result).toContain("max:aws.ec2.cpuutilization{");
    expect(result).toContain("region:us-east-1");
    expect(result).toContain("resource_id:i-12345");
  });

  it("returns null for panels with no metric", () => {
    const panel = makePanel({ metric_name: undefined, mql_query: undefined });
    expect(panelToMQL(panel, {})).toBeNull();
  });
});

describe("useBatchPanelQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseOptions = {
    panels: [makePanel({ id: "p1" }), makePanel({ id: "p2", metric_name: "aws.ec2.networkout" })],
    from: new Date("2025-01-01T00:00:00Z"),
    to: new Date("2025-01-01T01:00:00Z"),
    interval: "1m",
    variables: {},
    refreshKey: 0,
    dashboardId: "dash-1",
  };

  it("calls batchQueryStream with all eligible panels", async () => {
    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [{ name: "test", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      yield {
        type: "query_result" as const,
        id: "p2",
        status: "ok" as const,
        series: [{ name: "test2", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 100, total: 2 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() => useBatchPanelQueries(baseOptions));

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
      expect(result.current["p2"]?.status).toBe("ok");
    });

    expect(mockBatchQueryStream).toHaveBeenCalledTimes(1);
    const callArgs = mockBatchQueryStream.mock.calls[0][0];
    expect(callArgs.queries).toHaveLength(2);
    expect(callArgs.queries[0].id).toBe("p1");
    expect(callArgs.queries[1].id).toBe("p2");
    expect(callArgs.dashboard_id).toBe("dash-1");
  });

  it("updates results progressively as NDJSON lines arrive", async () => {
    let resolveSecond: (() => void) | undefined;
    const secondPromise = new Promise<void>((r) => { resolveSecond = r; });

    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [{ name: "first", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      await secondPromise;
      yield {
        type: "query_result" as const,
        id: "p2",
        status: "ok" as const,
        series: [{ name: "second", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 200, total: 2 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() => useBatchPanelQueries(baseOptions));

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
    });

    // p2 should still be loading
    expect(result.current["p2"]?.status).toBe("loading");

    // Release second result
    act(() => { resolveSecond!(); });

    await waitFor(() => {
      expect(result.current["p2"]?.status).toBe("ok");
    });
  });

  it("excludes text panels from batch", async () => {
    const panels = [
      makePanel({ id: "p1" }),
      makePanel({ id: "text-panel", panel_type: "text", metric_name: undefined }),
    ];

    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [],
        meta: { total_series: 0, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() =>
      useBatchPanelQueries({ ...baseOptions, panels })
    );

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
    });

    expect(result.current["text-panel"]).toBeUndefined();
    const callArgs = mockBatchQueryStream.mock.calls[0][0];
    expect(callArgs.queries).toHaveLength(1);
  });

  it("excludes panels with timeRangeOverride", async () => {
    const panels = [
      makePanel({ id: "p1" }),
      makePanel({
        id: "override-panel",
        display_options: { timeRangeOverride: { range: "15m" } } as any,
      }),
    ];

    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [],
        meta: { total_series: 0, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() =>
      useBatchPanelQueries({ ...baseOptions, panels })
    );

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
    });

    expect(result.current["override-panel"]).toBeUndefined();
    const callArgs = mockBatchQueryStream.mock.calls[0][0];
    expect(callArgs.queries).toHaveLength(1);
  });

  it("handles per-panel errors without failing the batch", async () => {
    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [{ name: "test", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      yield {
        type: "query_result" as const,
        id: "p2",
        status: "error" as const,
        error: { code: "timeout", message: "Query exceeded 10s timeout" },
      };
      yield { type: "batch_complete" as const, took_ms: 10500, total: 2 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() => useBatchPanelQueries(baseOptions));

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
      expect(result.current["p2"]?.status).toBe("error");
    });

    expect(result.current["p2"]?.error?.code).toBe("timeout");
  });

  it("aborts previous stream on re-run", async () => {
    const firstStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [],
        meta: { total_series: 0, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };
    const secondStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [{ name: "fresh", tags: {}, datapoints: [] }],
        meta: { total_series: 1, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };

    mockBatchQueryStream.mockReturnValueOnce(firstStream());
    mockBatchQueryStream.mockReturnValueOnce(secondStream());

    const panels = [makePanel({ id: "p1" })];
    const { result, rerender } = renderHook(
      (props) => useBatchPanelQueries(props),
      { initialProps: { ...baseOptions, panels, refreshKey: 0 } }
    );

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("ok");
    });

    // Second signal passed to batchQueryStream
    rerender({ ...baseOptions, panels, refreshKey: 1 });

    await waitFor(() => {
      expect(mockBatchQueryStream).toHaveBeenCalledTimes(2);
    });

    // Verify the AbortSignal was passed
    const firstCall = mockBatchQueryStream.mock.calls[0];
    const secondCall = mockBatchQueryStream.mock.calls[1];
    expect(firstCall[1]).toBeInstanceOf(AbortSignal);
    expect(secondCall[1]).toBeInstanceOf(AbortSignal);
  });

  it("handles network error gracefully", async () => {
    mockBatchQueryStream.mockImplementation(async function* () {
      throw new Error("Network request failed");
    });

    const { result } = renderHook(() => useBatchPanelQueries(baseOptions));

    await waitFor(() => {
      expect(result.current["p1"]?.status).toBe("error");
      expect(result.current["p2"]?.status).toBe("error");
    });

    expect(result.current["p1"]?.error?.message).toBe("Network request failed");
  });

  it("does nothing when enabled is false", () => {
    const mockStream = async function* () {
      yield { type: "batch_complete" as const, took_ms: 0, total: 0 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    const { result } = renderHook(() =>
      useBatchPanelQueries({ ...baseOptions, enabled: false })
    );

    expect(mockBatchQueryStream).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
  });

  it("converts legacy panels to MQL in batch request", async () => {
    const panels = [
      makePanel({
        id: "p1",
        metric_name: "aws.ec2.cpuutilization",
        aggregation: "avg",
        tags: { region: "us-east-1" },
        mql_query: undefined,
      }),
    ];

    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [],
        meta: { total_series: 0, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    renderHook(() => useBatchPanelQueries({ ...baseOptions, panels }));

    await waitFor(() => {
      expect(mockBatchQueryStream).toHaveBeenCalled();
    });

    const callArgs = mockBatchQueryStream.mock.calls[0][0];
    expect(callArgs.queries[0].query).toBe("avg:aws.ec2.cpuutilization{region:us-east-1}");
  });

  it("respects visiblePanelIds filter", async () => {
    const panels = [
      makePanel({ id: "p1" }),
      makePanel({ id: "p2", metric_name: "aws.ec2.networkout" }),
      makePanel({ id: "p3", metric_name: "aws.ec2.networkin" }),
    ];

    const mockStream = async function* () {
      yield {
        type: "query_result" as const,
        id: "p1",
        status: "ok" as const,
        series: [],
        meta: { total_series: 0, truncated_series: false, max_points: 500 },
      };
      yield { type: "batch_complete" as const, took_ms: 50, total: 1 };
    };
    mockBatchQueryStream.mockReturnValue(mockStream());

    renderHook(() =>
      useBatchPanelQueries({
        ...baseOptions,
        panels,
        visiblePanelIds: new Set(["p1"]),
      })
    );

    await waitFor(() => {
      expect(mockBatchQueryStream).toHaveBeenCalled();
    });

    const callArgs = mockBatchQueryStream.mock.calls[0][0];
    expect(callArgs.queries).toHaveLength(1);
    expect(callArgs.queries[0].id).toBe("p1");
  });
});
