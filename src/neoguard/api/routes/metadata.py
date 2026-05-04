"""Metadata routes — metric name typeahead, tag key/value lookups, function catalog."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from neoguard.api.deps import get_tenant_id, require_scope
from neoguard.services.metadata import (
    MQLFunctionInfo,
    get_functions,
    get_metric_names,
    get_tag_keys,
    get_tag_values,
)

router = APIRouter(prefix="/api/v1/metadata", tags=["metadata"])


class MQLFunctionResponse(BaseModel):
    name: str
    description: str
    arity: int
    example: str


@router.get(
    "/metrics",
    dependencies=[Depends(require_scope("read"))],
)
async def list_metric_names(
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
    q: str = Query(default="", max_length=200, description="Search substring (case-insensitive)"),
    limit: int = Query(default=50, ge=1, le=200, description="Max results"),
) -> list[str]:
    """Typeahead search for metric names."""
    return await get_metric_names(tenant_id=tenant_id, query=q, limit=limit)


@router.get(
    "/metrics/{name}/tag_keys",
    dependencies=[Depends(require_scope("read"))],
)
async def list_tag_keys(
    name: str,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[str]:
    """Return distinct tag keys for the given metric."""
    return await get_tag_keys(tenant_id=tenant_id, metric_name=name)


@router.get(
    "/metrics/{name}/tag_values",
    dependencies=[Depends(require_scope("read"))],
)
async def list_tag_values(
    name: str,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
    key: str = Query(..., min_length=1, max_length=128, description="Tag key to look up values for"),
    q: str = Query(default="", max_length=200, description="Filter substring"),
    limit: int = Query(default=100, ge=1, le=10000, description="Max results"),
) -> list[str]:
    """Return distinct values for a tag key on the given metric."""
    return await get_tag_values(
        tenant_id=tenant_id,
        metric_name=name,
        key=key,
        query=q,
        limit=limit,
    )


@router.get(
    "/functions",
    dependencies=[Depends(require_scope("read"))],
)
async def list_functions() -> list[MQLFunctionResponse]:
    """Return the static catalog of supported MQL functions with docs."""
    funcs = get_functions()
    return [
        MQLFunctionResponse(
            name=f.name,
            description=f.description,
            arity=f.arity,
            example=f.example,
        )
        for f in funcs
    ]
