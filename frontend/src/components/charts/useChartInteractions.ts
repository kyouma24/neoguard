import { useCallback, useRef, useState } from "react";
import type { MetricQueryResult } from "../../types";
import { useCrosshairStore } from "../../stores/crosshairStore";

export interface DragState {
  start: string | null;
  end: string | null;
}

export interface DataLinkMenuState {
  x: number;
  y: number;
  time: string;
  value: number;
}

export function useChartInteractions(onTimeRangeChange?: (from: Date, to: Date) => void, widgetId?: string) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);
  const [dataLinkMenu, setDataLinkMenu] = useState<DataLinkMenuState | null>(null);

  const crosshairTimestamp = useCrosshairStore((s) => s.timestamp);
  const setCrosshair = useCrosshairStore((s) => s.setCrosshair);
  const clearCrosshair = useCrosshairStore((s) => s.clearCrosshair);

  // Backwards-compatible crosshair object for existing consumers
  const crosshair = {
    timestamp: crosshairTimestamp,
    setTimestamp: (ts: string | null) => setCrosshair(ts, widgetId ?? null),
  };

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isolateSeries = useCallback((key: string, allKeys: string[]) => {
    setHiddenSeries((prev) => {
      const visibleKeys = allKeys.filter((k) => !prev.has(k));
      if (visibleKeys.length === 1 && visibleKeys[0] === key) {
        return new Set();
      }
      return new Set(allKeys.filter((k) => k !== key));
    });
  }, []);

  const handleMouseDown = useCallback((e: { activeLabel?: string }) => {
    if (onTimeRangeChange && e?.activeLabel) {
      isDragging.current = true;
      setDragStart(e.activeLabel);
      setDragEnd(e.activeLabel);
    }
  }, [onTimeRangeChange]);

  const handleMouseMove = useCallback((e: { activeLabel?: string }) => {
    if (e?.activeLabel) {
      setCrosshair(e.activeLabel, widgetId ?? null);
      if (isDragging.current) {
        setDragEnd(e.activeLabel);
      }
    }
  }, [setCrosshair, widgetId]);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current && dragStart && dragEnd && onTimeRangeChange) {
      isDragging.current = false;
      const t1 = new Date(dragStart).getTime();
      const t2 = new Date(dragEnd).getTime();
      if (Math.abs(t2 - t1) > 5000) {
        onTimeRangeChange(new Date(Math.min(t1, t2)), new Date(Math.max(t1, t2)));
      }
    }
    isDragging.current = false;
    setDragStart(null);
    setDragEnd(null);
  }, [dragStart, dragEnd, onTimeRangeChange]);

  const handleMouseLeave = useCallback(() => {
    clearCrosshair();
    if (isDragging.current) {
      isDragging.current = false;
      setDragStart(null);
      setDragEnd(null);
    }
  }, [clearCrosshair]);

  return {
    hiddenSeries,
    dragStart,
    dragEnd,
    dataLinkMenu,
    setDataLinkMenu,
    crosshair,
    toggleSeries,
    isolateSeries,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  };
}

export function seriesKey(s: MetricQueryResult): string {
  const tags = Object.entries(s.tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return tags ? `${s.name}{${tags}}` : s.name;
}

export function mergeDatapoints(data: MetricQueryResult[], comparisonData?: MetricQueryResult[]): Record<string, unknown>[] {
  const timeMap = new Map<string, Record<string, unknown>>();

  for (const series of data) {
    const key = seriesKey(series);
    for (const [ts, val] of series.datapoints) {
      if (!timeMap.has(ts)) {
        timeMap.set(ts, { time: ts });
      }
      timeMap.get(ts)![key] = val;
    }
  }

  if (comparisonData) {
    for (const series of comparisonData) {
      const key = seriesKey(series);
      const compKey = `__cmp__${key}`;
      const mainTimestamps = Array.from(timeMap.keys()).sort();
      const compPoints = [...series.datapoints].sort(([a], [b]) => a.localeCompare(b));
      for (let i = 0; i < compPoints.length && i < mainTimestamps.length; i++) {
        const targetTs = mainTimestamps[i];
        const row = timeMap.get(targetTs);
        if (row) row[compKey] = compPoints[i][1];
      }
    }
  }

  return Array.from(timeMap.values()).sort(
    (a, b) => new Date(a.time as string).getTime() - new Date(b.time as string).getTime(),
  );
}

export function makeChartClickHandler(
  onAnnotate: ((timestamp: Date) => void) | undefined,
  dataLinks: { label: string; url: string }[] | undefined,
  setDataLinkMenu: (state: DataLinkMenuState | null) => void,
) {
  return (e: { activeLabel?: string; activePayload?: { value?: number }[] }, event?: React.MouseEvent) => {
    if (onAnnotate && event && (event.ctrlKey || event.metaKey) && e?.activeLabel) {
      event.preventDefault();
      onAnnotate(new Date(e.activeLabel));
      return;
    }
    if (dataLinks?.length && e?.activeLabel && event && !event.ctrlKey && !event.metaKey) {
      const val = e.activePayload?.[0]?.value ?? 0;
      setDataLinkMenu({ x: event.clientX, y: event.clientY, time: e.activeLabel, value: val });
    }
  };
}
