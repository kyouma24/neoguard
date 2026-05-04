import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartLegend } from "./ChartLegend";
import type { MetricQueryResult } from "../../types";

const DATA: MetricQueryResult[] = [
  { name: "cpu", tags: {}, datapoints: [["2026-05-01T00:00:00Z", 50], ["2026-05-01T00:01:00Z", 60]] },
  { name: "memory", tags: {}, datapoints: [["2026-05-01T00:00:00Z", 80], ["2026-05-01T00:01:00Z", 70]] },
  { name: "disk", tags: {}, datapoints: [["2026-05-01T00:00:00Z", 30], ["2026-05-01T00:01:00Z", 35]] },
];

const COLORS = ["#635bff", "#22c55e", "#f59e0b"];

describe("ChartLegend", () => {
  it("renders all series names in list mode", () => {
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={vi.fn()}
      />,
    );
    expect(screen.getByText("cpu")).toBeInTheDocument();
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("disk")).toBeInTheDocument();
  });

  it("calls onToggleSeries on regular click", () => {
    const toggle = vi.fn();
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={toggle}
      />,
    );
    fireEvent.click(screen.getByText("cpu"));
    expect(toggle).toHaveBeenCalledWith("cpu");
  });

  it("calls onIsolateSeries on Ctrl+Click", () => {
    const toggle = vi.fn();
    const isolate = vi.fn();
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={toggle}
        onIsolateSeries={isolate}
      />,
    );
    fireEvent.click(screen.getByText("cpu"), { ctrlKey: true });
    expect(isolate).toHaveBeenCalledWith("cpu");
    expect(toggle).not.toHaveBeenCalled();
  });

  it("calls onIsolateSeries on Meta+Click (Mac)", () => {
    const toggle = vi.fn();
    const isolate = vi.fn();
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={toggle}
        onIsolateSeries={isolate}
      />,
    );
    fireEvent.click(screen.getByText("memory"), { metaKey: true });
    expect(isolate).toHaveBeenCalledWith("memory");
    expect(toggle).not.toHaveBeenCalled();
  });

  it("falls back to toggle if onIsolateSeries not provided and Ctrl+Click", () => {
    const toggle = vi.fn();
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={toggle}
      />,
    );
    fireEvent.click(screen.getByText("disk"), { ctrlKey: true });
    expect(toggle).toHaveBeenCalledWith("disk");
  });

  it("applies hidden style to hidden series", () => {
    const { container } = render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        hiddenSeries={new Set(["memory"])}
        onToggleSeries={vi.fn()}
      />,
    );
    const items = container.querySelectorAll("[class*=listItem]");
    const memoryItem = Array.from(items).find((el) => el.textContent?.includes("memory"));
    expect(memoryItem?.className).toContain("Hidden");
  });

  it("renders table mode with stat columns", () => {
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        config={{ position: "bottom", mode: "table", columns: ["last", "avg"] }}
        hiddenSeries={new Set()}
        onToggleSeries={vi.fn()}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
    expect(screen.getByText("Avg")).toBeInTheDocument();
  });

  it("calls onIsolateSeries on Ctrl+Click in table mode", () => {
    const isolate = vi.fn();
    render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        config={{ position: "bottom", mode: "table", columns: ["last"] }}
        hiddenSeries={new Set()}
        onToggleSeries={vi.fn()}
        onIsolateSeries={isolate}
      />,
    );
    fireEvent.click(screen.getByText("cpu"), { ctrlKey: true });
    expect(isolate).toHaveBeenCalledWith("cpu");
  });

  it("returns null when position is hidden", () => {
    const { container } = render(
      <ChartLegend
        data={DATA}
        colors={COLORS}
        config={{ position: "hidden", mode: "list" }}
        hiddenSeries={new Set()}
        onToggleSeries={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when data is empty", () => {
    const { container } = render(
      <ChartLegend
        data={[]}
        colors={COLORS}
        hiddenSeries={new Set()}
        onToggleSeries={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
