"""Tests for metadata API routes — auth, scope enforcement, response shapes."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.metadata import router

TENANT_A = "tenant-aaa"


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


def _patch_metric_names(names: list[str]):
    return patch(
        "neoguard.api.routes.metadata.get_metric_names",
        AsyncMock(return_value=names),
    )


def _patch_tag_keys(keys: list[str]):
    return patch(
        "neoguard.api.routes.metadata.get_tag_keys",
        AsyncMock(return_value=keys),
    )


def _patch_tag_values(values: list[str]):
    return patch(
        "neoguard.api.routes.metadata.get_tag_values",
        AsyncMock(return_value=values),
    )


class TestMetricsSearch:
    async def test_returns_metric_names(self):
        app = _make_app(scopes=["read"])
        with _patch_metric_names(["cpu.user", "cpu.system"]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics?q=cpu")
            assert resp.status_code == 200
            assert resp.json() == ["cpu.user", "cpu.system"]

    async def test_scope_enforcement_write_only_denied(self):
        app = _make_app(scopes=["write"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics")
        assert resp.status_code == 403

    async def test_admin_scope_allowed(self):
        app = _make_app(scopes=["admin"])
        with _patch_metric_names([]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics")
            assert resp.status_code == 200

    async def test_limit_validation(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics?limit=0")
        assert resp.status_code == 422

    async def test_passes_tenant_id_to_service(self):
        app = _make_app(scopes=["read"], tenant_id=TENANT_A)
        with _patch_metric_names([]) as mock_fn:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.get("/api/v1/metadata/metrics?q=cpu&limit=10")
            mock_fn.assert_called_once_with(tenant_id=TENANT_A, query="cpu", limit=10)


class TestTagKeys:
    async def test_returns_tag_keys(self):
        app = _make_app(scopes=["read"])
        with _patch_tag_keys(["env", "host", "region"]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics/cpu/tag_keys")
            assert resp.status_code == 200
            assert resp.json() == ["env", "host", "region"]

    async def test_scope_enforcement(self):
        app = _make_app(scopes=["write"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics/cpu/tag_keys")
        assert resp.status_code == 403


class TestTagValues:
    async def test_returns_tag_values(self):
        app = _make_app(scopes=["read"])
        with _patch_tag_values(["prod", "staging"]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=env")
            assert resp.status_code == 200
            assert resp.json() == ["prod", "staging"]

    async def test_key_required(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values")
        assert resp.status_code == 422

    async def test_scope_enforcement(self):
        app = _make_app(scopes=["write"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/metrics/cpu/tag_values?key=env")
        assert resp.status_code == 403


class TestFunctions:
    async def test_returns_function_list(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/functions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 7
        names = [f["name"] for f in data]
        assert "rate" in names
        assert "moving_average" in names

    async def test_function_shape(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/functions")
        data = resp.json()
        for fn in data:
            assert "name" in fn
            assert "description" in fn
            assert "arity" in fn
            assert "example" in fn

    async def test_scope_enforcement(self):
        app = _make_app(scopes=["write"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/metadata/functions")
        assert resp.status_code == 403
