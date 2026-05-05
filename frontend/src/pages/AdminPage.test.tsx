import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AdminPage } from "./AdminPage";
import { api } from "../services/api";
import type { PlatformStats, AdminTenant, AdminUser, PlatformAuditEntry } from "../types";

vi.mock("../services/api", () => ({
  api: {
    admin: {
      stats: vi.fn(),
      tenants: vi.fn(),
      users: vi.fn(),
      auditLog: vi.fn(),
      securityLog: vi.fn(),
      createTenant: vi.fn(),
      suspendTenant: vi.fn(),
      activateTenant: vi.fn(),
      tenantMembers: vi.fn(),
      grantSuperAdmin: vi.fn(),
      revokeSuperAdmin: vi.fn(),
      activateUser: vi.fn(),
      deactivateUser: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("../hooks/useURLState", () => ({
  useURLState: (_key: string, defaultVal: string) => {
    const { useState } = require("react");
    return useState(defaultVal);
  },
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@test.com", is_super_admin: true },
    tenant: { id: "t1", name: "Test Corp" },
    impersonating: false,
  }),
}));

const STATS: PlatformStats = {
  tenants: { total: 5, active: 4 },
  users: { total: 12, active: 10 },
  memberships: 18,
  api_keys_active: 7,
};

const TENANTS: AdminTenant[] = [
  {
    id: "t1",
    name: "Acme Corp",
    slug: "acme",
    tier: "pro",
    status: "active",
    created_at: "2026-01-15T00:00:00Z",
    member_count: 5,
  },
  {
    id: "t2",
    name: "Beta Inc",
    slug: "beta",
    tier: "free",
    status: "suspended",
    created_at: "2026-03-01T00:00:00Z",
    member_count: 2,
  },
];

const USERS: AdminUser[] = [
  {
    id: "u1",
    email: "admin@acme.com",
    name: "Admin User",
    is_super_admin: true,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "u2",
    email: "viewer@beta.com",
    name: "Regular User",
    is_super_admin: false,
    is_active: true,
    created_at: "2026-02-15T00:00:00Z",
  },
];

const AUDIT_LOG: PlatformAuditEntry[] = [
  {
    id: "a1",
    actor_id: "u1",
    actor_email: "admin@acme.com",
    action: "tenant.created",
    target_type: "tenant",
    target_id: "t2",
    details: { name: "Beta Inc" },
    created_at: "2026-05-01T10:00:00Z",
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

function mockDefaults() {
  (api.admin.stats as Mock).mockResolvedValue(STATS);
  (api.admin.tenants as Mock).mockResolvedValue(TENANTS);
  (api.admin.users as Mock).mockResolvedValue(USERS);
  (api.admin.auditLog as Mock).mockResolvedValue(AUDIT_LOG);
  (api.admin.securityLog as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDefaults();
});

describe("AdminPage — Header", () => {
  it("shows SUPER ADMIN MODE banner", () => {
    renderPage();
    expect(screen.getByText("SUPER ADMIN MODE")).toBeInTheDocument();
  });

  it("shows page title with [ADMIN] prefix", () => {
    renderPage();
    expect(screen.getByText("[ADMIN] Platform Administration")).toBeInTheDocument();
  });

  it("renders all tab buttons", () => {
    renderPage();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Tenants")).toBeInTheDocument();
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Audit Log")).toBeInTheDocument();
    expect(screen.getByText("Security Log")).toBeInTheDocument();
  });
});

describe("AdminPage — Overview Tab", () => {
  it("shows stat cards with data", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Total Tenants")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("4 active")).toBeInTheDocument();
    });
  });

  it("shows user count", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Total Users")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("10 active")).toBeInTheDocument();
    });
  });

  it("shows memberships and API keys", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Memberships")).toBeInTheDocument();
      expect(screen.getByText("18")).toBeInTheDocument();
      expect(screen.getByText("Active API Keys")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    (api.admin.stats as Mock).mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading stats...")).toBeInTheDocument();
  });

  it("shows error state on failure", async () => {
    (api.admin.stats as Mock).mockRejectedValue(new Error("Server error"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Failed to load stats")).toBeInTheDocument();
    });
  });
});

describe("AdminPage — Tenants Tab", () => {
  it("shows tenant list when switching to Tenants tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Tenants"));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Beta Inc")).toBeInTheDocument();
    });
  });

  it("shows tenant status badges", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Tenants"));

    await waitFor(() => {
      expect(screen.getByText("active")).toBeInTheDocument();
      expect(screen.getByText("suspended")).toBeInTheDocument();
    });
  });

  it("shows Create Tenant button", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Tenants"));

    await waitFor(() => {
      expect(screen.getByText("Create Tenant")).toBeInTheDocument();
    });
  });

  it("shows tenant tier info", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Tenants"));

    await waitFor(() => {
      expect(screen.getByText("pro")).toBeInTheDocument();
      expect(screen.getByText("free")).toBeInTheDocument();
    });
  });
});

describe("AdminPage — Users Tab", () => {
  it("shows user list when switching to Users tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Users"));

    await waitFor(() => {
      expect(screen.getByText("admin@acme.com")).toBeInTheDocument();
      expect(screen.getByText("viewer@beta.com")).toBeInTheDocument();
    });
  });

  it("shows super admin badge", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Users"));

    await waitFor(() => {
      expect(screen.getByText("Super Admin")).toBeInTheDocument();
    });
  });
});

describe("AdminPage — Audit Log Tab", () => {
  it("shows audit log entries", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Audit Log"));

    await waitFor(() => {
      expect(screen.getByText("tenant.created")).toBeInTheDocument();
      expect(screen.getByText("admin@acme.com")).toBeInTheDocument();
    });
  });
});
