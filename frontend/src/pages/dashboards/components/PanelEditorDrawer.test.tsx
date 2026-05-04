import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { PanelDefinition } from "../../../types";

vi.mock("@monaco-editor/react", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const MockEditor = (props: any) => (
    <textarea
      data-testid="mock-monaco-editor"
      value={props.value ?? ""}
      placeholder={props.options?.placeholder ?? ""}
      onChange={(e) => props.onChange?.(e.target.value)}
      style={{ height: props.height }}
    />
  );
  return { default: MockEditor, __esModule: true };
});

vi.mock("../../../services/api", () => ({
  api: {
    metrics: { names: vi.fn(), query: vi.fn() },
    mql: { validate: vi.fn(), query: vi.fn() },
  },
}));

vi.mock("../../../hooks/useApi", () => ({
  useApi: vi.fn().mockReturnValue({
    data: ["aws.rds.cpu", "aws.ec2.network.in", "system.memory.used"],
    loading: false,
    error: null,
  }),
}));

vi.mock("../../../components/dashboard/WidgetRenderer", () => ({
  WidgetRenderer: () => <div data-testid="widget-preview" />,
}));

vi.mock("../../../components/MQLEditor", () => ({
  MQLEditor: (props: { value: string; onChange: (v: string) => void; error?: string; isValid?: boolean; placeholder?: string }) => (
    <div data-testid="mql-editor-container">
      <textarea
        data-testid="mql-textarea"
        value={props.value}
        placeholder={props.placeholder ?? "avg:aws.rds.cpu{env:prod}.rate()"}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.isValid && <span data-testid="mql-valid">Valid query</span>}
      {props.error && <span data-testid="mql-error">{props.error}</span>}
    </div>
  ),
}));

vi.mock("./DisplaySection", () => ({
  DisplaySection: () => <div data-testid="display-section">Display Options</div>,
}));

vi.mock("../../../components/charts/widgetRegistry", () => ({
  PANEL_TYPE_OPTIONS: [
    { value: "timeseries", label: "Time Series (Line)" },
    { value: "area", label: "Area Chart" },
    { value: "stat", label: "Single Stat" },
    { value: "top_list", label: "Top List (Bar)" },
    { value: "pie", label: "Pie / Donut" },
    { value: "text", label: "Text (Markdown)" },
  ],
}));

import { PanelEditorDrawer } from "./PanelEditorDrawer";
import { api } from "../../../services/api";

const DEFAULT_PANEL: PanelDefinition = {
  id: "p1",
  title: "",
  panel_type: "timeseries",
  metric_name: "",
  tags: {},
  aggregation: "avg",
  width: 6,
  height: 4,
  position_x: 0,
  position_y: 0,
};

describe("PanelEditorDrawer", () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (api.mql.validate as Mock).mockResolvedValue({
      valid: true,
      aggregator: "avg",
      metric_name: "cpu",
      filter_count: 0,
      function_count: 0,
      has_rollup: false,
    });
  });

  it("renders with title input and panel type selector", () => {
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    expect(screen.getByPlaceholderText("e.g., CPU Usage")).toBeInTheDocument();
    expect(screen.getByText("Panel Type")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add Panel" })).toBeInTheDocument();
  });

  it("defaults to Simple query mode with metric search", () => {
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    expect(screen.getByText("Simple")).toBeInTheDocument();
    expect(screen.getByText("MQL")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search metrics...")).toBeInTheDocument();
  });

  it("switches to MQL mode and shows MQL editor", async () => {
    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText("MQL"));

    await waitFor(() => {
      expect(screen.getByTestId("mql-editor-container")).toBeInTheDocument();
    });
  });

  it("validates MQL query with debounce", async () => {
    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText("MQL"));
    const textarea = await screen.findByTestId("mql-textarea");
    await user.type(textarea, "avg:cpu");

    await waitFor(
      () => { expect(api.mql.validate).toHaveBeenCalled(); },
      { timeout: 2000 },
    );
  });

  it("shows error for invalid MQL query", async () => {
    (api.mql.validate as Mock).mockResolvedValue({
      valid: false,
      error: "Expected AGGREGATOR but got EOF",
      error_pos: 0,
      filter_count: 0,
      function_count: 0,
      has_rollup: false,
    });

    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText("MQL"));
    const textarea = await screen.findByTestId("mql-textarea");
    await user.type(textarea, "badquery");

    await waitFor(
      () => { expect(screen.getByTestId("mql-error")).toBeInTheDocument(); },
      { timeout: 2000 },
    );
  });

  it("lists all panel type options", () => {
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    const selects = screen.getAllByRole("combobox");
    const panelTypeSelect = selects[0];
    const options = Array.from(panelTypeSelect.querySelectorAll("option"));
    const values = options.map((o) => o.value);

    expect(values).toContain("timeseries");
    expect(values).toContain("area");
    expect(values).toContain("stat");
    expect(values).toContain("text");
  });

  it("shows Display tab and switches to it", async () => {
    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText("Display"));
    expect(screen.getByTestId("display-section")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", async () => {
    const user = userEvent.setup();
    render(<PanelEditorDrawer panel={DEFAULT_PANEL} isNew onSave={onSave} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Edit Panel title when not new", () => {
    render(<PanelEditorDrawer panel={{ ...DEFAULT_PANEL, title: "CPU" }} isNew={false} onSave={onSave} onClose={onClose} />);

    expect(screen.getByText("Edit Panel")).toBeInTheDocument();
    expect(screen.getByText("Update Panel")).toBeInTheDocument();
  });
});
