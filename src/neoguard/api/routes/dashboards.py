import orjson
from uuid import UUID

from ulid import ULID

from fastapi import APIRouter, Depends, HTTPException, Request

from neoguard.api.deps import get_current_user_id, get_tenant_id, get_tenant_id_required, require_scope
from neoguard.db.timescale.connection import get_pool
from neoguard.models.dashboards import (
    Dashboard,
    DashboardCreate,
    DashboardLink,
    DashboardPermissionLevel,
    DashboardPermissionResponse,
    DashboardPermissionSet,
    DashboardSummary,
    DashboardUpdate,
    DashboardVariable,
    PanelDefinition,
    PanelGroup,
)
from neoguard.models.dashboard_versions import DashboardVersion
from neoguard.services.dashboard_metrics import record_layout_save
from neoguard.services.dashboard_permissions import (
    get_effective_permission,
    has_permission,
    list_dashboard_permissions,
    remove_dashboard_permission,
    set_dashboard_permission,
)
from neoguard.services.dashboards import (
    create_dashboard,
    delete_dashboard,
    get_dashboard,
    list_dashboards,
    list_favorites,
    toggle_favorite,
    update_dashboard,
)
from neoguard.services.dashboard_versions import (
    count_versions,
    get_version,
    list_versions,
    save_version,
)

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"])


def _get_user_role(request: Request) -> str | None:
    return getattr(request.state, "user_role", None)


def _is_super_admin(request: Request) -> bool:
    return getattr(request.state, "is_super_admin", False)


async def _require_dashboard_permission(
    request: Request,
    dashboard_id: str,
    level: DashboardPermissionLevel,
) -> DashboardPermissionLevel:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Authentication required")

    effective = await get_effective_permission(
        dashboard_id=dashboard_id,
        user_id=str(user_id),
        tenant_role=_get_user_role(request),
        is_super_admin=_is_super_admin(request),
    )
    if not has_permission(effective, level):
        raise HTTPException(403, f"Dashboard {level.value} permission required")
    return effective  # type: ignore[return-value]


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(require_scope("write"))],
)
async def create(
    data: DashboardCreate,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Dashboard:
    return await create_dashboard(tenant_id, data, created_by=user_id)


@router.get("")
async def list_all(
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[DashboardSummary]:
    return await list_dashboards(tenant_id, limit=min(limit, 500), offset=offset, search=search)


# --- Static paths MUST be registered before /{dashboard_id} to avoid path interception ---

@router.get("/favorites")
async def get_favorites(
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> list[str]:
    return await list_favorites(tenant_id, user_id)


@router.post(
    "/import",
    status_code=201,
    response_model=Dashboard,
    dependencies=[Depends(require_scope("write"))],
)
async def import_dashboard(
    payload: DashboardCreate,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Dashboard:
    return await create_dashboard(tenant_id, payload, created_by=user_id)


# --- Dynamic path routes ---

@router.get("/{dashboard_id}")
async def get_one(
    dashboard_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> Dashboard:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return dash


@router.patch(
    "/{dashboard_id}",
    dependencies=[Depends(require_scope("write"))],
)
async def update(
    dashboard_id: str,
    data: DashboardUpdate,
    request: Request,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Dashboard:
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.EDIT)

    existing = await get_dashboard(tenant_id, dashboard_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        version_id = str(ULID())
        data_json = orjson.dumps(existing.model_dump(mode="json")).decode()
        await conn.fetchrow(
            """
            INSERT INTO dashboard_versions (id, dashboard_id, version_number, data, change_summary, created_by)
            VALUES ($1, $2,
                    COALESCE((SELECT MAX(version_number) FROM dashboard_versions WHERE dashboard_id = $2), 0) + 1,
                    $3, $4, $5)
            RETURNING *
            """,
            version_id, dashboard_id, data_json, "Auto-saved before update", user_id,
        )

        updates = data.model_dump(exclude_none=True)
        if updates:
            set_parts = []
            params = [dashboard_id, tenant_id]
            idx = 3
            for field, value in updates.items():
                if field == "panels":
                    encoded = [p.model_dump() if isinstance(p, PanelDefinition) else p for p in value]
                    value = orjson.dumps(encoded).decode()
                elif field == "variables":
                    encoded = [v.model_dump() if isinstance(v, DashboardVariable) else v for v in value]
                    value = orjson.dumps(encoded).decode()
                elif field == "groups":
                    encoded = [g.model_dump() if isinstance(g, PanelGroup) else g for g in value]
                    value = orjson.dumps(encoded).decode()
                elif field == "tags":
                    value = orjson.dumps(value).decode()
                elif field == "links":
                    encoded = [lk.model_dump() if isinstance(lk, DashboardLink) else lk for lk in value]
                    value = orjson.dumps(encoded).decode()
                set_parts.append(f"{field} = ${idx}")
                params.append(value)
                idx += 1
            set_parts.append("updated_at = NOW()")
            await conn.execute(
                f"UPDATE dashboards SET {', '.join(set_parts)}"  # noqa: S608
                " WHERE id = $1 AND tenant_id = $2",
                *params,
            )

    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    record_layout_save(tenant_id)
    return dash


@router.delete(
    "/{dashboard_id}",
    status_code=204,
    dependencies=[Depends(require_scope("write"))],
)
async def delete(
    dashboard_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.ADMIN)
    deleted = await delete_dashboard(tenant_id, dashboard_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Dashboard not found")


@router.post("/{dashboard_id}/favorite")
async def toggle_fav(
    dashboard_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> dict:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    is_fav = await toggle_favorite(tenant_id, user_id, dashboard_id)
    return {"favorited": is_fav}


@router.post(
    "/{dashboard_id}/duplicate",
    status_code=201,
    response_model=Dashboard,
    dependencies=[Depends(require_scope("write"))],
)
async def duplicate(
    dashboard_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Dashboard:
    original = await get_dashboard(tenant_id, dashboard_id)
    if not original:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    copy = DashboardCreate(
        name=f"{original.name} (copy)",
        description=original.description,
        panels=original.panels,
        variables=original.variables,
        groups=original.groups,
        tags=original.tags,
        links=original.links,
    )
    return await create_dashboard(tenant_id, copy, created_by=user_id)


@router.get("/{dashboard_id}/export")
async def export_dashboard(
    dashboard_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return {
        "version": 1,
        "name": dash.name,
        "description": dash.description,
        "panels": [p.model_dump() for p in dash.panels],
        "variables": [v.model_dump() for v in dash.variables],
        "groups": [g.model_dump() for g in dash.groups],
        "tags": dash.tags,
        "links": [lk.model_dump() for lk in dash.links],
    }


@router.get("/{dashboard_id}/versions")
async def get_versions(
    dashboard_id: str,
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[DashboardVersion]:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return await list_versions(dashboard_id, limit=min(limit, 100), offset=offset, tenant_id=tenant_id)


@router.get("/{dashboard_id}/versions/{version_number}")
async def get_one_version(
    dashboard_id: str,
    version_number: int,
    tenant_id: str | None = Depends(get_tenant_id),
) -> DashboardVersion:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    ver = await get_version(dashboard_id, version_number, tenant_id=tenant_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return ver


@router.post(
    "/{dashboard_id}/versions/{version_number}/restore",
    dependencies=[Depends(require_scope("write"))],
)
async def restore_version(
    dashboard_id: str,
    version_number: int,
    request: Request,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Dashboard:
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.EDIT)

    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    ver = await get_version(dashboard_id, version_number, tenant_id=tenant_id)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    await save_version(
        dashboard_id=dashboard_id,
        data=dash.model_dump(mode="json"),
        user_id=user_id,
        change_summary=f"Auto-saved before restore to v{version_number}",
        tenant_id=tenant_id,
    )

    restore_data = ver.data
    update_payload = DashboardUpdate(
        name=restore_data.get("name"),
        description=restore_data.get("description"),
        panels=[PanelDefinition(**p) for p in restore_data.get("panels", [])],
        variables=[DashboardVariable(**v) for v in restore_data.get("variables", [])],
        groups=[PanelGroup(**g) for g in restore_data.get("groups", [])],
        tags=restore_data.get("tags"),
        links=[DashboardLink(**lk) for lk in restore_data.get("links", [])],
    )
    updated = await update_dashboard(tenant_id, dashboard_id, update_payload)
    if not updated:
        raise HTTPException(status_code=500, detail="Restore failed")
    return updated


# --- Dashboard permission routes ---

@router.get("/{dashboard_id}/permissions", response_model=list[DashboardPermissionResponse])
async def get_permissions(
    dashboard_id: str,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[DashboardPermissionResponse]:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.ADMIN)
    return await list_dashboard_permissions(dashboard_id)


@router.post(
    "/{dashboard_id}/permissions",
    status_code=201,
    response_model=DashboardPermissionResponse,
)
async def set_permission(
    dashboard_id: str,
    data: DashboardPermissionSet,
    request: Request,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> DashboardPermissionResponse:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.ADMIN)
    return await set_dashboard_permission(
        tenant_id=tenant_id,
        dashboard_id=dashboard_id,
        user_id=data.user_id,
        permission=data.permission,
        granted_by=UUID(user_id),
    )


@router.delete("/{dashboard_id}/permissions/{target_user_id}")
async def delete_permission(
    dashboard_id: str,
    target_user_id: UUID,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    await _require_dashboard_permission(request, dashboard_id, DashboardPermissionLevel.ADMIN)
    removed = await remove_dashboard_permission(dashboard_id, target_user_id, tenant_id=tenant_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Permission not found")
    return {"message": "Permission removed"}


@router.get("/{dashboard_id}/my-permission")
async def get_my_permission(
    dashboard_id: str,
    request: Request,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Authentication required")
    dash = await get_dashboard(tenant_id, dashboard_id)
    if not dash:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    effective = await get_effective_permission(
        dashboard_id=dashboard_id,
        user_id=str(user_id),
        tenant_role=_get_user_role(request),
        is_super_admin=_is_super_admin(request),
    )
    return {
        "permission": effective.value if effective else None,
        "can_view": has_permission(effective, DashboardPermissionLevel.VIEW),
        "can_edit": has_permission(effective, DashboardPermissionLevel.EDIT),
        "can_admin": has_permission(effective, DashboardPermissionLevel.ADMIN),
    }
