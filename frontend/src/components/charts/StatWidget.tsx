import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue as fmtUnit } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { applyValueMapping } from "../../utils/valueMapping";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

const TEXT_SIZES = {
  sm: { value: 24, delta: 11, sparkH: 30 },
  md: { value: 36, delta: 13, sparkH: 40 },
  lg: { value: 48, delta: 15, sparkH: 50 },
  xl: { value: 64, delta: 17, sparkH: 60 },
};

export function StatWidget({ data, height = 160, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const statCfg = displayOptions?.stat;
  const colorMode = statCfg?.colorMode ?? "value";
  const textSize = statCfg?.textSize ?? "md";
  const showSparkline = statCfg?.showSparkline ?? true;
  const showDelta = statCfg?.showDelta ?? true;
  const deltaMode = statCfg?.deltaMode ?? "percent";

  const sizes = TEXT_SIZES[textSize];

  const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  const current = points[points.length - 1]?.[1] ?? 0;
  const prev = points[Math.max(0, points.length - Math.floor(points.length / 2))]?.[1];

  let delta: number | null = null;
  let deltaStr = "";
  if (showDelta && prev != null && prev !== 0) {
    if (deltaMode === "percent") {
      delta = ((current - prev) / prev) * 100;
      deltaStr = `${Math.abs(delta).toFixed(1)}%`;
    } else {
      delta = current - prev;
      deltaStr = fmtUnit(Math.abs(delta), unit);
    }
  }

  const mapped = applyValueMapping(current, displayOptions?.valueMappings);

  const thresholdColor = thresholds?.steps.length
    ? getThresholdColor(current, thresholds.steps, thresholds.baseColor)
    : null;

  const resolvedColor = mapped?.color ?? thresholdColor;
  const valueColor = colorMode === "value" && resolvedColor ? resolvedColor : "var(--text-primary)";
  const bgColor = colorMode === "background" && resolvedColor ? resolvedColor : undefined;

  const sparkData = points.map(([ts, val]) => ({ time: ts, value: val }));
  const sparkColor = delta !== null ? (delta >= 0 ? "#22c55e" : "#ef4444") : "#635bff";

  return (
    <div
      className="stat-widget"
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        background: bgColor ? `${bgColor}18` : undefined,
        borderRadius: bgColor ? "var(--radius-sm)" : undefined,
      }}
    >
      <div style={{ fontSize: sizes.value, fontWeight: 700, color: valueColor, lineHeight: 1 }}>
        {mapped ? mapped.text : fmtUnit(current, unit)}
      </div>
      {delta !== null && (
        <div style={{ fontSize: sizes.delta, fontWeight: 500, color: delta >= 0 ? "#22c55e" : "#ef4444" }}>
          {delta >= 0 ? "▲" : "▼"} {deltaStr}
        </div>
      )}
      {showSparkline && sparkData.length > 2 && (
        <div style={{ width: "80%", height: sizes.sparkH }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                fill={sparkColor}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
