"""Unit tests for tenant routes — audit log endpoint."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.tenants import router

USER_ID = UUID("01234567-89ab-cdef-0123-456789abcdef")
TENANT_ID = UUID("fedcba98-7654-3210-fedc-ba9876543210")


def _make_app(user_id: UUID = USER_ID, tenant_id: UUID = TENANT_ID) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = user_id
        request.state.tenant_id = str(tenant_id)
        request.state.scopes = ["admin"]
        return await call_next(request)

    app.include_router(router)
    return app


SAMPLE_AUDIT = [
    {
        "id": UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        "tenant_id": TENANT_ID,
        "actor_id": USER_ID,
        "actor_email": "admin@co.com",
        "actor_name": "Admin",
        "actor_type": "user",
        "action": "member.added",
        "resource_type": "membership",
        "resource_id": str(USER_ID),
        "details": {},
        "ip_address": "127.0.0.1",
        "created_at": "2024-06-15T10:30:00+00:00",
    },
]


class TestTenantAuditLogRoute:
    async def test_returns_audit_entries(self):
        app = _make_app()
        with (
            patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value={"role": "owner"})),
            patch("neoguard.api.routes.tenants.get_tenant_audit_log", AsyncMock(return_value=SAMPLE_AUDIT)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["action"] == "member.added"
            assert data[0]["resource_type"] == "membership"

    async def test_admin_can_view(self):
        app = _make_app()
        with (
            patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value={"role": "admin"})),
            patch("neoguard.api.routes.tenants.get_tenant_audit_log", AsyncMock(return_value=[])),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log")
            assert resp.status_code == 200

    async def test_member_cannot_view(self):
        app = _make_app()
        with patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value={"role": "member"})):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log")
            assert resp.status_code == 403

    async def test_viewer_cannot_view(self):
        app = _make_app()
        with patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value={"role": "viewer"})):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log")
            assert resp.status_code == 403

    async def test_non_member_cannot_view(self):
        app = _make_app()
        with patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log")
            assert resp.status_code == 403

    async def test_respects_limit_offset(self):
        app = _make_app()
        mock_get = AsyncMock(return_value=[])
        with (
            patch("neoguard.api.routes.tenants.get_membership", AsyncMock(return_value={"role": "owner"})),
            patch("neoguard.api.routes.tenants.get_tenant_audit_log", mock_get),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(f"/api/v1/tenants/{TENANT_ID}/audit-log?limit=10&offset=20")
            assert resp.status_code == 200
            mock_get.assert_called_once_with(TENANT_ID, limit=10, offset=20)
