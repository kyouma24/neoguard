import { create } from "zustand";

interface CrosshairState {
  /** Unix-epoch-aligned ISO timestamp string of the hovered point, or null when not hovering */
  timestamp: string | null;
  /** The widget ID that is currently being hovered (source) */
  sourceWidgetId: string | null;
  /** Set crosshair from a specific widget */
  setCrosshair: (timestamp: string | null, sourceWidgetId: string | null) => void;
  /** Clear crosshair (convenience alias) */
  clearCrosshair: () => void;
}

export const useCrosshairStore = create<CrosshairState>((set) => ({
  timestamp: null,
  sourceWidgetId: null,
  setCrosshair: (timestamp, sourceWidgetId) => set({ timestamp, sourceWidgetId }),
  clearCrosshair: () => set({ timestamp: null, sourceWidgetId: null }),
}));

/** Reset crosshair store to initial state (e.g. on tenant switch) */
export function resetCrosshairStore(): void {
  useCrosshairStore.setState({ timestamp: null, sourceWidgetId: null });
}
