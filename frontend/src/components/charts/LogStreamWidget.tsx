import { useEffect, useRef } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { ChartEmptyState } from "./ChartEmptyState";
import { format } from "date-fns";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  content?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  ERROR: "#ef4444",
  WARN: "#f59e0b",
  WARNING: "#f59e0b",
  INFO: "var(--text-primary)",
  DEBUG: "var(--text-muted)",
  TRACE: "rgba(255,255,255,0.35)",
};

function inferSeverity(value: number | null): string {
  if (value == null) return "INFO";
  if (value >= 500) return "ERROR";
  if (value >= 300) return "WARN";
  if (value >= 100) return "INFO";
  return "DEBUG";
}

export function LogStreamWidget({ data, height = 300, displayOptions, content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const cfg = displayOptions?.logStream;
  const maxLines = cfg?.maxLines ?? 100;
  const showTimestamp = cfg?.showTimestamp ?? true;
  const showSeverity = cfg?.showSeverity ?? true;
  const wrapLines = cfg?.wrapLines ?? false;
  const filterQuery = cfg?.filterQuery ?? content ?? "";

  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} message="No log data" />;
  }

  const lines = series.datapoints
    .filter(([, v]) => {
      if (!filterQuery) return true;
      const sev = inferSeverity(v);
      return sev.toLowerCase().includes(filterQuery.toLowerCase());
    })
    .slice(-maxLines)
    .map(([ts, value]) => {
      const severity = inferSeverity(value);
      const formattedTs = format(new Date(ts), "HH:mm:ss.SSS");
      const message = value != null ? `metric_value=${value}` : "null";
      return { ts: formattedTs, severity, message, color: SEVERITY_COLORS[severity] ?? "var(--text-primary)" };
    });

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines.length]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: "auto",
        background: "var(--bg-primary)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "8px 12px",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 11,
        lineHeight: 1.6,
      }}
    >
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 8,
            whiteSpace: wrapLines ? "pre-wrap" : "nowrap",
            wordBreak: wrapLines ? "break-all" : undefined,
          }}
        >
          {showTimestamp && (
            <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{line.ts}</span>
          )}
          {showSeverity && (
            <span style={{
              color: line.color,
              fontWeight: 600,
              width: 44,
              flexShrink: 0,
              textAlign: "right",
            }}>
              {line.severity}
            </span>
          )}
          <span style={{ color: line.color === "var(--text-primary)" ? "#c9d1d9" : line.color, opacity: line.severity === "DEBUG" ? 0.6 : 1 }}>
            {line.message}
          </span>
        </div>
      ))}
    </div>
  );
}
