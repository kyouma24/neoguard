import type { Annotation, MetricQueryResult } from "../types";

interface AnomalyPoint {
  timestamp: string;
  value: number;
  zScore: number;
  seriesName: string;
}

function rollingStats(values: (number | null)[], windowSize: number): { mean: number; std: number }[] {
  const results: { mean: number; std: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window: number[] = [];
    for (let j = start; j <= i; j++) {
      if (values[j] != null) window.push(values[j]!);
    }
    if (window.length < 2) {
      results.push({ mean: window[0] ?? 0, std: 0 });
      continue;
    }
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / (window.length - 1);
    results.push({ mean, std: Math.sqrt(variance) });
  }
  return results;
}

export function detectAnomalies(
  data: MetricQueryResult[],
  zThreshold = 3,
  windowSize = 20,
): AnomalyPoint[] {
  const anomalies: AnomalyPoint[] = [];

  for (const series of data) {
    if (series.datapoints.length < windowSize) continue;

    const values = series.datapoints.map(([, v]) => v);
    const stats = rollingStats(values, windowSize);

    for (let i = windowSize; i < series.datapoints.length; i++) {
      const [ts, val] = series.datapoints[i];
      if (val == null) continue;
      const { mean, std } = stats[i];
      if (std === 0) continue;

      const zScore = Math.abs((val - mean) / std);
      if (zScore >= zThreshold) {
        anomalies.push({
          timestamp: ts,
          value: val,
          zScore: Math.round(zScore * 10) / 10,
          seriesName: series.name,
        });
      }
    }
  }

  return anomalies;
}

export function anomaliesToAnnotations(anomalies: AnomalyPoint[]): Annotation[] {
  return anomalies.map((a, i) => ({
    id: `auto-anomaly-${i}`,
    tenant_id: "",
    dashboard_id: null,
    title: `Anomaly: ${a.seriesName}`,
    text: `z-score ${a.zScore} (value: ${a.value.toPrecision(4)})`,
    tags: ["auto-detected", "anomaly"],
    starts_at: a.timestamp,
    ends_at: null,
    created_by: "system",
    created_at: new Date().toISOString(),
  }));
}

export interface AnomalyBand {
  timestamp: string;
  upper: number;
  lower: number;
  mean: number;
  isAnomaly: boolean;
  value: number | null;
}

export function computeAnomalyBands(
  datapoints: [string, number | null][],
  stdDevMultiplier = 2,
  windowSize = 20,
): AnomalyBand[] {
  const values = datapoints.map(([, v]) => v);
  const stats = rollingStats(values, windowSize);

  return datapoints.map(([ts, val], i) => {
    const { mean, std } = stats[i];
    const upper = mean + std * stdDevMultiplier;
    const lower = mean - std * stdDevMultiplier;
    const isAnomaly = val !== null && std > 0 && Math.abs((val - mean) / std) >= stdDevMultiplier;
    return { timestamp: ts, upper, lower, mean, isAnomaly, value: val };
  });
}

export function linearRegression(
  datapoints: [string, number | null][],
): { slope: number; intercept: number; r2: number } {
  const valid = datapoints
    .map(([, v], i) => ({ x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p.y !== null);

  if (valid.length < 2) return { slope: 0, intercept: 0, r2: 0 };

  const n = valid.length;
  const sumX = valid.reduce((s, p) => s + p.x, 0);
  const sumY = valid.reduce((s, p) => s + p.y, 0);
  const sumXY = valid.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = valid.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssRes = valid.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const ssTot = valid.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

export function forecastDatapoints(
  datapoints: [string, number | null][],
  periods: number,
): { timestamp: string; value: number; lower: number; upper: number }[] {
  if (datapoints.length < 2) return [];

  const { slope, intercept } = linearRegression(datapoints);
  const n = datapoints.length;

  const lastTs = new Date(datapoints[n - 1][0]).getTime();
  const prevTs = n > 1 ? new Date(datapoints[n - 2][0]).getTime() : lastTs - 60000;
  const intervalMs = lastTs - prevTs;

  const residuals = datapoints
    .map(([, v], i) => (v !== null ? Math.abs(v - (slope * i + intercept)) : null))
    .filter((v): v is number => v !== null);
  const avgResidual = residuals.length > 0 ? residuals.reduce((a, b) => a + b, 0) / residuals.length : 0;

  const result: { timestamp: string; value: number; lower: number; upper: number }[] = [];
  for (let p = 1; p <= periods; p++) {
    const idx = n - 1 + p;
    const value = slope * idx + intercept;
    const spread = avgResidual * Math.sqrt(p) * 1.96;
    result.push({
      timestamp: new Date(lastTs + intervalMs * p).toISOString(),
      value,
      lower: value - spread,
      upper: value + spread,
    });
  }

  return result;
}

export function pearsonCorrelation(
  seriesA: (number | null)[],
  seriesB: (number | null)[],
): number {
  const paired: { a: number; b: number }[] = [];
  const len = Math.min(seriesA.length, seriesB.length);
  for (let i = 0; i < len; i++) {
    if (seriesA[i] !== null && seriesB[i] !== null) {
      paired.push({ a: seriesA[i]!, b: seriesB[i]! });
    }
  }

  if (paired.length < 3) return 0;

  const n = paired.length;
  const meanA = paired.reduce((s, p) => s + p.a, 0) / n;
  const meanB = paired.reduce((s, p) => s + p.b, 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (const p of paired) {
    const da = p.a - meanA;
    const db = p.b - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}
