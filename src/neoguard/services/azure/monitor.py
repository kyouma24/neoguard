"""Azure Monitor metrics collector.

Pulls metrics for Azure resources using Azure Monitor API.
Maps resource types to their metric namespaces and definitions.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from azure.mgmt.monitor import MonitorManagementClient

from neoguard.core.logging import log
from neoguard.models.azure import AzureSubscription
from neoguard.models.metrics import MetricPoint, MetricType
from neoguard.services.azure.credentials import get_mgmt_client
from neoguard.services.metrics.writer import metric_writer


def _m(name: str, agg: str, unit: str, alias: str) -> dict:
    return {"name": name, "agg": agg, "unit": unit, "alias": alias}


METRIC_DEFINITIONS: dict[str, list[dict]] = {
    "azure_vm": [
        _m("Percentage CPU", "Average", "%", "cpu_percent"),
        _m("Available Memory Bytes", "Average", "bytes", "mem_avail"),
        _m("Network In Total", "Total", "bytes", "network_in"),
        _m("Network Out Total", "Total", "bytes", "network_out"),
        _m("Disk Read Bytes", "Total", "bytes", "disk_read_bytes"),
        _m("Disk Write Bytes", "Total", "bytes", "disk_write_bytes"),
        _m("Disk Read Operations/Sec", "Average", "ops", "disk_read_ops"),
        _m("Disk Write Operations/Sec", "Average", "ops", "disk_write_ops"),
        _m("OS Disk Queue Depth", "Average", "count", "os_disk_queue"),
        _m("Data Disk Queue Depth", "Average", "count", "data_disk_queue"),
    ],
    "azure_disk": [
        _m("Composite Disk Read Bytes/sec", "Average", "B/s", "read_bps"),
        _m("Composite Disk Write Bytes/sec", "Average", "B/s", "write_bps"),
        _m("Composite Disk Read Operations/sec", "Average", "ops/s", "read_ops"),
        _m("Composite Disk Write Operations/sec", "Average", "ops/s", "write_ops"),
        _m("DiskPaidBurstIOPS", "Average", "count", "burst_iops"),
    ],
    "azure_sql": [
        _m("cpu_percent", "Average", "%", "cpu_percent"),
        _m("physical_data_read_percent", "Average", "%", "data_io_pct"),
        _m("log_write_percent", "Average", "%", "log_write_pct"),
        _m("dtu_consumption_percent", "Average", "%", "dtu_pct"),
        _m("storage_percent", "Maximum", "%", "storage_pct"),
        _m("connection_successful", "Total", "count", "conn_ok"),
        _m("connection_failed", "Total", "count", "conn_fail"),
        _m("deadlock", "Total", "count", "deadlocks"),
        _m("sessions_percent", "Average", "%", "sessions_pct"),
        _m("workers_percent", "Average", "%", "workers_pct"),
    ],
    "azure_function": [
        _m("FunctionExecutionCount", "Total", "count", "exec_count"),
        _m("FunctionExecutionUnits", "Total", "count", "exec_units"),
        _m("Http5xx", "Total", "count", "http_5xx"),
        _m("Requests", "Total", "count", "requests"),
        _m("AverageResponseTime", "Average", "sec", "response_time"),
        _m("BytesReceived", "Total", "bytes", "bytes_recv"),
        _m("BytesSent", "Total", "bytes", "bytes_sent"),
    ],
    "azure_app_service": [
        _m("CpuTime", "Total", "sec", "cpu_time"),
        _m("Requests", "Total", "count", "requests"),
        _m("BytesReceived", "Total", "bytes", "bytes_recv"),
        _m("BytesSent", "Total", "bytes", "bytes_sent"),
        _m("Http5xx", "Total", "count", "http_5xx"),
        _m("Http4xx", "Total", "count", "http_4xx"),
        _m("AverageResponseTime", "Average", "sec", "response_time"),
        _m("MemoryWorkingSet", "Average", "bytes", "mem_working_set"),
        _m("HealthCheckStatus", "Average", "count", "health_check"),
    ],
    "azure_aks": [
        _m("node_cpu_usage_percentage", "Average", "%", "node_cpu_pct"),
        _m("node_memory_rss_percentage", "Average", "%", "node_mem_pct"),
        _m("node_disk_usage_percentage", "Average", "%", "node_disk_pct"),
        _m("kube_pod_status_ready", "Average", "count", "pods_ready"),
        _m("kube_node_status_condition", "Average", "count", "node_cond"),
    ],
    "azure_storage": [
        _m("UsedCapacity", "Average", "bytes", "used_capacity"),
        _m("Transactions", "Total", "count", "transactions"),
        _m("Ingress", "Total", "bytes", "ingress"),
        _m("Egress", "Total", "bytes", "egress"),
        _m("SuccessE2ELatency", "Average", "ms", "e2e_latency"),
        _m("SuccessServerLatency", "Average", "ms", "server_latency"),
        _m("Availability", "Average", "%", "availability"),
    ],
    "azure_lb": [
        _m("ByteCount", "Total", "bytes", "byte_count"),
        _m("PacketCount", "Total", "count", "packet_count"),
        _m("SYNCount", "Total", "count", "syn_count"),
        _m("SnatConnectionCount", "Total", "count", "snat_conns"),
        _m("DipAvailability", "Average", "%", "health_probe"),
        _m("VipAvailability", "Average", "%", "data_path"),
    ],
    "azure_cosmosdb": [
        _m("TotalRequestUnits", "Total", "count", "total_ru"),
        _m("TotalRequests", "Count", "count", "total_requests"),
        _m("DocumentCount", "Total", "count", "doc_count"),
        _m("DataUsage", "Total", "bytes", "data_usage"),
        _m("ServerSideLatency", "Average", "ms", "server_latency"),
        _m("AvailableStorage", "Total", "bytes", "avail_storage"),
        _m("NormalizedRUConsumption", "Maximum", "%", "normalized_ru"),
    ],
    "azure_redis": [
        _m("connectedclients", "Maximum", "count", "connected"),
        _m("usedmemory", "Maximum", "bytes", "used_memory"),
        _m("usedmemorypercentage", "Maximum", "%", "memory_pct"),
        _m("serverLoad", "Maximum", "%", "server_load"),
        _m("cacheRead", "Maximum", "B/s", "cache_read"),
        _m("cacheWrite", "Maximum", "B/s", "cache_write"),
        _m("totalkeys", "Maximum", "count", "total_keys"),
        _m("cachehits", "Total", "count", "cache_hits"),
        _m("cachemisses", "Total", "count", "cache_misses"),
        _m("getcommands", "Total", "count", "get_cmds"),
        _m("setcommands", "Total", "count", "set_cmds"),
        _m("operationsPerSecond", "Maximum", "ops/s", "ops_sec"),
    ],
}

AGG_MAP = {
    "Average": "average",
    "Total": "total",
    "Maximum": "maximum",
    "Minimum": "minimum",
    "Count": "count",
}


async def collect_azure_metrics(
    sub: AzureSubscription,
    resource_type: str,
    resource_entries: list[tuple[str, dict[str, str]]],
    lookback_minutes: int = 5,
    interval: str = "PT5M",
) -> int:
    """Pull Azure Monitor metrics for a set of resources of the same type.

    resource_entries: list of (azure_resource_id, extra_tags) tuples.
    Returns total datapoints ingested.
    """
    definitions = METRIC_DEFINITIONS.get(resource_type, [])
    if not definitions:
        return 0

    monitor = get_mgmt_client(sub, MonitorManagementClient)

    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(minutes=lookback_minutes)
    timespan = (
        f"{start_time.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        f"/{end_time.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    )

    metric_names = ",".join(d["name"] for d in definitions)
    alias_map = {d["name"]: d["alias"] for d in definitions}
    agg_types = list({d["agg"] for d in definitions})

    total_points = 0

    for resource_id, extra_tags in resource_entries:
        try:
            response = await asyncio.to_thread(
                monitor.metrics.list,
                resource_uri=resource_id,
                timespan=timespan,
                interval=interval,
                metricnames=metric_names,
                aggregation=",".join(agg_types),
            )

            points: list[MetricPoint] = []
            for metric in response.value:
                alias = alias_map.get(metric.name.value, metric.name.value)
                metric_name = f"azure.{resource_type}.{alias}"

                for ts in metric.timeseries:
                    for dp in ts.data:
                        val = None
                        for agg_key in agg_types:
                            v = getattr(dp, AGG_MAP.get(agg_key, "average"), None)
                            if v is not None:
                                val = v
                                break
                        if val is None:
                            continue

                        base_tags = {
                            "resource_id": resource_id,
                            "subscription_id": sub.subscription_id,
                            "resource_type": resource_type,
                        }
                        if extra_tags:
                            base_tags.update(extra_tags)

                        points.append(MetricPoint(
                            name=metric_name,
                            value=val,
                            timestamp=dp.time_stamp,
                            tags=base_tags,
                            metric_type=MetricType.GAUGE,
                        ))

            if points:
                await metric_writer.write(sub.tenant_id, points)
            total_points += len(points)

        except Exception as e:
            await log.aerror(
                "Azure metric collection failed",
                resource_id=resource_id,
                resource_type=resource_type,
                error=str(e),
            )

    return total_points
