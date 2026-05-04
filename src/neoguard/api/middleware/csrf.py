"""CSRF protection via double-submit cookie pattern.

On login/signup, a CSRF token is set as a non-httponly cookie. The frontend
reads this cookie and sends it back as an X-CSRF-Token header on mutating
requests. The middleware validates that the header matches the cookie.

Session-less auth (API keys) and safe HTTP methods are exempt.
"""

from __future__ import annotations

import secrets

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from neoguard.core.config import settings

CSRF_COOKIE_NAME = "neoguard_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TOKEN_LENGTH = 32
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_EXEMPT_PATHS = {
    "/auth/signup",
    "/auth/login",
    "/auth/logout",
    "/auth/password-reset/request",
    "/auth/password-reset/confirm",
}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS:
            return await call_next(request)

        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        if not settings.auth_enabled:
            return await call_next(request)

        session_cookie = request.cookies.get(settings.session_cookie_name)
        if not session_cookie:
            return await call_next(request)

        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)

        if not csrf_cookie or not csrf_header:
            return JSONResponse(
                status_code=403,
                content={
                    "error": "csrf_validation_failed",
                    "message": "Missing CSRF token",
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        if not secrets.compare_digest(csrf_cookie, csrf_header):
            return JSONResponse(
                status_code=403,
                content={
                    "error": "csrf_validation_failed",
                    "message": "CSRF token mismatch",
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        return await call_next(request)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)
