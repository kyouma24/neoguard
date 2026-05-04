import { format } from "date-fns";
import type { UnitConfig } from "../../types/display-options";
import { formatValue } from "../../utils/unitFormat";

interface TooltipEntry {
  name: string;
  value: number | null;
  color: string;
}

interface Props {
  active?: boolean;
  label?: string;
  payload?: { dataKey: string; value: number | null; color: string; stroke: string }[];
  unit?: UnitConfig;
  hiddenSeries?: Set<string>;
}

export function ChartTooltip({ active, label, payload, unit, hiddenSeries }: Props) {
  if (!active || !payload?.length || !label) return null;

  const entries: TooltipEntry[] = payload
    .map((p) => ({
      name: String(p.dataKey),
      value: typeof p.value === "number" ? p.value : null,
      color: p.stroke || p.color || "var(--text-muted)",
    }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  return (
    <div
      style={{
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 10px",
        fontSize: 12,
        color: "var(--text-primary)",
        maxWidth: 320,
        maxHeight: 260,
        overflowY: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>
        {format(new Date(label), "yyyy-MM-dd HH:mm:ss")}
      </div>
      {entries.map((entry) => {
        const isHidden = hiddenSeries?.has(entry.name);
        return (
          <div
            key={entry.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 0",
              opacity: isHidden ? 0.3 : 1,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: entry.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text-secondary)",
              }}
            >
              {entry.name}
            </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", marginLeft: 12 }}>
              {entry.value != null ? formatValue(entry.value, unit) : "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
