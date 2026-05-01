"""Tests for the /api/v1/system/stats endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.system import router


def _mock_pool():
    pool = MagicMock()
    pool.get_size.return_value = 8
    pool.get_idle_size.return_value = 5
    pool.get_min_size.return_value = 5
    pool.get_max_size.return_value = 20
    return pool


def _mock_orch_stats():
    return {
        "running": True,
        "discovery": {
            "last_run_at": 0.0,
            "last_duration_ms": 0.0,
            "success_count": 0,
            "failure_count": 0,
            "consecutive_errors": 0,
        },
        "metrics_collection": {
            "last_run_at": 0.0,
            "last_duration_ms": 0.0,
            "success_count": 0,
            "failure_count": 0,
            "consecutive_errors": 0,
        },
    }


def _mock_engine_stats():
    return {
        "running": True,
        "eval": {
            "last_run_at": 0.0,
            "last_duration_ms": 0.0,
            "success_count": 0,
            "failure_count": 0,
            "consecutive_errors": 0,
        },
        "rules_evaluated": 0,
        "active_rules": 0,
        "state_transitions": 0,
        "notifications_sent": 0,
        "notifications_failed": 0,
    }


def _mock_writer_stats():
    return {
        "buffer_size": 0,
        "total_written": 0,
        "total_dropped": 0,
        "flush_count": 0,
        "last_flush_duration_ms": 0.0,
        "last_flush_at": 0.0,
    }


@pytest.fixture
def app():
    a = FastAPI()
    a.include_router(router)
    return a


@pytest.fixture(autouse=True)
def _disable_auth():
    with patch("neoguard.api.deps.settings") as mock_settings:
        mock_settings.auth_enabled = False
        mock_settings.default_tenant_id = "default"
        yield


class TestSystemStats:
    @patch("neoguard.api.routes.system.orchestrator")
    @patch("neoguard.api.routes.system.alert_engine")
    @patch("neoguard.api.routes.system.metric_writer")
    @patch("neoguard.api.routes.system.log_writer")
    @patch("neoguard.api.routes.system.get_pool", new_callable=AsyncMock)
    async def test_returns_all_sections(
        self, mock_pool_fn, mock_lw, mock_mw, mock_engine, mock_orch, app,
    ):
        mock_pool_fn.return_value = _mock_pool()
        mock_mw.stats = _mock_writer_stats()
        mock_lw.stats = _mock_writer_stats()
        mock_orch.stats = _mock_orch_stats()
        mock_engine.stats = _mock_engine_stats()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/system/stats")

        assert resp.status_code == 200
        data = resp.json()
        assert "api" in data
        assert "database" in data
        assert "writers" in data
        assert "background_tasks" in data
        assert "process" in data

    @patch("neoguard.api.routes.system.orchestrator")
    @patch("neoguard.api.routes.system.alert_engine")
    @patch("neoguard.api.routes.system.metric_writer")
    @patch("neoguard.api.routes.system.log_writer")
    @patch("neoguard.api.routes.system.get_pool", new_callable=AsyncMock)
    async def test_database_section_keys(
        self, mock_pool_fn, mock_lw, mock_mw, mock_engine, mock_orch, app,
    ):
        mock_pool_fn.return_value = _mock_pool()
        mock_mw.stats = _mock_writer_stats()
        mock_lw.stats = _mock_writer_stats()
        mock_orch.stats = _mock_orch_stats()
        mock_engine.stats = _mock_engine_stats()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/system/stats")

        db = resp.json()["database"]
        assert "pool_size" in db
        assert "pool_idle" in db
        assert "pool_active" in db
        assert "pool_max" in db
        assert "pool_utilization" in db
        assert db["pool_size"] == 8
        assert db["pool_active"] == 3

    @patch("neoguard.api.routes.system.orchestrator")
    @patch("neoguard.api.routes.system.alert_engine")
    @patch("neoguard.api.routes.system.metric_writer")
    @patch("neoguard.api.routes.system.log_writer")
    @patch("neoguard.api.routes.system.get_pool", new_callable=AsyncMock)
    async def test_writers_section_keys(
        self, mock_pool_fn, mock_lw, mock_mw, mock_engine, mock_orch, app,
    ):
        mock_pool_fn.return_value = _mock_pool()
        mock_mw.stats = _mock_writer_stats()
        mock_lw.stats = _mock_writer_stats()
        mock_orch.stats = _mock_orch_stats()
        mock_engine.stats = _mock_engine_stats()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/system/stats")

        writers = resp.json()["writers"]
        assert "metrics" in writers
        assert "logs" in writers
        for w in writers.values():
            assert "buffer_size" in w
            assert "total_written" in w
            assert "flush_count" in w

    @patch("neoguard.api.routes.system.orchestrator")
    @patch("neoguard.api.routes.system.alert_engine")
    @patch("neoguard.api.routes.system.metric_writer")
    @patch("neoguard.api.routes.system.log_writer")
    @patch("neoguard.api.routes.system.get_pool", new_callable=AsyncMock)
    async def test_process_section_keys(
        self, mock_pool_fn, mock_lw, mock_mw, mock_engine, mock_orch, app,
    ):
        mock_pool_fn.return_value = _mock_pool()
        mock_mw.stats = _mock_writer_stats()
        mock_lw.stats = _mock_writer_stats()
        mock_orch.stats = _mock_orch_stats()
        mock_engine.stats = _mock_engine_stats()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/system/stats")

        proc = resp.json()["process"]
        assert "cpu_percent" in proc
        assert "memory_rss_mb" in proc
        assert "uptime_seconds" in proc
        assert "thread_count" in proc
