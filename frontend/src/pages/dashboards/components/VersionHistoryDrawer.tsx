import { useEffect, useState } from "react";
import { api, formatError } from "../../../services/api";
import type { DashboardVersion } from "../../../types";
import { Button } from "../../../design-system";
import { format } from "date-fns";
import { History, RotateCcw, X } from "lucide-react";

interface Props {
  dashboardId: string;
  onRestore: () => void;
  onClose: () => void;
}

export function VersionHistoryDrawer({ dashboardId, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<DashboardVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<DashboardVersion | null>(null);

  useEffect(() => {
    setLoading(true);
    api.dashboards
      .listVersions(dashboardId)
      .then(setVersions)
      .catch((e) => setError(formatError(e)))
      .finally(() => setLoading(false));
  }, [dashboardId]);

  const handleRestore = async (version: DashboardVersion) => {
    setRestoring(version.version_number);
    setError(null);
    try {
      await api.dashboards.restoreVersion(dashboardId, version.version_number);
      onRestore();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 200 }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border)",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={18} color="var(--color-primary-500)" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Version History</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        {error && (
          <div
            style={{
              margin: "12px 20px 0",
              padding: "8px 12px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--color-danger-500)",
              borderRadius: "var(--border-radius-md)",
              fontSize: 12,
              color: "var(--color-danger-500)",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              Loading versions...
            </div>
          )}

          {!loading && versions.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              No version history yet. Versions are saved automatically when you update the dashboard.
            </div>
          )}

          {versions.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelectedVersion(selectedVersion?.id === v.id ? null : v)}
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 8,
                cursor: "pointer",
                background:
                  selectedVersion?.id === v.id
                    ? "rgba(99, 91, 255, 0.08)"
                    : "var(--bg-secondary)",
                transition: "background 0.15s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  Version {v.version_number}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {format(new Date(v.created_at), "MMM d, yyyy HH:mm")}
                </span>
              </div>
              {v.change_summary && (
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                  {v.change_summary}
                </div>
              )}

              {selectedVersion?.id === v.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    <strong>Name:</strong> {String(v.data.name ?? "—")}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    <strong>Panels:</strong> {Array.isArray(v.data.panels) ? v.data.panels.length : 0}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                    <strong>Description:</strong> {String(v.data.description ?? "—")}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(v);
                    }}
                    disabled={restoring !== null}
                  >
                    <RotateCcw size={12} />
                    {restoring === v.version_number ? "Restoring..." : "Restore this version"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
