import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisiblePanels } from "./useVisiblePanels";
import type { PanelDefinition } from "../types";

function makePanel(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return {
    id: "panel-1",
    title: "Test Panel",
    panel_type: "timeseries",
    metric_name: "aws.ec2.cpuutilization",
    tags: {},
    aggregation: "avg",
    width: 6,
    height: 4,
    position_x: 0,
    position_y: 0,
    ...overrides,
  };
}

// Mock IntersectionObserver
let observerCallback: IntersectionObserverCallback;
let observedElements: Set<Element>;
const mockObserve = vi.fn((el: Element) => observedElements.add(el));
const mockDisconnect = vi.fn();
const mockUnobserve = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    observerCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = mockUnobserve;
  takeRecords = () => [] as IntersectionObserverEntry[];
  root = null;
  rootMargin = "";
  thresholds = [0];
}

// Mock MutationObserver
const mockMutationObserve = vi.fn();
const mockMutationDisconnect = vi.fn();
class MockMutationObserver {
  constructor(_callback: MutationCallback) {}
  observe = mockMutationObserve;
  disconnect = mockMutationDisconnect;
  takeRecords = () => [] as MutationRecord[];
}

beforeEach(() => {
  observedElements = new Set();
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  vi.stubGlobal("MutationObserver", MockMutationObserver);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeContainerRef(panelIds: string[]): React.RefObject<HTMLElement> {
  const container = document.createElement("div");
  for (const id of panelIds) {
    const el = document.createElement("div");
    el.dataset.panelId = id;
    container.appendChild(el);
  }
  return { current: container } as React.RefObject<HTMLElement>;
}

describe("useVisiblePanels", () => {
  it("returns first 6 panels as initially visible (no skeleton flash)", () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({ id: `p${i}`, position_y: i })
    );
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // First 6 by position_y should be immediately visible
    expect(result.current.has("p0")).toBe(true);
    expect(result.current.has("p1")).toBe(true);
    expect(result.current.has("p2")).toBe(true);
    expect(result.current.has("p3")).toBe(true);
    expect(result.current.has("p4")).toBe(true);
    expect(result.current.has("p5")).toBe(true);
    // Panels 6-9 should NOT be in initial set
    expect(result.current.has("p6")).toBe(false);
    expect(result.current.has("p7")).toBe(false);
  });

  it("sorts initial panels by position_y then position_x", () => {
    const panels = [
      makePanel({ id: "bottom", position_y: 10, position_x: 0 }),
      makePanel({ id: "top-right", position_y: 0, position_x: 6 }),
      makePanel({ id: "top-left", position_y: 0, position_x: 0 }),
      makePanel({ id: "mid", position_y: 4, position_x: 0 }),
    ];
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // All 4 should be visible (< 6 total)
    expect(result.current.size).toBe(4);
    expect(result.current.has("top-left")).toBe(true);
    expect(result.current.has("top-right")).toBe(true);
    expect(result.current.has("mid")).toBe(true);
    expect(result.current.has("bottom")).toBe(true);
  });

  it("adds panels to visible set when IntersectionObserver fires", async () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({ id: `p${i}`, position_y: i * 2 })
    );
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // Initially p6+ not visible
    expect(result.current.has("p7")).toBe(false);

    // Simulate IntersectionObserver firing for p7
    const mockEntry = {
      isIntersecting: true,
      target: { dataset: { panelId: "p7" } } as unknown as Element,
    } as unknown as IntersectionObserverEntry;

    act(() => {
      observerCallback([mockEntry], {} as IntersectionObserver);
    });

    // Wait for debounce (100ms)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });

    expect(result.current.has("p7")).toBe(true);
  });

  it("removes panels from observed set when they leave viewport", async () => {
    const panels = Array.from({ length: 10 }, (_, i) =>
      makePanel({ id: `p${i}`, position_y: i * 2 })
    );
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // Simulate p7 entering
    act(() => {
      observerCallback(
        [{ isIntersecting: true, target: { dataset: { panelId: "p7" } } } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });
    expect(result.current.has("p7")).toBe(true);

    // Simulate p7 leaving
    act(() => {
      observerCallback(
        [{ isIntersecting: false, target: { dataset: { panelId: "p7" } } } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });

    // p7 removed from observed, but if it was in initial set it stays
    // p7 was NOT in initial set (position_y=14), so it should be gone
    expect(result.current.has("p7")).toBe(false);
  });

  it("initial panels remain visible even if observer says not intersecting", async () => {
    const panels = [
      makePanel({ id: "p0", position_y: 0 }),
      makePanel({ id: "p1", position_y: 2 }),
    ];
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // Both in initial set (< 6 panels)
    expect(result.current.has("p0")).toBe(true);

    // Observer fires saying p0 is not intersecting
    act(() => {
      observerCallback(
        [{ isIntersecting: false, target: { dataset: { panelId: "p0" } } } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 150)); });

    // p0 remains visible because it's in initiallyVisible (eager render)
    expect(result.current.has("p0")).toBe(true);
  });

  it("returns all panel IDs when forceAll is true", () => {
    const panels = Array.from({ length: 20 }, (_, i) =>
      makePanel({ id: `p${i}`, position_y: i * 2 })
    );
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef, forceAll: true })
    );

    expect(result.current.size).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(result.current.has(`p${i}`)).toBe(true);
    }
  });

  it("observes all data-panel-id elements in container", () => {
    const panels = [
      makePanel({ id: "p0", position_y: 0 }),
      makePanel({ id: "p1", position_y: 2 }),
      makePanel({ id: "p2", position_y: 4 }),
    ];
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    renderHook(() => useVisiblePanels({ panels, containerRef }));

    expect(mockObserve).toHaveBeenCalledTimes(3);
  });

  it("disconnects observer on unmount", () => {
    const panels = [makePanel({ id: "p0" })];
    const containerRef = makeContainerRef(["p0"]);

    const { unmount } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("skips observer setup when forceAll is true", () => {
    const panels = [makePanel({ id: "p0" })];
    const containerRef = makeContainerRef(["p0"]);

    renderHook(() =>
      useVisiblePanels({ panels, containerRef, forceAll: true })
    );

    expect(mockObserve).not.toHaveBeenCalled();
  });

  it("excludes text panels from initial visible set (they need no data queries)", () => {
    const panels = [
      makePanel({ id: "text-1", panel_type: "text", position_y: 0 }),
      makePanel({ id: "ts-1", panel_type: "timeseries", position_y: 1 }),
      makePanel({ id: "text-2", panel_type: "text", position_y: 2 }),
      makePanel({ id: "ts-2", panel_type: "timeseries", position_y: 3 }),
      makePanel({ id: "ts-3", panel_type: "timeseries", position_y: 4 }),
      makePanel({ id: "text-3", panel_type: "text", position_y: 5 }),
      makePanel({ id: "ts-4", panel_type: "timeseries", position_y: 6 }),
      makePanel({ id: "ts-5", panel_type: "timeseries", position_y: 7 }),
    ];
    const containerRef = makeContainerRef(panels.map((p) => p.id));

    const { result } = renderHook(() =>
      useVisiblePanels({ panels, containerRef })
    );

    // Text panels should NOT be in the initial visible set
    expect(result.current.has("text-1")).toBe(false);
    expect(result.current.has("text-2")).toBe(false);
    expect(result.current.has("text-3")).toBe(false);
    // Non-text panels should be visible (first 6 non-text = ts-1 through ts-5)
    expect(result.current.has("ts-1")).toBe(true);
    expect(result.current.has("ts-2")).toBe(true);
    expect(result.current.has("ts-3")).toBe(true);
    expect(result.current.has("ts-4")).toBe(true);
    expect(result.current.has("ts-5")).toBe(true);
  });
});
