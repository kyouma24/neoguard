import {
  ComposedChart,
  Line,
  Area,
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
}

interface DataPoint {
  time: number;
  actual: number | null;
  forecast: number | null;
  upper: number | null;
  lower: number | null;
}

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function computeStdError(xs: number[], ys: number[], slope: number, intercept: number): number {
  const n = xs.length;
  if (n <= 2) return 0;
  let sumResidualSq = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    sumResidualSq += (ys[i] - predicted) ** 2;
  }
  return Math.sqrt(sumResidualSq / (n - 2));
}

export function ForecastWidget({ data, height = 300, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const cfg = displayOptions?.forecast;
  const forecastPeriods = cfg?.forecastPeriods ?? 10;
  const confidenceLevel = cfg?.confidenceLevel ?? 0.95;
  const showConfidenceBand = cfg?.showConfidenceBand ?? true;

  const validPoints = series.datapoints.filter(([, v]) => v !== null) as [string, number][];
  if (validPoints.length < 2) {
    return <ChartEmptyState height={height} message="Need at least 2 datapoints for forecast" />;
  }

  const timestamps = validPoints.map(([ts]) => new Date(ts).getTime());
  const values = validPoints.map(([, v]) => v);

  const { slope, intercept } = linearRegression(timestamps, values);
  const stdError = computeStdError(timestamps, values, slope, intercept);

  const zScore = confidenceLevel >= 0.99 ? 2.576 : confidenceLevel >= 0.95 ? 1.96 : 1.645;

  const avgInterval = timestamps.length > 1
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1)
    : 60000;

  const chartData: DataPoint[] = validPoints.map(([ts, v]) => ({
    time: new Date(ts).getTime(),
    actual: v,
    forecast: null,
    upper: null,
    lower: null,
  }));

  const lastTime = timestamps[timestamps.length - 1];
  const lastActual = values[values.length - 1];

  chartData[chartData.length - 1].forecast = lastActual;
  if (showConfidenceBand) {
    chartData[chartData.length - 1].upper = lastActual;
    chartData[chartData.length - 1].lower = lastActual;
  }

  for (let i = 1; i <= forecastPeriods; i++) {
    const t = lastTime + i * avgInterval;
    const predicted = slope * t + intercept;
    const band = zScore * stdError * Math.sqrt(1 + 1 / timestamps.length);
    chartData.push({
      time: t,
      actual: null,
      forecast: predicted,
      upper: showConfidenceBand ? predicted + band * i * 0.3 : null,
      lower: showConfidenceBand ? predicted - band * i * 0.3 : null,
    });
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
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
            return [formatValue(value, unit), name === "actual" ? "Actual" : name === "forecast" ? "Forecast" : name];
          }}
        />
        {showConfidenceBand && (
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill="#635bff"
            fillOpacity={0.08}
            isAnimationActive={false}
            connectNulls={false}
          />
        )}
        {showConfidenceBand && (
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="var(--bg-primary, #0a0a0a)"
            fillOpacity={1}
            isAnimationActive={false}
            connectNulls={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="actual"
          stroke="#635bff"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="forecast"
          stroke="#635bff"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
