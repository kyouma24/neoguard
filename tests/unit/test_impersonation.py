"""Unit tests for impersonation — session creation, write-blocking, session restore."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from neoguard.models.users import SessionInfo, TenantRole


ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")
TARGET_ID = UUID("00000000-0000-0000-0000-000000000002")
TENANT_ID = UUID("00000000-0000-0000-0000-000000000010")


class TestSessionImpersonation:
    async def test_create_session_with_impersonated_by(self):
        mock_redis = AsyncMock()
        with patch("neoguard.services.auth.sessions.get_redis", return_value=mock_redis):
            from neoguard.services.auth.sessions import create_session
            session_id = await create_session(
                user_id=TARGET_ID,
                tenant_id=TENANT_ID,
                role=TenantRole.MEMBER,
                impersonated_by=ADMIN_ID,
                ttl_override=1800,
            )
            assert isinstance(session_id, str)
            call_args = mock_redis.set.call_args
            import orjson
            data = orjson.loads(call_args[0][1])
            assert data["impersonated_by"] == str(ADMIN_ID)
            assert call_args[1]["ex"] == 1800

    async def test_get_session_returns_impersonated_by(self):
        import orjson
        session_data = orjson.dumps({
            "user_id": str(TARGET_ID),
            "tenant_id": str(TENANT_ID),
            "role": "member",
            "is_super_admin": False,
            "impersonated_by": str(ADMIN_ID),
        }).decode()

        mock_redis = AsyncMock()
        mock_redis.get.return_value = session_data
        with patch("neoguard.services.auth.sessions.get_redis", return_value=mock_redis):
            from neoguard.services.auth.sessions import get_session
            info = await get_session("test-session-id")
            assert info is not None
            assert info.impersonated_by == ADMIN_ID
            assert info.user_id == TARGET_ID

    async def test_get_session_without_impersonation(self):
        import orjson
        session_data = orjson.dumps({
            "user_id": str(TARGET_ID),
            "tenant_id": str(TENANT_ID),
            "role": "member",
            "is_super_admin": False,
        }).decode()

        mock_redis = AsyncMock()
        mock_redis.get.return_value = session_data
        with patch("neoguard.services.auth.sessions.get_redis", return_value=mock_redis):
            from neoguard.services.auth.sessions import get_session
            info = await get_session("test-session-id")
            assert info is not None
            assert info.impersonated_by is None

    async def test_store_and_get_admin_session(self):
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "admin-session-xyz"
        with patch("neoguard.services.auth.sessions.get_redis", return_value=mock_redis):
            from neoguard.services.auth.sessions import store_admin_session, get_admin_session
            await store_admin_session("impersonation-session", "admin-session-xyz", 1800)
            mock_redis.set.assert_called_once()
            result = await get_admin_session("impersonation-session")
            assert result == "admin-session-xyz"


class TestImpersonationModels:
    def test_session_info_with_impersonation(self):
        info = SessionInfo(
            user_id=TARGET_ID,
            tenant_id=TENANT_ID,
            role=TenantRole.MEMBER,
            is_super_admin=False,
            impersonated_by=ADMIN_ID,
        )
        assert info.impersonated_by == ADMIN_ID

    def test_session_info_without_impersonation(self):
        info = SessionInfo(
            user_id=TARGET_ID,
            tenant_id=TENANT_ID,
            role=TenantRole.MEMBER,
            is_super_admin=False,
        )
        assert info.impersonated_by is None

    def test_impersonate_request_validation(self):
        from neoguard.models.users import ImpersonateRequest
        req = ImpersonateRequest(
            user_id=TARGET_ID,
            reason="Investigating ticket #123",
            duration_minutes=30,
        )
        assert req.user_id == TARGET_ID
        assert req.duration_minutes == 30

    def test_impersonate_request_rejects_empty_reason(self):
        from neoguard.models.users import ImpersonateRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ImpersonateRequest(
                user_id=TARGET_ID,
                reason="",
                duration_minutes=30,
            )

    def test_impersonate_request_clamps_duration(self):
        from neoguard.models.users import ImpersonateRequest
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ImpersonateRequest(
                user_id=TARGET_ID,
                reason="test",
                duration_minutes=999,
            )

    def test_auth_response_includes_impersonation(self):
        from neoguard.models.users import AuthResponse, UserResponse, TenantResponse, TenantRole
        from datetime import datetime
        resp = AuthResponse(
            user=UserResponse(
                id=TARGET_ID,
                email="test@test.com",
                name="Test",
                is_super_admin=False,
                is_active=True,
                email_verified=True,
                created_at=datetime.now(),
            ),
            tenant=TenantResponse(
                id=TENANT_ID,
                slug="test",
                name="Test",
                tier="free",
                status="active",
                created_at=datetime.now(),
            ),
            role=TenantRole.MEMBER,
            is_impersonating=True,
            impersonated_by=str(ADMIN_ID),
        )
        assert resp.is_impersonating is True
        assert resp.impersonated_by == str(ADMIN_ID)
