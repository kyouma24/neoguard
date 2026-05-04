import { useMemo, useCallback } from "react";
import type { MetricQueryResult } from "../../types";
import type { PanelDisplayOptions } from "../../types/display-options";
import { formatValue, formatAxisTick } from "../../utils/unitFormat";
import { ChartEmptyState } from "./ChartEmptyState";

interface Props {
  data: MetricQueryResult[];
  height?: number;
  displayOptions?: PanelDisplayOptions;
}

interface CandleData {
  time: Date;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

const MARGIN = { top: 16, right: 12, bottom: 28, left: 56 };
const WICK_WIDTH = 1;
const MIN_BODY_HEIGHT = 1;

/**
 * Determine a reasonable time interval in ms for grouping datapoints into candles.
 * Uses the median gap between consecutive timestamps, then snaps to a round bucket.
 */
function inferInterval(timestamps: Date[]): number {
  if (timestamps.length < 2) return 60_000;
  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i].getTime() - timestamps[i - 1].getTime());
  }
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  const buckets = [
    10_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
    3600_000, 6 * 3600_000, 12 * 3600_000, 86400_000,
  ];
  let best = buckets[0];
  for (const b of buckets) {
    if (Math.abs(b - median) < Math.abs(best - median)) best = b;
  }
  return Math.max(best, median);
}

function buildCandles(datapoints: [string, number | null][]): CandleData[] {
  const valid = datapoints
    .filter(([, v]) => v !== null)
    .map(([ts, v]) => ({ time: new Date(ts), value: v as number }));

  if (valid.length === 0) return [];

  valid.sort((a, b) => a.time.getTime() - b.time.getTime());

  const timestamps = valid.map((p) => p.time);
  const interval = inferInterval(timestamps);

  const buckets = new Map<number, { time: Date; values: number[] }>();
  for (const p of valid) {
    const key = Math.floor(p.time.getTime() / interval) * interval;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { time: new Date(key), values: [] };
      buckets.set(key, bucket);
    }
    bucket.values.push(p.value);
  }

  const candles: CandleData[] = [];
  for (const [, bucket] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const vals = bucket.values;
    candles.push({
      time: bucket.time,
      open: vals[0],
      close: vals[vals.length - 1],
      high: Math.max(...vals),
      low: Math.min(...vals),
      volume: vals.length,
    });
  }
  return candles;
}

function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatDate(date: Date): string {
  const mo = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = date.getHours().toString().padStart(2, "0");
  const mi = date.getMinutes().toString().padStart(2, "0");
  return `${mo}/${d} ${h}:${mi}`;
}

export function CandlestickWidget({ data, height = 300, displayOptions }: Props) {
  const series = data[0];
  if (!series || !series.datapoints.length) {
    return <ChartEmptyState height={height} />;
  }

  const unit = displayOptions?.unit;
  const cfg = displayOptions?.candlestick;
  const upColor = cfg?.upColor ?? "#22c55e";
  const downColor = cfg?.downColor ?? "#ef4444";
  const showVolume = cfg?.showVolume ?? false;

  const candles = useMemo(() => buildCandles(series.datapoints), [series.datapoints]);

  if (candles.length === 0) {
    return <ChartEmptyState height={height} message="No valid datapoints for candlestick" />;
  }

  const chartWidth = 600;
  const volumeHeight = showVolume ? 40 : 0;
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom - volumeHeight;

  const allLow = Math.min(...candles.map((c) => c.low));
  const allHigh = Math.max(...candles.map((c) => c.high));
  const yPad = (allHigh - allLow) * 0.08 || 1;
  const yMin = allLow - yPad;
  const yMax = allHigh + yPad;

  const scaleY = useCallback(
    (v: number) => MARGIN.top + plotHeight * (1 - (v - yMin) / (yMax - yMin)),
    [plotHeight, yMin, yMax],
  );

  const candleSpacing = plotWidth / Math.max(candles.length, 1);
  const bodyWidth = Math.max(2, Math.min(candleSpacing * 0.7, 24));

  const scaleX = useCallback(
    (i: number) => MARGIN.left + candleSpacing * (i + 0.5),
    [candleSpacing],
  );

  const yTicks: number[] = [];
  const yStep = (yMax - yMin) / 4;
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + yStep * i);
  }

  const xTickStep = Math.max(1, Math.floor(candles.length / 8));
  const xTicks: number[] = [];
  for (let i = 0; i < candles.length; i += xTickStep) {
    xTicks.push(i);
  }

  const maxVolume = showVolume ? Math.max(...candles.map((c) => c.volume), 1) : 1;
  const volumeTop = height - MARGIN.bottom - volumeHeight;
  const scaleVolume = useCallback(
    (v: number) => volumeHeight * (v / maxVolume),
    [volumeHeight, maxVolume],
  );

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${chartWidth} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <line
            key={`grid-${i}`}
            x1={MARGIN.left}
            x2={chartWidth - MARGIN.right}
            y1={scaleY(tick)}
            y2={scaleY(tick)}
            stroke="var(--border)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={`ytick-${i}`}
            x={MARGIN.left - 6}
            y={scaleY(tick)}
            textAnchor="end"
            dominantBaseline="central"
            fill="var(--text-muted)"
            fontSize={10}
          >
            {formatAxisTick(tick, unit)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((idx) => (
          <text
            key={`xtick-${idx}`}
            x={scaleX(idx)}
            y={height - MARGIN.bottom + (showVolume ? volumeHeight : 0) + 14}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize={10}
          >
            {formatTime(candles[idx].time)}
          </text>
        ))}

        {/* Candles */}
        {candles.map((candle, i) => {
          const isUp = candle.close >= candle.open;
          const color = isUp ? upColor : downColor;
          const cx = scaleX(i);
          const highY = scaleY(candle.high);
          const lowY = scaleY(candle.low);
          const openY = scaleY(candle.open);
          const closeY = scaleY(candle.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(Math.abs(openY - closeY), MIN_BODY_HEIGHT);

          return (
            <g key={i}>
              {/* Wick (high to low) */}
              <line
                x1={cx}
                x2={cx}
                y1={highY}
                y2={lowY}
                stroke={color}
                strokeWidth={WICK_WIDTH}
              />
              {/* Body (open to close) */}
              <rect
                x={cx - bodyWidth / 2}
                y={bodyTop}
                width={bodyWidth}
                height={bodyH}
                fill={color}
                fillOpacity={isUp ? 0.3 : 0.8}
                stroke={color}
                strokeWidth={0.5}
              />
              {/* Hover target with native tooltip */}
              <rect
                x={cx - candleSpacing / 2}
                y={MARGIN.top}
                width={candleSpacing}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: "crosshair" }}
              >
                <title>
                  {`${formatDate(candle.time)}\nOpen: ${formatValue(candle.open, unit)}\nHigh: ${formatValue(candle.high, unit)}\nLow: ${formatValue(candle.low, unit)}\nClose: ${formatValue(candle.close, unit)}${showVolume ? `\nVolume: ${candle.volume}` : ""}`}
                </title>
              </rect>
            </g>
          );
        })}

        {/* Volume bars */}
        {showVolume &&
          candles.map((candle, i) => {
            const isUp = candle.close >= candle.open;
            const color = isUp ? upColor : downColor;
            const cx = scaleX(i);
            const barH = scaleVolume(candle.volume);
            return (
              <rect
                key={`vol-${i}`}
                x={cx - bodyWidth / 2}
                y={volumeTop + volumeHeight - barH}
                width={bodyWidth}
                height={barH}
                fill={color}
                fillOpacity={0.2}
              />
            );
          })}
      </svg>
    </div>
  );
}
