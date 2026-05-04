import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions, RadarDisplayConfig } from "../../types/display-options";
import { DEFAULT_COLORS } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

/** Tag-group key built from the tags object (excluding axis keys). */
function buildGroupKey(tags: Record<string, string>, axisKeys: Set<string>): string {
  const entries = Object.entries(tags)
    .filter(([k]) => !axisKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "default";
  return entries.map(([k, v]) => `${k}:${v}`).join(",");
}

/** Average all non-null datapoints in a series. */
function averageDatapoints(datapoints: [string, number | null][]): number | null {
  let sum = 0;
  let count = 0;
  for (const [, v] of datapoints) {
    if (v != null) {
      sum += v;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Radar/spider chart for comparing multiple dimensions per resource.
 *
 * Each MetricQueryResult maps to one axis on the radar.
 * If multiple tag groups exist, each group is rendered as an overlaid radar shape.
 */
export function RadarWidget({ data, height = 300, displayOptions }: Props) {
  if (!data.length) {
    return <ChartEmptyState height={height} />;
  }

  const radarConfig: RadarDisplayConfig = displayOptions?.radar ?? {};
  const fillOpacity = radarConfig.fillOpacity ?? 0.3;
  const showPoints = radarConfig.showPoints ?? true;
  const maxValue = radarConfig.maxValue;
  const colors = displayOptions?.colors?.palette ?? DEFAULT_COLORS;
  const unit = displayOptions?.unit;

  // Determine which axes to display. If axes config specifies tag keys,
  // filter series by name match; otherwise use all series.
  const axisFilter = radarConfig.axes;
  const filteredData = axisFilter?.length
    ? data.filter((s) => axisFilter.includes(s.name))
    : data;

  if (!filteredData.length) {
    return <ChartEmptyState height={height} message="No matching axes in data" />;
  }

  // Build axis names from series names.
  const axisNames = filteredData.map((s) => s.name);
  const axisKeySet = new Set(axisNames);

  // Group series by tag grouping.
  // Each series may have tags — series sharing the same non-axis tags form a group
  // that gets overlaid as one radar shape.
  // Map: groupKey -> { axisName -> rawAvgValue }
  const groupMap = new Map<string, Map<string, number>>();

  for (const series of filteredData) {
    const avg = averageDatapoints(series.datapoints);
    if (avg == null) continue;

    const groupKey = buildGroupKey(series.tags, axisKeySet);
    let axes = groupMap.get(groupKey);
    if (!axes) {
      axes = new Map<string, number>();
      groupMap.set(groupKey, axes);
    }
    axes.set(series.name, avg);
  }

  if (groupMap.size === 0) {
    return <ChartEmptyState height={height} message="All series returned null" />;
  }

  const groupKeys = Array.from(groupMap.keys());

  // Compute the actual max across all raw values (for normalization).
  let computedMax = 0;
  for (const axes of groupMap.values()) {
    for (const v of axes.values()) {
      if (v > computedMax) computedMax = v;
    }
  }
  const normalizeMax = maxValue ?? (computedMax > 0 ? computedMax : 1);

  // Store raw values for tooltip display alongside normalized values for the chart.
  // Recharts RadarChart data is an array of objects, one per axis.
  // Each object: { axis: string, [groupKey]: normalizedValue }
  // We also build a parallel raw map for the tooltip.
  const rawValueMap = new Map<string, Map<string, number>>(); // axis -> groupKey -> rawValue

  const chartData = axisNames.map((axis) => {
    const entry: Record<string, string | number> = { axis };
    const rawForAxis = new Map<string, number>();

    for (const gk of groupKeys) {
      const raw = groupMap.get(gk)?.get(axis) ?? 0;
      rawForAxis.set(gk, raw);
      entry[gk] = (raw / normalizeMax) * 100;
    }

    rawValueMap.set(axis, rawForAxis);
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: "var(--text-muted)", fontSize: 10 }}
          tickFormatter={(v: number) => {
            const raw = (v / 100) * normalizeMax;
            return formatValue(raw, unit);
          }}
        />
        {groupKeys.map((gk, i) => (
          <Radar
            key={gk}
            name={gk === "default" ? "Value" : gk}
            dataKey={gk}
            stroke={colors[i % colors.length]}
            fill={colors[i % colors.length]}
            fillOpacity={fillOpacity}
            dot={showPoints ? { r: 3, fill: colors[i % colors.length] } : false}
            isAnimationActive={false}
          />
        ))}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, name: string, props: { payload?: { axis?: string } }) => {
            const axis = props.payload?.axis;
            if (axis) {
              const raw = rawValueMap.get(axis)?.get(name) ?? (value / 100) * normalizeMax;
              return [formatValue(raw, unit), name === "default" ? "Value" : name];
            }
            const raw = (value / 100) * normalizeMax;
            return [formatValue(raw, unit), name === "default" ? "Value" : name];
          }}
          labelFormatter={(label: string) => label}
        />
        {groupKeys.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: "var(--text-muted)" }}
          />
        )}
      </RadarChart>
    </ResponsiveContainer>
  );
}
