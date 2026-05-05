import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { api } from "../services/api";
import type { HistogramBucket } from "../types";

interface LogHistogramProps {
  start: string;
  end: string;
  service?: string;
  severity?: string;
  query?: string;
  onBucketClick?: (timestamp: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  fatal: "var(--color-danger-600)",
  error: "var(--color-danger-400)",
  warn: "var(--color-warning-400)",
  info: "var(--color-primary-400)",
  debug: "var(--color-neutral-400)",
  trace: "var(--color-neutral-300)",
};

export function LogHistogram({ start, end, service, severity, query, onBucketClick }: LogHistogramProps) {
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistogram = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.logs.histogram({ start, end, service, severity, query, buckets: 60 });
      setBuckets(result.buckets);
    } catch {
      setBuckets([]);
    } finally {
      setLoading(false);
    }
  }, [start, end, service, severity, query]);

  useEffect(() => {
    fetchHistogram();
  }, [fetchHistogram]);

  if (loading && buckets.length === 0) {
    return <div style={styles.container}><div style={styles.loading}>Loading histogram...</div></div>;
  }

  if (buckets.length === 0) return null;

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div style={styles.container}>
      <div style={styles.bars}>
        {buckets.map((bucket, i) => {
          const height = Math.max(2, (bucket.count / maxCount) * 100);
          const severities = Object.entries(bucket.severity_counts).sort(
            (a, b) => (SEVERITY_ORDER[a[0]] ?? 5) - (SEVERITY_ORDER[b[0]] ?? 5)
          );

          return (
            <div
              key={i}
              style={styles.barWrapper}
              title={`${format(new Date(bucket.timestamp), "HH:mm")} - ${bucket.count} logs`}
              onClick={() => onBucketClick?.(bucket.timestamp)}
            >
              <div style={{ ...styles.bar, height: `${height}%` }}>
                {severities.map(([sev, count]) => {
                  const segHeight = (count / bucket.count) * 100;
                  return (
                    <div
                      key={sev}
                      style={{
                        height: `${segHeight}%`,
                        background: SEVERITY_COLORS[sev] ?? "var(--color-neutral-300)",
                        minHeight: count > 0 ? 1 : 0,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={styles.xAxis}>
        <span>{format(new Date(start), "HH:mm")}</span>
        <span style={styles.legend}>
          {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
            <span key={sev} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: color }} />
              {sev}
            </span>
          ))}
        </span>
        <span>{format(new Date(end), "HH:mm")}</span>
      </div>
    </div>
  );
}

const SEVERITY_ORDER: Record<string, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-secondary)",
    padding: "12px 16px",
  },
  loading: {
    textAlign: "center",
    padding: 16,
    color: "var(--text-muted)",
    fontSize: 12,
  },
  bars: {
    display: "flex",
    alignItems: "flex-end",
    gap: 1,
    height: 80,
  },
  barWrapper: {
    flex: 1,
    height: "100%",
    display: "flex",
    alignItems: "flex-end",
    cursor: "pointer",
  },
  bar: {
    width: "100%",
    borderRadius: "2px 2px 0 0",
    display: "flex",
    flexDirection: "column-reverse" as const,
    overflow: "hidden",
    transition: "opacity 0.1s",
  },
  xAxis: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    fontSize: 10,
    color: "var(--text-muted)",
  },
  legend: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: 9,
    textTransform: "uppercase" as const,
  },
  legendDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: 2,
  },
};
