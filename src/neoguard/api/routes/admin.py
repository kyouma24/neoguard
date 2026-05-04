"""Admin panel routes — super admin only."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response

from neoguard.core.config import settings
from neoguard.api.middleware.csrf import CSRF_COOKIE_NAME, generate_csrf_token
from neoguard.models.users import (
    AdminCreateTenantRequest,
    AdminCreateUserRequest,
    AdminSetActiveRequest,
    AdminSetStatusRequest,
    AdminSetSuperAdminRequest,
    AdminTenantResponse,
    AdminUserResponse,
    ImpersonateRequest,
    ImpersonateResponse,
    MemberRoleUpdate,
    MembershipResponse,
    PlatformAuditEntry,
    PlatformStatsResponse,
    SecurityLogEntry,
    TenantRole,
)
from neoguard.services.auth.admin import (
    admin_create_tenant,
    admin_delete_tenant,
    get_platform_audit_log,
    get_platform_stats,
    get_security_log,
    list_all_tenants,
    list_all_users,
    set_super_admin,
    set_tenant_status,
    set_user_active,
    write_platform_audit,
)
from neoguard.services.auth.sessions import (
    create_session,
    get_admin_session,
    store_admin_session,
)
from neoguard.services.auth.users import (
    create_user,
    get_membership,
    get_tenant_members,
    get_user_by_email,
    get_user_by_id,
    get_user_tenants,
    remove_member,
    update_member_role,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_super_admin(request: Request) -> UUID:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Authentication required")
    if not getattr(request.state, "is_super_admin", False):
        raise HTTPException(403, "Super admin access required")
    return UUID(str(user_id))


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@router.get("/stats", response_model=PlatformStatsResponse)
async def admin_stats(request: Request) -> PlatformStatsResponse:
    _require_super_admin(request)
    stats = await get_platform_stats()
    return PlatformStatsResponse(**stats)


@router.get("/tenants", response_model=list[AdminTenantResponse])
async def admin_list_tenants(
    request: Request,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[AdminTenantResponse]:
    _require_super_admin(request)
    tenants = await list_all_tenants(status=status, limit=limit, offset=offset)
    return [AdminTenantResponse(**t) for t in tenants]


@router.patch("/tenants/{tenant_id}/status", response_model=AdminTenantResponse)
async def admin_set_tenant_status(
    tenant_id: UUID,
    data: AdminSetStatusRequest,
    request: Request,
) -> AdminTenantResponse:
    actor_id = _require_super_admin(request)
    tenant = await set_tenant_status(tenant_id, data.status.value)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    await write_platform_audit(
        actor_id=actor_id,
        action=f"tenant.set_status.{data.status.value}",
        target_type="tenant",
        target_id=str(tenant_id),
        ip_address=_client_ip(request),
    )

    result = dict(tenant)
    result.setdefault("member_count", 0)
    return AdminTenantResponse(**result)


@router.post("/tenants", status_code=201, response_model=AdminTenantResponse)
async def admin_create_new_tenant(
    data: AdminCreateTenantRequest,
    request: Request,
) -> AdminTenantResponse:
    actor_id = _require_super_admin(request)
    tenant = await admin_create_tenant(data.name, owner_id=data.owner_id)

    await write_platform_audit(
        actor_id=actor_id,
        action="tenant.created",
        target_type="tenant",
        target_id=str(tenant["id"]),
        details={"name": data.name, "owner_id": str(data.owner_id) if data.owner_id else None},
        ip_address=_client_ip(request),
    )

    return AdminTenantResponse(**tenant)


@router.delete("/tenants/{tenant_id}", status_code=200)
async def admin_delete_existing_tenant(
    tenant_id: UUID,
    request: Request,
) -> dict:
    actor_id = _require_super_admin(request)
    success = await admin_delete_tenant(tenant_id)
    if not success:
        raise HTTPException(404, "Tenant not found or already deleted")

    await write_platform_audit(
        actor_id=actor_id,
        action="tenant.deleted",
        target_type="tenant",
        target_id=str(tenant_id),
        ip_address=_client_ip(request),
    )

    return {"message": "Tenant marked as deleted"}


@router.get("/users", response_model=list[AdminUserResponse])
async def admin_list_users(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[AdminUserResponse]:
    _require_super_admin(request)
    users = await list_all_users(limit=limit, offset=offset)
    return [AdminUserResponse(**u) for u in users]


@router.post("/users", status_code=201, response_model=AdminUserResponse)
async def admin_create_user(
    data: AdminCreateUserRequest,
    request: Request,
) -> AdminUserResponse:
    actor_id = _require_super_admin(request)

    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(409, "Email already registered")

    user = await create_user(data.email, data.password, data.name)

    if data.tenant_id:
        existing_membership = await get_membership(user["id"], data.tenant_id)
        if not existing_membership:
            from neoguard.db.timescale.connection import get_pool
            pool = await get_pool()
            await pool.execute(
                "INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)",
                user["id"], data.tenant_id, data.role.value,
            )

    await write_platform_audit(
        actor_id=actor_id,
        action="user.created",
        target_type="user",
        target_id=str(user["id"]),
        details={"email": data.email, "name": data.name, "tenant_id": str(data.tenant_id) if data.tenant_id else None},
        ip_address=_client_ip(request),
    )

    result = dict(user)
    result.setdefault("tenant_count", 1 if data.tenant_id else 0)
    return AdminUserResponse(**result)


@router.patch("/users/{user_id}/super-admin")
async def admin_set_super_admin(
    user_id: UUID,
    data: AdminSetSuperAdminRequest,
    request: Request,
) -> AdminUserResponse:
    actor_id = _require_super_admin(request)
    if actor_id == user_id and not data.is_super_admin:
        raise HTTPException(400, "Cannot revoke your own super admin status")

    user = await set_super_admin(user_id, data.is_super_admin)
    if not user:
        raise HTTPException(404, "User not found")

    action = "user.grant_super_admin" if data.is_super_admin else "user.revoke_super_admin"
    await write_platform_audit(
        actor_id=actor_id,
        action=action,
        target_type="user",
        target_id=str(user_id),
        ip_address=_client_ip(request),
    )

    result = dict(user)
    result.setdefault("tenant_count", 0)
    return AdminUserResponse(**result)


@router.patch("/users/{user_id}/active")
async def admin_set_user_active(
    user_id: UUID,
    data: AdminSetActiveRequest,
    request: Request,
) -> AdminUserResponse:
    actor_id = _require_super_admin(request)
    if actor_id == user_id and not data.is_active:
        raise HTTPException(400, "Cannot deactivate yourself")

    user = await set_user_active(user_id, data.is_active)
    if not user:
        raise HTTPException(404, "User not found")

    action = "user.activate" if data.is_active else "user.deactivate"
    await write_platform_audit(
        actor_id=actor_id,
        action=action,
        target_type="user",
        target_id=str(user_id),
        ip_address=_client_ip(request),
    )

    result = dict(user)
    result.setdefault("tenant_count", 0)
    return AdminUserResponse(**result)


@router.get("/audit-log", response_model=list[PlatformAuditEntry])
async def admin_audit_log(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[PlatformAuditEntry]:
    _require_super_admin(request)
    entries = await get_platform_audit_log(limit=limit, offset=offset)
    return [PlatformAuditEntry(**e) for e in entries]


@router.get("/security-log", response_model=list[SecurityLogEntry])
async def admin_security_log(
    request: Request,
    event_type: str | None = None,
    success: bool | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[SecurityLogEntry]:
    _require_super_admin(request)
    entries = await get_security_log(
        event_type=event_type, success=success, limit=limit, offset=offset,
    )
    return [SecurityLogEntry(**e) for e in entries]


@router.post("/impersonate", response_model=ImpersonateResponse)
async def admin_impersonate(
    data: ImpersonateRequest,
    request: Request,
    response: Response,
) -> ImpersonateResponse:
    actor_id = _require_super_admin(request)

    if actor_id == data.user_id:
        raise HTTPException(400, "Cannot impersonate yourself")

    target_user = await get_user_by_id(data.user_id)
    if not target_user:
        raise HTTPException(404, "User not found")

    tenants = await get_user_tenants(data.user_id)
    if not tenants:
        raise HTTPException(400, "Target user has no active tenants")

    tenant = tenants[0]
    ttl_seconds = data.duration_minutes * 60

    current_session_id = request.cookies.get(settings.session_cookie_name)

    impersonation_session_id = await create_session(
        user_id=data.user_id,
        tenant_id=tenant["id"],
        role=TenantRole(tenant["role"]),
        is_super_admin=False,
        impersonated_by=actor_id,
        ttl_override=ttl_seconds,
    )

    if current_session_id:
        await store_admin_session(impersonation_session_id, current_session_id, ttl_seconds)

    response.set_cookie(
        key=settings.session_cookie_name,
        value=impersonation_session_id,
        max_age=ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=ttl_seconds,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )

    await write_platform_audit(
        actor_id=actor_id,
        action="user.impersonate.start",
        target_type="user",
        target_id=str(data.user_id),
        reason=data.reason,
        ip_address=_client_ip(request),
        details={"duration_minutes": data.duration_minutes},
    )

    return ImpersonateResponse(
        message=f"Now impersonating {target_user['name']}",
        impersonating=str(data.user_id),
        expires_in_minutes=data.duration_minutes,
    )


@router.post("/end-impersonation")
async def admin_end_impersonation(request: Request, response: Response) -> dict:
    current_session_id = request.cookies.get(settings.session_cookie_name)
    if not current_session_id:
        raise HTTPException(400, "No active session")

    impersonated_by = getattr(request.state, "impersonated_by", None)
    if not impersonated_by:
        raise HTTPException(400, "Not currently impersonating")

    admin_session_id = await get_admin_session(current_session_id)
    if not admin_session_id:
        raise HTTPException(400, "Admin session expired — please log in again")

    from neoguard.services.auth.sessions import delete_session
    await delete_session(current_session_id)

    response.set_cookie(
        key=settings.session_cookie_name,
        value=admin_session_id,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=settings.session_ttl_seconds,
        httponly=False,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )

    await write_platform_audit(
        actor_id=impersonated_by,
        action="user.impersonate.end",
        target_type="user",
        target_id=str(getattr(request.state, "user_id", None)),
        ip_address=_client_ip(request),
    )

    return {"message": "Impersonation ended"}


@router.get("/tenants/{tenant_id}/members", response_model=list[MembershipResponse])
async def admin_list_tenant_members(
    tenant_id: UUID,
    request: Request,
) -> list[MembershipResponse]:
    _require_super_admin(request)
    members = await get_tenant_members(tenant_id)
    return [MembershipResponse(**m) for m in members]


@router.get("/users/{user_id}/tenants")
async def admin_list_user_tenants(
    user_id: UUID,
    request: Request,
) -> list[dict]:
    _require_super_admin(request)
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    tenants = await get_user_tenants(user_id)
    return tenants


@router.post("/users/{user_id}/tenants/{tenant_id}", status_code=201)
async def admin_add_user_to_tenant(
    user_id: UUID,
    tenant_id: UUID,
    data: MemberRoleUpdate,
    request: Request,
) -> dict:
    actor_id = _require_super_admin(request)

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    existing = await get_membership(user_id, tenant_id)
    if existing:
        raise HTTPException(409, "User is already a member of this tenant")

    from neoguard.db.timescale.connection import get_pool
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)",
        user_id, tenant_id, data.role.value,
    )

    await write_platform_audit(
        actor_id=actor_id,
        action="member.added_by_admin",
        target_type="membership",
        target_id=f"{user_id}:{tenant_id}",
        details={"role": data.role.value},
        ip_address=_client_ip(request),
    )

    return {"message": "User added to tenant", "role": data.role.value}


@router.patch("/users/{user_id}/tenants/{tenant_id}/role")
async def admin_change_user_role(
    user_id: UUID,
    tenant_id: UUID,
    data: MemberRoleUpdate,
    request: Request,
) -> dict:
    actor_id = _require_super_admin(request)

    success = await update_member_role(tenant_id, user_id, data.role.value)
    if not success:
        raise HTTPException(400, "Cannot change role — ensure at least one owner remains")

    await write_platform_audit(
        actor_id=actor_id,
        action="member.role_changed_by_admin",
        target_type="membership",
        target_id=f"{user_id}:{tenant_id}",
        details={"new_role": data.role.value},
        ip_address=_client_ip(request),
    )

    return {"message": "Role updated", "role": data.role.value}


@router.delete("/users/{user_id}/tenants/{tenant_id}", status_code=200)
async def admin_remove_user_from_tenant(
    user_id: UUID,
    tenant_id: UUID,
    request: Request,
) -> dict:
    actor_id = _require_super_admin(request)

    success = await remove_member(tenant_id, user_id)
    if not success:
        raise HTTPException(400, "Cannot remove last owner from tenant")

    await write_platform_audit(
        actor_id=actor_id,
        action="member.removed_by_admin",
        target_type="membership",
        target_id=f"{user_id}:{tenant_id}",
        ip_address=_client_ip(request),
    )

    return {"message": "User removed from tenant"}
