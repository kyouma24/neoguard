import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (endDeg - startDeg >= 360) {
    const mid = startDeg + 180;
    return describeArc(cx, cy, r, startDeg, mid) + " " + describeArc(cx, cy, r, mid, endDeg);
  }
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return "#22c55e";
  if (pct >= 50) return "#f59e0b";
  return "#ef4444";
}

export function ProgressWidget({ data, height = 200, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const cfg = displayOptions?.progress;
  const shape = cfg?.shape ?? "circular";
  const targetValue = cfg?.targetValue ?? 100;
  const showLabel = cfg?.showLabel ?? true;

  const points = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  const current = points[points.length - 1]?.[1] ?? 0;
  const pct = targetValue !== 0 ? Math.min(100, (current / targetValue) * 100) : 0;
  const color = getProgressColor(pct);

  if (shape === "linear") {
    return (
      <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "16px 24px" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color, lineHeight: 1 }}>
          {pct.toFixed(1)}%
        </div>
        <div style={{ width: "100%", maxWidth: 300 }}>
          <div style={{ height: 12, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 6,
                background: color,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
        {showLabel && (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {formatValue(current, unit)} / {formatValue(targetValue, unit)}
          </div>
        )}
      </div>
    );
  }

  const size = Math.min(height - 40, 180);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const arcWidth = 10;
  const startDeg = -90;
  const endDeg = startDeg + (pct / 100) * 360;

  return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="none"
          stroke="var(--border)"
          strokeWidth={arcWidth}
        />
        {pct > 0 && (
          <path
            d={describeArc(cx, cy, outerR, startDeg, endDeg)}
            fill="none"
            stroke={color}
            strokeWidth={arcWidth}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={Math.max(18, size * 0.18)}
          fontWeight={700}
        >
          {pct.toFixed(0)}%
        </text>
      </svg>
      {showLabel && (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {formatValue(current, unit)} / {formatValue(targetValue, unit)}
        </div>
      )}
    </div>
  );
}
