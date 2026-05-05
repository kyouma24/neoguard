import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { DashboardSettings } from "./DashboardSettings";
import { api } from "../../services/api";
import type { Dashboard } from "../../types";

vi.mock("../../services/api", () => ({
  api: {
    dashboards: {
      update: vi.fn(),
      getMyPermission: vi.fn(),
      getPermissions: vi.fn(),
      setPermission: vi.fn(),
      removePermission: vi.fn(),
      getVersions: vi.fn(),
      listVersions: vi.fn(),
    },
    tenants: {
      members: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@test.com", is_super_admin: false },
    tenant: { id: "t1", name: "Test Corp" },
  }),
}));

const DASHBOARD: Dashboard = {
  id: "dash-1",
  tenant_id: "t1",
  name: "Production Overview",
  description: "Main production metrics dashboard",
  panels: [],
  variables: [],
  groups: [],
  tags: ["production", "monitoring"],
  links: [],
  created_by: "u1",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-03T12:00:00Z",
};

const mockOnBack = vi.fn();
const mockOnSaved = vi.fn();

function renderComponent() {
  return render(
    <MemoryRouter>
      <DashboardSettings
        dashboard={DASHBOARD}
        onBack={mockOnBack}
        onSaved={mockOnSaved}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (api.dashboards.getMyPermission as Mock).mockResolvedValue({
    permission: "admin",
    can_view: true,
    can_edit: true,
    can_admin: true,
  });
  (api.dashboards.getPermissions as Mock).mockResolvedValue([]);
  (api.dashboards.getVersions as Mock).mockResolvedValue([]);
  (api.dashboards.listVersions as Mock).mockResolvedValue([]);
  (api.tenants.members as Mock).mockResolvedValue([]);
});

describe("DashboardSettings", () => {
  it("shows settings header with dashboard name", () => {
    renderComponent();
    expect(screen.getByText("Settings — Production Overview")).toBeInTheDocument();
  });

  it("shows back button", () => {
    renderComponent();
    expect(screen.getByLabelText("Go back")).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByLabelText("Go back"));
    expect(mockOnBack).toHaveBeenCalled();
  });

  it("renders all settings tabs", () => {
    renderComponent();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("Variables")).toBeInTheDocument();
    expect(screen.getByText("Links")).toBeInTheDocument();
    expect(screen.getByText("Versions")).toBeInTheDocument();
  });

  it("General tab is active by default", () => {
    renderComponent();
    expect(screen.getByDisplayValue("Production Overview")).toBeInTheDocument();
  });

  it("shows dashboard description in General tab", () => {
    renderComponent();
    expect(screen.getByDisplayValue("Main production metrics dashboard")).toBeInTheDocument();
  });

  it("shows existing tags in General tab", () => {
    renderComponent();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByText("monitoring")).toBeInTheDocument();
  });

  it("switches to Permissions tab", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText("Permissions"));
    await waitFor(() => {
      expect(screen.getByText(/override the role-based defaults/i)).toBeInTheDocument();
    });
  });

  it("switches to Versions tab", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByText("Versions"));
    await waitFor(() => {
      expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Versions");
    });
  });
});
