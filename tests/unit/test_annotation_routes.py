"""Unit tests for annotation API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.annotations import router
from neoguard.models.annotations import Annotation

TENANT_ID = "t-001"
USER_ID = "u-001"
NOW = datetime(2026, 5, 2, 12, 0, 0, tzinfo=UTC)
NOW_ISO = "2026-05-02T12:00:00Z"

_ANNOTATION = Annotation(
    id="ann-001",
    tenant_id=TENANT_ID,
    dashboard_id=None,
    title="Deploy v2.3",
    text="Rolling update",
    tags=["deploy"],
    starts_at=NOW,
    ends_at=None,
    created_by=USER_ID,
    created_at=NOW,
)


def _make_app(
    scopes: list[str] | None = None,
    tenant_id: str = TENANT_ID,
    user_id: str = USER_ID,
    auth_enabled: bool = True,
) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = user_id
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes or ["read", "write"]
        request.state.is_super_admin = False
        return await call_next(request)

    app.include_router(router)
    return app


def _make_admin_app() -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = USER_ID
        request.state.tenant_id = TENANT_ID
        request.state.scopes = ["platform_admin"]
        request.state.is_super_admin = True
        return await call_next(request)

    app.include_router(router)
    return app


class TestCreateAnnotationRoute:
    async def test_creates_annotation(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.create_annotation", AsyncMock(return_value=_ANNOTATION)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/annotations", json={
                    "title": "Deploy v2.3",
                    "text": "Rolling update",
                    "tags": ["deploy"],
                    "starts_at": NOW_ISO,
                })
            assert resp.status_code == 201
            data = resp.json()
            assert data["title"] == "Deploy v2.3"
            assert data["tags"] == ["deploy"]
            assert data["id"] == "ann-001"

    async def test_rejects_missing_title(self):
        app = _make_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/annotations", json={
                "starts_at": NOW_ISO,
            })
        assert resp.status_code == 422

    async def test_rejects_missing_starts_at(self):
        app = _make_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/annotations", json={
                "title": "Deploy",
            })
        assert resp.status_code == 422

    async def test_requires_write_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/annotations", json={
                "title": "Deploy",
                "starts_at": NOW_ISO,
            })
        assert resp.status_code == 403

    async def test_admin_scope_bypasses_write(self):
        app = _make_app(scopes=["admin"])
        with patch("neoguard.api.routes.annotations.create_annotation", AsyncMock(return_value=_ANNOTATION)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/annotations", json={
                    "title": "Deploy",
                    "starts_at": NOW_ISO,
                })
            assert resp.status_code == 201

    async def test_platform_admin_bypasses_write(self):
        app = _make_admin_app()
        with patch("neoguard.api.routes.annotations.create_annotation", AsyncMock(return_value=_ANNOTATION)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/annotations", json={
                    "title": "Deploy",
                    "starts_at": NOW_ISO,
                })
            assert resp.status_code == 201

    async def test_with_dashboard_id(self):
        ann_with_dash = Annotation(
            id="ann-002", tenant_id=TENANT_ID, dashboard_id="dash-1",
            title="Deploy", text="", tags=[], starts_at=NOW, created_by=USER_ID, created_at=NOW,
        )
        app = _make_app()
        with patch("neoguard.api.routes.annotations.create_annotation", AsyncMock(return_value=ann_with_dash)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/annotations", json={
                    "dashboard_id": "dash-1",
                    "title": "Deploy",
                    "starts_at": NOW_ISO,
                })
            assert resp.status_code == 201
            assert resp.json()["dashboard_id"] == "dash-1"


class TestListAnnotationsRoute:
    async def test_lists_annotations(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[_ANNOTATION])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["title"] == "Deploy v2.3"

    async def test_with_query_params(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])) as mock_list:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations", params={
                    "dashboard_id": "dash-1",
                    "from": NOW_ISO,
                    "to": NOW_ISO,
                    "limit": "50",
                })
            assert resp.status_code == 200
            call_args = mock_list.call_args
            assert call_args[0][1] == "dash-1"
            assert call_args[0][4] == 50

    async def test_empty_list(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations")
            assert resp.status_code == 200
            assert resp.json() == []

    async def test_read_scope_sufficient(self):
        app = _make_app(scopes=["read"])
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations")
            assert resp.status_code == 200


class TestGetAnnotationRoute:
    async def test_returns_annotation(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.get_annotation", AsyncMock(return_value=_ANNOTATION)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations/ann-001")
            assert resp.status_code == 200
            assert resp.json()["id"] == "ann-001"

    async def test_returns_404_when_not_found(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.get_annotation", AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations/nonexistent")
            assert resp.status_code == 404


class TestUpdateAnnotationRoute:
    async def test_updates_annotation(self):
        updated = Annotation(
            id="ann-001", tenant_id=TENANT_ID, title="Updated",
            text="", tags=[], starts_at=NOW, created_by=USER_ID, created_at=NOW,
        )
        app = _make_app()
        with patch("neoguard.api.routes.annotations.update_annotation", AsyncMock(return_value=updated)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/api/v1/annotations/ann-001", json={
                    "title": "Updated",
                })
            assert resp.status_code == 200
            assert resp.json()["title"] == "Updated"

    async def test_returns_404_when_not_found(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.update_annotation", AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/api/v1/annotations/nonexistent", json={
                    "title": "X",
                })
            assert resp.status_code == 404

    async def test_requires_write_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch("/api/v1/annotations/ann-001", json={
                "title": "X",
            })
        assert resp.status_code == 403


class TestDeleteAnnotationRoute:
    async def test_deletes_annotation(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.delete_annotation", AsyncMock(return_value=True)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/annotations/ann-001")
            assert resp.status_code == 204

    async def test_returns_404_when_not_found(self):
        app = _make_app()
        with patch("neoguard.api.routes.annotations.delete_annotation", AsyncMock(return_value=False)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/annotations/nonexistent")
            assert resp.status_code == 404

    async def test_requires_write_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/annotations/ann-001")
        assert resp.status_code == 403

    async def test_admin_scope_bypasses_write(self):
        app = _make_app(scopes=["admin"])
        with patch("neoguard.api.routes.annotations.delete_annotation", AsyncMock(return_value=True)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/annotations/ann-001")
            assert resp.status_code == 204


class TestTenantIsolation:
    async def test_create_uses_tenant_from_auth(self):
        app = _make_app(tenant_id="t-other")
        with patch("neoguard.api.routes.annotations.create_annotation", AsyncMock(return_value=_ANNOTATION)) as mock_create:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post("/api/v1/annotations", json={
                    "title": "Deploy",
                    "starts_at": NOW_ISO,
                })
            assert mock_create.call_args[0][0] == "t-other"

    async def test_list_uses_tenant_from_auth(self):
        app = _make_app(tenant_id="t-other")
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])) as mock_list:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.get("/api/v1/annotations")
            assert mock_list.call_args[0][0] == "t-other"

    async def test_super_admin_without_tenant_id_falls_back_to_session(self):
        app = _make_admin_app()
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])) as mock_list:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/annotations")
        assert resp.status_code == 200
        # Falls back to session tenant_id (TENANT_ID) instead of raising 400
        assert mock_list.call_args[0][0] == TENANT_ID

    async def test_super_admin_scopes_with_query_param(self):
        app = _make_admin_app()
        with patch("neoguard.api.routes.annotations.list_annotations", AsyncMock(return_value=[])) as mock_list:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.get("/api/v1/annotations", params={"tenant_id": "t-scoped"})
            assert mock_list.call_args[0][0] == "t-scoped"
