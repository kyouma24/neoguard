import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
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

export function ScatterWidget({ data, height = 300, displayOptions }: Props) {
  if (data.length < 2) {
    return <ChartEmptyState height={height} message="Scatter requires at least 2 series (X and Y)" />;
  }

  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;

  const xSeries = data[0];
  const ySeries = data[1];
  const zSeries = data.length > 2 ? data[2] : null;

  const xMap = new Map<string, number>();
  for (const [ts, val] of xSeries.datapoints) {
    if (val != null) xMap.set(ts, val);
  }

  const yMap = new Map<string, number>();
  for (const [ts, val] of ySeries.datapoints) {
    if (val != null) yMap.set(ts, val);
  }

  const zMap = new Map<string, number>();
  if (zSeries) {
    for (const [ts, val] of zSeries.datapoints) {
      if (val != null) zMap.set(ts, val);
    }
  }

  const points: { x: number; y: number; z: number }[] = [];
  for (const [ts, xVal] of xMap) {
    const yVal = yMap.get(ts);
    if (yVal != null) {
      points.push({ x: xVal, y: yVal, z: zMap.get(ts) ?? 1 });
    }
  }

  if (!points.length) {
    return <ChartEmptyState height={height} message="No matching datapoints between series" />;
  }

  const xLabel = xSeries.name;
  const yLabel = ySeries.name;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
          label={{ value: xLabel, position: "bottom", offset: 0, fill: "var(--text-muted)", fontSize: 10 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          stroke="var(--border)"
          width={60}
          tickFormatter={(v: number) => formatAxisTick(v, unit)}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 10 }}
        />
        {zSeries && <ZAxis type="number" dataKey="z" range={[20, 400]} />}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [formatValue(value, unit), name]}
          cursor={{ strokeDasharray: "3 3" }}
        />
        <Scatter data={points} fill={colors[0]} fillOpacity={0.7} isAnimationActive={false} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
