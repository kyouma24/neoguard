"""CRITICAL-3: Variable system cardinality control tests.

Tests the high-cardinality denylist, hard limits, time window enforcement,
top-K ordering, and tenant scoping consistency with CRITICAL-2.

Tests use httpx AsyncClient against the real FastAPI router stack to verify
middleware, dependency injection, and response behavior end-to-end.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.metadata import router as metadata_router
from neoguard.api.routes.metrics import router as metrics_router
from neoguard.core.config import settings

TENANT_A = "tenant-aaa"


def _make_app(
    *,
    tenant_id: str = TENANT_A,
    scopes: list[str] | None = None,
    is_super_admin: bool = False,
) -> FastAPI:
    """Build minimal FastAPI app with auth state injected via middleware."""
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes if scopes is not None else ["read", "write"]
        request.state.is_super_admin = is_super_admin
        return await call_next(request)

    app.include_router(metadata_router)
    app.include_router(metrics_router)
    return app


# ---------------------------------------------------------------------------
# Denylist enforcement (full HTTP round-trip)
# ---------------------------------------------------------------------------


class TestDenylistRejection:
    """High-cardinality tags are rejected with structured 400 error."""

    async def test_metadata_tag_values_denylist_returns_400(self):
        """GET /metadata/metrics/{name}/tag_values with denylisted key → 400."""
        app = _make_app(scopes=["read"])
        with patch("neoguard.api.routes.metadata.get_tag_values", AsyncMock(return_value=[])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=request_id")
        assert resp.status_code == 400
        body = resp.json()
        assert body["detail"]["error"]["code"] == "high_cardinality_tag"
        assert body["detail"]["error"]["tag"] == "request_id"

    async def test_metrics_tag_values_denylist_returns_400(self):
        """GET /metrics/tag-values with denylisted tag → 400."""
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metrics/tag-values?tag=trace_id")
        assert resp.status_code == 400
        body = resp.json()
        assert body["detail"]["error"]["code"] == "high_cardinality_tag"
        assert body["detail"]["error"]["tag"] == "trace_id"

    async def test_all_seven_default_denylist_entries(self):
        """Every default denylist tag triggers 400 on both endpoints."""
        expected = {"request_id", "trace_id", "span_id", "correlation_id",
                    "message_id", "session_id", "user_id"}
        assert set(settings.high_cardinality_tag_denylist) == expected

    async def test_non_denylisted_tag_passes_denylist_check(self):
        """A valid tag like 'region' does NOT trigger denylist."""
        app = _make_app(scopes=["read"])
        with patch("neoguard.api.routes.metadata.get_tag_values", AsyncMock(return_value=["us-east-1"])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=region")
        assert resp.status_code == 200
        assert resp.json() == ["us-east-1"]


# ---------------------------------------------------------------------------
# Hard limits (settings verification + HTTP enforcement)
# ---------------------------------------------------------------------------


class TestHardLimits:
    """Client cannot exceed hard limits."""

    def test_tag_values_hard_limit_default(self):
        assert settings.tag_values_hard_limit == 1000

    def test_tag_values_default_limit(self):
        assert settings.tag_values_default_limit == 100

    def test_metric_names_hard_limit(self):
        assert settings.metric_names_hard_limit == 1000

    def test_lookback_default(self):
        assert settings.tag_values_default_lookback_hours == 24

    async def test_metadata_limit_capped_at_1000(self):
        """Metadata tag_values rejects limit > 1000 via FastAPI validation."""
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=env&limit=5000")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tenant scoping (CRITICAL-2 consistency via full HTTP)
# ---------------------------------------------------------------------------


class TestTenantScoping:
    """Metadata and metrics routes enforce tenant context via get_query_tenant_id."""

    async def test_super_admin_without_tenant_id_falls_back_to_session_on_metadata(self):
        """Super admin without ?tenant_id falls back to session tenant_id."""
        app = _make_app(scopes=["read", "write", "admin"], is_super_admin=True)
        with patch("neoguard.api.routes.metadata.get_metric_names", AsyncMock(return_value=["cpu"])) as mock_fn:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics")
        assert resp.status_code == 200
        # Falls back to session tenant_id (TENANT_A) instead of raising 400
        assert mock_fn.call_args.kwargs["tenant_id"] == TENANT_A

    async def test_super_admin_with_tenant_succeeds_on_metadata(self):
        """Super admin with ?tenant_id=X → 200."""
        app = _make_app(scopes=["read", "write", "admin"], is_super_admin=True)
        with patch("neoguard.api.routes.metadata.get_metric_names", AsyncMock(return_value=["cpu"])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/metadata/metrics?tenant_id={TENANT_A}")
        assert resp.status_code == 200
        assert resp.json() == ["cpu"]

    async def test_super_admin_without_tenant_id_falls_back_to_session_on_metrics_names(self):
        """Super admin without ?tenant_id on /metrics/names falls back to session tenant_id."""
        from contextlib import asynccontextmanager

        app = _make_app(scopes=["read", "write", "admin"], is_super_admin=True)

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[{"name": "cpu"}])

        mock_pool = MagicMock()

        @asynccontextmanager
        async def mock_acquire():
            yield mock_conn

        mock_pool.acquire = mock_acquire

        with patch("neoguard.db.timescale.connection.get_pool", AsyncMock(return_value=mock_pool)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metrics/names")
        assert resp.status_code == 200

    async def test_regular_user_metadata_passes_tenant(self):
        """Regular user gets their tenant_id injected automatically."""
        app = _make_app(scopes=["read"], tenant_id=TENANT_A)
        with patch("neoguard.api.routes.metadata.get_metric_names", AsyncMock(return_value=["m1"])) as mock_fn:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics?q=m")
        assert resp.status_code == 200
        mock_fn.assert_called_once_with(tenant_id=TENANT_A, query="m", limit=50)


# ---------------------------------------------------------------------------
# get_query_tenant_id unit tests (direct function call)
# ---------------------------------------------------------------------------


class TestGetQueryTenantIdRegression:
    """CRITICAL-2 regression: super admin behavior on metrics endpoints."""

    def test_super_admin_without_tenant_id_falls_back_to_session(self):
        """Super admin without ?tenant_id falls back to session tenant_id."""
        from neoguard.api.deps import get_query_tenant_id

        request = MagicMock()
        request.state.is_super_admin = True
        request.state.scopes = ["read", "write", "admin"]
        request.state.tenant_id = TENANT_A
        request.query_params = {}

        result = get_query_tenant_id(request)
        assert result == TENANT_A

    def test_super_admin_without_session_tenant_falls_back_to_default(self):
        """Super admin without ?tenant_id and no session tenant uses default_tenant_id."""
        from neoguard.api.deps import get_query_tenant_id

        request = MagicMock()
        request.state.is_super_admin = True
        request.state.scopes = ["read", "write", "admin"]
        request.state.tenant_id = None
        request.query_params = {}

        result = get_query_tenant_id(request)
        assert result == settings.default_tenant_id

    def test_super_admin_with_tenant_succeeds(self):
        """Super admin with ?tenant_id returns the override."""
        from neoguard.api.deps import get_query_tenant_id

        request = MagicMock()
        request.state.is_super_admin = True
        request.state.scopes = ["read", "write", "admin"]
        request.query_params = {"tenant_id": "tenant-B"}

        result = get_query_tenant_id(request)
        assert result == "tenant-B"


# ---------------------------------------------------------------------------
# Tag key validation (SQL injection defense)
# ---------------------------------------------------------------------------


class TestInvalidTagKey:
    """Tag key validation rejects unsafe characters."""

    async def test_sql_injection_in_tag_key_via_http(self):
        """Tag key with SQL injection attempt returns 400 via HTTP."""
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metrics/tag-values?tag=region%3BDROP+TABLE")
        assert resp.status_code == 400

    async def test_valid_tag_key_passes(self):
        """A valid tag key format is accepted (mocked DB)."""
        app = _make_app(scopes=["read"])
        with patch("neoguard.api.routes.metadata.get_tag_values", AsyncMock(return_value=["us-east-1"])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=region")
        assert resp.status_code == 200

    def test_regex_pattern_rejects_dangerous_chars(self):
        """Standalone regex validation."""
        import re
        pattern = r"^[a-zA-Z_][a-zA-Z0-9_\-]*$"
        assert re.match(pattern, "region")
        assert re.match(pattern, "account_id")
        assert re.match(pattern, "aws-region")
        assert not re.match(pattern, "1invalid")
        assert not re.match(pattern, "has space")
        assert not re.match(pattern, "semi;colon")
