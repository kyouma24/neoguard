from fastapi import APIRouter, Depends, HTTPException, Request

from neoguard.api.deps import get_query_tenant_id, get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.metrics import BatchMetricQuery, MetricBatch, MetricQuery, MetricQueryResult
from neoguard.services.metrics.query import query_metrics
from neoguard.services.metrics.writer import metric_writer

INTERNAL_METRIC_PREFIX = "neoguard."

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


def _is_admin(request: Request) -> bool:
    scopes = getattr(request.state, "scopes", [])
    return "admin" in scopes or getattr(request.state, "is_super_admin", False)


@router.post(
    "/ingest",
    status_code=202,
    dependencies=[Depends(require_scope("write"))],
)
async def ingest_metrics(
    batch: MetricBatch,
    tenant_id: str = Depends(get_tenant_id_required),
) -> dict:
    count = await metric_writer.write(tenant_id, batch.metrics)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: MetricQuery,
    request: Request,
    tenant_id: str = Depends(get_query_tenant_id),
) -> list[MetricQueryResult]:
    q.tenant_id = tenant_id
    if q.name.startswith(INTERNAL_METRIC_PREFIX) and not _is_admin(request):
        raise HTTPException(403, "Internal platform metrics require admin access")
    return await query_metrics(q)


@router.post("/query/batch")
async def query_batch(
    batch: BatchMetricQuery,
    request: Request,
    tenant_id: str = Depends(get_query_tenant_id),
) -> list[list[MetricQueryResult]]:
    import asyncio

    admin = _is_admin(request)
    for q in batch.queries:
        q.tenant_id = tenant_id
        if q.name.startswith(INTERNAL_METRIC_PREFIX) and not admin:
            raise HTTPException(403, "Internal platform metrics require admin access")
    results = await asyncio.gather(*(query_metrics(q) for q in batch.queries))
    return list(results)


# TODO(critical-3): Switch to get_query_tenant_id + add cardinality limits
@router.get("/names")
async def list_metric_names(
    request: Request,
    limit: int = 500,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[str]:
    from neoguard.db.timescale.connection import get_pool

    admin = _is_admin(request)
    pool = await get_pool()
    safe_limit = min(limit, 1000)
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT DISTINCT name FROM metrics WHERE tenant_id = $1"
                " ORDER BY name LIMIT $2 OFFSET $3",
                tenant_id, safe_limit, offset,
            )
        else:
            rows = await conn.fetch(
                "SELECT DISTINCT name FROM metrics"
                " ORDER BY name LIMIT $1 OFFSET $2",
                safe_limit, offset,
            )
    names = [r["name"] for r in rows]
    if not admin:
        names = [n for n in names if not n.startswith(INTERNAL_METRIC_PREFIX)]
    return names


# TODO(critical-3): Switch to get_query_tenant_id + add cardinality limits + reject high-cardinality keys
@router.get("/tag-values")
async def list_tag_values(
    tag: str,
    request: Request,
    metric: str | None = None,
    metric_prefix: str | None = None,
    filters: str | None = None,
    limit: int = 200,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[str]:
    """Return distinct values for a tag key, with optional scoping.

    Query params:
      - tag: the tag key to get values for (required)
      - metric: exact metric name filter
      - metric_prefix: LIKE prefix filter (e.g. "aws.ec2." matches all EC2 metrics)
      - filters: JSON object of tag_key=value pairs for additional constraints
                 (e.g. {"account_id":"123","region":"us-east-1"})
      - limit: max results (default 200, max 1000)
    """
    import re
    import json as _json

    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$", tag) or len(tag) > 128:
        raise HTTPException(400, "Invalid tag key")

    # Parse filters JSON
    filter_tags: dict[str, str] = {}
    if filters:
        try:
            filter_tags = _json.loads(filters)
            if not isinstance(filter_tags, dict):
                raise HTTPException(400, "filters must be a JSON object")
            # Validate filter keys
            for k in filter_tags:
                if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$", k) or len(k) > 128:
                    raise HTTPException(400, f"Invalid filter key: {k}")
        except _json.JSONDecodeError:
            raise HTTPException(400, "Invalid filters JSON")

    if metric and metric.startswith(INTERNAL_METRIC_PREFIX) and not _is_admin(request):
        raise HTTPException(403, "Internal platform metrics require admin access")

    # Validate metric_prefix
    if metric_prefix:
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_.\-]*$", metric_prefix) or len(metric_prefix) > 128:
            raise HTTPException(400, "Invalid metric_prefix")

    from neoguard.db.timescale.connection import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        safe_limit = min(limit, 1000)

        # Build query dynamically with parameterized values
        conditions: list[str] = [f"tags->>$1 IS NOT NULL"]
        params: list[object] = [tag]
        param_idx = 2

        if tenant_id:
            conditions.append(f"tenant_id = ${param_idx}")
            params.append(tenant_id)
            param_idx += 1

        if metric:
            conditions.append(f"name = ${param_idx}")
            params.append(metric)
            param_idx += 1
        elif metric_prefix:
            conditions.append(f"name LIKE ${param_idx}")
            params.append(metric_prefix + "%")
            param_idx += 1

        # Add tag filter constraints (cascading variables)
        for fkey, fval in filter_tags.items():
            if fval and fval != "*":
                conditions.append(f"tags->>${param_idx} = ${param_idx + 1}")
                params.append(fkey)
                params.append(fval)
                param_idx += 2

        where_clause = " AND ".join(conditions)
        params.append(safe_limit)

        query = (
            f"SELECT DISTINCT tags->>$1 AS val FROM metrics"
            f" WHERE {where_clause}"
            f" ORDER BY val LIMIT ${param_idx}"
        )
        rows = await conn.fetch(query, *params)

    return [r["val"] for r in rows if r["val"]]


@router.get("/resource-values")
async def list_resource_values(
    field: str,
    request: Request,
    resource_type: str | None = None,
    provider: str | None = None,
    filters: str | None = None,
    limit: int = 200,
    tenant_id: str = Depends(get_tenant_id_required),
) -> list[str]:
    """Return distinct values for a resource field from the resources table.

    This endpoint is used for dashboard variable dropdowns where you want to
    show ALL discovered resources (not just those with active metrics).

    Supported fields: external_id, name, region, account_id, resource_type, provider, status
    """
    import re
    import json as _json

    ALLOWED_FIELDS = {"external_id", "name", "region", "account_id", "resource_type", "provider", "status"}
    if field not in ALLOWED_FIELDS:
        raise HTTPException(400, f"Invalid field. Allowed: {', '.join(sorted(ALLOWED_FIELDS))}")

    filter_tags: dict[str, str] = {}
    if filters:
        try:
            filter_tags = _json.loads(filters)
            if not isinstance(filter_tags, dict):
                raise HTTPException(400, "filters must be a JSON object")
        except _json.JSONDecodeError:
            raise HTTPException(400, "Invalid filters JSON")

    from neoguard.db.timescale.connection import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        safe_limit = min(limit, 1000)
        conditions: list[str] = [f"{field} IS NOT NULL", f"{field} != ''"]
        params: list[object] = []
        param_idx = 1

        if tenant_id:
            conditions.append(f"tenant_id = ${param_idx}")
            params.append(tenant_id)
            param_idx += 1

        if resource_type:
            conditions.append(f"resource_type = ${param_idx}")
            params.append(resource_type)
            param_idx += 1

        if provider:
            conditions.append(f"provider = ${param_idx}")
            params.append(provider)
            param_idx += 1

        # Apply additional column-based filters
        for fkey, fval in filter_tags.items():
            if fkey in ALLOWED_FIELDS and fval and fval != "*":
                conditions.append(f"{fkey} = ${param_idx}")
                params.append(fval)
                param_idx += 1

        where_clause = " AND ".join(conditions)
        params.append(safe_limit)

        query = (
            f"SELECT DISTINCT {field} AS val FROM resources"
            f" WHERE {where_clause}"
            f" ORDER BY val LIMIT ${param_idx}"
        )
        rows = await conn.fetch(query, *params)

    return [r["val"] for r in rows if r["val"]]


@router.get(
    "/stats",
    dependencies=[Depends(require_scope("admin"))],
)
async def writer_stats(
    _tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return metric_writer.stats
