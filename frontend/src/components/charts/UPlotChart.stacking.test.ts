import { describe, it, expect } from "vitest";
import { stackData } from "../../utils/chartDataTransforms";

describe("stackData", () => {
  it("produces correct cumulative values in normal mode", () => {
    const timestamps = new Float64Array([1000, 2000, 3000]);
    const series1: (number | null)[] = [10, 20, 30];
    const series2: (number | null)[] = [5, 10, 15];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, series1, series2];

    const result = stackData(data, "normal");

    // series1 stays the same (first in stack)
    expect(result[1]).toEqual([10, 20, 30]);
    // series2 is cumulative on top of series1
    expect(result[2]).toEqual([15, 30, 45]);
  });

  it("normalizes to 100% in percent mode", () => {
    const timestamps = new Float64Array([1000, 2000]);
    const series1: (number | null)[] = [25, 50];
    const series2: (number | null)[] = [75, 50];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, series1, series2];

    const result = stackData(data, "percent");

    // At t=1000: 25/(25+75)=25%, cumulative = 25%. 75/(25+75)=75%, cumulative = 100%
    expect(result[1]).toEqual([25, 50]);
    expect(result[2]).toEqual([100, 100]);
  });

  it("handles null values in normal stacking (nulls propagate)", () => {
    const timestamps = new Float64Array([1000, 2000, 3000]);
    const series1: (number | null)[] = [10, null, 30];
    const series2: (number | null)[] = [5, 10, null];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, series1, series2];

    const result = stackData(data, "normal");

    // series1: [10, null, 30]
    expect(result[1]).toEqual([10, null, 30]);
    // series2 at t=1000: 10+5=15, t=2000: null then 0+10=10, t=3000: 30 + null
    expect((result[2] as (number | null)[])[0]).toBe(15);
    expect((result[2] as (number | null)[])[1]).toBe(10);
    expect((result[2] as (number | null)[])[2]).toBeNull();
  });

  it("returns empty data for empty input", () => {
    const timestamps = new Float64Array(0);
    const data: [Float64Array] = [timestamps];

    const result = stackData(data, "normal");

    expect(result).toHaveLength(1);
    expect((result[0] as Float64Array).length).toBe(0);
  });

  it("handles single series in normal mode (no stacking effect)", () => {
    const timestamps = new Float64Array([1000, 2000]);
    const series1: (number | null)[] = [42, 84];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, series1];

    const result = stackData(data, "normal");

    expect(result[1]).toEqual([42, 84]);
  });

  it("handles all-null values in percent mode gracefully", () => {
    const timestamps = new Float64Array([1000]);
    const series1: (number | null)[] = [null];
    const series2: (number | null)[] = [null];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, series1, series2];

    const result = stackData(data, "percent");

    expect(result[1]).toEqual([null]);
    expect(result[2]).toEqual([null]);
  });

  it("handles three series in normal mode", () => {
    const timestamps = new Float64Array([1000]);
    const s1: (number | null)[] = [10];
    const s2: (number | null)[] = [20];
    const s3: (number | null)[] = [30];
    const data: [Float64Array, ...(number | null)[][]] = [timestamps, s1, s2, s3];

    const result = stackData(data, "normal");

    expect(result[1]).toEqual([10]);
    expect(result[2]).toEqual([30]);  // 10 + 20
    expect(result[3]).toEqual([60]);  // 10 + 20 + 30
  });
});
