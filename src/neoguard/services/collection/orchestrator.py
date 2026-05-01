"""Collection orchestrator — runs discovery and metric collection on a schedule."""

import asyncio
import time as _time
from contextlib import suppress

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.services.aws.accounts import list_aws_accounts
from neoguard.services.aws.accounts import mark_synced as aws_mark_synced
from neoguard.services.aws.cloudwatch import collect_cloudwatch_metrics
from neoguard.services.aws.credentials import get_enabled_regions
from neoguard.services.azure.accounts import list_azure_subscriptions
from neoguard.services.azure.accounts import mark_synced as azure_mark_synced
from neoguard.services.azure.monitor import METRIC_DEFINITIONS as AZURE_METRIC_DEFS
from neoguard.services.azure.monitor import collect_azure_metrics
from neoguard.services.collection.jobs import complete_job, create_job
from neoguard.services.discovery.aws_discovery import discover_all as aws_discover_all
from neoguard.services.discovery.azure_discovery import discover_all as azure_discover_all
from neoguard.services.resources.crud import list_resources

NAMESPACE_FOR_TYPE: dict[str, str] = {
    "ec2": "AWS/EC2",
    "ebs": "AWS/EBS",
    "rds": "AWS/RDS",
    "aurora": "AWS/RDS",
    "lambda": "AWS/Lambda",
    "elb": "AWS/ELB",
    "alb": "AWS/ApplicationELB",
    "nlb": "AWS/ApplicationELB",
    "dynamodb": "AWS/DynamoDB",
    "sqs": "AWS/SQS",
    "sns": "AWS/SNS",
    "ecs_service": "AWS/ECS",
    "ecs_cluster": "AWS/ECS",
    "eks": "AWS/EKS",
    "elasticache": "AWS/ElastiCache",
    "s3": "AWS/S3",
    "kinesis": "AWS/Kinesis",
    "api_gateway": "AWS/ApiGateway",
    "nat_gateway": "AWS/NATGateway",
    "cloudfront": "AWS/CloudFront",
    "step_functions": "AWS/States",
    "redshift": "AWS/Redshift",
    "opensearch": "AWS/ES",
    "efs": "AWS/EFS",
}

RESOURCE_ID_FIELD: dict[str, str] = {
    "ec2": "external_id",
    "ebs": "external_id",
    "rds": "external_id",
    "aurora": "external_id",
    "lambda": "external_id",
    "elb": "external_id",
    "alb": "external_id",
    "nlb": "external_id",
    "dynamodb": "external_id",
    "sqs": "external_id",
    "sns": "external_id",
    "ecs_service": "name",
    "ecs_cluster": "external_id",
    "eks": "external_id",
    "elasticache": "external_id",
    "s3": "external_id",
    "kinesis": "external_id",
    "api_gateway": "external_id",
    "nat_gateway": "external_id",
    "cloudfront": "external_id",
    "step_functions": "external_id",
    "redshift": "external_id",
    "opensearch": "external_id",
    "efs": "external_id",
}


_METRIC_TAG_FIELDS = (
    "instance_type", "availability_zone", "vpc_id", "engine",
    "instance_class", "node_type", "runtime", "launch_type",
    "volume_type",
)


def _extract_metric_tags(res) -> dict[str, str]:
    """Pull useful resource metadata fields into metric tags for filtering."""
    tags: dict[str, str] = {}
    meta = res.metadata or {}
    for field in _METRIC_TAG_FIELDS:
        val = meta.get(field)
        if val and isinstance(val, str):
            tags[field] = val
    tags["resource_name"] = res.name
    tags["resource_type"] = res.resource_type
    return tags


_enabled_region_cache: dict[str, tuple[list[str], float]] = {}
_REGION_CACHE_TTL = 3600  # re-check enabled regions every hour


async def _resolve_regions(acct) -> list[str]:
    """Filter account regions to only those enabled (opted-in). Cached 1hr."""
    import time
    cache_key = acct.account_id
    cached = _enabled_region_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < _REGION_CACHE_TTL:
        return cached[0]
    try:
        enabled = await asyncio.to_thread(get_enabled_regions, acct)
        skipped = set(acct.regions) - set(enabled)
        if skipped:
            await log.awarn(
                "Regions not enabled, skipping",
                account=acct.account_id,
                skipped=sorted(skipped),
            )
        _enabled_region_cache[cache_key] = (enabled, time.time())
        return enabled
    except Exception as e:
        await log.aerror(
            "Failed to check enabled regions, using all configured",
            account=acct.account_id,
            error=str(e),
        )
        return acct.regions


class _TaskStats:
    __slots__ = (
        "last_run_at", "last_duration_ms", "success_count",
        "failure_count", "consecutive_errors",
    )

    def __init__(self) -> None:
        self.last_run_at: float = 0.0
        self.last_duration_ms: float = 0.0
        self.success_count: int = 0
        self.failure_count: int = 0
        self.consecutive_errors: int = 0

    def to_dict(self) -> dict:
        return {
            "last_run_at": self.last_run_at,
            "last_duration_ms": round(self.last_duration_ms, 1),
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "consecutive_errors": self.consecutive_errors,
        }


class CollectionOrchestrator:
    def __init__(self, discovery_interval: int = 300, metrics_interval: int = 60):
        self._discovery_interval = discovery_interval
        self._metrics_interval = metrics_interval
        self._discovery_task: asyncio.Task | None = None
        self._metrics_task: asyncio.Task | None = None
        self._running = False
        self._discovery_stats = _TaskStats()
        self._metrics_stats = _TaskStats()

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._discovery_task = asyncio.create_task(self._discovery_loop())
        self._metrics_task = asyncio.create_task(self._metrics_loop())
        await log.ainfo("Collection orchestrator started")

    async def stop(self) -> None:
        self._running = False
        for task in (self._discovery_task, self._metrics_task):
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        await log.ainfo("Collection orchestrator stopped")

    @property
    def stats(self) -> dict:
        return {
            "running": self._running,
            "discovery": self._discovery_stats.to_dict(),
            "metrics_collection": self._metrics_stats.to_dict(),
        }

    async def _discovery_loop(self) -> None:
        await asyncio.sleep(5)
        while self._running:
            start = _time.monotonic()
            try:
                await self._run_discovery()
                self._discovery_stats.success_count += 1
                self._discovery_stats.consecutive_errors = 0
            except Exception as e:
                self._discovery_stats.failure_count += 1
                self._discovery_stats.consecutive_errors += 1
                await log.aerror("Discovery cycle failed", error=str(e))
            finally:
                self._discovery_stats.last_duration_ms = (_time.monotonic() - start) * 1000
                self._discovery_stats.last_run_at = _time.time()
            await asyncio.sleep(self._discovery_interval)

    async def _metrics_loop(self) -> None:
        await asyncio.sleep(15)
        while self._running:
            start = _time.monotonic()
            try:
                await self._run_metrics_collection()
                self._metrics_stats.success_count += 1
                self._metrics_stats.consecutive_errors = 0
            except Exception as e:
                self._metrics_stats.failure_count += 1
                self._metrics_stats.consecutive_errors += 1
                await log.aerror("Metrics collection cycle failed", error=str(e))
            finally:
                self._metrics_stats.last_duration_ms = (_time.monotonic() - start) * 1000
                self._metrics_stats.last_run_at = _time.time()
            await asyncio.sleep(self._metrics_interval)

    async def _run_discovery(self) -> None:
        tenant_id = settings.default_tenant_id
        await self._run_aws_discovery(tenant_id)
        await self._run_azure_discovery(tenant_id)

    async def _run_aws_discovery(self, tenant_id: str) -> None:
        accounts = await list_aws_accounts(tenant_id, enabled_only=True)
        for acct in accounts:
            job = await create_job(tenant_id, "discovery", acct.id)
            try:
                regions = await _resolve_regions(acct)
                all_results: dict[str, dict] = {}
                for region in regions:
                    results = await aws_discover_all(acct, region, tenant_id)
                    all_results[region] = results

                await aws_mark_synced(tenant_id, acct.id)
                await complete_job(job["id"], tenant_id, result=all_results)
                await log.ainfo(
                    "AWS discovery complete",
                    account=acct.account_id,
                    regions=len(regions),
                )
            except Exception as e:
                await complete_job(job["id"], tenant_id, error=str(e))
                await log.aerror(
                    "AWS discovery failed",
                    account=acct.account_id,
                    error=str(e),
                )

    async def _run_azure_discovery(self, tenant_id: str) -> None:
        subs = await list_azure_subscriptions(tenant_id, enabled_only=True)
        for sub in subs:
            job = await create_job(tenant_id, "discovery", sub.id)
            try:
                all_results: dict[str, dict] = {}
                for region in sub.regions:
                    results = await azure_discover_all(sub, region, tenant_id)
                    all_results[region] = results

                await azure_mark_synced(tenant_id, sub.id)
                await complete_job(job["id"], tenant_id, result=all_results)
                await log.ainfo(
                    "Azure discovery complete",
                    subscription=sub.subscription_id,
                    regions=len(sub.regions),
                )
            except Exception as e:
                await complete_job(job["id"], tenant_id, error=str(e))
                await log.aerror(
                    "Azure discovery failed",
                    subscription=sub.subscription_id,
                    error=str(e),
                )

    async def _run_metrics_collection(self) -> None:
        tenant_id = settings.default_tenant_id
        await self._run_aws_metrics(tenant_id)
        await self._run_azure_metrics(tenant_id)

    async def _run_aws_metrics(self, tenant_id: str) -> None:
        accounts = await list_aws_accounts(tenant_id, enabled_only=True)
        for acct in accounts:
            regions = await _resolve_regions(acct)
            for region in regions:
                resources = await list_resources(
                    tenant_id, provider="aws", account_id=acct.account_id,
                )

                by_namespace: dict[str, list[tuple[str, dict]]] = {}
                for res in resources:
                    if res.region != region:
                        continue
                    ns = NAMESPACE_FOR_TYPE.get(res.resource_type)
                    if not ns:
                        continue
                    id_field = RESOURCE_ID_FIELD.get(res.resource_type, "external_id")
                    res_id = getattr(res, id_field, res.external_id)
                    if res_id:
                        extra_tags = _extract_metric_tags(res)
                        by_namespace.setdefault(ns, []).append(
                            (res_id, extra_tags)
                        )

                for namespace, resource_entries in by_namespace.items():
                    try:
                        count = await collect_cloudwatch_metrics(
                            acct, region, namespace, resource_entries,
                        )
                        await log.ainfo(
                            "CloudWatch metrics collected",
                            namespace=namespace,
                            region=region,
                            resources=len(resource_entries),
                            points=count,
                        )
                    except Exception as e:
                        await log.aerror(
                            "CloudWatch collection failed",
                            namespace=namespace,
                            region=region,
                            error=str(e),
                        )

    async def _run_azure_metrics(self, tenant_id: str) -> None:
        subs = await list_azure_subscriptions(tenant_id, enabled_only=True)
        for sub in subs:
            resources = await list_resources(
                tenant_id, provider="azure", account_id=sub.subscription_id,
            )

            by_type: dict[str, list[tuple[str, dict]]] = {}
            for res in resources:
                if res.resource_type not in AZURE_METRIC_DEFS:
                    continue
                extra_tags = _extract_metric_tags(res)
                by_type.setdefault(res.resource_type, []).append(
                    (res.external_id, extra_tags)
                )

            for resource_type, entries in by_type.items():
                try:
                    count = await collect_azure_metrics(
                        sub, resource_type, entries,
                    )
                    await log.ainfo(
                        "Azure metrics collected",
                        resource_type=resource_type,
                        subscription=sub.subscription_id,
                        resources=len(entries),
                        points=count,
                    )
                except Exception as e:
                    await log.aerror(
                        "Azure metric collection failed",
                        resource_type=resource_type,
                        subscription=sub.subscription_id,
                        error=str(e),
                    )


orchestrator = CollectionOrchestrator()
