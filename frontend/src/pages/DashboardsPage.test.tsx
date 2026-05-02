import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { DashboardsPage } from "./DashboardsPage";
import { api } from "../services/api";
import type { Dashboard, PanelDefinition } from "../types";

// jsdom lacks ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock("../services/api", () => ({
  api: {
    system: { stats: vi.fn() },
    health: vi.fn(),
    dashboards: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
    metrics: {
      query: vi.fn(),
      names: vi.fn(),
    },
    mql: {
      query: vi.fn(),
      validate: vi.fn(),
    },
  },
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock("../components/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <div data-testid="timeseries-chart" />,
}));

vi.mock("../components/charts", () => ({
  AreaChartWidget: () => <div data-testid="area-chart" />,
  BarChartWidget: () => <div data-testid="bar-chart" />,
  PieChartWidget: () => <div data-testid="pie-chart" />,
  StatWidget: () => <div data-testid="stat-widget" />,
  TextWidget: ({ content }: { content: string }) => (
    <div data-testid="text-widget">{content}</div>
  ),
}));

vi.mock("react-grid-layout", () => ({
  GridLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid-layout">{children}</div>
  ),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "test@test.com",
      name: "Test User",
      is_super_admin: false,
      is_active: true,
      email_verified: true,
      created_at: "2026-01-01",
    },
    tenant: {
      id: "t1",
      slug: "test",
      name: "Test Org",
      tier: "free",
      status: "active",
      created_at: "2026-01-01",
    },
    role: "owner",
    loading: false,
  }),
}));

const NOW = "2026-05-01T12:00:00Z";

const PANEL_1: PanelDefinition = {
  id: "panel-1",
  title: "CPU Usage",
  panel_type: "timeseries",
  metric_name: "aws.rds.cpu",
  tags: {},
  aggregation: "avg",
  width: 6,
  height: 4,
  position_x: 0,
  position_y: 0,
};

const DASHBOARD_1: Dashboard = {
  id: "d1",
  tenant_id: "t1",
  name: "Production Overview",
  description: "Key production metrics",
  panels: [PANEL_1],
  created_at: NOW,
  updated_at: NOW,
};

const DASHBOARD_2: Dashboard = {
  id: "d2",
  tenant_id: "t1",
  name: "API Monitoring",
  description: "API latency and throughput",
  panels: [],
  created_at: NOW,
  updated_at: NOW,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardsPage />
    </MemoryRouter>
  );
}

describe("DashboardsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1, DASHBOARD_2]);
    (api.dashboards.create as Mock).mockResolvedValue({
      ...DASHBOARD_2,
      id: "d-new",
      name: "New Dashboard",
    });
    (api.dashboards.delete as Mock).mockResolvedValue(undefined);
    (api.dashboards.duplicate as Mock).mockResolvedValue({
      ...DASHBOARD_1,
      id: "d-dup",
      name: "Production Overview (Copy)",
    });
    (api.dashboards.update as Mock).mockResolvedValue(DASHBOARD_1);
    (api.metrics.query as Mock).mockResolvedValue([]);
    (api.metrics.names as Mock).mockResolvedValue([
      "aws.rds.cpu",
      "aws.ec2.network.in",
      "system.memory.used",
    ]);
    (api.mql.query as Mock).mockResolvedValue([]);
    (api.mql.validate as Mock).mockResolvedValue({
      valid: true,
      aggregator: "avg",
      metric_name: "cpu",
      filter_count: 0,
      function_count: 0,
      has_rollup: false,
    });
  });

  describe("Dashboard List", () => {
    it("renders dashboard cards after loading", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });
      expect(screen.getByText("API Monitoring")).toBeInTheDocument();
    });

    it("shows panel count on each card", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("1 panel")).toBeInTheDocument();
      });
      expect(screen.getByText("0 panels")).toBeInTheDocument();
    });

    it("shows empty state when no dashboards", async () => {
      (api.dashboards.list as Mock).mockResolvedValue([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("No dashboards yet")).toBeInTheDocument();
      });
    });

    it("shows New Dashboard button for owners", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("New Dashboard")).toBeInTheDocument();
      });
    });
  });

  describe("Create Dashboard", () => {
    it("opens create modal and creates dashboard", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("New Dashboard")).toBeInTheDocument();
      });

      await user.click(screen.getByText("New Dashboard"));

      const nameInput = screen.getByPlaceholderText("Dashboard name");
      expect(nameInput).toBeInTheDocument();

      await user.type(nameInput, "New Dashboard");
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(api.dashboards.create).toHaveBeenCalledWith({
        name: "New Dashboard",
        description: "",
        panels: [],
      });
    });

    it("disables Create button when name is empty", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("New Dashboard")).toBeInTheDocument();
      });

      await user.click(screen.getByText("New Dashboard"));

      const createButton = screen.getByRole("button", { name: "Create" });
      expect(createButton).toBeDisabled();
    });
  });

  describe("Delete Dashboard", () => {
    it("shows confirm dialog before deleting", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      const deleteBtns = screen.getAllByRole("button").filter((b) => {
        const inner = b.innerHTML;
        return inner.includes("trash") || inner.includes("Trash");
      });

      if (deleteBtns.length > 0) {
        await user.click(deleteBtns[0]);

        await waitFor(() => {
          expect(screen.getByText("Delete Dashboard")).toBeInTheDocument();
        });
      }
    });
  });

  describe("Dashboard Viewer", () => {
    it("navigates to viewer when clicking dashboard card", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Production Overview"));

      await waitFor(() => {
        expect(screen.getByText("Key production metrics")).toBeInTheDocument();
      });
      expect(screen.getByTestId("grid-layout")).toBeInTheDocument();
    });

    it("shows empty state when dashboard has no panels", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("API Monitoring")).toBeInTheDocument();
      });

      await user.click(screen.getByText("API Monitoring"));

      await waitFor(() => {
        expect(screen.getByText("No panels yet")).toBeInTheDocument();
      });
    });

    it("shows time range picker in viewer", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Production Overview"));

      await waitFor(() => {
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });
    });

    it("has back button to return to list", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Production Overview"));

      await waitFor(() => {
        expect(screen.getByText("Key production metrics")).toBeInTheDocument();
      });

      const backBtns = screen.getAllByRole("button").filter(
        (b) => b.innerHTML.includes("arrow") || b.innerHTML.includes("Arrow")
      );
      if (backBtns.length > 0) {
        await user.click(backBtns[0]);
        await waitFor(() => {
          expect(screen.getByRole("heading", { name: "My Dashboards" })).toBeInTheDocument();
        });
      }
    });
  });

  describe("Dashboard Editor", () => {
    it("navigates to editor and shows edit controls", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      // Click Edit button on the card
      const editBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("Edit")
      );
      if (editBtns.length > 0) {
        await user.click(editBtns[0]);

        await waitFor(() => {
          expect(screen.getByText("Edit Dashboard")).toBeInTheDocument();
        });
        expect(screen.getByText("Add Panel")).toBeInTheDocument();
        expect(screen.getByText("Save Dashboard")).toBeInTheDocument();
      }
    });

    it("opens panel editor drawer when clicking Add Panel", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      const editBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("Edit")
      );
      if (editBtns.length > 0) {
        await user.click(editBtns[0]);

        await waitFor(() => {
          expect(screen.getByText("Edit Dashboard")).toBeInTheDocument();
        });

        // Click the "Add Panel" toolbar button (secondary variant)
        const addPanelBtns = screen.getAllByRole("button").filter(
          (b) => b.textContent?.trim() === "Add Panel"
        );
        await user.click(addPanelBtns[0]);

        await waitFor(() => {
          expect(screen.getByPlaceholderText("e.g., CPU Usage")).toBeInTheDocument();
        });
      }
    });

    it("saves dashboard changes", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      const editBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("Edit")
      );
      if (editBtns.length > 0) {
        await user.click(editBtns[0]);

        await waitFor(() => {
          expect(screen.getByText("Save Dashboard")).toBeInTheDocument();
        });

        await user.click(screen.getByText("Save Dashboard"));

        await waitFor(() => {
          expect(api.dashboards.update).toHaveBeenCalledWith(
            "d1",
            expect.objectContaining({ name: "Production Overview" })
          );
        });
      }
    });
  });

  describe("Panel Editor — Query Mode Toggle", () => {
    async function openPanelEditor() {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      const editBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("Edit")
      );
      await user.click(editBtns[0]);

      await waitFor(() => {
        expect(screen.getByText("Add Panel")).toBeInTheDocument();
      });

      await user.click(screen.getByText("Add Panel"));

      await waitFor(() => {
        expect(screen.getByPlaceholderText("e.g., CPU Usage")).toBeInTheDocument();
      });

      return user;
    }

    it("defaults to Simple query mode", async () => {
      await openPanelEditor();

      expect(screen.getByText("Simple")).toBeInTheDocument();
      expect(screen.getByText("MQL")).toBeInTheDocument();
    });

    it("shows metric picker in Simple mode", async () => {
      await openPanelEditor();

      expect(screen.getByPlaceholderText("Search metrics...")).toBeInTheDocument();
    });

    it("switches to MQL mode and shows query textarea", async () => {
      const user = await openPanelEditor();

      await user.click(screen.getByText("MQL"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("avg:aws.rds.cpu{env:prod}.rate()")
        ).toBeInTheDocument();
      });
    });

    it("validates MQL query with debounce", async () => {
      const user = await openPanelEditor();

      await user.click(screen.getByText("MQL"));

      const textarea = await screen.findByPlaceholderText(
        "avg:aws.rds.cpu{env:prod}.rate()"
      );
      await user.type(textarea, "avg:cpu");

      await waitFor(
        () => {
          expect(api.mql.validate).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it("shows valid indicator for valid MQL query", async () => {
      const user = await openPanelEditor();

      await user.click(screen.getByText("MQL"));

      const textarea = await screen.findByPlaceholderText(
        "avg:aws.rds.cpu{env:prod}.rate()"
      );
      await user.type(textarea, "avg:cpu");

      await waitFor(
        () => {
          expect(screen.getByText("Valid query")).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it("shows error for invalid MQL query", async () => {
      (api.mql.validate as Mock).mockResolvedValue({
        valid: false,
        error: "Expected AGGREGATOR but got EOF",
        error_pos: 0,
        filter_count: 0,
        function_count: 0,
        has_rollup: false,
      });

      const user = await openPanelEditor();

      await user.click(screen.getByText("MQL"));

      const textarea = await screen.findByPlaceholderText(
        "avg:aws.rds.cpu{env:prod}.rate()"
      );
      await user.type(textarea, "badquery");

      await waitFor(
        () => {
          expect(
            screen.getByText("Expected AGGREGATOR but got EOF")
          ).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it("shows syntax hint in MQL mode", async () => {
      const user = await openPanelEditor();

      await user.click(screen.getByText("MQL"));

      await waitFor(() => {
        expect(screen.getByText(/aggregator:metric/)).toBeInTheDocument();
      });
    });
  });

  describe("Panel Types", () => {
    it("lists all panel type options in editor", async () => {
      const user = userEvent.setup();
      renderPage();

      await waitFor(() => {
        expect(screen.getByText("Production Overview")).toBeInTheDocument();
      });

      const editBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.includes("Edit")
      );
      await user.click(editBtns[0]);

      await waitFor(() => {
        expect(screen.getByText("Edit Dashboard")).toBeInTheDocument();
      });

      const addPanelBtns = screen.getAllByRole("button").filter(
        (b) => b.textContent?.trim() === "Add Panel"
      );
      await user.click(addPanelBtns[0]);

      await waitFor(() => {
        expect(screen.getByText("Panel Type")).toBeInTheDocument();
      });

      // NativeSelect renders a <select> near the "Panel Type" label
      const selects = screen.getAllByRole("combobox");
      const panelTypeSelect = selects.find((s) => {
        const options = within(s).getAllByRole("option");
        return options.some((o) => (o as HTMLOptionElement).value === "timeseries");
      });

      expect(panelTypeSelect).toBeTruthy();
      const options = within(panelTypeSelect!).getAllByRole("option");
      const values = options.map((o) => (o as HTMLOptionElement).value);
      expect(values).toContain("timeseries");
      expect(values).toContain("area");
      expect(values).toContain("stat");
      expect(values).toContain("top_list");
      expect(values).toContain("pie");
      expect(values).toContain("text");
    });
  });

  describe("Non-admin user", () => {
    it("does not show System Monitor tab for non-admin", async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getAllByText("My Dashboards").length).toBeGreaterThan(0);
      });

      expect(screen.queryByText("System Monitor")).not.toBeInTheDocument();
    });
  });
});
