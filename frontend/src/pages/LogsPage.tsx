import { useState, useCallback, useRef, useEffect } from "react";
import { format, formatDistanceToNow, subMinutes, subHours, subDays } from "date-fns";
import { Search, Play, Pause, Download, X, BarChart3, List } from "lucide-react";
import { useURLState } from "../hooks/useURLState";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import {
  Button,
  Card,
  Input,
  NativeSelect,
  PageHeader,
  EmptyState,
  StatusBadge,
} from "../design-system";
import { LogDetailDrawer } from "../components/LogDetailDrawer";
import { LogHistogram } from "../components/LogHistogram";
import { LogFacetsSidebar } from "../components/LogFacetsSidebar";
import type { LogEntry } from "../types";

const SEVERITIES = [
  { value: "", label: "All levels" },
  { value: "trace", label: "TRACE" },
  { value: "debug", label: "DEBUG" },
  { value: "info", label: "INFO" },
  { value: "warn", label: "WARN" },
  { value: "error", label: "ERROR" },
  { value: "fatal", label: "FATAL" },
];

const TIME_RANGES = [
  { value: "5m", label: "Last 5m", ms: 5 * 60_000 },
  { value: "15m", label: "Last 15m", ms: 15 * 60_000 },
  { value: "1h", label: "Last 1h", ms: 60 * 60_000 },
  { value: "6h", label: "Last 6h", ms: 6 * 60 * 60_000 },
  { value: "24h", label: "Last 24h", ms: 24 * 60 * 60_000 },
  { value: "7d", label: "Last 7d", ms: 7 * 24 * 60 * 60_000 },
];

const SEVERITY_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

function getTimeStart(rangeValue: string): Date {
  const range = TIME_RANGES.find((r) => r.value === rangeValue);
  if (!range) return subHours(new Date(), 1);
  const now = new Date();
  if (range.ms < 60 * 60_000) return subMinutes(now, range.ms / 60_000);
  if (range.ms < 24 * 60 * 60_000) return subHours(now, range.ms / (60 * 60_000));
  return subDays(now, range.ms / (24 * 60 * 60_000));
}

export function LogsPage() {
  const [range, setRange] = useURLState("range", "1h");
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const [showHistogram, setShowHistogram] = useState(true);
  const [showFacets, setShowFacets] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ key: string; value: string; exclude?: boolean }[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);
  const offsetRef = useRef(0);

  const fetchLogs = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    loadingMore.current = true;

    const start = getTimeStart(range);
    const effectiveSeverity = severity || activeFilters.find((f) => f.key === "severity")?.value || undefined;
    const effectiveService = service || activeFilters.find((f) => f.key === "service")?.value || undefined;

    try {
      const result = await api.logs.query({
        query: query || undefined,
        service: effectiveService || undefined,
        severity: effectiveSeverity as LogEntry["severity"] | undefined,
        start: start.toISOString(),
        end: new Date().toISOString(),
        limit: 100,
        offset: append ? offsetRef.current : 0,
      });
      if (append) {
        setLogs((prev) => [...prev, ...result.logs]);
      } else {
        setLogs(result.logs);
        offsetRef.current = 0;
      }
      offsetRef.current += result.logs.length;
      setTotal(result.total);
      setHasMore(result.has_more);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      loadingMore.current = false;
    }
  }, [range, query, service, severity, activeFilters]);

  useEffect(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Live mode polling
  useInterval(
    () => { if (liveMode) fetchLogs(false); },
    liveMode ? 3000 : null,
  );

  const handleSearch = () => {
    offsetRef.current = 0;
    fetchLogs(false);
  };

  const handleScroll = () => {
    if (!scrollRef.current || loadingMore.current || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      fetchLogs(true);
    }
  };

  const addFilter = (key: string, value: string, exclude = false) => {
    setActiveFilters((prev) => {
      const exists = prev.find((f) => f.key === key && f.value === value);
      if (exists) return prev;
      return [...prev, { key, value, exclude }];
    });
  };

  const removeFilter = (index: number) => {
    setActiveFilters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExport = () => {
    const csvHeader = "timestamp,severity,service,message,trace_id,span_id\n";
    const csvRows = logs.map((l) =>
      `"${l.timestamp}","${l.severity}","${l.service}","${l.message.replace(/"/g, '""')}","${l.trace_id}","${l.span_id}"`
    ).join("\n");
    const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Log Explorer"
        subtitle={total > 0 ? `${total.toLocaleString()} results` : undefined}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Button
              variant={showHistogram ? "primary" : "ghost"}
              size="sm"
              onClick={() => setShowHistogram((v) => !v)}
              title="Toggle histogram"
            >
              <BarChart3 size={14} />
            </Button>
            <Button
              variant={showFacets ? "primary" : "ghost"}
              size="sm"
              onClick={() => setShowFacets((v) => !v)}
              title="Toggle facets sidebar"
            >
              <List size={14} />
            </Button>
            <Button
              variant={liveMode ? "primary" : "ghost"}
              size="sm"
              onClick={() => setLiveMode((v) => !v)}
              title={liveMode ? "Pause live tail" : "Start live tail"}
            >
              {liveMode ? <Pause size={14} /> : <Play size={14} />}
              {liveMode ? "Live" : "Tail"}
              {liveMode && <span style={styles.liveDot} />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport} title="Export CSV">
              <Download size={14} />
            </Button>
          </div>
        }
      />

      {/* Time Range Bar */}
      <div style={styles.timeBar}>
        {TIME_RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            style={{
              ...styles.timeBtn,
              ...(range === r.value ? styles.timeBtnActive : {}),
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <Card variant="bordered" padding="sm">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="Search logs... (supports AND, OR, NOT, field:value)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div style={{ width: 160 }}>
            <Input
              placeholder="Service..."
              value={service}
              onChange={(e) => setService(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div style={{ width: 130 }}>
            <NativeSelect
              options={SEVERITIES}
              value={severity}
              onChange={(v) => { setSeverity(v); }}
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleSearch}>
            <Search size={14} /> Search
          </Button>
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <div style={styles.filterChips}>
            {activeFilters.map((f, i) => (
              <span key={i} style={{ ...styles.chip, ...(f.exclude ? styles.chipExclude : {}) }}>
                {f.exclude ? "NOT " : ""}{f.key}:{f.value}
                <button style={styles.chipClose} onClick={() => removeFilter(i)}>
                  <X size={10} />
                </button>
              </span>
            ))}
            <button style={styles.clearAll} onClick={() => setActiveFilters([])}>Clear all</button>
          </div>
        )}
      </Card>

      {/* Histogram */}
      {showHistogram && (
        <div style={{ marginTop: 8 }}>
          <LogHistogram
            start={getTimeStart(range).toISOString()}
            end={new Date().toISOString()}
            service={service || undefined}
            severity={severity || undefined}
            query={query || undefined}
          />
        </div>
      )}

      {/* Log List + Facets */}
      <div style={{ marginTop: 8, flex: 1, minHeight: 0, display: "flex", gap: 0 }}>
        {showFacets && (
          <LogFacetsSidebar
            start={getTimeStart(range).toISOString()}
            end={new Date().toISOString()}
            query={query || undefined}
            service={service || undefined}
            severity={severity || undefined}
            onFilterAdd={addFilter}
          />
        )}
        <div style={{ ...styles.logContainer, borderRadius: showFacets ? "0 8px 8px 0" : 8 }}>
          {/* Column headers */}
          <div style={styles.headerRow}>
            <span style={{ width: 160 }}>Timestamp</span>
            <span style={{ width: 70 }}>Level</span>
            <span style={{ width: 140 }}>Service</span>
            <span style={{ flex: 1 }}>Message</span>
          </div>

          {/* Scrollable log rows */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={styles.scrollContainer}
          >
            {loading && logs.length === 0 && (
              <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                Loading logs...
              </div>
            )}

            {!loading && logs.length === 0 && (
              <EmptyState title="No logs found" description="Try adjusting your search filters or time range." />
            )}

            {logs.map((log, i) => (
              <div
                key={`${log.timestamp}-${i}`}
                onClick={() => setSelectedLog(log)}
                style={styles.logRow}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-tertiary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={styles.colTimestamp}>
                  <span>{format(new Date(log.timestamp), "MM-dd HH:mm:ss.SSS")}</span>
                  <span style={styles.relTime}>
                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                  </span>
                </span>
                <span style={{ flexShrink: 0, width: 70 }}>
                  <StatusBadge label={log.severity.toUpperCase()} tone={SEVERITY_TONE[log.severity] ?? "neutral"} />
                </span>
                <span
                  style={styles.colService}
                  onClick={(e) => { e.stopPropagation(); addFilter("service", log.service); }}
                  title="Click to filter by this service"
                >
                  {log.service}
                </span>
                <span style={styles.colMessage}>
                  {log.message.length > 200 ? log.message.slice(0, 200) + "..." : log.message}
                </span>
              </div>
            ))}

            {loadingMore.current && hasMore && (
              <div style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
                Loading more...
              </div>
            )}

            {!hasMore && logs.length > 0 && (
              <div style={{ textAlign: "center", padding: 12, color: "var(--text-muted)", fontSize: 12 }}>
                End of results ({total.toLocaleString()} total)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  logContainer: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-secondary)",
    overflow: "hidden",
  },
  timeBar: {
    display: "flex",
    gap: 4,
    padding: "8px 0",
  },
  timeBtn: {
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  timeBtnActive: {
    background: "var(--accent)",
    borderColor: "var(--accent)",
    color: "var(--text-on-accent)",
  },
  filterChips: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
    marginTop: 8,
    alignItems: "center",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontFamily: "var(--typography-font-family-mono)",
    background: "var(--color-primary-50)",
    border: "1px solid var(--color-primary-200)",
    borderRadius: 4,
    color: "var(--color-primary-500)",
  },
  chipExclude: {
    background: "var(--color-danger-50)",
    borderColor: "var(--color-danger-200)",
    color: "var(--color-danger-500)",
  },
  chipClose: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "inherit",
    padding: 0,
    display: "flex",
  },
  clearAll: {
    background: "none",
    border: "none",
    fontSize: 11,
    color: "var(--text-muted)",
    cursor: "pointer",
    textDecoration: "underline",
  },
  headerRow: {
    display: "flex",
    gap: 12,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    flexShrink: 0,
  },
  scrollContainer: {
    flex: 1,
    overflow: "auto",
    fontFamily: "var(--typography-font-family-mono)",
    fontSize: "var(--typography-font-size-xs)",
  },
  logRow: {
    display: "flex",
    gap: 12,
    padding: "6px 12px",
    borderBottom: "1px solid var(--border-subtle)",
    alignItems: "flex-start",
    cursor: "pointer",
    transition: "background 0.1s",
  },
  colTimestamp: {
    flexShrink: 0,
    width: 160,
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
    color: "var(--text-secondary)",
  },
  relTime: {
    fontSize: 10,
    color: "var(--text-muted)",
  },
  colService: {
    flexShrink: 0,
    width: 140,
    color: "var(--color-primary-500)",
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationColor: "transparent",
    transition: "text-decoration-color 0.15s",
  },
  colMessage: {
    flex: 1,
    wordBreak: "break-all" as const,
    whiteSpace: "pre-wrap" as const,
    color: "var(--text-primary)",
  },
  liveDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#22c55e",
    animation: "pulse 1.5s infinite",
  },
};
