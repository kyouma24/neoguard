"""Unit tests for password reset service."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from neoguard.services.auth.password_reset import (
    MAX_REQUESTS_PER_HOUR,
    TOKEN_TTL,
    _hash_token,
    check_rate_limit,
    create_reset_token,
    update_user_password,
    validate_and_consume_token,
)


@pytest.fixture
def mock_pool():
    pool = AsyncMock()
    with patch("neoguard.services.auth.password_reset.get_pool", return_value=pool):
        yield pool


class TestHashToken:
    def test_deterministic(self):
        assert _hash_token("abc") == _hash_token("abc")

    def test_different_inputs_differ(self):
        assert _hash_token("abc") != _hash_token("def")

    def test_returns_hex_sha256(self):
        expected = hashlib.sha256(b"test").hexdigest()
        assert _hash_token("test") == expected


class TestCheckRateLimit:
    async def test_within_limit_returns_true(self, mock_pool):
        mock_pool.fetchval.return_value = 0
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        assert await check_rate_limit(user_id) is True

    async def test_at_limit_returns_false(self, mock_pool):
        mock_pool.fetchval.return_value = MAX_REQUESTS_PER_HOUR
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        assert await check_rate_limit(user_id) is False

    async def test_over_limit_returns_false(self, mock_pool):
        mock_pool.fetchval.return_value = MAX_REQUESTS_PER_HOUR + 5
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        assert await check_rate_limit(user_id) is False


class TestCreateResetToken:
    async def test_returns_urlsafe_string(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        token = await create_reset_token(user_id)
        assert isinstance(token, str)
        assert len(token) > 20

    async def test_stores_hashed_token(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        token = await create_reset_token(user_id)
        call_args = mock_pool.execute.call_args
        stored_hash = call_args[0][3]
        assert stored_hash == _hash_token(token)

    async def test_sets_expiry(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        before = datetime.now(timezone.utc)
        await create_reset_token(user_id)
        call_args = mock_pool.execute.call_args
        expires_at = call_args[0][4]
        after = datetime.now(timezone.utc)
        assert before + TOKEN_TTL <= expires_at <= after + TOKEN_TTL

    async def test_unique_tokens(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        tokens = set()
        for _ in range(50):
            t = await create_reset_token(user_id)
            tokens.add(t)
        assert len(tokens) == 50


class TestValidateAndConsumeToken:
    async def test_valid_token_returns_user_id(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        token_id = UUID("00000000-0000-0000-0000-000000000099")
        mock_pool.fetchrow.return_value = {
            "id": token_id,
            "user_id": user_id,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
            "used_at": None,
        }
        result = await validate_and_consume_token("some_token")
        assert result == user_id
        mock_pool.execute.assert_called_once()

    async def test_nonexistent_token_returns_none(self, mock_pool):
        mock_pool.fetchrow.return_value = None
        result = await validate_and_consume_token("bad_token")
        assert result is None

    async def test_already_used_returns_none(self, mock_pool):
        mock_pool.fetchrow.return_value = {
            "id": UUID("00000000-0000-0000-0000-000000000099"),
            "user_id": UUID("00000000-0000-0000-0000-000000000001"),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
            "used_at": datetime.now(timezone.utc) - timedelta(minutes=5),
        }
        result = await validate_and_consume_token("used_token")
        assert result is None
        mock_pool.execute.assert_not_called()

    async def test_expired_token_returns_none(self, mock_pool):
        mock_pool.fetchrow.return_value = {
            "id": UUID("00000000-0000-0000-0000-000000000099"),
            "user_id": UUID("00000000-0000-0000-0000-000000000001"),
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "used_at": None,
        }
        result = await validate_and_consume_token("expired_token")
        assert result is None
        mock_pool.execute.assert_not_called()


class TestUpdateUserPassword:
    async def test_updates_password_hash(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        await update_user_password(user_id, "new_password_123")
        assert mock_pool.execute.call_count == 2
        update_call = mock_pool.execute.call_args_list[0]
        assert "password_hash" in update_call[0][0]
        assert update_call[0][2] == user_id

    async def test_invalidates_remaining_tokens(self, mock_pool):
        user_id = UUID("00000000-0000-0000-0000-000000000001")
        await update_user_password(user_id, "new_password_123")
        invalidate_call = mock_pool.execute.call_args_list[1]
        assert "used_at" in invalidate_call[0][0]
        assert invalidate_call[0][1] == user_id
