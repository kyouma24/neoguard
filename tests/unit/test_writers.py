"""Unit tests for MetricBatchWriter and LogBatchWriter (no DB required)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg

from neoguard.models.logs import LogEntry, LogSeverity
from neoguard.models.metrics import MetricPoint, MetricType
from neoguard.services.logs.writer import LogBatchWriter
from neoguard.services.metrics.writer import MetricBatchWriter

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_pool_with_conn(mock_conn: AsyncMock | None = None) -> MagicMock:
    """Build a mock asyncpg pool whose acquire() yields a mock connection.

    pool.acquire() in asyncpg returns an async context manager (not a coroutine),
    so the pool itself must be a MagicMock so .acquire() is a regular call.
    """
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_pool = MagicMock()
    # pool.acquire() returns an async context manager directly (not awaited)
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    return mock_pool


def _sample_metric_points(n: int = 1) -> list[MetricPoint]:
    return [
        MetricPoint(
            name="cpu_usage",
            value=42.0 + i,
            tags={"host": "web-1"},
            metric_type=MetricType.GAUGE,
        )
        for i in range(n)
    ]


def _sample_log_entries(n: int = 1) -> list[LogEntry]:
    return [
        LogEntry(
            service="api-server",
            message=f"Test log message {i}",
            severity=LogSeverity.INFO,
        )
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# MetricBatchWriter
# ---------------------------------------------------------------------------


class TestMetricBatchWriter:
    """Tests for MetricBatchWriter buffer, flush, and error handling."""

    async def test_write_adds_to_buffer(self):
        """write() should add rows to the internal buffer."""
        writer = MetricBatchWriter()
        points = _sample_metric_points(2)

        with patch("neoguard.services.metrics.writer.settings") as mock_settings:
            mock_settings.metric_batch_size = 1000  # high threshold, no auto-flush
            count = await writer.write("default", points)

        assert count == 2
        assert writer.stats["buffer_size"] == 2

    async def test_stats_reflect_buffer_size(self):
        """stats property should report current buffer size."""
        writer = MetricBatchWriter()
        stats = writer.stats
        assert stats["buffer_size"] == 0
        assert stats["total_written"] == 0
        assert stats["total_dropped"] == 0
        assert stats["flush_count"] == 0
        assert stats["last_flush_duration_ms"] == 0.0

        with patch("neoguard.services.metrics.writer.settings") as mock_settings:
            mock_settings.metric_batch_size = 1000
            await writer.write("default", _sample_metric_points(3))

        assert writer.stats["buffer_size"] == 3

    @patch("neoguard.services.metrics.writer.log")
    @patch("neoguard.services.metrics.writer.get_pool", new_callable=AsyncMock)
    async def test_flush_writes_to_db(self, mock_get_pool, mock_log):
        """_flush() should COPY records to the metrics table and update total_written."""
        mock_conn = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_get_pool.return_value = mock_pool

        writer = MetricBatchWriter()
        # Manually fill the buffer (bypass write() to avoid auto-flush logic)
        now = datetime.now(UTC)
        writer._buffer = [
            (now, "default", "cpu_usage", '{"host":"web-1"}', 42.0, "gauge"),
            (now, "default", "cpu_usage", '{"host":"web-1"}', 43.0, "gauge"),
        ]

        await writer._flush()

        assert writer._total_written == 2
        assert writer.stats["buffer_size"] == 0
        mock_conn.copy_records_to_table.assert_awaited_once()
        call_kwargs = mock_conn.copy_records_to_table.call_args
        assert call_kwargs[0][0] == "metrics"
        assert len(call_kwargs[1]["records"]) == 2

    async def test_flush_empty_buffer_is_noop(self):
        """_flush() on an empty buffer should do nothing."""
        writer = MetricBatchWriter()
        # Should not raise and should not touch the DB
        await writer._flush()
        assert writer._total_written == 0
        assert writer._total_dropped == 0

    @patch("neoguard.services.metrics.writer.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.metrics.writer.log")
    @patch("neoguard.services.metrics.writer.get_pool", new_callable=AsyncMock)
    async def test_db_error_increments_total_dropped(self, mock_get_pool, mock_log, _mock_sleep):
        """When the DB raises, dropped counter should increase."""
        mock_log.aerror = AsyncMock()
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.copy_records_to_table.side_effect = asyncpg.PostgresError("connection lost")
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_get_pool.return_value = mock_pool

        writer = MetricBatchWriter()
        now = datetime.now(UTC)
        writer._buffer = [
            (now, "default", "cpu_usage", '{}', 1.0, "gauge"),
            (now, "default", "cpu_usage", '{}', 2.0, "gauge"),
            (now, "default", "cpu_usage", '{}', 3.0, "gauge"),
        ]

        await writer._flush()

        assert writer._total_dropped == 3
        assert writer._total_written == 0
        assert writer.stats["buffer_size"] == 0

    @patch("neoguard.services.metrics.writer.log")
    @patch("neoguard.services.metrics.writer.get_pool", new_callable=AsyncMock)
    @patch("neoguard.services.metrics.writer.settings")
    async def test_auto_flush_when_buffer_exceeds_batch_size(
        self, mock_settings, mock_get_pool, mock_log,
    ):
        """write() should auto-flush when buffer >= batch_size."""
        mock_settings.metric_batch_size = 3
        mock_conn = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_get_pool.return_value = mock_pool

        writer = MetricBatchWriter()
        points = _sample_metric_points(4)

        await writer.write("default", points)

        # Should have flushed: buffer was 4 >= 3
        assert writer._total_written == 4
        assert writer.stats["buffer_size"] == 0

    @patch("neoguard.services.metrics.writer.log")
    @patch("neoguard.services.metrics.writer.get_pool", new_callable=AsyncMock)
    @patch("neoguard.services.metrics.writer.settings")
    async def test_no_auto_flush_below_threshold(
        self, mock_settings, mock_get_pool, mock_log,
    ):
        """write() should NOT flush when buffer < batch_size."""
        mock_settings.metric_batch_size = 100
        writer = MetricBatchWriter()
        await writer.write("default", _sample_metric_points(2))

        assert writer.stats["buffer_size"] == 2
        assert writer._total_written == 0
        mock_get_pool.assert_not_awaited()

    @patch("neoguard.services.metrics.writer.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.metrics.writer.log")
    @patch("neoguard.services.metrics.writer.get_pool", new_callable=AsyncMock)
    async def test_os_error_increments_total_dropped(self, mock_get_pool, mock_log, _mock_sleep):
        """OSError during flush should also increment dropped counter."""
        mock_log.aerror = AsyncMock()
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.copy_records_to_table.side_effect = OSError("network unreachable")
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_get_pool.return_value = mock_pool

        writer = MetricBatchWriter()
        now = datetime.now(UTC)
        writer._buffer = [(now, "t", "m", '{}', 1.0, "gauge")]

        await writer._flush()

        assert writer._total_dropped == 1
        assert writer._total_written == 0


# ---------------------------------------------------------------------------
# LogBatchWriter
# ---------------------------------------------------------------------------


class TestLogBatchWriter:
    """Tests for LogBatchWriter buffer, flush, and error handling."""

    async def test_write_adds_to_buffer(self):
        """write() should add rows to the internal buffer."""
        writer = LogBatchWriter()
        entries = _sample_log_entries(2)

        with patch("neoguard.services.logs.writer.settings") as mock_settings:
            mock_settings.log_batch_size = 1000
            count = await writer.write("default", entries)

        assert count == 2
        assert writer.stats["buffer_size"] == 2

    async def test_stats_reflect_buffer_size(self):
        """stats property should report current buffer size."""
        writer = LogBatchWriter()
        stats = writer.stats
        assert stats["buffer_size"] == 0
        assert stats["total_written"] == 0
        assert stats["total_dropped"] == 0
        assert stats["flush_count"] == 0
        assert stats["last_flush_duration_ms"] == 0.0

        with patch("neoguard.services.logs.writer.settings") as mock_settings:
            mock_settings.log_batch_size = 1000
            await writer.write("default", _sample_log_entries(5))

        assert writer.stats["buffer_size"] == 5

    @patch("neoguard.services.logs.writer.log")
    @patch("neoguard.services.logs.writer.get_clickhouse", new_callable=AsyncMock)
    async def test_flush_writes_to_clickhouse(self, mock_get_ch, mock_log):
        """_flush() should insert records into ClickHouse and update total_written."""
        mock_client = AsyncMock()
        mock_get_ch.return_value = mock_client

        writer = LogBatchWriter()
        now = datetime.now(UTC)
        writer._buffer = [
            [now, "default", "", "", "info", "api-server", "msg1", {}, {}],
            [now, "default", "", "", "error", "api-server", "msg2", {}, {}],
        ]

        await writer._flush()

        assert writer._total_written == 2
        assert writer.stats["buffer_size"] == 0
        mock_client.insert.assert_awaited_once()
        call_args = mock_client.insert.call_args
        assert call_args[0][0] == "logs"
        assert len(call_args[0][1]) == 2
        assert call_args[1]["column_names"][0] == "timestamp"

    async def test_flush_empty_buffer_is_noop(self):
        """_flush() on an empty buffer should do nothing."""
        writer = LogBatchWriter()
        await writer._flush()
        assert writer._total_written == 0
        assert writer._total_dropped == 0

    @patch("neoguard.services.logs.writer.log")
    @patch("neoguard.services.logs.writer.get_clickhouse", new_callable=AsyncMock)
    async def test_db_error_increments_total_dropped(self, mock_get_ch, mock_log):
        """When ClickHouse raises, dropped counter should increase."""
        mock_log.aerror = AsyncMock()
        mock_client = AsyncMock()
        mock_client.insert.side_effect = Exception("clickhouse unavailable")
        mock_get_ch.return_value = mock_client

        writer = LogBatchWriter()
        now = datetime.now(UTC)
        writer._buffer = [
            [now, "default", "", "", "info", "svc", "msg", {}, {}],
            [now, "default", "", "", "info", "svc", "msg2", {}, {}],
        ]

        await writer._flush()

        assert writer._total_dropped == 2
        assert writer._total_written == 0
        assert writer.stats["buffer_size"] == 0

    @patch("neoguard.services.logs.writer.log")
    @patch("neoguard.services.logs.writer.get_clickhouse", new_callable=AsyncMock)
    @patch("neoguard.services.logs.writer.settings")
    async def test_auto_flush_when_buffer_exceeds_batch_size(
        self, mock_settings, mock_get_ch, mock_log,
    ):
        """write() should auto-flush when buffer >= batch_size."""
        mock_settings.log_batch_size = 3
        mock_client = AsyncMock()
        mock_get_ch.return_value = mock_client

        writer = LogBatchWriter()
        entries = _sample_log_entries(4)
        await writer.write("default", entries)

        assert writer._total_written == 4
        assert writer.stats["buffer_size"] == 0

    @patch("neoguard.services.logs.writer.log")
    @patch("neoguard.services.logs.writer.get_clickhouse", new_callable=AsyncMock)
    @patch("neoguard.services.logs.writer.settings")
    async def test_no_auto_flush_below_threshold(
        self, mock_settings, mock_get_ch, mock_log,
    ):
        """write() should NOT flush when buffer < batch_size."""
        mock_settings.log_batch_size = 100
        writer = LogBatchWriter()
        await writer.write("default", _sample_log_entries(2))

        assert writer.stats["buffer_size"] == 2
        assert writer._total_written == 0
        mock_get_ch.assert_not_awaited()

    @patch("neoguard.services.logs.writer.log")
    @patch("neoguard.services.logs.writer.get_clickhouse", new_callable=AsyncMock)
    async def test_multiple_flushes_accumulate_total_written(self, mock_get_ch, mock_log):
        """total_written should accumulate across multiple flushes."""
        mock_client = AsyncMock()
        mock_get_ch.return_value = mock_client

        writer = LogBatchWriter()
        now = datetime.now(UTC)

        writer._buffer = [[now, "t", "", "", "info", "s", "m1", {}, {}]]
        await writer._flush()

        writer._buffer = [[now, "t", "", "", "info", "s", "m2", {}, {}],
                          [now, "t", "", "", "info", "s", "m3", {}, {}]]
        await writer._flush()

        assert writer._total_written == 3
