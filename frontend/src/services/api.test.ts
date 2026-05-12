import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("api request 401 handling", () => {
  let originalFetch: typeof globalThis.fetch;
  let locationHrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    locationHrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { pathname: "/dashboards", href: "/dashboards" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: locationHrefSetter,
      get: () => "/dashboards",
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("redirects to /login on 401 from non-auth endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":{"message":"Unauthorized"}}'),
    });

    const { api } = await import("./api");
    // This will trigger the 401 handler which sets window.location.href
    // and returns a never-resolving promise, so we race with a timeout
    const result = await Promise.race([
      api.alerts.listRules().catch(() => "error"),
      new Promise((r) => setTimeout(() => r("pending"), 50)),
    ]);

    expect(locationHrefSetter).toHaveBeenCalledWith("/login");
    expect(result).toBe("pending"); // never-resolving promise
  });

  it("does NOT redirect when already on /login (prevents infinite loop)", async () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/login", href: "/login" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: locationHrefSetter,
      get: () => "/login",
      configurable: true,
    });
    Object.defineProperty(window.location, "pathname", {
      get: () => "/login",
      configurable: true,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":{"message":"Unauthorized"}}'),
    });

    const { api } = await import("./api");
    // Should throw the error instead of redirecting
    await expect(api.alerts.listRules()).rejects.toThrow("Unauthorized");
    expect(locationHrefSetter).not.toHaveBeenCalled();
  });

  it("does NOT redirect on 401 for auth endpoints", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":{"message":"Invalid credentials"}}'),
    });

    const { api } = await import("./api");
    await expect(
      api.auth.login({ email: "x", password: "y" })
    ).rejects.toThrow("Invalid credentials");
    expect(locationHrefSetter).not.toHaveBeenCalled();
  });
});
