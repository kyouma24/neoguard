"""System stats endpoint — real-time snapshot of platform internals."""

import os
import time

import psutil
from fastapi import APIRouter, Depends

from neoguard.api.deps import get_tenant_id, require_scope
from neoguard.core.telemetry import registry
from neoguard.db.timescale.connection import get_pool
from neoguard.services.alerts.engine import alert_engine
from neoguard.services.collection.orchestrator import orchestrator
from neoguard.services.logs.writer import log_writer
from neoguard.services.metrics.writer import metric_writer

router = APIRouter(prefix="/api/v1/system", tags=["system"])

_start_time = time.monotonic()
_process = psutil.Process(os.getpid())


@router.get("/stats", dependencies=[Depends(require_scope("admin"))])
async def system_stats(
    _tenant_id: str = Depends(get_tenant_id),
) -> dict:
    pool = await get_pool()
    pool_size = pool.get_size()
    pool_idle = pool.get_idle_size()
    pool_active = pool_size - pool_idle
    pool_max = pool.get_max_size()

    process_info: dict = {}
    try:
        with _process.oneshot():
            mem = _process.memory_info()
            process_info = {
                "cpu_percent": _process.cpu_percent(),
                "memory_rss_mb": round(mem.rss / 1024 / 1024, 1),
                "memory_vms_mb": round(mem.vms / 1024 / 1024, 1),
                "uptime_seconds": round(time.monotonic() - _start_time, 1),
                "thread_count": _process.num_threads(),
            }
            try:
                process_info["open_fds"] = _process.num_fds()
            except AttributeError:
                process_info["open_fds"] = _process.num_handles()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass

    api_snap = registry.snapshot()
    api_summary: dict = {"endpoints": []}
    for h in api_snap["histograms"]:
        if h["name"] == "neoguard.api.request.latency_ms" and h["count"] > 0:
            pcts = h["percentiles"]
            api_summary["endpoints"].append({
                "method": h["tags"].get("method"),
                "path_pattern": h["tags"].get("path_pattern"),
                "request_count": h["count"],
                "latency_p50": round(pcts[0.5], 2),
                "latency_p95": round(pcts[0.95], 2),
                "latency_p99": round(pcts[0.99], 2),
            })

    total_requests = sum(
        c["value"] for c in api_snap["counters"]
        if c["name"] == "neoguard.api.request.count"
    )
    total_errors = sum(
        c["value"] for c in api_snap["counters"]
        if c["name"] == "neoguard.api.request.errors"
    )
    api_summary["total_requests"] = total_requests
    api_summary["total_errors"] = total_errors

    return {
        "api": api_summary,
        "database": {
            "pool_size": pool_size,
            "pool_idle": pool_idle,
            "pool_active": pool_active,
            "pool_max": pool_max,
            "pool_utilization": round(pool_active / pool_max * 100, 1) if pool_max else 0,
        },
        "writers": {
            "metrics": metric_writer.stats,
            "logs": log_writer.stats,
        },
        "background_tasks": {
            "orchestrator": orchestrator.stats,
            "alert_engine": alert_engine.stats,
        },
        "process": process_info,
    }
