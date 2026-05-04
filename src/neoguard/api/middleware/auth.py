"""Authentication and rate-limiting middleware."""

import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.timescale.tenant_ctx import current_tenant_id
from neoguard.services.auth.api_keys import validate_api_key

EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

EXEMPT_PREFIXES: tuple[str, ...] = ()

AUTH_PUBLIC_PATHS = {"/auth/signup", "/auth/login", "/auth/password-reset/request", "/auth/password-reset/confirm"}


class AuthMiddleware(BaseHTTPMiddleware):
    def _set_tenant(self, request: Request, tenant_id: str | None) -> None:
        request.state.tenant_id = tenant_id
        current_tenant_id.set(tenant_id)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            self._set_tenant(request, settings.default_tenant_id)
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
            request.state.user_id = None
            request.state.user_role = None
            request.state.is_super_admin = False
            request.state.auth_method = None
            return await call_next(request)

        if not settings.auth_enabled:
            self._set_tenant(request, settings.default_tenant_id)
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
            request.state.user_id = None
            request.state.user_role = None
            request.state.is_super_admin = False
            request.state.auth_method = None
            return await call_next(request)

        if path in AUTH_PUBLIC_PATHS and request.method == "POST":
            self._set_tenant(request, None)
            request.state.scopes = []
            request.state.api_key_id = None
            request.state.user_id = None
            request.state.user_role = None
            request.state.is_super_admin = False
            request.state.auth_method = None
            return await call_next(request)

        session_id = request.cookies.get(settings.session_cookie_name)
        if session_id:
            from neoguard.services.auth.sessions import get_session
            session_info = await get_session(session_id)
            if session_info:
                self._set_tenant(request, str(session_info.tenant_id))
                request.state.scopes = _role_to_scopes(session_info.role)
                request.state.api_key_id = None
                request.state.user_id = str(session_info.user_id)
                request.state.user_role = session_info.role
                request.state.is_super_admin = session_info.is_super_admin
                request.state.impersonated_by = session_info.impersonated_by
                request.state.auth_method = "session"

                if session_info.impersonated_by and request.method not in ("GET", "HEAD", "OPTIONS"):
                    if not path.endswith("/end-impersonation"):
                        return JSONResponse(
                            status_code=403,
                            content={
                                "error": "impersonation_read_only",
                                "message": "Write operations are blocked during impersonation",
                                "request_id": getattr(request.state, "request_id", None),
                            },
                        )

                return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        api_key_header = request.headers.get("X-API-Key", "")

        raw_key = ""
        if auth_header.startswith("Bearer "):
            raw_key = auth_header[7:]
        elif api_key_header:
            raw_key = api_key_header

        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "authentication_required",
                    "message": "Provide session cookie or API key via Authorization: Bearer <key>",
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        if settings.auth_bootstrap_token and raw_key == settings.auth_bootstrap_token:
            await log.awarn(
                "bootstrap_token_used",
                path=path,
                method=request.method,
                ip=request.client.host if request.client else "unknown",
            )
            self._set_tenant(request, settings.default_tenant_id)
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
            request.state.user_id = None
            request.state.user_role = None
            request.state.is_super_admin = False
            request.state.auth_method = "bootstrap"
            return await call_next(request)

        key_info = await validate_api_key(raw_key)
        if not key_info:
            return JSONResponse(
                status_code=401,
                content={
                    "error": "invalid_api_key",
                    "message": "API key is invalid, disabled, or expired",
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        self._set_tenant(request, key_info.tenant_id)
        request.state.scopes = key_info.scopes
        request.state.api_key_id = key_info.id
        request.state.user_id = None
        request.state.user_role = None
        request.state.is_super_admin = False
        request.state.rate_limit = key_info.rate_limit
        request.state.auth_method = "api_key"

        return await call_next(request)


def _role_to_scopes(role: str) -> list[str]:
    if role in ("owner", "admin"):
        return ["read", "write", "admin"]
    if role == "member":
        return ["read", "write"]
    return ["read"]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter per API key."""

    def __init__(self, app, default_rpm: int = 600):
        super().__init__(app)
        self._default_rpm = default_rpm
        self._windows: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            return await call_next(request)

        if not settings.auth_enabled:
            return await call_next(request)

        key_id = getattr(request.state, "api_key_id", None)
        if not key_id:
            return await call_next(request)

        rpm = getattr(request.state, "rate_limit", self._default_rpm)
        now = time.monotonic()
        window_start = now - 60.0

        timestamps = self._windows[key_id]
        timestamps[:] = [t for t in timestamps if t > window_start]

        if len(timestamps) >= rpm:
            await log.awarn("Rate limit exceeded", api_key_id=key_id, rpm=rpm)
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit of {rpm} requests/minute exceeded",
                    "request_id": getattr(request.state, "request_id", None),
                },
                headers={"Retry-After": "60"},
            )

        timestamps.append(now)
        return await call_next(request)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000

        if request.url.path not in EXEMPT_PATHS:
            await log.ainfo(
                "request",
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                duration_ms=round(duration_ms, 1),
                tenant_id=getattr(request.state, "tenant_id", None),
                user_id=str(getattr(request.state, "user_id", None)) if getattr(request.state, "user_id", None) else None,
                api_key_id=getattr(request.state, "api_key_id", None),
                auth_method=getattr(request.state, "auth_method", None),
            )

        return response
