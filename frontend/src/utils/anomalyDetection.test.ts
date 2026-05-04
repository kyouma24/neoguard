import { describe, it, expect } from "vitest";
import { detectAnomalies, anomaliesToAnnotations } from "./anomalyDetection";
import type { MetricQueryResult } from "../types";

function makeSeries(name: string, values: (number | null)[]): MetricQueryResult {
  const start = new Date("2026-05-01T00:00:00Z").getTime();
  return {
    name,
    tags: {},
    datapoints: values.map((v, i) => [new Date(start + i * 60_000).toISOString(), v]),
  };
}

describe("detectAnomalies", () => {
  it("detects spike in otherwise stable series", () => {
    const values = Array.from({ length: 50 }, () => 10 + Math.random() * 0.5);
    values[45] = 100;
    const series = makeSeries("cpu", values);
    const anomalies = detectAnomalies([series], 3, 20);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].seriesName).toBe("cpu");
    expect(anomalies[0].zScore).toBeGreaterThan(3);
  });

  it("returns empty for stable series", () => {
    const values = Array.from({ length: 50 }, () => 50);
    const series = makeSeries("stable", values);
    const anomalies = detectAnomalies([series], 3, 20);
    expect(anomalies).toHaveLength(0);
  });

  it("skips series shorter than window", () => {
    const series = makeSeries("short", [1, 2, 3, 4, 5]);
    const anomalies = detectAnomalies([series], 3, 20);
    expect(anomalies).toHaveLength(0);
  });

  it("handles null values", () => {
    const values: (number | null)[] = Array.from({ length: 50 }, () => 10);
    values[25] = null;
    values[45] = 100;
    const series = makeSeries("with-nulls", values);
    const anomalies = detectAnomalies([series], 3, 20);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
  });

  it("processes multiple series independently", () => {
    const stableValues = Array.from({ length: 50 }, () => 10);
    const spikyValues = Array.from({ length: 50 }, () => 10);
    spikyValues[45] = 1000;
    const anomalies = detectAnomalies(
      [makeSeries("stable", stableValues), makeSeries("spiky", spikyValues)],
      3,
      20,
    );
    expect(anomalies.every((a) => a.seriesName === "spiky")).toBe(true);
  });

  it("respects custom z-threshold", () => {
    const values = Array.from({ length: 50 }, () => 10 + Math.random() * 0.5);
    values[45] = 15;
    const low = detectAnomalies([makeSeries("test", values)], 2, 20);
    const high = detectAnomalies([makeSeries("test", values)], 50, 20);
    expect(low.length).toBeGreaterThanOrEqual(high.length);
  });
});

describe("anomaliesToAnnotations", () => {
  it("converts anomaly points to annotation objects", () => {
    const anomalies = [
      { timestamp: "2026-05-01T00:45:00Z", value: 100, zScore: 5.2, seriesName: "cpu" },
    ];
    const annotations = anomaliesToAnnotations(anomalies);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].title).toBe("Anomaly: cpu");
    expect(annotations[0].text).toContain("5.2");
    expect(annotations[0].tags).toContain("anomaly");
    expect(annotations[0].id).toBe("auto-anomaly-0");
  });

  it("returns empty array for no anomalies", () => {
    expect(anomaliesToAnnotations([])).toHaveLength(0);
  });
});
