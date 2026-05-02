from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from neoguard.api.deps import get_tenant_id, require_scope
from neoguard.models.metrics import MetricQueryResult
from neoguard.services.mql.compiler import compile_query
from neoguard.services.mql.executor import execute
from neoguard.services.mql.parser import parse, MQLParseError
from neoguard.services.mql.tokenizer import MQLTokenizeError

INTERNAL_METRIC_PREFIX = "neoguard."

router = APIRouter(prefix="/api/v1/mql", tags=["mql"])


class MQLQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    start: datetime
    end: datetime
    interval: str = "1m"


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


def _is_admin(request: Request) -> bool:
    scopes = getattr(request.state, "scopes", [])
    return "admin" in scopes or getattr(request.state, "is_super_admin", False)


@router.post("/query", dependencies=[Depends(require_scope("read"))])
async def mql_query(
    body: MQLQueryRequest,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[MetricQueryResult]:
    try:
        ast = parse(body.query)
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

    return await execute(compiled)


@router.post("/query/batch", dependencies=[Depends(require_scope("read"))])
async def mql_query_batch(
    body: MQLBatchRequest,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[list[MetricQueryResult]]:
    import asyncio

    admin = _is_admin(request)
    compiled_list = []

    for item in body.queries:
        try:
            ast = parse(item.query)
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


@router.post("/validate", dependencies=[Depends(require_scope("read"))])
async def mql_validate(
    body: MQLQueryRequest,
) -> MQLValidateResponse:
    try:
        ast = parse(body.query)
        return MQLValidateResponse(
            valid=True,
            aggregator=ast.aggregator,
            metric_name=ast.metric_name,
            filter_count=len(ast.filters),
            function_count=len(ast.functions),
            has_rollup=ast.rollup is not None,
        )
    except (MQLParseError, MQLTokenizeError) as e:
        pos = e.pos if hasattr(e, "pos") else None
        return MQLValidateResponse(
            valid=False,
            error=str(e),
            error_pos=pos,
        )
