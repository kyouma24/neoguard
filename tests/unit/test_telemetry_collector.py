"""Tests for the self-monitoring telemetry collector."""

from unittest.mock import AsyncMock, MagicMock, patch

from neoguard.services.telemetry.collector import TelemetryCollector


def _mock_pool():
    pool = MagicMock()
    pool.get_size.return_value = 10
    pool.get_idle_size.return_value = 7
    pool.get_min_size.return_value = 5
    pool.get_max_size.return_value = 20
    return pool


def _mock_writer_stats(buffer=0, written=1000, dropped=0, flush_count=50, flush_ms=1.5, flush_at=0.0):
    return {
        "buffer_size": buffer,
        "total_written": written,
        "total_dropped": dropped,
        "flush_count": flush_count,
        "last_flush_duration_ms": flush_ms,
        "last_flush_at": flush_at,
    }


def _mock_orch_stats():
    return {
        "running": True,
        "discovery": {
            "last_run_at": 1714470000.0,
            "last_duration_ms": 5200.0,
            "success_count": 10,
            "failure_count": 1,
            "consecutive_errors": 0,
        },
        "metrics_collection": {
            "last_run_at": 1714470050.0,
            "last_duration_ms": 1200.0,
            "success_count": 50,
            "failure_count": 0,
            "consecutive_errors": 0,
        },
    }


def _mock_engine_stats():
    return {
        "running": True,
        "eval": {
            "last_run_at": 1714470060.0,
            "last_duration_ms": 45.0,
            "success_count": 200,
            "failure_count": 0,
            "consecutive_errors": 0,
        },
        "rules_evaluated": 600,
        "active_rules": 3,
        "state_transitions": 5,
        "notifications_sent": 2,
        "notifications_failed": 0,
    }


class TestTelemetryCollector:
    async def test_collect_produces_pool_metrics(self):
        collector = TelemetryCollector(interval=60)
        pool = _mock_pool()

        points = collector._collect_pool(pool)
        names = {p.name for p in points}
        assert "neoguard.db.pool.size" in names
        assert "neoguard.db.pool.idle" in names
        assert "neoguard.db.pool.active" in names
        assert "neoguard.db.pool.utilization" in names

        size_point = next(p for p in points if p.name == "neoguard.db.pool.size")
        assert size_point.value == 10.0
        active_point = next(p for p in points if p.name == "neoguard.db.pool.active")
        assert active_point.value == 3.0
        util_point = next(p for p in points if p.name == "neoguard.db.pool.utilization")
        assert util_point.value == 15.0

    async def test_collect_produces_writer_metrics(self):
        collector = TelemetryCollector(interval=60)
        metric_stats = _mock_writer_stats(buffer=42, written=5000, dropped=3)
        log_stats = _mock_writer_stats(buffer=10, written=2000, dropped=0)

        points = collector._collect_writers(metric_stats, log_stats)
        names = [p.name for p in points]
        assert names.count("neoguard.writer.buffer_size") == 2
        assert names.count("neoguard.writer.total_written") == 2
        assert names.count("neoguard.writer.flush_count") == 2

        metric_buffer = next(
            p for p in points
            if p.name == "neoguard.writer.buffer_size" and p.tags.get("writer") == "metrics"
        )
        assert metric_buffer.value == 42.0

    async def test_collect_produces_background_task_metrics(self):
        collector = TelemetryCollector(interval=60)
        points = collector._collect_background_tasks(_mock_orch_stats(), _mock_engine_stats())
        names = {p.name for p in points}
        assert "neoguard.task.last_run_epoch" in names
        assert "neoguard.task.run_duration_ms" in names
        assert "neoguard.task.success_count" in names
        assert "neoguard.task.failure_count" in names
        assert "neoguard.task.consecutive_errors" in names
        assert "neoguard.alerts.rules_evaluated" in names
        assert "neoguard.alerts.notifications_sent" in names

    async def test_collect_produces_process_metrics(self):
        collector = TelemetryCollector(interval=60)
        points = collector._collect_process()
        names = {p.name for p in points}
        assert "neoguard.process.cpu_percent" in names
        assert "neoguard.process.memory_rss_bytes" in names
        assert "neoguard.process.uptime_seconds" in names
        assert "neoguard.process.thread_count" in names

    async def test_all_metrics_have_service_tag(self):
        collector = TelemetryCollector(interval=60)
        pool = _mock_pool()

        all_points = []
        all_points.extend(collector._collect_pool(pool))
        all_points.extend(collector._collect_writers(
            _mock_writer_stats(), _mock_writer_stats()
        ))
        all_points.extend(collector._collect_background_tasks(
            _mock_orch_stats(), _mock_engine_stats()
        ))
        all_points.extend(collector._collect_process())

        for p in all_points:
            assert p.tags.get("service") == "neoguard", f"{p.name} missing service tag"

    async def test_all_metric_names_prefixed(self):
        collector = TelemetryCollector(interval=60)
        pool = _mock_pool()

        all_points = []
        all_points.extend(collector._collect_pool(pool))
        all_points.extend(collector._collect_writers(
            _mock_writer_stats(), _mock_writer_stats()
        ))
        all_points.extend(collector._collect_background_tasks(
            _mock_orch_stats(), _mock_engine_stats()
        ))
        all_points.extend(collector._collect_process())

        for p in all_points:
            assert p.name.startswith("neoguard."), f"{p.name} not prefixed"

    @patch("neoguard.services.alerts.engine.alert_engine")
    @patch("neoguard.services.collection.orchestrator.orchestrator")
    @patch("neoguard.services.logs.writer.log_writer")
    @patch("neoguard.services.metrics.writer.metric_writer")
    @patch("neoguard.db.timescale.connection.get_pool", new_callable=AsyncMock)
    async def test_collect_writes_to_metric_writer(
        self, mock_get_pool, mock_metric_w, mock_log_w, mock_orch, mock_engine,
    ):
        mock_get_pool.return_value = _mock_pool()
        mock_metric_w.stats = _mock_writer_stats()
        mock_metric_w.write = AsyncMock(return_value=0)
        mock_log_w.stats = _mock_writer_stats()
        mock_orch.stats = _mock_orch_stats()
        mock_engine.stats = _mock_engine_stats()

        collector = TelemetryCollector(interval=60)
        await collector._collect()

        mock_metric_w.write.assert_called_once()
        args = mock_metric_w.write.call_args
        tenant_id = args[0][0]
        points = args[0][1]
        assert tenant_id == "default"
        assert len(points) > 20
