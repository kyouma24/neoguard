import { type ReactNode, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import type { AlertEvent, Annotation, MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatAxisTick } from "../../utils/unitFormat";
import { computeAnomalyBands } from "../../utils/anomalyDetection";
import { ChartLegend } from "./ChartLegend";
import { ChartTooltip } from "./ChartTooltip";
import { AlertStateOverlay } from "./AlertStateOverlay";
import { AnnotationMarkers } from "./AnnotationMarker";
import { DataLinkMenu } from "./DataLinkMenu";
import { useChartInteractions, seriesKey, mergeDatapoints, makeChartClickHandler } from "./useChartInteractions";
import type { CurveType } from "recharts/types/shape/Curve";
import { CHART_EMPTY_STYLE } from "./chartConstants";

/** Danger color for anomaly markers. Matches CSS var(--color-danger-500). */
const ANOMALY_DANGER = "var(--color-danger-500, #ef4444)";

/**
 * Custom dot renderer for Recharts that highlights anomaly points as red circles.
 * Returns an invisible zero-size circle for normal points (Recharts requires a ReactElement);
 * renders a visible filled red circle for anomaly points.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AnomalyDotRenderer(props: any): React.ReactElement<SVGElement> {
  const { cx, cy, payload } = props as {
    cx?: number;
    cy?: number;
    payload?: Record<string, unknown>;
  };
  if (!payload?.__anomaly || cx == null || cy == null) {
    // Recharts requires a ReactElement return — render an invisible point
    return <circle r={0} />;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={ANOMALY_DANGER}
      stroke="#fff"
      strokeWidth={1.5}
      data-testid="anomaly-dot"
    />
  );
}

export interface BaseTimeChartProps {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  onTimeRangeChange?: (from: Date, to: Date) => void;
  comparisonData?: MetricQueryResult[];
  annotations?: Annotation[];
  onAnnotate?: (timestamp: Date) => void;
  alertEvents?: AlertEvent[];
}

interface InternalProps extends BaseTimeChartProps {
  ChartComponent: React.ComponentType<Record<string, unknown>>;
  renderSeries: (args: {
    data: MetricQueryResult[];
    colors: string[];
    hiddenSeries: Set<string>;
    lineType: CurveType;
    connectNulls: boolean;
  }) => ReactNode[];
  renderComparisonSeries: (args: {
    comparisonData: MetricQueryResult[];
    colors: string[];
    hiddenSeries: Set<string>;
    lineType: CurveType;
  }) => ReactNode[];
  renderExtraDefs?: (args: {
    data: MetricQueryResult[];
    colors: string[];
    fillOpacity: number;
  }) => ReactNode;
}

export function BaseTimeChart({
  data, height = 300, displayOptions, onTimeRangeChange, comparisonData,
  annotations, onAnnotate, alertEvents,
  ChartComponent, renderSeries, renderComparisonSeries, renderExtraDefs,
}: InternalProps) {
  const {
    hiddenSeries, dragStart, dragEnd, dataLinkMenu, setDataLinkMenu,
    crosshair, toggleSeries, isolateSeries,
    handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave,
  } = useChartInteractions(onTimeRangeChange);

  // Anomaly detection: compute bands from first series when enabled.
  // Hooks must be called before any early return to satisfy Rules of Hooks.
  const anomalyConfig = displayOptions?.anomaly;
  const anomalyEnabled = anomalyConfig?.enabled ?? false;
  const anomalyShowBands = anomalyConfig?.showBands !== false;
  const anomalyBands = useMemo(() => {
    if (!anomalyEnabled || !data.length || !data[0].datapoints.length) return [];
    return computeAnomalyBands(
      data[0].datapoints,
      anomalyConfig?.stdDevMultiplier ?? 2,
      anomalyConfig?.rollingWindow ?? 20,
    );
  }, [data, anomalyEnabled, anomalyConfig?.stdDevMultiplier, anomalyConfig?.rollingWindow]);

  // Build a lookup from timestamp -> anomaly band entry for merging
  const anomalyByTime = useMemo(() => {
    const map = new Map<string, { upper: number; lower: number; mean: number; isAnomaly: boolean }>();
    for (const b of anomalyBands) {
      map.set(b.timestamp, { upper: b.upper, lower: b.lower, mean: b.mean, isAnomaly: b.isAnomaly });
    }
    return map;
  }, [anomalyBands]);

  const baseMerged = useMemo(
    () => mergeDatapoints(data, comparisonData),
    [data, comparisonData],
  );

  // Enrich merged data with anomaly band fields when anomaly detection is on
  const merged = useMemo(() => {
    if (!anomalyEnabled || anomalyByTime.size === 0) return baseMerged;
    return baseMerged.map((point) => {
      const ts = point.time as string;
      const band = anomalyByTime.get(ts);
      if (!band) return point;
      return {
        ...point,
        __anomalyUpper: band.upper,
        __anomalyLower: band.lower,
        __anomalyMean: band.mean,
        __anomaly: band.isAnomaly,
      };
    });
  }, [baseMerged, anomalyEnabled, anomalyByTime]);

  if (!data.length || !data[0].datapoints.length) {
    return <div style={{ ...CHART_EMPTY_STYLE, height }}>No data available</div>;
  }

  const basePalette = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const colorOverrides = displayOptions?.colors?.overrides;
  const colors = basePalette.map((defaultColor, i) => {
    if (!colorOverrides?.length || i >= data.length) return defaultColor;
    const key = seriesKey(data[i]);
    const override = colorOverrides.find((o) => key === o.seriesPattern || key.includes(o.seriesPattern));
    return override?.color ?? defaultColor;
  });
  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const yAxis = displayOptions?.yAxis;
  const legendConfig = displayOptions?.legend;
  const legendPos = legendConfig?.position ?? "bottom";
  const lineType = (displayOptions?.lineInterpolation ?? "monotone") as CurveType;
  const doConnectNulls = displayOptions?.connectNulls ?? false;
  const dataLinks = displayOptions?.dataLinks;
  const fillOp = displayOptions?.fillOpacity ?? 0.3;

  const allSeriesKeys = data.map(seriesKey);
  const chartHeight = legendPos === "bottom" ? height - 60 : height;
  const isHorizontalLayout = legendPos === "right";

  const handleClick = makeChartClickHandler(onAnnotate, dataLinks, setDataLinkMenu);

  const chart = (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ChartComponent
        data={merged}
        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={(e: Record<string, unknown>, event: unknown) => handleClick(
          e as { activeLabel?: string; activePayload?: { value?: number }[] },
          event as React.MouseEvent,
        )}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="time"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={(v: string) => format(new Date(v), "HH:mm")}
          stroke="var(--border)"
        />
        <YAxis
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={60}
          scale={yAxis?.scale ?? "linear"}
          domain={[
            yAxis?.min === "auto" || yAxis?.min == null ? "auto" : yAxis.min,
            yAxis?.max === "auto" || yAxis?.max == null ? "auto" : yAxis.max,
          ]}
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
        />
        <Tooltip
          content={<ChartTooltip unit={unit} hiddenSeries={hiddenSeries} />}
          isAnimationActive={false}
        />

        {thresholds?.showBands && thresholds.steps.length >= 2 &&
          [...thresholds.steps]
            .sort((a, b) => a.value - b.value)
            .map((step, i, arr) => {
              if (i >= arr.length - 1) return null;
              return (
                <ReferenceArea
                  key={`band-${i}`}
                  y1={step.value}
                  y2={arr[i + 1].value}
                  fill={step.color}
                  fillOpacity={0.06}
                />
              );
            })}

        {thresholds?.showLines &&
          thresholds.steps.map((step) => (
            <ReferenceLine
              key={`line-${step.value}`}
              y={step.value}
              stroke={step.color}
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={step.label ? { value: step.label, fill: step.color, fontSize: 10, position: "right" } : undefined}
            />
          ))}

        {crosshair.timestamp && (
          <ReferenceLine
            x={crosshair.timestamp}
            stroke="var(--text-muted)"
            strokeDasharray="3 3"
            strokeWidth={1}
            ifOverflow="extendDomain"
          />
        )}

        {dragStart && dragEnd && (
          <ReferenceArea
            x1={dragStart}
            x2={dragEnd}
            fill="var(--color-primary-500, #635bff)"
            fillOpacity={0.15}
            strokeOpacity={0}
          />
        )}

        {alertEvents && alertEvents.length > 0 && (
          <AlertStateOverlay
            alertEvents={alertEvents}
            yMin={typeof yAxis?.min === "number" ? yAxis.min : 0}
            yMax={typeof yAxis?.max === "number" ? yAxis.max : 100}
          />
        )}

        {annotations && annotations.length > 0 && (
          <AnnotationMarkers annotations={annotations} />
        )}

        {renderExtraDefs?.({ data, colors, fillOpacity: fillOp })}

        {renderSeries({ data, colors, hiddenSeries, lineType, connectNulls: doConnectNulls })}

        {comparisonData && renderComparisonSeries({ comparisonData, colors, hiddenSeries, lineType })}

        {/* Anomaly detection: shaded band between upper and lower bounds */}
        {anomalyEnabled && anomalyBands.length > 0 && anomalyShowBands && (
          <>
            <defs>
              <linearGradient id="anomalyBandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ANOMALY_DANGER} stopOpacity={0.08} />
                <stop offset="100%" stopColor={ANOMALY_DANGER} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            {/* Upper bound line (hidden stroke, used as band ceiling) */}
            <Area
              type="monotone"
              dataKey="__anomalyUpper"
              stroke="rgba(168, 85, 247, 0.35)"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="none"
              isAnimationActive={false}
              dot={false}
              activeDot={false}
              legendType="none"
              name="__anomalyUpper"
            />
            {/* Lower bound line with fill up to upper bound */}
            <Area
              type="monotone"
              dataKey="__anomalyLower"
              stroke="rgba(168, 85, 247, 0.35)"
              strokeWidth={1}
              strokeDasharray="4 4"
              fill="url(#anomalyBandGrad)"
              fillOpacity={1}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
              legendType="none"
              name="__anomalyLower"
            />
          </>
        )}

        {/* Anomaly detection: red dot markers on anomaly points */}
        {anomalyEnabled && anomalyBands.length > 0 && (
          <Area
            type="monotone"
            dataKey="__anomalyMean"
            stroke="none"
            fill="none"
            isAnimationActive={false}
            dot={AnomalyDotRenderer}
            activeDot={false}
            legendType="none"
            name="__anomalyMean"
          />
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );

  return (
    <div style={{ display: isHorizontalLayout ? "flex" : "block", height }}>
      <div style={{ flex: 1, minWidth: 0 }}>{chart}</div>
      <ChartLegend
        data={data}
        colors={colors}
        config={legendConfig}
        unit={unit}
        hiddenSeries={hiddenSeries}
        onToggleSeries={toggleSeries}
        onIsolateSeries={(key) => isolateSeries(key, allSeriesKeys)}
      />
      {dataLinkMenu && dataLinks?.length && (
        <DataLinkMenu
          links={dataLinks}
          context={{
            value: dataLinkMenu.value,
            time: dataLinkMenu.time,
            seriesName: data[0]?.name,
          }}
          position={{ x: dataLinkMenu.x, y: dataLinkMenu.y }}
          onClose={() => setDataLinkMenu(null)}
        />
      )}
    </div>
  );
}
