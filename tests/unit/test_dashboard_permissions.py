"""Unit tests for dashboard-level RBAC — models, service logic, and route enforcement."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.dashboards import router
from neoguard.models.dashboards import (
    Dashboard,
    DashboardPermissionLevel,
    DashboardPermissionResponse,
    DashboardPermissionSet,
    PERMISSION_HIERARCHY,
)
from neoguard.services.dashboard_permissions import (
    get_effective_permission,
    has_permission,
)


TENANT_ID = "t-001"
USER_ID = "019de4b2-dbb4-77f0-956c-af63a683138e"
OTHER_USER_ID = "019de963-ff52-7363-92f0-dbcfb65646fe"
NOW = datetime(2026, 5, 2, 12, 0, 0, tzinfo=UTC)

_DASHBOARD = Dashboard(
    id="dash-1",
    tenant_id=TENANT_ID,
    name="Test Dashboard",
    description="",
    panels=[],
    variables=[],
    groups=[],
    tags=[],
    created_by=USER_ID,
    created_at=NOW,
    updated_at=NOW,
)


def _make_app(scopes=None, tenant_id=TENANT_ID, user_id=USER_ID, user_role="member", is_super_admin=False):
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = user_id
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes or ["read", "write"]
        request.state.is_super_admin = is_super_admin
        request.state.user_role = user_role
        return await call_next(request)

    app.include_router(router)
    return app


_PATCHES = {
    "get_dashboard": "neoguard.api.routes.dashboards.get_dashboard",
    "get_effective_permission": "neoguard.api.routes.dashboards.get_effective_permission",
    "list_dashboard_permissions": "neoguard.api.routes.dashboards.list_dashboard_permissions",
    "set_dashboard_permission": "neoguard.api.routes.dashboards.set_dashboard_permission",
    "remove_dashboard_permission": "neoguard.api.routes.dashboards.remove_dashboard_permission",
    "delete_dashboard": "neoguard.api.routes.dashboards.delete_dashboard",
    "create_dashboard": "neoguard.api.routes.dashboards.create_dashboard",
}


# ---- Permission model tests ----

class TestPermissionHierarchy:
    def test_view_is_lowest(self):
        assert PERMISSION_HIERARCHY[DashboardPermissionLevel.VIEW] == 0

    def test_edit_above_view(self):
        assert PERMISSION_HIERARCHY[DashboardPermissionLevel.EDIT] > PERMISSION_HIERARCHY[DashboardPermissionLevel.VIEW]

    def test_admin_above_edit(self):
        assert PERMISSION_HIERARCHY[DashboardPermissionLevel.ADMIN] > PERMISSION_HIERARCHY[DashboardPermissionLevel.EDIT]


class TestHasPermission:
    def test_none_has_nothing(self):
        assert not has_permission(None, DashboardPermissionLevel.VIEW)

    def test_view_has_view(self):
        assert has_permission(DashboardPermissionLevel.VIEW, DashboardPermissionLevel.VIEW)

    def test_view_not_edit(self):
        assert not has_permission(DashboardPermissionLevel.VIEW, DashboardPermissionLevel.EDIT)

    def test_edit_has_view(self):
        assert has_permission(DashboardPermissionLevel.EDIT, DashboardPermissionLevel.VIEW)

    def test_edit_has_edit(self):
        assert has_permission(DashboardPermissionLevel.EDIT, DashboardPermissionLevel.EDIT)

    def test_edit_not_admin(self):
        assert not has_permission(DashboardPermissionLevel.EDIT, DashboardPermissionLevel.ADMIN)

    def test_admin_has_all(self):
        for level in DashboardPermissionLevel:
            assert has_permission(DashboardPermissionLevel.ADMIN, level)


# ---- Effective permission resolution tests ----

class TestGetEffectivePermission:
    @pytest.mark.asyncio
    async def test_super_admin_always_admin(self):
        result = await get_effective_permission("dash-1", USER_ID, tenant_role="viewer", is_super_admin=True)
        assert result == DashboardPermissionLevel.ADMIN

    @pytest.mark.asyncio
    async def test_tenant_owner_always_admin(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=None)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="owner")
        assert result == DashboardPermissionLevel.ADMIN

    @pytest.mark.asyncio
    async def test_tenant_admin_always_admin(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=None)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="admin")
        assert result == DashboardPermissionLevel.ADMIN

    @pytest.mark.asyncio
    async def test_member_default_edit(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=None)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="member")
        assert result == DashboardPermissionLevel.EDIT

    @pytest.mark.asyncio
    async def test_viewer_default_view(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=None)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="viewer")
        assert result == DashboardPermissionLevel.VIEW

    @pytest.mark.asyncio
    async def test_explicit_override_beats_role_default(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=DashboardPermissionLevel.ADMIN)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="viewer")
        assert result == DashboardPermissionLevel.ADMIN

    @pytest.mark.asyncio
    async def test_explicit_view_for_member_overrides_to_view(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=DashboardPermissionLevel.VIEW)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role="member")
        assert result == DashboardPermissionLevel.VIEW

    @pytest.mark.asyncio
    async def test_no_role_returns_none(self):
        with patch("neoguard.services.dashboard_permissions.get_user_permission", AsyncMock(return_value=None)):
            result = await get_effective_permission("dash-1", USER_ID, tenant_role=None)
        assert result is None


# ---- Route-level permission enforcement tests ----

class TestRoutePermissionEnforcement:
    @pytest.mark.asyncio
    async def test_viewer_cannot_update_dashboard(self):
        app = _make_app(user_role="viewer")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.VIEW)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/api/v1/dashboards/dash-1", json={"name": "Hacked"})
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_editor_can_update_dashboard(self):
        app = _make_app(user_role="member")
        mock_pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"id": "v1"})
        mock_conn.execute = AsyncMock(return_value="UPDATE 1")
        tx = AsyncMock()
        tx.__aenter__ = AsyncMock(return_value=None)
        tx.__aexit__ = AsyncMock(return_value=False)
        mock_conn.transaction = lambda: tx
        acq = AsyncMock()
        acq.__aenter__ = AsyncMock(return_value=mock_conn)
        acq.__aexit__ = AsyncMock(return_value=False)
        mock_pool.acquire = lambda: acq

        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
            patch("neoguard.api.routes.dashboards.get_pool", AsyncMock(return_value=mock_pool)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/api/v1/dashboards/dash-1", json={"name": "Updated"})
            assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_viewer_cannot_delete_dashboard(self):
        app = _make_app(user_role="viewer")
        with (
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.VIEW)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/dashboards/dash-1")
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_editor_cannot_delete_dashboard(self):
        app = _make_app(user_role="member")
        with (
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/dashboards/dash-1")
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_delete_dashboard(self):
        app = _make_app(user_role="admin", scopes=["read", "write", "admin"])
        with (
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.ADMIN)),
            patch(_PATCHES["delete_dashboard"], AsyncMock(return_value=True)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete("/api/v1/dashboards/dash-1")
            assert resp.status_code == 204


class TestPermissionRoutes:
    @pytest.mark.asyncio
    async def test_non_admin_cannot_list_permissions(self):
        app = _make_app(user_role="member")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/permissions")
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_list_permissions(self):
        app = _make_app(user_role="admin", is_super_admin=True)
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.ADMIN)),
            patch(_PATCHES["list_dashboard_permissions"], AsyncMock(return_value=[])),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/permissions")
            assert resp.status_code == 200
            assert resp.json() == []

    @pytest.mark.asyncio
    async def test_non_admin_cannot_set_permissions(self):
        app = _make_app(user_role="member")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/dash-1/permissions", json={"user_id": OTHER_USER_ID, "permission": "view"})
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_can_set_permissions(self):
        perm_response = DashboardPermissionResponse(
            id=1,
            dashboard_id="dash-1",
            user_id=UUID(OTHER_USER_ID),
            user_email="test@example.com",
            user_name="Test User",
            permission=DashboardPermissionLevel.VIEW,
            granted_by=UUID(USER_ID),
            created_at=NOW,
        )
        app = _make_app(user_role="admin", is_super_admin=True)
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.ADMIN)),
            patch(_PATCHES["set_dashboard_permission"], AsyncMock(return_value=perm_response)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/dash-1/permissions", json={"user_id": OTHER_USER_ID, "permission": "view"})
            assert resp.status_code == 201
            data = resp.json()
            assert data["permission"] == "view"
            assert data["user_email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_non_admin_cannot_delete_permissions(self):
        app = _make_app(user_role="member")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete(f"/api/v1/dashboards/dash-1/permissions/{OTHER_USER_ID}")
            assert resp.status_code == 403


class TestMyPermissionRoute:
    @pytest.mark.asyncio
    async def test_super_admin_gets_admin(self):
        app = _make_app(is_super_admin=True, user_role="admin")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.ADMIN)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/my-permission")
            assert resp.status_code == 200
            data = resp.json()
            assert data["permission"] == "admin"
            assert data["can_view"] is True
            assert data["can_edit"] is True
            assert data["can_admin"] is True

    @pytest.mark.asyncio
    async def test_viewer_gets_view_only(self):
        app = _make_app(user_role="viewer", scopes=["read"])
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.VIEW)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/my-permission")
            assert resp.status_code == 200
            data = resp.json()
            assert data["permission"] == "view"
            assert data["can_view"] is True
            assert data["can_edit"] is False
            assert data["can_admin"] is False

    @pytest.mark.asyncio
    async def test_member_gets_edit(self):
        app = _make_app(user_role="member")
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/my-permission")
            assert resp.status_code == 200
            data = resp.json()
            assert data["permission"] == "edit"
            assert data["can_view"] is True
            assert data["can_edit"] is True
            assert data["can_admin"] is False


class TestCreateDashboardSetsCreatedBy:
    @pytest.mark.asyncio
    async def test_created_by_is_set(self):
        app = _make_app()
        mock_create = AsyncMock(return_value=_DASHBOARD)
        with patch(_PATCHES["create_dashboard"], mock_create):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards", json={"name": "New", "panels": []})
            assert resp.status_code == 201
            mock_create.assert_called_once()
            call_kwargs = mock_create.call_args
            assert call_kwargs.kwargs.get("created_by") == USER_ID


class TestPermissionModelValidation:
    def test_permission_set_valid(self):
        ps = DashboardPermissionSet(user_id=UUID(OTHER_USER_ID), permission=DashboardPermissionLevel.VIEW)
        assert ps.permission == DashboardPermissionLevel.VIEW

    def test_permission_set_accepts_edit(self):
        ps = DashboardPermissionSet(user_id=UUID(OTHER_USER_ID), permission=DashboardPermissionLevel.EDIT)
        assert ps.permission == DashboardPermissionLevel.EDIT

    def test_permission_set_accepts_admin(self):
        ps = DashboardPermissionSet(user_id=UUID(OTHER_USER_ID), permission=DashboardPermissionLevel.ADMIN)
        assert ps.permission == DashboardPermissionLevel.ADMIN

    def test_permission_level_values(self):
        assert DashboardPermissionLevel.VIEW.value == "view"
        assert DashboardPermissionLevel.EDIT.value == "edit"
        assert DashboardPermissionLevel.ADMIN.value == "admin"
