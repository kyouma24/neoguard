interface Props {
  height: number;
  title?: string;
}

export function PanelPlaceholder({ height, title }: Props) {
  return (
    <div
      style={{
        height,
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md, 8px)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Mimic panel header */}
      <div
        style={{
          height: 36,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            height: 10,
            width: title ? Math.min(title.length * 6, 120) : 80,
            borderRadius: 4,
            background: "var(--bg-tertiary)",
            animation: "shimmer 1.5s infinite ease-in-out",
          }}
        />
      </div>
      {/* Skeleton body */}
      <div
        style={{
          flex: 1,
          padding: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "80%",
            height: "60%",
            borderRadius: 6,
            background: "var(--bg-tertiary)",
            animation: "shimmer 1.5s infinite ease-in-out",
            animationDelay: "0.3s",
          }}
        />
      </div>
    </div>
  );
}
