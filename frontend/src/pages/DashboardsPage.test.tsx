import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("./dashboards/DashboardList", () => ({
  DashboardList: () => <div data-testid="dashboard-list">Dashboard List</div>,
}));

vi.mock("./dashboards/SystemMonitorDashboard", () => ({
  SystemMonitorDashboard: () => <div data-testid="system-monitor">System Monitor</div>,
}));

import { DashboardsPage } from "./DashboardsPage";
import { useAuth } from "../contexts/AuthContext";

const NON_ADMIN_AUTH = {
  user: { id: "u1", email: "user@test.com", name: "User", is_super_admin: false, is_active: true, email_verified: true, created_at: "2026-01-01" },
  tenant: { id: "t1", slug: "test", name: "Test Org", tier: "free", status: "active", created_at: "2026-01-01" },
  role: "owner" as const,
  loading: false,
};

const ADMIN_AUTH = {
  ...NON_ADMIN_AUTH,
  user: { ...NON_ADMIN_AUTH.user, is_super_admin: true },
};

describe("DashboardsPage (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dashboard list for non-admin", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(NON_ADMIN_AUTH);
    render(<MemoryRouter><DashboardsPage /></MemoryRouter>);

    expect(screen.getByTestId("dashboard-list")).toBeInTheDocument();
    expect(screen.queryByTestId("system-monitor")).not.toBeInTheDocument();
    expect(screen.queryByText("System Monitor")).not.toBeInTheDocument();
  });

  it("shows System Monitor tab for super admin", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(ADMIN_AUTH);
    render(<MemoryRouter><DashboardsPage /></MemoryRouter>);

    expect(screen.getAllByText("System Monitor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("My Dashboards").length).toBeGreaterThan(0);
  });

  it("defaults to System Monitor tab for admin", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(ADMIN_AUTH);
    render(<MemoryRouter><DashboardsPage /></MemoryRouter>);

    expect(screen.getByTestId("system-monitor")).toBeInTheDocument();
  });

  it("switches to My Dashboards tab on click", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(ADMIN_AUTH);
    const user = userEvent.setup();
    render(<MemoryRouter><DashboardsPage /></MemoryRouter>);

    await user.click(screen.getByText("My Dashboards"));

    expect(screen.getByTestId("dashboard-list")).toBeInTheDocument();
  });
});
