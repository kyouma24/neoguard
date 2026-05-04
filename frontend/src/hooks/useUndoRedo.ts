import { useState, useRef, useCallback } from "react";

export interface UndoRedoState<T> {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  set: (value: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_MAX_HISTORY = 50;

/**
 * Generic undo/redo hook. Maintains a past-stack and a future-stack
 * alongside the current value. Stacks are stored in refs so that
 * pushing/popping does not trigger extra renders — only the `current`
 * value lives in React state.
 */
export function useUndoRedo<T>(
  initial: T,
  maxHistory: number = DEFAULT_MAX_HISTORY,
): UndoRedoState<T> {
  const [current, setCurrent] = useState<T>(initial);

  // Stacks stored in refs to avoid re-render cascades when only
  // pushing onto a stack (the render is triggered by setCurrent).
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);

  // We also keep a ref mirror of `current` so that the callbacks
  // below (which are stable via useCallback) always see the latest value
  // without needing `current` in the dependency array.
  const currentRef = useRef<T>(initial);

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      const resolved =
        typeof value === "function"
          ? (value as (prev: T) => T)(currentRef.current)
          : value;

      // Push current onto past stack
      pastRef.current = [...pastRef.current, currentRef.current];
      // Trim to maxHistory
      if (pastRef.current.length > maxHistory) {
        pastRef.current = pastRef.current.slice(
          pastRef.current.length - maxHistory,
        );
      }
      // Clear future — new edits invalidate redo
      futureRef.current = [];

      currentRef.current = resolved;
      setCurrent(resolved);
    },
    [maxHistory],
  );

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, currentRef.current];

    currentRef.current = previous;
    setCurrent(previous);
  }, []);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, currentRef.current];

    currentRef.current = next;
    setCurrent(next);
  }, []);

  return {
    current,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    set,
    undo,
    redo,
  };
}
