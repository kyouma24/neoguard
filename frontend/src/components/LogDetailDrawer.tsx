import { useEffect, useRef } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { X, Copy, Clock, Tag, Server, FileText, Hash } from "lucide-react";
import { Button, StatusBadge } from "../design-system";
import type { LogEntry } from "../types";

interface LogDetailDrawerProps {
  log: LogEntry | null;
  onClose: () => void;
}

const SEVERITY_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  trace: "neutral",
  debug: "neutral",
  info: "info",
  warn: "warning",
  error: "danger",
  fatal: "danger",
};

function isJSON(str: string): boolean {
  if (!str.startsWith("{") && !str.startsWith("[")) return false;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function JSONHighlight({ json }: { json: string }) {
  try {
    const parsed = JSON.parse(json);
    const formatted = JSON.stringify(parsed, null, 2);
    const lines = formatted.split("\n").map((line, i) => {
      const highlighted = line
        .replace(/"([^"]+)":/g, '<span style="color: var(--color-info-500)">"$1"</span>:')
        .replace(/: "([^"]*)"(,?)$/g, ': <span style="color: var(--color-success-500)">"$1"</span>$2')
        .replace(/: (\d+\.?\d*)(,?)$/g, ': <span style="color: var(--color-warning-500)">$1</span>$2')
        .replace(/: (true|false|null)(,?)$/g, ': <span style="color: var(--color-primary-500)">$1</span>$2');
      return <div key={i} dangerouslySetInnerHTML={{ __html: highlighted }} />;
    });
    return <pre style={styles.jsonPre}>{lines}</pre>;
  } catch {
    return <pre style={styles.jsonPre}>{json}</pre>;
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function LogDetailDrawer({ log, onClose }: LogDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!log) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [log, onClose]);

  if (!log) return null;

  const ts = new Date(log.timestamp);
  const fullJSON = JSON.stringify(log, null, 2);
  const messageIsJSON = isJSON(log.message);
  const hasAttributes = Object.keys(log.attributes || {}).length > 0;
  const hasResource = Object.keys(log.resource || {}).length > 0;

  return (
    <>
      <div style={styles.overlay} onClick={onClose} />
      <div ref={drawerRef} style={styles.drawer} role="dialog" aria-label="Log details">
        <div style={styles.header}>
          <h3 style={styles.title}>Log Detail</h3>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        <div style={styles.body}>
          {/* Timestamp */}
          <div style={styles.field}>
            <div style={styles.fieldLabel}><Clock size={14} /> Timestamp</div>
            <div style={styles.fieldValue}>
              {format(ts, "yyyy-MM-dd HH:mm:ss.SSS")}
              <span style={styles.relative}> ({formatDistanceToNow(ts, { addSuffix: true })})</span>
            </div>
          </div>

          {/* Severity */}
          <div style={styles.field}>
            <div style={styles.fieldLabel}>Severity</div>
            <StatusBadge label={log.severity.toUpperCase()} tone={SEVERITY_TONE[log.severity] ?? "neutral"} />
          </div>

          {/* Service */}
          <div style={styles.field}>
            <div style={styles.fieldLabel}><Server size={14} /> Service</div>
            <div style={{ ...styles.fieldValue, color: "var(--color-primary-500)" }}>{log.service}</div>
          </div>

          {/* Trace ID */}
          {log.trace_id && (
            <div style={styles.field}>
              <div style={styles.fieldLabel}><Hash size={14} /> Trace ID</div>
              <div style={styles.monoValue}>
                {log.trace_id}
                <button style={styles.copyBtn} onClick={() => copyToClipboard(log.trace_id)} title="Copy">
                  <Copy size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Span ID */}
          {log.span_id && (
            <div style={styles.field}>
              <div style={styles.fieldLabel}><Hash size={14} /> Span ID</div>
              <div style={styles.monoValue}>
                {log.span_id}
                <button style={styles.copyBtn} onClick={() => copyToClipboard(log.span_id)} title="Copy">
                  <Copy size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Message */}
          <div style={styles.field}>
            <div style={styles.fieldLabel}><FileText size={14} /> Message</div>
            {messageIsJSON ? (
              <JSONHighlight json={log.message} />
            ) : (
              <pre style={styles.messagePre}>{log.message}</pre>
            )}
          </div>

          {/* Attributes */}
          {hasAttributes && (
            <div style={styles.field}>
              <div style={styles.fieldLabel}><Tag size={14} /> Attributes</div>
              <div style={styles.kvTable}>
                {Object.entries(log.attributes).map(([k, v]) => (
                  <div key={k} style={styles.kvRow}>
                    <span style={styles.kvKey}>{k}</span>
                    <span style={styles.kvValue}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource */}
          {hasResource && (
            <div style={styles.field}>
              <div style={styles.fieldLabel}><Server size={14} /> Resource</div>
              <div style={styles.kvTable}>
                {Object.entries(log.resource).map(([k, v]) => (
                  <div key={k} style={styles.kvRow}>
                    <span style={styles.kvKey}>{k}</span>
                    <span style={styles.kvValue}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(fullJSON)}>
            <Copy size={14} /> Copy as JSON
          </Button>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "var(--overlay-bg)",
    zIndex: 999,
  },
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "min(480px, 90vw)",
    background: "var(--bg-secondary)",
    borderLeft: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    zIndex: 1000,
    boxShadow: "var(--shadow-xl)",
    animation: "slideInRight 0.2s ease-out",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  title: {
    fontSize: "var(--typography-font-size-lg)",
    fontWeight: 700,
    margin: 0,
  },
  body: {
    flex: 1,
    overflow: "auto",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  footer: {
    padding: "12px 20px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fieldLabel: {
    fontSize: "var(--typography-font-size-xs)",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  fieldValue: {
    fontSize: "var(--typography-font-size-sm)",
    color: "var(--text-primary)",
  },
  monoValue: {
    fontSize: "var(--typography-font-size-sm)",
    fontFamily: "var(--typography-font-family-mono)",
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  copyBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 2,
    borderRadius: 4,
  },
  relative: {
    color: "var(--text-muted)",
    fontSize: "var(--typography-font-size-xs)",
  },
  messagePre: {
    fontSize: "var(--typography-font-size-sm)",
    fontFamily: "var(--typography-font-family-mono)",
    background: "var(--bg-tertiary)",
    borderRadius: 6,
    padding: "12px 14px",
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: 300,
    overflow: "auto",
    border: "1px solid var(--border)",
  },
  jsonPre: {
    fontSize: "var(--typography-font-size-xs)",
    fontFamily: "var(--typography-font-family-mono)",
    background: "var(--bg-tertiary)",
    borderRadius: 6,
    padding: "12px 14px",
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    maxHeight: 400,
    overflow: "auto",
    lineHeight: 1.6,
    border: "1px solid var(--border)",
  },
  kvTable: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "var(--bg-tertiary)",
    borderRadius: 6,
    padding: "8px 12px",
    border: "1px solid var(--border)",
  },
  kvRow: {
    display: "flex",
    gap: 12,
    fontSize: "var(--typography-font-size-xs)",
    fontFamily: "var(--typography-font-family-mono)",
  },
  kvKey: {
    color: "var(--color-info-500)",
    fontWeight: 600,
    flexShrink: 0,
    minWidth: 100,
  },
  kvValue: {
    color: "var(--text-primary)",
    wordBreak: "break-all",
  },
};
