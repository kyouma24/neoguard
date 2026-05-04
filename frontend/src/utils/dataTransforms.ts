/**
 * Display-time data transformations for dashboard panels.
 *
 * These transforms operate on MetricQueryResult[] and produce new
 * MetricQueryResult[] with the datapoints transformed in place.
 * Applied after data fetch but before widget rendering.
 */
import type { MetricQueryResult } from "../types";
import type { DataTransform } from "../types/display-options";

/**
 * Apply a DataTransform to an array of metric query results.
 * Returns a new array (does not mutate the input).
 */
export function applyDataTransform(
  data: MetricQueryResult[],
  transform: DataTransform | undefined,
): MetricQueryResult[] {
  if (!transform || transform === "none" || data.length === 0) return data;

  switch (transform) {
    case "rate":
      return data.map(rateTransform);
    case "delta":
      return data.map(deltaTransform);
    case "cumulative":
      return data.map(cumulativeTransform);
    case "moving_avg_5":
      return data.map((s) => movingAvgTransform(s, 5));
    case "moving_avg_10":
      return data.map((s) => movingAvgTransform(s, 10));
    case "percentile_95":
      return data.map((s) => percentileLineTransform(s, 0.95));
    case "percentile_99":
      return data.map((s) => percentileLineTransform(s, 0.99));
    default:
      return data;
  }
}

/**
 * Rate of change: (current - previous) / timeDelta in seconds.
 * First datapoint becomes null since there is no previous value.
 */
function rateTransform(series: MetricQueryResult): MetricQueryResult {
  const pts = series.datapoints;
  if (pts.length < 2) {
    return { ...series, datapoints: pts.map(([ts]) => [ts, null]) };
  }

  const result: [string, number | null][] = [[pts[0][0], null]];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1][1];
    const curr = pts[i][1];
    if (prev == null || curr == null) {
      result.push([pts[i][0], null]);
      continue;
    }
    const prevTime = new Date(pts[i - 1][0]).getTime() / 1000;
    const currTime = new Date(pts[i][0]).getTime() / 1000;
    const timeDelta = currTime - prevTime;
    if (timeDelta <= 0) {
      result.push([pts[i][0], null]);
    } else {
      result.push([pts[i][0], (curr - prev) / timeDelta]);
    }
  }
  return { ...series, datapoints: result };
}

/**
 * Delta: current - previous.
 * First datapoint becomes null.
 */
function deltaTransform(series: MetricQueryResult): MetricQueryResult {
  const pts = series.datapoints;
  if (pts.length < 2) {
    return { ...series, datapoints: pts.map(([ts]) => [ts, null]) };
  }

  const result: [string, number | null][] = [[pts[0][0], null]];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1][1];
    const curr = pts[i][1];
    if (prev == null || curr == null) {
      result.push([pts[i][0], null]);
    } else {
      result.push([pts[i][0], curr - prev]);
    }
  }
  return { ...series, datapoints: result };
}

/**
 * Cumulative sum: running total of all non-null values.
 */
function cumulativeTransform(series: MetricQueryResult): MetricQueryResult {
  let sum = 0;
  const result: [string, number | null][] = series.datapoints.map(([ts, val]) => {
    if (val == null) return [ts, null];
    sum += val;
    return [ts, sum];
  });
  return { ...series, datapoints: result };
}

/**
 * Moving average: rolling window of `windowSize` points.
 * Emits the average of the window centered or trailing.
 * Uses trailing window for simplicity.
 */
function movingAvgTransform(series: MetricQueryResult, windowSize: number): MetricQueryResult {
  const pts = series.datapoints;
  const result: [string, number | null][] = [];

  for (let i = 0; i < pts.length; i++) {
    const windowStart = Math.max(0, i - windowSize + 1);
    let sum = 0;
    let count = 0;
    for (let j = windowStart; j <= i; j++) {
      const val = pts[j][1];
      if (val != null) {
        sum += val;
        count++;
      }
    }
    result.push([pts[i][0], count > 0 ? sum / count : null]);
  }
  return { ...series, datapoints: result };
}

/**
 * Percentile line: compute the Nth percentile across all non-null datapoints
 * and emit a flat horizontal line at that value.
 */
function percentileLineTransform(series: MetricQueryResult, percentile: number): MetricQueryResult {
  const values = series.datapoints
    .map(([, v]) => v)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return { ...series, datapoints: series.datapoints.map(([ts]) => [ts, null]) };
  }

  const idx = Math.ceil(percentile * values.length) - 1;
  const pValue = values[Math.max(0, Math.min(idx, values.length - 1))];

  const result: [string, number | null][] = series.datapoints.map(([ts]) => [ts, pValue]);
  return { ...series, datapoints: result };
}

/**
 * Compute basic statistics for inspector display.
 */
export interface SeriesStats {
  name: string;
  tags: Record<string, string>;
  datapointCount: number;
  nullCount: number;
  nullRatio: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

export function computeSeriesStats(series: MetricQueryResult): SeriesStats {
  const pts = series.datapoints;
  let min: number | null = null;
  let max: number | null = null;
  let sum = 0;
  let count = 0;
  let nullCount = 0;

  for (const [, val] of pts) {
    if (val == null) {
      nullCount++;
      continue;
    }
    if (min === null || val < min) min = val;
    if (max === null || val > max) max = val;
    sum += val;
    count++;
  }

  return {
    name: series.name,
    tags: series.tags,
    datapointCount: pts.length,
    nullCount,
    nullRatio: pts.length > 0 ? nullCount / pts.length : 0,
    min,
    max,
    avg: count > 0 ? sum / count : null,
    firstTimestamp: pts.length > 0 ? pts[0][0] : null,
    lastTimestamp: pts.length > 0 ? pts[pts.length - 1][0] : null,
  };
}
