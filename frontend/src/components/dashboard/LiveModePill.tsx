/**
 * Live-mode indicator pill for dashboards.
 *
 * Shows connection status:
 * - Green "Live" when connected
 * - Yellow "Reconnecting..." when connecting or error (retrying)
 * - Gray "Live" (off) when disconnected and available
 *
 * Click toggles live mode on / off.
 */

import type { ConnectionStatus } from "../../hooks/useLiveStream";

interface LiveModePillProps {
  status: ConnectionStatus;
  isLive: boolean;
  onToggle: () => void;
}

const STATUS_STYLES: Record<
  ConnectionStatus,
  { dotColor: string; bgColor: string; textColor: string; label: string }
> = {
  connected: {
    dotColor: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.12)",
    textColor: "#16a34a",
    label: "Live",
  },
  connecting: {
    dotColor: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.12)",
    textColor: "#a16207",
    label: "Connecting...",
  },
  error: {
    dotColor: "#eab308",
    bgColor: "rgba(234, 179, 8, 0.12)",
    textColor: "#a16207",
    label: "Reconnecting...",
  },
  disconnected: {
    dotColor: "var(--color-neutral-400, #9ca3af)",
    bgColor: "var(--color-neutral-100, #f3f4f6)",
    textColor: "var(--color-neutral-600, #4b5563)",
    label: "Live",
  },
};

export function LiveModePill({ status, isLive, onToggle }: LiveModePillProps) {
  const effectiveStatus = isLive ? status : "disconnected";
  const { dotColor, bgColor, textColor, label } =
    STATUS_STYLES[effectiveStatus];

  return (
    <button
      onClick={onToggle}
      title={isLive ? "Disable live mode" : "Enable live mode"}
      aria-label={isLive ? "Disable live mode" : "Enable live mode"}
      aria-pressed={isLive}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 14,
        border: isLive
          ? `1px solid ${dotColor}`
          : "1px solid var(--border, #e5e7eb)",
        background: bgColor,
        color: textColor,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        lineHeight: 1,
        whiteSpace: "nowrap",
        transition: "all 150ms ease",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          animation:
            effectiveStatus === "connected"
              ? "live-pulse 2s ease-in-out infinite"
              : undefined,
        }}
      />
      {label}
      <style>{`
        @keyframes live-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </button>
  );
}
