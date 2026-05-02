from __future__ import annotations

import time as _time

from fastapi import APIRouter, HTTPException, Request, Response

from neoguard.api.middleware.csrf import CSRF_COOKIE_NAME, generate_csrf_token
from neoguard.core.config import settings
from neoguard.models.users import (
    AuthResponse,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    ProfileUpdate,
    SignupRequest,
    TenantResponse,
    TenantRole,
    UserResponse,
)
from neoguard.services.auth import telemetry as auth_telemetry
from neoguard.services.auth.email import send_password_reset
from neoguard.services.auth.rate_limiter import check_rate_limit as check_auth_rate_limit
from neoguard.services.auth.password_reset import (
    check_rate_limit,
    create_reset_token,
    update_user_password,
    validate_and_consume_token,
)
from neoguard.services.auth.sessions import (
    create_session,
    delete_all_user_sessions,
    delete_session,
    list_user_sessions,
)
from neoguard.services.auth.users import (
    authenticate_user,
    create_tenant,
    create_user,
    get_membership,
    get_user_by_email,
    get_user_by_id,
    get_user_tenants,
    update_password,
    update_user_name,
)

router = APIRouter(tags=["user-auth"])


def _correlation_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _user_agent(request: Request) -> str | None:
    return request.headers.get("User-Agent")


def _session_ttl(is_super_admin: bool) -> int:
    if is_super_admin:
        return settings.super_admin_session_ttl_seconds
    return settings.session_ttl_seconds


@router.post("/auth/signup", status_code=201)
async def signup(data: SignupRequest, request: Request, response: Response) -> AuthResponse:
    rl = await check_auth_rate_limit("signup", _client_ip(request) or "unknown")
    if not rl.allowed:
        retry_after = max(rl.reset_at - int(_time.time()), 1)
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "Too many signup attempts. Please try again later.",
                    "correlation_id": _correlation_id(request),
                },
            },
            headers={"Retry-After": str(retry_after)},
        )

    existing = await get_user_by_email(data.email)
    if existing:
        raise HTTPException(409, "Email already registered")

    user = await create_user(data.email, data.password, data.name)
    tenant = await create_tenant(data.tenant_name, user["id"])

    from neoguard.services.auth.invites import accept_invite, get_pending_invites_for_email
    pending = await get_pending_invites_for_email(data.email)
    for invite in pending:
        await accept_invite(invite["id"], user["id"])

    is_admin = user.get("is_super_admin", False)
    cookie_ttl = _session_ttl(is_admin)

    session_id = await create_session(
        user_id=user["id"],
        tenant_id=tenant["id"],
        role=TenantRole.OWNER,
        is_super_admin=is_admin,
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=cookie_ttl,
        httponly=True,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=cookie_ttl,
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
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
    )

    return AuthResponse(
        user=UserResponse(**user),
        tenant=TenantResponse(**tenant),
        role=TenantRole.OWNER,
    )


@router.post("/auth/login")
async def login(data: LoginRequest, request: Request, response: Response) -> AuthResponse:
    rl = await check_auth_rate_limit("login", _client_ip(request) or "unknown")
    if not rl.allowed:
        retry_after = max(rl.reset_at - int(_time.time()), 1)
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "Too many login attempts. Please try again later.",
                    "correlation_id": _correlation_id(request),
                },
            },
            headers={"Retry-After": str(retry_after)},
        )

    user = await authenticate_user(data.email, data.password)
    if not user:
        await auth_telemetry.emit_login_failure(
            email=data.email,
            correlation_id=_correlation_id(request),
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
        )
        raise HTTPException(401, "Invalid email or password")

    tenants = await get_user_tenants(user["id"])
    if not tenants:
        raise HTTPException(403, "User has no active tenants")

    tenant = tenants[0]
    role = TenantRole(tenant["role"])

    is_admin = user.get("is_super_admin", False)
    cookie_ttl = _session_ttl(is_admin)

    session_id = await create_session(
        user_id=user["id"],
        tenant_id=tenant["id"],
        role=role,
        is_super_admin=is_admin,
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=cookie_ttl,
        httponly=True,
        samesite="lax",
        secure=False,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=generate_csrf_token(),
        max_age=cookie_ttl,
        httponly=False,
        samesite="lax",
        secure=False,
        path="/",
    )

    await auth_telemetry.emit_login_success(
        user_id=str(user["id"]),
        tenant_id=str(tenant["id"]),
        correlation_id=_correlation_id(request),
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
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
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
        )

    response.delete_cookie(key=settings.session_cookie_name)
    response.delete_cookie(key=CSRF_COOKIE_NAME)
    return {"message": "Logged out"}


@router.get("/auth/me")
async def get_current_user(request: Request, response: Response) -> AuthResponse:
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

    if not request.cookies.get(CSRF_COOKIE_NAME):
        response.set_cookie(
            key=CSRF_COOKIE_NAME,
            value=generate_csrf_token(),
            max_age=settings.session_ttl_seconds,
            httponly=False,
            samesite="lax",
            secure=False,
            path="/",
        )

    impersonated_by = getattr(request.state, "impersonated_by", None)
    return AuthResponse(
        user=UserResponse(**user),
        tenant=TenantResponse(**tenant),
        role=TenantRole(membership["role"]),
        is_impersonating=impersonated_by is not None,
        impersonated_by=str(impersonated_by) if impersonated_by else None,
    )


@router.patch("/auth/me")
async def update_profile(data: ProfileUpdate, request: Request) -> UserResponse:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Not authenticated")

    if data.new_password:
        if not data.current_password:
            raise HTTPException(400, "Current password required to set a new password")
        user = await authenticate_user(
            (await get_user_by_id(user_id))["email"],
            data.current_password,
        )
        if not user:
            raise HTTPException(400, "Current password is incorrect")
        await update_password(user_id, data.new_password)
        from neoguard.services.auth.telemetry import _write_sec
        await _write_sec("password_change", True, user_id=str(user_id), ip_address=_client_ip(request), user_agent=_user_agent(request))

    if data.name:
        await update_user_name(user_id, data.name)

    updated = await get_user_by_id(user_id)
    if not updated:
        raise HTTPException(404, "User not found")
    return UserResponse(**updated)


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


@router.get("/auth/sessions")
async def get_active_sessions(request: Request) -> list[dict]:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    current_session = request.cookies.get(settings.session_cookie_name)
    sessions = await list_user_sessions(user_id)
    for s in sessions:
        s["is_current"] = s["session_id"] == current_session
        s["session_id"] = s["session_id"][:8] + "..."
    return sessions


@router.delete("/auth/sessions", status_code=200)
async def terminate_all_sessions(request: Request, response: Response) -> dict:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    current_session = request.cookies.get(settings.session_cookie_name)
    count = await delete_all_user_sessions(user_id, except_session=current_session)
    return {"message": f"Terminated {count} session(s)", "terminated": count}
