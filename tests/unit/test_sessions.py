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

    async def test_refreshes_ttl(self, mock_redis):
        from neoguard.services.auth.sessions import get_session

        stored = orjson.dumps({
            "user_id": str(USER_ID),
            "tenant_id": str(TENANT_ID),
            "role": "owner",
            "is_super_admin": True,
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
