import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

// Suppress React's noisy console.error for expected error boundary triggers
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** A component that throws on render — used to trigger the error boundary. */
function ThrowingChild({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error("Widget render boom");
  }
  return <div data-testid="happy-child">All good</div>;
}

describe("WidgetErrorBoundary", () => {
  it("renders children normally when no error occurs", () => {
    render(
      <WidgetErrorBoundary title="CPU Usage" height={200}>
        <div data-testid="child">Hello</div>
      </WidgetErrorBoundary>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("widget-error-boundary")).not.toBeInTheDocument();
  });

  it("catches render errors and shows the error UI with panel title", () => {
    render(
      <WidgetErrorBoundary title="CPU Usage" height={250}>
        <ThrowingChild />
      </WidgetErrorBoundary>
    );

    const errorUI = screen.getByTestId("widget-error-boundary");
    expect(errorUI).toBeInTheDocument();
    expect(errorUI).toHaveStyle({ height: "250px" });
    expect(screen.getByText("CPU Usage failed to render")).toBeInTheDocument();
    expect(screen.getByText("Widget render boom")).toBeInTheDocument();
    expect(screen.getByTestId("widget-error-retry")).toBeInTheDocument();
  });

  it("shows fallback title when title prop is empty", () => {
    render(
      <WidgetErrorBoundary title="" height={200}>
        <ThrowingChild />
      </WidgetErrorBoundary>
    );

    expect(screen.getByText("Widget failed to render")).toBeInTheDocument();
  });

  it("resets error state when the Retry button is clicked", () => {
    // Use a mutable ref so React's double-invoke in dev/strict mode doesn't skip the throw
    const state = { shouldThrow: true };

    function ConditionalThrow() {
      if (state.shouldThrow) {
        throw new Error("First render fail");
      }
      return <div data-testid="recovered-child">Recovered</div>;
    }

    render(
      <WidgetErrorBoundary title="Disk IO" height={180}>
        <ConditionalThrow />
      </WidgetErrorBoundary>
    );

    // Error state is shown
    expect(screen.getByTestId("widget-error-boundary")).toBeInTheDocument();
    expect(screen.getByText("First render fail")).toBeInTheDocument();

    // Stop throwing so retry renders the child
    state.shouldThrow = false;

    // Click retry
    fireEvent.click(screen.getByTestId("widget-error-retry"));

    // Now the child should render successfully
    expect(screen.queryByTestId("widget-error-boundary")).not.toBeInTheDocument();
    expect(screen.getByTestId("recovered-child")).toBeInTheDocument();
  });

  it("clears error state when resetKey changes", () => {
    const state = { shouldThrow: true };

    function ConditionalThrow() {
      if (state.shouldThrow) {
        throw new Error("Boom");
      }
      return <div data-testid="reset-child">Reset OK</div>;
    }

    const { rerender } = render(
      <WidgetErrorBoundary title="Memory" height={200} resetKey="key-1">
        <ConditionalThrow />
      </WidgetErrorBoundary>
    );

    // Error state is shown
    expect(screen.getByTestId("widget-error-boundary")).toBeInTheDocument();

    // Stop throwing, then change the resetKey — simulates user changing the time range
    state.shouldThrow = false;

    rerender(
      <WidgetErrorBoundary title="Memory" height={200} resetKey="key-2">
        <ConditionalThrow />
      </WidgetErrorBoundary>
    );

    // Error should be cleared and child rendered
    expect(screen.queryByTestId("widget-error-boundary")).not.toBeInTheDocument();
    expect(screen.getByTestId("reset-child")).toBeInTheDocument();
  });

  it("does NOT clear error when resetKey stays the same on rerender", () => {
    render(
      <WidgetErrorBoundary title="Network" height={200} resetKey="same">
        <ThrowingChild />
      </WidgetErrorBoundary>
    );

    expect(screen.getByTestId("widget-error-boundary")).toBeInTheDocument();
  });

  it("isolates errors — sibling boundaries are unaffected", () => {
    render(
      <div>
        <WidgetErrorBoundary title="Broken" height={100}>
          <ThrowingChild />
        </WidgetErrorBoundary>
        <WidgetErrorBoundary title="Healthy" height={100}>
          <div data-testid="healthy-child">I am fine</div>
        </WidgetErrorBoundary>
      </div>
    );

    // Broken widget shows error
    expect(screen.getByText("Broken failed to render")).toBeInTheDocument();
    // Healthy widget renders normally
    expect(screen.getByTestId("healthy-child")).toBeInTheDocument();
  });
});
