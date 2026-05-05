import { Keyboard, X } from "lucide-react";
import { Button } from "../../design-system";

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "?", description: "Show keyboard shortcuts" },
  { key: "R", description: "Refresh dashboard" },
  { key: "E", description: "Edit dashboard" },
  { key: "F", description: "Toggle kiosk mode" },
  { key: "Escape", description: "Go back / close" },
  { key: "Ctrl+Click", description: "Add annotation on chart" },
  { key: "Ctrl+Click legend", description: "Isolate series" },
  { key: "Drag", description: "Zoom into time range" },
];

export function KeyboardShortcutOverlay({ onClose }: Props) {
  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 500 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 501,
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          width: 380,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Keyboard size={18} color="var(--color-primary-500)" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Keyboard Shortcuts</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
        <div style={{ padding: "12px 20px" }}>
          {SHORTCUTS.map((s) => (
            <div
              key={s.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: "1px solid var(--border-light, rgba(255,255,255,0.04))",
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.description}</span>
              <kbd
                style={{
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  minWidth: 28,
                  textAlign: "center",
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
