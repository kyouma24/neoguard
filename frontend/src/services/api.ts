import type {
  AlertEvent,
  AlertRule,
  Dashboard,
  HealthStatus,
  LogQuery,
  LogQueryResult,
  MetricQuery,
  MetricQueryResult,
} from "../types";

const BASE = "/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  metrics: {
    query: (q: MetricQuery) =>
      request<MetricQueryResult[]>(`${BASE}/metrics/query`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    names: () => request<string[]>(`${BASE}/metrics/names`),
    stats: () => request<Record<string, number>>(`${BASE}/metrics/stats`),
  },

  logs: {
    query: (q: LogQuery) =>
      request<LogQueryResult>(`${BASE}/logs/query`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    stats: () => request<Record<string, number>>(`${BASE}/logs/stats`),
  },

  alerts: {
    listRules: () => request<AlertRule[]>(`${BASE}/alerts/rules`),
    getRule: (id: string) => request<AlertRule>(`${BASE}/alerts/rules/${id}`),
    createRule: (data: Partial<AlertRule>) =>
      request<AlertRule>(`${BASE}/alerts/rules`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateRule: (id: string, data: Partial<AlertRule>) =>
      request<AlertRule>(`${BASE}/alerts/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteRule: (id: string) =>
      request<void>(`${BASE}/alerts/rules/${id}`, { method: "DELETE" }),
    listEvents: (params?: { rule_id?: string; status?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.rule_id) qs.set("rule_id", params.rule_id);
      if (params?.status) qs.set("status", params.status);
      if (params?.limit) qs.set("limit", String(params.limit));
      const query = qs.toString();
      return request<AlertEvent[]>(`${BASE}/alerts/events${query ? `?${query}` : ""}`);
    },
  },

  dashboards: {
    list: () => request<Dashboard[]>(`${BASE}/dashboards`),
    get: (id: string) => request<Dashboard>(`${BASE}/dashboards/${id}`),
    create: (data: Partial<Dashboard>) =>
      request<Dashboard>(`${BASE}/dashboards`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Dashboard>) =>
      request<Dashboard>(`${BASE}/dashboards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/dashboards/${id}`, { method: "DELETE" }),
  },
};
