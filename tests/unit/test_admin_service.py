"""Unit tests for admin service functions."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest


@pytest.fixture()
def mock_pool():
    pool = AsyncMock()
    return pool


USER_ID = UUID("01234567-89ab-cdef-0123-456789abcdef")
TENANT_ID = UUID("fedcba98-7654-3210-fedc-ba9876543210")


class TestListAllTenants:
    async def test_returns_tenants_with_member_count(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": TENANT_ID, "slug": "acme", "name": "Acme", "tier": "free",
             "status": "active", "member_count": 3, "created_at": "2024-01-01"},
        ])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import list_all_tenants
            result = await list_all_tenants()
            assert len(result) == 1
            assert result[0]["member_count"] == 3

    async def test_filters_by_status(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import list_all_tenants
            await list_all_tenants(status="suspended")
            call_args = mock_pool.fetch.call_args[0]
            assert "status" in call_args[0].lower() or "$1" in call_args[0]


class TestListAllUsers:
    async def test_returns_users_with_tenant_count(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": USER_ID, "email": "a@b.com", "name": "A", "is_super_admin": False,
             "is_active": True, "email_verified": False, "created_at": "2024-01-01",
             "updated_at": None, "tenant_count": 2},
        ])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import list_all_users
            result = await list_all_users()
            assert len(result) == 1
            assert result[0]["tenant_count"] == 2


class TestSetTenantStatus:
    async def test_updates_and_returns_tenant(self, mock_pool):
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": TENANT_ID, "slug": "acme", "name": "Acme", "tier": "free",
            "status": "suspended", "created_at": "2024-01-01",
        })
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import set_tenant_status
            result = await set_tenant_status(TENANT_ID, "suspended")
            assert result is not None
            assert result["status"] == "suspended"

    async def test_returns_none_for_missing(self, mock_pool):
        mock_pool.fetchrow = AsyncMock(return_value=None)
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import set_tenant_status
            result = await set_tenant_status(TENANT_ID, "active")
            assert result is None


class TestSetSuperAdmin:
    async def test_grants_super_admin(self, mock_pool):
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": USER_ID, "email": "a@b.com", "name": "A", "is_super_admin": True,
            "is_active": True, "email_verified": False, "created_at": "2024-01-01",
            "updated_at": None,
        })
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import set_super_admin
            result = await set_super_admin(USER_ID, True)
            assert result is not None
            assert result["is_super_admin"] is True


class TestSetUserActive:
    async def test_deactivates_user(self, mock_pool):
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": USER_ID, "email": "a@b.com", "name": "A", "is_super_admin": False,
            "is_active": False, "email_verified": False, "created_at": "2024-01-01",
            "updated_at": None,
        })
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import set_user_active
            result = await set_user_active(USER_ID, False)
            assert result is not None
            assert result["is_active"] is False


class TestWritePlatformAudit:
    async def test_writes_audit_entry(self, mock_pool):
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import write_platform_audit
            await write_platform_audit(
                actor_id=USER_ID,
                action="user.grant_super_admin",
                target_type="user",
                target_id=str(TENANT_ID),
            )
            mock_pool.execute.assert_called_once()


class TestGetPlatformStats:
    async def test_returns_stats(self, mock_pool):
        mock_pool.fetchval = AsyncMock(side_effect=[10, 8, 25, 20, 45, 5])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_platform_stats
            result = await get_platform_stats()
            assert result["tenants"]["total"] == 10
            assert result["tenants"]["active"] == 8
            assert result["users"]["total"] == 25
            assert result["users"]["active"] == 20
            assert result["memberships"] == 45
            assert result["api_keys_active"] == 5


class TestWriteTenantAudit:
    async def test_writes_tenant_audit_entry(self, mock_pool):
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import write_tenant_audit
            await write_tenant_audit(
                tenant_id=TENANT_ID,
                action="member.added",
                resource_type="membership",
                resource_id=str(USER_ID),
                actor_id=USER_ID,
                details={"email": "new@co.com", "role": "member"},
                ip_address="10.0.0.1",
            )
            mock_pool.execute.assert_called_once()
            sql = mock_pool.execute.call_args[0][0]
            assert "INSERT INTO audit_log" in sql

    async def test_writes_without_optional_fields(self, mock_pool):
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import write_tenant_audit
            await write_tenant_audit(
                tenant_id=TENANT_ID,
                action="tenant.updated",
                resource_type="tenant",
            )
            mock_pool.execute.assert_called_once()


class TestGetTenantAuditLog:
    async def test_returns_entries_for_tenant(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": USER_ID, "tenant_id": TENANT_ID, "actor_id": USER_ID,
             "actor_email": "admin@co.com", "actor_name": "Admin",
             "actor_type": "user", "action": "member.added",
             "resource_type": "membership", "resource_id": str(USER_ID),
             "details": "{}", "ip_address": "127.0.0.1", "created_at": "2024-01-01"},
        ])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_tenant_audit_log
            result = await get_tenant_audit_log(TENANT_ID)
            assert len(result) == 1
            assert result[0]["action"] == "member.added"
            assert result[0]["tenant_id"] == TENANT_ID

    async def test_passes_limit_and_offset(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_tenant_audit_log
            await get_tenant_audit_log(TENANT_ID, limit=10, offset=20)
            call_args = mock_pool.fetch.call_args[0]
            assert call_args[1] == TENANT_ID
            assert call_args[2] == 10
            assert call_args[3] == 20


class TestWriteSecurityLog:
    async def test_writes_security_entry(self, mock_pool):
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import write_security_log
            await write_security_log(
                event_type="login",
                success=True,
                user_id=USER_ID,
                ip_address="10.0.0.1",
                user_agent="Mozilla/5.0",
            )
            mock_pool.execute.assert_called_once()
            sql = mock_pool.execute.call_args[0][0]
            assert "INSERT INTO security_log" in sql

    async def test_writes_without_user_id(self, mock_pool):
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import write_security_log
            await write_security_log(
                event_type="login", success=False,
                details={"email": "bad@actor.com"},
            )
            mock_pool.execute.assert_called_once()


class TestGetSecurityLog:
    async def test_returns_entries(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": USER_ID, "user_id": USER_ID, "user_email": "a@b.com",
             "user_name": "Admin", "event_type": "login", "success": True,
             "ip_address": "10.0.0.1", "user_agent": "Mozilla",
             "details": "{}", "created_at": "2024-01-01"},
        ])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_security_log
            result = await get_security_log()
            assert len(result) == 1
            assert result[0]["event_type"] == "login"

    async def test_filters_by_event_type(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_security_log
            await get_security_log(event_type="login")
            sql = mock_pool.fetch.call_args[0][0]
            assert "event_type" in sql

    async def test_filters_by_success(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_security_log
            await get_security_log(success=False)
            sql = mock_pool.fetch.call_args[0][0]
            assert "success" in sql


class TestGetPlatformAuditLog:
    async def test_returns_entries(self, mock_pool):
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": USER_ID, "actor_id": USER_ID, "actor_email": "admin@co.com",
             "actor_name": "Admin", "action": "user.activate", "target_type": "user",
             "target_id": str(TENANT_ID), "reason": "", "details": "{}",
             "ip_address": "127.0.0.1", "created_at": "2024-01-01"},
        ])
        with patch("neoguard.services.auth.admin.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.admin import get_platform_audit_log
            result = await get_platform_audit_log()
            assert len(result) == 1
            assert result[0]["action"] == "user.activate"
