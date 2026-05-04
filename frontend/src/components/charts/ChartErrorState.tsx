interface Props {
  height: number;
  error: string;
  onRetry?: () => void;
}

export function ChartErrorState({ height, error, onRetry }: Props) {
  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div
        title={error}
        style={{
          color: "var(--danger)",
          fontSize: 12,
          lineHeight: 1.4,
          maxWidth: "90%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {error}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            background: "none",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius-sm, 4px)",
            color: "var(--danger)",
            fontSize: 11,
            padding: "4px 12px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
