import { useState } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";

const OPTIONS: { key: string; label: string; seconds: number | null }[] = [
  { key: "off", label: "Off", seconds: null },
  { key: "10s", label: "10s", seconds: 10 },
  { key: "30s", label: "30s", seconds: 30 },
  { key: "1m", label: "1m", seconds: 60 },
  { key: "5m", label: "5m", seconds: 300 },
];

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export function getRefreshSeconds(key: string): number | null {
  return OPTIONS.find((o) => o.key === key)?.seconds ?? null;
}

export function AutoRefresh({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.key === value) ?? OPTIONS[0];
  const isActive = current.seconds !== null;

  return (
    <div className="auto-refresh" style={{ position: "relative" }}>
      <button
        className="toolbar-btn"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", fontSize: 13,
          background: isActive ? "rgba(99, 91, 255, 0.15)" : "var(--bg-tertiary)",
          border: `1px solid ${isActive ? "var(--primary)" : "var(--border)"}`,
          borderRadius: "var(--radius-sm)",
          color: isActive ? "var(--primary)" : "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        <RefreshCw size={14} />
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
              minWidth: 100, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "8px 14px", fontSize: 13, border: "none",
                  background: o.key === value ? "var(--primary)" : "transparent",
                  color: o.key === value ? "#fff" : "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
