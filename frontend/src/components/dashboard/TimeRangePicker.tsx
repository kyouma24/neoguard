import { useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { format } from "date-fns";

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
  { key: "12h", label: "Last 12 hours", minutes: 720 },
  { key: "24h", label: "Last 24 hours", minutes: 1440 },
  { key: "3d", label: "Last 3 days", minutes: 4320 },
  { key: "7d", label: "Last 7 days", minutes: 10080 },
  { key: "30d", label: "Last 30 days", minutes: 43200 },
  { key: "90d", label: "Last 90 days", minutes: 129600 },
];

interface Props {
  value: string;
  onChange: (key: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomRange?: (from: string, to: string) => void;
}

export function getTimeRange(key: string, customFrom?: string, customTo?: string): TimeRange {
  if (key === "custom" && customFrom && customTo) {
    return {
      label: `${format(new Date(customFrom), "MMM d HH:mm")} – ${format(new Date(customTo), "MMM d HH:mm")}`,
      from: new Date(customFrom),
      to: new Date(customTo),
      key: "custom",
    };
  }
  const preset = PRESETS.find((p) => p.key === key) ?? PRESETS[2];
  const to = new Date();
  const from = new Date(to.getTime() - preset.minutes * 60 * 1000);
  return { label: preset.label, from, to, key: preset.key };
}

export function getIntervalForRange(key: string, customFrom?: string, customTo?: string): string {
  if (key === "custom" && customFrom && customTo) {
    const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime();
    const diffMin = diffMs / 60_000;
    if (diffMin <= 15) return "10s";
    if (diffMin <= 60) return "30s";
    if (diffMin <= 240) return "1m";
    if (diffMin <= 1440) return "5m";
    if (diffMin <= 10080) return "1h";
    return "6h";
  }
  switch (key) {
    case "5m": return "10s";
    case "15m": return "30s";
    case "1h": return "1m";
    case "4h": return "5m";
    case "12h": return "15m";
    case "24h": return "15m";
    case "3d": return "1h";
    case "7d": return "1h";
    case "30d": return "6h";
    case "90d": return "1d";
    default: return "1m";
  }
}

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeRangePicker({ value, onChange, customFrom, customTo, onCustomRange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [fromInput, setFromInput] = useState(() => {
    if (customFrom) return customFrom;
    const d = new Date();
    d.setHours(d.getHours() - 1);
    return toLocalDatetime(d);
  });
  const [toInput, setToInput] = useState(() => customTo ?? toLocalDatetime(new Date()));

  const isCustom = value === "custom";
  const current = isCustom
    ? { label: customFrom && customTo ? `${format(new Date(customFrom), "MMM d HH:mm")} – ${format(new Date(customTo), "MMM d HH:mm")}` : "Custom" }
    : (PRESETS.find((p) => p.key === value) ?? PRESETS[2]);

  const handleApplyCustom = () => {
    if (onCustomRange && fromInput && toInput) {
      onCustomRange(new Date(fromInput).toISOString(), new Date(toInput).toISOString());
      onChange("custom");
      setShowCustom(false);
      setOpen(false);
    }
  };

  return (
    <div className="time-range-picker" style={{ position: "relative" }}>
      <button
        className="toolbar-btn"
        onClick={() => setOpen(!open)}
        aria-label="Select time range"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", fontSize: 13,
          background: "var(--bg-tertiary)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
          cursor: "pointer", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        <Clock size={14} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{current.label}</span>
        <ChevronDown size={14} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => { setOpen(false); setShowCustom(false); }} />
          <div
            style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)", zIndex: 100,
              minWidth: showCustom ? 300 : 160, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {!showCustom ? (
              <>
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
                {onCustomRange && (
                  <>
                    <div style={{ borderTop: "1px solid var(--border)" }} />
                    <button
                      onClick={() => setShowCustom(true)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 14px", fontSize: 13, border: "none",
                        background: isCustom ? "var(--primary)" : "transparent",
                        color: isCustom ? "#fff" : "var(--color-primary-500)",
                        cursor: "pointer", fontWeight: 500,
                      }}
                    >
                      Custom range...
                    </button>
                  </>
                )}
              </>
            ) : (
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Custom Date Range</div>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  From
                  <input
                    type="datetime-local"
                    value={fromInput}
                    onChange={(e) => setFromInput(e.target.value)}
                    style={{
                      display: "block", width: "100%", marginTop: 4,
                      padding: "6px 8px", fontSize: 12,
                      background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
                    }}
                  />
                </label>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  To
                  <input
                    type="datetime-local"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    style={{
                      display: "block", width: "100%", marginTop: 4,
                      padding: "6px 8px", fontSize: 12,
                      background: "var(--bg-tertiary)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", color: "var(--text-primary)",
                    }}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setShowCustom(false)}
                    aria-label="Back to presets"
                    style={{ padding: "6px 14px", fontSize: 12, background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleApplyCustom}
                    aria-label="Apply custom time range"
                    style={{ padding: "6px 14px", fontSize: 12, background: "var(--primary)", border: "none", borderRadius: "var(--radius-sm)", color: "#fff", cursor: "pointer", fontWeight: 600 }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
