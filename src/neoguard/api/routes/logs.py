from fastapi import APIRouter, Depends

from neoguard.api.deps import get_tenant_id
from neoguard.models.logs import LogBatch, LogQuery, LogQueryResult
from neoguard.services.logs.query import query_logs
from neoguard.services.logs.writer import log_writer

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


@router.post("/ingest", status_code=202)
async def ingest_logs(
    batch: LogBatch,
    tenant_id: str = Depends(get_tenant_id),
) -> dict:
    tid = batch.tenant_id or tenant_id
    count = await log_writer.write(tid, batch.logs)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: LogQuery,
    tenant_id: str = Depends(get_tenant_id),
) -> LogQueryResult:
    q.tenant_id = q.tenant_id or tenant_id
    return await query_logs(q)


@router.get("/stats")
async def writer_stats() -> dict:
    return log_writer.stats
