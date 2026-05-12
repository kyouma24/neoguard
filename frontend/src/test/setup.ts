import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement IntersectionObserver — provide a no-op mock
// so components that use it (useVisiblePanels) don't throw in tests.
// Tests that need to simulate intersection behavior should provide their own mock.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [0];
    constructor(_cb: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  } as unknown as typeof globalThis.IntersectionObserver;
}

// jsdom doesn't implement MutationObserver in all envs
if (typeof globalThis.MutationObserver === "undefined") {
  globalThis.MutationObserver = class MutationObserver {
    constructor(_cb: MutationCallback) {}
    observe() {}
    disconnect() {}
    takeRecords(): MutationRecord[] { return []; }
  } as unknown as typeof globalThis.MutationObserver;
}
