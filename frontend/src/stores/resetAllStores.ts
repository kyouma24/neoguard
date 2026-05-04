/**
 * Central reset function for all Zustand stores.
 * Called on tenant switch to prevent cross-tenant state leakage.
 */
import { resetCrosshairStore } from "./crosshairStore";
import { resetEditModeStore } from "./editModeStore";
import { resetLiveModeStore } from "./liveModeStore";

export function resetAllStores(): void {
  resetCrosshairStore();
  resetEditModeStore();
  resetLiveModeStore();
}
