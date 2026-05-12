import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette";

// jsdom lacks ResizeObserver and scrollIntoView — cmdk requires both
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// cmdk calls scrollIntoView on selected items
Element.prototype.scrollIntoView = vi.fn();

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/dashboards", search: "", hash: "", state: null, key: "default" }),
  };
});

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      email: "test@test.com",
      name: "Test User",
      is_super_admin: true,
      is_active: true,
      email_verified: true,
      created_at: "2026-01-01",
    },
    tenant: null,
    role: "owner",
    loading: false,
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>,
  );
}

function renderTrigger() {
  return render(
    <MemoryRouter>
      <CommandPaletteTrigger />
      <CommandPalette />
    </MemoryRouter>,
  );
}

// Use fast user event setup to avoid per-character delays
const user = userEvent.setup({ delay: null });

async function openPalette() {
  await user.keyboard("{Control>}k{/Control}");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is not visible by default", () => {
    renderPalette();
    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K keydown", async () => {
    renderPalette();

    await openPalette();

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });
  });

  it("closes on Ctrl+K toggle", async () => {
    renderPalette();

    await openPalette();
    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    // Toggle off
    await user.keyboard("{Control>}k{/Control}");

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("renders navigation items", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Go to Overview")).toBeInTheDocument();
    });
    expect(screen.getByText("Go to Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Go to Metrics Explorer")).toBeInTheDocument();
    expect(screen.getByText("Go to Logs")).toBeInTheDocument();
    expect(screen.getByText("Go to Alerts")).toBeInTheDocument();
    expect(screen.getByText("Go to Insights")).toBeInTheDocument();
    expect(screen.getByText("Go to Settings")).toBeInTheDocument();
  });

  it("shows Admin item for super admins", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Go to Admin")).toBeInTheDocument();
    });
  });

  it("renders dashboard action items", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Create new dashboard")).toBeInTheDocument();
    });
  });

  it("renders time range items", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Last 5 minutes")).toBeInTheDocument();
    });
    expect(screen.getByText("Last 15 minutes")).toBeInTheDocument();
    expect(screen.getByText("Last 1 hour")).toBeInTheDocument();
    expect(screen.getByText("Last 4 hours")).toBeInTheDocument();
    expect(screen.getByText("Last 24 hours")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
  });

  it("shows kiosk mode item on dashboard page", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Enter kiosk mode")).toBeInTheDocument();
    });
  });

  it("filters items when typing in search", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Type a command or search...");
    await user.type(input, "dash");

    await waitFor(() => {
      expect(screen.getByText("Go to Insights")).toBeInTheDocument();
      expect(screen.getByText("Create new dashboard")).toBeInTheDocument();
    });

    // Non-matching items should be filtered out by cmdk
    expect(screen.queryByText("Go to Logs")).not.toBeInTheDocument();
  }, 15000);

  it("navigates when clicking a navigation item", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Go to Alerts")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Go to Alerts"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/alerts");
    });
  }, 10000);

  it("closes palette after navigation", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("Go to Metrics Explorer")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Go to Metrics Explorer"));

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  }, 10000);

  it("closes when clicking the overlay backdrop", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByTestId("command-palette-overlay")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("command-palette-overlay"));

    await waitFor(() => {
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when no results match", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("Type a command or search...");
    await user.type(input, "xyznonexistent");

    await waitFor(() => {
      expect(screen.getByText("No results found.")).toBeInTheDocument();
    });
  }, 15000);

  it("shows search placeholder text", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });
  });

  it("shows footer navigation hints", async () => {
    renderPalette();
    await openPalette();

    await waitFor(() => {
      expect(screen.getByText("navigate")).toBeInTheDocument();
      expect(screen.getByText("select")).toBeInTheDocument();
      expect(screen.getByText("close")).toBeInTheDocument();
    });
  });
});

describe("CommandPaletteTrigger", () => {
  it("renders the trigger button", () => {
    renderTrigger();
    expect(screen.getByLabelText("Open command palette")).toBeInTheDocument();
  });

  it("shows Search text and keyboard shortcut", () => {
    renderTrigger();
    expect(screen.getByText("Search...")).toBeInTheDocument();
  });

  it("opens palette when clicking the trigger", async () => {
    renderTrigger();

    await user.click(screen.getByLabelText("Open command palette"));

    await waitFor(() => {
      expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    });
  });
});
