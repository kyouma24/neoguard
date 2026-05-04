import { describe, it, expect } from "vitest";
import { lttbDownsample } from "./downsample";

describe("lttbDownsample", () => {
  it("returns data unchanged if below target", () => {
    const data: [number, number | null][] = [
      [1, 10],
      [2, 20],
      [3, 30],
    ];
    const result = lttbDownsample(data, 10);
    expect(result).toEqual(data);
  });

  it("returns data unchanged if exactly at target", () => {
    const data: [number, number | null][] = [
      [1, 10],
      [2, 20],
      [3, 30],
    ];
    const result = lttbDownsample(data, 3);
    expect(result).toEqual(data);
  });

  it("downsamples to correct target size", () => {
    const data: [number, number | null][] = [];
    for (let i = 0; i < 100; i++) {
      data.push([i, Math.sin(i * 0.1) * 100]);
    }
    const result = lttbDownsample(data, 20);
    expect(result.length).toBe(20);
  });

  it("preserves first and last points", () => {
    const data: [number, number | null][] = [];
    for (let i = 0; i < 50; i++) {
      data.push([i * 1000, i * 2]);
    }
    const result = lttbDownsample(data, 10);
    expect(result[0]).toEqual(data[0]);
    expect(result[result.length - 1]).toEqual(data[data.length - 1]);
  });

  it("handles empty array", () => {
    const result = lttbDownsample([], 10);
    expect(result).toEqual([]);
  });

  it("handles single point", () => {
    const data: [number, number | null][] = [[1000, 42]];
    const result = lttbDownsample(data, 10);
    expect(result).toEqual(data);
  });

  it("handles two points", () => {
    const data: [number, number | null][] = [
      [1000, 10],
      [2000, 20],
    ];
    const result = lttbDownsample(data, 1);
    // targetPoints < 3, returns as-is
    expect(result).toEqual(data);
  });

  it("handles all-null values", () => {
    const data: [number, number | null][] = [
      [1, null],
      [2, null],
      [3, null],
      [4, null],
      [5, null],
    ];
    // All null means nonNull.length (0) <= targetPoints, returns as-is
    const result = lttbDownsample(data, 3);
    expect(result).toEqual(data);
  });

  it("handles mixed null values", () => {
    const data: [number, number | null][] = [
      [1, 10],
      [2, null],
      [3, 30],
      [4, null],
      [5, 50],
      [6, 60],
      [7, 70],
      [8, null],
      [9, 90],
      [10, 100],
    ];
    // 7 non-null points, downsample to 5
    const result = lttbDownsample(data, 5);
    expect(result.length).toBe(5);
    // First and last non-null should be preserved
    expect(result[0]).toEqual([1, 10]);
    expect(result[result.length - 1]).toEqual([10, 100]);
  });

  it("preserves peaks (triangle area maximization)", () => {
    // Create data with a clear spike
    const data: [number, number | null][] = [];
    for (let i = 0; i < 100; i++) {
      // Spike at index 50
      const value = i === 50 ? 1000 : 10;
      data.push([i, value]);
    }
    const result = lttbDownsample(data, 10);
    // The spike at [50, 1000] should be preserved because it maximizes triangle area
    const spikePreserved = result.some(
      ([, v]) => v === 1000,
    );
    expect(spikePreserved).toBe(true);
  });

  it("handles large dataset (1000 -> 100 points)", () => {
    const data: [number, number | null][] = [];
    for (let i = 0; i < 1000; i++) {
      data.push([i * 60000, Math.sin(i * 0.01) * 50 + 50]);
    }
    const result = lttbDownsample(data, 100);
    expect(result.length).toBe(100);
    // Should still have reasonable range
    const values = result.map(([, v]) => v).filter((v): v is number => v !== null);
    expect(Math.max(...values)).toBeGreaterThan(80);
    expect(Math.min(...values)).toBeLessThan(20);
  });

  it("returns as-is when targetPoints < 3", () => {
    const data: [number, number | null][] = [
      [1, 10],
      [2, 20],
      [3, 30],
      [4, 40],
    ];
    const result = lttbDownsample(data, 2);
    expect(result).toEqual(data);
  });

  it("preserves temporal ordering", () => {
    const data: [number, number | null][] = [];
    for (let i = 0; i < 200; i++) {
      data.push([i * 1000, Math.random() * 100]);
    }
    const result = lttbDownsample(data, 30);
    for (let i = 1; i < result.length; i++) {
      expect(result[i][0]).toBeGreaterThan(result[i - 1][0]);
    }
  });
});
