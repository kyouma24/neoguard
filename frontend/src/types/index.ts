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
  variables?: Record<string, string | string[]>;
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

// --- Streaming batch query types (spec D.4) ---

export interface BatchQueryItem {
  id: string;
  query: string;
  start: string;
  end: string;
  interval?: string;
  max_points?: number;
  max_series?: number;
}

export interface BatchQueryRequest {
  queries: BatchQueryItem[];
  variables?: Record<string, string | string[]>;
  dashboard_id?: string;
}

export interface BatchQueryResultLine {
  type: "query_result";
  id: string;
  status: "ok" | "error";
  series?: MetricQueryResult[];
  meta?: {
    total_series: number;
    truncated_series: boolean;
    max_points: number;
  };
  error?: { code: string; message: string };
}

export interface BatchCompleteMessage {
  type: "batch_complete";
  took_ms: number;
  total: number;
}

export type BatchStreamMessage = BatchQueryResultLine | BatchCompleteMessage;

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

export interface HistogramBucket {
  timestamp: string;
  count: number;
  severity_counts: Record<string, number>;
}

export interface HistogramResult {
  buckets: HistogramBucket[];
  interval_seconds: number;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetsResult {
  severity: FacetValue[];
  service: FacetValue[];
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

export type VariableType = "query" | "custom" | "textbox";

export interface DashboardVariable {
  name: string;
  label: string;
  type: VariableType;
  /** Where to fetch values from: "metrics" (metric tags) or "resources" (discovered resources table) */
  source?: "metrics" | "resources";
  tag_key?: string;
  /** For source="resources": which column to query (external_id, name, region, account_id, resource_type) */
  resource_field?: string;
  /** For source="resources": filter by resource_type (e.g. "ec2", "rds") */
  resource_type?: string;
  /** Exact metric name to scope tag value queries (e.g. "aws.ec2.cpuutilization") */
  metric_filter?: string;
  /** Metric name prefix to scope tag value queries (e.g. "aws.ec2.") */
  metric_prefix?: string;
  values: string[];
  default_value: string;
  multi: boolean;
  include_all: boolean;
  /** Name of parent variable — when parent changes, this variable re-fetches with parent's value as a tag filter */
  depends_on?: string;
}

export interface PanelGroup {
  id: string;
  label: string;
  collapsed: boolean;
  panel_ids: string[];
}

export interface DashboardLink {
  label: string;
  url: string;
  tooltip?: string;
  include_vars?: boolean;
  include_time?: boolean;
}

export interface Dashboard {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  layout_version?: number;
  panels: PanelDefinition[];
  variables: DashboardVariable[];
  groups?: PanelGroup[];
  tags?: string[];
  links?: DashboardLink[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type DashboardPermissionLevel = "view" | "edit" | "admin";

export interface DashboardPermission {
  id: number;
  dashboard_id: string;
  user_id: string;
  user_email?: string | null;
  user_name?: string | null;
  permission: DashboardPermissionLevel;
  granted_by?: string | null;
  created_at: string;
}

export interface DashboardMyPermission {
  permission: DashboardPermissionLevel | null;
  can_view: boolean;
  can_edit: boolean;
  can_admin: boolean;
}

export interface DashboardVersion {
  id: string;
  dashboard_id: string;
  version_number: number;
  data: Record<string, unknown>;
  change_summary: string;
  created_by: string;
  created_at: string;
}

export type PanelType =
  | "timeseries" | "area" | "stat" | "top_list" | "pie" | "text"
  | "gauge" | "table" | "scatter" | "histogram" | "change" | "status"
  | "hexbin_map" | "heatmap" | "treemap" | "geomap" | "sankey"
  | "topology" | "sparkline_table" | "bar_gauge" | "radar"
  | "candlestick" | "calendar_heatmap" | "bubble" | "waterfall"
  | "box_plot" | "funnel" | "slo_tracker" | "alert_list"
  | "log_stream" | "resource_inventory" | "progress" | "forecast_line"
  | "diff_comparison";

export type { PanelDisplayOptions, UnitConfig, ThresholdConfig, LegendConfig, YAxisConfig, YAxisRightConfig, ColorConfig } from "./display-options";
export type { ThresholdStep, LegendColumn, LegendPosition, LegendMode, UnitCategory } from "./display-options";
export type { StatDisplayConfig, GaugeDisplayConfig, TableDisplayConfig, HistogramDisplayConfig } from "./display-options";
export type { DataTransform } from "./display-options";

export interface PanelDefinition {
  id: string;
  title: string;
  panel_type: PanelType;
  metric_name?: string;
  tags?: Record<string, string>;
  aggregation?: string;
  mql_query?: string;
  content?: string;
  display_options?: import("./display-options").PanelDisplayOptions;
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

export interface ResourceIssueItem {
  id: string;
  name: string;
  resource_type: string;
  provider: string;
  account_id: string;
  region: string;
}

export interface ResourceIssues {
  stopped_resources: Array<ResourceIssueItem & { status: string; updated_at: string }>;
  stale_resources: Array<ResourceIssueItem & { last_seen_at: string; minutes_stale: number }>;
  firing_alerts: Array<{
    event_id: string;
    rule_name: string;
    severity: string;
    fired_at: string;
    status: string;
  }>;
  counts: {
    stopped: number;
    stale: number;
    firing_alerts: number;
    total_issues: number;
  };
}

export interface ResourceChange {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_type: string;
  provider: string;
  change_type: string;
  field_changes: Array<{ field: string; old: unknown; new: unknown }>;
  previous_status: string | null;
  new_status: string | null;
  detected_at: string;
}

export interface ResourceGroup {
  name: string;
  total: number;
  by_provider: Record<string, number>;
  by_status: Record<string, number>;
}

export interface TopologyNode {
  id: string;
  name: string;
  resource_type: string;
  provider: string;
  region: string;
  status: string;
  external_id: string;
}

export interface TopologyEdge {
  source: string;
  target: string;
  relation: string;
}

export interface ResourceTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TriggerDiscoveryRequest {
  aws_account_id?: string;
  azure_subscription_id?: string;
  region?: string;
}

export interface TriggerDiscoveryResponse {
  status: string;
  provider: string;
  results: Record<string, Record<string, unknown>>;
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

export interface MQLFunctionInfo {
  name: string;
  description: string;
  arity: number;
  example: string;
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
  collect_config?: Record<string, unknown>;
}

export interface AzureSubscriptionCreate {
  name: string;
  subscription_id: string;
  tenant_id: string;
  client_id: string;
  client_secret: string;
  regions?: string[];
  collect_config?: Record<string, unknown>;
}

// --- Onboarding types ---

export interface GenerateExternalIdResponse {
  external_id: string;
  cft_template_url: string;
  arm_template_url: string;
  cft_console_url: string;
  arm_portal_url: string;
  neoguard_account_id: string;
}

export interface VerifyAWSRequest {
  role_arn: string;
  external_id: string;
  region?: string;
}

export interface VerifyAWSResponse {
  success: boolean;
  account_id: string | null;
  role_arn: string;
  services: Record<string, { ok: boolean; label: string; error?: string | null }>;
  error: string | null;
}

export interface DiscoverPreviewRequest {
  role_arn: string;
  external_id: string;
  regions: string[];
}

export interface DiscoverPreviewResponse {
  success: boolean;
  regions: Record<string, { services: Record<string, number>; total: number }>;
  totals: { resources: number; regions_with_resources: number };
  error: string | null;
}

export interface VerifyAzureRequest {
  azure_tenant_id: string;
  client_id: string;
  client_secret: string;
  subscription_id: string;
}

export interface VerifyAzureResponse {
  success: boolean;
  subscription_id: string;
  services: Record<string, { ok: boolean; label: string; count?: number; error?: string | null }>;
  error: string | null;
}

export interface AvailableRegionsResponse {
  aws: string[];
  azure: string[];
}

export interface AvailableServicesResponse {
  aws: Array<{ id: string; label: string }>;
  azure: Array<{ id: string; label: string }>;
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

export interface Annotation {
  id: string;
  tenant_id: string;
  dashboard_id: string | null;
  title: string;
  text: string;
  tags: string[];
  starts_at: string;
  ends_at: string | null;
  created_by: string;
  created_at: string;
}

export interface AnnotationCreate {
  dashboard_id?: string;
  title: string;
  text?: string;
  tags?: string[];
  starts_at: string;
  ends_at?: string;
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
