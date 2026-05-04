import { describe, it, expect, beforeEach } from "vitest";
import { useCrosshairStore, resetCrosshairStore } from "./crosshairStore";
import { useEditModeStore, resetEditModeStore } from "./editModeStore";
import { useLiveModeStore, resetLiveModeStore } from "./liveModeStore";
import { resetAllStores } from "./resetAllStores";

describe("useCrosshairStore", () => {
  beforeEach(() => {
    useCrosshairStore.setState({ timestamp: null, sourceWidgetId: null });
  });

  it("starts with null timestamp and sourceWidgetId", () => {
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBeNull();
    expect(state.sourceWidgetId).toBeNull();
  });

  it("setCrosshair updates timestamp and sourceWidgetId", () => {
    useCrosshairStore.getState().setCrosshair("2026-05-02T10:00:00Z", "widget-1");
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBe("2026-05-02T10:00:00Z");
    expect(state.sourceWidgetId).toBe("widget-1");
  });

  it("setCrosshair with null clears both fields", () => {
    useCrosshairStore.getState().setCrosshair("2026-05-02T10:00:00Z", "widget-1");
    useCrosshairStore.getState().setCrosshair(null, null);
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBeNull();
    expect(state.sourceWidgetId).toBeNull();
  });

  it("clearCrosshair resets to initial state", () => {
    useCrosshairStore.getState().setCrosshair("2026-05-02T10:00:00Z", "widget-2");
    useCrosshairStore.getState().clearCrosshair();
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBeNull();
    expect(state.sourceWidgetId).toBeNull();
  });

  it("multiple setCrosshair calls update to latest values", () => {
    const { setCrosshair } = useCrosshairStore.getState();
    setCrosshair("2026-05-02T10:00:00Z", "widget-1");
    setCrosshair("2026-05-02T11:00:00Z", "widget-2");
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBe("2026-05-02T11:00:00Z");
    expect(state.sourceWidgetId).toBe("widget-2");
  });
});

describe("useEditModeStore", () => {
  beforeEach(() => {
    useEditModeStore.setState({ isEditing: false, hasUnsavedChanges: false });
  });

  it("starts with isEditing=false and hasUnsavedChanges=false", () => {
    const state = useEditModeStore.getState();
    expect(state.isEditing).toBe(false);
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it("enterEditMode sets isEditing to true", () => {
    useEditModeStore.getState().enterEditMode();
    expect(useEditModeStore.getState().isEditing).toBe(true);
  });

  it("exitEditMode sets isEditing to false and clears hasUnsavedChanges", () => {
    useEditModeStore.getState().enterEditMode();
    useEditModeStore.getState().markDirty();
    expect(useEditModeStore.getState().isEditing).toBe(true);
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(true);

    useEditModeStore.getState().exitEditMode();
    expect(useEditModeStore.getState().isEditing).toBe(false);
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(false);
  });

  it("markDirty sets hasUnsavedChanges to true", () => {
    useEditModeStore.getState().markDirty();
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(true);
  });

  it("markClean sets hasUnsavedChanges to false", () => {
    useEditModeStore.getState().markDirty();
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(true);

    useEditModeStore.getState().markClean();
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(false);
  });

  it("markClean does not affect isEditing", () => {
    useEditModeStore.getState().enterEditMode();
    useEditModeStore.getState().markDirty();
    useEditModeStore.getState().markClean();
    expect(useEditModeStore.getState().isEditing).toBe(true);
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(false);
  });

  it("enterEditMode does not reset hasUnsavedChanges", () => {
    useEditModeStore.getState().markDirty();
    useEditModeStore.getState().enterEditMode();
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(true);
  });
});

describe("useLiveModeStore", () => {
  beforeEach(() => {
    useLiveModeStore.setState({ isLive: false, refreshInterval: 0 });
  });

  it("starts with isLive=false and refreshInterval=0", () => {
    const state = useLiveModeStore.getState();
    expect(state.isLive).toBe(false);
    expect(state.refreshInterval).toBe(0);
  });

  it("setLive toggles live mode", () => {
    useLiveModeStore.getState().setLive(true);
    expect(useLiveModeStore.getState().isLive).toBe(true);

    useLiveModeStore.getState().setLive(false);
    expect(useLiveModeStore.getState().isLive).toBe(false);
  });

  it("setRefreshInterval updates the interval", () => {
    useLiveModeStore.getState().setRefreshInterval(30);
    expect(useLiveModeStore.getState().refreshInterval).toBe(30);
  });

  it("setRefreshInterval to 0 disables auto-refresh", () => {
    useLiveModeStore.getState().setRefreshInterval(15);
    useLiveModeStore.getState().setRefreshInterval(0);
    expect(useLiveModeStore.getState().refreshInterval).toBe(0);
  });

  it("setLive and setRefreshInterval are independent", () => {
    useLiveModeStore.getState().setLive(true);
    useLiveModeStore.getState().setRefreshInterval(10);

    useLiveModeStore.getState().setLive(false);
    expect(useLiveModeStore.getState().refreshInterval).toBe(10);
  });
});

describe("resetAllStores (tenant switch)", () => {
  it("resets crosshair store to initial state", () => {
    useCrosshairStore.getState().setCrosshair("2026-05-02T10:00:00Z", "widget-1");
    resetCrosshairStore();
    const state = useCrosshairStore.getState();
    expect(state.timestamp).toBeNull();
    expect(state.sourceWidgetId).toBeNull();
  });

  it("resets edit mode store to initial state", () => {
    useEditModeStore.getState().enterEditMode();
    useEditModeStore.getState().markDirty();
    resetEditModeStore();
    const state = useEditModeStore.getState();
    expect(state.isEditing).toBe(false);
    expect(state.hasUnsavedChanges).toBe(false);
  });

  it("resets live mode store to initial state", () => {
    useLiveModeStore.getState().setLive(true);
    useLiveModeStore.getState().setRefreshInterval(30);
    resetLiveModeStore();
    const state = useLiveModeStore.getState();
    expect(state.isLive).toBe(false);
    expect(state.refreshInterval).toBe(0);
  });

  it("resetAllStores resets all three stores at once", () => {
    // Dirty all stores
    useCrosshairStore.getState().setCrosshair("2026-05-02T12:00:00Z", "widget-5");
    useEditModeStore.getState().enterEditMode();
    useEditModeStore.getState().markDirty();
    useLiveModeStore.getState().setLive(true);
    useLiveModeStore.getState().setRefreshInterval(15);

    resetAllStores();

    expect(useCrosshairStore.getState().timestamp).toBeNull();
    expect(useCrosshairStore.getState().sourceWidgetId).toBeNull();
    expect(useEditModeStore.getState().isEditing).toBe(false);
    expect(useEditModeStore.getState().hasUnsavedChanges).toBe(false);
    expect(useLiveModeStore.getState().isLive).toBe(false);
    expect(useLiveModeStore.getState().refreshInterval).toBe(0);
  });
});
