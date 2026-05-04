import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { getThresholdColor } from "../../utils/unitFormat";
import { applyValueMapping } from "../../utils/valueMapping";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

const DEG_START = -225;
const DEG_END = 45;
const ARC_TOTAL = DEG_END - DEG_START;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function GaugeWidget({ data, height = 200, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const thresholds = displayOptions?.thresholds;
  const gaugeCfg = displayOptions?.gauge;
  const gMin = gaugeCfg?.min ?? 0;
  const gMax = gaugeCfg?.max ?? 100;
  const showTicks = gaugeCfg?.showTicks ?? true;
  const arcWidth = gaugeCfg?.arcWidth ?? 14;

  const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  const current = points[points.length - 1]?.[1] ?? 0;
  const clamped = Math.max(gMin, Math.min(gMax, current));
  const pct = gMax !== gMin ? (clamped - gMin) / (gMax - gMin) : 0;

  const mapped = applyValueMapping(current, displayOptions?.valueMappings);

  const valueColor = mapped?.color
    ?? (thresholds?.steps.length ? getThresholdColor(current, thresholds.steps, thresholds.baseColor) : "#635bff");

  const size = Math.min(height - 20, 260);
  const cx = size / 2;
  const cy = size / 2 + size * 0.05;
  const outerR = size * 0.42;

  const valueDeg = DEG_START + pct * ARC_TOTAL;

  const steps = thresholds?.steps?.length
    ? [...thresholds.steps].sort((a, b) => a.value - b.value)
    : null;

  const tickValues = showTicks ? [gMin, gMin + (gMax - gMin) * 0.25, gMin + (gMax - gMin) * 0.5, gMin + (gMax - gMin) * 0.75, gMax] : [];

  return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
        <path
          d={describeArc(cx, cy, outerR, DEG_START, DEG_END)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={arcWidth}
          strokeLinecap="round"
        />

        {steps && steps.map((step, i) => {
          const nextVal = i < steps.length - 1 ? steps[i + 1].value : gMax;
          const s = Math.max(0, (step.value - gMin) / (gMax - gMin));
          const e = Math.min(1, (nextVal - gMin) / (gMax - gMin));
          if (e <= s) return null;
          const sDeg = DEG_START + s * ARC_TOTAL;
          const eDeg = DEG_START + e * ARC_TOTAL;
          return (
            <path
              key={i}
              d={describeArc(cx, cy, outerR, sDeg, eDeg)}
              fill="none"
              stroke={step.color}
              strokeWidth={arcWidth}
              strokeOpacity={0.2}
            />
          );
        })}

        <path
          d={describeArc(cx, cy, outerR, DEG_START, valueDeg)}
          fill="none"
          stroke={valueColor}
          strokeWidth={arcWidth}
          strokeLinecap="round"
        />

        {tickValues.map((tv, i) => {
          const tPct = gMax !== gMin ? (tv - gMin) / (gMax - gMin) : 0;
          const tDeg = DEG_START + tPct * ARC_TOTAL;
          const pos = polarToCartesian(cx, cy, outerR + 12, tDeg);
          return (
            <text
              key={i}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text-muted)"
              fontSize={9}
            >
              {formatValue(tv, unit)}
            </text>
          );
        })}

        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          fill={valueColor}
          fontSize={Math.max(18, size * 0.14)}
          fontWeight={700}
        >
          {mapped ? mapped.text : formatValue(current, unit)}
        </text>

        {thresholds?.steps.length ? (
          <text
            x={cx}
            y={cy + size * 0.12}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text-muted)"
            fontSize={10}
          >
            {(() => {
              const sorted = [...thresholds.steps].sort((a, b) => b.value - a.value);
              for (const step of sorted) {
                if (current >= step.value && step.label) return step.label;
              }
              return "";
            })()}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
