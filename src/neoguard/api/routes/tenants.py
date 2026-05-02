from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from neoguard.api.deps import require_scope
from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.models.users import (
    InviteCreate,
    MemberRoleUpdate,
    MembershipResponse,
    TenantAuditEntry,
    TenantCreate,
    TenantResponse,
    TenantRole,
    TenantUpdate,
)
from neoguard.services.auth.admin import get_tenant_audit_log, write_tenant_audit
from neoguard.services.auth.sessions import update_session_tenant
from neoguard.services.auth.users import (
    create_tenant,
    get_membership,
    get_tenant_by_id,
    get_tenant_members,
    get_user_tenants,
    remove_member,
    update_member_role,
    update_tenant,
)

router = APIRouter(prefix="/api/v1/tenants", tags=["tenants"])


def _get_user_id(request: Request) -> UUID:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Authentication required")
    return user_id


def _get_tenant_id(request: Request) -> UUID:
    tid = getattr(request.state, "tenant_id", None)
    if not tid:
        raise HTTPException(400, "No active tenant")
    return UUID(tid)


MAX_TENANTS_PER_USER = 3


@router.post("", status_code=201, response_model=TenantResponse)
async def create_new_tenant(data: TenantCreate, request: Request) -> TenantResponse:
    user_id = _get_user_id(request)
    existing = await get_user_tenants(user_id)
    if len(existing) >= MAX_TENANTS_PER_USER:
        raise HTTPException(
            400,
            f"Maximum of {MAX_TENANTS_PER_USER} tenants per user. Contact support for more.",
        )
    tenant = await create_tenant(data.name, user_id)
    await log.ainfo("tenant.created", tenant_id=str(tenant["id"]), user_id=str(user_id))
    return TenantResponse(**tenant)


@router.get("", response_model=list[TenantResponse])
async def list_my_tenants(request: Request) -> list[TenantResponse]:
    user_id = _get_user_id(request)
    tenants = await get_user_tenants(user_id)
    return [TenantResponse(**t) for t in tenants]


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_existing_tenant(
    tenant_id: UUID,
    data: TenantUpdate,
    request: Request,
) -> TenantResponse:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership or membership["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin or owner role required")
    tenant = await update_tenant(tenant_id, name=data.name)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    await write_tenant_audit(
        tenant_id=tenant_id, action="tenant.updated", resource_type="tenant",
        resource_id=str(tenant_id), actor_id=user_id,
        details={"name": data.name},
        ip_address=request.client.host if request.client else None,
    )
    return TenantResponse(**tenant)


@router.post("/{tenant_id}/switch")
async def switch_tenant(
    tenant_id: UUID,
    request: Request,
    response: Response,
) -> dict:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership:
        raise HTTPException(403, "Not a member of this tenant")

    tenant = await get_tenant_by_id(tenant_id)
    if not tenant or tenant["status"] != "active":
        raise HTTPException(403, "Tenant is not active")

    session_id = request.cookies.get(settings.session_cookie_name)
    if session_id:
        role = TenantRole(membership["role"])
        await update_session_tenant(session_id, tenant_id, role)

    await log.ainfo(
        "tenant.switched",
        user_id=str(user_id),
        tenant_id=str(tenant_id),
    )

    return {
        "message": "Tenant switched",
        "tenant_id": str(tenant_id),
        "role": membership["role"],
    }


@router.get("/{tenant_id}/members", response_model=list[MembershipResponse])
async def list_members(tenant_id: UUID, request: Request) -> list[MembershipResponse]:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership:
        raise HTTPException(403, "Not a member of this tenant")
    members = await get_tenant_members(tenant_id)
    return [MembershipResponse(**m) for m in members]


@router.post(
    "/{tenant_id}/invite",
    status_code=201,
    dependencies=[Depends(require_scope("admin"))],
)
async def invite_member(
    tenant_id: UUID,
    data: InviteCreate,
    request: Request,
) -> dict:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership or membership["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin or owner role required")

    from neoguard.services.auth.users import get_user_by_email
    existing_user = await get_user_by_email(data.email)
    if existing_user:
        existing_membership = await get_membership(existing_user["id"], tenant_id)
        if existing_membership:
            raise HTTPException(409, "User is already a member of this tenant")

        from neoguard.db.timescale.connection import get_pool
        pool = await get_pool()
        await pool.execute(
            """
            INSERT INTO tenant_memberships (user_id, tenant_id, role, invited_by)
            VALUES ($1, $2, $3, $4)
            """,
            existing_user["id"], tenant_id, data.role.value, user_id,
        )
        await log.ainfo(
            "tenant.member_added",
            tenant_id=str(tenant_id),
            invited_email=data.email,
            role=data.role.value,
        )
        await write_tenant_audit(
            tenant_id=tenant_id, action="member.added", resource_type="membership",
            resource_id=str(existing_user["id"]), actor_id=user_id,
            details={"email": data.email, "role": data.role.value},
            ip_address=request.client.host if request.client else None,
        )
        return {"message": f"User {data.email} added to tenant", "role": data.role.value}

    from neoguard.services.auth.invites import create_invite
    await create_invite(
        tenant_id=tenant_id,
        email=data.email,
        role=data.role.value,
        invited_by=user_id,
    )

    await log.ainfo(
        "tenant.invite_pending",
        tenant_id=str(tenant_id),
        email=data.email,
        role=data.role.value,
    )
    await write_tenant_audit(
        tenant_id=tenant_id, action="member.invited", resource_type="membership",
        actor_id=user_id,
        details={"email": data.email, "role": data.role.value},
        ip_address=request.client.host if request.client else None,
    )
    return {"message": f"Invite sent to {data.email} (email delivery deferred to cloud)", "role": data.role.value}


@router.patch(
    "/{tenant_id}/members/{member_id}/role",
    dependencies=[Depends(require_scope("admin"))],
)
async def change_member_role(
    tenant_id: UUID,
    member_id: UUID,
    data: MemberRoleUpdate,
    request: Request,
) -> dict:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership or membership["role"] != "owner":
        raise HTTPException(403, "Owner role required to change roles")

    success = await update_member_role(tenant_id, member_id, data.role.value)
    if not success:
        raise HTTPException(400, "Cannot change role — ensure at least one owner remains")

    await write_tenant_audit(
        tenant_id=tenant_id, action="member.role_changed", resource_type="membership",
        resource_id=str(member_id), actor_id=user_id,
        details={"new_role": data.role.value},
        ip_address=request.client.host if request.client else None,
    )
    return {"message": "Role updated", "role": data.role.value}


@router.delete(
    "/{tenant_id}/members/{member_id}",
    status_code=204,
    dependencies=[Depends(require_scope("admin"))],
)
async def remove_tenant_member(
    tenant_id: UUID,
    member_id: UUID,
    request: Request,
) -> None:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership or membership["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin or owner role required")

    success = await remove_member(tenant_id, member_id)
    if not success:
        raise HTTPException(400, "Cannot remove last owner")

    await write_tenant_audit(
        tenant_id=tenant_id, action="member.removed", resource_type="membership",
        resource_id=str(member_id), actor_id=user_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/{tenant_id}/audit-log", response_model=list[TenantAuditEntry])
async def tenant_audit_log(
    tenant_id: UUID,
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[TenantAuditEntry]:
    user_id = _get_user_id(request)
    membership = await get_membership(user_id, tenant_id)
    if not membership or membership["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Admin or owner role required to view audit log")
    entries = await get_tenant_audit_log(tenant_id, limit=limit, offset=offset)
    return [TenantAuditEntry(**e) for e in entries]
