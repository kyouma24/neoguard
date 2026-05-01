"""Unit tests for bootstrap admin CLI."""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest


class TestBootstrapNewUser:
    async def test_creates_user_and_tenant(self):
        pool = AsyncMock()
        pool.fetchrow = AsyncMock(return_value=None)
        pool.fetchval = AsyncMock(side_effect=[0, None])
        pool.execute = AsyncMock()

        with patch("neoguard.db.timescale.connection.init_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.close_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.get_pool", AsyncMock(return_value=pool)):
            from neoguard.cli.bootstrap_admin import _bootstrap
            await _bootstrap("admin@test.com", "password123", "Admin")

        assert pool.execute.call_count == 3


class TestBootstrapExistingUser:
    async def test_promotes_existing_non_super_user(self):
        pool = AsyncMock()
        pool.fetchrow = AsyncMock(return_value={
            "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
            "is_super_admin": False,
        })
        pool.fetchval = AsyncMock(return_value=2)
        pool.execute = AsyncMock()

        with patch("neoguard.db.timescale.connection.init_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.close_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.get_pool", AsyncMock(return_value=pool)):
            from neoguard.cli.bootstrap_admin import _bootstrap
            await _bootstrap("existing@test.com", "password123", "Admin")

        assert pool.execute.call_count == 1

    async def test_skips_already_super_admin_with_tenants(self):
        pool = AsyncMock()
        pool.fetchrow = AsyncMock(return_value={
            "id": UUID("01234567-89ab-cdef-0123-456789abcdef"),
            "is_super_admin": True,
        })
        pool.fetchval = AsyncMock(return_value=1)
        pool.execute = AsyncMock()

        with patch("neoguard.db.timescale.connection.init_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.close_pool", AsyncMock()), \
             patch("neoguard.db.timescale.connection.get_pool", AsyncMock(return_value=pool)):
            from neoguard.cli.bootstrap_admin import _bootstrap
            await _bootstrap("admin@test.com", "password123", "Admin")

        pool.execute.assert_not_called()
