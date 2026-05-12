"""Tests for MQL API routes — auth, scope, tenant isolation, injection prevention."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.mql import router

TENANT_A = "tenant-aaa"
TENANT_B = "tenant-bbb"

QUERY_BODY = {
    "query": "avg:cpu{env:prod}",
    "start": "2026-05-01T00:00:00Z",
    "end": "2026-05-01T01:00:00Z",
    "interval": "1m",
}


def _make_app(
    *,
    tenant_id: str = TENANT_A,
    scopes: list[str] | None = None,
    is_super_admin: bool = False,
    auth_enabled: bool = True,
) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        if auth_enabled:
            request.state.tenant_id = tenant_id
            request.state.scopes = scopes if scopes is not None else ["read", "write"]
            request.state.is_super_admin = is_super_admin
        return await call_next(request)

    app.include_router(router)
    return app


def _mock_execute(return_value=None):
    if return_value is None:
        return_value = [
            {"name": "cpu", "tags": {}, "datapoints": [["2026-05-01T00:00:00Z", 42.0]]}
        ]
    return patch("neoguard.api.routes.mql.execute", AsyncMock(return_value=return_value))


class TestMQLQueryScopeEnforcement:
    async def test_read_scope_allows_query(self):
        app = _make_app(scopes=["read"])
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)
            assert resp.status_code == 200

    async def test_write_only_scope_denied(self):
        app = _make_app(scopes=["write"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)
        assert resp.status_code == 403

    async def test_admin_scope_allows_query(self):
        app = _make_app(scopes=["admin"])
        with _mock_execute():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)
            assert resp.status_code == 200


class TestMQLTenantIsolation:
    async def test_tenant_id_passed_to_compiler(self):
        app = _make_app(tenant_id=TENANT_A)
        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)

            mock_compile.assert_called_once()
            call_kwargs = mock_compile.call_args
            assert call_kwargs.kwargs["tenant_id"] == TENANT_A

    async def test_different_tenant_gets_different_tenant_id(self):
        app = _make_app(tenant_id=TENANT_B)
        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)

            assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_B

    async def test_super_admin_without_tenant_id_falls_back_to_session(self):
        app = _make_app(is_super_admin=True, scopes=["admin"])
        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=QUERY_BODY)

        # Falls back to session tenant_id (TENANT_A) instead of raising 400
        assert resp.status_code == 200
        assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_A

    async def test_super_admin_with_explicit_tenant_id_succeeds(self):
        app = _make_app(is_super_admin=True, scopes=["admin"])
        with patch("neoguard.api.routes.mql.compile_query") as mock_compile, \
             _mock_execute():
            mock_compile.return_value = AsyncMock()
            mock_compile.return_value.post_processors = ()
            mock_compile.return_value.metric_name = "cpu"
            mock_compile.return_value.sql = "SELECT 1"
            mock_compile.return_value.params = ()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    f"/api/v1/mql/query?tenant_id={TENANT_B}", json=QUERY_BODY
                )

            assert resp.status_code == 200
            assert mock_compile.call_args.kwargs["tenant_id"] == TENANT_B


class TestMQLCompilerTenantIsolation:
    """Verify the compiler actually embeds tenant_id in SQL — no mocks."""

    def test_regular_user_query_has_tenant_where_clause(self):
        from neoguard.services.mql.parser import parse
        from neoguard.services.mql.compiler import compile_query
        from datetime import datetime, timezone

        ast = parse("avg:cpu{env:prod}")
        compiled = compile_query(
            ast,
            tenant_id=TENANT_A,
            start=datetime(2026, 5, 1, tzinfo=timezone.utc),
            end=datetime(2026, 5, 1, 1, tzinfo=timezone.utc),
        )
        assert "tenant_id =" in compiled.sql
        assert TENANT_A in compiled.params

    def test_compiler_omits_tenant_filter_when_cross_tenant(self):
        """Compiler-level: tenant_id=None + allow_cross_tenant omits WHERE clause.

        Routes no longer pass None (get_query_tenant_id enforces explicit context),
        but compiler supports cross-tenant for internal callers and background jobs.
        """
        from neoguard.services.mql.parser import parse
        from neoguard.services.mql.compiler import compile_query
        from datetime import datetime, timezone

        ast = parse("avg:cpu{env:prod}")
        compiled = compile_query(
            ast,
            tenant_id=None,
            start=datetime(2026, 5, 1, tzinfo=timezone.utc),
            end=datetime(2026, 5, 1, 1, tzinfo=timezone.utc),
            allow_cross_tenant=True,
        )
        assert "tenant_id" not in compiled.sql

    def test_tenant_id_cannot_be_injected_via_query(self):
        from neoguard.services.mql.parser import parse
        from neoguard.services.mql.compiler import compile_query
        from datetime import datetime, timezone

        ast = parse("avg:cpu{env:prod}")
        compiled = compile_query(
            ast,
            tenant_id="'; DROP TABLE metrics;--",
            start=datetime(2026, 5, 1, tzinfo=timezone.utc),
            end=datetime(2026, 5, 1, 1, tzinfo=timezone.utc),
        )
        assert "'; DROP TABLE metrics;--" in compiled.params
        assert "DROP TABLE" not in compiled.sql


class TestMQLInternalMetricProtection:
    async def test_neoguard_metric_blocked_for_regular_user(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "avg:neoguard.api.requests"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 403

    async def test_neoguard_metric_allowed_for_admin(self):
        app = _make_app(scopes=["admin"])
        with _mock_execute():
            body = {**QUERY_BODY, "query": "avg:neoguard.api.requests"}
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/mql/query", json=body)
            assert resp.status_code == 200

    async def test_neoguard_metric_allowed_for_super_admin(self):
        app = _make_app(is_super_admin=True, scopes=["read"])
        with _mock_execute():
            body = {**QUERY_BODY, "query": "avg:neoguard.api.requests"}
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    f"/api/v1/mql/query?tenant_id={TENANT_A}", json=body
                )
            assert resp.status_code == 200

    async def test_neoguard_metric_blocked_in_batch(self):
        app = _make_app(scopes=["read"])
        body = {
            "queries": [
                {**QUERY_BODY, "query": "avg:cpu"},
                {**QUERY_BODY, "query": "avg:neoguard.api.requests"},
            ]
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query/batch", json=body)
        assert resp.status_code == 403


class TestMQLValidation:
    async def test_valid_query_returns_ast_info(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "avg:aws.rds.cpu{env:prod}.rate()"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/validate", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["aggregator"] == "avg"
        assert data["metric_name"] == "aws.rds.cpu"
        assert data["filter_count"] == 1
        assert data["function_count"] == 1

    async def test_invalid_query_returns_error(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "not-a-valid-query"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/validate", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is False
        assert data["error"] is not None


class TestMQLInputValidation:
    async def test_empty_query_rejected(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": ""}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 422

    async def test_too_long_query_rejected(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "a" * 2001}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 422

    async def test_parse_error_returns_400(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "not:valid{bad"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 400

    async def test_invalid_interval_returns_422(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "interval": "99x"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 422

    async def test_batch_max_10(self):
        app = _make_app(scopes=["read"])
        body = {"queries": [QUERY_BODY] * 11}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query/batch", json=body)
        assert resp.status_code == 422

    async def test_batch_min_1(self):
        app = _make_app(scopes=["read"])
        body = {"queries": []}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query/batch", json=body)
        assert resp.status_code == 422


class TestMQLTagKeyInjectionViaRoute:
    """End-to-end: ensure tag key injection fails through the full stack."""

    async def test_crafted_tag_key_rejected(self):
        app = _make_app(scopes=["read"])
        body = {**QUERY_BODY, "query": "avg:cpu{x'OR 1=1--:val}"}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/mql/query", json=body)
        assert resp.status_code == 400
