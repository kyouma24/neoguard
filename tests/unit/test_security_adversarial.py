"""Adversarial security tests — G.1 items that don't need a real DB.

Tests cover:
- MQL __tenant_id injection (G.1 #5)
- Compiled SQL always contains tenant_id parameter (G.1 #6)
- Viewer role cannot POST/PATCH/DELETE (G.1 #12)
- Cross-tenant share URL returns 404 (G.1 #17)
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.services.mql.ast_nodes import ExactMatch, MQLQuery
from neoguard.services.mql.compiler import compile_query
from neoguard.services.mql.parser import parse
from neoguard.services.mql.tokenizer import MQLTokenizeError

START = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
END = datetime(2026, 5, 1, 1, 0, 0, tzinfo=timezone.utc)

TENANT_A = "tenant-aaaa-1111"
TENANT_B = "tenant-bbbb-2222"


# ---------------------------------------------------------------------------
# G.1 #5 — MQL __tenant_id injection via crafted tag filter
# ---------------------------------------------------------------------------


class TestMQLTenantIdInjection:
    """Crafted tag filter {__tenant_id:other_tenant} must be rejected or
    have no effect on the actual tenant isolation."""

    def test_underscore_prefix_tag_key_is_valid_regex(self):
        """__tenant_id is a legal tag key (starts with underscore), but the
        compiler always injects tenant_id from auth state — never from query
        filters. Even if the key passes validation, it only filters the
        'tags' JSONB column, not the tenant_id column."""
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(ExactMatch(key="__tenant_id", value=TENANT_B),),
        )
        result = compile_query(q, tenant_id=TENANT_A, start=START, end=END)

        # The real tenant_id comes from auth, not from the filter
        assert TENANT_A in result.params
        # The injected value goes into tags->>($N), harmless — key is parameterized
        assert "__tenant_id" in result.params
        assert "tags->>(" in result.sql
        # The actual tenant_id = $N clause references TENANT_A
        assert "tenant_id =" in result.sql

    def test_tenant_id_from_auth_not_from_filter(self):
        """Even with a filter that looks like tenant_id, the WHERE
        tenant_id = $1 always uses the auth-provided value."""
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(ExactMatch(key="tenant_id", value=TENANT_B),),
        )
        result = compile_query(q, tenant_id=TENANT_A, start=START, end=END)

        # Auth tenant is in params
        assert TENANT_A in result.params
        # Filter value is also in params but targets tags JSONB — key is parameterized
        assert TENANT_B in result.params
        assert "tenant_id" in result.params  # the tag key as a parameter
        assert "tags->>(" in result.sql
        assert "tenant_id =" in result.sql

    def test_tokenizer_rejects_backtick_in_tag_key(self):
        """Backtick is not a valid identifier character in MQL."""
        with pytest.raises(MQLTokenizeError):
            parse("avg:cpu{`tenant_id`:other}")

    def test_tokenizer_rejects_semicolon(self):
        """Semicolons are not valid in MQL at all."""
        with pytest.raises(MQLTokenizeError):
            parse("avg:cpu{env:prod}; DROP TABLE metrics")

    def test_tokenizer_rejects_double_dash(self):
        """SQL comment syntax rejected by tokenizer."""
        with pytest.raises(MQLTokenizeError):
            parse("avg:cpu{env:prod}--")


# ---------------------------------------------------------------------------
# G.1 #6 — Compiled SQL always contains tenant_id parameter
# ---------------------------------------------------------------------------


class TestCompiledSQLTenantIsolation:
    """Every compiled query from a non-super-admin MUST include a
    WHERE tenant_id = $N clause."""

    def test_simple_query_has_tenant_where(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = compile_query(q, tenant_id=TENANT_A, start=START, end=END)
        assert "tenant_id =" in result.sql
        assert TENANT_A in result.params

    def test_filtered_query_has_tenant_where(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(ExactMatch(key="env", value="prod"),),
        )
        result = compile_query(q, tenant_id=TENANT_A, start=START, end=END)
        assert "tenant_id =" in result.sql
        assert TENANT_A in result.params

    def test_different_tenants_get_different_params(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result_a = compile_query(q, tenant_id=TENANT_A, start=START, end=END)
        result_b = compile_query(q, tenant_id=TENANT_B, start=START, end=END)
        assert TENANT_A in result_a.params
        assert TENANT_B in result_b.params
        assert TENANT_A not in result_b.params
        assert TENANT_B not in result_a.params

    def test_cross_tenant_with_flag_omits_filter(self):
        """Compiler with allow_cross_tenant=True omits tenant WHERE clause."""
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = compile_query(q, tenant_id=None, start=START, end=END, allow_cross_tenant=True)
        assert "tenant_id" not in result.sql

    def test_none_tenant_without_flag_raises(self):
        """Compiler rejects tenant_id=None without explicit cross-tenant flag."""
        from neoguard.services.mql.compiler import CompilerError
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        with pytest.raises(CompilerError):
            compile_query(q, tenant_id=None, start=START, end=END)

    def test_tenant_id_is_parameterized_not_interpolated(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = compile_query(q, tenant_id=TENANT_A, start=START, end=END)
        # tenant_id value must NOT appear in the SQL text itself
        assert TENANT_A not in result.sql
        # It must be in the params tuple
        assert TENANT_A in result.params


# ---------------------------------------------------------------------------
# G.1 #12 — Viewer role cannot POST/PATCH/DELETE dashboards
# ---------------------------------------------------------------------------


def _make_dashboard_app(
    *,
    tenant_id: str = TENANT_A,
    scopes: list[str] | None = None,
) -> FastAPI:
    """Build a minimal FastAPI app with dashboard routes and injected auth."""
    from neoguard.api.routes.dashboards import router

    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):  # type: ignore[no-untyped-def]
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes if scopes is not None else ["read"]
        request.state.is_super_admin = False
        request.state.user_id = "user-viewer-1"
        return await call_next(request)

    app.include_router(router)
    return app


class TestViewerRoleCannotWrite:
    """A viewer (scopes=["read"]) MUST get 403 on any write endpoint."""

    async def test_viewer_cannot_create_dashboard(self):
        app = _make_dashboard_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/dashboards",
                json={"name": "Evil Dashboard"},
            )
        assert resp.status_code == 403

    async def test_viewer_cannot_update_dashboard(self):
        app = _make_dashboard_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.patch(
                "/api/v1/dashboards/dash-1",
                json={"name": "Renamed"},
            )
        assert resp.status_code == 403

    async def test_viewer_cannot_delete_dashboard(self):
        app = _make_dashboard_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/v1/dashboards/dash-1")
        assert resp.status_code == 403

    async def test_viewer_cannot_import_dashboard(self):
        app = _make_dashboard_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/dashboards/import",
                json={"version": 1, "name": "Imported", "panels": []},
            )
        assert resp.status_code == 403

    async def test_viewer_cannot_duplicate_dashboard(self):
        app = _make_dashboard_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/dashboards/dash-1/duplicate")
        assert resp.status_code == 403

    async def test_writer_can_create_dashboard(self):
        """Positive control — write scope IS allowed."""
        from neoguard.models.dashboards import Dashboard

        app = _make_dashboard_app(scopes=["write"])
        fake_dashboard = Dashboard(
            id="d1",
            tenant_id=TENANT_A,
            name="Test",
            description="",
            panels=[],
            variables=[],
            groups=[],
            tags=[],
            links=[],
            layout_version=1,
            created_at=START,
            updated_at=START,
        )
        with patch(
            "neoguard.api.routes.dashboards.create_dashboard",
            new_callable=AsyncMock,
            return_value=fake_dashboard,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/dashboards",
                    json={"name": "Allowed Dashboard"},
                )
            assert resp.status_code == 201


# ---------------------------------------------------------------------------
# G.1 #17 — Cross-tenant share URL returns generic 404
# ---------------------------------------------------------------------------


class TestCrossTenantShareURL:
    """If Tenant A's dashboard ID is passed by a user in Tenant B,
    the response MUST be 404 (not 403 or any data leak)."""

    async def test_tenant_b_user_gets_404_for_tenant_a_dashboard(self):
        app = _make_dashboard_app(tenant_id=TENANT_B, scopes=["read"])

        with patch(
            "neoguard.api.routes.dashboards.get_dashboard",
            new_callable=AsyncMock,
            return_value=None,  # not found in Tenant B
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/api/v1/dashboards/dash-from-tenant-a")

        assert resp.status_code == 404
        body = resp.json()
        assert "Dashboard not found" in body["detail"]
        # Must NOT reveal tenant info
        assert TENANT_A not in resp.text
        assert "tenant" not in body["detail"].lower()

    async def test_tenant_b_user_gets_404_on_export(self):
        app = _make_dashboard_app(tenant_id=TENANT_B, scopes=["read"])

        with patch(
            "neoguard.api.routes.dashboards.get_dashboard",
            new_callable=AsyncMock,
            return_value=None,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.get("/api/v1/dashboards/dash-from-tenant-a/export")

        assert resp.status_code == 404
