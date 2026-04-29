from fastapi import APIRouter, Depends

from neoguard.api.deps import get_tenant_id
from neoguard.models.metrics import MetricBatch, MetricQuery, MetricQueryResult
from neoguard.services.metrics.query import query_metrics
from neoguard.services.metrics.writer import metric_writer

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])


@router.post("/ingest", status_code=202)
async def ingest_metrics(
    batch: MetricBatch,
    tenant_id: str = Depends(get_tenant_id),
) -> dict:
    tid = batch.tenant_id or tenant_id
    count = await metric_writer.write(tid, batch.metrics)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: MetricQuery,
    tenant_id: str = Depends(get_tenant_id),
) -> list[MetricQueryResult]:
    q.tenant_id = q.tenant_id or tenant_id
    return await query_metrics(q)


@router.get("/names")
async def list_metric_names(
    tenant_id: str = Depends(get_tenant_id),
) -> list[str]:
    from neoguard.db.timescale.connection import get_pool

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT name FROM metrics WHERE tenant_id = $1 ORDER BY name",
            tenant_id,
        )
    return [r["name"] for r in rows]


@router.get("/stats")
async def writer_stats() -> dict:
    return metric_writer.stats
