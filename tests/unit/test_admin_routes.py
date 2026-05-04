"""Unit tests for admin panel routes."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from neoguard.api.routes.admin import router

USER_ID = UUID("01234567-89ab-cdef-0123-456789abcdef")
TENANT_ID = UUID("fedcba98-7654-3210-fedc-ba9876543210")


def _make_app(is_super_admin: bool = True, user_id: UUID = USER_ID) -> FastAPI:
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.user_id = user_id if is_super_admin else user_id
        request.state.is_super_admin = is_super_admin
        request.state.tenant_id = str(TENANT_ID)
        request.state.scopes = ["admin"]
        return await call_next(request)

    app.include_router(router)
    return app


class TestAdminStatsRoute:
    async def test_returns_stats(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.get_platform_stats", AsyncMock(return_value={
            "tenants": {"total": 5, "active": 4},
            "users": {"total": 10, "active": 9},
            "memberships": 15,
            "api_keys_active": 3,
        })):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/stats")
            assert resp.status_code == 200
            data = resp.json()
            assert data["tenants"]["total"] == 5
            assert data["api_keys_active"] == 3

    async def test_rejects_non_super_admin(self):
        app = _make_app(is_super_admin=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/stats")
        assert resp.status_code == 403


class TestAdminTenantsRoute:
    async def test_lists_tenants(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.list_all_tenants", AsyncMock(return_value=[
            {"id": TENANT_ID, "slug": "acme", "name": "Acme", "tier": "free",
             "status": "active", "member_count": 2, "created_at": "2024-01-01T00:00:00Z",
             "updated_at": None},
        ])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/tenants")
            assert resp.status_code == 200
            assert len(resp.json()) == 1


class TestAdminSetTenantStatus:
    async def test_suspends_tenant(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.set_tenant_status", AsyncMock(return_value={
            "id": TENANT_ID, "slug": "acme", "name": "Acme", "tier": "free",
            "status": "suspended", "member_count": 1, "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-02T00:00:00Z",
        })), patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/admin/tenants/{TENANT_ID}/status",
                    json={"status": "suspended"},
                )
            assert resp.status_code == 200
            assert resp.json()["status"] == "suspended"

    async def test_returns_404_for_missing(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.set_tenant_status", AsyncMock(return_value=None)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/admin/tenants/{TENANT_ID}/status",
                    json={"status": "active"},
                )
            assert resp.status_code == 404


class TestAdminUsersRoute:
    async def test_lists_users(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.list_all_users", AsyncMock(return_value=[
            {"id": USER_ID, "email": "a@b.com", "name": "A", "is_super_admin": False,
             "is_active": True, "email_verified": False, "tenant_count": 1,
             "created_at": "2024-01-01T00:00:00Z", "updated_at": None},
        ])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/users")
            assert resp.status_code == 200
            assert len(resp.json()) == 1


class TestAdminSetSuperAdmin:
    async def test_grants_super_admin(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.set_super_admin", AsyncMock(return_value={
            "id": TENANT_ID, "email": "user@test.com", "name": "User", "is_super_admin": True,
            "is_active": True, "email_verified": False, "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-02T00:00:00Z",
        })), patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/admin/users/{TENANT_ID}/super-admin",
                    json={"is_super_admin": True},
                )
            assert resp.status_code == 200
            assert resp.json()["is_super_admin"] is True

    async def test_cannot_revoke_own_super_admin(self):
        app = _make_app(user_id=USER_ID)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{USER_ID}/super-admin",
                json={"is_super_admin": False},
            )
        assert resp.status_code == 400


class TestAdminSetUserActive:
    async def test_deactivates_user(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.set_user_active", AsyncMock(return_value={
            "id": TENANT_ID, "email": "user@test.com", "name": "User", "is_super_admin": False,
            "is_active": False, "email_verified": False, "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-02T00:00:00Z",
        })), patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.patch(
                    f"/api/v1/admin/users/{TENANT_ID}/active",
                    json={"is_active": False},
                )
            assert resp.status_code == 200
            assert resp.json()["is_active"] is False

    async def test_cannot_deactivate_self(self):
        app = _make_app(user_id=USER_ID)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(
                f"/api/v1/admin/users/{USER_ID}/active",
                json={"is_active": False},
            )
        assert resp.status_code == 400


class TestAdminCreateTenant:
    async def test_creates_tenant(self):
        app = _make_app()
        created = {
            "id": TENANT_ID, "slug": "new-tenant", "name": "New Tenant", "tier": "free",
            "status": "active", "member_count": 0, "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        }
        with (
            patch("neoguard.api.routes.admin.admin_create_tenant", AsyncMock(return_value=created)),
            patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/admin/tenants",
                    json={"name": "New Tenant"},
                )
            assert resp.status_code == 201
            assert resp.json()["name"] == "New Tenant"

    async def test_creates_tenant_with_owner(self):
        app = _make_app()
        created = {
            "id": TENANT_ID, "slug": "new-tenant", "name": "New Tenant", "tier": "free",
            "status": "active", "member_count": 0, "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        }
        with (
            patch("neoguard.api.routes.admin.admin_create_tenant", AsyncMock(return_value=created)) as mock_create,
            patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/admin/tenants",
                    json={"name": "New Tenant", "owner_id": str(USER_ID)},
                )
            assert resp.status_code == 201
            mock_create.assert_called_once_with("New Tenant", owner_id=USER_ID)

    async def test_rejects_non_super_admin(self):
        app = _make_app(is_super_admin=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/tenants",
                json={"name": "Test"},
            )
        assert resp.status_code == 403


class TestAdminDeleteTenant:
    async def test_deletes_tenant(self):
        app = _make_app()
        with (
            patch("neoguard.api.routes.admin.admin_delete_tenant", AsyncMock(return_value=True)),
            patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete(f"/api/v1/admin/tenants/{TENANT_ID}")
            assert resp.status_code == 200
            assert resp.json()["message"] == "Tenant marked as deleted"

    async def test_returns_404_for_missing_or_already_deleted(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.admin_delete_tenant", AsyncMock(return_value=False)):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.delete(f"/api/v1/admin/tenants/{TENANT_ID}")
            assert resp.status_code == 404

    async def test_rejects_non_super_admin(self):
        app = _make_app(is_super_admin=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete(f"/api/v1/admin/tenants/{TENANT_ID}")
        assert resp.status_code == 403


class TestAdminCreateUser:
    async def test_creates_user(self):
        app = _make_app()
        created_user = {
            "id": TENANT_ID, "email": "new@test.com", "name": "New User",
            "is_super_admin": False, "is_active": True, "email_verified": False,
            "created_at": "2024-01-01T00:00:00Z", "updated_at": None,
        }
        with (
            patch("neoguard.api.routes.admin.get_user_by_email", AsyncMock(return_value=None)),
            patch("neoguard.api.routes.admin.create_user", AsyncMock(return_value=created_user)),
            patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/admin/users",
                    json={"email": "new@test.com", "password": "Secure1pass", "name": "New User"},
                )
            assert resp.status_code == 201
            assert resp.json()["email"] == "new@test.com"

    async def test_rejects_duplicate_email(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.get_user_by_email", AsyncMock(return_value={"id": USER_ID})):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/admin/users",
                    json={"email": "existing@test.com", "password": "Secure1pass", "name": "Dup"},
                )
            assert resp.status_code == 409

    async def test_creates_user_with_tenant(self):
        app = _make_app()
        created_user = {
            "id": TENANT_ID, "email": "new@test.com", "name": "New User",
            "is_super_admin": False, "is_active": True, "email_verified": False,
            "created_at": "2024-01-01T00:00:00Z", "updated_at": None,
        }
        mock_pool = AsyncMock()
        mock_pool.execute = AsyncMock()
        with (
            patch("neoguard.api.routes.admin.get_user_by_email", AsyncMock(return_value=None)),
            patch("neoguard.api.routes.admin.create_user", AsyncMock(return_value=created_user)),
            patch("neoguard.api.routes.admin.get_membership", AsyncMock(return_value=None)),
            patch("neoguard.api.routes.admin.write_platform_audit", AsyncMock()),
            patch("neoguard.db.timescale.connection.get_pool", AsyncMock(return_value=mock_pool)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/v1/admin/users",
                    json={
                        "email": "new@test.com", "password": "Secure1pass", "name": "New User",
                        "tenant_id": str(TENANT_ID), "role": "admin",
                    },
                )
            assert resp.status_code == 201
            mock_pool.execute.assert_called_once()

    async def test_rejects_non_super_admin(self):
        app = _make_app(is_super_admin=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/admin/users",
                json={"email": "new@test.com", "password": "Secure1pass", "name": "New"},
            )
        assert resp.status_code == 403


class TestAdminSecurityLog:
    async def test_returns_entries(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.get_security_log", AsyncMock(return_value=[
            {"id": USER_ID, "user_id": USER_ID, "user_email": "a@b.com",
             "user_name": "Admin", "event_type": "login", "success": True,
             "ip_address": "10.0.0.1", "user_agent": "Mozilla",
             "details": {}, "created_at": "2024-01-01T00:00:00Z"},
        ])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/security-log")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["event_type"] == "login"

    async def test_filters_by_event_type(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.get_security_log", AsyncMock(return_value=[])) as mock_fn:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/security-log?event_type=login&success=false")
            assert resp.status_code == 200
            mock_fn.assert_called_once()
            call_kwargs = mock_fn.call_args[1]
            assert call_kwargs["event_type"] == "login"
            assert call_kwargs["success"] is False

    async def test_rejects_non_super_admin(self):
        app = _make_app(is_super_admin=False)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/admin/security-log")
        assert resp.status_code == 403


class TestAdminAuditLog:
    async def test_returns_entries(self):
        app = _make_app()
        with patch("neoguard.api.routes.admin.get_platform_audit_log", AsyncMock(return_value=[
            {"id": USER_ID, "actor_id": USER_ID, "actor_email": "admin@co.com",
             "actor_name": "Admin", "action": "user.activate", "target_type": "user",
             "target_id": str(TENANT_ID), "reason": "", "details": {},
             "ip_address": "127.0.0.1", "created_at": "2024-01-01T00:00:00Z"},
        ])):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get("/api/v1/admin/audit-log")
            assert resp.status_code == 200
            assert len(resp.json()) == 1
