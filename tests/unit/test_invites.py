"""Unit tests for invite management."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest

from neoguard.services.auth.invites import accept_invite, create_invite, get_pending_invites_for_email

USER_ID = UUID("01234567-89ab-cdef-0123-456789abcdef")
TENANT_ID = UUID("fedcba98-7654-3210-fedc-ba9876543210")
INVITE_ID = UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")


class TestCreateInvite:
    async def test_creates_invite_record(self):
        mock_pool = AsyncMock()
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": INVITE_ID, "tenant_id": TENANT_ID, "email": "new@co.com",
            "role": "member", "invited_by": USER_ID, "token_hash": "hashed",
            "expires_at": "2025-01-08T00:00:00Z", "accepted_at": None,
            "created_at": "2025-01-01T00:00:00Z",
        })
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            result = await create_invite(TENANT_ID, "new@co.com", "member", USER_ID)
        assert result["email"] == "new@co.com"
        assert result["role"] == "member"
        mock_pool.fetchrow.assert_called_once()


class TestGetPendingInvites:
    async def test_returns_pending_invites(self):
        mock_pool = AsyncMock()
        mock_pool.fetch = AsyncMock(return_value=[
            {"id": INVITE_ID, "tenant_id": TENANT_ID, "email": "test@co.com",
             "role": "admin", "invited_by": USER_ID, "tenant_name": "Acme",
             "token_hash": "x", "expires_at": "2099-01-01T00:00:00Z",
             "accepted_at": None, "created_at": "2025-01-01T00:00:00Z"},
        ])
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            invites = await get_pending_invites_for_email("test@co.com")
        assert len(invites) == 1
        assert invites[0]["role"] == "admin"
        assert invites[0]["tenant_name"] == "Acme"

    async def test_returns_empty_when_none(self):
        mock_pool = AsyncMock()
        mock_pool.fetch = AsyncMock(return_value=[])
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            invites = await get_pending_invites_for_email("nobody@co.com")
        assert invites == []


class TestAcceptInvite:
    async def test_accepts_and_creates_membership(self):
        mock_pool = AsyncMock()
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": INVITE_ID, "tenant_id": TENANT_ID, "email": "test@co.com",
            "role": "member", "invited_by": USER_ID,
        })
        mock_pool.fetchval = AsyncMock(return_value=None)
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            result = await accept_invite(INVITE_ID, USER_ID)
        assert result is True
        assert mock_pool.execute.call_count == 2  # INSERT membership + UPDATE accepted_at

    async def test_skips_existing_membership(self):
        mock_pool = AsyncMock()
        mock_pool.fetchrow = AsyncMock(return_value={
            "id": INVITE_ID, "tenant_id": TENANT_ID, "email": "test@co.com",
            "role": "member", "invited_by": USER_ID,
        })
        mock_pool.fetchval = AsyncMock(return_value=1)  # already a member
        mock_pool.execute = AsyncMock()
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            result = await accept_invite(INVITE_ID, USER_ID)
        assert result is True
        assert mock_pool.execute.call_count == 1  # only UPDATE accepted_at

    async def test_returns_false_for_expired(self):
        mock_pool = AsyncMock()
        mock_pool.fetchrow = AsyncMock(return_value=None)
        with patch("neoguard.services.auth.invites.get_pool", AsyncMock(return_value=mock_pool)):
            result = await accept_invite(INVITE_ID, USER_ID)
        assert result is False
