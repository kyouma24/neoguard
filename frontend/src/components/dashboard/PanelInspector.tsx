import { useState, useMemo } from "react";
import { X } from "lucide-react";
import type { PanelDefinition, MetricQueryResult } from "../../types";
import { computeSeriesStats } from "../../utils/dataTransforms";
import type { SeriesStats } from "../../utils/dataTransforms";

type InspectorTab = "query" | "data" | "stats";

interface Props {
  panel: PanelDefinition;
  data: MetricQueryResult[] | null;
  from: Date;
  to: Date;
  interval: string;
  onClose: () => void;
}

export function PanelInspector({ panel, data, from, to, interval, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("query");

  const seriesStats = useMemo<SeriesStats[]>(() => {
    if (!data) return [];
    return data.map(computeSeriesStats);
  }, [data]);

  const totalStats = useMemo(() => {
    let totalDatapoints = 0;
    let totalNulls = 0;
    let earliest: string | null = null;
    let latest: string | null = null;

    for (const s of seriesStats) {
      totalDatapoints += s.datapointCount;
      totalNulls += s.nullCount;
      if (s.firstTimestamp && (!earliest || s.firstTimestamp < earliest)) {
        earliest = s.firstTimestamp;
      }
      if (s.lastTimestamp && (!latest || s.lastTimestamp > latest)) {
        latest = s.lastTimestamp;
      }
    }

    const durationMs = to.getTime() - from.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    return {
      totalDatapoints,
      totalNulls,
      nullRatio: totalDatapoints > 0 ? totalNulls / totalDatapoints : 0,
      seriesCount: seriesStats.length,
      earliest,
      latest,
      durationMinutes,
    };
  }, [seriesStats, from, to]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)",
          width: "min(90vw, 900px)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              Inspect: {panel.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {panel.panel_type} panel
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
              borderRadius: "var(--radius-sm)",
            }}
            aria-label="Close inspector"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
          {(["query", "data", "stats"] as InspectorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "var(--color-primary-500)" : "var(--text-muted)",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? "2px solid var(--color-primary-500)" : "2px solid transparent",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {activeTab === "query" && (
            <QueryTab panel={panel} from={from} to={to} interval={interval} />
          )}
          {activeTab === "data" && (
            <DataTab data={data} seriesStats={seriesStats} />
          )}
          {activeTab === "stats" && (
            <StatsTab
              totalStats={totalStats}
              interval={interval}
              from={from}
              to={to}
              panel={panel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* --- Query Tab --- */

function QueryTab({
  panel,
  from,
  to,
  interval,
}: {
  panel: PanelDefinition;
  from: Date;
  to: Date;
  interval: string;
}) {
  const hasMql = !!panel.mql_query?.trim();
  const hasLegacy = !!panel.metric_name;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {hasMql && (
        <InspectorField label="MQL Query">
          <code style={codeBlockStyle}>{panel.mql_query}</code>
        </InspectorField>
      )}
      {hasLegacy && (
        <InspectorField label="Metric Name">
          <code style={codeBlockStyle}>{panel.metric_name}</code>
        </InspectorField>
      )}
      {hasLegacy && panel.tags && Object.keys(panel.tags).length > 0 && (
        <InspectorField label="Tags Filter">
          <code style={codeBlockStyle}>
            {JSON.stringify(panel.tags, null, 2)}
          </code>
        </InspectorField>
      )}
      {hasLegacy && panel.aggregation && (
        <InspectorField label="Aggregation">
          <span style={valueStyle}>{panel.aggregation}</span>
        </InspectorField>
      )}
      <InspectorField label="Time Range">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span style={valueStyle}>From: {from.toISOString()}</span>
          <span style={valueStyle}>To: {to.toISOString()}</span>
        </div>
      </InspectorField>
      <InspectorField label="Interval">
        <span style={valueStyle}>{interval}</span>
      </InspectorField>
      {panel.display_options?.transform && panel.display_options.transform !== "none" && (
        <InspectorField label="Transform">
          <span style={valueStyle}>{panel.display_options.transform}</span>
        </InspectorField>
      )}
      {panel.display_options?.timeRangeOverride?.range && (
        <InspectorField label="Time Override">
          <span style={valueStyle}>{panel.display_options.timeRangeOverride.range}</span>
        </InspectorField>
      )}
    </div>
  );
}

/* --- Data Tab --- */

function DataTab({
  data,
  seriesStats,
}: {
  data: MetricQueryResult[] | null;
  seriesStats: SeriesStats[];
}) {
  const [expandedSeries, setExpandedSeries] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No data available</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Series</th>
            <th style={thStyle}>Tags</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Points</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Min</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Max</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {seriesStats.map((stats, idx) => (
            <tr
              key={idx}
              onClick={() => setExpandedSeries(expandedSeries === idx ? null : idx)}
              style={{ cursor: "pointer" }}
            >
              <td style={tdStyle}>{stats.name}</td>
              <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                {Object.entries(stats.tags).map(([k, v]) => `${k}=${v}`).join(", ") || "-"}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{stats.datapointCount}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatNum(stats.min)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatNum(stats.max)}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{formatNum(stats.avg)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {expandedSeries !== null && data[expandedSeries] && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
            Raw datapoints for: {data[expandedSeries].name}
          </div>
          <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Timestamp</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {data[expandedSeries].datapoints.slice(0, 100).map(([ts, val], i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{ts}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{val == null ? "null" : val.toFixed(4)}</td>
                  </tr>
                ))}
                {data[expandedSeries].datapoints.length > 100 && (
                  <tr>
                    <td colSpan={2} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>
                      ... {data[expandedSeries].datapoints.length - 100} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Stats Tab --- */

function StatsTab({
  totalStats,
  interval,
  from,
  to,
  panel,
}: {
  totalStats: {
    totalDatapoints: number;
    totalNulls: number;
    nullRatio: number;
    seriesCount: number;
    earliest: string | null;
    latest: string | null;
    durationMinutes: number;
  };
  interval: string;
  from: Date;
  to: Date;
  panel: PanelDefinition;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <StatCard label="Total Series" value={String(totalStats.seriesCount)} />
      <StatCard label="Total Datapoints" value={String(totalStats.totalDatapoints)} />
      <StatCard label="Null Datapoints" value={String(totalStats.totalNulls)} />
      <StatCard
        label="Null Ratio"
        value={`${(totalStats.nullRatio * 100).toFixed(1)}%`}
        color={totalStats.nullRatio > 0.5 ? "var(--color-danger-500)" : undefined}
      />
      <StatCard label="Time Range Duration" value={`${totalStats.durationMinutes} min`} />
      <StatCard label="Interval" value={interval} />
      <StatCard label="Query Start" value={from.toLocaleString()} />
      <StatCard label="Query End" value={to.toLocaleString()} />
      {totalStats.earliest && (
        <StatCard label="Earliest Datapoint" value={new Date(totalStats.earliest).toLocaleString()} />
      )}
      {totalStats.latest && (
        <StatCard label="Latest Datapoint" value={new Date(totalStats.latest).toLocaleString()} />
      )}
      <StatCard label="Panel Type" value={panel.panel_type} />
      {panel.display_options?.transform && panel.display_options.transform !== "none" && (
        <StatCard label="Active Transform" value={panel.display_options.transform} />
      )}
    </div>
  );
}

/* --- Shared sub-components --- */

function InspectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--bg-secondary, var(--bg-tertiary))",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function formatNum(n: number | null): string {
  if (n == null) return "-";
  if (Math.abs(n) >= 1000) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/* --- Styles --- */

const codeBlockStyle: React.CSSProperties = {
  display: "block",
  padding: "10px 14px",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  color: "var(--text-primary)",
};

const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  background: "var(--bg-tertiary)",
  position: "sticky",
  top: 0,
};

const tdStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
};
