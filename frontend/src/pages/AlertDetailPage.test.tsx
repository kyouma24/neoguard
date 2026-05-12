import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AlertDetailPage } from "./AlertDetailPage";
import { api } from "../services/api";
import type { AlertRule, AlertEvent } from "../types";

vi.mock("../services/api", () => ({
  api: {
    alerts: {
      getRule: vi.fn(),
      listEvents: vi.fn(),
    },
    metrics: {
      query: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
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

const RULE: AlertRule = {
  id: "rule-1",
  tenant_id: "t1",
  name: "High CPU Alert",
  description: "Fires when CPU exceeds 80%",
  metric_name: "neoguard.process.cpu_percent",
  tags_filter: {},
  condition: "gt",
  threshold: 80,
  duration_sec: 60,
  interval_sec: 15,
  severity: "P1",
  enabled: true,
  notification: { channel_ids: ["ch-1"] },
  aggregation: "avg",
  cooldown_sec: 300,
  nodata_action: "ok",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const EVENTS: AlertEvent[] = [
  {
    id: "evt-1",
    tenant_id: "t1",
    rule_id: "rule-1",
    rule_name: "High CPU Alert",
    status: "firing",
    severity: "P1",
    message: "CPU at 92%",
    value: 92.5,
    threshold: "80",
    fired_at: "2026-05-04T10:00:00Z",
    resolved_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
  },
  {
    id: "evt-2",
    tenant_id: "t1",
    rule_id: "rule-1",
    rule_name: "High CPU Alert",
    status: "resolved",
    severity: "P1",
    message: "CPU recovered",
    value: 45.0,
    threshold: "80",
    fired_at: "2026-05-04T08:00:00Z",
    resolved_at: "2026-05-04T09:00:00Z",
    acknowledged_at: "2026-05-04T08:05:00Z",
    acknowledged_by: "admin",
  },
];

function renderPage(ruleId = "rule-1") {
  return render(
    <MemoryRouter initialEntries={[`/alerts/${ruleId}`]}>
      <Routes>
        <Route path="/alerts/:id" element={<AlertDetailPage />} />
        <Route path="/alerts" element={<div>Alerts List</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockDefaults() {
  (api.alerts.getRule as Mock).mockResolvedValue(RULE);
  (api.alerts.listEvents as Mock).mockResolvedValue(EVENTS);
  (api.metrics.query as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDefaults();
});

describe("AlertDetailPage", () => {
  it("shows rule name as page title", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("High CPU Alert")).toBeInTheDocument();
    });
  });

  it("shows severity badge", async () => {
    renderPage();
    await waitFor(() => {
      const p1Badges = screen.getAllByText("P1");
      expect(p1Badges.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows rule details card with metric info", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("neoguard.process.cpu_percent")).toBeInTheDocument();
      expect(screen.getByText("> 80")).toBeInTheDocument();
      expect(screen.getByText("60s")).toBeInTheDocument();
      expect(screen.getByText("avg")).toBeInTheDocument();
    });
  });

  it("shows rule description", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Fires when CPU exceeds 80%")).toBeInTheDocument();
    });
  });

  it("shows alert history section with event count", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Alert History.*2 events/)).toBeInTheDocument();
    });
  });

  it("shows event status badges in history table", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("firing")).toBeInTheDocument();
      expect(screen.getByText("resolved")).toBeInTheDocument();
    });
  });

  it("shows event values in history", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("92.50")).toBeInTheDocument();
      expect(screen.getByText("45.00")).toBeInTheDocument();
    });
  });

  it("shows acknowledged status for events", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/admin/)).toBeInTheDocument();
      expect(screen.getByText("No")).toBeInTheDocument();
    });
  });

  it("shows time range buttons for chart", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1h")).toBeInTheDocument();
      expect(screen.getByText("6h")).toBeInTheDocument();
      expect(screen.getByText("24h")).toBeInTheDocument();
      expect(screen.getByText("7d")).toBeInTheDocument();
    });
  });

  it("renders metric chart", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("timeseries-chart")).toBeInTheDocument();
    });
  });

  it("shows threshold overlay label", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Threshold: 80")).toBeInTheDocument();
    });
  });

  it("shows back button to alerts list", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alerts")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    (api.alerts.getRule as Mock).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows not found state for invalid rule", async () => {
    (api.alerts.getRule as Mock).mockRejectedValue(new Error("Not found"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alert rule not found")).toBeInTheDocument();
      expect(screen.getByText("Back to Alerts")).toBeInTheDocument();
    });
  });

  it("shows no events message when history is empty", async () => {
    (api.alerts.listEvents as Mock).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No alert events recorded for this rule.")).toBeInTheDocument();
    });
  });

  it("shows enabled status info", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeInTheDocument();
    });
  });
});
