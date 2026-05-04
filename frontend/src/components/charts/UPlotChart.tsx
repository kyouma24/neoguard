import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { MetricQueryResult, Annotation, AlertEvent } from "../../types";
import type { PanelDisplayOptions, UnitConfig } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { useCrosshairStore } from "../../stores/crosshairStore";
import { formatAxisTick } from "../../utils/unitFormat";
import {
  applyNullHandling,
  stackData,
} from "../../utils/chartDataTransforms";
import { lttbDownsample } from "../../utils/downsample";
import { ChartLegend } from "./ChartLegend";
import { seriesKey } from "./useChartInteractions";
import { CHART_EMPTY_STYLE } from "./chartConstants";
import {
  thresholdPlugin,
  annotationPlugin,
  crosshairSyncPlugin,
  externalCrosshairPlugin,
  anomalyBandPlugin,
} from "./uplotPlugins";
import { computeAnomalyBands } from "../../utils/anomalyDetection";

// Re-export stackData so existing imports from this module keep working.
export { stackData } from "../../utils/chartDataTransforms";

export interface UPlotChartProps {
  data: MetricQueryResult[];
  height: number;
  displayOptions?: PanelDisplayOptions;
  mode: "line" | "area";
  onTimeRangeChange?: (from: Date, to: Date) => void;
  comparisonData?: MetricQueryResult[];
  annotations?: Annotation[];
  onAnnotate?: (timestamp: Date) => void;
  alertEvents?: AlertEvent[];
  widgetId?: string;
}

/** Build the colors array applying palette + overrides from displayOptions. */
function buildColors(data: MetricQueryResult[], displayOptions?: PanelDisplayOptions): string[] {
  const basePalette = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const colorOverrides = displayOptions?.colors?.overrides;
  return basePalette.map((defaultColor, i) => {
    if (!colorOverrides?.length || i >= data.length) return defaultColor;
    const key = seriesKey(data[i]);
    const override = colorOverrides.find(
      (o) => key === o.seriesPattern || key.includes(o.seriesPattern),
    );
    return override?.color ?? defaultColor;
  });
}

/**
 * Convert MetricQueryResult[] to uPlot's AlignedData format.
 *
 * uPlot expects: [timestamps[], series1[], series2[], ...]
 * - timestamps in Unix seconds (not milliseconds)
 * - null for missing values
 *
 * Also merges comparison data as dashed series when present.
 */
function toUPlotData(
  data: MetricQueryResult[],
  comparisonData?: MetricQueryResult[],
): uPlot.AlignedData {
  // Collect all unique timestamps across all series and sort them
  const timeSet = new Set<number>();
  for (const series of data) {
    for (const [ts] of series.datapoints) {
      timeSet.add(new Date(ts).getTime());
    }
  }
  const sortedTimesMs = Array.from(timeSet).sort((a, b) => a - b);
  if (sortedTimesMs.length === 0) {
    return [new Float64Array(0)];
  }

  // X axis: timestamps in seconds
  const xValues = new Float64Array(sortedTimesMs.map((t) => t / 1000));

  // Build a time->index lookup
  const timeIndex = new Map<number, number>();
  for (let i = 0; i < sortedTimesMs.length; i++) {
    timeIndex.set(sortedTimesMs[i], i);
  }

  // Y axes: one per series
  const yArrays: (number | null)[][] = [];
  for (const series of data) {
    const yValues: (number | null)[] = new Array(sortedTimesMs.length).fill(null);
    for (const [ts, val] of series.datapoints) {
      const idx = timeIndex.get(new Date(ts).getTime());
      if (idx !== undefined) {
        yValues[idx] = val;
      }
    }
    yArrays.push(yValues);
  }

  // Append comparison data if present (mapped to main timeline)
  if (comparisonData) {
    for (const series of comparisonData) {
      const yValues: (number | null)[] = new Array(sortedTimesMs.length).fill(null);
      const compPoints = [...series.datapoints].sort(([a], [b]) => a.localeCompare(b));
      // Map comparison points to main timeline indices by position
      for (let i = 0; i < compPoints.length && i < sortedTimesMs.length; i++) {
        yValues[i] = compPoints[i][1];
      }
      yArrays.push(yValues);
    }
  }

  return [xValues, ...yArrays];
}

/**
 * Build uPlot series configuration from MetricQueryResult + display options.
 * Index 0 is always the x-axis (timestamp).
 */
function buildSeriesConfig(
  data: MetricQueryResult[],
  colors: string[],
  hiddenSeries: Set<string>,
  mode: "line" | "area",
  displayOptions?: PanelDisplayOptions,
  comparisonData?: MetricQueryResult[],
): uPlot.Series[] {
  const fillOpacity = displayOptions?.fillOpacity ?? 0.3;
  const lineWidth = 2;

  // First entry: x-axis (timestamp)
  const series: uPlot.Series[] = [{}];

  // Main data series
  for (let i = 0; i < data.length; i++) {
    const key = seriesKey(data[i]);
    const color = colors[i % colors.length];
    const isHidden = hiddenSeries.has(key);

    // Determine spanGaps from nullHandling (falls back to legacy connectNulls flag)
    const nullMode = displayOptions?.nullHandling ?? (displayOptions?.connectNulls ? "connect" : "gap");
    const shouldSpanGaps = nullMode === "connect";

    const s: uPlot.Series = {
      label: key,
      stroke: color,
      width: lineWidth,
      show: !isHidden,
      spanGaps: shouldSpanGaps,
    };

    const isStacked = (displayOptions?.stackingMode ?? "none") !== "none";

    if (mode === "area" || isStacked) {
      const effectiveFillOpacity = isStacked ? Math.max(fillOpacity, 0.5) : fillOpacity;
      const useGradient = displayOptions?.fillMode === "gradient" && !isStacked;
      if (useGradient) {
        // Gradient fill: create from color to transparent
        s.fill = (self: uPlot, seriesIdx: number) => {
          const gradient = self.ctx.createLinearGradient(0, self.bbox.top, 0, self.bbox.top + self.bbox.height);
          gradient.addColorStop(0, hexToRgba(color, effectiveFillOpacity * 1.5));
          gradient.addColorStop(1, hexToRgba(color, 0.02));
          void seriesIdx; // unused but required by uPlot type
          return gradient;
        };
      } else {
        s.fill = hexToRgba(color, effectiveFillOpacity);
      }
    }

    // Apply line interpolation
    const interp = displayOptions?.lineInterpolation;
    if (interp === "stepBefore" || interp === "stepAfter") {
      s.paths = uPlot.paths.stepped?.({
        align: interp === "stepBefore" ? -1 : 1,
      });
    } else if (interp === "linear") {
      s.paths = uPlot.paths.linear?.();
    }
    // default "monotone" and "natural" use uPlot's spline
    if (interp === "monotone" || interp === "natural") {
      s.paths = uPlot.paths.spline?.();
    }

    series.push(s);
  }

  // Comparison series (dashed, lower opacity)
  if (comparisonData) {
    for (let i = 0; i < comparisonData.length; i++) {
      const key = seriesKey(comparisonData[i]);
      const color = colors[i % colors.length];
      const isHidden = hiddenSeries.has(key);

      series.push({
        label: `cmp: ${key}`,
        stroke: hexToRgba(color, 0.4),
        width: 1.5,
        dash: [6, 4],
        show: !isHidden,
      });
    }
  }

  return series;
}

/** Convert hex color to rgba string. */
function hexToRgba(hex: string, alpha: number): string {
  // Handle shorthand and full hex
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(99, 91, 255, ${alpha})`; // fallback
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * UPlotChart - High-performance time-series chart using uPlot.
 *
 * Replaces Recharts for timeseries and area panel types.
 * Per spec 02 section A.2: "uPlot renders 50 series x 500 pts in <16ms"
 *
 * Critical rules from spec:
 * - One uPlot instance per widget. Dispose on unmount.
 * - DO NOT share a uPlot instance across widgets.
 * - DO NOT re-query on widget resize. Redraw with existing data.
 * - Cross-widget crosshair via useCrosshairStore.
 */
export function UPlotChart({
  data,
  height,
  displayOptions,
  mode,
  onTimeRangeChange,
  comparisonData,
  annotations,
  // onAnnotate is not directly supported by uPlot; could be added via click handler
  alertEvents: _alertEvents,
  widgetId,
}: UPlotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  // Crosshair store
  const setCrosshair = useCrosshairStore((s) => s.setCrosshair);
  const clearCrosshair = useCrosshairStore((s) => s.clearCrosshair);
  const crosshairTimestamp = useCrosshairStore((s) => s.timestamp);
  const crosshairSourceId = useCrosshairStore((s) => s.sourceWidgetId);

  // Stable refs for crosshair state (used by plugins to avoid re-creating chart)
  const crosshairTimestampRef = useRef(crosshairTimestamp);
  const crosshairSourceIdRef = useRef(crosshairSourceId);
  crosshairTimestampRef.current = crosshairTimestamp;
  crosshairSourceIdRef.current = crosshairSourceId;

  const colors = useMemo(() => buildColors(data, displayOptions), [data, displayOptions]);
  const allSeriesKeys = useMemo(() => data.map(seriesKey), [data]);

  const unit = displayOptions?.unit;
  const legendConfig = displayOptions?.legend;
  const legendPos = legendConfig?.position ?? "bottom";
  const isHorizontalLayout = legendPos === "right";

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isolateSeries = useCallback(
    (key: string) => {
      setHiddenSeries((prev) => {
        const visibleKeys = allSeriesKeys.filter((k) => !prev.has(k));
        if (visibleKeys.length === 1 && visibleKeys[0] === key) {
          return new Set();
        }
        return new Set(allSeriesKeys.filter((k) => k !== key));
      });
    },
    [allSeriesKeys],
  );

  // Sync hiddenSeries with uPlot instance (show/hide series without recreating)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (let i = 0; i < data.length; i++) {
      const key = seriesKey(data[i]);
      const seriesIdx = i + 1; // 0 is x-axis
      const shouldShow = !hiddenSeries.has(key);
      if (chart.series[seriesIdx]?.show !== shouldShow) {
        chart.setSeries(seriesIdx, { show: shouldShow });
      }
    }
  }, [hiddenSeries, data]);

  const nullMode = displayOptions?.nullHandling ?? "gap";
  const stackMode = displayOptions?.stackingMode ?? "none";

  const uplotData = useMemo((): uPlot.AlignedData => {
    const raw = toUPlotData(data, comparisonData);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary between uPlot types and generic array utilities
    let arr: any = raw;
    arr = applyNullHandling(arr, nullMode);
    if (stackMode !== "none") {
      arr = stackData(arr, stackMode);
    }
    // LTTB downsample per spec E.2: if server returned more points than the widget can render
    const maxPoints = Math.max((containerRef.current?.clientWidth ?? 800) * (window.devicePixelRatio ?? 1), 200);
    if (arr.length > 1 && (arr[0] as number[]).length > maxPoints) {
      const timestamps = arr[0] as number[];
      const downsampled: (number[] | (number | null)[])[] = [[]];
      for (let s = 1; s < arr.length; s++) {
        const pairs: [number, number | null][] = timestamps.map((t: number, i: number) => [t, (arr[s] as (number | null)[])[i]]);
        const reduced = lttbDownsample(pairs, maxPoints);
        if (s === 1) downsampled[0] = reduced.map(([t]) => t);
        downsampled.push(reduced.map(([, v]) => v));
      }
      arr = downsampled;
    }
    return arr as uPlot.AlignedData;
  }, [data, comparisonData, nullMode, stackMode]);

  // Compute anomaly bands from the first series when anomaly detection is enabled.
  const anomalyConfig = displayOptions?.anomaly;
  const anomalyBands = useMemo(() => {
    if (!anomalyConfig?.enabled || !data.length || !data[0].datapoints.length) {
      return [];
    }
    return computeAnomalyBands(
      data[0].datapoints,
      anomalyConfig.stdDevMultiplier ?? 2,
      anomalyConfig.rollingWindow ?? 20,
    );
  }, [data, anomalyConfig?.enabled, anomalyConfig?.stdDevMultiplier, anomalyConfig?.rollingWindow]);

  // Create / destroy uPlot instance
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data.length || !data[0].datapoints.length) {
      return;
    }

    const yAxis = displayOptions?.yAxis;
    const thresholds = displayOptions?.thresholds;
    const chartHeight = legendPos === "bottom" ? height - 60 : height;

    // Build plugins
    const plugins: uPlot.Plugin[] = [];
    if (thresholds && thresholds.steps.length > 0) {
      plugins.push(thresholdPlugin(thresholds));
    }
    if (anomalyConfig?.enabled && anomalyBands.length > 0) {
      plugins.push(anomalyBandPlugin(anomalyBands, anomalyConfig.showBands !== false));
    }
    if (annotations && annotations.length > 0) {
      plugins.push(annotationPlugin(annotations));
    }
    plugins.push(
      crosshairSyncPlugin(setCrosshair, clearCrosshair, widgetId),
    );
    plugins.push(
      externalCrosshairPlugin(
        () => crosshairTimestampRef.current,
        () => crosshairSourceIdRef.current,
        widgetId,
      ),
    );

    const seriesConfig = buildSeriesConfig(
      data,
      colors,
      hiddenSeries,
      mode,
      displayOptions,
      comparisonData,
    );

    const rightAxisCfg = yAxis?.right;
    const rightAxisEnabled = rightAxisCfg?.enabled ?? false;
    const rightAxisUnit: UnitConfig | undefined = rightAxisCfg?.unit;

    const scales: uPlot.Options["scales"] = {
      x: { time: true },
      y: {
        auto: true,
        distr: yAxis?.scale === "log" ? 3 : 1,
        range: (_u, dataMin, dataMax) => {
          if (stackMode === "percent") return [0, 100];
          const min = yAxis?.min === "auto" || yAxis?.min == null ? dataMin : yAxis.min;
          const max = yAxis?.max === "auto" || yAxis?.max == null ? dataMax : yAxis.max;
          // Add some padding
          const padding = (max - min) * 0.05 || 1;
          return [
            typeof min === "number" ? min : (dataMin - padding),
            typeof max === "number" ? max : (dataMax + padding),
          ];
        },
      },
    };

    if (rightAxisEnabled) {
      scales.yRight = {
        auto: true,
        distr: rightAxisCfg?.scale === "log" ? 3 : 1,
        range: (_u, dataMin, dataMax) => {
          const min = rightAxisCfg?.min === "auto" || rightAxisCfg?.min == null ? dataMin : rightAxisCfg.min;
          const max = rightAxisCfg?.max === "auto" || rightAxisCfg?.max == null ? dataMax : rightAxisCfg.max;
          const padding = (max - min) * 0.05 || 1;
          return [
            typeof min === "number" ? min : (dataMin - padding),
            typeof max === "number" ? max : (dataMax + padding),
          ];
        },
      };
    }

    const axes: uPlot.Axis[] = [
      {
        // X axis (time)
        stroke: "rgba(150, 150, 150, 0.3)",
        grid: { stroke: "rgba(150, 150, 150, 0.15)", dash: [3, 3] },
        ticks: { stroke: "rgba(150, 150, 150, 0.2)" },
        font: "11px sans-serif",
      },
      {
        // Left Y axis
        stroke: "rgba(150, 150, 150, 0.3)",
        grid: { stroke: "rgba(150, 150, 150, 0.15)", dash: [3, 3] },
        ticks: { stroke: "rgba(150, 150, 150, 0.2)" },
        size: 60,
        font: "11px sans-serif",
        values: (_u, splits) =>
          splits.map((v) =>
            v == null ? "" : stackMode === "percent" ? `${Math.round(v)}%` : formatAxisTick(v, unit),
          ),
      },
    ];

    if (rightAxisEnabled) {
      axes.push({
        // Right Y axis
        side: 1,
        scale: "yRight",
        stroke: "rgba(150, 150, 150, 0.3)",
        grid: { show: false }, // Avoid double grid lines
        ticks: { stroke: "rgba(150, 150, 150, 0.2)" },
        size: 60,
        font: "11px sans-serif",
        values: (_u, splits) =>
          splits.map((v) => (v == null ? "" : formatAxisTick(v, rightAxisUnit))),
      });
    }

    const opts: uPlot.Options = {
      width: container.clientWidth,
      height: chartHeight,
      series: seriesConfig,
      plugins,
      legend: { show: false }, // We use our own ChartLegend
      cursor: {
        x: true,
        y: false,
        drag: {
          x: !!onTimeRangeChange,
          y: false,
          setScale: false, // We handle zoom via onTimeRangeChange
        },
        sync: {
          key: "neoguard-crosshair",
          setSeries: false,
        },
      },
      scales,
      axes,
      hooks: {
        setSelect: [
          (u: uPlot) => {
            if (!onTimeRangeChange) return;
            const { left, width } = u.select;
            if (width < 5) return; // ignore tiny drags
            const fromVal = u.posToVal(left, "x");
            const toVal = u.posToVal(left + width, "x");
            onTimeRangeChange(
              new Date(Math.min(fromVal, toVal) * 1000),
              new Date(Math.max(fromVal, toVal) * 1000),
            );
            // Clear selection after zoom
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
          },
        ],
      },
    };

    const chart = new uPlot(opts, uplotData, container);
    chartRef.current = chart;

    // ResizeObserver: handle container resize without re-querying (spec rule)
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0 && chart.status === 1) {
          chart.setSize({
            width: newWidth,
            height: chartHeight,
          });
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup: dispose on unmount (CRITICAL per spec)
    return () => {
      resizeObserver.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
    // Re-create when structural config changes. Data updates use setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.length,
    mode,
    displayOptions?.lineInterpolation,
    displayOptions?.fillMode,
    displayOptions?.fillOpacity,
    displayOptions?.connectNulls,
    displayOptions?.nullHandling,
    displayOptions?.stackingMode,
    displayOptions?.yAxis?.scale,
    displayOptions?.yAxis?.min,
    displayOptions?.yAxis?.max,
    displayOptions?.yAxis?.right?.enabled,
    displayOptions?.yAxis?.right?.unit?.category,
    displayOptions?.yAxis?.right?.scale,
    displayOptions?.thresholds,
    displayOptions?.colors,
    anomalyBands,
    anomalyConfig?.showBands,
    annotations,
    height,
    legendPos,
    onTimeRangeChange,
    widgetId,
    setCrosshair,
    clearCrosshair,
    comparisonData?.length,
  ]);

  // Update data without recreating instance (minor update path)
  useEffect(() => {
    const chart = chartRef.current;
    if (chart && chart.status === 1 && uplotData[0].length > 0) {
      chart.setData(uplotData);
    }
  }, [uplotData]);

  // Cleanup crosshair on mouse leave
  const handleMouseLeave = useCallback(() => {
    clearCrosshair();
  }, [clearCrosshair]);

  if (!data.length || !data[0].datapoints.length) {
    return <div style={{ ...CHART_EMPTY_STYLE, height }} data-testid="uplot-empty">No data available</div>;
  }

  const chartHeight = legendPos === "bottom" ? height - 60 : height;

  return (
    <div style={{ display: isHorizontalLayout ? "flex" : "block", height }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          ref={containerRef}
          data-testid="uplot-container"
          style={{ width: "100%", height: chartHeight }}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      <ChartLegend
        data={data}
        colors={colors}
        config={legendConfig}
        unit={unit}
        hiddenSeries={hiddenSeries}
        onToggleSeries={toggleSeries}
        onIsolateSeries={(key) => isolateSeries(key)}
      />
    </div>
  );
}
