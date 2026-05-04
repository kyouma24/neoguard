import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue, formatAxisTick } from "../../utils/unitFormat";
import { CHART_TOOLTIP_STYLE } from "./chartConstants";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
  comparisonData?: MetricQueryResult[];
}

function computeAvg(datapoints: [string, number | null][]): number | null {
  const vals = datapoints.map(([, v]) => v).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function DiffComparisonWidget({ data, height = 300, displayOptions, comparisonData }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const cfg = displayOptions?.diffComparison;
  const layout = cfg?.layout ?? "overlay";
  const showPercentChange = cfg?.showPercentChange ?? true;

  const compSeries = comparisonData?.[0];

  const currentAvg = computeAvg(series.datapoints);
  const prevAvg = compSeries ? computeAvg(compSeries.datapoints) : null;
  const pctChange = currentAvg != null && prevAvg != null && prevAvg !== 0
    ? ((currentAvg - prevAvg) / Math.abs(prevAvg)) * 100
    : null;

  if (layout === "side_by_side") {
    const currentData = series.datapoints.map(([ts, v]) => ({
      time: new Date(ts).getTime(),
      value: v,
    }));
    const prevData = compSeries?.datapoints.map(([ts, v]) => ({
      time: new Date(ts).getTime(),
      value: v,
    })) ?? [];

    const chartHeight = showPercentChange ? (height - 36) / 2 : height / 2;

    return (
      <div style={{ height, display: "flex", flexDirection: "column" }}>
        {showPercentChange && pctChange != null && (
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 4,
              background: pctChange >= 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
              color: pctChange >= 0 ? "#22c55e" : "#ef4444",
            }}>
              {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
            </span>
          </div>
        )}
        <div style={{ display: "flex", flex: 1, gap: 4 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 2 }}>Current</div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={currentData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "var(--text-muted)", fontSize: 9 }}
                  stroke="var(--border)"
                  tickFormatter={(v: number) => format(new Date(v), "HH:mm")}
                  scale="time"
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 9 }}
                  stroke="var(--border)"
                  width={45}
                  tickFormatter={(v: number) => formatAxisTick(v, unit)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [formatValue(v, unit), "Current"]}
                  labelFormatter={(v: number) => format(new Date(v), "HH:mm:ss")}
                />
                <Line type="monotone" dataKey="value" stroke="#635bff" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 2 }}>Previous</div>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={prevData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: "var(--text-muted)", fontSize: 9 }}
                  stroke="var(--border)"
                  tickFormatter={(v: number) => format(new Date(v), "HH:mm")}
                  scale="time"
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 9 }}
                  stroke="var(--border)"
                  width={45}
                  tickFormatter={(v: number) => formatAxisTick(v, unit)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v: number) => [formatValue(v, unit), "Previous"]}
                  labelFormatter={(v: number) => format(new Date(v), "HH:mm:ss")}
                />
                <Line type="monotone" dataKey="value" stroke="#a855f7" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  const overlayData: { time: number; current: number | null; previous: number | null }[] = [];
  const currentMap = new Map<number, number | null>();

  for (const [ts, v] of series.datapoints) {
    const t = new Date(ts).getTime();
    currentMap.set(t, v);
    overlayData.push({ time: t, current: v, previous: null });
  }

  if (compSeries) {
    const currentDuration = series.datapoints.length > 1
      ? new Date(series.datapoints[series.datapoints.length - 1][0]).getTime() - new Date(series.datapoints[0][0]).getTime()
      : 0;
    const prevDuration = compSeries.datapoints.length > 1
      ? new Date(compSeries.datapoints[compSeries.datapoints.length - 1][0]).getTime() - new Date(compSeries.datapoints[0][0]).getTime()
      : 0;
    const prevStart = compSeries.datapoints.length > 0 ? new Date(compSeries.datapoints[0][0]).getTime() : 0;
    const curStart = series.datapoints.length > 0 ? new Date(series.datapoints[0][0]).getTime() : 0;

    for (let i = 0; i < compSeries.datapoints.length; i++) {
      const [ts, v] = compSeries.datapoints[i];
      const origTime = new Date(ts).getTime();
      const normalizedTime = prevDuration > 0
        ? curStart + ((origTime - prevStart) / prevDuration) * currentDuration
        : curStart;

      const existing = overlayData.find((d) => Math.abs(d.time - normalizedTime) < (currentDuration / series.datapoints.length) * 0.5);
      if (existing) {
        existing.previous = v;
      } else {
        overlayData.push({ time: normalizedTime, current: null, previous: v });
      }
    }

    overlayData.sort((a, b) => a.time - b.time);
  }

  return (
    <div style={{ height, display: "flex", flexDirection: "column" }}>
      {showPercentChange && pctChange != null && (
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 4,
            background: pctChange >= 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            color: pctChange >= 0 ? "#22c55e" : "#ef4444",
          }}>
            {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
          </span>
        </div>
      )}
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={overlayData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              stroke="var(--border)"
              tickFormatter={(v: number) => format(new Date(v), "HH:mm")}
              scale="time"
            />
            <YAxis
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              stroke="var(--border)"
              width={60}
              tickFormatter={(v: number) => formatAxisTick(v, unit)}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v: number) => format(new Date(v), "MMM d HH:mm")}
              formatter={(value: number, name: string) => {
                return [formatValue(value, unit), name === "current" ? "Current" : "Previous"];
              }}
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke="#635bff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeOpacity={0.6}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
