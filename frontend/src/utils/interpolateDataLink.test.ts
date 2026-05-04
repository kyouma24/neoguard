import { describe, it, expect } from "vitest";
import { interpolateUrl } from "./interpolateDataLink";

describe("interpolateUrl", () => {
  it("replaces __value placeholder", () => {
    expect(interpolateUrl("http://example.com?v=${__value}", { value: 42 })).toBe(
      "http://example.com?v=42",
    );
  });

  it("replaces __time placeholder with URL encoding", () => {
    expect(
      interpolateUrl("http://example.com?t=${__time}", { time: "2026-05-01T12:00:00Z" }),
    ).toBe("http://example.com?t=2026-05-01T12%3A00%3A00Z");
  });

  it("replaces __series.name placeholder", () => {
    expect(
      interpolateUrl("http://example.com?s=${__series.name}", { seriesName: "cpu_usage" }),
    ).toBe("http://example.com?s=cpu_usage");
  });

  it("replaces custom variable placeholders", () => {
    expect(
      interpolateUrl("http://example.com/${env}/${region}", {
        variables: { env: "production", region: "us-east-1" },
      }),
    ).toBe("http://example.com/production/us-east-1");
  });

  it("replaces multiple occurrences of same placeholder", () => {
    expect(
      interpolateUrl("${__value} and ${__value}", { value: 7 }),
    ).toBe("7 and 7");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(interpolateUrl("http://example.com/${unknown}", {})).toBe(
      "http://example.com/${unknown}",
    );
  });

  it("handles null/undefined value gracefully", () => {
    expect(interpolateUrl("http://example.com?v=${__value}", { value: null })).toBe(
      "http://example.com?v=${__value}",
    );
  });

  it("handles all placeholders together", () => {
    const result = interpolateUrl(
      "http://example.com?v=${__value}&t=${__time}&s=${__series.name}&env=${env}",
      {
        value: 99.5,
        time: "2026-05-01T00:00:00Z",
        seriesName: "cpu",
        variables: { env: "staging" },
      },
    );
    expect(result).toBe("http://example.com?v=99.5&t=2026-05-01T00%3A00%3A00Z&s=cpu&env=staging");
  });

  it("handles empty template", () => {
    expect(interpolateUrl("", { value: 1 })).toBe("");
  });

  it("URL-encodes special characters in series name", () => {
    expect(
      interpolateUrl("http://example.com?s=${__series.name}", { seriesName: "cpu{host:web-1}" }),
    ).toBe("http://example.com?s=cpu%7Bhost%3Aweb-1%7D");
  });

  it("URL-encodes special characters in variable values", () => {
    expect(
      interpolateUrl("http://example.com/${env}", {
        variables: { env: "prod & staging" },
      }),
    ).toBe("http://example.com/prod%20%26%20staging");
  });
});
