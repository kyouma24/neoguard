import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { createElement, type ReactNode } from "react";
import {
  useDashboardList,
  useDashboard,
  useDeleteDashboard,
  useDuplicateDashboard,
  useCreateDashboard,
  dashboardKeys,
} from "./useDashboards";
import { api } from "../services/api";
import type { Dashboard } from "../types";

vi.mock("../services/api", () => ({
  api: {
    dashboards: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
  },
}));

const NOW = "2026-05-01T12:00:00Z";

const DASHBOARD_1: Dashboard = {
  id: "d1",
  tenant_id: "t1",
  name: "Production Overview",
  description: "Key production metrics",
  panels: [],
  variables: [],
  groups: [],
  created_at: NOW,
  updated_at: NOW,
};

const DASHBOARD_2: Dashboard = {
  id: "d2",
  tenant_id: "t1",
  name: "API Monitoring",
  description: "API latency and throughput",
  panels: [],
  variables: [],
  groups: [],
  created_at: NOW,
  updated_at: NOW,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useDashboards hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("dashboardKeys", () => {
    it("generates correct key structures", () => {
      expect(dashboardKeys.all).toEqual(["dashboards"]);
      expect(dashboardKeys.lists()).toEqual(["dashboards", "list"]);
      expect(dashboardKeys.list("test")).toEqual(["dashboards", "list", { search: "test" }]);
      expect(dashboardKeys.list()).toEqual(["dashboards", "list", { search: undefined }]);
      expect(dashboardKeys.details()).toEqual(["dashboards", "detail"]);
      expect(dashboardKeys.detail("d1")).toEqual(["dashboards", "detail", "d1"]);
    });
  });

  describe("useDashboardList", () => {
    it("fetches dashboard list via api.dashboards.list", async () => {
      (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1, DASHBOARD_2]);
      const wrapper = createWrapper();

      const { result } = renderHook(() => useDashboardList(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.dashboards.list).toHaveBeenCalledWith(undefined);
      expect(result.current.data).toEqual([DASHBOARD_1, DASHBOARD_2]);
    });

    it("passes search param when provided", async () => {
      (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1]);
      const wrapper = createWrapper();

      const { result } = renderHook(() => useDashboardList("prod"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.dashboards.list).toHaveBeenCalledWith({ search: "prod" });
      expect(result.current.data).toEqual([DASHBOARD_1]);
    });

    it("returns error state on failure", async () => {
      (api.dashboards.list as Mock).mockRejectedValue(new Error("Network error"));
      const wrapper = createWrapper();

      const { result } = renderHook(() => useDashboardList(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe("Network error");
    });
  });

  describe("useDashboard", () => {
    it("fetches single dashboard by ID", async () => {
      (api.dashboards.get as Mock).mockResolvedValue(DASHBOARD_1);
      const wrapper = createWrapper();

      const { result } = renderHook(() => useDashboard("d1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(api.dashboards.get).toHaveBeenCalledWith("d1");
      expect(result.current.data).toEqual(DASHBOARD_1);
    });

    it("does not fetch when id is undefined", async () => {
      const wrapper = createWrapper();

      const { result } = renderHook(() => useDashboard(undefined), { wrapper });

      // Should remain in idle/pending state without fetching
      expect(result.current.fetchStatus).toBe("idle");
      expect(api.dashboards.get).not.toHaveBeenCalled();
    });
  });

  describe("useDeleteDashboard", () => {
    it("calls api.dashboards.delete and invalidates list cache", async () => {
      (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1, DASHBOARD_2]);
      (api.dashboards.delete as Mock).mockResolvedValue(undefined);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      // Pre-populate the cache
      const { result: listResult } = renderHook(() => useDashboardList(), { wrapper });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      const { result } = renderHook(() => useDeleteDashboard(), { wrapper });

      await result.current.mutateAsync("d1");

      expect(api.dashboards.delete).toHaveBeenCalledWith("d1");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: dashboardKeys.lists(),
      });
    });
  });

  describe("useDuplicateDashboard", () => {
    it("calls api.dashboards.duplicate and invalidates list cache", async () => {
      const duplicated = { ...DASHBOARD_1, id: "d-dup", name: "Production Overview (Copy)" };
      (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1]);
      (api.dashboards.duplicate as Mock).mockResolvedValue(duplicated);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result: listResult } = renderHook(() => useDashboardList(), { wrapper });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      const { result } = renderHook(() => useDuplicateDashboard(), { wrapper });

      const returned = await result.current.mutateAsync("d1");

      expect(api.dashboards.duplicate).toHaveBeenCalledWith("d1");
      expect(returned).toEqual(duplicated);
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: dashboardKeys.lists(),
      });
    });
  });

  describe("useCreateDashboard", () => {
    it("calls api.dashboards.create and invalidates list cache", async () => {
      const created = { ...DASHBOARD_1, id: "d-new", name: "New Dashboard" };
      (api.dashboards.list as Mock).mockResolvedValue([DASHBOARD_1]);
      (api.dashboards.create as Mock).mockResolvedValue(created);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);

      const { result: listResult } = renderHook(() => useDashboardList(), { wrapper });
      await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

      const { result } = renderHook(() => useCreateDashboard(), { wrapper });

      const returned = await result.current.mutateAsync({
        name: "New Dashboard",
        description: "",
        panels: [],
      });

      expect(api.dashboards.create).toHaveBeenCalledWith({
        name: "New Dashboard",
        description: "",
        panels: [],
      });
      expect(returned).toEqual(created);
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: dashboardKeys.lists(),
      });
    });
  });
});
