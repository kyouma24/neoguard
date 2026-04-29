from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from neoguard.api.routes import alerts, dashboards, health, logs, metrics
from neoguard.core.config import settings
from neoguard.core.logging import setup_logging
from neoguard.db.clickhouse.connection import close_clickhouse, init_clickhouse
from neoguard.db.timescale.connection import close_pool, init_pool
from neoguard.services.alerts.engine import alert_engine
from neoguard.services.logs.writer import log_writer
from neoguard.services.metrics.writer import metric_writer


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(debug=settings.debug)

    await init_pool()
    await init_clickhouse()

    await metric_writer.start()
    await log_writer.start()
    await alert_engine.start()

    yield

    await alert_engine.stop()
    await log_writer.stop()
    await metric_writer.stop()

    await close_clickhouse()
    await close_pool()


app = FastAPI(
    title="NeoGuard",
    description="Production-grade monitoring platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(dashboards.router)
