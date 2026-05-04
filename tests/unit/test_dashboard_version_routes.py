"""Unit tests for dashboard version history API routes."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.dashboards import router
from neoguard.models.dashboards import Dashboard, DashboardPermissionLevel
from neoguard.models.dashboard_versions import DashboardVersion

TENANT_ID = "t-001"
USER_ID = "u-001"
NOW = datetime(2026, 5, 2, 12, 0, 0, tzinfo=UTC)

_DASHBOARD = Dashboard(
    id="dash-1",
    tenant_id=TENANT_ID,
    name="Prod Overview",
    description="Production metrics",
    panels=[],
    variables=[],
    groups=[],
    tags=["production"],
    created_at=NOW,
    updated_at=NOW,
)

_VERSION_1 = DashboardVersion(
    id="ver-1",
    dashboard_id="dash-1",
    version_number=1,
    data={"name": "Prod Overview v1", "description": "Old", "panels": [], "variables": [], "groups": [], "tags": []},
    change_summary="Auto-saved before update",
    created_by=USER_ID,
    created_at=NOW,
)

_VERSION_2 = DashboardVersion(
    id="ver-2",
    dashboard_id="dash-1",
    version_number=2,
    data={"name": "Prod Overview v2", "description": "Newer", "panels": [], "variables": [], "groups": [], "tags": []},
    change_summary="Auto-saved before update",
    created_by=USER_ID,
    created_at=NOW,
)


def _make_app(scopes=None, tenant_id=TENANT_ID, user_id=USER_ID, user_role="member"):
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = user_id
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes or ["read", "write"]
        request.state.is_super_admin = False
        request.state.user_role = user_role
        return await call_next(request)

    app.include_router(router)
    return app


def _make_readonly_app():
    return _make_app(scopes=["read"])


_PATCHES = {
    "get_dashboard": "neoguard.api.routes.dashboards.get_dashboard",
    "list_versions": "neoguard.api.routes.dashboards.list_versions",
    "get_version": "neoguard.api.routes.dashboards.get_version",
    "save_version": "neoguard.api.routes.dashboards.save_version",
    "update_dashboard": "neoguard.api.routes.dashboards.update_dashboard",
    "get_effective_permission": "neoguard.api.routes.dashboards.get_effective_permission",
}


class TestListVersionsRoute:
    @pytest.mark.asyncio
    async def test_returns_versions(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["list_versions"], AsyncMock(return_value=[_VERSION_2, _VERSION_1])),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/versions")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 2
            assert data[0]["version_number"] == 2
            assert data[1]["version_number"] == 1

    @pytest.mark.asyncio
    async def test_returns_404_for_unknown_dashboard(self):
        app = _make_app()
        with patch(_PATCHES["get_dashboard"], AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/unknown/versions")
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_applies_limit_and_offset(self):
        app = _make_app()
        mock_list = AsyncMock(return_value=[])
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["list_versions"], mock_list),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/versions?limit=5&offset=10")
            assert resp.status_code == 200
            mock_list.assert_called_once_with("dash-1", limit=5, offset=10, tenant_id=TENANT_ID)

    @pytest.mark.asyncio
    async def test_caps_limit_at_100(self):
        app = _make_app()
        mock_list = AsyncMock(return_value=[])
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["list_versions"], mock_list),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.get("/api/v1/dashboards/dash-1/versions?limit=999")
            mock_list.assert_called_once_with("dash-1", limit=100, offset=0, tenant_id=TENANT_ID)

    @pytest.mark.asyncio
    async def test_readonly_scope_can_list(self):
        app = _make_readonly_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["list_versions"], AsyncMock(return_value=[])),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/versions")
            assert resp.status_code == 200


class TestGetVersionRoute:
    @pytest.mark.asyncio
    async def test_returns_version(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=_VERSION_1)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/versions/1")
            assert resp.status_code == 200
            data = resp.json()
            assert data["version_number"] == 1
            assert data["data"]["name"] == "Prod Overview v1"

    @pytest.mark.asyncio
    async def test_returns_404_when_version_missing(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=None)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/dash-1/versions/99")
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_when_dashboard_missing(self):
        app = _make_app()
        with patch(_PATCHES["get_dashboard"], AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/dashboards/unknown/versions/1")
            assert resp.status_code == 404


class TestRestoreVersionRoute:
    _perm_mock = AsyncMock(return_value=DashboardPermissionLevel.EDIT)

    @pytest.mark.asyncio
    async def test_restores_version(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=_VERSION_1)),
            patch(_PATCHES["save_version"], AsyncMock(return_value=_VERSION_2)),
            patch(_PATCHES["update_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/dash-1/versions/1/restore")
            assert resp.status_code == 200
            data = resp.json()
            assert data["name"] == "Prod Overview"

    @pytest.mark.asyncio
    async def test_saves_current_before_restore(self):
        app = _make_app()
        mock_save = AsyncMock(return_value=_VERSION_2)
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=_VERSION_1)),
            patch(_PATCHES["save_version"], mock_save),
            patch(_PATCHES["update_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post("/api/v1/dashboards/dash-1/versions/1/restore")
            mock_save.assert_called_once()
            call_kwargs = mock_save.call_args
            assert "Auto-saved before restore to v1" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_dashboard(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=None)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/unknown/versions/1/restore")
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_version(self):
        app = _make_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=None)),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/dash-1/versions/99/restore")
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_readonly_scope_cannot_restore(self):
        app = _make_readonly_app()
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=_VERSION_1)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/v1/dashboards/dash-1/versions/1/restore")
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_applies_version_data_to_update(self):
        app = _make_app()
        mock_update = AsyncMock(return_value=_DASHBOARD)
        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch(_PATCHES["get_version"], AsyncMock(return_value=_VERSION_1)),
            patch(_PATCHES["save_version"], AsyncMock(return_value=_VERSION_2)),
            patch(_PATCHES["update_dashboard"], mock_update),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                await client.post("/api/v1/dashboards/dash-1/versions/1/restore")
            mock_update.assert_called_once()
            args = mock_update.call_args[0]
            assert args[0] == TENANT_ID
            assert args[1] == "dash-1"
            update_data = args[2]
            assert update_data.name == "Prod Overview v1"


class TestUpdateSavesVersion:
    @pytest.mark.asyncio
    async def test_update_creates_version_in_transaction(self):
        from unittest.mock import MagicMock

        app = _make_app()
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"id": "ver-1", "dashboard_id": "dash-1", "version_number": 1}
        mock_conn.execute.return_value = "UPDATE 1"

        tx = MagicMock()
        tx.__aenter__ = AsyncMock(return_value=None)
        tx.__aexit__ = AsyncMock(return_value=False)
        mock_conn.transaction = MagicMock(return_value=tx)

        acq = MagicMock()
        acq.__aenter__ = AsyncMock(return_value=mock_conn)
        acq.__aexit__ = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.acquire.return_value = acq

        async def fake_get_pool():
            return mock_pool

        with (
            patch(_PATCHES["get_dashboard"], AsyncMock(return_value=_DASHBOARD)),
            patch("neoguard.api.routes.dashboards.get_pool", fake_get_pool),
            patch(_PATCHES["get_effective_permission"], AsyncMock(return_value=DashboardPermissionLevel.EDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch("/api/v1/dashboards/dash-1", json={"name": "Updated"})
            assert resp.status_code == 200
            mock_conn.fetchrow.assert_called_once()
            insert_sql = mock_conn.fetchrow.call_args[0][0]
            assert "INSERT INTO dashboard_versions" in insert_sql
            mock_conn.execute.assert_called_once()
            update_sql = mock_conn.execute.call_args[0][0]
            assert "UPDATE dashboards SET" in update_sql
