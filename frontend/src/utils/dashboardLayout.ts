import type { PanelDefinition } from "../types";

export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 60;
export const GRID_GAP = 12;

export function panelToLayoutItem(p: PanelDefinition) {
  return {
    i: p.id,
    x: p.position_x ?? 0,
    y: p.position_y ?? 0,
    w: p.width || 6,
    h: p.height || 4,
  };
}

export function editorPanelToLayoutItem(p: PanelDefinition) {
  return {
    ...panelToLayoutItem(p),
    minW: 2,
    minH: 2,
  };
}

export function panelContentHeight(panel: PanelDefinition): number {
  return (panel.height || 4) * GRID_ROW_HEIGHT - 44;
}
