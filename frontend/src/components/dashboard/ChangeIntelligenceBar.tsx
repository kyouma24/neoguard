import { useMemo } from "react";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export interface ChangeIntelligenceBarProps {
  panels: Array<{
    id: string;
    title: string;
    currentAvg: number | null;
    previousAvg: number | null;
  }>;
  onPanelClick?: (panelId: string) => void;
}

/** Keywords in panel titles that indicate "lower is better" metrics. */
const INVERSE_KEYWORDS = [
  "latency",
  "error",
  "errors",
  "failure",
  "failures",
  "p99",
  "p95",
  "p90",
  "response time",
  "duration",
  "wait",
  "queue",
  "backlog",
  "cpu",
  "memory",
  "disk",
  "utilization",
  "usage",
  "load",
  "saturation",
];

function isInverseMetric(title: string): boolean {
  const lower = title.toLowerCase();
  return INVERSE_KEYWORDS.some((kw) => lower.includes(kw));
}

interface ComputedChange {
  panelId: string;
  panelTitle: string;
  percentChange: number;
  /** true when the change direction is "good" (green), false when "bad" (red) */
  isPositiveChange: boolean;
}

export function ChangeIntelligenceBar({ panels, onPanelClick }: ChangeIntelligenceBarProps) {
  const changes = useMemo<ComputedChange[]>(() => {
    const result: ComputedChange[] = [];
    for (const panel of panels) {
      if (panel.currentAvg == null || panel.previousAvg == null || panel.previousAvg === 0) continue;
      const pct = ((panel.currentAvg - panel.previousAvg) / Math.abs(panel.previousAvg)) * 100;
      if (Math.abs(pct) < 0.5) continue; // skip negligible changes
      const inverse = isInverseMetric(panel.title);
      // For inverse metrics (latency, errors, cpu, etc.), a decrease is good.
      // For normal metrics (throughput, requests), an increase is good.
      const isPositiveChange = inverse ? pct < 0 : pct > 0;
      result.push({
        panelId: panel.id,
        panelTitle: panel.title,
        percentChange: pct,
        isPositiveChange,
      });
    }
    result.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
    return result.slice(0, 5);
  }, [panels]);

  if (changes.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Biggest metric changes compared to previous period"
      style={{
        display: "flex",
        gap: 8,
        padding: "8px 16px",
        marginBottom: 12,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        overflowX: "auto",
        alignItems: "center",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <BarChart3 size={13} />
        Biggest Changes
      </span>
      {changes.map((item) => {
        const isUp = item.percentChange > 0;
        const chipBg = item.isPositiveChange
          ? "rgba(34, 197, 94, 0.15)"
          : "rgba(239, 68, 68, 0.15)";
        const chipColor = item.isPositiveChange ? "#22c55e" : "#ef4444";
        const Icon = isUp ? TrendingUp : TrendingDown;
        const sign = isUp ? "+" : "";
        return (
          <button
            key={item.panelId}
            onClick={() => onPanelClick?.(item.panelId)}
            title={`${item.panelTitle}: ${sign}${item.percentChange.toFixed(1)}% vs previous period`}
            aria-label={`${item.panelTitle} changed ${sign}${Math.round(item.percentChange)} percent`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 12px",
              background: chipBg,
              border: "none",
              borderRadius: 14,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              color: chipColor,
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.8"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          >
            <Icon size={12} />
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{item.panelTitle}</span>
            <span style={{ fontWeight: 700 }}>{sign}{Math.round(item.percentChange)}%</span>
          </button>
        );
      })}
    </div>
  );
}
