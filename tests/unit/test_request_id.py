"""Tests for request correlation ID middleware."""

from unittest.mock import patch

import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from neoguard.api.middleware.request_id import (
    RequestIDMiddleware,
    _normalize_path,
    _status_class,
)


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/api/v1/test")
    async def test_endpoint(request: Request):
        return {"request_id": getattr(request.state, "request_id", None)}

    @app.get("/api/v1/alerts/{alert_id}")
    async def alert_detail(alert_id: str, request: Request):
        return {"alert_id": alert_id, "request_id": getattr(request.state, "request_id", None)}

    @app.get("/error")
    async def error_endpoint():
        raise ValueError("boom")

    app.add_middleware(RequestIDMiddleware)
    return app


@pytest.fixture
def app():
    return _make_app()


class TestRequestIDMiddleware:
    async def test_generates_ulid_when_no_header(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/test")
        assert resp.status_code == 200
        rid = resp.headers.get("X-Request-ID")
        assert rid is not None
        assert len(rid) == 26

    async def test_preserves_incoming_header(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/test",
                headers={"X-Request-ID": "my-custom-id-123"},
            )
        assert resp.headers["X-Request-ID"] == "my-custom-id-123"
        assert resp.json()["request_id"] == "my-custom-id-123"

    async def test_empty_header_generates_new(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/test",
                headers={"X-Request-ID": ""},
            )
        rid = resp.headers["X-Request-ID"]
        assert len(rid) == 26

    async def test_too_long_header_generates_new(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/test",
                headers={"X-Request-ID": "x" * 200},
            )
        rid = resp.headers["X-Request-ID"]
        assert len(rid) == 26

    async def test_request_id_stored_on_state(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/test")
        body = resp.json()
        assert body["request_id"] == resp.headers["X-Request-ID"]

    async def test_binds_to_structlog_contextvars(self, app):
        bound_ids = []
        original_bind = None

        import structlog.contextvars
        original_bind = structlog.contextvars.bind_contextvars

        def capture_bind(**kwargs):
            if "request_id" in kwargs:
                bound_ids.append(kwargs["request_id"])
            return original_bind(**kwargs)

        transport = ASGITransport(app=app)
        with patch.object(structlog.contextvars, "bind_contextvars", side_effect=capture_bind):
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get("/api/v1/test")

        assert len(bound_ids) == 1
        assert bound_ids[0] == resp.headers["X-Request-ID"]

    async def test_records_api_metrics(self, app):
        from neoguard.core.telemetry import registry

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/api/v1/test")

        snap = registry.snapshot()
        counter_names = [c["name"] for c in snap["counters"]]
        assert "neoguard.api.request.count" in counter_names

        hist_names = [h["name"] for h in snap["histograms"]]
        assert "neoguard.api.request.latency_ms" in hist_names


class TestPathNormalization:
    def test_ulid_replaced(self):
        assert _normalize_path("/api/v1/alerts/01KQEGFV72QWSSQ9T70QWVFVEP") == "/api/v1/alerts/{id}"

    def test_uuid_replaced(self):
        path = "/api/v1/azure/subscriptions/2fd5b44e-b6cc-4877-bd13-4a8154f814d8"
        assert _normalize_path(path) == "/api/v1/azure/subscriptions/{id}"

    def test_no_ids_unchanged(self):
        assert _normalize_path("/api/v1/metrics/query") == "/api/v1/metrics/query"

    def test_multiple_ids(self):
        path = "/api/v1/alerts/01KQEGFV72QWSSQ9T70QWVFVEP/events/01KQEGFV72QWSSQ9T70QWVFVEP"
        assert _normalize_path(path) == "/api/v1/alerts/{id}/events/{id}"


class TestStatusClass:
    def test_2xx(self):
        assert _status_class(200) == "2xx"
        assert _status_class(201) == "2xx"

    def test_4xx(self):
        assert _status_class(401) == "4xx"
        assert _status_class(404) == "4xx"

    def test_5xx(self):
        assert _status_class(500) == "5xx"
        assert _status_class(503) == "5xx"
