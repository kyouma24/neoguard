import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartEmptyState } from "./ChartEmptyState";
import { ChartLoadingState } from "./ChartLoadingState";
import { ChartErrorState } from "./ChartErrorState";

describe("ChartEmptyState", () => {
  it("renders default message", () => {
    render(<ChartEmptyState height={300} />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<ChartEmptyState height={200} message="No metric configured" />);
    expect(screen.getByText("No metric configured")).toBeInTheDocument();
  });

  it("renders at specified height", () => {
    const { container } = render(<ChartEmptyState height={400} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("400px");
  });
});

describe("ChartLoadingState", () => {
  it("renders skeleton shimmer bars", () => {
    const { container } = render(<ChartLoadingState height={300} />);
    const shimmers = container.querySelectorAll(".skeleton-shimmer");
    expect(shimmers.length).toBe(5);
  });

  it("renders at specified height", () => {
    const { container } = render(<ChartLoadingState height={250} />);
    const wrapper = container.querySelector(".chart-loading-state") as HTMLElement;
    expect(wrapper.style.height).toBe("250px");
  });
});

describe("ChartErrorState", () => {
  it("renders error message", () => {
    render(<ChartErrorState height={300} error="Connection refused" />);
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("shows full error on hover via title attribute", () => {
    render(<ChartErrorState height={300} error="A very long error message that might be truncated" />);
    const errorEl = screen.getByTitle("A very long error message that might be truncated");
    expect(errorEl).toBeInTheDocument();
  });

  it("calls onRetry when retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ChartErrorState height={300} error="Timeout" onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides retry button when onRetry is not provided", () => {
    render(<ChartErrorState height={300} error="Timeout" />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("renders at specified height", () => {
    const { container } = render(<ChartErrorState height={350} error="err" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.height).toBe("350px");
  });
});
