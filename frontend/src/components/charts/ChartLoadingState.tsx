interface Props {
  height: number;
}

export function ChartLoadingState({ height }: Props) {
  const barCount = 5;
  const barHeights = [40, 65, 50, 80, 55];

  return (
    <div
      className="chart-loading-state"
      style={{
        height,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: "12%",
        padding: "20% 15%",
      }}
    >
      {barHeights.slice(0, barCount).map((h, i) => (
        <div
          key={i}
          className="skeleton-shimmer"
          style={{
            width: "10%",
            height: `${h}%`,
            borderRadius: "3px 3px 0 0",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
