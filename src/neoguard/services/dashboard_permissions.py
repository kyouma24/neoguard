"""Dashboard-level RBAC service.

Permission resolution order:
1. Super admin → always admin access
2. Tenant admin/owner → always admin access
3. Explicit per-dashboard grant (dashboard_permissions table)
4. Role-based defaults: member → edit, viewer → view
"""
from __future__ import annotations

from uuid import UUID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.dashboards import (
    DashboardPermissionLevel,
    DashboardPermissionResponse,
    PERMISSION_HIERARCHY,
)


async def get_effective_permission(
    dashboard_id: str,
    user_id: str,
    tenant_role: str | None,
    is_super_admin: bool = False,
) -> DashboardPermissionLevel | None:
    if is_super_admin:
        return DashboardPermissionLevel.ADMIN

    if tenant_role in ("owner", "admin"):
        return DashboardPermissionLevel.ADMIN

    explicit = await get_user_permission(dashboard_id, user_id)
    if explicit:
        return explicit

    if tenant_role == "member":
        return DashboardPermissionLevel.EDIT
    if tenant_role == "viewer":
        return DashboardPermissionLevel.VIEW

    return None


def has_permission(
    effective: DashboardPermissionLevel | None,
    required: DashboardPermissionLevel,
) -> bool:
    if effective is None:
        return False
    return PERMISSION_HIERARCHY[effective] >= PERMISSION_HIERARCHY[required]


async def get_user_permission(
    dashboard_id: str, user_id: str,
) -> DashboardPermissionLevel | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT permission FROM dashboard_permissions WHERE dashboard_id = $1 AND user_id = $2::uuid",
        dashboard_id, user_id,
    )
    if row:
        return DashboardPermissionLevel(row["permission"])
    return None


async def list_dashboard_permissions(
    dashboard_id: str,
) -> list[DashboardPermissionResponse]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT dp.id, dp.dashboard_id, dp.user_id, dp.permission, dp.granted_by, dp.created_at,
               u.email AS user_email, u.name AS user_name
        FROM dashboard_permissions dp
        JOIN users u ON u.id = dp.user_id
        WHERE dp.dashboard_id = $1
        ORDER BY dp.created_at
        """,
        dashboard_id,
    )
    return [
        DashboardPermissionResponse(
            id=r["id"],
            dashboard_id=r["dashboard_id"],
            user_id=r["user_id"],
            user_email=r["user_email"],
            user_name=r["user_name"],
            permission=DashboardPermissionLevel(r["permission"]),
            granted_by=r["granted_by"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


async def set_dashboard_permission(
    tenant_id: str,
    dashboard_id: str,
    user_id: UUID,
    permission: DashboardPermissionLevel,
    granted_by: UUID | None = None,
) -> DashboardPermissionResponse:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO dashboard_permissions (tenant_id, dashboard_id, user_id, permission, granted_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (dashboard_id, user_id) DO UPDATE SET permission = EXCLUDED.permission, granted_by = EXCLUDED.granted_by
        RETURNING id, dashboard_id, user_id, permission, granted_by, created_at
        """,
        tenant_id, dashboard_id, user_id, permission.value, granted_by,
    )
    user_row = await pool.fetchrow(
        "SELECT email, name FROM users WHERE id = $1", user_id,
    )
    return DashboardPermissionResponse(
        id=row["id"],
        dashboard_id=row["dashboard_id"],
        user_id=row["user_id"],
        user_email=user_row["email"] if user_row else None,
        user_name=user_row["name"] if user_row else None,
        permission=DashboardPermissionLevel(row["permission"]),
        granted_by=row["granted_by"],
        created_at=row["created_at"],
    )


async def remove_dashboard_permission(
    dashboard_id: str, user_id: UUID,
) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "DELETE FROM dashboard_permissions WHERE dashboard_id = $1 AND user_id = $2",
        dashboard_id, user_id,
    )
    return result == "DELETE 1"
