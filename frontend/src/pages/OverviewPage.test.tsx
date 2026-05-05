import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { OverviewPage } from "./OverviewPage";
import { api } from "../services/api";
import type { HealthStatus, ResourceSummary, AlertRule, AlertEvent } from "../types";

vi.mock("../services/api", () => ({
  api: {
    health: vi.fn(),
    resources: { summary: vi.fn() },
    alerts: {
      listRules: vi.fn(),
      listEvents: vi.fn(),
    },
    metrics: { query: vi.fn() },
  },
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("../hooks/useInterval", () => ({
  useInterval: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@test.com", is_super_admin: true },
  }),
}));

vi.mock("../components/TimeSeriesChart", () => ({
  TimeSeriesChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="timeseries-chart">Chart with {data.length} series</div>
  ),
}));

const HEALTH: HealthStatus = {
  status: "healthy",
  checks: { database: "ok", redis: "ok", clickhouse: "ok" },
  degraded_reasons: [],
};

const RESOURCE_SUMMARY: ResourceSummary = {
  total: 52,
  by_provider: { aws: 43, azure: 9 },
  by_type: { ec2: 12, rds: 5, s3: 15, lambda: 11, vm: 5, storage_account: 4 },
};

const RULES: AlertRule[] = [
  {
    id: "r1",
    tenant_id: "t1",
    name: "CPU",
    description: "",
    metric_name: "cpu",
    tags_filter: {},
    condition: "gt",
    threshold: 80,
    duration_sec: 60,
    interval_sec: 15,
    severity: "P1",
    enabled: true,
    notification: {},
    aggregation: "avg",
    cooldown_sec: 300,
    nodata_action: "ok",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
  {
    id: "r2",
    tenant_id: "t1",
    name: "Memory",
    description: "",
    metric_name: "mem",
    tags_filter: {},
    condition: "gt",
    threshold: 90,
    duration_sec: 120,
    interval_sec: 30,
    severity: "P2",
    enabled: false,
    notification: {},
    aggregation: "max",
    cooldown_sec: 300,
    nodata_action: "ok",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  },
];

const EVENTS: AlertEvent[] = [
  {
    id: "e1",
    tenant_id: "t1",
    rule_id: "r1",
    rule_name: "CPU",
    status: "firing",
    severity: "P1",
    message: "CPU at 95%",
    value: 95,
    threshold: "80",
    fired_at: "2026-05-04T10:00:00Z",
    resolved_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

function mockDefaults() {
  (api.health as Mock).mockResolvedValue(HEALTH);
  (api.resources.summary as Mock).mockResolvedValue(RESOURCE_SUMMARY);
  (api.alerts.listRules as Mock).mockResolvedValue(RULES);
  (api.alerts.listEvents as Mock).mockResolvedValue(EVENTS);
  (api.metrics.query as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDefaults();
});

describe("OverviewPage", () => {
  it("renders the page header", () => {
    renderPage();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("shows system status stat card", async () => {
    renderPage();
    await waitFor(() => {
      const statusLabels = screen.getAllByText("Status");
      expect(statusLabels.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("healthy")).toBeInTheDocument();
    });
  });

  it("shows resource count stat card", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Resources")).toBeInTheDocument();
      const totalElements = screen.getAllByText("52");
      expect(totalElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows firing alerts count", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Firing Alerts")).toBeInTheDocument();
    });
  });

  it("shows alert rules summary (enabled / total)", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Alert Rules")).toBeInTheDocument();
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });
  });

  it("shows resources by provider section", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Resources by Provider")).toBeInTheDocument();
      expect(screen.getByText("AWS")).toBeInTheDocument();
      expect(screen.getByText("Azure")).toBeInTheDocument();
    });
  });

  it("shows provider percentages", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/43/)).toBeInTheDocument();
      expect(screen.getByText(/83%/)).toBeInTheDocument();
    });
  });

  it("shows system health checks", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("System Health")).toBeInTheDocument();
      expect(screen.getByText("database")).toBeInTheDocument();
      expect(screen.getByText("redis")).toBeInTheDocument();
      expect(screen.getByText("clickhouse")).toBeInTheDocument();
    });
  });

  it("shows resource inventory by type", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Resource Inventory")).toBeInTheDocument();
      expect(screen.getByText("ec2")).toBeInTheDocument();
      expect(screen.getByText("s3")).toBeInTheDocument();
    });
  });

  it("shows degraded banner when status is degraded", async () => {
    (api.health as Mock).mockResolvedValue({
      ...HEALTH,
      status: "degraded",
      degraded_reasons: ["redis timeout"],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("System Degraded")).toBeInTheDocument();
      expect(screen.getByText(/redis timeout/)).toBeInTheDocument();
    });
  });

  it("shows auto-refresh toggle button", () => {
    renderPage();
    expect(screen.getByText("Auto-refresh ON")).toBeInTheDocument();
  });

  it("toggles auto-refresh off when clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Auto-refresh ON"));
    expect(screen.getByText("Auto-refresh OFF")).toBeInTheDocument();
  });

  it("shows CPU and Memory charts for admin users", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("CPU Usage (%)")).toBeInTheDocument();
      expect(screen.getByText("Memory RSS (MB)")).toBeInTheDocument();
    });
  });

  it("shows time range selector buttons", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("15m")).toBeInTheDocument();
      expect(screen.getByText("1h")).toBeInTheDocument();
      expect(screen.getByText("6h")).toBeInTheDocument();
      expect(screen.getByText("24h")).toBeInTheDocument();
    });
  });

  it("shows currently firing alerts section", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Currently Firing")).toBeInTheDocument();
      const cpuTexts = screen.getAllByText(/CPU at 95%/);
      expect(cpuTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows 'Coming Soon' cards for deferred features", async () => {
    renderPage();
    expect(screen.getByText("SSO & MFA")).toBeInTheDocument();
    expect(screen.getByText("Real-Time WebSockets")).toBeInTheDocument();
    expect(screen.getByText("E2E Testing & Load Testing")).toBeInTheDocument();
  });

  it("shows 'No resources discovered' when resource summary is empty", async () => {
    (api.resources.summary as Mock).mockResolvedValue({
      total: 0,
      by_provider: {},
      by_type: {},
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No resources discovered yet")).toBeInTheDocument();
    });
  });
});
