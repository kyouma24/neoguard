"""Tests for SSE (Server-Sent Events) live dashboard stream endpoint."""

from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.sse import format_sse, router
from neoguard.core.config import settings as _settings

TENANT_A = "tenant-aaa"
DASHBOARD_ID = "dash-001"


def _make_app(
    *,
    tenant_id: str = TENANT_A,
    scopes: list[str] | None = None,
    is_super_admin: bool = False,
    auth_enabled: bool = True,
    user_id: str = "user-001",
) -> FastAPI:
    """Create a minimal FastAPI app with injected auth state."""
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        if auth_enabled:
            request.state.tenant_id = tenant_id
            request.state.scopes = scopes if scopes is not None else ["read", "write"]
            request.state.is_super_admin = is_super_admin
            request.state.user_id = user_id
        return await call_next(request)

    app.include_router(router)
    return app


def _make_unauthenticated_app() -> FastAPI:
    """App with auth_enabled=True but no scopes — simulates missing session."""
    app = FastAPI()

    @app.middleware("http")
    async def inject_no_auth(request, call_next):
        request.state.tenant_id = TENANT_A
        request.state.scopes = []
        request.state.is_super_admin = False
        request.state.user_id = None
        return await call_next(request)

    app.include_router(router)
    return app


@contextmanager
def _quick_exit_patches():
    """Context manager that makes the SSE generator exit immediately after
    emitting the 'connected' event by setting sse_max_duration_sec=0."""
    original = _settings.sse_max_duration_sec
    _settings.sse_max_duration_sec = 0
    try:
        yield
    finally:
        _settings.sse_max_duration_sec = original


async def _get_stream(app: FastAPI, dashboard_id: str = DASHBOARD_ID, timeout: float = 5.0):
    """GET the SSE stream endpoint, returning the httpx Response."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.get(
            f"/api/v1/query/stream?dashboard_id={dashboard_id}",
            timeout=timeout,
        )


def _parse_sse_messages(body: str) -> list[dict]:
    """Extract all data: lines from an SSE response body and parse as JSON."""
    messages = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            messages.append(json.loads(line[len("data: "):]))
    return messages


# ────────────────────────────────────────────────────────────────
# format_sse helper
# ────────────────────────────────────────────────────────────────

class TestFormatSSE:
    """Test the SSE message formatting helper."""

    def test_basic_data_message(self):
        result = format_sse({"type": "heartbeat", "ts": 1000})
        assert result.startswith("data: ")
        assert result.endswith("\n\n")
        data_line = result.strip().split("\n")[0]
        parsed = json.loads(data_line[len("data: "):])
        assert parsed["type"] == "heartbeat"
        assert parsed["ts"] == 1000

    def test_with_event_name(self):
        result = format_sse({"type": "connected"}, event="dashboard")
        lines = result.strip().split("\n")
        assert lines[0] == "event: dashboard"
        assert lines[1].startswith("data: ")

    def test_without_event_name(self):
        result = format_sse({"type": "heartbeat"})
        assert "event:" not in result

    def test_double_newline_terminator(self):
        result = format_sse({"type": "test"})
        assert result[-2:] == "\n\n"

    def test_empty_dict(self):
        result = format_sse({})
        assert "data: {}" in result


# ────────────────────────────────────────────────────────────────
# Endpoint content-type and headers
# ────────────────────────────────────────────────────────────────

class TestSSEEndpointContentType:
    async def test_returns_event_stream_content_type(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app)
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    async def test_cache_control_no_cache(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app)
        assert resp.headers.get("cache-control") == "no-cache"

    async def test_x_accel_buffering_no(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app)
        assert resp.headers.get("x-accel-buffering") == "no"


# ────────────────────────────────────────────────────────────────
# Connection event
# ────────────────────────────────────────────────────────────────

class TestSSEConnectionEvent:
    async def test_first_event_is_connected(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app)
        messages = _parse_sse_messages(resp.text)
        assert len(messages) >= 1
        assert messages[0]["type"] == "connected"
        assert messages[0]["dashboard_id"] == DASHBOARD_ID
        assert "ts" in messages[0]


# ────────────────────────────────────────────────────────────────
# Heartbeat
# ────────────────────────────────────────────────────────────────

class TestSSEHeartbeat:
    async def test_heartbeat_event_present(self):
        app = _make_app(scopes=["read"])

        call_count = 0
        original_sleep = asyncio.sleep

        async def fast_sleep(secs):
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()
            await original_sleep(0.01)

        original_hb = _settings.sse_heartbeat_sec
        _settings.sse_heartbeat_sec = 0.01
        try:
            with patch("neoguard.api.routes.sse.asyncio.sleep", side_effect=fast_sleep):
                resp = await _get_stream(app)
        finally:
            _settings.sse_heartbeat_sec = original_hb

        messages = _parse_sse_messages(resp.text)
        types = [m["type"] for m in messages]
        assert "connected" in types
        assert "heartbeat" in types


# ────────────────────────────────────────────────────────────────
# Auth / scope enforcement
# ────────────────────────────────────────────────────────────────

class TestSSEAuth:
    async def test_scope_read_required(self):
        app = _make_app(scopes=["write"])
        resp = await _get_stream(app)
        assert resp.status_code == 403

    async def test_admin_scope_allowed(self):
        app = _make_app(scopes=["admin"])
        with _quick_exit_patches():
            resp = await _get_stream(app)
        assert resp.status_code == 200

    async def test_empty_scopes_denied(self):
        app = _make_unauthenticated_app()
        resp = await _get_stream(app)
        assert resp.status_code == 403


# ────────────────────────────────────────────────────────────────
# dashboard_id query parameter validation
# ────────────────────────────────────────────────────────────────

class TestSSEDashboardIdParam:
    async def test_missing_dashboard_id_returns_422(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/query/stream")
        assert resp.status_code == 422

    async def test_empty_dashboard_id_returns_422(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/query/stream?dashboard_id=")
        assert resp.status_code == 422

    async def test_valid_dashboard_id_accepted(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app, dashboard_id="my-dashboard-123")
        assert resp.status_code == 200


# ────────────────────────────────────────────────────────────────
# Max duration close event
# ────────────────────────────────────────────────────────────────

class TestSSEMaxDuration:
    async def test_close_event_after_max_duration(self):
        app = _make_app(scopes=["read"])
        with _quick_exit_patches():
            resp = await _get_stream(app)

        messages = _parse_sse_messages(resp.text)
        types = [m["type"] for m in messages]
        assert "close" in types
        close_msg = next(m for m in messages if m["type"] == "close")
        assert close_msg["reason"] == "max_duration"


# ────────────────────────────────────────────────────────────────
# Tenant isolation
# ────────────────────────────────────────────────────────────────

class TestSSETenantIsolation:
    async def test_tenant_id_from_auth(self):
        app = _make_app(tenant_id=TENANT_A, scopes=["read"])
        with _quick_exit_patches(), \
             patch("neoguard.api.routes.sse.log") as mock_log:
            mock_log.ainfo = AsyncMock()
            resp = await _get_stream(app)
        assert resp.status_code == 200
        mock_log.ainfo.assert_any_call(
            "sse_stream_open",
            dashboard_id=DASHBOARD_ID,
            tenant_id=TENANT_A,
            user_id="user-001",
        )
