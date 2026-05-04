import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

export function SloTrackerWidget({ data, height = 200, displayOptions }: Props) {
  if (!data.length || !data[0].datapoints.length) return <ChartEmptyState height={height} />;

  const unit = displayOptions?.unit;
  const cfg = displayOptions?.sloTracker;
  const targetSlo = cfg?.targetSlo ?? 99.9;
  const windowDays = cfg?.windowDays ?? 30;
  const showBurnRate = cfg?.showBurnRate ?? true;
  const showErrorBudget = cfg?.showErrorBudget ?? true;

  const series = data[0];
  const values = series.datapoints.map(([, v]) => v).filter((v): v is number => v !== null);
  const total = values.length;
  const good = values.filter((v) => v >= 1).length;
  const compliance = total > 0 ? (good / total) * 100 : 100;

  const errorBudgetTotal = 100 - targetSlo;
  const errorBudgetUsed = Math.max(0, 100 - compliance);
  const errorBudgetRemaining = Math.max(0, errorBudgetTotal - errorBudgetUsed);
  const errorBudgetPct = errorBudgetTotal > 0 ? (errorBudgetRemaining / errorBudgetTotal) * 100 : 100;

  const burnRate = errorBudgetTotal > 0 ? errorBudgetUsed / errorBudgetTotal : 0;

  const compliancePct = Math.min(100, Math.max(0, compliance));
  const isHealthy = compliance >= targetSlo;
  const isBurning = burnRate > 1;
  const statusColor = isHealthy ? "#22c55e" : isBurning ? "#ef4444" : "#f59e0b";

  const radius = Math.min(60, (height - 60) / 2);
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - compliancePct / 100);
  const cx = radius + 8;
  const cy = radius + 8;

  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ position: "relative" }}>
        <svg width={(radius + 8) * 2} height={(radius + 8) * 2}>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth={8} />
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={statusColor}
            strokeWidth={8}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: statusColor }}>
            {formatValue(compliance, unit ?? { category: "percent", decimals: 2 })}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Target: {targetSlo}%</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
        <div style={{ color: "var(--text-secondary)" }}>
          <span style={{ fontWeight: 600 }}>{good}</span> / {total} good
          <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 6 }}>{windowDays}d window</span>
        </div>
        {showBurnRate && (
          <div>
            <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>Burn Rate</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 80, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(100, burnRate * 100)}%`,
                    height: "100%",
                    background: isBurning ? "#ef4444" : "#f59e0b",
                    borderRadius: 3,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span style={{ fontWeight: 600, color: isBurning ? "#ef4444" : "var(--text-primary)" }}>
                {burnRate.toFixed(2)}x
              </span>
            </div>
          </div>
        )}
        {showErrorBudget && (
          <div>
            <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>Error Budget</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 80, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${errorBudgetPct}%`,
                    height: "100%",
                    background: errorBudgetPct > 50 ? "#22c55e" : errorBudgetPct > 20 ? "#f59e0b" : "#ef4444",
                    borderRadius: 3,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {errorBudgetRemaining.toFixed(3)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
