import type { MetricQueryResult } from "../types";

export interface CorrelationResult {
  seriesA: string;
  seriesB: string;
  r: number;
  n: number;
}

export function pearsonCorrelation(xValues: number[], yValues: number[]): number {
  const n = Math.min(xValues.length, yValues.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xValues[i];
    sumY += yValues[i];
    sumXY += xValues[i] * yValues[i];
    sumX2 += xValues[i] ** 2;
    sumY2 += yValues[i] ** 2;
  }

  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  if (den === 0) return 0;

  return num / den;
}

export function correlateTimeSeries(
  seriesA: MetricQueryResult,
  seriesB: MetricQueryResult,
): CorrelationResult {
  const aMap = new Map<string, number>();
  for (const [ts, val] of seriesA.datapoints) {
    if (val != null) aMap.set(ts, val);
  }

  const xValues: number[] = [];
  const yValues: number[] = [];
  for (const [ts, val] of seriesB.datapoints) {
    if (val != null && aMap.has(ts)) {
      xValues.push(aMap.get(ts)!);
      yValues.push(val);
    }
  }

  return {
    seriesA: seriesA.name,
    seriesB: seriesB.name,
    r: pearsonCorrelation(xValues, yValues),
    n: xValues.length,
  };
}

export function correlationStrength(r: number): { label: string; color: string } {
  const abs = Math.abs(r);
  if (abs >= 0.9) return { label: "Very strong", color: "#ef4444" };
  if (abs >= 0.7) return { label: "Strong", color: "#f59e0b" };
  if (abs >= 0.5) return { label: "Moderate", color: "#3b82f6" };
  if (abs >= 0.3) return { label: "Weak", color: "#a855f7" };
  return { label: "None", color: "var(--text-muted)" };
}
