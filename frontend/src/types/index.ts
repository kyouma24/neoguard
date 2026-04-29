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
  created_at: string;
  updated_at: string;
}

export interface AlertEvent {
  id: string;
  tenant_id: string;
  rule_id: string;
  status: string;
  value: number;
  threshold: number;
  message: string;
  fired_at: string;
  resolved_at: string | null;
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

export interface PanelDefinition {
  id: string;
  title: string;
  panel_type: "timeseries" | "stat" | "table" | "log" | "alert_list";
  metric_name?: string;
  tags?: Record<string, string>;
  aggregation?: string;
  query?: string;
  width: number;
  height: number;
  position_x: number;
  position_y: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded";
  checks: Record<string, string>;
  writers: {
    metrics: WriterStats;
    logs: WriterStats;
  };
}

export interface WriterStats {
  buffer_size: number;
  total_written: number;
  total_dropped: number;
}
