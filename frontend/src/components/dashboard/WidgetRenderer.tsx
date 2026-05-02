import { useEffect, useState } from "react";
import { api } from "../../services/api";
import type { PanelDefinition, MetricQueryResult } from "../../types";
import { TimeSeriesChart } from "../TimeSeriesChart";
import { AreaChartWidget, BarChartWidget, PieChartWidget, StatWidget, TextWidget } from "../charts";

interface Props {
  panel: PanelDefinition;
  from: Date;
  to: Date;
  interval: string;
  height: number;
  refreshKey?: number;
}

export function WidgetRenderer({ panel, from, to, interval, height, refreshKey }: Props) {
  const [data, setData] = useState<MetricQueryResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMql = !!panel.mql_query?.trim();
  const hasLegacy = !!panel.metric_name;

  useEffect(() => {
    if (panel.panel_type === "text") return;
    if (!hasMql && !hasLegacy) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const promise = hasMql
      ? api.mql.query({
          query: panel.mql_query!,
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
        })
      : api.metrics.query({
          name: panel.metric_name!,
          tags: panel.tags ?? {},
          start: from.toISOString(),
          end: to.toISOString(),
          interval,
          aggregation: panel.aggregation ?? "avg",
        });

    promise
      .then((result) => {
        if (!cancelled) { setData(result); setLoading(false); }
      })
      .catch((e) => {
        if (!cancelled) { setError(e.message); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [panel.mql_query, panel.metric_name, panel.tags, panel.aggregation, panel.panel_type, hasMql, hasLegacy, from.getTime(), to.getTime(), interval, refreshKey]);

  if (panel.panel_type === "text") {
    return <TextWidget content={panel.content ?? ""} height={height} />;
  }

  if (!hasMql && !hasLegacy) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No metric configured
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="skeleton-shimmer" style={{ width: "90%", height: "60%", borderRadius: 6 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)", fontSize: 12, padding: 12, textAlign: "center" }}>
        {error}
      </div>
    );
  }

  const chartData = data ?? [];

  switch (panel.panel_type) {
    case "timeseries":
      return <TimeSeriesChart data={chartData} height={height} />;
    case "area":
      return <AreaChartWidget data={chartData} height={height} stacked={panel.display_options?.stacked !== false} />;
    case "stat":
      return <StatWidget data={chartData} height={height} />;
    case "top_list":
      return <BarChartWidget data={chartData} height={height} limit={(panel.display_options?.limit as number) ?? 10} />;
    case "pie":
      return <PieChartWidget data={chartData} height={height} />;
    default:
      return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Unknown widget type</div>;
  }
}
