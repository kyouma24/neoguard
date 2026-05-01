import type {
  AlertEvent,
  AlertRule,
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
  AWSAccount,
  AWSAccountCreate,
  AzureSubscription,
  AzureSubscriptionCreate,
  Dashboard,
  HealthStatus,
  LogQuery,
  LogQueryResult,
  MetricQuery,
  MetricQueryResult,
  NotificationChannel,
  NotificationChannelCreate,
  Resource,
  ResourceSummary,
  Silence,
  SilenceCreate,
  SystemStats,
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
    listSilences: () => request<Silence[]>(`${BASE}/alerts/silences`),
    getSilence: (id: string) => request<Silence>(`${BASE}/alerts/silences/${id}`),
    createSilence: (data: SilenceCreate) =>
      request<Silence>(`${BASE}/alerts/silences`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateSilence: (id: string, data: Partial<Silence>) =>
      request<Silence>(`${BASE}/alerts/silences/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteSilence: (id: string) =>
      request<void>(`${BASE}/alerts/silences/${id}`, { method: "DELETE" }),
  },

  resources: {
    list: (params?: {
      resource_type?: string;
      provider?: string;
      account_id?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.resource_type) qs.set("resource_type", params.resource_type);
      if (params?.provider) qs.set("provider", params.provider);
      if (params?.account_id) qs.set("account_id", params.account_id);
      if (params?.status) qs.set("status", params.status);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<Resource[]>(`${BASE}/resources${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<Resource>(`${BASE}/resources/${id}`),
    summary: () => request<ResourceSummary>(`${BASE}/resources/summary`),
  },

  aws: {
    listAccounts: () => request<AWSAccount[]>(`${BASE}/aws/accounts`),
    getAccount: (id: string) => request<AWSAccount>(`${BASE}/aws/accounts/${id}`),
    createAccount: (data: AWSAccountCreate) =>
      request<AWSAccount>(`${BASE}/aws/accounts`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateAccount: (id: string, data: Partial<AWSAccountCreate> & { enabled?: boolean }) =>
      request<AWSAccount>(`${BASE}/aws/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteAccount: (id: string) =>
      request<void>(`${BASE}/aws/accounts/${id}`, { method: "DELETE" }),
  },

  azure: {
    listSubscriptions: () => request<AzureSubscription[]>(`${BASE}/azure/subscriptions`),
    getSubscription: (id: string) => request<AzureSubscription>(`${BASE}/azure/subscriptions/${id}`),
    createSubscription: (data: AzureSubscriptionCreate) =>
      request<AzureSubscription>(`${BASE}/azure/subscriptions`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateSubscription: (id: string, data: Partial<AzureSubscriptionCreate> & { enabled?: boolean }) =>
      request<AzureSubscription>(`${BASE}/azure/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteSubscription: (id: string) =>
      request<void>(`${BASE}/azure/subscriptions/${id}`, { method: "DELETE" }),
  },

  notifications: {
    listChannels: () => request<NotificationChannel[]>(`${BASE}/notifications/channels`),
    getChannel: (id: string) => request<NotificationChannel>(`${BASE}/notifications/channels/${id}`),
    createChannel: (data: NotificationChannelCreate) =>
      request<NotificationChannel>(`${BASE}/notifications/channels`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateChannel: (id: string, data: Partial<NotificationChannelCreate>) =>
      request<NotificationChannel>(`${BASE}/notifications/channels/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteChannel: (id: string) =>
      request<void>(`${BASE}/notifications/channels/${id}`, { method: "DELETE" }),
    testChannel: (id: string) =>
      request<{ success: boolean; meta?: Record<string, unknown> }>(
        `${BASE}/notifications/channels/${id}/test`,
        { method: "POST" },
      ),
  },

  apiKeys: {
    list: () => request<APIKey[]>(`${BASE}/auth/keys`),
    get: (id: string) => request<APIKey>(`${BASE}/auth/keys/${id}`),
    create: (data: APIKeyCreate) =>
      request<APIKeyCreated>(`${BASE}/auth/keys`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name?: string; scopes?: string[]; rate_limit?: number; enabled?: boolean; expires_at?: string | null }) =>
      request<APIKey>(`${BASE}/auth/keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/auth/keys/${id}`, { method: "DELETE" }),
  },

  system: {
    stats: () => request<SystemStats>(`${BASE}/system/stats`),
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
