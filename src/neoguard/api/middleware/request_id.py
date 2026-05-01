"""Request correlation ID middleware."""

import re
import time

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from ulid import ULID

from neoguard.core.telemetry import registry

_ULID_OR_UUID = re.compile(
    r"[0-9A-Za-z]{26}"
    r"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)

SKIP_PATHS = {"/health", "/docs", "/redoc", "/openapi.json", "/favicon.ico"}


def _normalize_path(path: str) -> str:
    return _ULID_OR_UUID.sub("{id}", path)


def _status_class(code: int) -> str:
    return f"{code // 100}xx"


class RequestIDMiddleware(BaseHTTPMiddleware):

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("X-Request-ID", "").strip()
        request_id = incoming if 0 < len(incoming) <= 128 else str(ULID())
        request.state.request_id = request_id

        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.monotonic()
        try:
            response = await call_next(request)
        finally:
            duration_ms = (time.monotonic() - start) * 1000
            structlog.contextvars.unbind_contextvars("request_id")

        response.headers["X-Request-ID"] = request_id

        path = request.url.path
        if path not in SKIP_PATHS:
            method = request.method
            pattern = _normalize_path(path)
            sc = _status_class(response.status_code)

            registry.counter(
                "neoguard.api.request.count",
                {"method": method, "path_pattern": pattern, "status_class": sc},
            ).inc()

            if response.status_code >= 500:
                registry.counter(
                    "neoguard.api.request.errors",
                    {"method": method, "path_pattern": pattern},
                ).inc()

            registry.histogram(
                "neoguard.api.request.latency_ms",
                {"method": method, "path_pattern": pattern},
            ).observe(duration_ms)

        return response
