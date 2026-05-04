import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChartTooltip } from "./ChartTooltip";

describe("ChartTooltip", () => {
  const LABEL = "2026-05-01T12:00:00Z";
  const PAYLOAD = [
    { dataKey: "cpu", value: 85.3, color: "#635bff", stroke: "#635bff" },
    { dataKey: "memory", value: 42.1, color: "#22c55e", stroke: "#22c55e" },
    { dataKey: "disk", value: 99.7, color: "#f59e0b", stroke: "#f59e0b" },
  ];

  it("renders nothing when not active", () => {
    const { container } = render(<ChartTooltip active={false} label={LABEL} payload={PAYLOAD} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing without payload", () => {
    const { container } = render(<ChartTooltip active={true} label={LABEL} payload={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders timestamp header", () => {
    render(<ChartTooltip active={true} label={LABEL} payload={PAYLOAD} />);
    expect(screen.getByText(/2026-05-01/)).toBeInTheDocument();
  });

  it("renders all series names", () => {
    render(<ChartTooltip active={true} label={LABEL} payload={PAYLOAD} />);
    expect(screen.getByText("cpu")).toBeInTheDocument();
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("disk")).toBeInTheDocument();
  });

  it("sorts entries by value descending", () => {
    const { container } = render(<ChartTooltip active={true} label={LABEL} payload={PAYLOAD} />);
    const names = Array.from(container.querySelectorAll("span"))
      .map((el) => el.textContent)
      .filter((t): t is string => !!t && ["cpu", "memory", "disk"].includes(t));
    expect(names).toEqual(["disk", "cpu", "memory"]);
  });

  it("formats values with unit", () => {
    render(
      <ChartTooltip
        active={true}
        label={LABEL}
        payload={[{ dataKey: "mem", value: 1073741824, color: "#fff", stroke: "#fff" }]}
        unit={{ category: "bytes" }}
      />,
    );
    expect(screen.getByText("1.00 GB")).toBeInTheDocument();
  });

  it("dims hidden series", () => {
    const hidden = new Set(["memory"]);
    const { container } = render(
      <ChartTooltip active={true} label={LABEL} payload={PAYLOAD} hiddenSeries={hidden} />,
    );
    const spans = container.querySelectorAll("span");
    const memorySpan = Array.from(spans).find((el) => el.textContent === "memory");
    expect(memorySpan).toBeTruthy();
    const row = memorySpan!.parentElement!;
    expect(row.style.opacity).toBe("0.3");
  });

  it("shows dash for null values", () => {
    render(
      <ChartTooltip
        active={true}
        label={LABEL}
        payload={[{ dataKey: "nullmetric", value: null, color: "#fff", stroke: "#fff" }]}
      />,
    );
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});
