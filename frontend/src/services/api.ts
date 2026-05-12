import type {
  AdminTenant,
  AdminUser,
  AlertEvent,
  AlertPreviewResult,
  AlertRule,
  AlertRulePreview,
  Annotation,
  AnnotationCreate,
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
  AuthResponse,
  AuthUser,
  AWSAccount,
  AWSAccountCreate,
  AzureSubscription,
  AzureSubscriptionCreate,
  BatchQueryRequest,
  BatchStreamMessage,
  Dashboard,
  DashboardMyPermission,
  DashboardPermission,
  DashboardPermissionLevel,
  DashboardVersion,
  HealthStatus,
  FacetsResult,
  HistogramResult,
  LogQuery,
  LogQueryResult,
  MembershipInfo,
  MetricQuery,
  MetricQueryResult,
  MQLFunctionInfo,
  MQLQueryRequest,
  MQLValidateResponse,
  NotificationChannel,
  NotificationChannelCreate,
  NotificationDelivery,
  PlatformAuditEntry,
  PlatformStats,
  Resource,
  SecurityLogEntry,
  ResourceSummary,
  Silence,
  SilenceCreate,
  SystemStats,
  TenantAuditEntry,
  TenantWithRole,
  GenerateExternalIdResponse,
  VerifyAWSRequest,
  VerifyAWSResponse,
  DiscoverPreviewRequest,
  DiscoverPreviewResponse,
  VerifyAzureRequest,
  VerifyAzureResponse,
  AvailableRegionsResponse,
  AvailableServicesResponse,
  ResourceIssues,
  ResourceChange,
  ResourceGroup,
  ResourceTopology,
  TriggerDiscoveryRequest,
  TriggerDiscoveryResponse,
} from "../types";

const BASE = "/api/v1";

/** Safely extract a displayable string from any caught value. */
export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return JSON.stringify(e);
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )neoguard_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Auth endpoints that should NOT trigger a 401 redirect (to avoid loops). */
const AUTH_PATHS = ["/auth/login", "/auth/signup", "/auth/me", "/auth/logout",
  "/auth/password-reset/request", "/auth/password-reset/confirm"];

function isAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + "?"));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const method = options?.method?.toUpperCase() ?? "GET";
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const res = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
  });
  if (!res.ok) {
    // 401 handler: session expired — redirect to login (unless already on an auth endpoint)
    if (res.status === 401 && !isAuthPath(path)) {
      window.location.href = "/login";
      // Return a never-resolving promise so callers don't see an error flash
      return new Promise<T>(() => {});
    }

    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      const raw = parsed?.error?.message ?? parsed?.detail ?? body;
      const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
      const err = new Error(msg) as Error & { body?: unknown; status?: number };
      err.body = parsed;
      err.status = res.status;
      throw err;
    } catch (e) {
      if (e instanceof Error && !e.message.startsWith("API ")) throw e;
      throw new Error(`API ${res.status}: ${body}`);
    }
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}

export const api = {
  health: () => request<HealthStatus>("/health"),

  metrics: {
    query: (q: MetricQuery, opts?: { tenantId?: string }) => {
      const qs = opts?.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : "";
      return request<MetricQueryResult[]>(`${BASE}/metrics/query${qs}`, {
        method: "POST",
        body: JSON.stringify(q),
      });
    },
    queryBatch: (queries: MetricQuery[], opts?: { tenantId?: string }) => {
      const qs = opts?.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : "";
      return request<MetricQueryResult[][]>(`${BASE}/metrics/query/batch${qs}`, {
        method: "POST",
        body: JSON.stringify({ queries }),
      });
    },
    names: (opts?: { tenantId?: string; prefix?: string }) => {
      const params = new URLSearchParams();
      if (opts?.tenantId) params.set("tenant_id", opts.tenantId);
      if (opts?.prefix) params.set("prefix", opts.prefix);
      const qs = params.toString();
      return request<string[]>(`${BASE}/metrics/names${qs ? `?${qs}` : ""}`);
    },
    tagValues: (tag: string, opts?: { metric?: string; metric_prefix?: string; filters?: Record<string, string>; tenantId?: string }) => {
      const params = new URLSearchParams({ tag });
      if (opts?.metric) params.set("metric", opts.metric);
      if (opts?.metric_prefix) params.set("metric_prefix", opts.metric_prefix);
      if (opts?.filters && Object.keys(opts.filters).length > 0) {
        params.set("filters", JSON.stringify(opts.filters));
      }
      if (opts?.tenantId) params.set("tenant_id", opts.tenantId);
      return request<string[]>(`${BASE}/metrics/tag-values?${params}`);
    },
    resourceValues: (field: string, opts?: { resource_type?: string; provider?: string; filters?: Record<string, string> }) => {
      const params = new URLSearchParams({ field });
      if (opts?.resource_type) params.set("resource_type", opts.resource_type);
      if (opts?.provider) params.set("provider", opts.provider);
      if (opts?.filters && Object.keys(opts.filters).length > 0) {
        params.set("filters", JSON.stringify(opts.filters));
      }
      return request<string[]>(`${BASE}/metrics/resource-values?${params}`);
    },
    stats: () => request<Record<string, number>>(`${BASE}/metrics/stats`),
  },

  mql: {
    query: (q: MQLQueryRequest, opts?: { tenantId?: string }) => {
      const qs = opts?.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : "";
      return request<MetricQueryResult[]>(`${BASE}/mql/query${qs}`, {
        method: "POST",
        body: JSON.stringify(q),
      });
    },
    queryBatch: (queries: MQLQueryRequest[], opts?: { tenantId?: string }) => {
      const qs = opts?.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : "";
      return request<MetricQueryResult[][]>(`${BASE}/mql/query/batch${qs}`, {
        method: "POST",
        body: JSON.stringify({ queries }),
      });
    },
    validate: (q: MQLQueryRequest) =>
      request<MQLValidateResponse>(`${BASE}/mql/validate`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    /**
     * Streaming batch query using NDJSON.
     * Each line is yielded as it arrives, enabling progressive widget rendering.
     */
    batchQueryStream: async function* (req: BatchQueryRequest, signal?: AbortSignal, opts?: { tenantId?: string }): AsyncGenerator<BatchStreamMessage> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      const qs = opts?.tenantId ? `?tenant_id=${encodeURIComponent(opts.tenantId)}` : "";
      const response = await fetch(`${BASE}/mql/query/batch/stream${qs}`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(req),
        signal,
      });

      if (!response.ok) {
        const text = await response.text();
        try {
          const parsed = JSON.parse(text);
          throw new Error(parsed?.error?.message ?? parsed?.detail ?? text);
        } catch (e) {
          if (e instanceof Error && !e.message.startsWith("API ")) throw e;
          throw new Error(`API ${response.status}: ${text}`);
        }
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop()!;
          for (const line of lines) {
            if (line.trim()) {
              yield JSON.parse(line) as BatchStreamMessage;
            }
          }
        }
        // Flush remaining buffer
        if (buffer.trim()) {
          yield JSON.parse(buffer) as BatchStreamMessage;
        }
      } finally {
        reader.releaseLock();
      }
    },
  },

  metadata: {
    metrics: (q?: string, limit?: number) => {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (limit !== undefined) qs.set("limit", String(limit));
      const query = qs.toString();
      return request<string[]>(`${BASE}/metadata/metrics${query ? `?${query}` : ""}`);
    },
    tagKeys: (metric: string) =>
      request<string[]>(`${BASE}/metadata/metrics/${encodeURIComponent(metric)}/tag_keys`),
    tagValues: (metric: string, key: string, q?: string, limit?: number) => {
      const qs = new URLSearchParams({ key });
      if (q) qs.set("q", q);
      if (limit !== undefined) qs.set("limit", String(limit));
      return request<string[]>(
        `${BASE}/metadata/metrics/${encodeURIComponent(metric)}/tag_values?${qs}`,
      );
    },
    functions: () => request<MQLFunctionInfo[]>(`${BASE}/metadata/functions`),
  },

  logs: {
    query: (q: LogQuery) =>
      request<LogQueryResult>(`${BASE}/logs/query`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    histogram: (q: { start: string; end: string; service?: string; severity?: string; query?: string; buckets?: number }) =>
      request<HistogramResult>(`${BASE}/logs/histogram`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    facets: (q: { start: string; end: string; query?: string; service?: string; severity?: string }) =>
      request<FacetsResult>(`${BASE}/logs/facets`, {
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
    listEvents: (params?: { rule_id?: string; status?: string; severity?: string; start?: string; end?: string; limit?: number }, opts?: { tenantId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.rule_id) qs.set("rule_id", params.rule_id);
      if (params?.status) qs.set("status", params.status);
      if (params?.severity) qs.set("severity", params.severity);
      if (params?.start) qs.set("start", params.start);
      if (params?.end) qs.set("end", params.end);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (opts?.tenantId) qs.set("tenant_id", opts.tenantId);
      const query = qs.toString();
      return request<AlertEvent[]>(`${BASE}/alerts/events${query ? `?${query}` : ""}`);
    },
    acknowledgeEvent: (eventId: string, data: { acknowledged_by: string }) =>
      request<AlertEvent>(`${BASE}/alerts/events/${eventId}/ack`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    previewRule: (data: AlertRulePreview) =>
      request<AlertPreviewResult>(`${BASE}/alerts/rules/preview`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
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
    issues: () => request<ResourceIssues>(`${BASE}/resources/issues`),
    changes: (params?: { resource_id?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.resource_id) qs.set("resource_id", params.resource_id);
      if (params?.limit) qs.set("limit", String(params.limit));
      const query = qs.toString();
      return request<ResourceChange[]>(`${BASE}/resources/changes${query ? `?${query}` : ""}`);
    },
    resourceChanges: (resourceId: string, limit?: number) => {
      const qs = limit ? `?limit=${limit}` : "";
      return request<ResourceChange[]>(`${BASE}/resources/${resourceId}/changes${qs}`);
    },
    grouping: (groupBy?: string) => {
      const qs = groupBy ? `?group_by=${groupBy}` : "";
      return request<ResourceGroup[]>(`${BASE}/resources/grouping${qs}`);
    },
    topology: (accountId?: string) => {
      const qs = accountId ? `?account_id=${accountId}` : "";
      return request<ResourceTopology>(`${BASE}/resources/topology${qs}`);
    },
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
    listDeliveries: (params?: { rule_id?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.rule_id) qs.set("rule_id", params.rule_id);
      if (params?.limit) qs.set("limit", String(params.limit));
      const query = qs.toString();
      return request<NotificationDelivery[]>(`${BASE}/notifications/delivery${query ? `?${query}` : ""}`);
    },
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
    featureFlags: () => request<Record<string, boolean>>(`${BASE}/system/feature-flags`),
  },

  dashboards: {
    list: (params?: { search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set("search", params.search);
      const query = qs.toString();
      return request<Dashboard[]>(`${BASE}/dashboards${query ? `?${query}` : ""}`);
    },
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
    listFavorites: () => request<string[]>(`${BASE}/dashboards/favorites`),
    toggleFavorite: (id: string) =>
      request<{ favorited: boolean }>(`${BASE}/dashboards/${id}/favorite`, { method: "POST" }),
    duplicate: (id: string) =>
      request<Dashboard>(`${BASE}/dashboards/${id}/duplicate`, { method: "POST" }),
    exportJson: (id: string) =>
      request<Record<string, unknown>>(`${BASE}/dashboards/${id}/export`),
    importJson: (payload: Record<string, unknown>) =>
      request<Dashboard>(`${BASE}/dashboards/import`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    listVersions: (id: string) =>
      request<DashboardVersion[]>(`${BASE}/dashboards/${id}/versions`),
    getVersion: (id: string, version: number) =>
      request<DashboardVersion>(`${BASE}/dashboards/${id}/versions/${version}`),
    restoreVersion: (id: string, version: number) =>
      request<Dashboard>(`${BASE}/dashboards/${id}/versions/${version}/restore`, { method: "POST" }),
    getPermissions: (id: string) =>
      request<DashboardPermission[]>(`${BASE}/dashboards/${id}/permissions`),
    setPermission: (id: string, userId: string, permission: DashboardPermissionLevel) =>
      request<DashboardPermission>(`${BASE}/dashboards/${id}/permissions`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, permission }),
      }),
    removePermission: (id: string, userId: string) =>
      request<{ message: string }>(`${BASE}/dashboards/${id}/permissions/${userId}`, { method: "DELETE" }),
    getMyPermission: (id: string) =>
      request<DashboardMyPermission>(`${BASE}/dashboards/${id}/my-permission`),
  },

  auth: {
    signup: (data: { email: string; password: string; name: string; tenant_name: string }) =>
      request<AuthResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ message: string }>("/auth/logout", { method: "POST" }),
    me: () => request<AuthResponse>("/auth/me"),
    updateProfile: (data: { name?: string; current_password?: string; new_password?: string }) =>
      request<AuthUser>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    requestPasswordReset: (email: string) =>
      request<{ message: string }>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    confirmPasswordReset: (token: string, new_password: string) =>
      request<{ message: string }>("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, new_password }),
      }),
    sessions: () =>
      request<{ session_id: string; tenant_id: string; role: string; is_super_admin: boolean; ttl_seconds: number; is_current: boolean }[]>("/auth/sessions"),
    terminateAllSessions: () =>
      request<{ message: string; terminated: number }>("/auth/sessions", { method: "DELETE" }),
  },

  tenants: {
    list: () => request<TenantWithRole[]>(`${BASE}/tenants`),
    create: (data: { name: string; slug: string }) =>
      request<TenantWithRole>(`${BASE}/tenants`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    switchTenant: (tenantId: string) =>
      request<{ message: string; tenant_id: string; role: string }>(
        `${BASE}/tenants/${tenantId}/switch`,
        { method: "POST" },
      ),
    members: (tenantId: string) =>
      request<MembershipInfo[]>(`${BASE}/tenants/${tenantId}/members`),
    invite: (tenantId: string, data: { email: string; role?: string }) =>
      request<{ message: string; role: string }>(
        `${BASE}/tenants/${tenantId}/invite`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    changeRole: (tenantId: string, memberId: string, role: string) =>
      request<{ message: string; role: string }>(
        `${BASE}/tenants/${tenantId}/members/${memberId}/role`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    removeMember: (tenantId: string, memberId: string) =>
      request<void>(`${BASE}/tenants/${tenantId}/members/${memberId}`, {
        method: "DELETE",
      }),
    update: (tenantId: string, data: { name?: string }) =>
      request<TenantWithRole>(`${BASE}/tenants/${tenantId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    auditLog: (tenantId: string, params?: { limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<TenantAuditEntry[]>(`${BASE}/tenants/${tenantId}/audit-log${query ? `?${query}` : ""}`);
    },
  },

  annotations: {
    list: (params?: { dashboard_id?: string; from?: string; to?: string; limit?: number }, opts?: { tenantId?: string }) => {
      const qs = new URLSearchParams();
      if (params?.dashboard_id) qs.set("dashboard_id", params.dashboard_id);
      if (params?.from) qs.set("from", params.from);
      if (params?.to) qs.set("to", params.to);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (opts?.tenantId) qs.set("tenant_id", opts.tenantId);
      const query = qs.toString();
      return request<Annotation[]>(`${BASE}/annotations${query ? `?${query}` : ""}`);
    },
    create: (data: AnnotationCreate) =>
      request<Annotation>(`${BASE}/annotations`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<AnnotationCreate>) =>
      request<Annotation>(`${BASE}/annotations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`${BASE}/annotations/${id}`, { method: "DELETE" }),
  },

  admin: {
    stats: () => request<PlatformStats>(`${BASE}/admin/stats`),
    tenants: (params?: { status?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<AdminTenant[]>(`${BASE}/admin/tenants${query ? `?${query}` : ""}`);
    },
    createTenant: (data: { name: string; owner_id?: string }) =>
      request<AdminTenant>(`${BASE}/admin/tenants`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    setTenantStatus: (tenantId: string, status: string) =>
      request<AdminTenant>(`${BASE}/admin/tenants/${tenantId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    deleteTenant: (tenantId: string) =>
      request<{ message: string }>(`${BASE}/admin/tenants/${tenantId}`, { method: "DELETE" }),
    users: (params?: { limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<AdminUser[]>(`${BASE}/admin/users${query ? `?${query}` : ""}`);
    },
    createUser: (data: { email: string; password: string; name: string; tenant_id?: string; role?: string }) =>
      request<AdminUser>(`${BASE}/admin/users`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    setSuperAdmin: (userId: string, isSuperAdmin: boolean) =>
      request<AdminUser>(`${BASE}/admin/users/${userId}/super-admin`, {
        method: "PATCH",
        body: JSON.stringify({ is_super_admin: isSuperAdmin }),
      }),
    setUserActive: (userId: string, isActive: boolean) =>
      request<AdminUser>(`${BASE}/admin/users/${userId}/active`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      }),
    auditLog: (params?: { limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<PlatformAuditEntry[]>(`${BASE}/admin/audit-log${query ? `?${query}` : ""}`);
    },
    securityLog: (params?: { event_type?: string; success?: boolean; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.event_type) qs.set("event_type", params.event_type);
      if (params?.success !== undefined) qs.set("success", String(params.success));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      return request<SecurityLogEntry[]>(`${BASE}/admin/security-log${query ? `?${query}` : ""}`);
    },
    impersonate: (userId: string, reason: string, durationMinutes: number = 30) =>
      request<{ message: string; impersonating: string; expires_in_minutes: number }>(
        `${BASE}/admin/impersonate`,
        {
          method: "POST",
          body: JSON.stringify({ user_id: userId, reason, duration_minutes: durationMinutes }),
        },
      ),
    endImpersonation: () =>
      request<{ message: string }>(`${BASE}/admin/end-impersonation`, {
        method: "POST",
      }),
    tenantMembers: (tenantId: string) =>
      request<MembershipInfo[]>(`${BASE}/admin/tenants/${tenantId}/members`),
    userTenants: (userId: string) =>
      request<{ id: string; slug: string; name: string; tier: string; status: string; created_at: string; role: string }[]>(
        `${BASE}/admin/users/${userId}/tenants`,
      ),
    addUserToTenant: (userId: string, tenantId: string, role: string) =>
      request<{ message: string; role: string }>(
        `${BASE}/admin/users/${userId}/tenants/${tenantId}`,
        { method: "POST", body: JSON.stringify({ role }) },
      ),
    changeUserRole: (userId: string, tenantId: string, role: string) =>
      request<{ message: string; role: string }>(
        `${BASE}/admin/users/${userId}/tenants/${tenantId}/role`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    removeUserFromTenant: (userId: string, tenantId: string) =>
      request<{ message: string }>(
        `${BASE}/admin/users/${userId}/tenants/${tenantId}`,
        { method: "DELETE" },
      ),
  },

  collection: {
    triggerDiscovery: (data: TriggerDiscoveryRequest) =>
      request<TriggerDiscoveryResponse>(`${BASE}/collection/discover`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  onboarding: {
    generateExternalId: () =>
      request<GenerateExternalIdResponse>(`${BASE}/onboarding/generate-external-id`, {
        method: "POST",
      }),
    verifyAws: (data: VerifyAWSRequest) =>
      request<VerifyAWSResponse>(`${BASE}/onboarding/verify-aws`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    discoverPreview: (data: DiscoverPreviewRequest) =>
      request<DiscoverPreviewResponse>(`${BASE}/onboarding/discover-preview`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    verifyAzure: (data: VerifyAzureRequest) =>
      request<VerifyAzureResponse>(`${BASE}/onboarding/verify-azure`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    regions: () => request<AvailableRegionsResponse>(`${BASE}/onboarding/regions`),
    services: () => request<AvailableServicesResponse>(`${BASE}/onboarding/services`),
  },
};
