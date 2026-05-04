import { describe, it, expect } from "vitest";
import { pearsonCorrelation, correlateTimeSeries, correlationStrength } from "./correlation";
import type { MetricQueryResult } from "../types";

describe("pearsonCorrelation", () => {
  it("returns 1 for perfect positive correlation", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).toBeCloseTo(1.0, 5);
  });

  it("returns -1 for perfect negative correlation", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).toBeCloseTo(-1.0, 5);
  });

  it("returns ~0 for uncorrelated data", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  it("returns 0 for fewer than 3 points", () => {
    expect(pearsonCorrelation([1, 2], [3, 4])).toBe(0);
    expect(pearsonCorrelation([], [])).toBe(0);
  });

  it("returns 0 for constant values", () => {
    const r = pearsonCorrelation([5, 5, 5, 5], [5, 5, 5, 5]);
    expect(r).toBe(0);
  });

  it("handles mismatched lengths using shorter array", () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5, 6, 7], [2, 4, 6]);
    expect(r).toBeCloseTo(1.0, 5);
  });
});

describe("correlateTimeSeries", () => {
  function makeSeries(name: string, data: [string, number][]): MetricQueryResult {
    return { name, tags: {}, datapoints: data };
  }

  it("computes correlation between two aligned series", () => {
    const timestamps = ["t1", "t2", "t3", "t4", "t5"];
    const a = makeSeries("cpu", timestamps.map((t, i) => [t, i + 1]));
    const b = makeSeries("mem", timestamps.map((t, i) => [t, (i + 1) * 2]));
    const result = correlateTimeSeries(a, b);
    expect(result.r).toBeCloseTo(1.0, 5);
    expect(result.n).toBe(5);
    expect(result.seriesA).toBe("cpu");
    expect(result.seriesB).toBe("mem");
  });

  it("handles partially overlapping timestamps", () => {
    const a = makeSeries("a", [["t1", 1], ["t2", 2], ["t3", 3]]);
    const b = makeSeries("b", [["t2", 4], ["t3", 6], ["t4", 8]]);
    const result = correlateTimeSeries(a, b);
    expect(result.n).toBe(2);
  });

  it("handles null values gracefully", () => {
    const a = makeSeries("a", [["t1", 1], ["t2", null as unknown as number], ["t3", 3], ["t4", 4], ["t5", 5]]);
    const b = makeSeries("b", [["t1", 2], ["t2", 4], ["t3", 6], ["t4", 8], ["t5", 10]]);
    const result = correlateTimeSeries(a, b);
    expect(result.n).toBe(4);
  });
});

describe("correlationStrength", () => {
  it("classifies very strong correlation", () => {
    expect(correlationStrength(0.95).label).toBe("Very strong");
    expect(correlationStrength(-0.92).label).toBe("Very strong");
  });

  it("classifies strong correlation", () => {
    expect(correlationStrength(0.75).label).toBe("Strong");
  });

  it("classifies moderate correlation", () => {
    expect(correlationStrength(0.55).label).toBe("Moderate");
  });

  it("classifies weak correlation", () => {
    expect(correlationStrength(0.35).label).toBe("Weak");
  });

  it("classifies no correlation", () => {
    expect(correlationStrength(0.1).label).toBe("None");
    expect(correlationStrength(0).label).toBe("None");
  });
});
