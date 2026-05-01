from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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
    auth,
    aws_accounts,
    azure_accounts,
    collection,
    dashboards,
    health,
    logs,
    metrics,
    notifications,
    resources,
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    await log.aerror(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        error_type=type(exc).__name__,
        request_id=request_id,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred",
            "request_id": request_id,
        },
    )


app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(user_auth.router)
app.include_router(auth.router)
app.include_router(metrics.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(dashboards.router)
app.include_router(resources.router)
app.include_router(aws_accounts.router)
app.include_router(azure_accounts.router)
app.include_router(notifications.router)
app.include_router(collection.router)
app.include_router(system.router)
app.include_router(tenants.router)
app.include_router(admin.router)
