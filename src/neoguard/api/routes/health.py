import os
import time

import psutil
from fastapi import APIRouter

from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.db.timescale.connection import get_pool
from neoguard.services.alerts.engine import alert_engine
from neoguard.services.collection.orchestrator import orchestrator
from neoguard.services.logs.writer import log_writer
from neoguard.services.metrics.writer import metric_writer

router = APIRouter(tags=["health"])

_start_time = time.monotonic()
_process = psutil.Process(os.getpid())


@router.get("/health")
async def health() -> dict:
    checks = {}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["timescaledb"] = "ok"
    except Exception as e:
        checks["timescaledb"] = f"error: {e}"

    try:
        client = await get_clickhouse()
        await client.query("SELECT 1")
        checks["clickhouse"] = "ok"
    except Exception as e:
        checks["clickhouse"] = f"error: {e}"

    pool_stats = {}
    try:
        pool = await get_pool()
        size = pool.get_size()
        idle = pool.get_idle_size()
        active = size - idle
        max_size = pool.get_max_size()
        pool_stats = {
            "size": size,
            "idle": idle,
            "active": active,
            "min": pool.get_min_size(),
            "max": max_size,
            "utilization": round(active / max_size * 100, 1) if max_size else 0,
        }
    except Exception:
        pass

    orch_stats = orchestrator.stats
    engine_stats = alert_engine.stats

    degraded_reasons: list[str] = []
    if any(v != "ok" for v in checks.values()):
        degraded_reasons.append("database_connectivity")
    if orch_stats["discovery"]["consecutive_errors"] >= 3:
        degraded_reasons.append("discovery_consecutive_errors")
    if orch_stats["metrics_collection"]["consecutive_errors"] >= 3:
        degraded_reasons.append("metrics_collection_consecutive_errors")
    if engine_stats["eval"]["consecutive_errors"] >= 3:
        degraded_reasons.append("alert_engine_consecutive_errors")

    process_info: dict = {}
    try:
        with _process.oneshot():
            mem = _process.memory_info()
            process_info = {
                "cpu_percent": _process.cpu_percent(),
                "memory_rss_mb": round(mem.rss / 1024 / 1024, 1),
                "uptime_seconds": round(time.monotonic() - _start_time, 1),
                "thread_count": _process.num_threads(),
            }
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    status = "healthy" if not degraded_reasons else "degraded"

    return {
        "status": status,
        "degraded_reasons": degraded_reasons,
        "checks": checks,
        "pool": pool_stats,
        "writers": {
            "metrics": metric_writer.stats,
            "logs": log_writer.stats,
        },
        "background_tasks": {
            "orchestrator": orch_stats,
            "alert_engine": engine_stats,
        },
        "process": process_info,
    }
