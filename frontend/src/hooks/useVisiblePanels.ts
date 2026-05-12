import { useEffect, useRef, useState, useMemo } from "react";
import type { PanelDefinition } from "../types";

interface UseVisiblePanelsOptions {
  panels: PanelDefinition[];
  containerRef: React.RefObject<HTMLElement | null>;
  /** Force all panels visible (e.g. snapshot export) */
  forceAll?: boolean;
}

/**
 * Tracks which dashboard panels are currently visible in the viewport using
 * IntersectionObserver. Returns a stable Set of panel IDs that should be fetched.
 *
 * Design decisions:
 * - root: null (viewport) because the scroll container is <main> in Layout.tsx,
 *   which is above the dashboard component tree. containerRef is non-scrolling.
 * - rootMargin: asymmetric "100px 0px 400px 0px" — larger bottom prefetch
 *   because users primarily scroll down.
 * - threshold: 0 — fire as soon as 1px enters the margin.
 * - Eager initial render: first N panels (by position_y) render immediately
 *   to avoid skeleton flash for above-the-fold content.
 * - Debounces updates by 100ms to avoid thrashing during fast scroll.
 * - Re-observes when panel set changes (handles add/remove in edit mode).
 */
export function useVisiblePanels({
  panels,
  containerRef,
  forceAll = false,
}: UseVisiblePanelsOptions): Set<string> {
  // Eager: first 6 panels by position (above-the-fold, no skeleton flash)
  const initiallyVisible = useMemo(() => {
    return new Set(
      [...panels]
        .filter((p) => p.panel_type !== "text" || true) // include all for layout
        .sort((a, b) => a.position_y - b.position_y || a.position_x - b.position_x)
        .slice(0, 6)
        .map((p) => p.id)
    );
  }, [panels]);

  const [observedVisible, setObservedVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Map<string, boolean>>(new Map());

  // Stable panel IDs key for re-observation
  const panelIdsKey = useMemo(() => panels.map((p) => p.id).join(","), [panels]);

  useEffect(() => {
    if (forceAll) return;
    const container = containerRef.current;
    if (!container) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const panelId = (entry.target as HTMLElement).dataset.panelId;
          if (panelId) {
            pendingUpdatesRef.current.set(panelId, entry.isIntersecting);
          }
        }

        // Debounce state updates to avoid thrashing during fast scroll
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          setObservedVisible((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const [id, isVisible] of pendingUpdatesRef.current) {
              if (isVisible && !next.has(id)) {
                next.add(id);
                changed = true;
              } else if (!isVisible && next.has(id)) {
                next.delete(id);
                changed = true;
              }
            }
            pendingUpdatesRef.current.clear();
            return changed ? next : prev;
          });
        }, 100);
      },
      {
        root: null, // viewport — .main is the scroll container but it's above us in the tree
        rootMargin: "100px 0px 400px 0px", // asymmetric: more prefetch below (scroll-down direction)
        threshold: 0, // fire as soon as 1px enters
      }
    );

    observerRef.current = observer;

    // Observe all panel elements with data-panel-id attribute
    const panelElements = container.querySelectorAll<HTMLElement>("[data-panel-id]");
    for (const el of panelElements) {
      observer.observe(el);
    }

    // MutationObserver to handle panel add/remove without full re-mount
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.dataset.panelId) {
              observer.observe(node);
            }
            // Also check children (e.g. when a group expands)
            const children = node.querySelectorAll<HTMLElement>("[data-panel-id]");
            for (const child of children) {
              observer.observe(child);
            }
          }
        }
      }
    });

    mutationObserver.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingUpdatesRef.current.clear();
    };
  }, [containerRef, panelIdsKey, forceAll]);

  // Merge eager initial set + observed set
  const effectiveVisible = useMemo(() => {
    if (forceAll) {
      return new Set(panels.map((p) => p.id));
    }
    const merged = new Set(initiallyVisible);
    for (const id of observedVisible) {
      merged.add(id);
    }
    return merged;
  }, [initiallyVisible, observedVisible, forceAll, panels]);

  return effectiveVisible;
}
