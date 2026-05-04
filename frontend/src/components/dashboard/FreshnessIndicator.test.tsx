import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FreshnessIndicator } from "./FreshnessIndicator";

describe("FreshnessIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'just now' when data is very fresh", () => {
    const now = new Date();
    render(
      <FreshnessIndicator lastUpdateTime={now} widgetCount={5} errorCount={0} />
    );
    expect(screen.getByTestId("freshness-elapsed")).toHaveTextContent("just now");
  });

  it("shows elapsed time as seconds tick", () => {
    const now = new Date(1000000);
    vi.setSystemTime(now);

    render(
      <FreshnessIndicator lastUpdateTime={now} widgetCount={3} errorCount={0} />
    );
    expect(screen.getByTestId("freshness-elapsed")).toHaveTextContent("just now");

    // Advance 10 seconds — set system time THEN tick the interval
    act(() => {
      vi.setSystemTime(new Date(now.getTime() + 10_000));
      vi.advanceTimersByTime(1000);
    });
    // Should show seconds (between 10s and 11s due to interval tick timing)
    expect(screen.getByTestId("freshness-elapsed").textContent).toMatch(/1[01]s ago/);

    // Advance to 90 seconds total
    act(() => {
      vi.setSystemTime(new Date(now.getTime() + 90_000));
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("freshness-elapsed")).toHaveTextContent("1m ago");
  });

  it("uses green color when fresh (< 30s)", () => {
    const now = new Date();
    vi.setSystemTime(now);

    render(
      <FreshnessIndicator lastUpdateTime={now} widgetCount={1} errorCount={0} />
    );

    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.background).toContain("success");
  });

  it("uses yellow color when aging (30s - 120s)", () => {
    const thirtyFiveSecondsAgo = new Date(Date.now() - 35_000);
    render(
      <FreshnessIndicator lastUpdateTime={thirtyFiveSecondsAgo} widgetCount={1} errorCount={0} />
    );

    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.background).toContain("warning");
  });

  it("uses red color when stale (> 120s)", () => {
    const threeMinutesAgo = new Date(Date.now() - 180_000);
    render(
      <FreshnessIndicator lastUpdateTime={threeMinutesAgo} widgetCount={1} errorCount={0} />
    );

    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.background).toContain("error");
  });

  it("shows widget count", () => {
    render(
      <FreshnessIndicator lastUpdateTime={new Date()} widgetCount={12} errorCount={0} />
    );
    expect(screen.getByTestId("freshness-widget-count")).toHaveTextContent("12 widgets");
  });

  it("shows singular widget when count is 1", () => {
    render(
      <FreshnessIndicator lastUpdateTime={new Date()} widgetCount={1} errorCount={0} />
    );
    expect(screen.getByTestId("freshness-widget-count")).toHaveTextContent("1 widget");
  });

  it("shows error count when errors > 0", () => {
    render(
      <FreshnessIndicator lastUpdateTime={new Date()} widgetCount={10} errorCount={2} />
    );
    const errEl = screen.getByTestId("freshness-error-count");
    expect(errEl).toHaveTextContent("2 errors");
  });

  it("hides error count when errorCount is 0", () => {
    render(
      <FreshnessIndicator lastUpdateTime={new Date()} widgetCount={5} errorCount={0} />
    );
    expect(screen.queryByTestId("freshness-error-count")).not.toBeInTheDocument();
  });

  it("shows 'No data yet' when lastUpdateTime is null", () => {
    render(
      <FreshnessIndicator lastUpdateTime={null} widgetCount={0} errorCount={0} />
    );
    expect(screen.getByTestId("freshness-elapsed")).toHaveTextContent("No data yet");
  });
});
