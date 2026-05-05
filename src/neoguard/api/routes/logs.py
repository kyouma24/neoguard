from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.logs import LogBatch, LogQuery, LogQueryResult
from neoguard.services.logs.query import query_logs, query_log_histogram, query_log_facets
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
    count = await log_writer.write(tenant_id, batch.logs)
    return {"accepted": count}


@router.post("/query")
async def query(
    q: LogQuery,
    tenant_id: str | None = Depends(get_tenant_id),
) -> LogQueryResult:
    q.tenant_id = tenant_id
    return await query_logs(q)


class HistogramBucket(BaseModel):
    timestamp: str
    count: int
    severity_counts: dict[str, int] = Field(default_factory=dict)


class HistogramResult(BaseModel):
    buckets: list[HistogramBucket]
    interval_seconds: int


class HistogramQuery(BaseModel):
    start: datetime
    end: datetime
    service: str | None = None
    severity: str | None = None
    query: str | None = None
    buckets: int = Field(default=50, ge=5, le=200)


@router.post("/histogram")
async def histogram(
    q: HistogramQuery,
    tenant_id: str | None = Depends(get_tenant_id),
) -> HistogramResult:
    return await query_log_histogram(
        tenant_id=tenant_id,
        start=q.start,
        end=q.end,
        service=q.service,
        severity=q.severity,
        query=q.query,
        buckets=q.buckets,
    )


class FacetValue(BaseModel):
    value: str
    count: int


class FacetsResult(BaseModel):
    severity: list[FacetValue]
    service: list[FacetValue]


class FacetsQuery(BaseModel):
    start: datetime
    end: datetime
    query: str | None = None
    service: str | None = None
    severity: str | None = None


@router.post("/facets")
async def facets(
    q: FacetsQuery,
    tenant_id: str | None = Depends(get_tenant_id),
) -> FacetsResult:
    return await query_log_facets(
        tenant_id=tenant_id,
        start=q.start,
        end=q.end,
        query=q.query,
        service=q.service,
        severity=q.severity,
    )


@router.get(
    "/stats",
    dependencies=[Depends(require_scope("admin"))],
)
async def writer_stats(
    _tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return log_writer.stats
