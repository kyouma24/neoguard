import { describe, it, expect } from "vitest";
import { applyValueMapping } from "./valueMapping";
import type { ValueMapping } from "../types/display-options";

describe("applyValueMapping", () => {
  const mappings: ValueMapping[] = [
    { type: "value", match: 0, displayText: "Down", color: "#ef4444" },
    { type: "value", match: 1, displayText: "Healthy", color: "#22c55e" },
    { type: "range", from: 80, to: 100, displayText: "High", color: "#f59e0b" },
    { type: "range", from: 0, to: 10, displayText: "Low", color: "#3b82f6" },
  ];

  it("returns null for null value", () => {
    expect(applyValueMapping(null, mappings)).toBeNull();
  });

  it("returns null for undefined value", () => {
    expect(applyValueMapping(undefined, mappings)).toBeNull();
  });

  it("returns null when no mappings provided", () => {
    expect(applyValueMapping(42)).toBeNull();
    expect(applyValueMapping(42, [])).toBeNull();
  });

  it("matches exact value mapping", () => {
    const result = applyValueMapping(1, mappings);
    expect(result).toEqual({ text: "Healthy", color: "#22c55e" });
  });

  it("matches zero as exact value", () => {
    const result = applyValueMapping(0, mappings);
    expect(result).toEqual({ text: "Down", color: "#ef4444" });
  });

  it("matches range mapping", () => {
    const result = applyValueMapping(90, mappings);
    expect(result).toEqual({ text: "High", color: "#f59e0b" });
  });

  it("matches range boundary (inclusive)", () => {
    expect(applyValueMapping(80, mappings)).toEqual({ text: "High", color: "#f59e0b" });
    expect(applyValueMapping(100, mappings)).toEqual({ text: "High", color: "#f59e0b" });
  });

  it("returns null when no mapping matches", () => {
    expect(applyValueMapping(50, mappings)).toBeNull();
  });

  it("exact value takes priority over range", () => {
    const result = applyValueMapping(0, mappings);
    expect(result?.text).toBe("Down");
  });

  it("handles range with no lower bound", () => {
    const m: ValueMapping[] = [{ type: "range", to: 10, displayText: "Low" }];
    expect(applyValueMapping(-5, m)).toEqual({ text: "Low", color: undefined });
  });

  it("handles range with no upper bound", () => {
    const m: ValueMapping[] = [{ type: "range", from: 90, displayText: "High" }];
    expect(applyValueMapping(999, m)).toEqual({ text: "High", color: undefined });
  });

  it("handles mapping without color", () => {
    const m: ValueMapping[] = [{ type: "value", match: 42, displayText: "Magic" }];
    const result = applyValueMapping(42, m);
    expect(result).toEqual({ text: "Magic", color: undefined });
  });
});
