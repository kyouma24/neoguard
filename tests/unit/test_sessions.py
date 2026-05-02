"""Unit tests for session management (Redis-backed)."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import orjson
import pytest

from neoguard.models.users import TenantRole


@pytest.fixture()
def mock_redis():
    redis = AsyncMock()
    redis.set = AsyncMock()
    redis.get = AsyncMock(return_value=None)
    redis.delete = AsyncMock(return_value=1)
    redis.expire = AsyncMock()
    redis.ttl = AsyncMock(return_value=86400)
    redis.sadd = AsyncMock()
    redis.srem = AsyncMock()
    redis.smembers = AsyncMock(return_value=set())
    with patch("neoguard.services.auth.sessions.get_redis", return_value=redis):
        yield redis


USER_ID = UUID("01234567-89ab-cdef-0123-456789abcdef")
TENANT_ID = UUID("fedcba98-7654-3210-fedc-ba9876543210")


class TestCreateSession:
    async def test_creates_session_and_returns_id(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        session_id = await create_session(USER_ID, TENANT_ID, TenantRole.OWNER)
        assert isinstance(session_id, str)
        assert len(session_id) > 20

    async def test_stores_data_in_redis(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        session_id = await create_session(USER_ID, TENANT_ID, TenantRole.ADMIN, is_super_admin=True)
        mock_redis.set.assert_called_once()
        args = mock_redis.set.call_args
        key = args[0][0]
        data = orjson.loads(args[0][1])

        assert key == f"session:{session_id}"
        assert data["user_id"] == str(USER_ID)
        assert data["tenant_id"] == str(TENANT_ID)
        assert data["role"] == "admin"
        assert data["is_super_admin"] is True


class TestGetSession:
    async def test_returns_none_for_missing(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        result = await get_session("nonexistent")
        assert result is None

    async def test_returns_session_info(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "member",
            "is_super_admin": False,
        }).decode()
        mock_redis.get = AsyncMock(return_value=stored)

        result = await get_session("test-session-id")
        assert result is not None
        assert result.user_id == USER_ID
        assert result.tenant_id == TENANT_ID
        assert result.role == TenantRole.MEMBER
        assert result.is_super_admin is False

    async def test_refreshes_ttl_for_regular_user(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "owner",
            "is_super_admin": False,
        }).decode()
        mock_redis.get = AsyncMock(return_value=stored)

        await get_session("test-session-id")
        mock_redis.expire.assert_called_once()


class TestUpdateSessionTenant:
    async def test_updates_tenant_and_role(self, mock_redis):
        from neoguard.services.auth.sessions import update_session_tenant

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "owner",
            "is_super_admin": False,
        }).decode()
        mock_redis.get = AsyncMock(return_value=stored)

        new_tenant = UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        result = await update_session_tenant("test-id", new_tenant, TenantRole.MEMBER)
        assert result is True

        set_call = mock_redis.set.call_args
        data = orjson.loads(set_call[0][1])
        assert data["tenant_id"] == str(new_tenant)
        assert data["role"] == "member"

    async def test_returns_false_for_missing(self, mock_redis):
        from neoguard.services.auth.sessions import update_session_tenant

        result = await update_session_tenant("missing", TENANT_ID, TenantRole.VIEWER)
        assert result is False


class TestSuperAdminSessionExpiry:
    async def test_super_admin_gets_4h_ttl(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        await create_session(USER_ID, TENANT_ID, TenantRole.OWNER, is_super_admin=True)
        args = mock_redis.set.call_args
        assert args[1]["ex"] == 14400  # 4 hours

    async def test_regular_user_gets_30d_ttl(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        await create_session(USER_ID, TENANT_ID, TenantRole.MEMBER, is_super_admin=False)
        args = mock_redis.set.call_args
        assert args[1]["ex"] == 2592000  # 30 days

    async def test_ttl_override_takes_precedence(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        await create_session(USER_ID, TENANT_ID, TenantRole.OWNER, is_super_admin=True, ttl_override=3600)
        args = mock_redis.set.call_args
        assert args[1]["ex"] == 3600

    async def test_super_admin_no_sliding_refresh(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "owner",
            "is_super_admin": True,
        }).decode()
        mock_redis.get = AsyncMock(return_value=stored)

        await get_session("admin-session")
        mock_redis.expire.assert_not_called()

    async def test_regular_user_gets_sliding_refresh(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "member",
            "is_super_admin": False,
        }).decode()
        mock_redis.get = AsyncMock(return_value=stored)

        await get_session("user-session")
        mock_redis.expire.assert_called_once()


class TestDeleteSession:
    async def test_deletes_session(self, mock_redis):
        from neoguard.services.auth.sessions import delete_session

        result = await delete_session("test-id")
        assert result is True
        mock_redis.delete.assert_called_once_with("session:test-id")

    async def test_returns_false_when_not_found(self, mock_redis):
        from neoguard.services.auth.sessions import delete_session

        mock_redis.delete = AsyncMock(return_value=0)
        result = await delete_session("missing")
        assert result is False

    async def test_removes_from_user_index(self, mock_redis):
        from neoguard.services.auth.sessions import delete_session

        await delete_session("test-id", user_id=USER_ID)
        mock_redis.srem.assert_called_once_with(f"user_sessions:{USER_ID}", "test-id")


class TestCreateSessionIndex:
    async def test_adds_to_user_session_index(self, mock_redis):
        from neoguard.services.auth.sessions import create_session

        session_id = await create_session(USER_ID, TENANT_ID, TenantRole.OWNER)
        mock_redis.sadd.assert_called_once_with(f"user_sessions:{USER_ID}", session_id)


class TestListUserSessions:
    async def test_returns_active_sessions(self, mock_redis):
        from neoguard.services.auth.sessions import list_user_sessions

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "owner",
            "is_super_admin": False,
        }).decode()
        mock_redis.smembers = AsyncMock(return_value={"sess1", "sess2"})
        mock_redis.get = AsyncMock(return_value=stored)
        mock_redis.ttl = AsyncMock(return_value=3600)

        sessions = await list_user_sessions(USER_ID)
        assert len(sessions) == 2
        assert all(s["ttl_seconds"] == 3600 for s in sessions)

    async def test_cleans_up_stale_sessions(self, mock_redis):
        from neoguard.services.auth.sessions import list_user_sessions

        mock_redis.smembers = AsyncMock(return_value={"active", "expired"})
        mock_redis.get = AsyncMock(side_effect=[
            orjson.dumps({"user_id": str(USER_ID), "tenant_id": str(TENANT_ID), "role": "owner", "is_super_admin": False}).decode(),
            None,
        ])
        mock_redis.ttl = AsyncMock(return_value=7200)

        sessions = await list_user_sessions(USER_ID)
        assert len(sessions) == 1
        mock_redis.srem.assert_called_once()

    async def test_returns_empty_for_no_sessions(self, mock_redis):
        from neoguard.services.auth.sessions import list_user_sessions

        mock_redis.smembers = AsyncMock(return_value=set())
        sessions = await list_user_sessions(USER_ID)
        assert sessions == []


class TestDeleteAllUserSessions:
    async def test_deletes_all_except_current(self, mock_redis):
        from neoguard.services.auth.sessions import delete_all_user_sessions

        mock_redis.smembers = AsyncMock(return_value={"sess1", "sess2", "current"})
        count = await delete_all_user_sessions(USER_ID, except_session="current")
        assert count == 2

    async def test_deletes_all_when_no_exception(self, mock_redis):
        from neoguard.services.auth.sessions import delete_all_user_sessions

        mock_redis.smembers = AsyncMock(return_value={"sess1", "sess2"})
        count = await delete_all_user_sessions(USER_ID)
        assert count == 2
