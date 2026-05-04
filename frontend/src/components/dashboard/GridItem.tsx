import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { GridLayoutItem } from "./DashboardGrid";

export interface GridItemHandle {
  focus: () => void;
}

interface GridItemProps {
  id: string;
  item: GridLayoutItem;
  colWidth: number;
  rowHeight: number;
  gap: number;
  cols?: number;
  isDragging: boolean;
  onResize: (id: string, deltaW: number, deltaH: number) => void;
  onKeyboardAction: (id: string, action: "move" | "resize", dx: number, dy: number) => void;
  children: React.ReactNode;
}

/**
 * Individual grid item wrapper for the DashboardGrid.
 * Handles draggable logic, resize handle, keyboard navigation,
 * and aria labels for accessibility.
 */
export const GridItem = forwardRef<GridItemHandle, GridItemProps>(function GridItem(
  { id, item, colWidth, rowHeight, gap, isDragging, onResize, onKeyboardAction, children },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStart = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({
    id,
  });

  useImperativeHandle(ref, () => ({
    focus: () => containerRef.current?.focus(),
  }));

  // Pixel position
  const translateX = item.x * colWidth + item.x * gap;
  const translateY = item.y * rowHeight + item.y * gap;
  const itemWidth = item.w * colWidth + (item.w - 1) * gap;
  const itemHeight = item.h * rowHeight + (item.h - 1) * gap;

  // Resize via pointer on SE corner handle
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: item.w,
        startH: item.h,
      };

      const handlePointerMove = () => {
        // Size applied on release, not during drag
      };

      const handlePointerUp = (ev: PointerEvent) => {
        if (!resizeStart.current) return;
        const dx = ev.clientX - resizeStart.current.startX;
        const dy = ev.clientY - resizeStart.current.startY;
        const deltaW = Math.round(dx / (colWidth + gap));
        const deltaH = Math.round(dy / (rowHeight + gap));
        resizeStart.current = null;
        setIsResizing(false);
        if (deltaW !== 0 || deltaH !== 0) {
          onResize(id, deltaW, deltaH);
        }
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [id, item.w, item.h, colWidth, rowHeight, gap, onResize]
  );

  // Keyboard handling on the grid item container
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Only handle when this container or its drag handle is focused
      if (e.target !== containerRef.current && !(e.target as HTMLElement).classList?.contains("panel-drag-handle")) {
        return;
      }

      const shift = e.shiftKey;
      let handled = false;

      switch (e.key) {
        case "ArrowLeft":
          if (shift) {
            onKeyboardAction(id, "resize", -1, 0);
          } else {
            onKeyboardAction(id, "move", -1, 0);
          }
          handled = true;
          break;
        case "ArrowRight":
          if (shift) {
            onKeyboardAction(id, "resize", 1, 0);
          } else {
            onKeyboardAction(id, "move", 1, 0);
          }
          handled = true;
          break;
        case "ArrowUp":
          if (shift) {
            onKeyboardAction(id, "resize", 0, -1);
          } else {
            onKeyboardAction(id, "move", 0, -1);
          }
          handled = true;
          break;
        case "ArrowDown":
          if (shift) {
            onKeyboardAction(id, "resize", 0, 1);
          } else {
            onKeyboardAction(id, "move", 0, 1);
          }
          handled = true;
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [id, onKeyboardAction]
  );

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={`dashboard-grid-item${isDragging ? " dashboard-grid-item--dragging" : ""}${isResizing ? " dashboard-grid-item--resizing" : ""}`}
      style={{
        position: "absolute",
        transform: `translate(${translateX}px, ${translateY}px)`,
        width: itemWidth,
        height: itemHeight,
        transition: isDragging || isResizing
          ? "none"
          : "transform 200ms ease, width 200ms ease, height 200ms ease",
        zIndex: isDragging ? 3 : isResizing ? 2 : 1,
        willChange: isDragging ? "transform" : isResizing ? "width, height" : undefined,
      }}
      tabIndex={0}
      role="article"
      aria-label={`Dashboard panel ${id}`}
      aria-roledescription="draggable dashboard panel"
      onKeyDown={handleKeyDown}
      data-testid={`grid-item-${id}`}
    >
      {/* Drag handle activator — attaches to .panel-drag-handle elements inside the child */}
      <div
        ref={setActivatorNodeRef}
        className="panel-drag-handle"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          cursor: "grab",
          zIndex: 10,
        }}
        {...listeners}
        {...attributes}
        aria-label={`Drag handle for panel ${id}`}
        data-testid={`drag-handle-${id}`}
      />
      {children}
      {/* Resize handle — bottom-right corner */}
      <div
        className="dashboard-grid-resize-handle"
        style={{
          position: "absolute",
          width: 20,
          height: 20,
          bottom: 0,
          right: 0,
          cursor: "se-resize",
          zIndex: 10,
        }}
        onPointerDown={handleResizePointerDown}
        role="separator"
        aria-label={`Resize handle for panel ${id}`}
        aria-orientation="horizontal"
        data-testid={`resize-handle-${id}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style={{
            position: "absolute",
            right: 3,
            bottom: 3,
          }}
        >
          <path
            d="M 8 2 L 8 8 L 2 8"
            fill="none"
            stroke="rgba(150,150,150,0.5)"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
});
