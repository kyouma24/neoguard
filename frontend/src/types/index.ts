export interface MetricPoint {
  name: string;
  value: number;
  timestamp?: string;
  tags: Record<string, string>;
  metric_type: "gauge" | "counter" | "histogram";
}

export interface MetricQuery {
  name: string;
  tags?: Record<string, string>;
  start: string;
  end: string;
  interval?: string;
  aggregation?: string;
}

export interface MetricQueryResult {
  name: string;
  tags: Record<string, string>;
  datapoints: [string, number | null][];
}

export interface MQLQueryRequest {
  query: string;
  start: string;
  end: string;
  interval?: string;
}

export interface MQLValidateResponse {
  valid: boolean;
  aggregator?: string | null;
  metric_name?: string | null;
  filter_count: number;
  function_count: number;
  has_rollup: boolean;
  error?: string | null;
  error_pos?: number | null;
}

export interface LogEntry {
  timestamp: string;
  severity: string;
  service: string;
  message: string;
  trace_id: string;
  span_id: string;
  attributes: Record<string, string>;
  resource: Record<string, string>;
}

export interface LogQuery {
  query?: string;
  service?: string;
  severity?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

export interface LogQueryResult {
  logs: LogEntry[];
  total: number;
  has_more: boolean;
}

export type AggregationType = "avg" | "min" | "max" | "sum" | "count" | "last" | "p95" | "p99";
export type NoDataAction = "ok" | "keep" | "alert";

export interface AlertRule {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  metric_name: string;
  tags_filter: Record<string, string>;
  condition: string;
  threshold: number;
  duration_sec: number;
  interval_sec: number;
  severity: string;
  enabled: boolean;
  notification: Record<string, unknown>;
  aggregation: AggregationType;
  cooldown_sec: number;
  nodata_action: NoDataAction;
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  status: string;
  value: number;
  threshold: number;
  message: string;
  fired_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string;
}

export interface AlertAcknowledge {
  acknowledged_by: string;
}

export interface AlertRulePreview {
  metric_name: string;
  tags_filter?: Record<string, string>;
  condition: string;
  threshold: number;
  duration_sec: number;
  aggregation: AggregationType;
  lookback_hours?: number;
}

export interface AlertPreviewResult {
  would_fire: boolean;
  current_value: number;
  datapoints: number;
  simulated_events: number;
}

export interface Silence {
  id: string;
  tenant_id: string;
  name: string;
  comment: string;
  rule_ids: string[];
  matchers: Record<string, string>;
  starts_at: string;
  ends_at: string;
  timezone: string;
  recurring: boolean;
  recurrence_days: string[];
  recurrence_start_time: string | null;
  recurrence_end_time: string | null;
  enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SilenceCreate {
  name: string;
  comment?: string;
  rule_ids?: string[];
  matchers?: Record<string, string>;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  recurring?: boolean;
  recurrence_days?: string[];
  recurrence_start_time?: string;
  recurrence_end_time?: string;
}

export interface Dashboard {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  panels: PanelDefinition[];
  created_at: string;
  updated_at: string;
}

export type PanelType = "timeseries" | "area" | "stat" | "top_list" | "pie" | "text";

export interface PanelDefinition {
  id: string;
  title: string;
  panel_type: PanelType;
  metric_name?: string;
  tags?: Record<string, string>;
  aggregation?: string;
  mql_query?: string;
  content?: string;
  display_options?: Record<string, unknown>;
  width: number;
  height: number;
  position_x: number;
  position_y: number;
}

export interface Resource {
  id: string;
  tenant_id: string;
  resource_type: string;
  provider: string;
  region: string;
  account_id: string;
  name: string;
  external_id: string;
  tags: Record<string, string>;
  metadata: Record<string, unknown>;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceSummary {
  total: number;
  by_type: Record<string, number>;
  by_provider: Record<string, number>;
  by_status: Record<string, number>;
}

export interface AWSAccount {
  id: string;
  tenant_id: string;
  name: string;
  account_id: string;
  role_arn: string;
  external_id: string;
  regions: string[];
  enabled: boolean;
  collect_config: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AzureSubscription {
  id: string;
  tenant_id: string;
  name: string;
  subscription_id: string;
  azure_tenant_id: string;
  client_id: string;
  regions: string[];
  enabled: boolean;
  collect_config: Record<string, unknown>;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthStatus {
  status: "healthy" | "degraded";
  degraded_reasons?: string[];
  checks: Record<string, string>;
  pool?: {
    size: number;
    idle: number;
    active: number;
    min: number;
    max: number;
    utilization: number;
  };
  writers?: {
    metrics: WriterStats;
    logs: WriterStats;
  };
  background_tasks?: {
    orchestrator: BackgroundTaskStats;
    alert_engine: AlertEngineStats;
  };
  process?: ProcessInfo;
}

export interface WriterStats {
  buffer_size: number;
  total_written: number;
  total_dropped: number;
  flush_count: number;
  last_flush_duration_ms: number;
  last_flush_at: number;
}

export interface TaskRunStats {
  last_run_at: number;
  last_duration_ms: number;
  success_count: number;
  failure_count: number;
  consecutive_errors: number;
}

export interface BackgroundTaskStats {
  running: boolean;
  discovery: TaskRunStats;
  metrics_collection: TaskRunStats;
}

export interface AlertEngineStats {
  running: boolean;
  eval: TaskRunStats;
  rules_evaluated: number;
  active_rules: number;
  state_transitions: number;
  notifications_sent: number;
  notifications_failed: number;
}

export interface ProcessInfo {
  cpu_percent: number;
  memory_rss_mb: number;
  memory_vms_mb?: number;
  uptime_seconds: number;
  thread_count: number;
  open_fds?: number;
}

export interface NotificationChannel {
  id: string;
  tenant_id: string;
  name: string;
  channel_type: "webhook" | "slack" | "email" | "freshdesk" | "pagerduty" | "msteams";
  config: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

export interface NotificationChannelCreate {
  name: string;
  channel_type: "webhook" | "slack" | "email" | "freshdesk" | "pagerduty" | "msteams";
  config: Record<string, string>;
  enabled?: boolean;
}

export interface NotificationDelivery {
  event_id: string;
  rule_id: string;
  status: string;
  notification_meta: Record<string, { delivered: boolean; error?: string; ticket_id?: string }>;
  fired_at: string;
  resolved_at: string | null;
}

export interface APIKey {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  enabled: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

export interface APIKeyCreate {
  name: string;
  tenant_id?: string;
  scopes?: string[];
  rate_limit?: number;
  expires_at?: string;
}

export interface APIKeyCreated extends APIKey {
  raw_key: string;
}

export interface AWSAccountCreate {
  name: string;
  account_id: string;
  role_arn: string;
  external_id: string;
  regions?: string[];
}

export interface AzureSubscriptionCreate {
  name: string;
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  regions?: string[];
}

// --- Auth types ---

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  is_super_admin: boolean;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AuthTenant {
  id: string;
  slug: string;
  name: string;
  tier: string;
  status: string;
  created_at: string;
}

export interface AuthResponse {
  user: AuthUser;
  tenant: AuthTenant;
  role: string;
  is_impersonating?: boolean;
  impersonated_by?: string | null;
}

export interface TenantWithRole extends AuthTenant {
  role: string;
}

export interface AdminTenant extends AuthTenant {
  member_count: number;
  updated_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  is_super_admin: boolean;
  is_active: boolean;
  email_verified: boolean;
  tenant_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface PlatformStats {
  tenants: { total: number; active: number };
  users: { total: number; active: number };
  memberships: number;
  api_keys_active: number;
}

export interface TenantAuditEntry {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_type: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface PlatformAuditEntry {
  id: string;
  actor_id: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface SecurityLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  event_type: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface MembershipInfo {
  user_id: string;
  tenant_id: string;
  role: string;
  joined_at: string;
  user_email: string | null;
  user_name: string | null;
}

export interface SystemStats {
  api: {
    endpoints: {
      method: string;
      path_pattern: string;
      request_count: number;
      latency_p50: number;
      latency_p95: number;
      latency_p99: number;
    }[];
    total_requests: number;
    total_errors: number;
  };
  database: {
    pool_size: number;
    pool_idle: number;
    pool_active: number;
    pool_max: number;
    pool_utilization: number;
  };
  writers: {
    metrics: WriterStats;
    logs: WriterStats;
  };
  background_tasks: {
    orchestrator: BackgroundTaskStats;
    alert_engine: AlertEngineStats;
  };
  process: ProcessInfo;
}
