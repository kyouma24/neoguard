import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DashboardGrid, type GridLayoutItem } from "./DashboardGrid";

// jsdom lacks ResizeObserver
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// jsdom lacks PointerEvent — provide a minimal shim for @dnd-kit sensors
if (typeof globalThis.PointerEvent === "undefined") {
  (globalThis as Record<string, unknown>).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init?: PointerEventInit & { pointerId?: number; pointerType?: string }) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
      this.pointerType = init?.pointerType ?? "mouse";
    }
  };
}

function makeLayout(count: number): GridLayoutItem[] {
  return Array.from({ length: count }, (_, i) => ({
    i: `panel-${i}`,
    x: (i * 6) % 12,
    y: Math.floor((i * 6) / 12) * 4,
    w: 6,
    h: 4,
  }));
}

function renderChildren(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <div key={`panel-${i}`} data-testid={`child-${i}`}>
      Panel {i}
    </div>
  ));
}

describe("DashboardGrid", () => {
  describe("View mode (editable=false)", () => {
    it("renders children at correct positions", () => {
      const layout = makeLayout(2);
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          {renderChildren(2)}
        </DashboardGrid>
      );

      expect(screen.getByTestId("child-0")).toBeInTheDocument();
      expect(screen.getByTestId("child-1")).toBeInTheDocument();
    });

    it("renders the grid container with correct test id", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      expect(screen.getByTestId("dashboard-grid")).toBeInTheDocument();
    });

    it("positions items absolutely with CSS transform", () => {
      const layout: GridLayoutItem[] = [
        { i: "a", x: 0, y: 0, w: 6, h: 4 },
        { i: "b", x: 6, y: 0, w: 6, h: 4 },
      ];
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          <div key="a" data-testid="panel-a">A</div>
          <div key="b" data-testid="panel-b">B</div>
        </DashboardGrid>
      );

      // Both panels should be rendered
      expect(screen.getByTestId("panel-a")).toBeInTheDocument();
      expect(screen.getByTestId("panel-b")).toBeInTheDocument();

      // Parent wrappers should have position: absolute
      const panelA = screen.getByTestId("panel-a").parentElement;
      expect(panelA?.style.position).toBe("absolute");
    });

    it("has no drag handles in view mode", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      expect(screen.queryByTestId("drag-handle-panel-0")).not.toBeInTheDocument();
      expect(screen.queryByTestId("resize-handle-panel-0")).not.toBeInTheDocument();
    });

    it("handles empty layout", () => {
      render(
        <DashboardGrid layout={[]} width={1200} editable={false}>
          {[]}
        </DashboardGrid>
      );

      const grid = screen.getByTestId("dashboard-grid");
      expect(grid).toBeInTheDocument();
      // Container height should be 0 for empty layout
      expect(grid.style.height).toBe("0px");
    });

    it("computes correct container height", () => {
      const layout: GridLayoutItem[] = [
        { i: "a", x: 0, y: 0, w: 6, h: 4 },
        { i: "b", x: 6, y: 4, w: 6, h: 3 },
      ];
      render(
        <DashboardGrid layout={layout} width={1200} editable={false} rowHeight={60} gap={12}>
          <div key="a">A</div>
          <div key="b">B</div>
        </DashboardGrid>
      );

      const grid = screen.getByTestId("dashboard-grid");
      // max(y+h) = 4+3 = 7 rows
      // height = 7 * 60 + (7-1) * 12 = 420 + 72 = 492
      expect(grid.style.height).toBe("492px");
    });

    it("uses default cols (12), rowHeight (60), gap (12)", () => {
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 12, h: 2 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          <div key="a" data-testid="full-width">Full</div>
        </DashboardGrid>
      );

      const wrapper = screen.getByTestId("full-width").parentElement;
      // Full width: 12 cols, w=12 => width = 12 * colWidth + 11 * gap = 1200
      // colWidth = (1200 - 11 * 12) / 12 = (1200 - 132) / 12 = 89
      // itemWidth = 12 * 89 + 11 * 12 = 1068 + 132 = 1200
      expect(wrapper?.style.width).toBe("1200px");
    });

    it("responds to different container widths", () => {
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 6, h: 4 }];
      const { rerender } = render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          <div key="a" data-testid="panel">Panel</div>
        </DashboardGrid>
      );

      const wrapper1 = screen.getByTestId("panel").parentElement;
      const width1 = wrapper1?.style.width;

      rerender(
        <DashboardGrid layout={layout} width={600} editable={false}>
          <div key="a" data-testid="panel">Panel</div>
        </DashboardGrid>
      );

      const wrapper2 = screen.getByTestId("panel").parentElement;
      const width2 = wrapper2?.style.width;

      // Width should change with container width
      expect(width1).not.toBe(width2);
    });
  });

  describe("Edit mode (editable=true)", () => {
    it("renders the grid container with editable class", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      const grid = screen.getByTestId("dashboard-grid");
      expect(grid.classList.contains("dashboard-grid--editable")).toBe(true);
    });

    it("shows drag handles in edit mode", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      expect(screen.getByTestId("drag-handle-panel-0")).toBeInTheDocument();
    });

    it("shows resize handles in edit mode", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      expect(screen.getByTestId("resize-handle-panel-0")).toBeInTheDocument();
    });

    it("grid items have accessible role and label", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-panel-0");
      expect(gridItem.getAttribute("role")).toBe("article");
      expect(gridItem.getAttribute("aria-label")).toBe("Dashboard panel panel-0");
      expect(gridItem.getAttribute("aria-roledescription")).toBe("draggable dashboard panel");
    });

    it("grid items are focusable (tabIndex=0)", () => {
      const layout = makeLayout(2);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(2)}
        </DashboardGrid>
      );

      const item0 = screen.getByTestId("grid-item-panel-0");
      const item1 = screen.getByTestId("grid-item-panel-1");
      expect(item0.getAttribute("tabindex")).toBe("0");
      expect(item1.getAttribute("tabindex")).toBe("0");
    });

    it("calls onLayoutChange with arrow key move (right)", async () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 2, y: 2, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowRight" });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 3, y: 2, w: 4, h: 3 },
      ]);
    });

    it("calls onLayoutChange with arrow key move (left)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 2, y: 2, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowLeft" });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 1, y: 2, w: 4, h: 3 },
      ]);
    });

    it("calls onLayoutChange with arrow key move (up)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 2, y: 2, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowUp" });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 2, y: 1, w: 4, h: 3 },
      ]);
    });

    it("calls onLayoutChange with arrow key move (down)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 2, y: 2, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowDown" });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 2, y: 3, w: 4, h: 3 },
      ]);
    });

    it("clamps left movement to 0", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowLeft" });

      // Already at x=0, no change should be emitted
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("clamps upward movement to 0", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowUp" });

      // Already at y=0, no change should be emitted
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("clamps right movement to fit within cols", () => {
      const onLayoutChange = vi.fn();
      // w=4 at x=8 means max x = 12-4 = 8, already at boundary
      const layout: GridLayoutItem[] = [{ i: "a", x: 8, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} cols={12} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowRight" });

      // Already at max x, no change should be emitted
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("Shift+Arrow resizes by one grid unit (width increase)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowRight", shiftKey: true });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 0, y: 0, w: 5, h: 3 },
      ]);
    });

    it("Shift+Arrow resizes by one grid unit (width decrease)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowLeft", shiftKey: true });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 0, y: 0, w: 3, h: 3 },
      ]);
    });

    it("Shift+Arrow resizes by one grid unit (height increase)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowDown", shiftKey: true });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 0, y: 0, w: 4, h: 4 },
      ]);
    });

    it("Shift+Arrow resizes by one grid unit (height decrease)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowUp", shiftKey: true });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 0, y: 0, w: 4, h: 2 },
      ]);
    });

    it("Shift+Arrow enforces min size (w=1)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 1, h: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowLeft", shiftKey: true });

      // w is already 1, cannot go below — no change
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("Shift+Arrow enforces min size (h=1)", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 1 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowUp", shiftKey: true });

      // h is already 1, cannot go below — no change
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("Shift+Arrow respects custom minW from layout item", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 3, h: 3, minW: 3 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">Panel A</div>
        </DashboardGrid>
      );

      const gridItem = screen.getByTestId("grid-item-a");
      gridItem.focus();

      fireEvent.keyDown(gridItem, { key: "ArrowLeft", shiftKey: true });

      // w=3 and minW=3, cannot shrink
      expect(onLayoutChange).not.toHaveBeenCalled();
    });

    it("handles multiple items without interfering", () => {
      const onLayoutChange = vi.fn();
      const layout: GridLayoutItem[] = [
        { i: "a", x: 0, y: 0, w: 6, h: 4 },
        { i: "b", x: 6, y: 0, w: 6, h: 4 },
      ];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true} onLayoutChange={onLayoutChange}>
          <div key="a">A</div>
          <div key="b">B</div>
        </DashboardGrid>
      );

      const itemB = screen.getByTestId("grid-item-b");
      itemB.focus();

      fireEvent.keyDown(itemB, { key: "ArrowDown" });

      expect(onLayoutChange).toHaveBeenCalledWith([
        { i: "a", x: 0, y: 0, w: 6, h: 4 },
        { i: "b", x: 6, y: 1, w: 6, h: 4 },
      ]);
    });

    it("does not show grid lines when not dragging", () => {
      const layout = makeLayout(1);
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          {renderChildren(1)}
        </DashboardGrid>
      );

      expect(screen.queryByTestId("grid-lines")).not.toBeInTheDocument();
    });

    it("drag handle has correct aria-label", () => {
      const layout: GridLayoutItem[] = [{ i: "my-panel", x: 0, y: 0, w: 6, h: 4 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          <div key="my-panel">Panel</div>
        </DashboardGrid>
      );

      const handle = screen.getByTestId("drag-handle-my-panel");
      expect(handle.getAttribute("aria-label")).toBe("Drag handle for panel my-panel");
    });

    it("resize handle has correct aria-label", () => {
      const layout: GridLayoutItem[] = [{ i: "my-panel", x: 0, y: 0, w: 6, h: 4 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={true}>
          <div key="my-panel">Panel</div>
        </DashboardGrid>
      );

      const handle = screen.getByTestId("resize-handle-my-panel");
      expect(handle.getAttribute("aria-label")).toBe("Resize handle for panel my-panel");
    });
  });

  describe("edge cases", () => {
    it("handles single item layout", () => {
      const layout: GridLayoutItem[] = [{ i: "solo", x: 0, y: 0, w: 12, h: 4 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          <div key="solo" data-testid="solo-panel">Solo</div>
        </DashboardGrid>
      );

      expect(screen.getByTestId("solo-panel")).toBeInTheDocument();
    });

    it("ignores children that do not match layout items", () => {
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 6, h: 4 }];
      render(
        <DashboardGrid layout={layout} width={1200} editable={false}>
          <div key="a" data-testid="panel-a">A</div>
          <div key="b" data-testid="panel-b">B</div>
        </DashboardGrid>
      );

      expect(screen.getByTestId("panel-a")).toBeInTheDocument();
      // panel-b is in DOM as a child but won't be rendered by the grid since
      // there is no layout item for it — it will be in the childMap but not positioned
      expect(screen.queryByTestId("panel-b")).not.toBeInTheDocument();
    });

    it("handles custom cols and rowHeight", () => {
      const layout: GridLayoutItem[] = [{ i: "a", x: 0, y: 0, w: 4, h: 2 }];
      render(
        <DashboardGrid layout={layout} width={800} cols={8} rowHeight={100} gap={8} editable={false}>
          <div key="a" data-testid="custom">Custom</div>
        </DashboardGrid>
      );

      const grid = screen.getByTestId("dashboard-grid");
      // max bottom = 0+2 = 2 rows => height = 2*100 + 1*8 = 208
      expect(grid.style.height).toBe("208px");
    });
  });
});
