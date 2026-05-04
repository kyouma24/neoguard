import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Monaco Editor requires a real browser DOM (canvas, web workers).
 * In jsdom we mock @monaco-editor/react with a plain <textarea> stand-in
 * so we can test the MQLEditor wrapper logic (props, states, styling).
 */

// --- Mock @monaco-editor/react ---
vi.mock("@monaco-editor/react", () => {
  const MockEditor = (props: {
    value?: string;
    onChange?: (val: string | undefined) => void;
    height?: number;
    options?: Record<string, unknown>;
    loading?: React.ReactNode;
  }) => {
    return (
      <textarea
        data-testid="mock-monaco-editor"
        value={props.value ?? ""}
        onChange={(e) => props.onChange?.(e.target.value)}
        style={{ height: props.height }}
      />
    );
  };
  return { default: MockEditor, __esModule: true };
});

import { MQLEditor } from "./MQLEditor";

describe("MQLEditor", () => {
  const defaultProps = {
    value: "",
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the editor container", () => {
    render(<MQLEditor {...defaultProps} />);
    expect(screen.getByTestId("mql-editor-container")).toBeInTheDocument();
  });

  it("renders the mock editor with the provided value", () => {
    render(<MQLEditor {...defaultProps} value="avg:cpu.usage" />);
    const editor = screen.getByTestId("mock-monaco-editor") as HTMLTextAreaElement;
    expect(editor.value).toBe("avg:cpu.usage");
  });

  it("calls onChange when value changes", async () => {
    const onChange = vi.fn();
    render(<MQLEditor {...defaultProps} onChange={onChange} />);
    const editor = screen.getByTestId("mock-monaco-editor") as HTMLTextAreaElement;

    // Simulate typing by dispatching a change event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(editor, "sum:mem.used");
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // The mock fires onChange via React's onChange handler
    expect(onChange).toHaveBeenCalled();
  });

  it("shows error text when error prop is set", () => {
    render(<MQLEditor {...defaultProps} error="Unexpected token" />);
    const errorEl = screen.getByTestId("mql-editor-error");
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toBe("Unexpected token");
  });

  it("applies error styling on the container when error prop is set", () => {
    render(<MQLEditor {...defaultProps} error="Bad query" />);
    const container = screen.getByTestId("mql-editor-container");
    expect(container.className).toContain("containerError");
  });

  it("shows valid indicator when isValid is true and no error", () => {
    render(<MQLEditor {...defaultProps} isValid={true} />);
    const validEl = screen.getByTestId("mql-editor-valid");
    expect(validEl).toBeInTheDocument();
    expect(validEl.textContent).toContain("Valid query");
  });

  it("applies valid styling on the container when isValid is true", () => {
    render(<MQLEditor {...defaultProps} isValid={true} />);
    const container = screen.getByTestId("mql-editor-container");
    expect(container.className).toContain("containerValid");
  });

  it("does not show valid indicator when there is an error even if isValid", () => {
    render(<MQLEditor {...defaultProps} isValid={true} error="Something wrong" />);
    expect(screen.queryByTestId("mql-editor-valid")).not.toBeInTheDocument();
    expect(screen.getByTestId("mql-editor-error")).toBeInTheDocument();
  });

  it("shows character counter with correct count", () => {
    render(<MQLEditor {...defaultProps} value="avg:cpu" maxLength={2000} />);
    const counter = screen.getByTestId("mql-editor-counter");
    expect(counter.textContent).toBe("7/2000");
  });

  it("character counter turns red when near maxLength", () => {
    const longValue = "a".repeat(1950);
    render(<MQLEditor {...defaultProps} value={longValue} maxLength={2000} />);
    const counter = screen.getByTestId("mql-editor-counter");
    expect(counter.textContent).toBe("1950/2000");
    expect(counter.className).toContain("charCounterDanger");
  });

  it("character counter is normal when below threshold", () => {
    render(<MQLEditor {...defaultProps} value="avg:cpu" maxLength={2000} />);
    const counter = screen.getByTestId("mql-editor-counter");
    expect(counter.className).not.toContain("charCounterDanger");
  });

  it("does not show error or valid state when both are absent", () => {
    render(<MQLEditor {...defaultProps} />);
    expect(screen.queryByTestId("mql-editor-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mql-editor-valid")).not.toBeInTheDocument();
    const container = screen.getByTestId("mql-editor-container");
    expect(container.className).not.toContain("containerError");
    expect(container.className).not.toContain("containerValid");
  });

  it("uses default maxLength of 2000 when not specified", () => {
    render(<MQLEditor {...defaultProps} value="test" />);
    const counter = screen.getByTestId("mql-editor-counter");
    expect(counter.textContent).toBe("4/2000");
  });
});
