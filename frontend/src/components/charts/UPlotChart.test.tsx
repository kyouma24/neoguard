import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MetricQueryResult } from "../../types";

// --- uPlot mock ---
// vi.mock is hoisted, so we cannot reference top-level variables in the factory.
// Instead, we use vi.hoisted() to define mock fns that are available at hoist time.
const {
  mockDestroy,
  mockSetData,
  mockSetSize,
  mockSetSeries,
  mockSetSelect,
  mockConstructorCalls,
} = vi.hoisted(() => ({
  mockDestroy: vi.fn(),
  mockSetData: vi.fn(),
  mockSetSize: vi.fn(),
  mockSetSeries: vi.fn(),
  mockSetSelect: vi.fn(),
  mockConstructorCalls: [] as { opts: unknown; data: unknown }[],
}));

vi.mock("uplot", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockUPlot: any = function (this: Record<string, unknown>, opts: unknown, data: unknown) {
    mockConstructorCalls.push({ opts, data });
    this.root = document.createElement("div");
    this.status = 1;
    this.data = data;
    this.cursor = { idx: null };
    this.bbox = { left: 0, top: 0, width: 800, height: 300 };
    this.select = { left: 0, top: 0, width: 0, height: 0 };
    this.series = (opts as { series: unknown[] }).series || [];
    this.destroy = mockDestroy;
    this.setData = mockSetData;
    this.setSize = mockSetSize;
    this.setSeries = mockSetSeries;
    this.setSelect = mockSetSelect;
    this.valToPos = vi.fn().mockReturnValue(100);
    this.posToVal = vi.fn().mockReturnValue(1000);
    this.ctx = {};
  };
  MockUPlot.paths = {
    linear: vi.fn().mockReturnValue(null),
    spline: vi.fn().mockReturnValue(null),
    stepped: vi.fn().mockReturnValue(null),
    bars: vi.fn().mockReturnValue(null),
  };
  MockUPlot.sync = vi.fn().mockReturnValue({
    key: "test",
    sub: vi.fn(),
    unsub: vi.fn(),
    pub: vi.fn(),
    plots: [],
  });
  return { default: MockUPlot };
});

vi.mock("uplot/dist/uPlot.min.css", () => ({}));

// Mock crosshair store
const { mockSetCrosshair, mockClearCrosshair } = vi.hoisted(() => ({
  mockSetCrosshair: vi.fn(),
  mockClearCrosshair: vi.fn(),
}));

vi.mock("../../stores/crosshairStore", () => ({
  useCrosshairStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      timestamp: null,
      sourceWidgetId: null,
      setCrosshair: mockSetCrosshair,
      clearCrosshair: mockClearCrosshair,
    };
    return selector(state);
  },
}));

// Must import AFTER mocking
import { UPlotChart } from "./UPlotChart";

// Helper to get the last constructor call's opts/data
function lastOpts(): Record<string, unknown> {
  return mockConstructorCalls[mockConstructorCalls.length - 1]?.opts as Record<string, unknown>;
}
function lastData(): unknown[] {
  return mockConstructorCalls[mockConstructorCalls.length - 1]?.data as unknown[];
}

const SAMPLE_DATA: MetricQueryResult[] = [
  {
    name: "cpu.usage",
    tags: { host: "web-1" },
    datapoints: [
      ["2026-05-01T00:00:00Z", 45],
      ["2026-05-01T00:01:00Z", 52],
      ["2026-05-01T00:02:00Z", 48],
    ],
  },
  {
    name: "cpu.usage",
    tags: { host: "web-2" },
    datapoints: [
      ["2026-05-01T00:00:00Z", 30],
      ["2026-05-01T00:01:00Z", 35],
      ["2026-05-01T00:02:00Z", 32],
    ],
  },
];

const EMPTY_DATA: MetricQueryResult[] = [];

const EMPTY_DATAPOINTS: MetricQueryResult[] = [
  { name: "cpu", tags: {}, datapoints: [] },
];

// Track ResizeObserver mock calls
let resizeObserverDisconnectFn: ReturnType<typeof vi.fn>;

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = resizeObserverDisconnectFn;
  constructor(_cb: ResizeObserverCallback) {
    // no-op
  }
}

describe("UPlotChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConstructorCalls.length = 0;
    // Mock ResizeObserver
    resizeObserverDisconnectFn = vi.fn();
    MockResizeObserver.prototype.disconnect = resizeObserverDisconnectFn;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    // Mock devicePixelRatio for plugins
    Object.defineProperty(window, "devicePixelRatio", { value: 1, writable: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders container div with correct height", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={400} mode="line" />);
    const container = screen.getByTestId("uplot-container");
    expect(container).toBeInTheDocument();
    // Chart height = total height - legend space (60px)
    expect(container.style.height).toBe("340px");
  });

  it("creates uPlot instance on mount", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    expect(mockConstructorCalls).toHaveLength(1);
  });

  it("disposes uPlot on unmount", () => {
    const { unmount } = render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    expect(mockConstructorCalls).toHaveLength(1);
    unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it("handles empty data gracefully", () => {
    render(<UPlotChart data={EMPTY_DATA} height={300} mode="line" />);
    expect(screen.getByTestId("uplot-empty")).toBeInTheDocument();
    expect(screen.getByText("No data available")).toBeInTheDocument();
    expect(mockConstructorCalls).toHaveLength(0);
  });

  it("handles empty datapoints gracefully", () => {
    render(<UPlotChart data={EMPTY_DATAPOINTS} height={300} mode="line" />);
    expect(screen.getByTestId("uplot-empty")).toBeInTheDocument();
    expect(mockConstructorCalls).toHaveLength(0);
  });

  it("passes correct uPlot data shape: [timestamps, ...series]", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    expect(mockConstructorCalls).toHaveLength(1);
    const passedData = lastData();
    // Should be [xValues, yValues1, yValues2]
    expect(passedData).toHaveLength(3);
    // X values should be Float64Array of unix seconds
    expect(passedData[0]).toBeInstanceOf(Float64Array);
    const xValues = passedData[0] as Float64Array;
    expect(xValues.length).toBe(3);
    // First timestamp should be 2026-05-01T00:00:00Z in seconds
    expect(xValues[0]).toBe(new Date("2026-05-01T00:00:00Z").getTime() / 1000);
  });

  it("creates correct number of series (x-axis + data series)", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    const opts = lastOpts() as { series: unknown[] };
    // x-axis + 2 data series = 3
    expect(opts.series).toHaveLength(3);
  });

  it("area mode sets fill on series", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="area" />);
    const opts = lastOpts() as { series: { fill?: unknown }[] };
    // Series[0] is x-axis, series[1] and [2] should have fill
    expect(opts.series[1].fill).toBeDefined();
    expect(opts.series[2].fill).toBeDefined();
  });

  it("line mode does not set fill on series", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    const opts = lastOpts() as { series: { fill?: unknown }[] };
    expect(opts.series[1].fill).toBeUndefined();
    expect(opts.series[2].fill).toBeUndefined();
  });

  it("disables uPlot built-in legend (uses ChartLegend instead)", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    const opts = lastOpts() as { legend: { show: boolean } };
    expect(opts.legend.show).toBe(false);
  });

  it("sets up drag-to-zoom when onTimeRangeChange is provided", () => {
    const onZoom = vi.fn();
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" onTimeRangeChange={onZoom} />);
    const opts = lastOpts() as { cursor: { drag: { x: boolean } } };
    expect(opts.cursor.drag.x).toBe(true);
  });

  it("disables drag-to-zoom when no onTimeRangeChange", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    const opts = lastOpts() as { cursor: { drag: { x: boolean } } };
    expect(opts.cursor.drag.x).toBe(false);
  });

  it("uses crosshair sync key for cross-widget coordination", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" widgetId="widget-1" />);
    const opts = lastOpts() as { cursor: { sync: { key: string } } };
    expect(opts.cursor.sync.key).toBe("neoguard-crosshair");
  });

  it("renders ChartLegend below the chart", () => {
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    // Legend should render series names
    expect(screen.getByText("cpu.usage{host:web-1}")).toBeInTheDocument();
    expect(screen.getByText("cpu.usage{host:web-2}")).toBeInTheDocument();
  });

  it("applies unit formatting to y-axis", () => {
    render(
      <UPlotChart
        data={SAMPLE_DATA}
        height={300}
        mode="line"
        displayOptions={{ unit: { category: "percent" } }}
      />,
    );
    const opts = lastOpts() as { axes: { values?: unknown }[] };
    // Y-axis should have a values formatter
    expect(opts.axes[1].values).toBeDefined();
  });

  it("handles comparison data by adding extra series", () => {
    const comparisonData: MetricQueryResult[] = [
      {
        name: "cpu.usage",
        tags: { host: "web-1" },
        datapoints: [
          ["2026-04-30T00:00:00Z", 40],
          ["2026-04-30T00:01:00Z", 42],
          ["2026-04-30T00:02:00Z", 38],
        ],
      },
    ];
    render(
      <UPlotChart data={SAMPLE_DATA} height={300} mode="line" comparisonData={comparisonData} />,
    );
    const opts = lastOpts() as { series: { dash?: number[] }[] };
    // x-axis + 2 main + 1 comparison = 4
    expect(opts.series).toHaveLength(4);
    // Comparison series should be dashed
    expect(opts.series[3].dash).toEqual([6, 4]);
  });

  it("sets up ResizeObserver for container resize handling", () => {
    const spy = vi.spyOn(globalThis, "ResizeObserver");
    render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("disconnects ResizeObserver on unmount", () => {
    const { unmount } = render(<UPlotChart data={SAMPLE_DATA} height={300} mode="line" />);
    unmount();
    expect(resizeObserverDisconnectFn).toHaveBeenCalledTimes(1);
  });
});
