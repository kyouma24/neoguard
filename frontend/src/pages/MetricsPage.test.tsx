import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MetricsPage } from "./MetricsPage";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    metrics: {
      names: vi.fn(),
      query: vi.fn(),
      queryBatch: vi.fn(),
    },
    dashboards: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("../hooks/useURLState", () => ({
  useURLState: (_key: string, defaultVal: string) => [defaultVal, vi.fn()],
}));

vi.mock("../hooks/useInterval", () => ({
  useInterval: vi.fn(),
}));

vi.mock("../components/TimeSeriesChart", () => ({
  TimeSeriesChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="timeseries-chart">Chart with {data.length} series</div>
  ),
}));

const mockAuthValue = {
  user: { id: "u1", email: "test@test.com", is_super_admin: false },
  tenant: { id: "t1", name: "Test" },
};
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuthValue }));

function renderPage() {
  return render(
    <MemoryRouter>
      <MetricsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (api.metrics.names as Mock).mockResolvedValue([
    "neoguard.process.cpu_percent",
    "neoguard.process.memory_rss_bytes",
    "aws.ec2.cpu_utilization",
  ]);
  (api.metrics.query as Mock).mockResolvedValue([]);
  (api.metrics.queryBatch as Mock).mockResolvedValue([]);
  (api.dashboards.list as Mock).mockResolvedValue([]);
});

describe("MetricsPage", () => {
  it("renders the page header", () => {
    renderPage();
    expect(screen.getByText("Metrics Explorer")).toBeInTheDocument();
  });

  it("shows empty state when no metric is selected", () => {
    renderPage();
    expect(screen.getByText("Select a metric to visualize")).toBeInTheDocument();
    expect(screen.getByText(/Choose a metric from the dropdown/)).toBeInTheDocument();
  });

  it("renders interval dropdown with options", () => {
    renderPage();
    const options = screen.getAllByRole("option");
    const intervalOptions = options.filter((o) =>
      ["raw", "1m", "5m", "15m", "1h"].includes(o.textContent ?? ""),
    );
    expect(intervalOptions.length).toBeGreaterThanOrEqual(5);
  });

  it("renders aggregation dropdown with options", () => {
    renderPage();
    const options = screen.getAllByRole("option");
    const aggOptions = options.filter((o) =>
      ["avg", "min", "max", "sum", "count"].includes(o.textContent ?? ""),
    );
    expect(aggOptions.length).toBeGreaterThanOrEqual(5);
  });

  it("renders time range buttons", () => {
    renderPage();
    expect(screen.getByText("Last 15m")).toBeInTheDocument();
    expect(screen.getByText("Last 1h")).toBeInTheDocument();
    expect(screen.getByText("Last 6h")).toBeInTheDocument();
    expect(screen.getByText("Last 24h")).toBeInTheDocument();
    expect(screen.getByText("Last 7d")).toBeInTheDocument();
  });

  it("does not show 'Save to Dashboard' button when no metric selected", () => {
    renderPage();
    expect(screen.queryByText("Save to Dashboard")).not.toBeInTheDocument();
  });

  it("fetches metric names on mount", () => {
    renderPage();
    expect(api.metrics.names).toHaveBeenCalled();
  });
});
