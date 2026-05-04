import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShareMenu } from "./ShareMenu";
import { api } from "../../services/api";

vi.mock("../../services/api", () => ({
  api: {
    dashboards: {
      exportJson: vi.fn(),
    },
  },
}));

// Mock clipboard
const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: writeTextMock },
  writable: true,
  configurable: true,
});

// Track window.open for mailto test
const windowOpenSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  writeTextMock.mockResolvedValue(undefined);
  windowOpenSpy.mockReset();
  window.open = windowOpenSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShareMenu", () => {
  it("renders share button", () => {
    render(<ShareMenu dashboardId="dash-1" />);
    expect(screen.getByRole("button", { name: /share dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("opens dropdown on click", () => {
    render(<ShareMenu dashboardId="dash-1" />);
    expect(screen.queryByTestId("share-menu-dropdown")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    expect(screen.getByTestId("share-menu-dropdown")).toBeInTheDocument();
  });

  it("copy link copies dashboard URL to clipboard", async () => {
    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    fireEvent.click(screen.getByTestId("share-copy-link"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    const copiedUrl = writeTextMock.mock.calls[0][0] as string;
    expect(copiedUrl).toContain("/dashboards/dash-1");
  });

  it("copy link at current state uses absolute timestamps", async () => {
    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    fireEvent.click(screen.getByTestId("share-copy-snapshot"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(1);
    });
    const copiedUrl = writeTextMock.mock.calls[0][0] as string;
    // URL should contain absolute from/to ISO timestamps and range=custom
    expect(copiedUrl).toContain("range=custom");
    expect(copiedUrl).toContain("from=");
    expect(copiedUrl).toContain("to=");
    // The from/to should be ISO date strings (contain 'T' character)
    const url = new URL(copiedUrl);
    expect(url.searchParams.get("from")).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(url.searchParams.get("to")).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("export JSON triggers download", async () => {
    const mockData = { name: "Test Dashboard", panels: [] };
    (api.dashboards.exportJson as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

    // Track anchor creation
    const clickSpy = vi.fn();
    const createElementOriginal = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = createElementOriginal(tag);
      if (tag === "a") {
        vi.spyOn(el, "click").mockImplementation(clickSpy);
      }
      return el;
    });

    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    fireEvent.click(screen.getByTestId("share-export-json"));

    await waitFor(() => {
      expect(api.dashboards.exportJson).toHaveBeenCalledWith("dash-1");
    });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("email link opens mailto", () => {
    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    fireEvent.click(screen.getByTestId("share-email-link"));

    expect(windowOpenSpy).toHaveBeenCalledTimes(1);
    const mailtoUrl = windowOpenSpy.mock.calls[0][0] as string;
    expect(mailtoUrl).toMatch(/^mailto:\?subject=/);
    expect(mailtoUrl).toContain("Dashboard%20Link");
  });

  it("closes dropdown after an action", async () => {
    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));
    expect(screen.getByTestId("share-menu-dropdown")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("share-copy-link"));

    await waitFor(() => {
      expect(screen.queryByTestId("share-menu-dropdown")).not.toBeInTheDocument();
    });
  });

  it("menu items have aria-labels for accessibility", () => {
    render(<ShareMenu dashboardId="dash-1" />);
    fireEvent.click(screen.getByRole("button", { name: /share dashboard/i }));

    expect(screen.getByRole("menuitem", { name: /copy link$/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /copy link at current state/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /export as json/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /email link/i })).toBeInTheDocument();
  });
});
