"""Self-monitoring telemetry collector.

Periodically reads metrics from internal subsystems (DB pool, writers,
background tasks, process info, API registry) and writes them into the
normal metrics pipeline as neoguard.* metrics — dogfooding.
"""

import asyncio
import contextlib
import os
import time
from datetime import UTC, datetime

import psutil

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.core.telemetry import registry
from neoguard.models.metrics import MetricPoint, MetricType

_process = psutil.Process(os.getpid())
_start_time = time.monotonic()

SERVICE_TAG = "neoguard"


def _point(name: str, value: float, extra_tags: dict[str, str] | None = None) -> MetricPoint:
    tags = {"service": SERVICE_TAG}
    if extra_tags:
        tags.update(extra_tags)
    return MetricPoint(
        name=name,
        value=value,
        timestamp=datetime.now(UTC),
        tags=tags,
        metric_type=MetricType.GAUGE,
    )


def _counter_point(name: str, value: float, extra_tags: dict[str, str] | None = None) -> MetricPoint:
    tags = {"service": SERVICE_TAG}
    if extra_tags:
        tags.update(extra_tags)
    return MetricPoint(
        name=name,
        value=value,
        timestamp=datetime.now(UTC),
        tags=tags,
        metric_type=MetricType.COUNTER,
    )


class TelemetryCollector:

    def __init__(self, interval: float | None = None) -> None:
        self._interval = interval or settings.telemetry_interval_sec
        self._task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        if not settings.telemetry_enabled:
            await log.ainfo("Telemetry collector disabled")
            return
        self._running = True
        self._task = asyncio.create_task(self._collect_loop())
        await log.ainfo("TelemetryCollector started", interval=self._interval)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        await log.ainfo("TelemetryCollector stopped")

    async def _collect_loop(self) -> None:
        await asyncio.sleep(self._interval)
        while self._running:
            try:
                await self._collect()
            except Exception as e:
                await log.aerror("Telemetry collection failed", error=str(e))
            await asyncio.sleep(self._interval)

    async def _collect(self) -> None:
        from neoguard.db.timescale.connection import get_pool
        from neoguard.services.alerts.engine import alert_engine
        from neoguard.services.collection.orchestrator import orchestrator
        from neoguard.services.logs.writer import log_writer
        from neoguard.services.metrics.writer import metric_writer

        points: list[MetricPoint] = []

        points.extend(self._collect_pool(await get_pool()))
        points.extend(self._collect_writers(metric_writer.stats, log_writer.stats))
        points.extend(self._collect_background_tasks(orchestrator.stats, alert_engine.stats))
        points.extend(self._collect_process())
        points.extend(self._collect_api_metrics())

        if points:
            await metric_writer.write(settings.default_tenant_id, points)

    def _collect_pool(self, pool) -> list[MetricPoint]:
        size = pool.get_size()
        idle = pool.get_idle_size()
        active = size - idle
        max_size = pool.get_max_size()
        utilization = (active / max_size * 100) if max_size > 0 else 0.0
        return [
            _point("neoguard.db.pool.size", float(size)),
            _point("neoguard.db.pool.idle", float(idle)),
            _point("neoguard.db.pool.active", float(active)),
            _point("neoguard.db.pool.utilization", round(utilization, 1)),
        ]

    def _collect_writers(self, metric_stats: dict, log_stats: dict) -> list[MetricPoint]:
        points: list[MetricPoint] = []
        for writer_name, stats in [("metrics", metric_stats), ("logs", log_stats)]:
            t = {"writer": writer_name}
            points.append(_point("neoguard.writer.buffer_size", float(stats["buffer_size"]), t))
            points.append(_counter_point("neoguard.writer.total_written", float(stats["total_written"]), t))
            points.append(_counter_point("neoguard.writer.total_dropped", float(stats["total_dropped"]), t))
            points.append(_counter_point("neoguard.writer.flush_count", float(stats["flush_count"]), t))
            points.append(_point("neoguard.writer.flush_duration_ms", stats["last_flush_duration_ms"], t))
        return points

    def _collect_background_tasks(self, orch_stats: dict, engine_stats: dict) -> list[MetricPoint]:
        points: list[MetricPoint] = []

        task_map = {
            "discovery": orch_stats["discovery"],
            "metrics_collection": orch_stats["metrics_collection"],
            "alert_eval": engine_stats["eval"],
        }
        for task_name, s in task_map.items():
            t = {"task": task_name}
            points.append(_point("neoguard.task.last_run_epoch", s["last_run_at"], t))
            points.append(_point("neoguard.task.run_duration_ms", s["last_duration_ms"], t))
            points.append(_counter_point("neoguard.task.success_count", float(s["success_count"]), t))
            points.append(_counter_point("neoguard.task.failure_count", float(s["failure_count"]), t))
            points.append(_point("neoguard.task.consecutive_errors", float(s["consecutive_errors"]), t))

        points.append(_counter_point("neoguard.alerts.rules_evaluated", float(engine_stats["rules_evaluated"])))
        points.append(_counter_point("neoguard.alerts.state_transitions", float(engine_stats["state_transitions"])))
        points.append(_counter_point("neoguard.alerts.notifications_sent", float(engine_stats["notifications_sent"])))
        notif_failed = float(engine_stats["notifications_failed"])
        points.append(_counter_point("neoguard.alerts.notifications_failed", notif_failed))

        return points

    def _collect_process(self) -> list[MetricPoint]:
        points: list[MetricPoint] = []
        try:
            with _process.oneshot():
                points.append(_point("neoguard.process.cpu_percent", _process.cpu_percent()))
                mem = _process.memory_info()
                points.append(_point("neoguard.process.memory_rss_bytes", float(mem.rss)))
                points.append(_point("neoguard.process.memory_vms_bytes", float(mem.vms)))
                points.append(_point("neoguard.process.uptime_seconds", round(time.monotonic() - _start_time, 1)))
                points.append(_point("neoguard.process.thread_count", float(_process.num_threads())))
                try:
                    fds = _process.num_fds()
                except AttributeError:
                    fds = _process.num_handles()
                points.append(_point("neoguard.process.open_fds", float(fds)))
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        return points

    def _collect_api_metrics(self) -> list[MetricPoint]:
        points: list[MetricPoint] = []
        snap = registry.snapshot()

        for c in snap["counters"]:
            if c["name"].startswith("neoguard.api."):
                points.append(_counter_point(c["name"], c["value"], c["tags"]))

        for h in snap["histograms"]:
            if h["name"] == "neoguard.api.request.latency_ms" and h["count"] > 0:
                tags = h["tags"]
                pcts = h["percentiles"]
                points.append(_point("neoguard.api.request.latency_p50", round(pcts[0.5], 2), tags))
                points.append(_point("neoguard.api.request.latency_p95", round(pcts[0.95], 2), tags))
                points.append(_point("neoguard.api.request.latency_p99", round(pcts[0.99], 2), tags))

        return points


telemetry_collector = TelemetryCollector()
