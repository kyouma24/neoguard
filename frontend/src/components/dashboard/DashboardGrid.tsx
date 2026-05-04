import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { GridItem, type GridItemHandle } from "./GridItem";

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface DashboardGridProps {
  layout: GridLayoutItem[];
  width: number;
  cols?: number;
  rowHeight?: number;
  gap?: number;
  editable?: boolean;
  onLayoutChange?: (layout: GridLayoutItem[]) => void;
  children: React.ReactNode;
}

/**
 * Custom 12-column dashboard grid using @dnd-kit.
 * In view mode (editable=false): pure CSS positioning, no DnD context.
 * In edit mode (editable=true): drag via handle, resize via corner handle,
 *   keyboard support (Tab/Space/Arrows/Escape, Shift+Arrows for resize),
 *   grid lines shown while dragging.
 */
export function DashboardGrid({
  layout,
  width,
  cols = 12,
  rowHeight = 60,
  gap = 12,
  editable = false,
  onLayoutChange,
  children,
}: DashboardGridProps) {
  const colWidth = (width - (cols - 1) * gap) / cols;
  const containerHeight = computeContainerHeight(layout, rowHeight, gap);

  // Build a map from child key to child element
  const childMap = new Map<string, React.ReactNode>();
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    if (child && typeof child === "object" && "key" in child) {
      const key = (child as React.ReactElement).key;
      if (key != null) childMap.set(String(key), child);
    }
  }

  if (!editable) {
    return (
      <div
        className="dashboard-grid"
        style={{
          position: "relative",
          width,
          height: containerHeight,
          transition: "height 200ms ease",
        }}
        data-testid="dashboard-grid"
      >
        {layout.map((item) => {
          const child = childMap.get(item.i);
          if (!child) return null;
          return (
            <div
              key={item.i}
              style={{
                position: "absolute",
                transform: `translate(${item.x * colWidth + item.x * gap}px, ${item.y * rowHeight + item.y * gap}px)`,
                width: item.w * colWidth + (item.w - 1) * gap,
                height: item.h * rowHeight + (item.h - 1) * gap,
                transition: "transform 200ms ease, width 200ms ease, height 200ms ease",
              }}
            >
              {child}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <EditableGrid
      layout={layout}
      width={width}
      cols={cols}
      rowHeight={rowHeight}
      gap={gap}
      colWidth={colWidth}
      containerHeight={containerHeight}
      childMap={childMap}
      onLayoutChange={onLayoutChange}
    />
  );
}

interface EditableGridProps {
  layout: GridLayoutItem[];
  width: number;
  cols: number;
  rowHeight: number;
  gap: number;
  colWidth: number;
  containerHeight: number;
  childMap: Map<string, React.ReactNode>;
  onLayoutChange?: (layout: GridLayoutItem[]) => void;
}

function EditableGrid({
  layout,
  width,
  cols,
  rowHeight,
  gap,
  colWidth,
  containerHeight,
  childMap,
  onLayoutChange,
}: EditableGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showGridLines, setShowGridLines] = useState(false);
  const gridItemRefs = useRef<Map<string, GridItemHandle>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 3 },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setShowGridLines(true);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setShowGridLines(false);

      const { active, delta } = event;
      if (!delta || (delta.x === 0 && delta.y === 0)) return;

      const id = String(active.id);
      const item = layout.find((l) => l.i === id);
      if (!item) return;

      // Convert pixel delta to grid units, snapping to nearest cell
      const deltaGridX = Math.round(delta.x / (colWidth + gap));
      const deltaGridY = Math.round(delta.y / (rowHeight + gap));
      if (deltaGridX === 0 && deltaGridY === 0) return;

      let newX = item.x + deltaGridX;
      let newY = item.y + deltaGridY;

      // Clamp to grid bounds
      newX = Math.max(0, Math.min(cols - item.w, newX));
      newY = Math.max(0, newY);

      const newLayout = layout.map((l) =>
        l.i === id ? { ...l, x: newX, y: newY } : l
      );
      onLayoutChange?.(newLayout);
    },
    [layout, colWidth, gap, rowHeight, cols, onLayoutChange]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setShowGridLines(false);
  }, []);

  const handleResize = useCallback(
    (id: string, deltaW: number, deltaH: number) => {
      const item = layout.find((l) => l.i === id);
      if (!item) return;

      let newW = item.w + deltaW;
      let newH = item.h + deltaH;

      // Enforce min size
      newW = Math.max(item.minW ?? 1, newW);
      newH = Math.max(item.minH ?? 1, newH);
      // Enforce max width (can't exceed cols from current position)
      newW = Math.min(cols - item.x, newW);
      // No max height constraint (grid grows vertically)
      newH = Math.max(1, newH);

      if (newW === item.w && newH === item.h) return;

      const newLayout = layout.map((l) =>
        l.i === id ? { ...l, w: newW, h: newH } : l
      );
      onLayoutChange?.(newLayout);
    },
    [layout, cols, onLayoutChange]
  );

  // Keyboard handler: Shift+ArrowKeys for resize, ArrowKeys for move when focused
  const handleKeyboardAction = useCallback(
    (id: string, action: "move" | "resize", dx: number, dy: number) => {
      const item = layout.find((l) => l.i === id);
      if (!item) return;

      if (action === "move") {
        let newX = item.x + dx;
        let newY = item.y + dy;
        newX = Math.max(0, Math.min(cols - item.w, newX));
        newY = Math.max(0, newY);
        if (newX === item.x && newY === item.y) return;
        const newLayout = layout.map((l) =>
          l.i === id ? { ...l, x: newX, y: newY } : l
        );
        onLayoutChange?.(newLayout);
      } else {
        handleResize(id, dx, dy);
      }
    },
    [layout, cols, onLayoutChange, handleResize]
  );

  // Register ref for a grid item
  const registerRef = useCallback((id: string, ref: GridItemHandle | null) => {
    if (ref) {
      gridItemRefs.current.set(id, ref);
    } else {
      gridItemRefs.current.delete(id);
    }
  }, []);

  // Render grid line overlay
  const gridLines = showGridLines ? (
    <div
      className="dashboard-grid-lines"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
      data-testid="grid-lines"
    >
      {Array.from({ length: cols + 1 }, (_, i) => (
        <div
          key={`col-${i}`}
          style={{
            position: "absolute",
            left: i * (colWidth + gap) - (i > 0 ? gap / 2 : 0),
            top: 0,
            bottom: 0,
            width: 1,
            borderLeft: "1px dotted rgba(255,255,255,0.08)",
          }}
        />
      ))}
    </div>
  ) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className="dashboard-grid dashboard-grid--editable"
        style={{
          position: "relative",
          width,
          height: containerHeight,
          transition: "height 200ms ease",
        }}
        data-testid="dashboard-grid"
      >
        {gridLines}
        {layout.map((item) => {
          const child = childMap.get(item.i);
          if (!child) return null;
          return (
            <GridItem
              key={item.i}
              id={item.i}
              item={item}
              colWidth={colWidth}
              rowHeight={rowHeight}
              gap={gap}
              isDragging={activeId === item.i}
              onResize={handleResize}
              onKeyboardAction={handleKeyboardAction}
              ref={(ref) => registerRef(item.i, ref)}
            >
              {child}
            </GridItem>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div
            style={{
              opacity: 0.6,
              background: "var(--bg-tertiary)",
              borderRadius: "var(--radius-md, 8px)",
              border: "2px solid var(--accent)",
              width: (() => {
                const item = layout.find((l) => l.i === activeId);
                return item ? item.w * colWidth + (item.w - 1) * gap : 0;
              })(),
              height: (() => {
                const item = layout.find((l) => l.i === activeId);
                return item ? item.h * rowHeight + (item.h - 1) * gap : 0;
              })(),
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function computeContainerHeight(
  layout: GridLayoutItem[],
  rowHeight: number,
  gap: number
): number {
  if (layout.length === 0) return 0;
  let maxBottom = 0;
  for (const item of layout) {
    const bottom = item.y + item.h;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  return maxBottom * rowHeight + (maxBottom - 1) * gap;
}
