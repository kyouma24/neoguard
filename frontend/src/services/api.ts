import type {
  AdminTenant,
  AdminUser,
  AlertEvent,
  AlertPreviewResult,
  AlertRule,
  AlertRulePreview,
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
  AuthResponse,
  AuthUser,
  AWSAccount,
  AWSAccountCreate,
  AzureSubscription,
  AzureSubscriptionCreate,
  Dashboard,
  HealthStatus,
  LogQuery,
  LogQueryResult,
  MembershipInfo,
  MetricQuery,
  MetricQueryResult,
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
    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      const raw = parsed?.error?.message ?? parsed?.detail ?? body;
      const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
      throw new Error(msg);
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
    query: (q: MetricQuery) =>
      request<MetricQueryResult[]>(`${BASE}/metrics/query`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    queryBatch: (queries: MetricQuery[]) =>
      request<MetricQueryResult[][]>(`${BASE}/metrics/query/batch`, {
        method: "POST",
        body: JSON.stringify({ queries }),
      }),
    names: () => request<string[]>(`${BASE}/metrics/names`),
    stats: () => request<Record<string, number>>(`${BASE}/metrics/stats`),
  },

  mql: {
    query: (q: MQLQueryRequest) =>
      request<MetricQueryResult[]>(`${BASE}/mql/query`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
    queryBatch: (queries: MQLQueryRequest[]) =>
      request<MetricQueryResult[][]>(`${BASE}/mql/query/batch`, {
        method: "POST",
        body: JSON.stringify({ queries }),
      }),
    validate: (q: MQLQueryRequest) =>
      request<MQLValidateResponse>(`${BASE}/mql/validate`, {
        method: "POST",
        body: JSON.stringify(q),
      }),
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
    listEvents: (params?: { rule_id?: string; status?: string; severity?: string; start?: string; end?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.rule_id) qs.set("rule_id", params.rule_id);
      if (params?.status) qs.set("status", params.status);
      if (params?.severity) qs.set("severity", params.severity);
      if (params?.start) qs.set("start", params.start);
      if (params?.end) qs.set("end", params.end);
      if (params?.limit) qs.set("limit", String(params.limit));
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
    duplicate: (id: string) =>
      request<Dashboard>(`${BASE}/dashboards/${id}/duplicate`, { method: "POST" }),
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
  },
};
