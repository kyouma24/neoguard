import { describe, it, expect } from "vitest";
import {
  panelToLayoutItem,
  editorPanelToLayoutItem,
  panelContentHeight,
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_GAP,
} from "./dashboardLayout";
import type { PanelDefinition } from "../types";

function makePanel(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return {
    id: "p1",
    title: "Test Panel",
    panel_type: "timeseries",
    tags: {},
    aggregation: "avg",
    width: 6,
    height: 4,
    position_x: 3,
    position_y: 2,
    ...overrides,
  } as PanelDefinition;
}

describe("panelToLayoutItem", () => {
  it("maps panel fields to layout item", () => {
    const panel = makePanel({ id: "abc", position_x: 3, position_y: 5, width: 4, height: 6 });
    const item = panelToLayoutItem(panel);
    expect(item).toEqual({ i: "abc", x: 3, y: 5, w: 4, h: 6 });
  });

  it("defaults position_x to 0 when undefined", () => {
    const panel = makePanel({ position_x: undefined } as unknown as Partial<PanelDefinition>);
    const item = panelToLayoutItem(panel);
    expect(item.x).toBe(0);
  });

  it("defaults width to 6 when 0", () => {
    const panel = makePanel({ width: 0 } as unknown as Partial<PanelDefinition>);
    const item = panelToLayoutItem(panel);
    expect(item.w).toBe(6);
  });

  it("defaults height to 4 when 0", () => {
    const panel = makePanel({ height: 0 } as unknown as Partial<PanelDefinition>);
    const item = panelToLayoutItem(panel);
    expect(item.h).toBe(4);
  });
});

describe("editorPanelToLayoutItem", () => {
  it("extends layout item with minW and minH", () => {
    const item = editorPanelToLayoutItem(makePanel());
    expect(item.minW).toBe(2);
    expect(item.minH).toBe(2);
  });

  it("preserves base layout fields", () => {
    const item = editorPanelToLayoutItem(makePanel({ id: "xyz", width: 8 }));
    expect(item.i).toBe("xyz");
    expect(item.w).toBe(8);
  });
});

describe("panelContentHeight", () => {
  it("computes correct height for default panel", () => {
    expect(panelContentHeight(makePanel())).toBe(4 * 60 - 44);
  });

  it("uses default height for 0 value", () => {
    expect(panelContentHeight(makePanel({ height: 0 } as unknown as Partial<PanelDefinition>))).toBe(4 * 60 - 44);
  });

  it("scales with panel height", () => {
    expect(panelContentHeight(makePanel({ height: 8 }))).toBe(8 * 60 - 44);
  });
});

describe("constants", () => {
  it("GRID_COLS is 12", () => {
    expect(GRID_COLS).toBe(12);
  });

  it("GRID_ROW_HEIGHT is 60", () => {
    expect(GRID_ROW_HEIGHT).toBe(60);
  });

  it("GRID_GAP is 12", () => {
    expect(GRID_GAP).toBe(12);
  });
});
