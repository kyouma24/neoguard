from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id
from neoguard.models.dashboards import Dashboard, DashboardCreate, DashboardUpdate
from neoguard.services.dashboards import (
    create_dashboard,
    delete_dashboard,
    get_dashboard,
    list_dashboards,
    update_dashboard,
)

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"])


@router.post("", status_code=201)
async def create(
    data: DashboardCreate,
    tenant_id: str = Depends(get_tenant_id),
) -> Dashboard:
    return await create_dashboard(tenant_id, data)


@router.get("")
async def list_all(
    tenant_id: str = Depends(get_tenant_id),
) -> list[Dashboard]:
    return await list_dashboards(tenant_id)


@router.get("/{dashboard_id}")
async def get_one(
    dashboard_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> Dashboard:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dash


@router.patch("/{dashboard_id}")
async def update(
    dashboard_id: str,
    data: DashboardUpdate,
    tenant_id: str = Depends(get_tenant_id),
) -> Dashboard:
    dash = await update_dashboard(tenant_id, dashboard_id, data)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dash


@router.delete("/{dashboard_id}", status_code=204)
async def delete(
    dashboard_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> None:
    deleted = await delete_dashboard(tenant_id, dashboard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dashboard not found")
