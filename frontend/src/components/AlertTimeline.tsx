import { format, differenceInMinutes } from "date-fns";
import type { AlertEvent } from "../types";

interface AlertTimelineProps {
  events: AlertEvent[];
  hoursBack?: number;
}

export function AlertTimeline({ events, hoursBack = 24 }: AlertTimelineProps) {
  if (events.length === 0) return null;

  const now = new Date();
  const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const totalMinutes = hoursBack * 60;

  const relevantEvents = events.filter((e) => {
    const firedAt = new Date(e.fired_at);
    return firedAt >= start;
  });

  if (relevantEvents.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Alert Timeline ({hoursBack}h)</span>
        <span style={styles.legend}>
          <span style={styles.legendItem}><span style={{ ...styles.dot, background: "var(--color-danger-400)" }} /> Firing</span>
          <span style={styles.legendItem}><span style={{ ...styles.dot, background: "var(--color-success-400)" }} /> Resolved</span>
        </span>
      </div>
      <div style={styles.track}>
        {relevantEvents.map((event) => {
          const firedAt = new Date(event.fired_at);
          const resolvedAt = event.resolved_at ? new Date(event.resolved_at) : now;
          const startPct = Math.max(0, (differenceInMinutes(firedAt, start) / totalMinutes) * 100);
          const endPct = Math.min(100, (differenceInMinutes(resolvedAt, start) / totalMinutes) * 100);
          const widthPct = Math.max(0.5, endPct - startPct);
          const isFiring = event.status === "firing";

          return (
            <div
              key={event.id}
              title={`${event.rule_name || event.message}\n${format(firedAt, "HH:mm")} - ${event.resolved_at ? format(resolvedAt, "HH:mm") : "ongoing"}`}
              style={{
                ...styles.segment,
                left: `${startPct}%`,
                width: `${widthPct}%`,
                background: isFiring ? "var(--color-danger-400)" : "var(--color-success-400)",
                opacity: isFiring ? 1 : 0.6,
              }}
            />
          );
        })}
      </div>
      <div style={styles.xAxis}>
        <span>{format(start, "HH:mm")}</span>
        <span>{format(new Date(start.getTime() + totalMinutes * 30 * 1000), "HH:mm")}</span>
        <span>{format(now, "HH:mm")}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-secondary)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  legend: {
    display: "flex",
    gap: 12,
    fontSize: 10,
    color: "var(--text-muted)",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  track: {
    position: "relative" as const,
    height: 24,
    background: "var(--bg-tertiary)",
    borderRadius: 4,
    overflow: "hidden",
  },
  segment: {
    position: "absolute" as const,
    top: 4,
    height: 16,
    borderRadius: 3,
    minWidth: 3,
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  xAxis: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 4,
    fontSize: 9,
    color: "var(--text-muted)",
    fontFamily: "var(--typography-font-family-mono)",
  },
};
