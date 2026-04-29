import { useState } from "react";
import { format } from "date-fns";
import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import type { LogQueryResult } from "../types";

const SEVERITIES = ["", "trace", "debug", "info", "warn", "error", "fatal"];

export function LogsPage() {
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);

  const { data, loading, refetch } = useApi<LogQueryResult>(
    () =>
      api.logs.query({
        query: query || undefined,
        service: service || undefined,
        severity: severity || undefined,
        limit,
        offset,
      }),
    [query, service, severity, limit, offset]
  );

  const handleSearch = () => {
    setOffset(0);
    refetch();
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Log Explorer</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={{ flex: 1 }}
          />
          <input
            className="input"
            placeholder="Service..."
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{ width: 180 }}
          />
          <select
            className="select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="">All levels</option>
            {SEVERITIES.filter(Boolean).map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleSearch}>
            Search
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <span>
            {data ? `${data.total} results` : "Loading..."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              Prev
            </button>
            <button
              className="btn"
              disabled={!data?.has_more}
              onClick={() => setOffset(offset + limit)}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              Next
            </button>
          </div>
        </div>

        {loading && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}

        <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 12 }}>
          {data?.logs.map((log, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                padding: "6px 20px",
                borderBottom: "1px solid var(--border)",
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: "var(--text-muted)", flexShrink: 0, width: 150 }}>
                {format(new Date(log.timestamp), "MM-dd HH:mm:ss.SSS")}
              </span>
              <span
                className={`severity-${log.severity}`}
                style={{ flexShrink: 0, width: 50, textTransform: "uppercase", fontWeight: 600 }}
              >
                {log.severity}
              </span>
              <span style={{ flexShrink: 0, width: 140, color: "var(--accent)" }}>
                {log.service}
              </span>
              <span style={{ flex: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                {log.message}
              </span>
            </div>
          ))}

          {data && data.logs.length === 0 && (
            <div className="empty-state">No logs found</div>
          )}
        </div>
      </div>
    </div>
  );
}
