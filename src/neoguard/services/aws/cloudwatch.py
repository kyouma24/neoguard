"""Generic CloudWatch metrics collector.

Pulls metrics for any AWS namespace by mapping CloudWatch dimensions
to NeoGuard resource tags. Supports batch GetMetricData for efficiency.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from neoguard.core.logging import log
from neoguard.models.aws import AWSAccount
from neoguard.models.metrics import MetricPoint, MetricType
from neoguard.services.aws.credentials import get_client
from neoguard.services.metrics.writer import metric_writer

METRIC_DEFINITIONS: dict[str, list[dict]] = {
    "AWS/EC2": [
        # CPU
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "CPUCreditBalance", "stat": "Average", "unit": "Count"},
        {"name": "CPUCreditUsage", "stat": "Average", "unit": "Count"},
        {"name": "CPUSurplusCreditBalance", "stat": "Average", "unit": "Count"},
        # Status checks — split by source for actionable alerting
        {"name": "StatusCheckFailed", "stat": "Maximum", "unit": "Count"},
        {"name": "StatusCheckFailed_Instance", "stat": "Maximum", "unit": "Count"},
        {"name": "StatusCheckFailed_System", "stat": "Maximum", "unit": "Count"},
        {"name": "StatusCheckFailed_AttachedEBS", "stat": "Maximum", "unit": "Count"},
        # Network
        {"name": "NetworkIn", "stat": "Average", "unit": "Bytes"},
        {"name": "NetworkOut", "stat": "Average", "unit": "Bytes"},
        {"name": "NetworkPacketsIn", "stat": "Sum", "unit": "Count"},
        {"name": "NetworkPacketsOut", "stat": "Sum", "unit": "Count"},
        # Disk (instance store)
        {"name": "DiskReadOps", "stat": "Average", "unit": "Count"},
        {"name": "DiskWriteOps", "stat": "Average", "unit": "Count"},
        {"name": "DiskReadBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "DiskWriteBytes", "stat": "Average", "unit": "Bytes"},
        # EBS
        {"name": "EBSReadOps", "stat": "Average", "unit": "Count"},
        {"name": "EBSWriteOps", "stat": "Average", "unit": "Count"},
        {"name": "EBSReadBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "EBSWriteBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "EBSIOBalance%", "stat": "Average", "unit": "Percent"},
        {"name": "EBSByteBalance%", "stat": "Average", "unit": "Percent"},
    ],
    "AWS/EBS": [
        {"name": "VolumeReadOps", "stat": "Average", "unit": "Count"},
        {"name": "VolumeWriteOps", "stat": "Average", "unit": "Count"},
        {"name": "VolumeReadBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "VolumeWriteBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "VolumeTotalReadTime", "stat": "Average", "unit": "Seconds"},
        {"name": "VolumeTotalWriteTime", "stat": "Average", "unit": "Seconds"},
        {"name": "VolumeIdleTime", "stat": "Average", "unit": "Seconds"},
        {"name": "VolumeQueueLength", "stat": "Average", "unit": "Count"},
        {"name": "VolumeThroughputPercentage", "stat": "Average", "unit": "Percent"},
        {"name": "VolumeConsumedReadWriteOps", "stat": "Average", "unit": "Count"},
        {"name": "BurstBalance", "stat": "Average", "unit": "Percent"},
    ],
    "AWS/RDS": [
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "FreeableMemory", "stat": "Average", "unit": "Bytes"},
        {"name": "FreeStorageSpace", "stat": "Average", "unit": "Bytes"},
        {"name": "DatabaseConnections", "stat": "Average", "unit": "Count"},
        {"name": "ReadIOPS", "stat": "Average", "unit": "Count/Second"},
        {"name": "WriteIOPS", "stat": "Average", "unit": "Count/Second"},
        {"name": "ReadLatency", "stat": "Average", "unit": "Seconds"},
        {"name": "WriteLatency", "stat": "Average", "unit": "Seconds"},
        {"name": "ReplicaLag", "stat": "Average", "unit": "Seconds"},
        {"name": "NetworkReceiveThroughput", "stat": "Average", "unit": "Bytes/Second"},
        {"name": "NetworkTransmitThroughput", "stat": "Average", "unit": "Bytes/Second"},
    ],
    "AWS/Lambda": [
        {"name": "Invocations", "stat": "Sum", "unit": "Count"},
        {"name": "Errors", "stat": "Sum", "unit": "Count"},
        {"name": "Duration", "stat": "Average", "unit": "Milliseconds"},
        {"name": "Duration", "stat": "p99", "unit": "Milliseconds", "alias": "Duration_p99"},
        {"name": "Throttles", "stat": "Sum", "unit": "Count"},
        {"name": "ConcurrentExecutions", "stat": "Maximum", "unit": "Count"},
        {"name": "IteratorAge", "stat": "Average", "unit": "Milliseconds"},
    ],
    "AWS/ELB": [
        {"name": "RequestCount", "stat": "Sum", "unit": "Count"},
        {"name": "HealthyHostCount", "stat": "Average", "unit": "Count"},
        {"name": "UnHealthyHostCount", "stat": "Average", "unit": "Count"},
        {"name": "Latency", "stat": "Average", "unit": "Seconds"},
        {"name": "HTTPCode_Backend_5XX", "stat": "Sum", "unit": "Count"},
        {"name": "SurgeQueueLength", "stat": "Maximum", "unit": "Count"},
        {"name": "SpilloverCount", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/ApplicationELB": [
        {"name": "RequestCount", "stat": "Sum", "unit": "Count"},
        {"name": "TargetResponseTime", "stat": "Average", "unit": "Seconds"},
        {"name": "HealthyHostCount", "stat": "Average", "unit": "Count"},
        {"name": "UnHealthyHostCount", "stat": "Average", "unit": "Count"},
        {"name": "HTTPCode_Target_5XX_Count", "stat": "Sum", "unit": "Count"},
        {"name": "HTTPCode_Target_4XX_Count", "stat": "Sum", "unit": "Count"},
        {"name": "ActiveConnectionCount", "stat": "Sum", "unit": "Count"},
        {"name": "NewConnectionCount", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/DynamoDB": [
        {"name": "ConsumedReadCapacityUnits", "stat": "Sum", "unit": "Count"},
        {"name": "ConsumedWriteCapacityUnits", "stat": "Sum", "unit": "Count"},
        {"name": "ThrottledRequests", "stat": "Sum", "unit": "Count"},
        {"name": "ReadThrottleEvents", "stat": "Sum", "unit": "Count"},
        {"name": "WriteThrottleEvents", "stat": "Sum", "unit": "Count"},
        {"name": "SuccessfulRequestLatency", "stat": "Average", "unit": "Milliseconds"},
        {"name": "SystemErrors", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/SQS": [
        {"name": "NumberOfMessagesSent", "stat": "Sum", "unit": "Count"},
        {"name": "NumberOfMessagesReceived", "stat": "Sum", "unit": "Count"},
        {"name": "NumberOfMessagesDeleted", "stat": "Sum", "unit": "Count"},
        {"name": "ApproximateNumberOfMessagesVisible", "stat": "Average", "unit": "Count"},
        {"name": "ApproximateNumberOfMessagesNotVisible", "stat": "Average", "unit": "Count"},
        {"name": "ApproximateAgeOfOldestMessage", "stat": "Maximum", "unit": "Seconds"},
    ],
    "AWS/SNS": [
        {"name": "NumberOfMessagesPublished", "stat": "Sum", "unit": "Count"},
        {"name": "NumberOfNotificationsDelivered", "stat": "Sum", "unit": "Count"},
        {"name": "NumberOfNotificationsFailed", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/ECS": [
        # Service-level compute
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "MemoryUtilization", "stat": "Average", "unit": "Percent"},
        # Cluster-level capacity reservation
        {"name": "CPUReservation", "stat": "Average", "unit": "Percent"},
        {"name": "MemoryReservation", "stat": "Average", "unit": "Percent"},
        # Task counts
        {"name": "DesiredTaskCount", "stat": "Average", "unit": "Count"},
        {"name": "RunningTaskCount", "stat": "Average", "unit": "Count"},
        {"name": "PendingTaskCount", "stat": "Average", "unit": "Count"},
        # Deployment health
        {"name": "DeploymentCount", "stat": "Average", "unit": "Count"},
        {"name": "TaskSetCount", "stat": "Average", "unit": "Count"},
        # Storage IO (ECS on Fargate)
        {"name": "StorageReadBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "StorageWriteBytes", "stat": "Sum", "unit": "Bytes"},
        # Network (ECS with awsvpc network mode)
        {"name": "NetworkRxBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "NetworkTxBytes", "stat": "Sum", "unit": "Bytes"},
    ],
    "AWS/ElastiCache": [
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "FreeableMemory", "stat": "Average", "unit": "Bytes"},
        {"name": "CacheHits", "stat": "Sum", "unit": "Count"},
        {"name": "CacheMisses", "stat": "Sum", "unit": "Count"},
        {"name": "CurrConnections", "stat": "Average", "unit": "Count"},
        {"name": "Evictions", "stat": "Sum", "unit": "Count"},
        {"name": "ReplicationLag", "stat": "Average", "unit": "Seconds"},
    ],
    "AWS/S3": [
        {"name": "BucketSizeBytes", "stat": "Average", "unit": "Bytes"},
        {"name": "NumberOfObjects", "stat": "Average", "unit": "Count"},
    ],
    "AWS/Kinesis": [
        {"name": "IncomingRecords", "stat": "Sum", "unit": "Count"},
        {"name": "IncomingBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "GetRecords.IteratorAgeMilliseconds", "stat": "Maximum", "unit": "Milliseconds"},
        {"name": "ReadProvisionedThroughputExceeded", "stat": "Sum", "unit": "Count"},
        {"name": "WriteProvisionedThroughputExceeded", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/ApiGateway": [
        {"name": "Count", "stat": "Sum", "unit": "Count"},
        {"name": "Latency", "stat": "Average", "unit": "Milliseconds"},
        {"name": "IntegrationLatency", "stat": "Average", "unit": "Milliseconds"},
        {"name": "4XXError", "stat": "Sum", "unit": "Count"},
        {"name": "5XXError", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/NATGateway": [
        {"name": "BytesInFromDestination", "stat": "Sum", "unit": "Bytes"},
        {"name": "BytesOutToDestination", "stat": "Sum", "unit": "Bytes"},
        {"name": "ActiveConnectionCount", "stat": "Maximum", "unit": "Count"},
        {"name": "PacketsDropCount", "stat": "Sum", "unit": "Count"},
        {"name": "ErrorPortAllocation", "stat": "Sum", "unit": "Count"},
    ],
    "AWS/CloudFront": [
        {"name": "Requests", "stat": "Sum", "unit": "None"},
        {"name": "BytesDownloaded", "stat": "Sum", "unit": "None"},
        {"name": "4xxErrorRate", "stat": "Average", "unit": "Percent"},
        {"name": "5xxErrorRate", "stat": "Average", "unit": "Percent"},
    ],
    "AWS/States": [
        {"name": "ExecutionsStarted", "stat": "Sum", "unit": "Count"},
        {"name": "ExecutionsSucceeded", "stat": "Sum", "unit": "Count"},
        {"name": "ExecutionsFailed", "stat": "Sum", "unit": "Count"},
        {"name": "ExecutionTime", "stat": "Average", "unit": "Milliseconds"},
    ],
    "AWS/Redshift": [
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "PercentageDiskSpaceUsed", "stat": "Average", "unit": "Percent"},
        {"name": "DatabaseConnections", "stat": "Average", "unit": "Count"},
        {"name": "ReadIOPS", "stat": "Average", "unit": "Count/Second"},
        {"name": "WriteIOPS", "stat": "Average", "unit": "Count/Second"},
        {"name": "ReadLatency", "stat": "Average", "unit": "Seconds"},
        {"name": "WriteLatency", "stat": "Average", "unit": "Seconds"},
        {"name": "NetworkReceiveThroughput", "stat": "Average", "unit": "Bytes/Second"},
        {"name": "NetworkTransmitThroughput", "stat": "Average", "unit": "Bytes/Second"},
    ],
    "AWS/ES": [
        {"name": "CPUUtilization", "stat": "Average", "unit": "Percent"},
        {"name": "FreeStorageSpace", "stat": "Minimum", "unit": "Megabytes"},
        {"name": "SearchableDocuments", "stat": "Average", "unit": "Count"},
        {"name": "ClusterStatus.green", "stat": "Maximum", "unit": "Count"},
        {"name": "ClusterStatus.yellow", "stat": "Maximum", "unit": "Count"},
        {"name": "ClusterStatus.red", "stat": "Maximum", "unit": "Count"},
        {"name": "Indexing rate", "stat": "Average", "unit": "Count"},
        {"name": "SearchRate", "stat": "Average", "unit": "Count"},
    ],
    "AWS/EKS": [
        {"name": "cluster_failed_node_count", "stat": "Average", "unit": "Count"},
        {"name": "cluster_node_count", "stat": "Average", "unit": "Count"},
        {"name": "node_cpu_utilization", "stat": "Average", "unit": "Percent"},
        {"name": "node_memory_utilization", "stat": "Average", "unit": "Percent"},
        {"name": "pod_cpu_utilization", "stat": "Average", "unit": "Percent"},
        {"name": "pod_memory_utilization", "stat": "Average", "unit": "Percent"},
    ],
    "AWS/EFS": [
        {"name": "TotalIOBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "DataReadIOBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "DataWriteIOBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "MetadataIOBytes", "stat": "Sum", "unit": "Bytes"},
        {"name": "ClientConnections", "stat": "Sum", "unit": "Count"},
        {"name": "BurstCreditBalance", "stat": "Average", "unit": "Bytes"},
    ],
}

NAMESPACE_DIMENSION_KEY: dict[str, str] = {
    "AWS/EC2": "InstanceId",
    "AWS/EBS": "VolumeId",
    "AWS/RDS": "DBInstanceIdentifier",
    "AWS/Lambda": "FunctionName",
    "AWS/ELB": "LoadBalancerName",
    "AWS/ApplicationELB": "LoadBalancer",
    "AWS/DynamoDB": "TableName",
    "AWS/SQS": "QueueName",
    "AWS/SNS": "TopicName",
    "AWS/ECS": "ServiceName",
    "AWS/ElastiCache": "CacheClusterId",
    "AWS/S3": "BucketName",
    "AWS/Kinesis": "StreamName",
    "AWS/ApiGateway": "ApiName",
    "AWS/NATGateway": "NatGatewayId",
    "AWS/CloudFront": "DistributionId",
    "AWS/States": "StateMachineArn",
    "AWS/Redshift": "ClusterIdentifier",
    "AWS/ES": "DomainName",
    "AWS/EKS": "ClusterName",
    "AWS/EFS": "FileSystemId",
}


async def collect_cloudwatch_metrics(
    account: AWSAccount,
    region: str,
    namespace: str,
    resource_entries: list[tuple[str, dict[str, str]]] | list[str],
    lookback_minutes: int = 5,
    period_seconds: int = 300,
) -> int:
    """Pull CloudWatch metrics for a set of resources in a single namespace.

    resource_entries can be either:
      - list of (resource_id, extra_tags_dict) tuples
      - list of plain resource_id strings (backward compat)

    Uses GetMetricData for batch efficiency (up to 500 queries per call).
    Returns the number of datapoints ingested.
    """
    definitions = METRIC_DEFINITIONS.get(namespace, [])
    if not definitions:
        await log.awarn("No metric definitions for namespace", namespace=namespace)
        return 0

    dim_key = NAMESPACE_DIMENSION_KEY.get(namespace, "")
    if not dim_key:
        await log.awarn("No dimension key for namespace", namespace=namespace)
        return 0

    entries: list[tuple[str, dict[str, str]]] = []
    for entry in resource_entries:
        if isinstance(entry, str):
            entries.append((entry, {}))
        else:
            entries.append(entry)

    cw = get_client(account, region, "cloudwatch")

    end_time = datetime.now(UTC)
    start_time = end_time - timedelta(minutes=lookback_minutes)

    metric_queries = []
    query_map: dict[str, tuple[str, str, str, dict[str, str]]] = {}

    for res_id, extra_tags in entries:
        for defn in definitions:
            alias = defn.get("alias", defn["name"])
            query_id = _safe_id(f"{res_id}_{alias}_{defn['stat']}")

            metric_queries.append({
                "Id": query_id,
                "MetricStat": {
                    "Metric": {
                        "Namespace": namespace,
                        "MetricName": defn["name"],
                        "Dimensions": [{"Name": dim_key, "Value": res_id}],
                    },
                    "Period": period_seconds,
                    "Stat": defn["stat"],
                },
            })
            query_map[query_id] = (res_id, alias, defn["stat"], extra_tags)

    total_points = 0
    for batch_start in range(0, len(metric_queries), 500):
        batch = metric_queries[batch_start:batch_start + 500]
        try:
            points = await _fetch_batch(
                cw, batch, query_map, start_time, end_time,
                namespace, region, account.account_id,
            )
            total_points += points
        except Exception as e:
            await log.aerror(
                "CloudWatch batch failed",
                namespace=namespace,
                region=region,
                error=str(e),
            )

    return total_points


async def _fetch_batch(
    cw, queries: list, query_map: dict,
    start_time: datetime, end_time: datetime,
    namespace: str, region: str, account_id: str,
) -> int:
    paginator = cw.get_paginator("get_metric_data")
    points: list[MetricPoint] = []

    pages = await asyncio.to_thread(
        lambda: list(paginator.paginate(
            MetricDataQueries=queries,
            StartTime=start_time,
            EndTime=end_time,
        )),
    )
    for page in pages:
        for result in page.get("MetricDataResults", []):
            query_id = result["Id"]
            if query_id not in query_map:
                continue
            entry = query_map[query_id]
            res_id = entry[0]
            metric_alias = entry[1]
            stat = entry[2]
            extra_tags = entry[3] if len(entry) > 3 else {}

            ns_prefix = namespace.replace("AWS/", "aws.").lower()
            metric_name = f"{ns_prefix}.{_snake_case(metric_alias)}"

            base_tags = {
                "resource_id": res_id,
                "region": region,
                "account_id": account_id,
                "namespace": namespace,
                "stat": stat,
            }
            if extra_tags:
                base_tags.update(extra_tags)

            for ts, val in zip(result["Timestamps"], result["Values"], strict=False):
                points.append(MetricPoint(
                    name=metric_name,
                    value=val,
                    timestamp=ts,
                    tags=base_tags.copy(),
                    metric_type=MetricType.GAUGE,
                ))

    if points:
        await metric_writer.write("default", points)

    return len(points)


def _safe_id(s: str) -> str:
    result = []
    for c in s.lower():
        if c.isalnum():
            result.append(c)
        else:
            result.append("_")
    out = "".join(result)
    if not out[0].isalpha():
        out = "m_" + out
    return out[:255]


def _snake_case(s: str) -> str:
    result = []
    for i, c in enumerate(s):
        if c.isupper() and i > 0 and not s[i - 1].isupper():
            result.append("_")
        if c.isalnum() or c in (".", "_"):
            result.append(c.lower())
    return "".join(result).replace(".", "_")
