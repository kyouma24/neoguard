"""Unit tests for user/tenant service functions."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

from neoguard.services.auth.users import slugify


class TestSlugify:
    def test_simple_name(self):
        assert slugify("Acme Corp") == "acme-corp"

    def test_special_characters(self):
        assert slugify("My Company! #1") == "my-company-1"

    def test_leading_trailing_hyphens(self):
        assert slugify("---test---") == "test"

    def test_empty_returns_tenant(self):
        assert slugify("!!!") == "tenant"

    def test_unicode(self):
        result = slugify("Company Üniversal")
        assert result == "company-niversal" or "company" in result

    def test_multiple_spaces(self):
        assert slugify("a   b   c") == "a-b-c"


class TestCreateUser:
    @pytest.fixture()
    def mock_pool(self):
        pool = AsyncMock()
        pool.fetchrow = AsyncMock(return_value={
            "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
            "email": "test@example.com",
            "name": "Test User",
            "is_super_admin": False,
            "is_active": True,
            "email_verified": False,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        })
        return pool

    async def test_create_user_returns_dict(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)):
            from neoguard.services.auth.users import create_user
            result = await create_user("test@example.com", "password123", "Test User")
            assert result["email"] == "test@example.com"
            assert result["name"] == "Test User"

    async def test_create_user_hashes_password(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)), \
             patch("neoguard.services.auth.users.hash_password") as mock_hash:
            mock_hash.return_value = "$argon2id$v=19$..."
            from neoguard.services.auth.users import create_user
            await create_user("test@example.com", "mypassword", "Name")
            mock_hash.assert_called_once_with("mypassword")


class TestAuthenticateUser:
    @pytest.fixture()
    def mock_pool(self):
        pool = AsyncMock()
        return pool

    async def test_returns_none_for_unknown_email(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)):
            mock_pool.fetchrow = AsyncMock(return_value=None)
            from neoguard.services.auth.users import authenticate_user
            result = await authenticate_user("unknown@example.com", "pass")
            assert result is None

    async def test_returns_none_for_inactive_user(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)):
            mock_pool.fetchrow = AsyncMock(return_value={
                "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
                "email": "test@example.com",
                "is_active": False,
                "password_hash": "$argon2id$v=19$...",
            })
            from neoguard.services.auth.users import authenticate_user
            result = await authenticate_user("test@example.com", "pass")
            assert result is None

    async def test_returns_none_for_wrong_password(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)), \
             patch("neoguard.services.auth.users.verify_password", return_value=False):
            mock_pool.fetchrow = AsyncMock(return_value={
                "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
                "email": "test@example.com",
                "is_active": True,
                "password_hash": "$argon2id$v=19$...",
            })
            from neoguard.services.auth.users import authenticate_user
            result = await authenticate_user("test@example.com", "wrongpass")
            assert result is None

    async def test_returns_user_for_correct_password(self, mock_pool):
        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=mock_pool)), \
             patch("neoguard.services.auth.users.verify_password", return_value=True), \
             patch("neoguard.services.auth.users.needs_rehash", return_value=False):
            user_row = {
                "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
                "email": "test@example.com",
                "name": "Test",
                "is_active": True,
                "is_super_admin": False,
                "password_hash": "$argon2id$v=19$...",
            }
            mock_pool.fetchrow = AsyncMock(return_value=user_row)
            from neoguard.services.auth.users import authenticate_user
            result = await authenticate_user("test@example.com", "correct")
            assert result is not None
            assert result["email"] == "test@example.com"


class TestCreateTenant:
    async def test_creates_tenant_with_slug(self):
        pool = AsyncMock()
        pool.fetchval = AsyncMock(return_value=None)
        pool.fetchrow = AsyncMock(return_value={
            "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
            "slug": "acme-corp",
            "name": "Acme Corp",
            "tier": "free",
            "status": "active",
            "quotas": {},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": None,
        })
        pool.execute = AsyncMock()

        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.auth.users import create_tenant
            result = await create_tenant("Acme Corp", UUID("fedcba98-7654-3210-fedc-ba9876543210"))
            assert result["name"] == "Acme Corp"
            pool.execute.assert_called_once()


class TestMemberManagement:
    async def test_remove_member_prevents_last_owner(self):
        pool = AsyncMock()
        pool.fetchval = AsyncMock(side_effect=["owner", 1])

        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.auth.users import remove_member
            result = await remove_member(
                UUID("01234567-89ab-cdef-0123-456789abcdef"),
                UUID("fedcba98-7654-3210-fedc-ba9876543210"),
            )
            assert result is False

    async def test_update_role_prevents_last_owner_demotion(self):
        pool = AsyncMock()
        pool.fetchval = AsyncMock(side_effect=[1, "owner"])

        with patch("neoguard.services.auth.users.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.auth.users import update_member_role
            result = await update_member_role(
                UUID("01234567-89ab-cdef-0123-456789abcdef"),
                UUID("fedcba98-7654-3210-fedc-ba9876543210"),
                "member",
            )
            assert result is False
