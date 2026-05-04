import { useState, useEffect, useCallback } from "react";
import type { ConnectionStatus } from "../../hooks/useLiveStream";

interface FreshnessIndicatorProps {
  lastUpdateTime: Date | null;
  widgetCount: number;
  errorCount: number;
  liveStatus?: ConnectionStatus;
}

/**
 * Format seconds elapsed into a human-friendly string.
 */
function formatElapsed(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

type Freshness = "fresh" | "aging" | "stale";

function getFreshness(seconds: number): Freshness {
  if (seconds < 30) return "fresh";
  if (seconds <= 120) return "aging";
  return "stale";
}

const FRESHNESS_COLORS: Record<Freshness, string> = {
  fresh: "var(--color-success-500, #22c55e)",
  aging: "var(--color-warning-500, #eab308)",
  stale: "var(--color-error-500, #ef4444)",
};

const STATUS_LABELS: Record<ConnectionStatus, { label: string; color: string }> = {
  connected: { label: "Live", color: "var(--color-success-500, #22c55e)" },
  connecting: { label: "Reconnecting...", color: "var(--color-warning-500, #eab308)" },
  error: { label: "Reconnecting...", color: "var(--color-warning-500, #eab308)" },
  disconnected: { label: "", color: "" },
};

export function FreshnessIndicator({
  lastUpdateTime,
  widgetCount,
  errorCount,
  liveStatus,
}: FreshnessIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  const computeElapsed = useCallback(() => {
    if (!lastUpdateTime) return 0;
    return Math.max(0, (Date.now() - lastUpdateTime.getTime()) / 1000);
  }, [lastUpdateTime]);

  useEffect(() => {
    setElapsed(computeElapsed());
    const id = setInterval(() => {
      setElapsed(computeElapsed());
    }, 1000);
    return () => clearInterval(id);
  }, [computeElapsed]);

  const freshness = getFreshness(elapsed);
  const barColor = lastUpdateTime ? FRESHNESS_COLORS[freshness] : "var(--color-neutral-400, #9ca3af)";
  const elapsedText = lastUpdateTime ? formatElapsed(elapsed) : "No data yet";

  const statusInfo = liveStatus ? STATUS_LABELS[liveStatus] : null;
  const showStatus = statusInfo && statusInfo.label;

  return (
    <div
      data-testid="freshness-indicator"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        fontSize: 12,
        color: "var(--text-muted)",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Freshness dot and elapsed time */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            data-testid="freshness-dot"
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: barColor,
              flexShrink: 0,
            }}
          />
          <span data-testid="freshness-elapsed">{elapsedText}</span>
        </div>

        {/* Widget count + error count */}
        <span data-testid="freshness-widget-count">
          {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
          {errorCount > 0 && (
            <span
              data-testid="freshness-error-count"
              style={{ color: "var(--color-error-500, #ef4444)", marginLeft: 4 }}
            >
              &middot; {errorCount} error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>

      {/* Live status */}
      {showStatus && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusInfo.color,
            }}
          />
          <span>{statusInfo.label}</span>
        </div>
      )}
    </div>
  );
}
