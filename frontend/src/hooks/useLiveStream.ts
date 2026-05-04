/**
 * SSE live-stream hook for dashboard real-time updates.
 *
 * Implements spec 02-dashboards-technical.md Part F:
 * - One EventSource per dashboard
 * - Heartbeat every 15 s (server side)
 * - Auto-close at 30 min, auto-reconnect
 * - Pause on tab hidden, resume on visibility change
 * - Exponential back-off on error (1 s, 3 s, 9 s)
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface SSEMessage {
  type: "connected" | "heartbeat" | "points" | "error" | "close";
  dashboard_id?: string;
  reason?: string;
  ts?: number;
  [key: string]: unknown;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface LiveStreamOptions {
  dashboardId: string;
  enabled: boolean;
  onMessage?: (data: SSEMessage) => void;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_BASE = 3;

export function useLiveStream({
  dashboardId,
  enabled,
  onMessage,
}: LiveStreamOptions): { status: ConnectionStatus } {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref for onMessage — prevents reconnection churn when the caller
  // passes an inline callback that creates a new reference every render.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !dashboardId) return;

    // Clean up any previous connection
    cleanup();

    setStatus("connecting");

    const url = `/api/v1/query/stream?dashboard_id=${encodeURIComponent(dashboardId)}`;
    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      retriesRef.current = 0;
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SSEMessage;
        onMessageRef.current?.(data);

        if (data.type === "close") {
          es.close();
          eventSourceRef.current = null;
          // Auto-reconnect after server-initiated close (30 min max duration)
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, BASE_DELAY_MS);
        }
      } catch {
        // Ignore parse errors for malformed data
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStatus("error");

      if (retriesRef.current < MAX_RETRIES) {
        const delay =
          Math.pow(BACKOFF_BASE, retriesRef.current) * BASE_DELAY_MS;
        retriesRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, delay);
      } else {
        setStatus("disconnected");
      }
    };
  }, [dashboardId, enabled, cleanup]);

  // Connect / disconnect when enabled changes
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
      setStatus("disconnected");
    }

    return () => {
      cleanup();
    };
  }, [enabled, connect, cleanup]);

  // Pause on tab hidden, resume on visible
  useEffect(() => {
    if (!enabled) return;

    const handleVisibility = () => {
      if (document.hidden) {
        cleanup();
        setStatus("disconnected");
      } else {
        retriesRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled, connect, cleanup]);

  return { status };
}
