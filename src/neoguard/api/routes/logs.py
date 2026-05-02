from fastapi import APIRouter, Depends

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.logs import LogBatch, LogQuery, LogQueryResult
from neoguard.services.logs.query import query_logs
from neoguard.services.logs.writer import log_writer

router = APIRouter(prefix="/api/v1/logs", tags=["logs"])


@router.post(
    "/ingest",
    status_code=202,
    dependencies=[Depends(require_scope("write"))],
)
async def ingest_logs(
    batch: LogBatch,
    tenant_id: str = Depends(get_tenant_id_required),
) -> dict:
    tid = batch.tenant_id or tenant_id
    count = await log_writer.write(tid, batch.logs)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: LogQuery,
    tenant_id: str | None = Depends(get_tenant_id),
) -> LogQueryResult:
    q.tenant_id = q.tenant_id or tenant_id
    return await query_logs(q)


@router.get(
    "/stats",
    dependencies=[Depends(require_scope("admin"))],
)
async def writer_stats(
    _tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return log_writer.stats
