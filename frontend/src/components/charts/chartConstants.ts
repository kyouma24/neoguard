import type { CSSProperties } from "react";

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-primary)",
  fontSize: 12,
};

export const CHART_EMPTY_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
  fontSize: 13,
};
