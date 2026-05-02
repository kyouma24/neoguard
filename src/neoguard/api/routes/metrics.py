from fastapi import APIRouter, Depends, HTTPException, Request

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
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
    tid = batch.tenant_id or tenant_id
    count = await metric_writer.write(tid, batch.metrics)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: MetricQuery,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[MetricQueryResult]:
    q.tenant_id = q.tenant_id or tenant_id
    if q.name.startswith(INTERNAL_METRIC_PREFIX) and not _is_admin(request):
        raise HTTPException(403, "Internal platform metrics require admin access")
    return await query_metrics(q)


@router.post("/query/batch")
async def query_batch(
    batch: BatchMetricQuery,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[list[MetricQueryResult]]:
    import asyncio

    admin = _is_admin(request)
    for q in batch.queries:
        q.tenant_id = q.tenant_id or tenant_id
        if q.name.startswith(INTERNAL_METRIC_PREFIX) and not admin:
            raise HTTPException(403, "Internal platform metrics require admin access")
    results = await asyncio.gather(*(query_metrics(q) for q in batch.queries))
    return list(results)


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
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT DISTINCT name FROM metrics WHERE tenant_id = $1"
                f" ORDER BY name LIMIT {min(limit, 1000)} OFFSET {offset}",
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                "SELECT DISTINCT name FROM metrics"
                f" ORDER BY name LIMIT {min(limit, 1000)} OFFSET {offset}",
            )
    names = [r["name"] for r in rows]
    if not admin:
        names = [n for n in names if not n.startswith(INTERNAL_METRIC_PREFIX)]
    return names


@router.get(
    "/stats",
    dependencies=[Depends(require_scope("admin"))],
)
async def writer_stats(
    _tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return metric_writer.stats
