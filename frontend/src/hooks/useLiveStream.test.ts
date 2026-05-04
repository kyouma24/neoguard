import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useLiveStream } from "./useLiveStream";
import type { SSEMessage } from "./useLiveStream";

// ---- EventSource mock ----

type EventSourceListener = (event: MessageEvent | Event) => void;

interface MockEventSource {
  url: string;
  withCredentials: boolean;
  onopen: EventSourceListener | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: EventSourceListener | null;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

let mockEventSources: MockEventSource[] = [];

class FakeEventSource implements MockEventSource {
  url: string;
  withCredentials: boolean;
  onopen: EventSourceListener | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: EventSourceListener | null = null;
  close = vi.fn();
  readyState = 0; // CONNECTING

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    mockEventSources.push(this);
  }
}

// ---- Setup / teardown ----

beforeEach(() => {
  mockEventSources = [];
  vi.useFakeTimers();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).EventSource = FakeEventSource;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).EventSource;
});

// ---- Helpers ----

function lastES(): MockEventSource {
  return mockEventSources[mockEventSources.length - 1];
}

function fireOpen() {
  const es = lastES();
  if (es.onopen) es.onopen(new Event("open"));
}

function fireMessage(data: SSEMessage) {
  const es = lastES();
  if (es.onmessage) {
    es.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

function fireError() {
  const es = lastES();
  if (es.onerror) es.onerror(new Event("error"));
}

// ---- Tests ----

describe("useLiveStream", () => {
  it("creates EventSource when enabled", () => {
    renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    expect(mockEventSources.length).toBe(1);
    expect(lastES().url).toContain("/api/v1/query/stream");
    expect(lastES().url).toContain("dashboard_id=dash-1");
    expect(lastES().withCredentials).toBe(true);
  });

  it("does not create EventSource when disabled", () => {
    renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: false }),
    );

    expect(mockEventSources.length).toBe(0);
  });

  it("does not create EventSource when dashboardId is empty", () => {
    renderHook(() =>
      useLiveStream({ dashboardId: "", enabled: true }),
    );

    expect(mockEventSources.length).toBe(0);
  });

  it("closes EventSource on cleanup", () => {
    const { unmount } = renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );
    const es = lastES();

    unmount();

    expect(es.close).toHaveBeenCalled();
  });

  it("transitions status: disconnected -> connecting -> connected", () => {
    const { result } = renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    // After initial render, before open event fires
    expect(result.current.status).toBe("connecting");

    // Simulate server sending open
    act(() => fireOpen());
    expect(result.current.status).toBe("connected");
  });

  it("calls onMessage callback with parsed data", () => {
    const onMessage = vi.fn();
    renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true, onMessage }),
    );

    act(() => fireOpen());
    act(() => fireMessage({ type: "heartbeat", ts: 1000 }));

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "heartbeat", ts: 1000 }),
    );
  });

  it("closes and reconnects on server 'close' message", () => {
    renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    act(() => fireOpen());
    const firstES = lastES();

    act(() => fireMessage({ type: "close", reason: "max_duration" }));
    expect(firstES.close).toHaveBeenCalled();

    // Advance past the reconnect delay
    act(() => vi.advanceTimersByTime(1500));
    expect(mockEventSources.length).toBe(2);
  });

  it("transitions to error and retries with exponential backoff", () => {
    const { result } = renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    // First error -> retry after 1s (3^0 * 1000)
    act(() => fireError());
    expect(result.current.status).toBe("error");
    expect(mockEventSources.length).toBe(1);

    act(() => vi.advanceTimersByTime(1000));
    expect(mockEventSources.length).toBe(2);

    // Second error -> retry after 3s (3^1 * 1000)
    act(() => fireError());
    act(() => vi.advanceTimersByTime(2000));
    expect(mockEventSources.length).toBe(2); // not yet
    act(() => vi.advanceTimersByTime(1000));
    expect(mockEventSources.length).toBe(3);

    // Third error -> retry after 9s (3^2 * 1000)
    act(() => fireError());
    act(() => vi.advanceTimersByTime(9000));
    expect(mockEventSources.length).toBe(4);

    // Fourth error -> max retries exceeded, stays disconnected
    act(() => fireError());
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.status).toBe("disconnected");
    // No additional EventSource created
    expect(mockEventSources.length).toBe(4);
  });

  it("pauses on document.hidden and resumes on visibility", () => {
    const { result } = renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    act(() => fireOpen());
    expect(result.current.status).toBe("connected");

    const firstES = lastES();

    // Simulate tab becoming hidden
    Object.defineProperty(document, "hidden", { value: true, writable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(firstES.close).toHaveBeenCalled();
    expect(result.current.status).toBe("disconnected");

    // Simulate tab becoming visible
    Object.defineProperty(document, "hidden", { value: false, writable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(mockEventSources.length).toBe(2);
  });

  it("resets retry counter when connected successfully", () => {
    const { result } = renderHook(() =>
      useLiveStream({ dashboardId: "dash-1", enabled: true }),
    );

    // First error
    act(() => fireError());
    act(() => vi.advanceTimersByTime(1000));
    expect(mockEventSources.length).toBe(2);

    // Now connect successfully — this resets retries
    act(() => fireOpen());
    expect(result.current.status).toBe("connected");

    // Next error should start retry from 0 (1s delay again, not 3s)
    act(() => fireError());
    act(() => vi.advanceTimersByTime(1000));
    expect(mockEventSources.length).toBe(3);
  });

  it("closes old EventSource when re-enabled", () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLiveStream({ dashboardId: "dash-1", enabled }),
      { initialProps: { enabled: true } },
    );

    const firstES = lastES();
    act(() => fireOpen());

    // Disable
    rerender({ enabled: false });
    expect(firstES.close).toHaveBeenCalled();

    // Re-enable
    rerender({ enabled: true });
    expect(mockEventSources.length).toBe(2);
  });

  it("encodes dashboard_id in URL", () => {
    renderHook(() =>
      useLiveStream({ dashboardId: "dash with spaces", enabled: true }),
    );

    expect(lastES().url).toContain("dashboard_id=dash%20with%20spaces");
  });
});
