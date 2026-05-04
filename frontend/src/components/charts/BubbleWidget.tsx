import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Label,
  Cell,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatAxisTick, formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface BubblePoint {
  x: number;
  y: number;
  z: number;
  label: string;
}

/**
 * Build a display label from the series tags, falling back to series name.
 */
function buildLabel(series: MetricQueryResult): string {
  const tagStr = Object.entries(series.tags)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  return tagStr || series.name;
}

export function BubbleWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length || !data.some((s) => s.datapoints.length > 0)) {
    return <ChartEmptyState height={height} />;
  }

  const cfg = displayOptions?.bubble;
  const minBubbleSize = cfg?.minBubbleSize ?? 20;
  const maxBubbleSize = cfg?.maxBubbleSize ?? 200;
  const showLabels = cfg?.showLabels ?? false;
  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;

  let points: BubblePoint[];
  let xLabel: string;
  let yLabel: string;
  let hasSizeDimension = false;

  if (data.length >= 3) {
    // Multi-series mode: series[0] = X, series[1] = Y, series[2] = size
    const xSeries = data[0];
    const ySeries = data[1];
    const zSeries = data[2];
    hasSizeDimension = true;

    const xMap = new Map<string, number>();
    for (const [ts, val] of xSeries.datapoints) {
      if (val != null) xMap.set(ts, val);
    }

    const yMap = new Map<string, number>();
    for (const [ts, val] of ySeries.datapoints) {
      if (val != null) yMap.set(ts, val);
    }

    const zMap = new Map<string, number>();
    for (const [ts, val] of zSeries.datapoints) {
      if (val != null) zMap.set(ts, val);
    }

    points = [];
    for (const [ts, xVal] of xMap) {
      const yVal = yMap.get(ts);
      const zVal = zMap.get(ts);
      if (yVal != null) {
        points.push({
          x: xVal,
          y: yVal,
          z: zVal ?? 1,
          label: buildLabel(xSeries),
        });
      }
    }

    xLabel = cfg?.xMetric || xSeries.name;
    yLabel = cfg?.yMetric || ySeries.name;

    if (!points.length) {
      return <ChartEmptyState height={height} message="No matching datapoints across series" />;
    }
  } else if (data.length === 2) {
    // Two series: X and Y, fixed bubble size
    const xSeries = data[0];
    const ySeries = data[1];

    const xMap = new Map<string, number>();
    for (const [ts, val] of xSeries.datapoints) {
      if (val != null) xMap.set(ts, val);
    }

    points = [];
    for (const [ts, xVal] of xMap) {
      const yVal = ySeries.datapoints.find(([yTs]) => yTs === ts)?.[1];
      if (yVal != null) {
        points.push({ x: xVal, y: yVal, z: 1, label: ts });
      }
    }

    xLabel = cfg?.xMetric || xSeries.name;
    yLabel = cfg?.yMetric || ySeries.name;

    if (!points.length) {
      return <ChartEmptyState height={height} message="No matching datapoints between series" />;
    }
  } else {
    // Single series: scatter datapoints with time index as X, value as Y
    const singleSeries = data[0];
    const validPoints = singleSeries.datapoints
      .filter(([, v]) => v !== null)
      .map(([ts, v], i) => ({
        x: i,
        y: v as number,
        z: 1,
        label: new Date(ts).toLocaleTimeString(),
      }));

    if (!validPoints.length) {
      return <ChartEmptyState height={height} />;
    }

    points = validPoints;
    xLabel = "Time index";
    yLabel = cfg?.yMetric || singleSeries.name;
  }

  // Custom tooltip renderer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = (props: any) => {
    const payload = props.payload as Array<{ payload: BubblePoint }> | undefined;
    if (!payload || payload.length === 0) return null;
    const point = payload[0].payload;
    return (
      <div style={{ ...CHART_TOOLTIP_STYLE, padding: "8px 12px" }}>
        {showLabels && point.label && (
          <div style={{ fontSize: 11, marginBottom: 4, color: "var(--text-muted)" }}>
            {point.label}
          </div>
        )}
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>{xLabel}: </span>
          {formatValue(point.x, unit)}
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>{yLabel}: </span>
          {formatValue(point.y, unit)}
        </div>
        {hasSizeDimension && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)" }}>Size: </span>
            {formatValue(point.z, unit)}
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 14, right: 20, bottom: 24, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
        >
          <Label
            value={xLabel}
            position="bottom"
            offset={4}
            style={{ fill: "var(--text-muted)", fontSize: 10 }}
          />
        </XAxis>
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={60}
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
        >
          <Label
            value={yLabel}
            angle={-90}
            position="insideLeft"
            offset={0}
            style={{ fill: "var(--text-muted)", fontSize: 10 }}
          />
        </YAxis>
        <ZAxis
          type="number"
          dataKey="z"
          range={[minBubbleSize, maxBubbleSize]}
        />
        <Tooltip
          content={renderTooltip}
          cursor={{ strokeDasharray: "3 3" }}
        />
        <Scatter data={points} isAnimationActive={false}>
          {points.map((_point, i) => (
            <Cell
              key={i}
              fill={colors[i % colors.length]}
              fillOpacity={0.65}
              stroke={colors[i % colors.length]}
              strokeWidth={1}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
