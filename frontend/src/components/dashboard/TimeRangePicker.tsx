import { useState } from "react";
import { Clock, ChevronDown } from "lucide-react";

export interface TimeRange {
  label: string;
  from: Date;
  to: Date;
  key: string;
}

const PRESETS: { key: string; label: string; minutes: number }[] = [
  { key: "5m", label: "Last 5 min", minutes: 5 },
  { key: "15m", label: "Last 15 min", minutes: 15 },
  { key: "1h", label: "Last 1 hour", minutes: 60 },
  { key: "4h", label: "Last 4 hours", minutes: 240 },
  { key: "24h", label: "Last 24 hours", minutes: 1440 },
  { key: "7d", label: "Last 7 days", minutes: 10080 },
  { key: "30d", label: "Last 30 days", minutes: 43200 },
];

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export function getTimeRange(key: string): TimeRange {
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[2];
  const to = new Date();
  const from = new Date(to.getTime() - preset.minutes * 60 * 1000);
  return { label: preset.label, from, to, key: preset.key };
}

export function getIntervalForRange(key: string): string {
  switch (key) {
    case "5m": return "10s";
    case "15m": return "30s";
    case "1h": return "1m";
    case "4h": return "5m";
    case "24h": return "15m";
    case "7d": return "1h";
    case "30d": return "6h";
    default: return "1m";
  }
}

export function TimeRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = PRESETS.find((p) => p.key === value) ?? PRESETS[2];

  return (
    <div className="time-range-picker" style={{ position: "relative" }}>
      <button
        className="toolbar-btn"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", fontSize: 13,
          background: "var(--bg-tertiary)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        <Clock size={14} />
        {current.label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", zIndex: 100,
              minWidth: 160, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => { onChange(p.key); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 14px", fontSize: 13, border: "none",
                  background: p.key === value ? "var(--primary)" : "transparent",
                  color: p.key === value ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
