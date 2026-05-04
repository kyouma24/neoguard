import { create } from "zustand";

interface LiveModeState {
  /** Whether live/auto-refresh mode is active */
  isLive: boolean;
  /** Refresh interval in seconds; 0 = disabled */
  refreshInterval: number;
  /** Toggle live mode on/off */
  setLive: (isLive: boolean) => void;
  /** Set the auto-refresh interval in seconds */
  setRefreshInterval: (seconds: number) => void;
}

export const useLiveModeStore = create<LiveModeState>((set) => ({
  isLive: false,
  refreshInterval: 0,
  setLive: (isLive) => set({ isLive }),
  setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
}));

/** Reset live mode store to initial state (e.g. on tenant switch) */
export function resetLiveModeStore(): void {
  useLiveModeStore.setState({ isLive: false, refreshInterval: 0 });
}
