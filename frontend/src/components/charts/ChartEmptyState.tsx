import { BarChart3 } from "lucide-react";

interface Props {
  height: number;
  message?: string;
}

export function ChartEmptyState({ height, message = "No data available" }: Props) {
  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--text-muted)",
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-sm, 4px)",
      }}
    >
      <BarChart3 size={18} strokeWidth={1.5} style={{ opacity: 0.5 }} />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}
