"""Tests for MQL streaming batch query endpoint — NDJSON response, timeouts, validation."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import orjson
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.mql import router

TENANT_A = "tenant-aaa"

STREAM_BATCH_URL = "/api/v1/mql/query/batch/stream"

QUERY_ITEM = {
    "id": "q_01",
    "query": "avg:cpu{env:prod}",
    "start": "2026-05-01T00:00:00Z",
    "end": "2026-05-01T01:00:00Z",
    "interval": "1m",
}

MOCK_SERIES = [
    {"name": "cpu", "tags": {}, "datapoints": [["2026-05-01T00:00:00Z", 42.0]]}
]


def _make_app(
    *,
    tenant_id: str = TENANT_A,
    scopes: list[str] | None = None,
    is_super_admin: bool = False,
) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes if scopes is not None else ["read", "write"]
        request.state.is_super_admin = is_super_admin
        return await call_next(request)

    app.include_router(router)
    return app


def _mock_execute(return_value=None):
    """Patch execute to return mock series data."""
    from neoguard.models.metrics import MetricQueryResult
    from datetime import datetime, timezone

    if return_value is None:
        return_value = [
            MetricQueryResult(
                name="cpu",
                tags={},
                datapoints=[(datetime(2026, 5, 1, tzinfo=timezone.utc), 42.0)],
            )
        ]
    return patch("neoguard.api.routes.mql.execute", AsyncMock(return_value=return_value))


def _parse_ndjson(content: bytes) -> list[dict]:
    """Parse an NDJSON response body into a list of dicts."""
    lines = content.strip().split(b"\n")
    return [orjson.loads(line) for line in lines if line.strip()]


class TestStreamBatchBasic:
    """Basic streaming batch functionality."""

    async def test_valid_batch_returns_ndjson(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)
            assert resp.status_code == 200
            assert resp.headers["content-type"] == "application/x-ndjson"

    async def test_valid_batch_two_queries(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_01"},
                {**QUERY_ITEM, "id": "q_02", "query": "avg:memory{env:prod}"},
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        assert resp.status_code == 200
        results = _parse_ndjson(resp.content)
        # 2 query results + 1 batch_complete
        assert len(results) == 3

        query_results = [r for r in results if r["type"] == "query_result"]
        assert len(query_results) == 2
        assert all(r["status"] == "ok" for r in query_results)
        ids = {r["id"] for r in query_results}
        assert ids == {"q_01", "q_02"}

    async def test_batch_complete_has_took_ms(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        complete = [r for r in results if r["type"] == "batch_complete"]
        assert len(complete) == 1
        assert "took_ms" in complete[0]
        assert isinstance(complete[0]["took_ms"], int)
        assert complete[0]["took_ms"] >= 0
        assert complete[0]["total"] == 1

    async def test_query_result_has_series(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "ok"
        assert "series" in qr
        assert len(qr["series"]) == 1
        assert qr["series"][0]["name"] == "cpu"


class TestStreamBatchValidation:
    """Request validation for the streaming batch endpoint."""

    async def test_empty_queries_rejected(self):
        app = _make_app()
        body = {"queries": []}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

    async def test_over_max_batch_queries_rejected(self):
        app = _make_app()
        items = [{**QUERY_ITEM, "id": f"q_{i:03d}"} for i in range(201)]
        body = {"queries": items}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

    async def test_max_batch_queries_accepted(self):
        app = _make_app()
        items = [{**QUERY_ITEM, "id": f"q_{i:03d}"} for i in range(200)]
        body = {"queries": items}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 200

    async def test_missing_query_id_rejected(self):
        app = _make_app()
        item = {k: v for k, v in QUERY_ITEM.items() if k != "id"}
        body = {"queries": [item]}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

    async def test_empty_query_id_rejected(self):
        app = _make_app()
        body = {"queries": [{**QUERY_ITEM, "id": ""}]}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

    async def test_max_points_validation(self):
        app = _make_app()
        body = {"queries": [{**QUERY_ITEM, "max_points": 0}]}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

    async def test_max_series_validation(self):
        app = _make_app()
        body = {"queries": [{**QUERY_ITEM, "max_series": 201}]}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 422

class TestStreamBatchErrorHandling:
    """Error handling: invalid queries don't fail the entire batch."""

    async def test_invalid_query_returns_error_not_500(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_good"},
                {**QUERY_ITEM, "id": "q_bad", "query": "not:valid{bad"},
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        assert resp.status_code == 200
        results = _parse_ndjson(resp.content)
        query_results = [r for r in results if r["type"] == "query_result"]
        assert len(query_results) == 2

        good = [r for r in query_results if r["id"] == "q_good"]
        bad = [r for r in query_results if r["id"] == "q_bad"]
        assert len(good) == 1
        assert good[0]["status"] == "ok"
        assert len(bad) == 1
        assert bad[0]["status"] == "error"
        assert bad[0]["error"]["code"] == "query_invalid"

    async def test_invalid_interval_returns_compile_error(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_bad_interval", "interval": "99x"},
            ]
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "error"
        assert qr["error"]["code"] == "compile_error"

    async def test_internal_metric_blocked_for_regular_user(self):
        app = _make_app(scopes=["read"])
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_internal", "query": "avg:neoguard.api.requests"},
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "error"
        assert qr["error"]["code"] == "forbidden"

    async def test_internal_metric_allowed_for_admin(self):
        app = _make_app(scopes=["admin"])
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_internal", "query": "avg:neoguard.api.requests"},
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "ok"


class TestStreamBatchTimeout:
    """Per-query timeout handling."""

    async def test_per_query_timeout_returns_error(self):
        """A slow query returns a timeout error, not a crash."""

        async def slow_execute(compiled):
            await asyncio.sleep(20)  # will be cancelled by 10s timeout
            return []

        app = _make_app()
        body = {"queries": [{**QUERY_ITEM, "id": "q_slow"}]}

        with patch("neoguard.api.routes.mql.execute", side_effect=slow_execute), \
             patch("neoguard.api.routes.mql.PER_QUERY_TIMEOUT_S", 0.1):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "error"
        assert qr["error"]["code"] == "timeout"


class TestStreamBatchVariables:
    """Variable substitution applies to all queries in a batch."""

    async def test_shared_variables_applied(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_01", "query": "avg:cpu{env:$env}"},
                {**QUERY_ITEM, "id": "q_02", "query": "avg:memory{env:$env}"},
            ],
            "variables": {"env": "prod"},
        }
        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

            assert resp.status_code == 200
            # compile_query should have been called with parsed ASTs
            # (variable substitution happens before parse)
            assert mock_compile.call_count == 2

    async def test_undefined_variable_returns_error(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_01", "query": "avg:cpu{env:$undefined_var}"},
            ],
            "variables": {"env": "prod"},
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "error"
        assert qr["error"]["code"] == "variable_error"

    async def test_no_variables_works(self):
        """Batch without variables still works normally."""
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 200
        results = _parse_ndjson(resp.content)
        assert len(results) == 2  # 1 query_result + 1 batch_complete


class TestStreamBatchScopeEnforcement:
    """Auth scope enforcement on the streaming endpoint."""

    async def test_read_scope_allows(self):
        app = _make_app(scopes=["read"])
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 200

    async def test_write_only_scope_denied(self):
        app = _make_app(scopes=["write"])
        body = {"queries": [QUERY_ITEM]}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(STREAM_BATCH_URL, json=body)
        assert resp.status_code == 403


class TestStreamBatchTenantIsolation:
    """Tenant isolation is enforced on every query within the batch."""

    async def test_tenant_id_passed_to_compiler(self):
        app = _make_app(tenant_id=TENANT_A)
        body = {"queries": [QUERY_ITEM]}

        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

            mock_compile.assert_called_once()
            assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_A

    async def test_super_admin_without_tenant_id_falls_back_to_session(self):
        app = _make_app(is_super_admin=True, scopes=["admin"])
        body = {"queries": [QUERY_ITEM]}

        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        # Falls back to session tenant_id (TENANT_A) instead of raising 400
        assert resp.status_code == 200
        assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_A

    async def test_super_admin_with_explicit_tenant_id_succeeds(self):
        app = _make_app(is_super_admin=True, scopes=["admin"])
        body = {"queries": [QUERY_ITEM]}

        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    f"{STREAM_BATCH_URL}?tenant_id={TENANT_A}", json=body
                )

            assert resp.status_code == 200
            assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_A


class TestStreamBatchNDJSONFormat:
    """Verify the NDJSON output format is correct."""

    async def test_each_line_is_valid_json(self):
        app = _make_app()
        body = {
            "queries": [
                {**QUERY_ITEM, "id": "q_01"},
                {**QUERY_ITEM, "id": "q_02", "query": "avg:memory"},
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        lines = [l for l in resp.content.split(b"\n") if l.strip()]
        assert len(lines) == 3  # 2 results + 1 complete
        for line in lines:
            parsed = orjson.loads(line)
            assert "type" in parsed

    async def test_last_line_is_batch_complete(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        lines = [l for l in resp.content.split(b"\n") if l.strip()]
        last = orjson.loads(lines[-1])
        assert last["type"] == "batch_complete"

    async def test_response_headers(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        assert resp.headers["content-type"] == "application/x-ndjson"
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["cache-control"] == "no-cache"


class TestStreamBatchMetaInfo:
    """Meta info about series truncation and point limits."""

    async def test_meta_includes_total_series(self):
        app = _make_app()
        body = {"queries": [QUERY_ITEM]}
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert "meta" in qr
        assert qr["meta"]["total_series"] == 1
        assert qr["meta"]["truncated_series"] is False

    async def test_max_series_truncation(self):
        """When execute returns more series than max_series, truncation occurs."""
        from neoguard.models.metrics import MetricQueryResult
        from datetime import datetime, timezone

        many_series = [
            MetricQueryResult(
                name="cpu",
                tags={"host": f"host-{i}"},
                datapoints=[(datetime(2026, 5, 1, tzinfo=timezone.utc), float(i))],
            )
            for i in range(10)
        ]

        app = _make_app()
        body = {"queries": [{**QUERY_ITEM, "max_series": 3}]}
        with patch("neoguard.api.routes.mql.execute", AsyncMock(return_value=many_series)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(STREAM_BATCH_URL, json=body)

        results = _parse_ndjson(resp.content)
        qr = [r for r in results if r["type"] == "query_result"][0]
        assert qr["status"] == "ok"
        assert len(qr["series"]) == 3
        assert qr["meta"]["total_series"] == 10
        assert qr["meta"]["truncated_series"] is True


class TestOldBatchStillWorks:
    """Backwards compatibility: the old /query/batch endpoint still works."""

    async def test_old_batch_endpoint(self):
        from neoguard.api.routes.mql import MQLBatchRequest

        app = _make_app()
        body = {
            "queries": [
                {
                    "query": "avg:cpu{env:prod}",
                    "start": "2026-05-01T00:00:00Z",
                    "end": "2026-05-01T01:00:00Z",
                    "interval": "1m",
                }
            ]
        }
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query/batch", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
