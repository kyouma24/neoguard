import { ReferenceArea } from "recharts";
import type { AlertEvent } from "../../types";

interface Props {
  alertEvents: AlertEvent[];
  yMin: number;
  yMax: number;
}

const STATE_COLORS: Record<string, string> = {
  firing: "#ef4444",
  pending: "#f59e0b",
  resolved: "#10b981",
  ok: "#10b981",
  nodata: "#6b7280",
};

export function AlertStateOverlay({ alertEvents, yMin, yMax }: Props) {
  if (!alertEvents.length) return null;

  const bandHeight = (yMax - yMin) * 0.03;
  const bandBottom = yMin;
  const bandTop = yMin + bandHeight;

  return (
    <>
      {alertEvents.map((event) => {
        const color = STATE_COLORS[event.status] ?? STATE_COLORS.ok;
        const start = event.fired_at;
        const end = event.resolved_at ?? new Date().toISOString();

        return (
          <ReferenceArea
            key={`alert-${event.id}`}
            x1={start}
            x2={end}
            y1={bandBottom}
            y2={bandTop}
            fill={color}
            fillOpacity={0.5}
            strokeOpacity={0}
            ifOverflow="extendDomain"
          />
        );
      })}
    </>
  );
}
