from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.resources import Resource, ResourceCreate, ResourceUpdate
from neoguard.services.resources.crud import (
    create_resource,
    delete_resource,
    get_resource,
    get_resource_grouping,
    get_resource_issues,
    get_resource_summary,
    get_resource_topology,
    list_resource_changes,
    list_resources,
    update_resource,
)

router = APIRouter(prefix="/api/v1/resources", tags=["resources"])


@router.get("", response_model=list[Resource])
async def list_all(
    resource_type: str | None = None,
    provider: str | None = None,
    account_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[Resource]:
    return await list_resources(
        tenant_id,
        resource_type=resource_type,
        provider=provider,
        account_id=account_id,
        status=status,
        limit=min(limit, 500),
        offset=offset,
    )


@router.get("/summary")
async def summary(
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return await get_resource_summary(tenant_id)


@router.get("/issues")
async def issues(
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    """Aggregate resources and alerts that need attention.

    Returns stopped/terminated resources, stale resources (not seen in
    >15 minutes), and currently-firing alert events with summary counts.
    """
    return await get_resource_issues(tenant_id)


@router.get("/grouping")
async def grouping(
    group_by: str = "env",
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[dict]:
    return await get_resource_grouping(tenant_id, group_by=group_by)


@router.get("/topology")
async def topology(
    account_id: str | None = None,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    return await get_resource_topology(tenant_id, account_id=account_id)


@router.get("/changes")
async def list_changes(
    resource_id: str | None = None,
    limit: int = 50,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[dict]:
    return await list_resource_changes(
        tenant_id, resource_id=resource_id, limit=min(limit, 200),
    )


@router.get("/{resource_id}/changes")
async def resource_changes(
    resource_id: str,
    limit: int = 50,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[dict]:
    return await list_resource_changes(
        tenant_id, resource_id=resource_id, limit=min(limit, 200),
    )


@router.post(
    "",
    response_model=Resource,
    status_code=201,
    dependencies=[Depends(require_scope("write"))],
)
async def create(
    data: ResourceCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> Resource:
    return await create_resource(tenant_id, data)


@router.get("/{resource_id}", response_model=Resource)
async def get_one(
    resource_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> Resource:
    res = await get_resource(tenant_id, resource_id)
    if not res:
        raise HTTPException(404, "Resource not found")
    return res


@router.patch(
    "/{resource_id}",
    response_model=Resource,
    dependencies=[Depends(require_scope("write"))],
)
async def update(
    resource_id: str,
    data: ResourceUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> Resource:
    res = await update_resource(tenant_id, resource_id, data)
    if not res:
        raise HTTPException(404, "Resource not found")
    return res


@router.delete(
    "/{resource_id}",
    status_code=204,
    dependencies=[Depends(require_scope("write"))],
)
async def delete(
    resource_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_resource(tenant_id, resource_id)
    if not deleted:
        raise HTTPException(404, "Resource not found")
