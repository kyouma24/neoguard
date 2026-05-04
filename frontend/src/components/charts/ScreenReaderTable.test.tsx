import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ScreenReaderTable } from "./ScreenReaderTable";
import type { MetricQueryResult } from "../../types";

function makeSeries(name: string, points: [string, number | null][]): MetricQueryResult {
  return { name, tags: {}, datapoints: points };
}

describe("ScreenReaderTable", () => {
  it("renders table with correct data", () => {
    const data: MetricQueryResult[] = [
      makeSeries("cpu.usage", [
        ["2026-05-02T12:00:00Z", 42.5],
        ["2026-05-02T12:01:00Z", 55.0],
      ]),
    ];

    render(<ScreenReaderTable data={data} widgetType="timeseries" widgetTitle="CPU Usage" />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();

    // Check data rows — series name appears in every row
    expect(screen.getByText("42.5")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    const seriesCells = screen.getAllByText("cpu.usage");
    expect(seriesCells.length).toBe(2);
  });

  it("has sr-only class", () => {
    const data: MetricQueryResult[] = [
      makeSeries("mem.used", [["2026-05-02T12:00:00Z", 1024]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="stat" />);

    const table = screen.getByRole("table");
    expect(table.className).toBe("sr-only");
  });

  it("limits to 100 rows", () => {
    const points: [string, number | null][] = [];
    for (let i = 0; i < 150; i++) {
      points.push([`2026-05-02T12:${String(i).padStart(2, "0")}:00Z`, i]);
    }
    const data: MetricQueryResult[] = [makeSeries("big.metric", points)];

    const { container } = render(
      <ScreenReaderTable data={data} widgetType="timeseries" widgetTitle="Big Chart" />
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(100);
  });

  it("handles empty data", () => {
    const { container } = render(
      <ScreenReaderTable data={[]} widgetType="timeseries" widgetTitle="Empty" />
    );

    // Should render nothing when there's no data
    expect(container.querySelector("table")).toBeNull();
  });

  it("has proper aria-label with widget title", () => {
    const data: MetricQueryResult[] = [
      makeSeries("net.bytes", [["2026-05-02T12:00:00Z", 500]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="area" widgetTitle="Network Traffic" />);

    const table = screen.getByRole("table");
    expect(table.getAttribute("aria-label")).toBe("Data table for Network Traffic");
  });

  it("falls back to widget type in aria-label when no title", () => {
    const data: MetricQueryResult[] = [
      makeSeries("disk.io", [["2026-05-02T12:00:00Z", 200]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="gauge" />);

    const table = screen.getByRole("table");
    expect(table.getAttribute("aria-label")).toBe("Data table for gauge widget");
  });

  it("has correct column headers", () => {
    const data: MetricQueryResult[] = [
      makeSeries("test", [["2026-05-02T12:00:00Z", 1]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="timeseries" />);

    expect(screen.getByText("Timestamp")).toBeInTheDocument();
    expect(screen.getByText("Series Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
  });

  it("shows N/A for null values", () => {
    const data: MetricQueryResult[] = [
      makeSeries("sparse", [["2026-05-02T12:00:00Z", null]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="timeseries" />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("flattens multiple series into a single table", () => {
    const data: MetricQueryResult[] = [
      makeSeries("series-a", [["2026-05-02T12:00:00Z", 10]]),
      makeSeries("series-b", [["2026-05-02T12:00:00Z", 20]]),
    ];

    render(<ScreenReaderTable data={data} widgetType="timeseries" />);

    expect(screen.getByText("series-a")).toBeInTheDocument();
    expect(screen.getByText("series-b")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});
