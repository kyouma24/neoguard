from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncGenerator
from datetime import datetime

import orjson
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from neoguard.api.deps import get_query_tenant_id, get_tenant_id, require_scope
from neoguard.models.metrics import MetricQueryResult
from neoguard.services.dashboard_metrics import record_cache_hit, record_cache_miss
from neoguard.services.mql.cache import (
    CacheStatus,
    compute_ttl,
    get_cached,
    make_cache_key,
    set_cached,
)
from neoguard.services.mql.compiler import compile_query
from neoguard.services.mql.executor import execute
from neoguard.services.mql.parser import parse, MQLParseError
from neoguard.services.mql.tokenizer import MQLTokenizeError
from neoguard.services.mql.variables import substitute_variables, VariableSubstitutionError

logger = logging.getLogger(__name__)

INTERNAL_METRIC_PREFIX = "neoguard."

# Streaming batch limits (spec 02-dashboards-technical.md D.4)
MAX_BATCH_QUERIES = 200
MAX_BODY_BYTES = 2_097_152  # 2 MB
BATCH_TIMEOUT_S = 30.0
PER_QUERY_TIMEOUT_S = 10.0
MAX_CONCURRENT_QUERIES = 20

router = APIRouter(prefix="/api/v1/mql", tags=["mql"])


_VALID_INTERVALS = frozenset({"raw", "1m", "5m", "15m", "1h", "6h", "1d"})


class MQLQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    start: datetime
    end: datetime
    interval: str = "1m"
    variables: dict[str, str | list[str]] | None = None

    @field_validator("interval")
    @classmethod
    def _check_interval(cls, v: str) -> str:
        if v not in _VALID_INTERVALS:
            raise ValueError(f"Invalid interval '{v}'. Must be one of: {', '.join(sorted(_VALID_INTERVALS))}")
        return v


class MQLValidateResponse(BaseModel):
    valid: bool
    aggregator: str | None = None
    metric_name: str | None = None
    filter_count: int = 0
    function_count: int = 0
    has_rollup: bool = False
    error: str | None = None
    error_pos: int | None = None


class MQLBatchRequest(BaseModel):
    queries: list[MQLQueryRequest] = Field(..., min_length=1, max_length=10)


# --- Streaming batch models (spec D.4) ---

class BatchQueryItem(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=1, max_length=2000)
    start: datetime
    end: datetime
    interval: str = "1m"
    max_points: int = Field(default=500, ge=1, le=5000)
    max_series: int = Field(default=50, ge=1, le=200)


class StreamBatchRequest(BaseModel):
    queries: list[BatchQueryItem] = Field(..., min_length=1, max_length=MAX_BATCH_QUERIES)
    variables: dict[str, str | list[str]] | None = None
    dashboard_id: str | None = None


def _is_admin(request: Request) -> bool:
    scopes = getattr(request.state, "scopes", [])
    return "admin" in scopes or getattr(request.state, "is_super_admin", False)


@router.post("/query", dependencies=[Depends(require_scope("read"))])
async def mql_query(
    body: MQLQueryRequest,
    request: Request,
    tenant_id: str = Depends(get_query_tenant_id),
) -> list[MetricQueryResult]:
    query_str = body.query
    if body.variables:
        try:
            query_str = substitute_variables(query_str, body.variables)
        except VariableSubstitutionError as e:
            raise HTTPException(400, detail=str(e))

    try:
        ast = parse(query_str)
    except (MQLParseError, MQLTokenizeError) as e:
        raise HTTPException(400, detail=str(e))

    if ast.metric_name.startswith(INTERNAL_METRIC_PREFIX) and not _is_admin(request):
        raise HTTPException(403, "Internal platform metrics require admin access")

    try:
        compiled = compile_query(
            ast,
            tenant_id=tenant_id,
            start=body.start,
            end=body.end,
            interval=body.interval,
        )
    except ValueError as e:
        raise HTTPException(400, detail=str(e))

    # --- Cache layer (spec D.5) ---
    from_ts = int(body.start.timestamp())
    to_ts = int(body.end.timestamp())
    # Parse interval to seconds for cache key alignment
    interval_sec = _interval_to_seconds(body.interval)
    cache_key = make_cache_key(tenant_id, compiled.sql, from_ts, to_ts, interval_sec)
    ttl = compute_ttl(from_ts, to_ts)

    cached_data, status = await get_cached(cache_key, ttl)

    if status == CacheStatus.FRESH and cached_data is not None:
        record_cache_hit(tenant_id)
        return _deserialise_cached_results(cached_data)

    if status == CacheStatus.STALE and cached_data is not None:
        # Serve stale data immediately, refresh in background
        record_cache_hit(tenant_id)
        asyncio.create_task(_refresh_cache(compiled, cache_key, ttl))
        return _deserialise_cached_results(cached_data)

    # MISS — execute and cache
    record_cache_miss(tenant_id)
    results = await execute(compiled)
    serialisable = [
        r.model_dump(mode="json") if hasattr(r, "model_dump") else r
        for r in results
    ]
    await set_cached(cache_key, serialisable, ttl)
    return results


def _interval_to_seconds(interval: str) -> int:
    """Convert an interval string like '1m', '5m', '1h' to seconds."""
    _MAP = {
        "raw": 10,
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "1h": 3600,
        "6h": 21600,
        "1d": 86400,
    }
    return _MAP.get(interval, 60)


def _deserialise_cached_results(data: object) -> list[MetricQueryResult]:
    """Reconstruct MetricQueryResult list from cached JSON-serialisable dicts."""
    if not isinstance(data, list):
        return []
    return [MetricQueryResult(**item) for item in data]


async def _refresh_cache(compiled: object, cache_key: str, ttl: int) -> None:
    """Background task: re-execute a compiled query and update the cache."""
    try:
        results = await execute(compiled)  # type: ignore[arg-type]
        serialisable = [r.model_dump(mode="json") for r in results]
        await set_cached(cache_key, serialisable, ttl)
    except Exception:
        logger.warning("Background cache refresh failed for key=%s", cache_key, exc_info=True)


@router.post("/query/batch", dependencies=[Depends(require_scope("read"))])
async def mql_query_batch(
    body: MQLBatchRequest,
    request: Request,
    tenant_id: str = Depends(get_query_tenant_id),
) -> list[list[MetricQueryResult]]:
    import asyncio

    admin = _is_admin(request)
    compiled_list = []

    for item in body.queries:
        query_str = item.query
        if item.variables:
            try:
                query_str = substitute_variables(query_str, item.variables)
            except VariableSubstitutionError as e:
                raise HTTPException(400, detail=str(e))

        try:
            ast = parse(query_str)
        except (MQLParseError, MQLTokenizeError) as e:
            raise HTTPException(400, detail=str(e))

        if ast.metric_name.startswith(INTERNAL_METRIC_PREFIX) and not admin:
            raise HTTPException(403, "Internal platform metrics require admin access")

        try:
            compiled = compile_query(
                ast,
                tenant_id=tenant_id,
                start=item.start,
                end=item.end,
                interval=item.interval,
            )
        except ValueError as e:
            raise HTTPException(400, detail=str(e))

        compiled_list.append(compiled)

    results = await asyncio.gather(*(execute(c) for c in compiled_list))
    return list(results)


# ---------------------------------------------------------------------------
# Streaming batch endpoint (spec 02-dashboards-technical.md D.4)
# ---------------------------------------------------------------------------

async def _execute_single_stream_query(
    item: BatchQueryItem,
    *,
    tenant_id: str | None,
    is_admin: bool,
    shared_variables: dict[str, str | list[str]] | None,
    semaphore: asyncio.Semaphore,
) -> dict:
    """Execute one query within the streaming batch and return a result dict."""
    async with semaphore:
        try:
            query_str = item.query
            # Apply shared variables from the batch request
            if shared_variables:
                try:
                    query_str = substitute_variables(query_str, shared_variables)
                except VariableSubstitutionError as e:
                    return {
                        "type": "query_result",
                        "id": item.id,
                        "status": "error",
                        "error": {"code": "variable_error", "message": str(e)},
                    }

            try:
                ast = parse(query_str)
            except (MQLParseError, MQLTokenizeError) as e:
                return {
                    "type": "query_result",
                    "id": item.id,
                    "status": "error",
                    "error": {"code": "query_invalid", "message": str(e)},
                }

            if ast.metric_name.startswith(INTERNAL_METRIC_PREFIX) and not is_admin:
                return {
                    "type": "query_result",
                    "id": item.id,
                    "status": "error",
                    "error": {"code": "forbidden", "message": "Internal platform metrics require admin access"},
                }

            try:
                compiled = compile_query(
                    ast,
                    tenant_id=tenant_id,
                    start=item.start,
                    end=item.end,
                    interval=item.interval,
                )
            except ValueError as e:
                return {
                    "type": "query_result",
                    "id": item.id,
                    "status": "error",
                    "error": {"code": "compile_error", "message": str(e)},
                }

            series = await asyncio.wait_for(
                execute(compiled),
                timeout=PER_QUERY_TIMEOUT_S,
            )

            # Enforce max_series limit
            truncated = series[: item.max_series]

            # Enforce max_points limit per series
            limited: list[MetricQueryResult] = []
            for s in truncated:
                if len(s.datapoints) > item.max_points:
                    limited.append(MetricQueryResult(
                        name=s.name,
                        tags=s.tags,
                        datapoints=s.datapoints[: item.max_points],
                    ))
                else:
                    limited.append(s)

            return {
                "type": "query_result",
                "id": item.id,
                "status": "ok",
                "series": [s.model_dump(mode="json") for s in limited],
                "meta": {
                    "total_series": len(series),
                    "truncated_series": len(series) > item.max_series,
                    "max_points": item.max_points,
                },
            }

        except asyncio.TimeoutError:
            return {
                "type": "query_result",
                "id": item.id,
                "status": "error",
                "error": {"code": "timeout", "message": f"Query exceeded {PER_QUERY_TIMEOUT_S}s timeout"},
            }
        except Exception:
            logger.exception("Stream query %s failed", item.id)
            return {
                "type": "query_result",
                "id": item.id,
                "status": "error",
                "error": {"code": "internal_error", "message": "An internal error occurred"},
            }


async def _stream_batch_results(
    req: StreamBatchRequest,
    *,
    tenant_id: str | None,
    is_admin: bool,
) -> AsyncGenerator[bytes, None]:
    """Yield NDJSON lines as each query in the batch completes."""
    start_time = time.monotonic()
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_QUERIES)

    tasks = [
        asyncio.create_task(
            _execute_single_stream_query(
                item,
                tenant_id=tenant_id,
                is_admin=is_admin,
                shared_variables=req.variables,
                semaphore=semaphore,
            )
        )
        for item in req.queries
    ]

    completed = 0
    for coro in asyncio.as_completed(tasks, timeout=BATCH_TIMEOUT_S):
        try:
            result = await coro
        except asyncio.TimeoutError:
            # Batch-level timeout: emit errors for remaining queries
            for task in tasks:
                if not task.done():
                    task.cancel()
                    result = {
                        "type": "query_result",
                        "id": "unknown",
                        "status": "error",
                        "error": {"code": "batch_timeout", "message": f"Batch exceeded {BATCH_TIMEOUT_S}s timeout"},
                    }
                    yield orjson.dumps(result) + b"\n"
                    completed += 1
            break
        else:
            yield orjson.dumps(result) + b"\n"
            completed += 1

    took_ms = round((time.monotonic() - start_time) * 1000)
    summary = {
        "type": "batch_complete",
        "took_ms": took_ms,
        "total": len(req.queries),
    }
    yield orjson.dumps(summary) + b"\n"


@router.post("/query/batch/stream", dependencies=[Depends(require_scope("read"))])
async def batch_query_stream(
    req: StreamBatchRequest,
    request: Request,
    tenant_id: str = Depends(get_query_tenant_id),
) -> StreamingResponse:
    admin = _is_admin(request)

    logger.info(
        "batch_stream_request",
        query_count=len(req.queries),
        dashboard_id=req.dashboard_id,
        tenant_id=tenant_id,
    )

    return StreamingResponse(
        _stream_batch_results(req, tenant_id=tenant_id, is_admin=admin),
        media_type="application/x-ndjson",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-cache",
        },
    )


@router.post("/validate", dependencies=[Depends(require_scope("read"))])
async def mql_validate(
    body: MQLQueryRequest,
) -> MQLValidateResponse:
    try:
        query_str = body.query
        if body.variables:
            query_str = substitute_variables(query_str, body.variables)
        ast = parse(query_str)
        return MQLValidateResponse(
            valid=True,
            aggregator=ast.aggregator,
            metric_name=ast.metric_name,
            filter_count=len(ast.filters),
            function_count=len(ast.functions),
            has_rollup=ast.rollup is not None,
        )
    except (MQLParseError, MQLTokenizeError, VariableSubstitutionError) as e:
        pos = e.pos if hasattr(e, "pos") else (e.position if hasattr(e, "position") else None)
        return MQLValidateResponse(
            valid=False,
            error=str(e),
            error_pos=pos,
        )
