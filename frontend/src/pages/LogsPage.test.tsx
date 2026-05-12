import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { LogsPage } from "./LogsPage";
import { api } from "../services/api";
import type { LogQueryResult } from "../types";

vi.mock("../services/api", () => ({
  api: {
    logs: {
      query: vi.fn(),
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

vi.mock("../components/LogHistogram", () => ({
  LogHistogram: () => <div data-testid="log-histogram" />,
}));

vi.mock("../components/LogFacetsSidebar", () => ({
  LogFacetsSidebar: () => <div data-testid="log-facets" />,
}));

vi.mock("../components/LogDetailDrawer", () => ({
  LogDetailDrawer: () => null,
}));

const LOG_RESULT: LogQueryResult = {
  logs: [
    {
      timestamp: "2026-05-04T10:00:00.123Z",
      severity: "info",
      service: "neoguard-api",
      message: "Request completed successfully",
    },
    {
      timestamp: "2026-05-04T10:00:01.456Z",
      severity: "error",
      service: "neoguard-collector",
      message: "Failed to connect to AWS endpoint",
    },
    {
      timestamp: "2026-05-04T10:00:02.789Z",
      severity: "warn",
      service: "neoguard-api",
      message: "Rate limit approaching threshold",
    },
  ],
  total: 3,
  has_more: false,
};

const EMPTY_RESULT: LogQueryResult = {
  logs: [],
  total: 0,
  has_more: false,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LogsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (api.logs.query as Mock).mockResolvedValue(LOG_RESULT);
});

describe("LogsPage", () => {
  it("renders page header", () => {
    renderPage();
    expect(screen.getByText("Log Explorer")).toBeInTheDocument();
  });

  it("shows search input", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Search logs... (supports AND, OR, NOT, field:value)")).toBeInTheDocument();
  });

  it("shows service input", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Service...")).toBeInTheDocument();
  });

  it("shows severity dropdown with all levels", () => {
    renderPage();
    const options = screen.getAllByRole("option");
    const severityOptions = options.filter((o) =>
      ["All levels", "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"].includes(o.textContent ?? ""),
    );
    expect(severityOptions.length).toBe(7);
  });

  it("shows Search button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("displays log entries after data loads", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Request completed successfully")).toBeInTheDocument();
      expect(screen.getByText("Failed to connect to AWS endpoint")).toBeInTheDocument();
      expect(screen.getByText("Rate limit approaching threshold")).toBeInTheDocument();
    });
  });

  it("displays service names", async () => {
    renderPage();
    await waitFor(() => {
      const apiServices = screen.getAllByText("neoguard-api");
      expect(apiServices.length).toBe(2);
      expect(screen.getByText("neoguard-collector")).toBeInTheDocument();
    });
  });

  it("displays severity badges", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("INFO")).toBeInTheDocument();
      expect(screen.getByText("ERROR")).toBeInTheDocument();
      expect(screen.getByText("WARN")).toBeInTheDocument();
    });
  });

  it("shows result count in subtitle", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("3 results")).toBeInTheDocument();
    });
  });

  it("shows empty state when no logs found", async () => {
    (api.logs.query as Mock).mockResolvedValue(EMPTY_RESULT);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No logs found")).toBeInTheDocument();
      expect(screen.getByText("Try adjusting your search filters or time range.")).toBeInTheDocument();
    });
  });

  it("calls query API on mount", () => {
    renderPage();
    expect(api.logs.query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: undefined,
        service: undefined,
        severity: undefined,
        limit: 100,
        offset: 0,
      }),
    );
  });

  it("triggers search on button click", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search logs... (supports AND, OR, NOT, field:value)"), "error");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(api.logs.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: "error" }),
      );
    });
  });

  it("triggers search on Enter key in search input", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search logs... (supports AND, OR, NOT, field:value)"), "test{enter}");

    await waitFor(() => {
      expect(api.logs.query).toHaveBeenCalledWith(
        expect.objectContaining({ query: "test" }),
      );
    });
  });
});
