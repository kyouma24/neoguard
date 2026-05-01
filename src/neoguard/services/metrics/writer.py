import asyncio
import contextlib
import time
from datetime import UTC, datetime

import asyncpg
import orjson

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.timescale.connection import get_pool
from neoguard.models.metrics import MetricPoint


class MetricBatchWriter:
    """Async batch writer that buffers metrics and flushes to TimescaleDB.

    Uses COPY for maximum insert throughput. Flushes when the buffer hits
    batch_size OR flush_interval elapses — whichever comes first.
    """

    def __init__(self) -> None:
        self._buffer: list[tuple[datetime, str, str, str, float, str]] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._running = False
        self._total_written = 0
        self._total_dropped = 0
        self._flush_count = 0
        self._last_flush_duration_ms: float = 0.0
        self._last_flush_at: float = 0.0

    async def start(self) -> None:
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        await log.ainfo("MetricBatchWriter started",
                        batch_size=settings.metric_batch_size,
                        flush_ms=settings.metric_flush_interval_ms)

    async def stop(self) -> None:
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task
        await self._flush()
        await log.ainfo("MetricBatchWriter stopped",
                        total_written=self._total_written,
                        total_dropped=self._total_dropped)

    async def write(self, tenant_id: str, points: list[MetricPoint]) -> int:
        now = datetime.now(UTC)
        rows = []
        for p in points:
            rows.append((
                p.timestamp or now,
                tenant_id,
                p.name,
                orjson.dumps(p.tags).decode(),
                p.value,
                p.metric_type.value,
            ))

        async with self._lock:
            self._buffer.extend(rows)
            buf_len = len(self._buffer)

        if buf_len >= settings.metric_batch_size:
            await self._flush()

        return len(rows)

    async def _flush_loop(self) -> None:
        interval = settings.metric_flush_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            await self._flush()

    async def _flush(self) -> None:
        async with self._lock:
            if not self._buffer:
                return
            batch = self._buffer
            self._buffer = []

        flush_start = time.monotonic()
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.copy_records_to_table(
                    "metrics",
                    records=batch,
                    columns=["time", "tenant_id", "name", "tags", "value", "metric_type"],
                )
            self._total_written += len(batch)
        except (asyncpg.PostgresError, OSError) as e:
            self._total_dropped += len(batch)
            await log.aerror("Metric flush failed", error=str(e), dropped=len(batch))
        finally:
            self._flush_count += 1
            self._last_flush_duration_ms = (time.monotonic() - flush_start) * 1000
            self._last_flush_at = time.monotonic()

    @property
    def stats(self) -> dict:
        return {
            "buffer_size": len(self._buffer),
            "total_written": self._total_written,
            "total_dropped": self._total_dropped,
            "flush_count": self._flush_count,
            "last_flush_duration_ms": round(self._last_flush_duration_ms, 2),
            "last_flush_at": self._last_flush_at,
        }


metric_writer = MetricBatchWriter()
