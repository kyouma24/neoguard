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
from neoguard.services.dashboards_starter import maybe_create_starter_dashboard
from neoguard.services.discovery.aws_discovery import discover_all as aws_discover_all
from neoguard.services.discovery.azure_discovery import discover_all as azure_discover_all
from neoguard.services.resources.crud import list_resources, reconcile_stale_resources

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


# TODO(production): Process-local cache; needs Redis-backed region cache for multi-worker
# Current: In-memory dict per worker with 1h TTL
# Cloud: Redis hash with TTL, shared across workers
# Migration risk: Low — region lookup is read-only
# Reference: docs/cloud_migration.md#credential-caches
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
        await self._run_aws_discovery()
        await self._run_azure_discovery()

    async def _run_aws_discovery(self) -> None:
        accounts = await list_aws_accounts(None, enabled_only=True)
        if not accounts:
            return

        sem = asyncio.Semaphore(settings.discovery_max_concurrency)

        async def bounded_discover(acct):
            async with sem:
                return await self._discover_single_aws_account(acct)

        results = await asyncio.gather(
            *[bounded_discover(acct) for acct in accounts],
            return_exceptions=True,
        )

        for acct, result in zip(accounts, results):
            if isinstance(result, BaseException):
                self._discovery_stats.failure_count += 1
                await log.aerror(
                    "AWS discovery failed",
                    account=acct.account_id,
                    tenant_id=acct.tenant_id,
                    provider="aws",
                    error=str(result),
                )

    async def _discover_single_aws_account(self, acct) -> None:
        from datetime import datetime, timezone

        tid = acct.tenant_id
        cycle_start = datetime.now(timezone.utc)
        job = await create_job(tid, "discovery", acct.id)
        try:
            regions = await _resolve_regions(acct)
            all_results: dict[str, dict] = {}
            for region in regions:
                results = await aws_discover_all(acct, region, tid)
                all_results[region] = results

            removed = await reconcile_stale_resources(
                tid, acct.account_id, "aws", cycle_start,
            )
            await aws_mark_synced(tid, acct.id)
            await complete_job(job["id"], tid, result=all_results)
            await maybe_create_starter_dashboard(tid, "aws")
            await log.ainfo(
                "AWS discovery complete",
                account=acct.account_id,
                regions=len(regions),
                removed=removed,
            )
        except Exception as e:
            await complete_job(job["id"], tid, error=str(e))
            raise

    async def _run_azure_discovery(self) -> None:
        subs = await list_azure_subscriptions(None, enabled_only=True)
        if not subs:
            return

        sem = asyncio.Semaphore(settings.discovery_max_concurrency)

        async def bounded_discover(sub):
            async with sem:
                return await self._discover_single_azure_subscription(sub)

        results = await asyncio.gather(
            *[bounded_discover(sub) for sub in subs],
            return_exceptions=True,
        )

        for sub, result in zip(subs, results):
            if isinstance(result, BaseException):
                self._discovery_stats.failure_count += 1
                await log.aerror(
                    "Azure discovery failed",
                    subscription=sub.subscription_id,
                    tenant_id=sub.tenant_id,
                    provider="azure",
                    error=str(result),
                )

    async def _discover_single_azure_subscription(self, sub) -> None:
        from datetime import datetime, timezone

        tid = sub.tenant_id
        cycle_start = datetime.now(timezone.utc)
        job = await create_job(tid, "discovery", sub.id)
        try:
            all_results: dict[str, dict] = {}
            for region in sub.regions:
                results = await azure_discover_all(sub, region, tid)
                all_results[region] = results

            removed = await reconcile_stale_resources(
                tid, sub.subscription_id, "azure", cycle_start,
            )
            await azure_mark_synced(tid, sub.id)
            await complete_job(job["id"], tid, result=all_results)
            await maybe_create_starter_dashboard(tid, "azure")
            await log.ainfo(
                "Azure discovery complete",
                subscription=sub.subscription_id,
                regions=len(sub.regions),
                removed=removed,
            )
        except Exception as e:
            await complete_job(job["id"], tid, error=str(e))
            raise

    async def _run_metrics_collection(self) -> None:
        await self._run_aws_metrics()
        await self._run_azure_metrics()

    async def _run_aws_metrics(self) -> None:
        accounts = await list_aws_accounts(None, enabled_only=True)
        for acct in accounts:
            tid = acct.tenant_id
            if not tid:
                await log.awarn(
                    "Skipping AWS account with no tenant_id",
                    account_id=acct.account_id,
                    name=acct.name,
                )
                continue
            regions = await _resolve_regions(acct)
            resources = await list_resources(
                tid, provider="aws", account_id=acct.account_id,
            )

            for region in regions:
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

    async def _run_azure_metrics(self) -> None:
        subs = await list_azure_subscriptions(None, enabled_only=True)
        for sub in subs:
            tid = sub.tenant_id
            if not tid:
                await log.awarn(
                    "Skipping Azure subscription with no tenant_id",
                    subscription_id=sub.subscription_id,
                    name=sub.name,
                )
                continue
            resources = await list_resources(
                tid, provider="azure", account_id=sub.subscription_id,
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


# TODO(production): Single-worker singleton; needs distributed leader election for multi-worker
# Current: Each worker runs its own discovery/collection loop
# Cloud: Redis-based distributed lock (Redlock) — only leader runs collection
# Migration risk: High — concurrent discovery causes duplicate API calls and race conditions
# Reference: docs/cloud_migration.md#background-singletons
_orchestrator_instance: CollectionOrchestrator | None = None


def get_orchestrator() -> CollectionOrchestrator:
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = CollectionOrchestrator()
    return _orchestrator_instance


orchestrator = get_orchestrator()
