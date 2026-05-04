import { describe, it, expect } from "vitest";
import { formatValue, formatAxisTick, getThresholdColor } from "./unitFormat";

describe("formatValue", () => {
  it("returns dash for null/undefined", () => {
    expect(formatValue(null)).toBe("—");
    expect(formatValue(undefined)).toBe("—");
  });

  it("returns dash for non-finite", () => {
    expect(formatValue(Infinity)).toBe("—");
    expect(formatValue(NaN)).toBe("—");
  });

  it("formats with no config as plain number", () => {
    expect(formatValue(42)).toBe("42.00");
    expect(formatValue(3.14159)).toBe("3.14");
  });

  it("formats none category", () => {
    expect(formatValue(99.5, { category: "none" })).toBe("99.50");
  });

  it("formats number with auto-scaling", () => {
    expect(formatValue(1500, { category: "number" })).toBe("1.50K");
    expect(formatValue(2500000, { category: "number" })).toBe("2.50M");
    expect(formatValue(3e9, { category: "number" })).toBe("3.00B");
    expect(formatValue(42, { category: "number" })).toBe("42.00");
  });

  it("formats percent", () => {
    expect(formatValue(85.5, { category: "percent" })).toBe("85.50%");
    expect(formatValue(0, { category: "percent" })).toBe("0.00%");
  });

  it("formats percent_0_1", () => {
    expect(formatValue(0.855, { category: "percent_0_1" })).toBe("85.50%");
    expect(formatValue(1.0, { category: "percent_0_1" })).toBe("100.00%");
  });

  it("formats bytes with auto-scaling", () => {
    expect(formatValue(0, { category: "bytes" })).toBe("0 B");
    expect(formatValue(512, { category: "bytes" })).toBe("512.00 B");
    expect(formatValue(1024, { category: "bytes" })).toBe("1.00 KB");
    expect(formatValue(1048576, { category: "bytes" })).toBe("1.00 MB");
    expect(formatValue(1073741824, { category: "bytes" })).toBe("1.00 GB");
    expect(formatValue(1099511627776, { category: "bytes" })).toBe("1.00 TB");
  });

  it("formats bytes/sec", () => {
    expect(formatValue(1048576, { category: "bytes_sec" })).toBe("1.00 MB/s");
  });

  it("formats bits/sec", () => {
    expect(formatValue(1000000, { category: "bits_sec" })).toContain("Kbps");
  });

  it("formats time_ms with auto-scaling", () => {
    expect(formatValue(0, { category: "time_ms" })).toBe("0 ms");
    expect(formatValue(0.5, { category: "time_ms" })).toContain("µs");
    expect(formatValue(150, { category: "time_ms" })).toBe("150.00 ms");
    expect(formatValue(1500, { category: "time_ms" })).toBe("1.50 s");
    expect(formatValue(90000, { category: "time_ms" })).toBe("1.50 min");
    expect(formatValue(7200000, { category: "time_ms" })).toBe("2.00 hr");
    expect(formatValue(172800000, { category: "time_ms" })).toBe("2.00 d");
  });

  it("formats time_sec", () => {
    expect(formatValue(0.5, { category: "time_sec" })).toBe("500.00 ms");
    expect(formatValue(30, { category: "time_sec" })).toBe("30.00 s");
    expect(formatValue(120, { category: "time_sec" })).toBe("2.00 min");
  });

  it("formats time_ns", () => {
    expect(formatValue(1000000, { category: "time_ns" })).toBe("1.00 ms");
  });

  it("formats time_us", () => {
    expect(formatValue(1000, { category: "time_us" })).toBe("1.00 ms");
  });

  it("formats ops/sec with SI scaling", () => {
    expect(formatValue(1500, { category: "ops_sec" })).toBe("1.50 Kops/s");
    expect(formatValue(2500000, { category: "ops_sec" })).toBe("2.50 Mops/s");
    expect(formatValue(42, { category: "ops_sec" })).toBe("42.00 ops/s");
  });

  it("formats requests/sec", () => {
    expect(formatValue(3000, { category: "requests_sec" })).toBe("3.00 Kreq/s");
  });

  it("formats IOPS", () => {
    expect(formatValue(50000, { category: "iops" })).toBe("50.00 KIOPS");
  });

  it("formats hertz", () => {
    expect(formatValue(2400000000, { category: "hertz" })).toBe("2.40 GHz");
  });

  it("formats USD currency", () => {
    expect(formatValue(42.5, { category: "currency_usd" })).toBe("$42.50");
    expect(formatValue(1500, { category: "currency_usd" })).toBe("$1.50K");
    expect(formatValue(2500000, { category: "currency_usd" })).toBe("$2.50M");
  });

  it("formats EUR currency", () => {
    expect(formatValue(99.99, { category: "currency_eur" })).toBe("€99.99");
  });

  it("formats GBP currency", () => {
    expect(formatValue(42, { category: "currency_gbp" })).toBe("£42.00");
  });

  it("formats custom suffix", () => {
    expect(formatValue(42, { category: "custom", customSuffix: "widgets" })).toBe("42.00 widgets");
  });

  it("respects custom decimals", () => {
    expect(formatValue(3.14159, { category: "none", decimals: 4 })).toBe("3.1416");
    expect(formatValue(3.14159, { category: "none", decimals: 0 })).toBe("3");
  });

  it("handles negative values", () => {
    expect(formatValue(-1024, { category: "bytes" })).toBe("-1.00 KB");
    expect(formatValue(-42.5, { category: "percent" })).toBe("-42.50%");
  });
});

describe("formatAxisTick", () => {
  it("returns empty for non-finite", () => {
    expect(formatAxisTick(NaN)).toBe("");
    expect(formatAxisTick(Infinity)).toBe("");
  });

  it("formats with 1 decimal by default", () => {
    expect(formatAxisTick(42)).toBe("42.0");
  });

  it("formats with unit config", () => {
    expect(formatAxisTick(1500, { category: "number" })).toBe("1.5K");
    expect(formatAxisTick(85.5, { category: "percent" })).toBe("85.5%");
  });
});

describe("getThresholdColor", () => {
  const steps = [
    { value: 0, color: "#22c55e" },
    { value: 70, color: "#f59e0b" },
    { value: 90, color: "#ef4444" },
  ];

  it("returns base color for null value", () => {
    expect(getThresholdColor(null, steps, "#666")).toBe("#666");
  });

  it("returns base color for empty steps", () => {
    expect(getThresholdColor(50, [], "#666")).toBe("#666");
  });

  it("returns green for low value", () => {
    expect(getThresholdColor(30, steps)).toBe("#22c55e");
  });

  it("returns yellow for medium value", () => {
    expect(getThresholdColor(75, steps)).toBe("#f59e0b");
  });

  it("returns red for high value", () => {
    expect(getThresholdColor(95, steps)).toBe("#ef4444");
  });

  it("handles exact boundary value", () => {
    expect(getThresholdColor(70, steps)).toBe("#f59e0b");
    expect(getThresholdColor(90, steps)).toBe("#ef4444");
  });

  it("handles unsorted steps", () => {
    const unsorted = [
      { value: 90, color: "#ef4444" },
      { value: 0, color: "#22c55e" },
      { value: 70, color: "#f59e0b" },
    ];
    expect(getThresholdColor(75, unsorted)).toBe("#f59e0b");
  });
});
