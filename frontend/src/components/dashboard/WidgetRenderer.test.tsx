import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { WidgetRenderer } from "./WidgetRenderer";
import { api } from "../../services/api";
import type { PanelDefinition } from "../../types";

vi.mock("../../services/api", () => ({
  api: {
    metrics: { query: vi.fn() },
    mql: { query: vi.fn() },
    alerts: { listEvents: vi.fn().mockResolvedValue([]) },
  },
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("../charts/widgetRegistry", () => {
  const TimeSeriesChart = ({ data }: { data: unknown[] }) => (
    <div data-testid="timeseries-chart">series={data.length}</div>
  );
  const AreaChartWidget = () => <div data-testid="area-chart" />;
  const BarChartWidget = () => <div data-testid="bar-chart" />;
  const PieChartWidget = () => <div data-testid="pie-chart" />;
  const StatWidget = () => <div data-testid="stat-widget" />;
  const TextWidget = ({ content }: { content: string }) => (
    <div data-testid="text-widget">{content}</div>
  );
  const GaugeWidget = () => <div data-testid="gauge-widget" />;
  const TableWidget = () => <div data-testid="table-widget" />;
  const ScatterWidget = () => <div data-testid="scatter-widget" />;
  const HistogramWidget = () => <div data-testid="histogram-widget" />;
  const ChangeWidget = () => <div data-testid="change-widget" />;
  const StatusWidget = () => <div data-testid="status-widget" />;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const registry: Record<string, { type: string; label: string; minSize: { w: number; h: number }; defaultSize: { w: number; h: number }; Renderer: React.ComponentType<any> }> = {
    timeseries: { type: "timeseries", label: "Time Series (Line)", minSize: { w: 3, h: 2 }, defaultSize: { w: 6, h: 4 }, Renderer: TimeSeriesChart },
    area: { type: "area", label: "Area Chart", minSize: { w: 3, h: 2 }, defaultSize: { w: 6, h: 4 }, Renderer: AreaChartWidget },
    stat: { type: "stat", label: "Single Stat", minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 3 }, Renderer: StatWidget },
    top_list: { type: "top_list", label: "Top List (Bar)", minSize: { w: 3, h: 2 }, defaultSize: { w: 6, h: 4 }, Renderer: BarChartWidget },
    pie: { type: "pie", label: "Pie / Donut", minSize: { w: 3, h: 3 }, defaultSize: { w: 4, h: 4 }, Renderer: PieChartWidget },
    text: { type: "text", label: "Text (Markdown)", minSize: { w: 2, h: 2 }, defaultSize: { w: 6, h: 3 }, Renderer: TextWidget },
    gauge: { type: "gauge", label: "Gauge", minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 3 }, Renderer: GaugeWidget },
    table: { type: "table", label: "Table", minSize: { w: 4, h: 3 }, defaultSize: { w: 6, h: 4 }, Renderer: TableWidget },
    scatter: { type: "scatter", label: "Scatter Plot", minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, Renderer: ScatterWidget },
    histogram: { type: "histogram", label: "Histogram", minSize: { w: 3, h: 3 }, defaultSize: { w: 6, h: 4 }, Renderer: HistogramWidget },
    change: { type: "change", label: "Change", minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 3 }, Renderer: ChangeWidget },
    status: { type: "status", label: "Status", minSize: { w: 2, h: 2 }, defaultSize: { w: 3, h: 3 }, Renderer: StatusWidget },
  };

  return {
    WIDGET_REGISTRY: registry,
    getWidgetDefinition: (type: string) => registry[type],
    PANEL_TYPE_OPTIONS: Object.values(registry).map((def: { type: string; label: string }) => ({ value: def.type, label: def.label })),
  };
});

const FROM = new Date("2026-05-01T00:00:00Z");
const TO = new Date("2026-05-01T01:00:00Z");

function makePanel(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return {
    id: "p1",
    title: "Test Panel",
    panel_type: "timeseries",
    metric_name: "aws.rds.cpu",
    tags: {},
    aggregation: "avg",
    width: 6,
    height: 4,
    position_x: 0,
    position_y: 0,
    ...overrides,
  };
}

const MOCK_RESULT = [
  {
    name: "aws.rds.cpu",
    tags: {},
    datapoints: [
      ["2026-05-01T00:00:00Z", 42.5],
      ["2026-05-01T00:01:00Z", 45.0],
    ],
  },
];

describe("WidgetRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.metrics.query as Mock).mockResolvedValue(MOCK_RESULT);
    (api.mql.query as Mock).mockResolvedValue(MOCK_RESULT);
  });

  describe("Legacy metric query", () => {
    it("calls api.metrics.query for panels with metric_name", async () => {
      const panel = makePanel();
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(api.metrics.query).toHaveBeenCalledTimes(1);
      });
      const [metricsFirstArg] = (api.metrics.query as Mock).mock.calls[0];
      expect(metricsFirstArg).toEqual({
        name: "aws.rds.cpu",
        tags: {},
        start: FROM.toISOString(),
        end: TO.toISOString(),
        interval: "1m",
        aggregation: "avg",
      });
    });

    it("renders timeseries chart after data loads", async () => {
      const panel = makePanel();
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("timeseries-chart")).toBeInTheDocument();
      });
    });

    it("renders area chart for area panel type", async () => {
      const panel = makePanel({ panel_type: "area" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("area-chart")).toBeInTheDocument();
      });
    });

    it("renders stat widget for stat panel type", async () => {
      const panel = makePanel({ panel_type: "stat" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("stat-widget")).toBeInTheDocument();
      });
    });

    it("renders bar chart for top_list panel type", async () => {
      const panel = makePanel({ panel_type: "top_list" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
      });
    });

    it("renders pie chart for pie panel type", async () => {
      const panel = makePanel({ panel_type: "pie" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
      });
    });
  });

  describe("MQL query", () => {
    it("calls api.mql.query for panels with mql_query", async () => {
      const panel = makePanel({ metric_name: undefined, mql_query: "avg:aws.rds.cpu{env:prod}" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(api.mql.query).toHaveBeenCalledTimes(1);
      });
      const [mqlFirstArg] = (api.mql.query as Mock).mock.calls[0];
      expect(mqlFirstArg).toEqual({
        query: "avg:aws.rds.cpu{env:prod}",
        start: FROM.toISOString(),
        end: TO.toISOString(),
        interval: "1m",
      });
      expect(api.metrics.query).not.toHaveBeenCalled();
    });

    it("prefers MQL over legacy when both are set", async () => {
      const panel = makePanel({ metric_name: "aws.rds.cpu", mql_query: "avg:aws.rds.cpu" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(api.mql.query).toHaveBeenCalled();
      });
      expect(api.metrics.query).not.toHaveBeenCalled();
    });

    it("renders chart after MQL data loads", async () => {
      const panel = makePanel({ metric_name: undefined, mql_query: "avg:cpu" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByTestId("timeseries-chart")).toBeInTheDocument();
      });
    });
  });

  describe("Text widget", () => {
    it("renders text widget without fetching", () => {
      const panel = makePanel({ panel_type: "text", content: "Hello world", metric_name: undefined });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      expect(screen.getByTestId("text-widget")).toHaveTextContent("Hello world");
      expect(api.metrics.query).not.toHaveBeenCalled();
      expect(api.mql.query).not.toHaveBeenCalled();
    });
  });

  describe("Empty state", () => {
    it("shows 'No metric configured' when no metric_name and no mql_query", () => {
      const panel = makePanel({ metric_name: undefined, mql_query: undefined });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      expect(screen.getByText("No metric configured")).toBeInTheDocument();
    });
  });

  describe("Error handling", () => {
    it("displays error message on fetch failure", async () => {
      (api.metrics.query as Mock).mockRejectedValue(new Error("Network error"));
      const panel = makePanel();
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("displays MQL error on MQL fetch failure", async () => {
      (api.mql.query as Mock).mockRejectedValue(new Error("Invalid MQL syntax"));
      const panel = makePanel({ metric_name: undefined, mql_query: "bad:query" });
      render(<WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />);

      await waitFor(() => {
        expect(screen.getByText("Invalid MQL syntax")).toBeInTheDocument();
      });
    });
  });

  describe("Loading state", () => {
    it("shows skeleton shimmer while loading", () => {
      (api.metrics.query as Mock).mockReturnValue(new Promise(() => {}));
      const panel = makePanel();
      const { container } = render(
        <WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} />
      );

      expect(container.querySelector(".skeleton-shimmer")).toBeInTheDocument();
    });
  });

  describe("Refresh behavior", () => {
    it("refetches when refreshKey changes", async () => {
      const panel = makePanel();
      const { rerender } = render(
        <WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} refreshKey={0} />
      );

      await waitFor(() => {
        expect(api.metrics.query).toHaveBeenCalledTimes(1);
      });

      rerender(
        <WidgetRenderer panel={panel} from={FROM} to={TO} interval="1m" height={200} refreshKey={1} />
      );

      await waitFor(() => {
        expect(api.metrics.query).toHaveBeenCalledTimes(2);
      });
    });
  });
});
