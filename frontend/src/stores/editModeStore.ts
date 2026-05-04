import { create } from "zustand";

interface EditModeState {
  /** Whether the dashboard is currently in edit mode */
  isEditing: boolean;
  /** Whether there are unsaved panel/layout changes */
  hasUnsavedChanges: boolean;
  /** Enter edit mode */
  enterEditMode: () => void;
  /** Exit edit mode and clear dirty flag */
  exitEditMode: () => void;
  /** Mark the dashboard as having unsaved changes */
  markDirty: () => void;
  /** Clear the dirty flag (e.g. after a successful save) */
  markClean: () => void;
}

export const useEditModeStore = create<EditModeState>((set) => ({
  isEditing: false,
  hasUnsavedChanges: false,
  enterEditMode: () => set({ isEditing: true }),
  exitEditMode: () => set({ isEditing: false, hasUnsavedChanges: false }),
  markDirty: () => set({ hasUnsavedChanges: true }),
  markClean: () => set({ hasUnsavedChanges: false }),
}));

/** Reset edit mode store to initial state (e.g. on tenant switch) */
export function resetEditModeStore(): void {
  useEditModeStore.setState({ isEditing: false, hasUnsavedChanges: false });
}
