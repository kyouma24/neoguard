import { describe, it, expect } from "vitest";
import { isSafeHref } from "./sanitize";

describe("isSafeHref", () => {
  it("allows https URLs", () => {
    expect(isSafeHref("https://example.com")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeHref("http://example.com")).toBe(true);
  });

  it("allows mailto links", () => {
    expect(isSafeHref("mailto:user@example.com")).toBe(true);
  });

  it("allows relative paths", () => {
    expect(isSafeHref("/dashboard/123")).toBe(true);
  });

  it("rejects javascript: URIs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
  });

  it("rejects javascript: with mixed case", () => {
    expect(isSafeHref("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isSafeHref("JavaScript:alert(1)")).toBe(false);
  });

  it("rejects javascript: with leading whitespace", () => {
    expect(isSafeHref("  javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URIs", () => {
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects vbscript: URIs", () => {
    expect(isSafeHref("vbscript:MsgBox")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeHref("")).toBe(false);
  });

  it("rejects null", () => {
    expect(isSafeHref(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isSafeHref(undefined)).toBe(false);
  });

  it("rejects ftp protocol", () => {
    expect(isSafeHref("ftp://example.com")).toBe(false);
  });

  it("rejects bare domains", () => {
    expect(isSafeHref("example.com")).toBe(false);
  });
});
