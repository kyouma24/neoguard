import { useState, useCallback, useRef, useEffect } from "react";
import { Share2, Copy, Link, Download, Mail, Code } from "lucide-react";
import { api } from "../../services/api";

interface ShareMenuProps {
  dashboardId: string;
}

/**
 * Build the current dashboard URL preserving time range, variables, refresh, and live state
 * from the browser's current search params.
 */
function buildDashboardUrl(dashboardId: string): string {
  const base = `${window.location.origin}/dashboards/${dashboardId}`;
  const params = new URLSearchParams(window.location.search);
  const kept = new URLSearchParams();

  // Preserve time range params
  for (const key of ["range", "from", "to"]) {
    const v = params.get(key);
    if (v) kept.set(key, v);
  }

  // Preserve variable params (var_*)
  params.forEach((v, k) => {
    if (k.startsWith("var_")) kept.set(k, v);
  });

  // Preserve refresh & live
  for (const key of ["refresh", "live", "kiosk"]) {
    const v = params.get(key);
    if (v) kept.set(key, v);
  }

  const qs = kept.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Build a URL with the current time range converted to absolute unix timestamps.
 * Relative ranges like "Last 1 hour" become from=<unix>&to=<unix>.
 */
function buildAbsoluteUrl(dashboardId: string): string {
  const base = `${window.location.origin}/dashboards/${dashboardId}`;
  const params = new URLSearchParams(window.location.search);
  const kept = new URLSearchParams();

  const rangeKey = params.get("range") || "1h";

  if (rangeKey === "custom") {
    // Already absolute — pass through
    const from = params.get("from");
    const to = params.get("to");
    if (from) kept.set("from", from);
    if (to) kept.set("to", to);
  } else {
    // Relative range: compute absolute timestamps
    const PRESETS: Record<string, number> = {
      "5m": 5, "15m": 15, "1h": 60, "4h": 240,
      "12h": 720, "24h": 1440, "3d": 4320,
      "7d": 10080, "30d": 43200, "90d": 129600,
    };
    const minutes = PRESETS[rangeKey] ?? 60;
    const now = Date.now();
    const from = new Date(now - minutes * 60_000);
    const to = new Date(now);
    kept.set("from", from.toISOString());
    kept.set("to", to.toISOString());
  }

  kept.set("range", "custom");

  // Preserve variable params (var_*)
  params.forEach((v, k) => {
    if (k.startsWith("var_")) kept.set(k, v);
  });

  // Preserve refresh & live
  for (const key of ["refresh", "live", "kiosk"]) {
    const v = params.get(key);
    if (v) kept.set(key, v);
  }

  const qs = kept.toString();
  return qs ? `${base}?${qs}` : base;
}

type CopiedState = "idle" | "link" | "snapshot" | "embed";

function buildEmbedUrl(dashboardId: string): string {
  return `${window.location.origin}/embed/dashboards/${dashboardId}`;
}

function buildIframeSnippet(dashboardId: string): string {
  const url = buildEmbedUrl(dashboardId);
  return `<iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>`;
}

export function ShareMenu({ dashboardId }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [copied, setCopied] = useState<CopiedState>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const showCopied = useCallback((variant: CopiedState) => {
    clearTimer();
    setCopied(variant);
    timeoutRef.current = setTimeout(() => {
      setCopied("idle");
      timeoutRef.current = null;
    }, 2000);
  }, [clearTimer]);

  const handleCopyLink = useCallback(async () => {
    const url = buildDashboardUrl(dashboardId);
    await navigator.clipboard.writeText(url);
    showCopied("link");
    setOpen(false);
  }, [dashboardId, showCopied]);

  const handleCopySnapshot = useCallback(async () => {
    const url = buildAbsoluteUrl(dashboardId);
    await navigator.clipboard.writeText(url);
    showCopied("snapshot");
    setOpen(false);
  }, [dashboardId, showCopied]);

  const handleExportJson = useCallback(async () => {
    const data = await api.dashboards.exportJson(dashboardId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${dashboardId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  }, [dashboardId]);

  const handleEmailLink = useCallback(() => {
    const url = buildDashboardUrl(dashboardId);
    const subject = encodeURIComponent("Dashboard Link");
    const body = encodeURIComponent(`Check out this dashboard:\n\n${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    setOpen(false);
  }, [dashboardId]);

  const handleOpenEmbed = useCallback(() => {
    setOpen(false);
    setShowEmbed(true);
  }, []);

  const handleCopyEmbed = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    showCopied("embed");
  }, [showCopied]);

  const buttonLabel = copied !== "idle" ? "Copied!" : "Share";

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Share dashboard"
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 13,
          fontWeight: 500,
          background: copied !== "idle" ? "var(--color-success-500, #22c55e)" : "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          color: copied !== "idle" ? "#fff" : "var(--text-primary)",
          cursor: "pointer",
          transition: "background 150ms ease, color 150ms ease",
        }}
      >
        <Share2 size={14} />
        {buttonLabel}
      </button>

      {open && (
        <>
          <div
            data-testid="share-menu-backdrop"
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label="Share options"
            data-testid="share-menu-dropdown"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 4,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              zIndex: 100,
              minWidth: 220,
              overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            <button
              role="menuitem"
              aria-label="Copy link"
              data-testid="share-copy-link"
              onClick={handleCopyLink}
              style={menuItemStyle}
            >
              <Link size={14} style={{ flexShrink: 0 }} />
              Copy link
            </button>
            <button
              role="menuitem"
              aria-label="Copy link at current state"
              data-testid="share-copy-snapshot"
              onClick={handleCopySnapshot}
              style={menuItemStyle}
            >
              <Copy size={14} style={{ flexShrink: 0 }} />
              Copy link at current state
            </button>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <button
              role="menuitem"
              aria-label="Export as JSON"
              data-testid="share-export-json"
              onClick={handleExportJson}
              style={menuItemStyle}
            >
              <Download size={14} style={{ flexShrink: 0 }} />
              Export as JSON
            </button>
            <button
              role="menuitem"
              aria-label="Email link"
              data-testid="share-email-link"
              onClick={handleEmailLink}
              style={menuItemStyle}
            >
              <Mail size={14} style={{ flexShrink: 0 }} />
              Email link
            </button>
            <div style={{ borderTop: "1px solid var(--border)" }} />
            <button
              role="menuitem"
              aria-label="Embed dashboard"
              data-testid="share-embed"
              onClick={handleOpenEmbed}
              style={menuItemStyle}
            >
              <Code size={14} style={{ flexShrink: 0 }} />
              Embed
            </button>
          </div>
        </>
      )}

      {/* Embed modal */}
      {showEmbed && (
        <>
          <div
            data-testid="embed-modal-backdrop"
            style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 300 }}
            onClick={() => setShowEmbed(false)}
          />
          <div
            data-testid="embed-modal"
            role="dialog"
            aria-label="Embed dashboard"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md, 8px)",
              zIndex: 301,
              width: 520,
              maxWidth: "90vw",
              padding: 24,
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Code size={16} color="var(--color-primary-500, #635bff)" />
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Embed Dashboard</span>
              </div>
              <button
                onClick={() => setShowEmbed(false)}
                aria-label="Close embed dialog"
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
              >
                &times;
              </button>
            </div>

            {/* iframe snippet */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                iframe Snippet
              </label>
              <div style={{ position: "relative" }}>
                <textarea
                  readOnly
                  value={buildIframeSnippet(dashboardId)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 12,
                    fontFamily: "monospace",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    resize: "none",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => handleCopyEmbed(buildIframeSnippet(dashboardId))}
                  data-testid="embed-copy-iframe"
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            </div>

            {/* Direct link */}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Direct Link
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  readOnly
                  value={buildEmbedUrl(dashboardId)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontFamily: "monospace",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => handleCopyEmbed(buildEmbedUrl(dashboardId))}
                  data-testid="embed-copy-link"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "10px 14px",
  fontSize: 13,
  border: "none",
  background: "transparent",
  color: "var(--text-primary)",
  cursor: "pointer",
  textAlign: "left",
};
