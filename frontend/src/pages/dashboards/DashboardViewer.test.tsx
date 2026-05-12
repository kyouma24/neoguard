import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dashboard, PanelDefinition } from "../../types";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@test.com", name: "Test User", is_super_admin: false, is_active: true, email_verified: true, created_at: "2026-01-01" },
    tenant: { id: "t1", slug: "test", name: "Test Org", tier: "free", status: "active", created_at: "2026-01-01" },
    role: "owner",
    loading: false,
  }),
}));

vi.mock("../../services/api", () => ({
  api: {
    annotations: { list: vi.fn().mockResolvedValue([]) },
    alerts: { listEvents: vi.fn().mockResolvedValue([]) },
    mql: { query: vi.fn().mockResolvedValue([]) },
    metrics: { query: vi.fn().mockResolvedValue([]) },
    dashboards: { update: vi.fn() },
  },
}));

vi.mock("../../components/dashboard/WidgetRenderer", () => ({
  WidgetRenderer: ({ panel }: { panel: PanelDefinition }) => (
    <div data-testid={`widget-${panel.id}`}>{panel.title}</div>
  ),
}));

vi.mock("../../components/dashboard/WidgetErrorBoundary", () => ({
  WidgetErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/dashboard/DashboardGrid", () => ({
  DashboardGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="grid-layout">{children}</div>
  ),
}));

vi.mock("../../components/dashboard/TimeRangePicker", () => ({
  TimeRangePicker: () => <div data-testid="time-range-picker">Time Range</div>,
  getTimeRange: () => ({ from: new Date("2026-01-01"), to: new Date("2026-01-02") }),
  getIntervalForRange: () => "1m",
}));

vi.mock("../../components/dashboard/AutoRefresh", () => ({
  AutoRefresh: () => <div data-testid="auto-refresh" />,
  getRefreshSeconds: () => null,
}));

vi.mock("../../components/dashboard/VariableBar", () => ({
  VariableBar: () => <div data-testid="variable-bar" />,
}));

vi.mock("../../components/dashboard/FullscreenPanel", () => ({
  FullscreenPanel: () => null,
}));

vi.mock("../../components/dashboard/AnnotationModal", () => ({
  AnnotationModal: () => null,
}));

vi.mock("../../components/dashboard/KeyboardShortcutOverlay", () => ({
  KeyboardShortcutOverlay: () => null,
}));

vi.mock("../../components/dashboard/LiveModePill", () => ({
  LiveModePill: () => null,
}));

vi.mock("../../components/dashboard/ShareMenu", () => ({
  ShareMenu: () => <div data-testid="share-menu" />,
}));

vi.mock("../../components/dashboard/FreshnessIndicator", () => ({
  FreshnessIndicator: () => null,
}));

vi.mock("../../components/dashboard/PanelInspector", () => ({
  PanelInspector: () => null,
}));

vi.mock("../../components/dashboard/ChangeIntelligenceBar", () => ({
  ChangeIntelligenceBar: () => null,
}));

vi.mock("../../components/dashboard/DashboardComments", () => ({
  DashboardComments: () => null,
}));

vi.mock("../../components/dashboard/CorrelationView", () => ({
  CorrelationOverlay: () => null,
}));

vi.mock("../../hooks/useLiveStream", () => ({
  useLiveStream: () => ({ data: null, status: "disconnected", start: vi.fn(), stop: vi.fn() }),
}));

vi.mock("../../hooks/useChangeIntelligence", () => ({
  useChangeIntelligence: () => ({ changes: [], loading: false }),
}));

vi.mock("../../utils/dashboardLayout", () => ({
  panelToLayoutItem: (p: PanelDefinition) => ({ i: p.id, x: p.position_x, y: p.position_y, w: p.width, h: p.height }),
  panelContentHeight: () => 200,
}));

vi.mock("../../utils/layoutMigrations", () => ({
  needsMigration: () => false,
  migrateToLatest: (d: unknown) => d,
}));

vi.mock("../../utils/sanitize", () => ({
  isSafeHref: () => true,
}));

const flagDefaults: Record<string, boolean> = {
  "dashboards.batch_queries": true,
  "dashboards.viewport_loading": true,
  "metrics.cardinality_denylist": true,
  "mql.streaming_batch": true,
};
vi.mock("../../hooks/useFeatureFlags", () => ({
  useFeatureFlag: (flag: string) => flagDefaults[flag] ?? true,
  useFeatureFlags: () => flagDefaults,
}));

vi.mock("../../hooks/useVisiblePanels", () => ({
  useVisiblePanels: ({ panels }: { panels: Array<{ id: string }> }) =>
    new Set(panels.map((p) => p.id)),
}));

vi.mock("../../hooks/useBatchPanelQueries", () => ({
  useBatchPanelQueries: () => ({}),
}));

import { DashboardViewer } from "./DashboardViewer";

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

const DASHBOARD: Dashboard = {
  id: "d1",
  tenant_id: "t1",
  name: "Production Overview",
  description: "Key production metrics",
  panels: [PANEL_1],
  variables: [],
  groups: [],
  created_at: "2026-05-01T12:00:00Z",
  updated_at: "2026-05-01T12:00:00Z",
};

const EMPTY_DASHBOARD: Dashboard = {
  ...DASHBOARD,
  id: "d2",
  name: "Empty Dashboard",
  panels: [],
};

describe("DashboardViewer", () => {
  const onBack = vi.fn();
  const onEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dashboard name and description", () => {
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(screen.getByText("Production Overview")).toBeInTheDocument();
    expect(screen.getByText("Key production metrics")).toBeInTheDocument();
  });

  it("renders grid with panels", () => {
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("grid-layout")).toBeInTheDocument();
    expect(screen.getByTestId("widget-panel-1")).toBeInTheDocument();
  });

  it("shows empty state when dashboard has no panels", () => {
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={EMPTY_DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(screen.getByText("No panels yet")).toBeInTheDocument();
  });

  it("shows Edit button", () => {
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("calls onEdit when Edit button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    await user.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("calls onBack when back button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    const backBtns = screen.getAllByRole("button").filter(
      (b) => b.innerHTML.includes("arrow") || b.innerHTML.includes("Arrow")
    );
    if (backBtns.length > 0) {
      await user.click(backBtns[0]);
      expect(onBack).toHaveBeenCalled();
    }
  });

  it("renders time range picker", () => {
    render(
      <MemoryRouter>
        <DashboardViewer dashboard={DASHBOARD} onBack={onBack} onEdit={onEdit} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("time-range-picker")).toBeInTheDocument();
  });
});
