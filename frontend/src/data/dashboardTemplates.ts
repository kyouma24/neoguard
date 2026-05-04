import type { PanelDefinition } from "../types";

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  panels: Omit<PanelDefinition, "id">[];
  variables: { name: string; label: string; type: "query" | "custom"; tag_key?: string; values?: string[]; default_value?: string }[];
}

const TEMPLATES: DashboardTemplate[] = [
  {
    id: "aws-ec2",
    name: "AWS EC2 Overview",
    description: "CPU, network, disk, and status checks for EC2 instances",
    category: "AWS",
    variables: [
      { name: "instance", label: "Instance", type: "query", tag_key: "instance_id" },
    ],
    panels: [
      { title: "CPU Utilization", panel_type: "timeseries", metric_name: "aws.ec2.cpu_utilization", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "percent" }, thresholds: { mode: "absolute", steps: [{ value: 70, color: "#f59e0b" }, { value: 90, color: "#ef4444" }], showLines: true } } },
      { title: "Network In/Out", panel_type: "area", metric_name: "aws.ec2.network_in", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "bytes_sec" } } },
      { title: "Disk Read/Write", panel_type: "area", metric_name: "aws.ec2.disk_read_ops", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 4, display_options: { unit: { category: "iops" } } },
      { title: "Status Check Failed", panel_type: "stat", metric_name: "aws.ec2.status_check_failed", tags: {}, aggregation: "last", width: 3, height: 3, position_x: 6, position_y: 4, display_options: { thresholds: { mode: "absolute", steps: [{ value: 1, color: "#ef4444" }] }, stat: { colorMode: "background" } } },
      { title: "CPU Credit Balance", panel_type: "gauge", metric_name: "aws.ec2.cpu_credit_balance", tags: {}, aggregation: "last", width: 3, height: 3, position_x: 9, position_y: 4, display_options: { gauge: { min: 0, max: 576 } } },
    ],
  },
  {
    id: "aws-rds",
    name: "AWS RDS Overview",
    description: "Database connections, latency, CPU, storage, and replication lag",
    category: "AWS",
    variables: [
      { name: "db_instance", label: "DB Instance", type: "query", tag_key: "db_instance_identifier" },
    ],
    panels: [
      { title: "Database Connections", panel_type: "timeseries", metric_name: "aws.rds.database_connections", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "number" } } },
      { title: "CPU Utilization", panel_type: "timeseries", metric_name: "aws.rds.cpu_utilization", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "percent" }, thresholds: { mode: "absolute", steps: [{ value: 70, color: "#f59e0b" }, { value: 90, color: "#ef4444" }], showLines: true } } },
      { title: "Read Latency", panel_type: "timeseries", metric_name: "aws.rds.read_latency", tags: {}, aggregation: "avg", width: 4, height: 4, position_x: 0, position_y: 4, display_options: { unit: { category: "time_ms" } } },
      { title: "Write Latency", panel_type: "timeseries", metric_name: "aws.rds.write_latency", tags: {}, aggregation: "avg", width: 4, height: 4, position_x: 4, position_y: 4, display_options: { unit: { category: "time_ms" } } },
      { title: "Free Storage", panel_type: "stat", metric_name: "aws.rds.free_storage_space", tags: {}, aggregation: "last", width: 4, height: 4, position_x: 8, position_y: 4, display_options: { unit: { category: "bytes" }, stat: { colorMode: "value" } } },
    ],
  },
  {
    id: "aws-lambda",
    name: "AWS Lambda Overview",
    description: "Invocations, errors, duration, throttles, and concurrent executions",
    category: "AWS",
    variables: [
      { name: "function_name", label: "Function", type: "query", tag_key: "function_name" },
    ],
    panels: [
      { title: "Invocations", panel_type: "timeseries", metric_name: "aws.lambda.invocations", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "number" } } },
      { title: "Errors", panel_type: "timeseries", metric_name: "aws.lambda.errors", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "number" }, thresholds: { mode: "absolute", steps: [{ value: 1, color: "#ef4444" }], showLines: true } } },
      { title: "Duration (p95)", panel_type: "timeseries", metric_name: "aws.lambda.duration", tags: {}, aggregation: "p95", width: 6, height: 4, position_x: 0, position_y: 4, display_options: { unit: { category: "time_ms" } } },
      { title: "Throttles", panel_type: "stat", metric_name: "aws.lambda.throttles", tags: {}, aggregation: "sum", width: 3, height: 3, position_x: 6, position_y: 4, display_options: { stat: { colorMode: "background" }, thresholds: { mode: "absolute", steps: [{ value: 1, color: "#f59e0b" }] } } },
      { title: "Concurrent Executions", panel_type: "stat", metric_name: "aws.lambda.concurrent_executions", tags: {}, aggregation: "max", width: 3, height: 3, position_x: 9, position_y: 4 },
    ],
  },
  {
    id: "aws-alb",
    name: "AWS ALB / API Gateway",
    description: "Request count, latency, HTTP errors, and active connections",
    category: "AWS",
    variables: [],
    panels: [
      { title: "Request Count", panel_type: "timeseries", metric_name: "aws.alb.request_count", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "requests_sec" } } },
      { title: "Target Response Time", panel_type: "timeseries", metric_name: "aws.alb.target_response_time", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "time_sec" } } },
      { title: "HTTP 5xx Errors", panel_type: "timeseries", metric_name: "aws.alb.http_5xx_count", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 0, position_y: 4, display_options: { unit: { category: "number" }, thresholds: { mode: "absolute", steps: [{ value: 1, color: "#ef4444" }], showLines: true } } },
      { title: "Active Connections", panel_type: "stat", metric_name: "aws.alb.active_connection_count", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 4, display_options: { unit: { category: "number" } } },
    ],
  },
  {
    id: "application-health",
    name: "Application Health",
    description: "API latency, error rates, throughput, and system resources",
    category: "Application",
    variables: [
      { name: "env", label: "Environment", type: "custom", values: ["production", "staging", "development"], default_value: "production" },
    ],
    panels: [
      { title: "API Latency (p99)", panel_type: "timeseries", metric_name: "neoguard.api.latency_ms", tags: {}, aggregation: "p99", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "time_ms" }, thresholds: { mode: "absolute", steps: [{ value: 200, color: "#f59e0b" }, { value: 500, color: "#ef4444" }], showLines: true } } },
      { title: "Request Rate", panel_type: "timeseries", metric_name: "neoguard.api.request_count", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "requests_sec" } } },
      { title: "Error Rate", panel_type: "stat", metric_name: "neoguard.api.error_count", tags: {}, aggregation: "sum", width: 3, height: 3, position_x: 0, position_y: 4, display_options: { stat: { colorMode: "background" }, thresholds: { mode: "absolute", steps: [{ value: 1, color: "#f59e0b" }, { value: 10, color: "#ef4444" }] } } },
      { title: "Active Users", panel_type: "stat", metric_name: "neoguard.auth.active_sessions", tags: {}, aggregation: "last", width: 3, height: 3, position_x: 3, position_y: 4, display_options: { unit: { category: "number" } } },
      { title: "CPU Usage", panel_type: "gauge", metric_name: "neoguard.system.cpu_percent", tags: {}, aggregation: "avg", width: 3, height: 3, position_x: 6, position_y: 4, display_options: { gauge: { min: 0, max: 100 }, unit: { category: "percent" } } },
      { title: "Memory Usage", panel_type: "gauge", metric_name: "neoguard.system.memory_percent", tags: {}, aggregation: "avg", width: 3, height: 3, position_x: 9, position_y: 4, display_options: { gauge: { min: 0, max: 100 }, unit: { category: "percent" } } },
    ],
  },
  {
    id: "redis-overview",
    name: "Redis Overview",
    description: "Commands, memory, connections, hit rates, and evictions",
    category: "Data Store",
    variables: [],
    panels: [
      { title: "Commands/sec", panel_type: "timeseries", metric_name: "aws.elasticache.cache_hits", tags: {}, aggregation: "sum", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "ops_sec" } } },
      { title: "Memory Used", panel_type: "timeseries", metric_name: "aws.elasticache.bytes_used_for_cache", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "bytes" } } },
      { title: "Current Connections", panel_type: "stat", metric_name: "aws.elasticache.curr_connections", tags: {}, aggregation: "last", width: 4, height: 3, position_x: 0, position_y: 4, display_options: { unit: { category: "number" } } },
      { title: "Cache Hit Rate", panel_type: "gauge", metric_name: "aws.elasticache.cache_hit_rate", tags: {}, aggregation: "avg", width: 4, height: 3, position_x: 4, position_y: 4, display_options: { gauge: { min: 0, max: 100 }, unit: { category: "percent" } } },
      { title: "Evictions", panel_type: "stat", metric_name: "aws.elasticache.evictions", tags: {}, aggregation: "sum", width: 4, height: 3, position_x: 8, position_y: 4, display_options: { thresholds: { mode: "absolute", steps: [{ value: 1, color: "#f59e0b" }] }, stat: { colorMode: "value" } } },
    ],
  },
  {
    id: "postgres-overview",
    name: "PostgreSQL / RDS",
    description: "Connections, transactions, cache hit ratio, and dead tuples",
    category: "Data Store",
    variables: [
      { name: "db", label: "Database", type: "query", tag_key: "db_instance_identifier" },
    ],
    panels: [
      { title: "Connections", panel_type: "timeseries", metric_name: "aws.rds.database_connections", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "number" } } },
      { title: "Read IOPS", panel_type: "timeseries", metric_name: "aws.rds.read_iops", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "iops" } } },
      { title: "Write IOPS", panel_type: "timeseries", metric_name: "aws.rds.write_iops", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 4, display_options: { unit: { category: "iops" } } },
      { title: "Freeable Memory", panel_type: "stat", metric_name: "aws.rds.freeable_memory", tags: {}, aggregation: "last", width: 6, height: 4, position_x: 6, position_y: 4, display_options: { unit: { category: "bytes" } } },
    ],
  },
  {
    id: "aws-ecs",
    name: "AWS ECS Overview",
    description: "Task CPU, memory, running/pending counts for ECS services",
    category: "AWS",
    variables: [
      { name: "cluster", label: "Cluster", type: "query", tag_key: "cluster_name" },
      { name: "service", label: "Service", type: "query", tag_key: "service_name" },
    ],
    panels: [
      { title: "CPU Utilization", panel_type: "timeseries", metric_name: "aws.ecs.cpu_utilization", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 0, position_y: 0, display_options: { unit: { category: "percent" }, thresholds: { mode: "absolute", steps: [{ value: 70, color: "#f59e0b" }, { value: 90, color: "#ef4444" }], showLines: true } } },
      { title: "Memory Utilization", panel_type: "timeseries", metric_name: "aws.ecs.memory_utilization", tags: {}, aggregation: "avg", width: 6, height: 4, position_x: 6, position_y: 0, display_options: { unit: { category: "percent" }, thresholds: { mode: "absolute", steps: [{ value: 70, color: "#f59e0b" }, { value: 90, color: "#ef4444" }], showLines: true } } },
      { title: "Running Tasks", panel_type: "stat", metric_name: "aws.ecs.running_task_count", tags: {}, aggregation: "last", width: 4, height: 3, position_x: 0, position_y: 4, display_options: { unit: { category: "number" }, stat: { colorMode: "value" } } },
      { title: "Pending Tasks", panel_type: "stat", metric_name: "aws.ecs.pending_task_count", tags: {}, aggregation: "last", width: 4, height: 3, position_x: 4, position_y: 4, display_options: { stat: { colorMode: "background" }, thresholds: { mode: "absolute", steps: [{ value: 1, color: "#f59e0b" }] } } },
      { title: "Desired vs Running", panel_type: "change", metric_name: "aws.ecs.running_task_count", tags: {}, aggregation: "last", width: 4, height: 3, position_x: 8, position_y: 4 },
    ],
  },
];

export function getTemplates(): DashboardTemplate[] {
  return TEMPLATES;
}

export function getTemplatesByCategory(): Record<string, DashboardTemplate[]> {
  const groups: Record<string, DashboardTemplate[]> = {};
  for (const t of TEMPLATES) {
    (groups[t.category] ??= []).push(t);
  }
  return groups;
}
