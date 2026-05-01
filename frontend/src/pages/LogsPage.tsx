import { useState } from "react";
import { format } from "date-fns";
import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import {
  Button,
  Card,
  Input,
  NativeSelect,
  PageHeader,
  EmptyState,
  Pagination,
  StatusBadge,
} from "../design-system";
import type { LogQueryResult } from "../types";

const SEVERITIES = [
  { value: "", label: "All levels" },
  { value: "trace", label: "TRACE" },
  { value: "debug", label: "DEBUG" },
  { value: "info", label: "INFO" },
  { value: "warn", label: "WARN" },
  { value: "error", label: "ERROR" },
  { value: "fatal", label: "FATAL" },
];

const SEVERITY_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

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
    [query, service, severity, limit, offset],
  );

  const handleSearch = () => {
    setOffset(0);
    refetch();
  };

  const page = Math.floor(offset / limit);

  return (
    <div>
      <PageHeader title="Log Explorer" subtitle={data ? `${data.total} results` : undefined} />

      <Card variant="bordered" padding="md">
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Search"
              placeholder="Search logs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div style={{ width: 180 }}>
            <Input
              label="Service"
              placeholder="Service..."
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>
          <div style={{ width: 140 }}>
            <NativeSelect
              label="Severity"
              options={SEVERITIES}
              value={severity}
              onChange={(v) => setSeverity(v)}
            />
          </div>
          <Button variant="primary" size="md" onClick={handleSearch}>
            Search
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card variant="bordered" padding="sm">
          {loading && (
            <div style={{ textAlign: "center", padding: 32 }}>
              <div className="spinner" />
            </div>
          )}

          <div style={{ fontFamily: "var(--typography-font-family-mono)", fontSize: "var(--typography-font-size-xs)" }}>
            {data?.logs.map((log, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--color-neutral-200)",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--color-neutral-400)", flexShrink: 0, width: 150 }}>
                  {format(new Date(log.timestamp), "MM-dd HH:mm:ss.SSS")}
                </span>
                <span style={{ flexShrink: 0, width: 70 }}>
                  <StatusBadge label={log.severity.toUpperCase()} tone={SEVERITY_TONE[log.severity] ?? "neutral"} />
                </span>
                <span style={{ flexShrink: 0, width: 140, color: "var(--color-primary-500)" }}>
                  {log.service}
                </span>
                <span style={{ flex: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
                  {log.message}
                </span>
              </div>
            ))}

            {data && data.logs.length === 0 && (
              <EmptyState title="No logs found" description="Try adjusting your search filters." />
            )}
          </div>

          {data && data.total > limit && (
            <div style={{ padding: "12px 0", display: "flex", justifyContent: "center" }}>
              <Pagination
                total={data.total}
                page={page}
                pageSize={limit}
                onPageChange={(p) => setOffset(p * limit)}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
