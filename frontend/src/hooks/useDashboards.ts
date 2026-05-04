import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import type { Dashboard } from "../types";

export const dashboardKeys = {
  all: ["dashboards"] as const,
  lists: () => [...dashboardKeys.all, "list"] as const,
  list: (search?: string) => [...dashboardKeys.lists(), { search }] as const,
  details: () => [...dashboardKeys.all, "detail"] as const,
  detail: (id: string) => [...dashboardKeys.details(), id] as const,
};

export function useDashboardList(search?: string) {
  return useQuery({
    queryKey: dashboardKeys.list(search),
    queryFn: () => api.dashboards.list(search ? { search } : undefined),
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: dashboardKeys.detail(id!),
    queryFn: () => api.dashboards.get(id!),
    enabled: !!id,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Dashboard>) => api.dashboards.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.dashboards.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}

export function useDuplicateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.dashboards.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.lists() });
    },
  });
}
