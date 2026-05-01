"""Unit tests for tenant context (RLS GUC enforcement)."""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from neoguard.db.timescale.tenant_ctx import current_tenant_id, tenant_connection


class TestCurrentTenantIdContextVar:
    def test_default_is_none(self):
        assert current_tenant_id.get() is None

    def test_set_and_get(self):
        token = current_tenant_id.set("test-tenant-id")
        assert current_tenant_id.get() == "test-tenant-id"
        current_tenant_id.reset(token)
        assert current_tenant_id.get() is None


def _mock_pool_with_conn():
    conn = AsyncMock()
    pool = AsyncMock()

    @asynccontextmanager
    async def fake_acquire():
        yield conn

    pool.acquire = fake_acquire
    return pool, conn


class TestTenantConnection:
    async def test_sets_guc_with_explicit_tenant_id(self):
        pool, conn = _mock_pool_with_conn()

        with patch("neoguard.db.timescale.tenant_ctx.get_pool", AsyncMock(return_value=pool)):
            async with tenant_connection("my-tenant-123") as c:
                assert c is conn

        conn.execute.assert_any_call(
            "SELECT set_config('app.current_tenant_id', $1, false)", "my-tenant-123"
        )
        conn.execute.assert_any_call(
            "SELECT set_config('app.current_tenant_id', '', false)"
        )

    async def test_uses_contextvar_when_no_explicit_id(self):
        pool, conn = _mock_pool_with_conn()

        token = current_tenant_id.set("from-contextvar")
        try:
            with patch("neoguard.db.timescale.tenant_ctx.get_pool", AsyncMock(return_value=pool)):
                async with tenant_connection() as c:
                    assert c is conn

            conn.execute.assert_any_call(
                "SELECT set_config('app.current_tenant_id', $1, false)", "from-contextvar"
            )
        finally:
            current_tenant_id.reset(token)

    async def test_skips_guc_when_no_tenant(self):
        pool, conn = _mock_pool_with_conn()

        with patch("neoguard.db.timescale.tenant_ctx.get_pool", AsyncMock(return_value=pool)):
            async with tenant_connection() as c:
                assert c is conn

        assert conn.execute.call_count == 1
        conn.execute.assert_called_with(
            "SELECT set_config('app.current_tenant_id', '', false)"
        )

    async def test_resets_guc_even_on_exception(self):
        pool, conn = _mock_pool_with_conn()

        with patch("neoguard.db.timescale.tenant_ctx.get_pool", AsyncMock(return_value=pool)):
            try:
                async with tenant_connection("fail-tenant") as c:
                    raise ValueError("boom")
            except ValueError:
                pass

        conn.execute.assert_any_call(
            "SELECT set_config('app.current_tenant_id', '', false)"
        )
