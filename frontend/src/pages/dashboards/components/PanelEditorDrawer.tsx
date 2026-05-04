import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../../services/api";
import type { PanelDefinition, PanelType } from "../../../types";
import type { PanelDisplayOptions } from "../../../types/display-options";
import { useApi } from "../../../hooks/useApi";
import { WidgetRenderer } from "../../../components/dashboard/WidgetRenderer";
import { PANEL_TYPE_OPTIONS } from "../../../components/charts/widgetRegistry";
import { Button, Input, NativeSelect } from "../../../design-system";
import { X } from "lucide-react";
import { DisplaySection } from "./DisplaySection";
import { MQLEditor } from "../../../components/MQLEditor";

type QueryMode = "simple" | "mql";
type EditorTab = "query" | "display" | "preview";

interface Props {
  panel: PanelDefinition;
  isNew: boolean;
  onSave: (panel: PanelDefinition) => void;
  onClose: () => void;
}

export function PanelEditorDrawer({ panel, isNew, onSave, onClose }: Props) {
  const [title, setTitle] = useState(panel.title);
  const [panelType, setPanelType] = useState<PanelType>(panel.panel_type);
  const [queryMode, setQueryMode] = useState<QueryMode>(panel.mql_query ? "mql" : "simple");
  const [metricName, setMetricName] = useState(panel.metric_name ?? "");
  const [metricSearch, setMetricSearch] = useState("");
  const [aggregation, setAggregation] = useState(panel.aggregation ?? "avg");
  const [mqlQuery, setMqlQuery] = useState(panel.mql_query ?? "");
  const [mqlError, setMqlError] = useState<string | null>(null);
  const [mqlValid, setMqlValid] = useState(false);
  const [content, setContent] = useState(panel.content ?? "");
  const [displayOptions, setDisplayOptions] = useState<PanelDisplayOptions>(panel.display_options ?? {});
  const [activeTab, setActiveTab] = useState<EditorTab>("query");

  const { data: metricNames } = useApi<string[]>(() => api.metrics.names(), []);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management — trap focus inside drawer, restore on close
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element inside the drawer
    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const focusable = drawerRef.current.querySelector<HTMLElement>(
          'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      // Return focus to the originating element when drawer closes
      previouslyFocusedRef.current?.focus();
    };
  }, []);

  // Focus trap: keep Tab cycling within the drawer
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab" || !drawerRef.current) return;

    const focusableEls = drawerRef.current.querySelectorAll<HTMLElement>(
      'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableEls.length === 0) return;

    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  const filteredMetrics = metricSearch
    ? (metricNames ?? []).filter((n) => n.toLowerCase().includes(metricSearch.toLowerCase())).slice(0, 30)
    : (metricNames ?? []).slice(0, 30);

  const isTextType = panelType === "text";

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60_000);

  useEffect(() => {
    if (queryMode !== "mql" || !mqlQuery.trim()) {
      setMqlError(null);
      setMqlValid(false);
      return;
    }

    if (validateTimerRef.current) clearTimeout(validateTimerRef.current);

    validateTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.mql.validate({
          query: mqlQuery,
          start: start.toISOString(),
          end: now.toISOString(),
        });
        if (result.valid) {
          setMqlError(null);
          setMqlValid(true);
        } else {
          setMqlError(result.error ?? "Invalid query");
          setMqlValid(false);
        }
      } catch (e) {
        setMqlError(e instanceof Error ? e.message : "Validation failed");
        setMqlValid(false);
      }
    }, 400);

    return () => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    };
  }, [mqlQuery, queryMode]);

  const handleSave = () => {
    const isMql = queryMode === "mql" && !isTextType;

    onSave({
      ...panel,
      title: title || (isMql ? mqlQuery.split(":")[1]?.split("{")[0] ?? "MQL" : metricName) || "Untitled",
      panel_type: panelType,
      metric_name: isTextType || isMql ? undefined : metricName,
      aggregation: isTextType || isMql ? undefined : aggregation,
      mql_query: isMql ? mqlQuery : undefined,
      content: isTextType ? content : undefined,
      display_options: displayOptions,
    });
  };

  const hasValidSource = isTextType
    ? !!content
    : queryMode === "mql"
      ? mqlValid
      : !!metricName.trim();

  const previewPanel: PanelDefinition = {
    ...panel,
    title,
    panel_type: panelType,
    metric_name: isTextType || queryMode === "mql" ? undefined : metricName,
    aggregation: isTextType || queryMode === "mql" ? undefined : aggregation,
    mql_query: !isTextType && queryMode === "mql" ? mqlQuery : undefined,
    content: isTextType ? content : undefined,
    display_options: displayOptions,
  };

  const tabStyle = (tab: EditorTab): React.CSSProperties => ({
    flex: 1,
    padding: "8px 0",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid var(--color-primary-500)" : "2px solid transparent",
    background: "none",
    color: activeTab === tab ? "var(--color-primary-500)" : "var(--text-muted)",
    transition: "color 0.15s, border-color 0.15s",
  });

  const dialogLabel = title
    ? `Edit panel: ${title}`
    : isNew
      ? "Add new panel"
      : "Edit panel";

  return (
    <>
      <div className="panel-drawer-overlay" onClick={onClose} />
      <div
        className="panel-drawer"
        role="dialog"
        aria-label={dialogLabel}
        ref={drawerRef}
        onKeyDown={handleKeyDown}
      >
        <div className="panel-drawer-header">
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {isNew ? "Add Panel" : "Edit Panel"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }} aria-label="Close panel editor">
            <X size={18} />
          </button>
        </div>

        <div className="panel-drawer-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Panel Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., CPU Usage"
              autoFocus
            />

            <NativeSelect
              label="Panel Type"
              options={PANEL_TYPE_OPTIONS}
              value={panelType}
              onChange={(v) => setPanelType(v as PanelType)}
            />

            {!isTextType && (
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginTop: 4 }}>
                <button style={tabStyle("query")} onClick={() => setActiveTab("query")}>Query</button>
                <button style={tabStyle("display")} onClick={() => setActiveTab("display")}>Display</button>
                <button style={tabStyle("preview")} onClick={() => setActiveTab("preview")}>Preview</button>
              </div>
            )}

            {isTextType ? (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
                  Markdown Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write markdown here..."
                  rows={8}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-primary)",
                    resize: "vertical",
                  }}
                />
              </div>
            ) : activeTab === "query" ? (
              <QueryTab
                queryMode={queryMode}
                setQueryMode={setQueryMode}
                mqlQuery={mqlQuery}
                setMqlQuery={setMqlQuery}
                mqlError={mqlError}
                mqlValid={mqlValid}
                aggregation={aggregation}
                setAggregation={setAggregation}
                metricName={metricName}
                setMetricName={setMetricName}
                metricSearch={metricSearch}
                setMetricSearch={setMetricSearch}
                filteredMetrics={filteredMetrics}
                panelType={panelType}
                displayOptions={displayOptions}
                setDisplayOptions={setDisplayOptions}
              />
            ) : activeTab === "display" ? (
              <DisplaySection
                panelType={panelType}
                displayOptions={displayOptions}
                onChange={setDisplayOptions}
              />
            ) : (
              <div>
                {(isTextType ? content : hasValidSource) ? (
                  <div style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                  }}>
                    <WidgetRenderer
                      panel={previewPanel}
                      from={start}
                      to={now}
                      interval="1m"
                      height={250}
                    />
                  </div>
                ) : (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                    Configure a data source on the Query tab to see a preview.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="panel-drawer-footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isTextType && !hasValidSource && !title.trim()}
          >
            {isNew ? "Add Panel" : "Update Panel"}
          </Button>
        </div>
      </div>
    </>
  );
}

function QueryTab({
  queryMode, setQueryMode, mqlQuery, setMqlQuery, mqlError, mqlValid,
  aggregation, setAggregation, metricName, setMetricName,
  metricSearch, setMetricSearch, filteredMetrics,
  panelType, displayOptions, setDisplayOptions,
}: {
  queryMode: QueryMode;
  setQueryMode: (m: QueryMode) => void;
  mqlQuery: string;
  setMqlQuery: (q: string) => void;
  mqlError: string | null;
  mqlValid: boolean;
  aggregation: string;
  setAggregation: (a: string) => void;
  metricName: string;
  setMetricName: (n: string) => void;
  metricSearch: string;
  setMetricSearch: (s: string) => void;
  filteredMetrics: string[];
  panelType: PanelType;
  displayOptions: PanelDisplayOptions;
  setDisplayOptions: (o: PanelDisplayOptions) => void;
}) {
  return (
    <>
      <div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
          Query Mode
        </label>
        <div style={{ display: "flex", gap: 0, borderRadius: "var(--border-radius-md)", overflow: "hidden", border: "1px solid var(--color-neutral-200)" }}>
          {(["simple", "mql"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setQueryMode(mode)}
              style={{
                flex: 1,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background: queryMode === mode ? "var(--color-primary-500)" : "var(--color-neutral-50)",
                color: queryMode === mode ? "#fff" : "var(--color-neutral-600)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {mode === "simple" ? "Simple" : "MQL"}
            </button>
          ))}
        </div>
      </div>

      {queryMode === "mql" ? (
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
            MQL Query
          </label>
          <MQLEditor
            value={mqlQuery}
            onChange={setMqlQuery}
            error={mqlError}
            isValid={mqlValid}
            maxLength={2000}
          />
          <div style={{ fontSize: 11, color: "var(--color-neutral-400)", marginTop: 6 }}>
            Format: <code style={{ fontSize: 11 }}>aggregator:metric{"{"}tag:value{"}"}.function().rollup(method,seconds)</code>
          </div>
        </div>
      ) : (
        <>
          <NativeSelect
            label="Aggregation"
            options={["avg", "min", "max", "sum", "count", "last", "p95", "p99"].map((a) => ({ value: a, label: a }))}
            value={aggregation}
            onChange={(v) => setAggregation(v)}
          />

          <div>
            <Input
              label="Metric"
              value={metricName || metricSearch}
              onChange={(e) => { setMetricSearch(e.target.value); setMetricName(e.target.value); }}
              placeholder="Search metrics..."
            />
            {metricSearch && filteredMetrics.length > 0 && (
              <div style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                maxHeight: 180,
                overflowY: "auto",
                marginTop: 4,
              }}>
                {filteredMetrics.map((n) => (
                  <div
                    key={n}
                    style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,91,255,0.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { setMetricName(n); setMetricSearch(""); }}
                  >
                    <code style={{ fontSize: 12 }}>{n}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {panelType === "area" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={displayOptions.stacked !== false}
            onChange={(e) => setDisplayOptions({ ...displayOptions, stacked: e.target.checked })}
          />
          Stacked areas
        </label>
      )}

      {panelType === "top_list" && (
        <Input
          label="Max items"
          type="number"
          min={1}
          max={50}
          value={displayOptions.limit ?? 10}
          onChange={(e) => setDisplayOptions({ ...displayOptions, limit: parseInt(e.target.value) || 10 })}
        />
      )}
    </>
  );
}
