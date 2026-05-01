"""Authentication and rate-limiting middleware."""

import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.services.auth.api_keys import validate_api_key

EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}

EXEMPT_PREFIXES: tuple[str, ...] = ()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if path in EXEMPT_PATHS or any(path.startswith(p) for p in EXEMPT_PREFIXES):
            request.state.tenant_id = settings.default_tenant_id
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
            return await call_next(request)

        if not settings.auth_enabled:
            request.state.tenant_id = settings.default_tenant_id
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
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
                    "error": "missing_api_key",
                    "message": "Provide API key via Authorization: Bearer <key> or X-API-Key",
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        if settings.auth_bootstrap_token and raw_key == settings.auth_bootstrap_token:
            request.state.tenant_id = settings.default_tenant_id
            request.state.scopes = ["admin"]
            request.state.api_key_id = None
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

        request.state.tenant_id = key_info.tenant_id
        request.state.scopes = key_info.scopes
        request.state.api_key_id = key_info.id
        request.state.rate_limit = key_info.rate_limit

        return await call_next(request)


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
                api_key_id=getattr(request.state, "api_key_id", None),
            )

        return response
