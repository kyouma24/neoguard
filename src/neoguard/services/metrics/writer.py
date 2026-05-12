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

    Retry semantics (COLL-004): on flush failure, retries up to max_retries
    with exponential backoff. ACK-lost scenario: COPY may succeed server-side
    while client sees failure — retry can create duplicate rows. COUNT/SUM
    aggregations may over-count by ~0.1% under network failures. P2: add
    batch_request_id column + ON CONFLICT for exactly-once semantics.
    """

    def __init__(self) -> None:
        self._buffer: list[tuple[datetime, str, str, str, float, str]] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._running = False
        self._total_written = 0
        self._total_dropped = 0
        self._total_rejected = 0
        self._flush_count = 0
        self._flush_retries_total = 0
        self._flush_retries_exhausted = 0
        self._flush_retry_in_progress = False
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
        # Backpressure: reject writes only when flush is actively failing AND buffer is full
        if (self._flush_retry_in_progress
                and len(self._buffer) >= settings.metric_buffer_max_size):
            self._total_rejected += len(points)
            return 0

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
        max_retries = settings.metric_flush_max_retries
        base_delay = settings.metric_flush_retry_base_sec

        try:
            for attempt in range(max_retries):
                try:
                    pool = await get_pool()
                    async with pool.acquire() as conn:
                        await conn.copy_records_to_table(
                            "metrics",
                            records=batch,
                            columns=["time", "tenant_id", "name", "tags", "value", "metric_type"],
                        )
                    self._total_written += len(batch)
                    break
                except (asyncpg.PostgresError, asyncpg.InterfaceError, OSError) as e:
                    if attempt < max_retries - 1:
                        self._flush_retries_total += 1
                        self._flush_retry_in_progress = True
                        delay = base_delay * (2 ** attempt)
                        await log.awarn("Metric flush retry",
                                       attempt=attempt + 1, delay=delay, error=str(e))
                        await asyncio.sleep(delay)
                    else:
                        self._flush_retries_total += 1
                        self._flush_retries_exhausted += 1
                        self._total_dropped += len(batch)
                        await log.aerror("Metric flush failed after retries",
                                        attempts=max_retries, error=str(e), dropped=len(batch))
        finally:
            self._flush_retry_in_progress = False
            self._flush_count += 1
            self._last_flush_duration_ms = (time.monotonic() - flush_start) * 1000
            self._last_flush_at = time.monotonic()

    @property
    def stats(self) -> dict:
        return {
            "buffer_size": len(self._buffer),
            "total_written": self._total_written,
            "total_dropped": self._total_dropped,
            "total_rejected": self._total_rejected,
            "flush_count": self._flush_count,
            "flush_retries_total": self._flush_retries_total,
            "flush_retries_exhausted": self._flush_retries_exhausted,
            "flush_retry_in_progress": self._flush_retry_in_progress,
            "last_flush_duration_ms": round(self._last_flush_duration_ms, 2),
            "last_flush_at": self._last_flush_at,
        }


metric_writer = MetricBatchWriter()
