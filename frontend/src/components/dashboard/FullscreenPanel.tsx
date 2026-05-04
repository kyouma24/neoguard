import { useEffect, useState } from "react";
import { X, Maximize2 } from "lucide-react";
import type { PanelDefinition } from "../../types";
import { WidgetRenderer } from "./WidgetRenderer";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

interface Props {
  panel: PanelDefinition;
  from: Date;
  to: Date;
  interval: string;
  refreshKey?: number;
  variables?: Record<string, string>;
  onClose: () => void;
}

export function FullscreenPanel({ panel, from, to, interval, refreshKey, variables, onClose }: Props) {
  const [height, setHeight] = useState(window.innerHeight - 80);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight - 80);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Maximize2 size={16} color="var(--text-muted)" />
          <span style={{ fontSize: 16, fontWeight: 600 }}>{panel.title}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close fullscreen"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-primary)",
            padding: 8,
            borderRadius: "var(--radius-sm)",
          }}
        >
          <X size={20} />
        </button>
      </div>
      <div style={{ flex: 1, padding: 20 }}>
        <WidgetErrorBoundary title={panel.title} height={height} resetKey={refreshKey}>
          <WidgetRenderer
            panel={panel}
            from={from}
            to={to}
            interval={interval}
            height={height}
            refreshKey={refreshKey}
            variables={variables}
          />
        </WidgetErrorBoundary>
      </div>
    </div>
  );
}
