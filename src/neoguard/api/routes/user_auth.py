from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from neoguard.api.middleware.csrf import CSRF_COOKIE_NAME, generate_csrf_token
from neoguard.core.config import settings
from neoguard.models.users import (
    AuthResponse,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    SignupRequest,
    TenantResponse,
    TenantRole,
    UserResponse,
)
from neoguard.services.auth import telemetry as auth_telemetry
from neoguard.services.auth.email import send_password_reset
from neoguard.services.auth.password_reset import (
    check_rate_limit,
    create_reset_token,
    update_user_password,
    validate_and_consume_token,
)
from neoguard.services.auth.sessions import create_session, delete_session
from neoguard.services.auth.users import (
    authenticate_user,
    create_tenant,
    create_user,
    get_membership,
    get_user_by_email,
    get_user_by_id,
    get_user_tenants,
)

router = APIRouter(tags=["user-auth"])


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.post("/auth/signup", status_code=201)
async def signup(data: SignupRequest, request: Request, response: Response) -> AuthResponse:
    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(409, "Email already registered")

    user = await create_user(data.email, data.password, data.name)
    tenant = await create_tenant(data.tenant_name, user["id"])

    session_id = await create_session(
        user_id=user["id"],
        tenant_id=tenant["id"],
        role=TenantRole.OWNER,
        is_super_admin=user.get("is_super_admin", False),
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=settings.session_ttl_seconds,
        httponly=False,
        samesite="lax",
        secure=False,
        path="/",
    )

    await auth_telemetry.emit_signup(
        user_id=str(user["id"]),
        tenant_id=str(tenant["id"]),
        email=data.email,
        correlation_id=_correlation_id(request),
    )

    return AuthResponse(
        user=UserResponse(**user),
        tenant=TenantResponse(**tenant),
        role=TenantRole.OWNER,
    )


@router.post("/auth/login")
async def login(data: LoginRequest, request: Request, response: Response) -> AuthResponse:
    user = await authenticate_user(data.email, data.password)
    if not user:
        await auth_telemetry.emit_login_failure(
            email=data.email,
            correlation_id=_correlation_id(request),
        )
        raise HTTPException(401, "Invalid email or password")

    tenants = await get_user_tenants(user["id"])
    if not tenants:
        raise HTTPException(403, "User has no active tenants")

    tenant = tenants[0]
    role = TenantRole(tenant["role"])

    session_id = await create_session(
        user_id=user["id"],
        tenant_id=tenant["id"],
        role=role,
        is_super_admin=user.get("is_super_admin", False),
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=settings.session_ttl_seconds,
        httponly=False,
        samesite="lax",
        secure=False,
        path="/",
    )

    await auth_telemetry.emit_login_success(
        user_id=str(user["id"]),
        tenant_id=str(tenant["id"]),
        correlation_id=_correlation_id(request),
    )

    return AuthResponse(
        user=UserResponse(**user),
        tenant=TenantResponse(**tenant),
        role=role,
    )


@router.post("/auth/logout")
async def logout(request: Request, response: Response) -> dict:
    session_id = request.cookies.get(settings.session_cookie_name)
    if session_id:
        await delete_session(session_id)
        await auth_telemetry.emit_logout(
            user_id=str(getattr(request.state, "user_id", None)),
            correlation_id=_correlation_id(request),
        )

    response.delete_cookie(key=settings.session_cookie_name)
    response.delete_cookie(key=CSRF_COOKIE_NAME)
    return {"message": "Logged out"}


@router.get("/auth/me")
async def get_current_user(request: Request) -> AuthResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "User not found")

    tenant_id_str = getattr(request.state, "tenant_id", None)
    if not tenant_id_str:
        raise HTTPException(400, "No active tenant")

    from uuid import UUID
    tenant_id = UUID(tenant_id_str)
    membership = await get_membership(user_id, tenant_id)
    if not membership:
        raise HTTPException(403, "Not a member of this tenant")

    from neoguard.services.auth.users import get_tenant_by_id
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    impersonated_by = getattr(request.state, "impersonated_by", None)
    return AuthResponse(
        user=UserResponse(**user),
        tenant=TenantResponse(**tenant),
        role=TenantRole(membership["role"]),
        is_impersonating=impersonated_by is not None,
        impersonated_by=str(impersonated_by) if impersonated_by else None,
    )


@router.post("/auth/password-reset/request", status_code=202)
async def request_password_reset(data: PasswordResetRequest, request: Request) -> dict:
    user = await get_user_by_email(data.email)
    if user and user["is_active"]:
        within_limit = await check_rate_limit(user["id"])
        if within_limit:
            raw_token = await create_reset_token(user["id"])
            reset_url = f"http://localhost:5173/reset-password?token={raw_token}"
            await send_password_reset(data.email, reset_url)

    return {"message": "If that email exists, a reset link has been sent"}


@router.post("/auth/password-reset/confirm")
async def confirm_password_reset(data: PasswordResetConfirm) -> dict:
    user_id = await validate_and_consume_token(data.token)
    if not user_id:
        raise HTTPException(400, "Invalid or expired reset token")

    await update_user_password(user_id, data.new_password)
    return {"message": "Password has been reset successfully"}
