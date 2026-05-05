from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from neoguard.api.middleware.auth import (
    AuthMiddleware,
    RateLimitMiddleware,
    RequestLoggingMiddleware,
)
from neoguard.api.middleware.csrf import CSRFMiddleware
from neoguard.api.middleware.request_id import RequestIDMiddleware
from neoguard.api.routes import (
    admin,
    alerts,
    annotations,
    auth,
    aws_accounts,
    azure_accounts,
    collection,
    dashboards,
    health,
    logs,
    metadata,
    metrics,
    mql,
    notifications,
    onboarding,
    resources,
    sse,
    system,
    tenants,
    user_auth,
)
from neoguard.core.config import settings
from neoguard.core.logging import log, setup_logging
from neoguard.db.clickhouse.connection import close_clickhouse, init_clickhouse
from neoguard.db.redis.connection import close_redis, init_redis
from neoguard.db.timescale.connection import close_pool, init_pool
from neoguard.services.alerts.engine import alert_engine
from neoguard.services.collection.orchestrator import orchestrator
from neoguard.services.logs.writer import log_writer
from neoguard.services.metrics.writer import metric_writer
from neoguard.services.telemetry.collector import telemetry_collector


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(debug=settings.debug)

    await init_pool()
    await init_clickhouse()
    await init_redis()

    await metric_writer.start()
    await log_writer.start()
    await alert_engine.start()
    await orchestrator.start()
    await telemetry_collector.start()

    yield

    await telemetry_collector.stop()
    await orchestrator.stop()
    await alert_engine.stop()
    await log_writer.stop()
    await metric_writer.stop()

    await close_redis()
    await close_clickhouse()
    await close_pool()


app = FastAPI(
    title="NeoGuard",
    description="Production-grade monitoring platform",
    version="0.1.0",
    lifespan=lifespan,
)


def _error_envelope(
    code: str,
    message: str,
    correlation_id: str | None,
    details: dict | list | None = None,
) -> dict:
    body: dict = {"error": {"code": code, "message": message, "correlation_id": correlation_id}}
    if details is not None:
        body["error"]["details"] = details
    return body


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    correlation_id = getattr(request.state, "request_id", None)
    code = _status_to_code(exc.status_code)
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_envelope(code, message, correlation_id),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    correlation_id = getattr(request.state, "request_id", None)
    details = [
        {"field": ".".join(str(loc) for loc in e["loc"]), "message": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=_error_envelope("VALIDATION_ERROR", "Request validation failed", correlation_id, details),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    correlation_id = getattr(request.state, "request_id", None)
    await log.aerror(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        error_type=type(exc).__name__,
        request_id=correlation_id,
    )
    return JSONResponse(
        status_code=500,
        content=_error_envelope("INTERNAL_ERROR", "An unexpected error occurred", correlation_id),
    )


def _status_to_code(status: int) -> str:
    return {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "RATE_LIMITED",
    }.get(status, f"HTTP_{status}")


app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"],
)

app.include_router(health.router)
app.include_router(user_auth.router)
app.include_router(auth.router)
app.include_router(metrics.router)
app.include_router(metadata.router)
app.include_router(mql.router)
app.include_router(sse.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(dashboards.router)
app.include_router(annotations.router)
app.include_router(resources.router)
app.include_router(aws_accounts.router)
app.include_router(azure_accounts.router)
app.include_router(notifications.router)
app.include_router(collection.router)
app.include_router(system.router)
app.include_router(tenants.router)
app.include_router(onboarding.router)
app.include_router(admin.router)
