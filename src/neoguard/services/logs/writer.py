import asyncio
import contextlib
from datetime import UTC, datetime

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.models.logs import LogEntry


class LogBatchWriter:
    """Async batch writer that buffers log entries and flushes to ClickHouse."""

    def __init__(self) -> None:
        self._buffer: list[list] = []
        self._lock = asyncio.Lock()
        self._flush_task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._running = False
        self._total_written = 0
        self._total_dropped = 0

    async def start(self) -> None:
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        await log.ainfo("LogBatchWriter started",
                        batch_size=settings.log_batch_size,
                        flush_ms=settings.log_flush_interval_ms)

    async def stop(self) -> None:
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._flush_task
        await self._flush()
        await log.ainfo("LogBatchWriter stopped",
                        total_written=self._total_written,
                        total_dropped=self._total_dropped)

    async def write(self, tenant_id: str, entries: list[LogEntry]) -> int:
        now = datetime.now(UTC)
        rows = []
        for e in entries:
            rows.append([
                e.timestamp or now,
                tenant_id,
                e.trace_id,
                e.span_id,
                e.severity.value,
                e.service,
                e.message,
                e.attributes,
                e.resource,
            ])

        async with self._lock:
            self._buffer.extend(rows)
            buf_len = len(self._buffer)

        if buf_len >= settings.log_batch_size:
            await self._flush()

        return len(rows)

    async def _flush_loop(self) -> None:
        interval = settings.log_flush_interval_ms / 1000.0
        while self._running:
            await asyncio.sleep(interval)
            await self._flush()

    async def _flush(self) -> None:
        async with self._lock:
            if not self._buffer:
                return
            batch = self._buffer
            self._buffer = []

        try:
            client = await get_clickhouse()
            await client.insert(
                "logs",
                batch,
                column_names=[
                    "timestamp", "tenant_id", "trace_id", "span_id",
                    "severity", "service", "message", "attributes", "resource",
                ],
            )
            self._total_written += len(batch)
        except Exception as e:
            self._total_dropped += len(batch)
            await log.aerror("Log flush failed", error=str(e), dropped=len(batch))

    @property
    def stats(self) -> dict:
        return {
            "buffer_size": len(self._buffer),
            "total_written": self._total_written,
            "total_dropped": self._total_dropped,
        }


log_writer = LogBatchWriter()
