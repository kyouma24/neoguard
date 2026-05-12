import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AlertsPage } from "./AlertsPage";
import { api } from "../services/api";
import type { AlertRule, AlertEvent, Silence } from "../types";

vi.mock("../services/api", () => ({
  api: {
    alerts: {
      listRules: vi.fn(),
      createRule: vi.fn(),
      updateRule: vi.fn(),
      deleteRule: vi.fn(),
      listEvents: vi.fn(),
      acknowledgeEvent: vi.fn(),
      listSilences: vi.fn(),
      createSilence: vi.fn(),
      updateSilence: vi.fn(),
      deleteSilence: vi.fn(),
    },
    metrics: {
      names: vi.fn(),
    },
    notifications: {
      listChannels: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("../hooks/usePermissions", () => ({
  usePermissions: () => ({
    canCreate: true,
    canEdit: true,
    canDelete: true,
  }),
}));

vi.mock("../hooks/useInterval", () => ({
  useInterval: vi.fn(),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@test.com", is_super_admin: false },
    tenant: { id: "t1", name: "Test" },
  }),
}));

const RULE_1: AlertRule = {
  id: "rule-1",
  tenant_id: "t1",
  name: "High CPU",
  description: "CPU exceeds 80%",
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

const RULE_2: AlertRule = {
  id: "rule-2",
  tenant_id: "t1",
  name: "Memory Alert",
  description: "",
  metric_name: "neoguard.process.memory_rss_bytes",
  tags_filter: {},
  condition: "gt",
  threshold: 500000000,
  duration_sec: 120,
  interval_sec: 30,
  severity: "P2",
  enabled: false,
  notification: {},
  aggregation: "max",
  cooldown_sec: 600,
  nodata_action: "keep",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

const EVENT_FIRING: AlertEvent = {
  id: "evt-1",
  tenant_id: "t1",
  rule_id: "rule-1",
  rule_name: "High CPU",
  status: "firing",
  severity: "P1",
  message: "CPU at 92% for 60s",
  value: 92.5,
  threshold: "80",
  fired_at: "2026-05-04T10:00:00Z",
  resolved_at: null,
  acknowledged_at: null,
  acknowledged_by: null,
};

const EVENT_RESOLVED: AlertEvent = {
  id: "evt-2",
  tenant_id: "t1",
  rule_id: "rule-1",
  rule_name: "High CPU",
  status: "resolved",
  severity: "P1",
  message: "CPU recovered to 45%",
  value: 45.0,
  threshold: "80",
  fired_at: "2026-05-04T08:00:00Z",
  resolved_at: "2026-05-04T09:00:00Z",
  acknowledged_at: "2026-05-04T08:05:00Z",
  acknowledged_by: "admin",
};

const SILENCE_1: Silence = {
  id: "sil-1",
  tenant_id: "t1",
  name: "Maintenance Window",
  comment: "Weekly deploy",
  rule_ids: ["rule-1"],
  matchers: {},
  starts_at: "2026-05-04T02:00:00Z",
  ends_at: "2026-05-04T04:00:00Z",
  recurring: false,
  recurrence_days: [],
  recurrence_start_time: "",
  recurrence_end_time: "",
  timezone: "UTC",
  enabled: true,
  created_by: "admin",
  created_at: "2026-05-01T00:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AlertsPage />
    </MemoryRouter>,
  );
}

function mockDefaults() {
  (api.alerts.listRules as Mock).mockResolvedValue([RULE_1, RULE_2]);
  (api.alerts.listEvents as Mock).mockResolvedValue([EVENT_FIRING, EVENT_RESOLVED]);
  (api.alerts.listSilences as Mock).mockResolvedValue([SILENCE_1]);
  (api.metrics.names as Mock).mockResolvedValue(["neoguard.process.cpu_percent"]);
  ((api as unknown as { notifications: { listChannels: Mock } }).notifications.listChannels as Mock).mockResolvedValue([]);
}

function mockEmpty() {
  (api.alerts.listRules as Mock).mockResolvedValue([]);
  (api.alerts.listEvents as Mock).mockResolvedValue([]);
  (api.alerts.listSilences as Mock).mockResolvedValue([]);
  (api.metrics.names as Mock).mockResolvedValue([]);
  ((api as unknown as { notifications: { listChannels: Mock } }).notifications.listChannels as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AlertsPage — Rules Tab", () => {
  it("renders page header with title", async () => {
    mockDefaults();
    renderPage();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
  });

  it("shows firing alert count in subtitle", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1 alert currently firing")).toBeInTheDocument();
    });
  });

  it("shows Create Rule button", async () => {
    mockDefaults();
    renderPage();
    expect(screen.getByText("Create Rule")).toBeInTheDocument();
  });

  it("displays rules with name and metric", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("High CPU")).toBeInTheDocument();
      expect(screen.getByText("Memory Alert")).toBeInTheDocument();
      expect(screen.getByText("neoguard.process.cpu_percent")).toBeInTheDocument();
    });
  });

  it("shows condition with symbol", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("> 80")).toBeInTheDocument();
    });
  });

  it("shows severity badges", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("P1")).toBeInTheDocument();
      expect(screen.getByText("P2")).toBeInTheDocument();
    });
  });

  it("shows Active/Disabled status badges", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("shows empty state when no rules", async () => {
    mockEmpty();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No alert rules configured")).toBeInTheDocument();
    });
  });

  it("toggle rule calls updateRule with inverted enabled", async () => {
    mockDefaults();
    (api.alerts.updateRule as Mock).mockResolvedValue({ ...RULE_1, enabled: false });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("High CPU")).toBeInTheDocument();
    });

    const disableBtns = screen.getAllByTitle("Disable");
    await user.click(disableBtns[0]);

    expect(api.alerts.updateRule).toHaveBeenCalledWith("rule-1", { enabled: false });
  });

  it("delete shows confirmation dialog", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("High CPU")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("Delete");
    await user.click(deleteBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete Alert Rule")).toBeInTheDocument();
      expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    });
  });

  it("shows channel count badge for rules with notification channels", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1 ch")).toBeInTheDocument();
    });
  });

  it("shows nodata action badge", async () => {
    mockDefaults();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
      expect(screen.getByText("keep")).toBeInTheDocument();
    });
  });
});

describe("AlertsPage — Events Tab", () => {
  it("switches to events tab and shows events", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Events/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      expect(screen.getByText("CPU at 92% for 60s")).toBeInTheDocument();
      expect(screen.getByText("CPU recovered to 45%")).toBeInTheDocument();
    });
  });

  it("shows status and severity filter sections", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      expect(screen.getByText("Status:")).toBeInTheDocument();
      expect(screen.getByText("Severity:")).toBeInTheDocument();
    });
  });

  it("shows event values in the events table", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      expect(screen.getByText("92.50")).toBeInTheDocument();
      expect(screen.getByText("45.00")).toBeInTheDocument();
    });
  });

  it("acknowledge button appears on firing events", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      const ackBtns = screen.getAllByRole("button", { name: /Ack/ });
      expect(ackBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("calls acknowledgeEvent when Ack clicked", async () => {
    mockDefaults();
    (api.alerts.acknowledgeEvent as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Ack/ }).length).toBeGreaterThanOrEqual(1);
    });
    const ackBtns = screen.getAllByRole("button", { name: /Ack/ });
    await user.click(ackBtns[0]);

    expect(api.alerts.acknowledgeEvent).toHaveBeenCalledWith("evt-1", { acknowledged_by: "test@test.com" });
  });

  it("shows empty state with no events", async () => {
    mockEmpty();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Events/));

    await waitFor(() => {
      expect(screen.getByText("No alert events")).toBeInTheDocument();
    });
  });
});

describe("AlertsPage — Silences Tab", () => {
  it("switches to silences tab and shows silences", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("Maintenance Window")).toBeInTheDocument();
      expect(screen.getByText("Weekly deploy")).toBeInTheDocument();
    });
  });

  it("shows One-Time badge for non-recurring silence", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("One-Time")).toBeInTheDocument();
    });
  });

  it("shows create buttons for silences", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("One-Time Silence")).toBeInTheDocument();
      expect(screen.getByText("Recurring Silence")).toBeInTheDocument();
    });
  });

  it("shows active silence count", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("1 active silence")).toBeInTheDocument();
    });
  });

  it("shows empty state with no silences", async () => {
    mockEmpty();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("No silences configured")).toBeInTheDocument();
    });
  });

  it("delete silence shows confirmation", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText(/^Silences/));

    await waitFor(() => {
      expect(screen.getByText("Maintenance Window")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByTitle("Delete");
    await user.click(deleteBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Delete Silence")).toBeInTheDocument();
    });
  });
});
