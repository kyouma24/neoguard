import type { ReactNode, CSSProperties } from "react";

interface Props {
  children: ReactNode;
  visible?: boolean;
}

export function ReadOnlyTooltip({ children, visible = true }: Props) {
  if (!visible) return <>{children}</>;

  return (
    <div style={styles.wrapper} title="Read-only — contact your admin to make changes">
      <div style={styles.dimmed}>{children}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    position: "relative",
    cursor: "not-allowed",
  },
  dimmed: {
    opacity: 0.45,
    pointerEvents: "none",
  },
};
