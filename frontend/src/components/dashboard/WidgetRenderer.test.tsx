import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { WidgetRenderer } from "./WidgetRenderer";
import { api } from "../../services/api";
import type { PanelDefinition } from "../../types";

vi.mock("../../services/api", () => ({
  api: {
    metrics: { query: vi.fn() },
    mql: { query: vi.fn() },
  },
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("../TimeSeriesChart", () => ({
  TimeSeriesChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="timeseries-chart">series={data.length}</div>
  ),
}));

vi.mock("../charts", () => ({
  AreaChartWidget: () => <div data-testid="area-chart" />,
  BarChartWidget: () => <div data-testid="bar-chart" />,
  PieChartWidget: () => <div data-testid="pie-chart" />,
  StatWidget: () => <div data-testid="stat-widget" />,
  TextWidget: ({ content }: { content: string }) => (
    <div data-testid="text-widget">{content}</div>
  ),
}));

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
        expect(api.metrics.query).toHaveBeenCalledWith({
          name: "aws.rds.cpu",
          tags: {},
          start: FROM.toISOString(),
          end: TO.toISOString(),
          interval: "1m",
          aggregation: "avg",
        });
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
        expect(api.mql.query).toHaveBeenCalledWith({
          query: "avg:aws.rds.cpu{env:prod}",
          start: FROM.toISOString(),
          end: TO.toISOString(),
          interval: "1m",
        });
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
