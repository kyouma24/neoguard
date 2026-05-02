import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { subHours, format } from "date-fns";
import {
  Server,
  HardDrive,
  Database,
  Zap,
  Globe,
  Cloud,
  Router,
  FolderOpen,
  ChevronLeft,
  RefreshCw,
  ArrowUpDown,
  Shield,
  Network,
  Container,
  Archive,
  Key,
  Layers,
  Gauge,
  AppWindow,
} from "lucide-react";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { useApi } from "../hooks/useApi";
import { useInterval } from "../hooks/useInterval";
import { api } from "../services/api";
import {
  Button,
  Card,
  Badge,
  StatusBadge as DSStatusBadge,
  Breadcrumbs,
  SearchInput,
  EmptyState,
  PageHeader,
} from "../design-system";
import type {
  AlertEvent,
  Resource,
  ResourceSummary,
  MetricQueryResult,
  AWSAccount,
  AzureSubscription,
} from "../types";
import type { StatusTone } from "../design-system";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceTab {
  id: string;
  label: string;
  icon: React.ElementType;
  resourceType: string;
  metricPrefix: string;
  keyMetrics: { name: string; label: string; unit: string }[];
  columns: { key: string; label: string; render?: (r: Resource) => string }[];
}

type CloudProvider = "aws" | "azure" | "gcp";

interface UnifiedAccount {
  id: string;
  provider: CloudProvider;
  name: string;
  accountId: string;
  regions: string[];
  enabled: boolean;
  lastSyncAt: string | null;
  providerColor: string;
}

// ---------------------------------------------------------------------------
// Service Tab Definitions
// ---------------------------------------------------------------------------

const AWS_SERVICE_TABS: ServiceTab[] = [
  {
    id: "ec2",
    label: "EC2",
    icon: Server,
    resourceType: "ec2",
    metricPrefix: "aws.ec2",
    keyMetrics: [
      { name: "aws.ec2.cpuutilization", label: "CPU Utilization", unit: "%" },
      { name: "aws.ec2.network_in", label: "Network In", unit: "bytes" },
      { name: "aws.ec2.network_out", label: "Network Out", unit: "bytes" },
      { name: "aws.ec2.ebsread_ops", label: "EBS Read Ops", unit: "ops" },
      { name: "aws.ec2.ebswrite_ops", label: "EBS Write Ops", unit: "ops" },
      { name: "aws.ec2.status_check_failed", label: "Status Check Failed", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "instance_type", label: "Type", render: (r) => String(r.metadata.instance_type ?? "-") },
      { key: "az", label: "AZ", render: (r) => String(r.metadata.availability_zone ?? "-") },
      { key: "private_ip", label: "Private IP", render: (r) => String(r.metadata.private_ip ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "ebs",
    label: "EBS",
    icon: HardDrive,
    resourceType: "ebs",
    metricPrefix: "aws.ebs",
    keyMetrics: [
      { name: "aws.ebs.volume_read_ops", label: "Read Ops", unit: "ops" },
      { name: "aws.ebs.volume_write_ops", label: "Write Ops", unit: "ops" },
      { name: "aws.ebs.volume_read_bytes", label: "Read Bytes", unit: "bytes" },
      { name: "aws.ebs.volume_write_bytes", label: "Write Bytes", unit: "bytes" },
      { name: "aws.ebs.volume_queue_length", label: "Queue Length", unit: "count" },
      { name: "aws.ebs.volume_idle_time", label: "Idle Time", unit: "sec" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "volume_type", label: "Type", render: (r) => String(r.metadata.volume_type ?? "-") },
      { key: "size", label: "Size (GB)", render: (r) => String(r.metadata.size_gb ?? "-") },
      { key: "state", label: "State", render: (r) => String(r.metadata.state ?? "-") },
      { key: "attached", label: "Attached To", render: (r) => String(r.metadata.attached_instance ?? "-") },
      { key: "az", label: "AZ", render: (r) => String(r.metadata.availability_zone ?? "-") },
    ],
  },
  {
    id: "rds",
    label: "RDS",
    icon: Database,
    resourceType: "rds",
    metricPrefix: "aws.rds",
    keyMetrics: [
      { name: "aws.rds.cpuutilization", label: "CPU Utilization", unit: "%" },
      { name: "aws.rds.database_connections", label: "Connections", unit: "count" },
      { name: "aws.rds.freeable_memory", label: "Freeable Memory", unit: "bytes" },
      { name: "aws.rds.free_storage_space", label: "Free Storage", unit: "bytes" },
      { name: "aws.rds.read_iops", label: "Read IOPS", unit: "ops/s" },
      { name: "aws.rds.write_iops", label: "Write IOPS", unit: "ops/s" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "engine", label: "Engine", render: (r) => String(r.metadata.engine ?? "-") },
      { key: "class", label: "Class", render: (r) => String(r.metadata.instance_class ?? "-") },
      { key: "storage", label: "Storage (GB)", render: (r) => String(r.metadata.storage_gb ?? "-") },
      { key: "multi_az", label: "Multi-AZ", render: (r) => r.metadata.multi_az ? "Yes" : "No" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "lambda",
    label: "Lambda",
    icon: Zap,
    resourceType: "lambda",
    metricPrefix: "aws.lambda",
    keyMetrics: [
      { name: "aws.lambda.invocations", label: "Invocations", unit: "count" },
      { name: "aws.lambda.errors", label: "Errors", unit: "count" },
      { name: "aws.lambda.duration", label: "Duration (avg)", unit: "ms" },
      { name: "aws.lambda.duration_p99", label: "Duration (p99)", unit: "ms" },
      { name: "aws.lambda.throttles", label: "Throttles", unit: "count" },
      { name: "aws.lambda.concurrent_executions", label: "Concurrency", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Function" },
      { key: "runtime", label: "Runtime", render: (r) => String(r.metadata.runtime ?? "-") },
      { key: "memory", label: "Memory (MB)", render: (r) => String(r.metadata.memory_size ?? "-") },
      { key: "timeout", label: "Timeout (s)", render: (r) => String(r.metadata.timeout ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "alb",
    label: "ALB/NLB",
    icon: ArrowUpDown,
    resourceType: "alb",
    metricPrefix: "aws.applicationelb",
    keyMetrics: [
      { name: "aws.applicationelb.request_count", label: "Requests", unit: "count" },
      { name: "aws.applicationelb.target_response_time", label: "Response Time", unit: "sec" },
      { name: "aws.applicationelb.active_connection_count", label: "Active Connections", unit: "count" },
      { name: "aws.applicationelb.httpcode__target_4_xx__count", label: "4xx Errors", unit: "count" },
      { name: "aws.applicationelb.new_connection_count", label: "New Connections", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "type", label: "Type", render: (r) => String(r.metadata.type ?? r.resource_type).toUpperCase() },
      { key: "scheme", label: "Scheme", render: (r) => String(r.metadata.scheme ?? "-") },
      { key: "dns", label: "DNS Name", render: (r) => {
        const dns = String(r.metadata.dns_name ?? "-");
        return dns.length > 40 ? dns.substring(0, 37) + "..." : dns;
      }},
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "s3",
    label: "S3",
    icon: FolderOpen,
    resourceType: "s3",
    metricPrefix: "aws.s3",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Bucket" },
      { key: "region", label: "Region", render: (r) => r.region },
      { key: "versioning", label: "Versioning", render: (r) => String(r.metadata.versioning ?? "-") },
      { key: "encryption", label: "Encryption", render: (r) => String(r.metadata.encryption ?? "-") },
      { key: "public_access", label: "Public Access", render: (r) => r.metadata.public_access_blocked ? "Blocked" : "Open" },
    ],
  },
  {
    id: "nat",
    label: "NAT GW",
    icon: Router,
    resourceType: "nat_gateway",
    metricPrefix: "aws.natgateway",
    keyMetrics: [
      { name: "aws.natgateway.active_connection_count", label: "Active Connections", unit: "count" },
      { name: "aws.natgateway.bytes_in_from_destination", label: "Bytes In", unit: "bytes" },
      { name: "aws.natgateway.bytes_out_to_destination", label: "Bytes Out", unit: "bytes" },
      { name: "aws.natgateway.packets_drop_count", label: "Dropped Packets", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "state", label: "State", render: (r) => String(r.metadata.state ?? "-") },
      { key: "vpc", label: "VPC", render: (r) => String(r.metadata.vpc_id ?? "-") },
      { key: "subnet", label: "Subnet", render: (r) => String(r.metadata.subnet_id ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "route53",
    label: "Route 53",
    icon: Globe,
    resourceType: "route53",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Zone Name" },
      { key: "records", label: "Records", render: (r) => String(r.metadata.record_count ?? "-") },
      { key: "private", label: "Private", render: (r) => r.metadata.private_zone ? "Yes" : "No" },
      { key: "status", label: "Status" },
    ],
  },
];

const AZURE_SERVICE_TABS: ServiceTab[] = [
  {
    id: "azure_vm",
    label: "VMs",
    icon: Server,
    resourceType: "azure_vm",
    metricPrefix: "azure.azure_vm",
    keyMetrics: [
      { name: "azure.azure_vm.cpu_percent", label: "CPU %", unit: "%" },
      { name: "azure.azure_vm.mem_avail", label: "Memory Available", unit: "bytes" },
      { name: "azure.azure_vm.network_in", label: "Network In", unit: "bytes" },
      { name: "azure.azure_vm.network_out", label: "Network Out", unit: "bytes" },
      { name: "azure.azure_vm.disk_read_bytes", label: "Disk Read", unit: "bytes" },
      { name: "azure.azure_vm.disk_write_bytes", label: "Disk Write", unit: "bytes" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "vm_size", label: "Size", render: (r) => String(r.metadata.vm_size ?? "-") },
      { key: "os_type", label: "OS", render: (r) => String(r.metadata.os_type ?? "-") },
      { key: "zone", label: "Zone", render: (r) => String(r.metadata.availability_zone ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_disk",
    label: "Disks",
    icon: HardDrive,
    resourceType: "azure_disk",
    metricPrefix: "azure.azure_disk",
    keyMetrics: [
      { name: "azure.azure_disk.read_bps", label: "Read B/s", unit: "bytes" },
      { name: "azure.azure_disk.write_bps", label: "Write B/s", unit: "bytes" },
      { name: "azure.azure_disk.read_ops", label: "Read Ops", unit: "ops" },
      { name: "azure.azure_disk.write_ops", label: "Write Ops", unit: "ops" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku ?? "-") },
      { key: "size", label: "Size (GB)", render: (r) => String(r.metadata.disk_size_gb ?? "-") },
      { key: "state", label: "State", render: (r) => String(r.metadata.disk_state ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_nsg",
    label: "NSG",
    icon: Shield,
    resourceType: "azure_nsg",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Name" },
      { key: "rules", label: "Rules", render: (r) => String(r.metadata.rule_count ?? "-") },
      { key: "nics", label: "NICs", render: (r) => String(r.metadata.nic_associations ?? "-") },
      { key: "subnets", label: "Subnets", render: (r) => String(r.metadata.subnet_associations ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_vnet",
    label: "VNet",
    icon: Network,
    resourceType: "azure_vnet",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Name" },
      { key: "prefixes", label: "Address Space", render: (r) => {
        const prefixes = r.metadata.address_prefixes;
        return Array.isArray(prefixes) ? prefixes.join(", ") : "-";
      }},
      { key: "subnets", label: "Subnets", render: (r) => String(r.metadata.subnet_count ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_sql",
    label: "SQL",
    icon: Database,
    resourceType: "azure_sql",
    metricPrefix: "azure.azure_sql",
    keyMetrics: [
      { name: "azure.azure_sql.cpu_percent", label: "CPU %", unit: "%" },
      { name: "azure.azure_sql.dtu_pct", label: "DTU %", unit: "%" },
      { name: "azure.azure_sql.storage_pct", label: "Storage %", unit: "%" },
      { name: "azure.azure_sql.conn_ok", label: "Connections", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku_name ?? "-") },
      { key: "tier", label: "Tier", render: (r) => String(r.metadata.sku_tier ?? "-") },
      { key: "server", label: "Server", render: (r) => String(r.metadata.server_name ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_function",
    label: "Functions",
    icon: Zap,
    resourceType: "azure_function",
    metricPrefix: "azure.azure_function",
    keyMetrics: [
      { name: "azure.azure_function.exec_count", label: "Executions", unit: "count" },
      { name: "azure.azure_function.exec_units", label: "Execution Units", unit: "count" },
      { name: "azure.azure_function.requests", label: "Requests", unit: "count" },
      { name: "azure.azure_function.http_5xx", label: "HTTP 5xx", unit: "count" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "runtime", label: "Runtime", render: (r) => String(r.metadata.runtime_stack ?? "-") },
      { key: "state", label: "State", render: (r) => String(r.metadata.state ?? "-") },
      { key: "hostname", label: "Hostname", render: (r) => {
        const host = String(r.metadata.default_hostname ?? "-");
        return host.length > 35 ? host.substring(0, 32) + "..." : host;
      }},
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_app_service",
    label: "App Service",
    icon: AppWindow,
    resourceType: "azure_app_service",
    metricPrefix: "azure.azure_app_service",
    keyMetrics: [
      { name: "azure.azure_app_service.cpu_time", label: "CPU Time", unit: "sec" },
      { name: "azure.azure_app_service.requests", label: "Requests", unit: "count" },
      { name: "azure.azure_app_service.response_time", label: "Avg Response", unit: "sec" },
      { name: "azure.azure_app_service.mem_working_set", label: "Memory Working Set", unit: "bytes" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind", render: (r) => String(r.metadata.kind ?? "-") },
      { key: "state", label: "State", render: (r) => String(r.metadata.state ?? "-") },
      { key: "hostname", label: "Hostname", render: (r) => {
        const host = String(r.metadata.default_hostname ?? "-");
        return host.length > 35 ? host.substring(0, 32) + "..." : host;
      }},
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_aks",
    label: "AKS",
    icon: Container,
    resourceType: "azure_aks",
    metricPrefix: "azure.azure_aks",
    keyMetrics: [
      { name: "azure.azure_aks.node_cpu_pct", label: "Node CPU", unit: "%" },
      { name: "azure.azure_aks.node_mem_pct", label: "Node Memory", unit: "%" },
      { name: "azure.azure_aks.node_disk_pct", label: "Node Disk", unit: "%" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "version", label: "K8s Version", render: (r) => String(r.metadata.kubernetes_version ?? "-") },
      { key: "nodes", label: "Nodes", render: (r) => String(r.metadata.total_node_count ?? "-") },
      { key: "pools", label: "Pools", render: (r) => String(r.metadata.node_pool_count ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_storage",
    label: "Storage",
    icon: Archive,
    resourceType: "azure_storage",
    metricPrefix: "azure.azure_storage",
    keyMetrics: [
      { name: "azure.azure_storage.used_capacity", label: "Used Capacity", unit: "bytes" },
      { name: "azure.azure_storage.transactions", label: "Transactions", unit: "count" },
      { name: "azure.azure_storage.ingress", label: "Ingress", unit: "bytes" },
      { name: "azure.azure_storage.egress", label: "Egress", unit: "bytes" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind", render: (r) => String(r.metadata.kind ?? "-") },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku_name ?? "-") },
      { key: "tier", label: "Tier", render: (r) => String(r.metadata.access_tier ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_lb",
    label: "Load Balancer",
    icon: ArrowUpDown,
    resourceType: "azure_lb",
    metricPrefix: "azure.azure_lb",
    keyMetrics: [
      { name: "azure.azure_lb.byte_count", label: "Bytes", unit: "bytes" },
      { name: "azure.azure_lb.packet_count", label: "Packets", unit: "count" },
      { name: "azure.azure_lb.snat_conns", label: "SNAT Connections", unit: "count" },
      { name: "azure.azure_lb.health_probe", label: "Health Probe", unit: "%" },
      { name: "azure.azure_lb.data_path", label: "Data Path Avail.", unit: "%" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku ?? "-") },
      { key: "frontend_ips", label: "Frontend IPs", render: (r) => String(r.metadata.frontend_ip_count ?? "-") },
      { key: "backend_pools", label: "Backend Pools", render: (r) => String(r.metadata.backend_pool_count ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_cosmosdb",
    label: "CosmosDB",
    icon: Database,
    resourceType: "azure_cosmosdb",
    metricPrefix: "azure.azure_cosmosdb",
    keyMetrics: [
      { name: "azure.azure_cosmosdb.total_requests", label: "Total Requests", unit: "count" },
      { name: "azure.azure_cosmosdb.total_ru", label: "Request Units", unit: "count" },
      { name: "azure.azure_cosmosdb.server_latency", label: "Server Latency", unit: "ms" },
      { name: "azure.azure_cosmosdb.normalized_ru", label: "Normalized RU %", unit: "%" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind", render: (r) => String(r.metadata.kind ?? "-") },
      { key: "consistency", label: "Consistency", render: (r) => String(r.metadata.consistency_level ?? "-") },
      { key: "locations", label: "Read Locations", render: (r) => String(r.metadata.read_locations ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_redis",
    label: "Redis",
    icon: Gauge,
    resourceType: "azure_redis",
    metricPrefix: "azure.azure_redis",
    keyMetrics: [
      { name: "azure.azure_redis.connected", label: "Connected Clients", unit: "count" },
      { name: "azure.azure_redis.cache_hits", label: "Cache Hits", unit: "count" },
      { name: "azure.azure_redis.cache_misses", label: "Cache Misses", unit: "count" },
      { name: "azure.azure_redis.server_load", label: "Server Load", unit: "%" },
      { name: "azure.azure_redis.used_memory", label: "Used Memory", unit: "bytes" },
      { name: "azure.azure_redis.ops_sec", label: "Ops/sec", unit: "ops/s" },
    ],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku_name ?? "-") },
      { key: "version", label: "Version", render: (r) => String(r.metadata.redis_version ?? "-") },
      { key: "hostname", label: "Hostname", render: (r) => {
        const host = String(r.metadata.hostname ?? "-");
        return host.length > 30 ? host.substring(0, 27) + "..." : host;
      }},
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_key_vault",
    label: "Key Vault",
    icon: Key,
    resourceType: "azure_key_vault",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku ?? "-") },
      { key: "soft_delete", label: "Soft Delete", render: (r) => r.metadata.soft_delete_enabled ? "Yes" : "No" },
      { key: "purge_protect", label: "Purge Protection", render: (r) => r.metadata.purge_protection_enabled ? "Yes" : "No" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_app_gw",
    label: "App Gateway",
    icon: Layers,
    resourceType: "azure_app_gw",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "SKU", render: (r) => String(r.metadata.sku_name ?? "-") },
      { key: "tier", label: "Tier", render: (r) => String(r.metadata.sku_tier ?? "-") },
      { key: "waf", label: "WAF", render: (r) => r.metadata.waf_enabled ? "Yes" : "No" },
      { key: "status", label: "Status" },
    ],
  },
  {
    id: "azure_dns_zone",
    label: "DNS Zones",
    icon: Globe,
    resourceType: "azure_dns_zone",
    metricPrefix: "",
    keyMetrics: [],
    columns: [
      { key: "name", label: "Zone Name" },
      { key: "type", label: "Type", render: (r) => String(r.metadata.zone_type ?? "-") },
      { key: "records", label: "Record Sets", render: (r) => String(r.metadata.number_of_record_sets ?? "-") },
      { key: "status", label: "Status" },
    ],
  },
];

const SERVICE_TABS_BY_PROVIDER: Record<string, ServiceTab[]> = {
  aws: AWS_SERVICE_TABS,
  azure: AZURE_SERVICE_TABS,
};

const TIME_RANGES = [
  { label: "15m", hours: 0.25 },
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// InfraStatusBadge — maps domain status strings to DS StatusBadge tones
// ---------------------------------------------------------------------------

const STATUS_TONE_MAP: Record<string, StatusTone> = {
  active: "success",
  running: "success",
  available: "success",
  stopped: "warning",
  terminated: "danger",
  unknown: "neutral",
};

function InfraStatusBadge({ status }: { status: string }) {
  return (
    <DSStatusBadge
      label={status}
      tone={STATUS_TONE_MAP[status] ?? "neutral"}
    />
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InfrastructurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const provider = searchParams.get("provider") ?? "";
  const accountId = searchParams.get("account") ?? "";
  const accountName = searchParams.get("name") ?? "";

  const isResourcesView = provider !== "" && accountId !== "";

  const navigateToAccount = useCallback(
    (p: CloudProvider, id: string, name: string) => {
      setSearchParams({ provider: p, account: id, name }, { replace: true });
    },
    [setSearchParams]
  );

  const navigateHome = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return (
    <div>
      {!isResourcesView && (
        <AccountsGridView onSelectAccount={navigateToAccount} />
      )}
      {isResourcesView && (
        <AccountResourcesView
          provider={provider as CloudProvider}
          accountId={accountId}
          accountName={accountName}
          onBack={navigateHome}
          onNavigateToProviders={navigateHome}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 1: All Cloud Accounts (unified cards)
// ---------------------------------------------------------------------------

function AccountsGridView({
  onSelectAccount,
}: {
  onSelectAccount: (provider: CloudProvider, accountId: string, accountName: string) => void;
}) {
  const { data: summary } = useApi<ResourceSummary>(
    () => api.resources.summary(),
    []
  );
  const { data: awsAccounts, loading: awsLoading } = useApi<AWSAccount[]>(
    () => api.aws.listAccounts().catch(() => []),
    []
  );
  const { data: azureSubs, loading: azureLoading } = useApi<AzureSubscription[]>(
    () => api.azure.listSubscriptions().catch(() => []),
    []
  );
  const { data: resources } = useApi<Resource[]>(
    () => api.resources.list({ limit: 1000 }),
    []
  );

  const accountsLoading = awsLoading || azureLoading;

  const resourceCountByAccount = useMemo(() => {
    const counts: Record<string, number> = {};
    if (resources) {
      for (const r of resources) {
        counts[r.account_id] = (counts[r.account_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [resources]);

  const [accountSearch, setAccountSearch] = useState("");

  const allAccounts: UnifiedAccount[] = useMemo(() => {
    const accounts: UnifiedAccount[] = [];
    if (awsAccounts) {
      for (const a of awsAccounts) {
        accounts.push({
          id: a.id,
          provider: "aws",
          name: a.name,
          accountId: a.account_id,
          regions: a.regions,
          enabled: a.enabled,
          lastSyncAt: a.last_sync_at,
          providerColor: "#ff9900",
        });
      }
    }
    if (azureSubs) {
      for (const s of azureSubs) {
        accounts.push({
          id: s.id,
          provider: "azure",
          name: s.name,
          accountId: s.subscription_id,
          regions: s.regions,
          enabled: s.enabled,
          lastSyncAt: s.last_sync_at,
          providerColor: "#0089d6",
        });
      }
    }
    return accounts;
  }, [awsAccounts, azureSubs]);

  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return allAccounts;
    const q = accountSearch.toLowerCase();
    return allAccounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.accountId.toLowerCase().includes(q)
    );
  }, [allAccounts, accountSearch]);

  return (
    <div>
      <PageHeader
        title="Infrastructure"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <SearchInput
              placeholder="Search accounts..."
              value={accountSearch}
              onChange={setAccountSearch}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cloud size={16} color="var(--color-neutral-400)" />
              <span style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>
                {summary?.total ?? 0} resources across{" "}
                {allAccounts.length} account{allAccounts.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        }
      />

      {accountsLoading && allAccounts.length === 0 && (
        <Card variant="bordered" className="card">
          <div style={{ textAlign: "center", padding: 40 }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: "0 auto 16px" }} />
            <p style={{ fontSize: 14, color: "var(--color-neutral-400)" }}>Loading cloud accounts...</p>
          </div>
        </Card>
      )}

      {!accountsLoading && allAccounts.length === 0 && (
        <Card variant="bordered" className="card">
          <EmptyState
            icon={<Cloud size={48} color="var(--color-neutral-400)" />}
            title="No cloud accounts connected"
            description="Add an AWS account or Azure subscription via the API to start monitoring."
          />
        </Card>
      )}

      {filteredAccounts.length === 0 && allAccounts.length > 0 && (
        <Card variant="bordered" className="card">
          <EmptyState
            icon={<Cloud size={36} color="var(--color-neutral-400)" />}
            title={`No accounts match "${accountSearch}"`}
            description="Try a different account name or ID."
          />
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: filteredAccounts.length === 1 ? "1fr" : filteredAccounts.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
          gap: 20,
        }}
      >
        {filteredAccounts.map((acct) => (
          <div
            key={acct.id}
            className="card"
            onClick={() => onSelectAccount(acct.provider, acct.accountId, acct.name)}
            style={{
              cursor: "pointer",
              transition: "border-color 0.15s, transform 0.15s",
              padding: 24,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = acct.providerColor;
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-neutral-200)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: `${acct.providerColor}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Cloud size={24} color={acct.providerColor} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{acct.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-neutral-400)", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                    {acct.accountId}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: `${acct.providerColor}20`,
                  color: acct.providerColor,
                }}
              >
                {acct.provider}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 3 }}>
                  Resources
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-neutral-900)" }}>
                  {resourceCountByAccount[acct.accountId] ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 3 }}>
                  Regions
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-neutral-900)" }}>
                  {acct.regions.length}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 3 }}>
                  Status
                </div>
                <InfraStatusBadge status={acct.enabled ? "active" : "stopped"} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-neutral-400)", textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 3 }}>
                  Last Sync
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-neutral-900)" }}>
                  {acct.lastSyncAt ? format(new Date(acct.lastSyncAt), "MMM d, HH:mm") : "Never"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// View 3: Account Resources (service tabs + table + drill-down)
// ---------------------------------------------------------------------------

function AccountResourcesView({
  provider,
  accountId,
  accountName,
  onBack,
  onNavigateToProviders,
}: {
  provider: CloudProvider;
  accountId: string;
  accountName: string;
  onBack: () => void;
  onNavigateToProviders: () => void;
}) {
  const serviceTabs = SERVICE_TABS_BY_PROVIDER[provider] ?? [];
  const [activeTab, setActiveTab] = useState(serviceTabs[0]?.id ?? "");
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [timeRange, setTimeRange] = useState(1);
  const [searchFilter, setSearchFilter] = useState("");
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const tab = serviceTabs.find((t) => t.id === activeTab) ?? serviceTabs[0];

  const { data: summary } = useApi<ResourceSummary>(
    () => api.resources.summary(),
    []
  );

  const { data: resources, refetch: refetchResources } = useApi<Resource[]>(
    () =>
      tab
        ? api.resources.list({
            resource_type: tab.resourceType,
            provider,
            account_id: accountId,
            limit: 200,
          })
        : Promise.resolve([]),
    [activeTab, provider, accountId]
  );

  useInterval(refetchResources, 30_000);

  // For ALB/NLB combined tab in AWS
  const nlbResources = useApi<Resource[]>(
    () =>
      activeTab === "alb" && provider === "aws"
        ? api.resources.list({
            resource_type: "nlb",
            provider,
            account_id: accountId,
            limit: 200,
          })
        : Promise.resolve([]),
    [activeTab, provider, accountId]
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      setSelectedResource(null);
      setSearchFilter("");
      setSortCol("name");
      setSortDir("asc");
    },
    []
  );

  const handleSort = useCallback(
    (col: string) => {
      setSortDir((prev) =>
        sortCol === col ? (prev === "asc" ? "desc" : "asc") : "asc"
      );
      setSortCol(col);
    },
    [sortCol]
  );

  const sortedResources = useMemo(() => {
    if (!resources || !tab) return [];
    let filtered = resources;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = resources.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.external_id.toLowerCase().includes(q) ||
          r.region.toLowerCase().includes(q) ||
          Object.values(r.metadata).some((v) =>
            String(v).toLowerCase().includes(q)
          )
      );
    }
    const copy = [...filtered];
    copy.sort((a, b) => {
      let aVal: string, bVal: string;
      const colDef = tab.columns.find((c) => c.key === sortCol);
      if (colDef?.render) {
        aVal = colDef.render(a);
        bVal = colDef.render(b);
      } else if (sortCol === "status") {
        aVal = a.status;
        bVal = b.status;
      } else {
        aVal = a.name;
        bVal = b.name;
      }
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [resources, sortCol, sortDir, tab, searchFilter]);

  const allResources = useMemo(() => {
    if (activeTab !== "alb" || provider !== "aws") return sortedResources;
    return [...sortedResources, ...(nlbResources.data ?? [])];
  }, [activeTab, provider, sortedResources, nlbResources.data]);

  if (!tab) return null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={selectedResource ? () => setSelectedResource(null) : onBack}
          >
            <ChevronLeft size={16} />
          </Button>
          <Breadcrumbs
            items={[
              { label: "Infrastructure", onClick: onNavigateToProviders },
              ...(selectedResource
                ? [
                    {
                      label: `${accountName}`,
                      onClick: () => setSelectedResource(null),
                    },
                    { label: selectedResource.name },
                  ]
                : [{ label: `${accountName}` }]),
            ]}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              padding: "3px 8px",
              borderRadius: 4,
              background: provider === "aws" ? "#ff990020" : "#0089d620",
              color: provider === "aws" ? "#ff9900" : "#0089d6",
              marginLeft: 4,
            }}
          >
            {provider}
          </span>
          {selectedResource && (
            <Badge variant="info">
              {selectedResource.resource_type.toUpperCase()}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cloud size={16} color="var(--color-neutral-400)" />
          <span style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>
            {summary?.total ?? 0} resources across{" "}
            {Object.keys(summary?.by_type ?? {}).length} services
          </span>
        </div>
      </div>

      {!selectedResource && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {serviceTabs.map((t) => {
            const Icon = t.icon;
            const count =
              t.id === "alb"
                ? (summary?.by_type.alb ?? 0) + (summary?.by_type.nlb ?? 0)
                : (summary?.by_type[t.resourceType] ?? 0);
            return (
              <Button
                key={t.id}
                variant={activeTab === t.id ? "primary" : "secondary"}
                size="sm"
                onClick={() => handleTabChange(t.id)}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon size={15} />
                  {t.label}
                  <span
                    style={{
                      background:
                        activeTab === t.id
                          ? "rgba(255,255,255,0.25)"
                          : "var(--color-neutral-200)",
                      color:
                        activeTab === t.id
                          ? "#fff"
                          : "var(--color-neutral-700)",
                      padding: "1px 7px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: "16px",
                    }}
                  >
                    {count}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
      )}

      {!selectedResource && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <SearchInput
            placeholder={`Search ${tab.label} resources by name, ID, region, or metadata...`}
            value={searchFilter}
            onChange={setSearchFilter}
          />
          <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>
            {allResources.length} {tab.label} resource
            {allResources.length !== 1 ? "s" : ""}
            {searchFilter && ` (filtered)`}
          </span>
        </div>
      )}

      {selectedResource ? (
        <ResourceDrillDown
          resource={selectedResource}
          tab={tab}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      ) : (
        <ResourceTable
          resources={allResources}
          tab={tab}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          onSelect={setSelectedResource}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource Table
// ---------------------------------------------------------------------------

function ResourceTable({
  resources,
  tab,
  sortCol,
  sortDir,
  onSort,
  onSelect,
}: {
  resources: Resource[];
  tab: ServiceTab;
  sortCol: string;
  sortDir: SortDir;
  onSort: (col: string) => void;
  onSelect: (r: Resource) => void;
}) {
  return (
    <Card variant="bordered" className="card" padding="sm">
      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
            {tab.columns.map((col) => (
              <th
                key={col.key}
                style={{
                  ...thStyle,
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => onSort(col.key)}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {col.label}
                  {sortCol === col.key && (
                    <span style={{ fontSize: 10 }}>
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </span>
              </th>
            ))}
            <th style={thStyle}>Region</th>
            <th style={thStyle}>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr
              key={r.id}
              style={{
                borderBottom: "1px solid var(--color-neutral-200)",
                cursor: "pointer",
                transition: "background 0.1s",
              }}
              onClick={() => onSelect(r)}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--color-neutral-100)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "")
              }
            >
              {tab.columns.map((col) => (
                <td key={col.key} style={tdStyle}>
                  {col.key === "name" ? (
                    <span
                      style={{
                        color: "var(--color-primary-500)",
                        fontWeight: 500,
                      }}
                    >
                      {r.name}
                    </span>
                  ) : col.key === "status" ? (
                    <InfraStatusBadge status={r.status} />
                  ) : col.render ? (
                    col.render(r)
                  ) : (
                    "-"
                  )}
                </td>
              ))}
              <td style={tdStyle}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-neutral-500)",
                  }}
                >
                  {r.region}
                </span>
              </td>
              <td style={tdStyle}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-neutral-400)",
                  }}
                >
                  {r.last_seen_at
                    ? format(new Date(r.last_seen_at), "MMM d, HH:mm")
                    : "-"}
                </span>
              </td>
            </tr>
          ))}
          {resources.length === 0 && (
            <tr>
              <td
                colSpan={tab.columns.length + 2}
                style={{
                  textAlign: "center",
                  padding: 48,
                  color: "var(--color-neutral-400)",
                }}
              >
                No {tab.label} resources discovered
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resource Drill-Down
// ---------------------------------------------------------------------------

function ResourceDrillDown({
  resource,
  tab,
  timeRange,
  setTimeRange,
}: {
  resource: Resource;
  tab: ServiceTab;
  timeRange: number;
  setTimeRange: (h: number) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <ResourceInfoCard resource={resource} tab={tab} />
        <ResourceTagsCard resource={resource} />
      </div>

      {tab.keyMetrics.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "var(--color-neutral-500)",
              }}
            >
              Metrics
            </h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 3 }}>
                {TIME_RANGES.map((r) => (
                  <Button
                    key={r.hours}
                    variant={timeRange === r.hours ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setTimeRange(r.hours)}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                <RefreshCw size={14} />
                <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>Refresh metrics</span>
              </Button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            {tab.keyMetrics.map((metric) => (
              <MetricPanel
                key={metric.name}
                metricName={metric.name}
                label={metric.label}
                unit={metric.unit}
                resourceId={resource.external_id}
                timeRange={timeRange}
                refreshKey={refreshKey}
              />
            ))}
          </div>
        </>
      )}

      {tab.keyMetrics.length === 0 && (
        <Card variant="bordered" className="card">
          <EmptyState
            icon={<Cloud size={40} color="var(--color-neutral-400)" />}
            title={`Metrics not available for ${tab.label}.`}
            description="This service does not have standard metric collection configured."
          />
        </Card>
      )}

      <ResourceAlerts />
    </div>
  );
}

function ResourceAlerts() {
  const navigate = useNavigate();
  const { data: events } = useApi<AlertEvent[]>(
    () => api.alerts.listEvents({ status: "firing", limit: 5 }),
    [],
  );

  const firingEvents = events ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-neutral-500)" }}>
          Active Alerts {firingEvents.length > 0 && `(${firingEvents.length})`}
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("/alerts")}
        >
          Create Alert
        </Button>
      </div>
      {firingEvents.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {firingEvents.map((e) => (
            <Card key={e.id} variant="bordered" padding="sm" className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <DSStatusBadge label={e.severity} tone={e.severity === "P1" || e.severity === "P2" ? "danger" : "warning"} />
                  <span
                    style={{ fontWeight: 500, cursor: "pointer", color: "var(--color-primary-600)" }}
                    onClick={() => navigate(`/alerts/${e.rule_id}`)}
                  >
                    {e.rule_name}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--color-neutral-400)" }}>
                  {e.fired_at ? format(new Date(e.fired_at), "MMM d, HH:mm") : ""}
                </span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="bordered" padding="sm" className="card">
          <div style={{ textAlign: "center", padding: "16px 0", color: "var(--color-neutral-400)", fontSize: 13 }}>
            No active alerts for this resource
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource Info Card
// ---------------------------------------------------------------------------

function ResourceInfoCard({
  resource,
  tab,
}: {
  resource: Resource;
  tab: ServiceTab;
}) {
  const infoFields = getInfoFields(resource, tab);

  return (
    <Card variant="bordered" className="card">
      <div style={{ flex: 2 }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-neutral-500)",
            marginBottom: 14,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Resource Details
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          <InfoItem label="Resource ID" value={resource.external_id} mono />
          <InfoItem label="Region" value={resource.region} />
          <InfoItem label="Account" value={resource.account_id} mono />
          <InfoItem label="Status" value={resource.status} badge />
          <InfoItem label="Provider" value={resource.provider.toUpperCase()} />
          <InfoItem
            label="Last Seen"
            value={
              resource.last_seen_at
                ? format(new Date(resource.last_seen_at), "MMM d, HH:mm:ss")
                : "Never"
            }
          />
          {infoFields.map((f) => (
            <InfoItem
              key={f.label}
              label={f.label}
              value={f.value}
              mono={f.mono}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resource Tags Card
// ---------------------------------------------------------------------------

function ResourceTagsCard({ resource }: { resource: Resource }) {
  const tags = Object.entries(resource.tags);

  return (
    <Card variant="bordered" className="card">
      <div style={{ flex: 1, maxHeight: 300, overflowY: "auto" }}>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-neutral-500)",
            marginBottom: 14,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Tags ({tags.length})
        </h3>
        {tags.length === 0 ? (
          <p style={{ color: "var(--color-neutral-400)", fontSize: 13 }}>No tags</p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            {tags.map(([k, v]) => (
              <div
                key={k}
                style={{ display: "flex", gap: 8, fontSize: 12 }}
              >
                <span
                  style={{
                    color: "var(--color-primary-500)",
                    fontWeight: 500,
                    minWidth: 100,
                    flexShrink: 0,
                  }}
                >
                  {k}
                </span>
                <span
                  style={{
                    color: "var(--color-neutral-900)",
                    wordBreak: "break-all",
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric Panel
// ---------------------------------------------------------------------------

function MetricPanel({
  metricName,
  label,
  unit,
  resourceId,
  timeRange,
  refreshKey,
}: {
  metricName: string;
  label: string;
  unit: string;
  resourceId: string;
  timeRange: number;
  refreshKey: number;
}) {
  const now = useMemo(() => new Date(), [refreshKey, timeRange]);
  const start = subHours(now, timeRange);

  const interval =
    timeRange <= 0.25
      ? "raw"
      : timeRange <= 1
        ? "1m"
        : timeRange <= 6
          ? "5m"
          : timeRange <= 24
            ? "15m"
            : "1h";

  const { data, loading } = useApi<MetricQueryResult[]>(
    () =>
      api.metrics.query({
        name: metricName,
        tags: { resource_id: resourceId },
        start: start.toISOString(),
        end: now.toISOString(),
        interval,
        aggregation: "avg",
      }),
    [metricName, resourceId, timeRange, refreshKey]
  );

  const latestValue = useMemo(() => {
    if (!data?.length || !data[0].datapoints.length) return null;
    const dps = data[0].datapoints;
    for (let i = dps.length - 1; i >= 0; i--) {
      if (dps[i][1] !== null) return dps[i][1];
    }
    return null;
  }, [data]);

  return (
    <Card variant="bordered" className="card" padding="sm">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-neutral-500)",
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {latestValue !== null && (
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "var(--color-neutral-900)",
              }}
            >
              {formatMetricValue(latestValue, unit)}
            </span>
          )}
          {loading && (
            <div
              className="spinner"
              style={{ width: 14, height: 14 }}
            />
          )}
        </div>
      </div>
      <TimeSeriesChart data={data ?? []} height={180} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Info Item
// ---------------------------------------------------------------------------

function InfoItem({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--color-neutral-400)",
          marginBottom: 3,
          textTransform: "uppercase",
          letterSpacing: "0.3px",
        }}
      >
        {label}
      </div>
      {badge ? (
        <InfraStatusBadge status={value} />
      ) : (
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            fontFamily: mono
              ? "'JetBrains Mono', 'Fira Code', monospace"
              : undefined,
            color: "var(--color-neutral-900)",
            wordBreak: "break-all",
          }}
        >
          {value || "-"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// getInfoFields — AWS + Azure resource details
// ---------------------------------------------------------------------------

function getInfoFields(
  r: Resource,
  tab: ServiceTab
): { label: string; value: string; mono?: boolean }[] {
  const m = r.metadata;
  switch (tab.id) {
    // ---- AWS ----
    case "ec2":
      return [
        { label: "Instance Type", value: String(m.instance_type ?? "-") },
        { label: "AZ", value: String(m.availability_zone ?? "-") },
        { label: "VPC", value: String(m.vpc_id ?? "-"), mono: true },
        { label: "Private IP", value: String(m.private_ip ?? "-"), mono: true },
        { label: "AMI", value: String(m.ami_id ?? "-"), mono: true },
        { label: "Platform", value: String(m.platform ?? "-") },
      ];
    case "ebs":
      return [
        { label: "Volume Type", value: String(m.volume_type ?? "-") },
        { label: "Size (GB)", value: String(m.size_gb ?? "-") },
        { label: "IOPS", value: String(m.iops ?? "-") },
        { label: "Throughput (MB/s)", value: String(m.throughput_mbps ?? "-") },
        { label: "Encrypted", value: m.encrypted ? "Yes" : "No" },
        {
          label: "Attached Instance",
          value: String(m.attached_instance ?? "-"),
          mono: true,
        },
      ];
    case "rds":
      return [
        { label: "Engine", value: String(m.engine ?? "-") },
        { label: "Engine Version", value: String(m.engine_version ?? "-") },
        { label: "Instance Class", value: String(m.instance_class ?? "-") },
        { label: "Storage (GB)", value: String(m.storage_gb ?? "-") },
        { label: "Multi-AZ", value: m.multi_az ? "Yes" : "No" },
        { label: "Endpoint", value: String(m.endpoint ?? "-"), mono: true },
      ];
    case "lambda":
      return [
        { label: "Runtime", value: String(m.runtime ?? "-") },
        { label: "Memory (MB)", value: String(m.memory_size ?? "-") },
        { label: "Timeout (s)", value: String(m.timeout ?? "-") },
        { label: "Handler", value: String(m.handler ?? "-"), mono: true },
        { label: "Package Type", value: String(m.package_type ?? "-") },
        { label: "Code Size", value: formatBytes(Number(m.code_size ?? 0)) },
      ];
    case "alb":
      return [
        {
          label: "Type",
          value: String(m.type ?? r.resource_type).toUpperCase(),
        },
        { label: "Scheme", value: String(m.scheme ?? "-") },
        { label: "DNS Name", value: String(m.dns_name ?? "-"), mono: true },
        { label: "VPC", value: String(m.vpc_id ?? "-"), mono: true },
      ];
    case "s3":
      return [
        { label: "Versioning", value: String(m.versioning ?? "-") },
        { label: "Encryption", value: String(m.encryption ?? "-") },
        {
          label: "Public Access",
          value: m.public_access_blocked ? "Blocked" : "Open",
        },
      ];
    case "nat":
      return [
        { label: "State", value: String(m.state ?? "-") },
        { label: "VPC", value: String(m.vpc_id ?? "-"), mono: true },
        { label: "Subnet", value: String(m.subnet_id ?? "-"), mono: true },
        { label: "Public IP", value: String(m.public_ip ?? "-"), mono: true },
      ];
    case "route53":
      return [
        { label: "Record Count", value: String(m.record_count ?? "-") },
        { label: "Private Zone", value: m.private_zone ? "Yes" : "No" },
      ];
    // ---- Azure ----
    case "azure_vm":
      return [
        { label: "VM Size", value: String(m.vm_size ?? "-") },
        { label: "OS Type", value: String(m.os_type ?? "-") },
        { label: "OS Offer", value: String(m.os_offer ?? "-") },
        { label: "OS SKU", value: String(m.os_sku ?? "-") },
        { label: "AZ", value: String(m.availability_zone ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "NIC Count", value: String(m.nic_count ?? "-") },
        { label: "OS Disk (GB)", value: String(m.os_disk_size_gb ?? "-") },
        { label: "Data Disks", value: String(m.data_disk_count ?? "-") },
      ];
    case "azure_disk":
      return [
        { label: "SKU", value: String(m.sku ?? "-") },
        { label: "Tier", value: String(m.tier ?? "-") },
        { label: "Size (GB)", value: String(m.disk_size_gb ?? "-") },
        { label: "Disk State", value: String(m.disk_state ?? "-") },
        { label: "OS Type", value: String(m.os_type ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Managed By", value: String(m.managed_by ?? "-"), mono: true },
        { label: "Encryption", value: String(m.encryption_type ?? "-") },
        { label: "IOPS R/W", value: String(m.iops_read_write ?? "-") },
        { label: "MBps R/W", value: String(m.mbps_read_write ?? "-") },
      ];
    case "azure_nsg":
      return [
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Rule Count", value: String(m.rule_count ?? "-") },
        { label: "Subnet Assoc.", value: String(m.subnet_associations ?? "-") },
        { label: "NIC Assoc.", value: String(m.nic_associations ?? "-") },
        { label: "Provisioning", value: String(m.provisioning_state ?? "-") },
      ];
    case "azure_vnet":
      return [
        {
          label: "Address Space",
          value: Array.isArray(m.address_prefixes)
            ? (m.address_prefixes as string[]).join(", ")
            : "-",
        },
        { label: "Subnet Count", value: String(m.subnet_count ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "DDoS Protection", value: m.enable_ddos_protection ? "Yes" : "No" },
        { label: "Provisioning", value: String(m.provisioning_state ?? "-") },
      ];
    case "azure_sql":
      return [
        { label: "Server", value: String(m.server_name ?? "-") },
        { label: "Database", value: String(m.database_name ?? "-") },
        { label: "SKU", value: String(m.sku_name ?? "-") },
        { label: "Tier", value: String(m.sku_tier ?? "-") },
        { label: "Capacity", value: String(m.sku_capacity ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Server FQDN", value: String(m.server_fqdn ?? "-"), mono: true },
        { label: "Zone Redundant", value: m.zone_redundant ? "Yes" : "No" },
        { label: "Collation", value: String(m.collation ?? "-") },
      ];
    case "azure_function":
      return [
        { label: "Kind", value: String(m.kind ?? "-") },
        { label: "State", value: String(m.state ?? "-") },
        { label: "Runtime", value: String(m.runtime_stack ?? "-") },
        { label: "Hostname", value: String(m.default_hostname ?? "-"), mono: true },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "HTTPS Only", value: m.https_only ? "Yes" : "No" },
        { label: "Always On", value: m.always_on ? "Yes" : "No" },
      ];
    case "azure_app_service":
      return [
        { label: "Kind", value: String(m.kind ?? "-") },
        { label: "State", value: String(m.state ?? "-") },
        { label: "Hostname", value: String(m.default_hostname ?? "-"), mono: true },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "HTTPS Only", value: m.https_only ? "Yes" : "No" },
        { label: "Outbound IPs", value: String(m.outbound_ips ?? "-"), mono: true },
      ];
    case "azure_aks":
      return [
        { label: "K8s Version", value: String(m.kubernetes_version ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Node RG", value: String(m.node_resource_group ?? "-") },
        { label: "FQDN", value: String(m.fqdn ?? "-"), mono: true },
        { label: "Power State", value: String(m.power_state ?? "-") },
        { label: "Network Plugin", value: String(m.network_plugin ?? "-") },
        { label: "Node Pools", value: String(m.node_pool_count ?? "-") },
        { label: "Total Nodes", value: String(m.total_node_count ?? "-") },
        { label: "SKU Tier", value: String(m.sku_tier ?? "-") },
      ];
    case "azure_storage":
      return [
        { label: "Kind", value: String(m.kind ?? "-") },
        { label: "SKU", value: String(m.sku_name ?? "-") },
        { label: "Tier", value: String(m.sku_tier ?? "-") },
        { label: "Access Tier", value: String(m.access_tier ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "HTTPS Only", value: m.https_traffic_only ? "Yes" : "No" },
        { label: "Blob Endpoint", value: String(m.blob_endpoint ?? "-"), mono: true },
        { label: "Encryption Key", value: String(m.encryption_key_source ?? "-") },
        { label: "HNS Enabled", value: m.is_hns_enabled ? "Yes" : "No" },
      ];
    case "azure_lb":
      return [
        { label: "SKU", value: String(m.sku ?? "-") },
        { label: "SKU Tier", value: String(m.sku_tier ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Frontend IPs", value: String(m.frontend_ip_count ?? "-") },
        { label: "Backend Pools", value: String(m.backend_pool_count ?? "-") },
        { label: "Rules", value: String(m.rule_count ?? "-") },
        { label: "Probes", value: String(m.probe_count ?? "-") },
      ];
    case "azure_cosmosdb":
      return [
        { label: "Kind", value: String(m.kind ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Endpoint", value: String(m.document_endpoint ?? "-"), mono: true },
        { label: "Offer Type", value: String(m.database_account_offer_type ?? "-") },
        { label: "Consistency", value: String(m.consistency_level ?? "-") },
        { label: "Read Locations", value: String(m.read_locations ?? "-") },
        { label: "Auto Failover", value: m.enable_automatic_failover ? "Yes" : "No" },
        {
          label: "Capabilities",
          value: Array.isArray(m.capabilities)
            ? (m.capabilities as string[]).join(", ") || "-"
            : "-",
        },
      ];
    case "azure_redis":
      return [
        { label: "SKU", value: String(m.sku_name ?? "-") },
        { label: "Family", value: String(m.sku_family ?? "-") },
        { label: "Capacity", value: String(m.sku_capacity ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Hostname", value: String(m.hostname ?? "-"), mono: true },
        { label: "Port", value: String(m.port ?? "-") },
        { label: "SSL Port", value: String(m.ssl_port ?? "-") },
        { label: "Redis Version", value: String(m.redis_version ?? "-") },
        { label: "Non-SSL Port", value: m.non_ssl_port_enabled ? "Yes" : "No" },
        { label: "Shard Count", value: String(m.shard_count ?? "-") },
      ];
    case "azure_key_vault":
      return [
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Vault URI", value: String(m.vault_uri ?? "-"), mono: true },
        { label: "SKU", value: String(m.sku ?? "-") },
        { label: "Soft Delete", value: m.soft_delete_enabled ? "Yes" : "No" },
        { label: "Purge Protection", value: m.purge_protection_enabled ? "Yes" : "No" },
      ];
    case "azure_app_gw":
      return [
        { label: "SKU Name", value: String(m.sku_name ?? "-") },
        { label: "SKU Tier", value: String(m.sku_tier ?? "-") },
        { label: "Capacity", value: String(m.sku_capacity ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        { label: "Operational State", value: String(m.operational_state ?? "-") },
        { label: "HTTP Listeners", value: String(m.http_listener_count ?? "-") },
        { label: "Backend Pools", value: String(m.backend_pool_count ?? "-") },
        { label: "WAF Enabled", value: m.waf_enabled ? "Yes" : "No" },
      ];
    case "azure_dns_zone":
      return [
        { label: "Zone Type", value: String(m.zone_type ?? "-") },
        { label: "Record Sets", value: String(m.number_of_record_sets ?? "-") },
        { label: "Max Record Sets", value: String(m.max_number_of_record_sets ?? "-") },
        { label: "Resource Group", value: String(m.resource_group ?? "-") },
        {
          label: "Name Servers",
          value: Array.isArray(m.name_servers)
            ? (m.name_servers as string[]).join(", ") || "-"
            : "-",
        },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting Helpers
// ---------------------------------------------------------------------------

function formatMetricValue(val: number, unit: string): string {
  if (unit === "%") return `${val.toFixed(1)}%`;
  if (unit === "bytes") return formatBytes(val);
  if (unit === "ms")
    return val < 1
      ? `${(val * 1000).toFixed(0)}µs`
      : val < 1000
        ? `${val.toFixed(1)}ms`
        : `${(val / 1000).toFixed(2)}s`;
  if (unit === "sec")
    return val < 1 ? `${(val * 1000).toFixed(0)}ms` : `${val.toFixed(2)}s`;
  if (unit === "ops" || unit === "count" || unit === "ops/s") {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`;
    return val.toFixed(val < 10 ? 1 : 0);
  }
  return val.toFixed(2);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

// ---------------------------------------------------------------------------
// Shared Styles
// ---------------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontWeight: 600,
  color: "var(--color-neutral-500)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  background: "var(--color-neutral-100)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
};
