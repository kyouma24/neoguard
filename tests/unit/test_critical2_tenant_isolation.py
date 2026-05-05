"""CRITICAL-2: Super admin unbounded query elimination tests.

Tests the new get_query_tenant_id dependency, compiler defense-in-depth,
and cache key namespace fix.
"""
from __future__ import annotations

import hashlib
from unittest.mock import MagicMock, patch

import pytest

from neoguard.services.mql.cache import make_cache_key, CACHE_KEY_PREFIX
from neoguard.services.mql.compiler import compile_query, CompilerError


# ---------------------------------------------------------------------------
# Task 4: Compiler defense-in-depth
# ---------------------------------------------------------------------------


class TestCompilerTenantGuard:
    """compile_query refuses to compile without tenant_id unless explicit opt-in."""

    def test_none_tenant_raises_compiler_error(self):
        from neoguard.services.mql.parser import parse
        from datetime import datetime

        ast = parse("avg:aws.ec2.cpuutilization")
        with pytest.raises(CompilerError, match="tenant_id is required"):
            compile_query(
                ast,
                tenant_id=None,
                start=datetime(2026, 1, 1),
                end=datetime(2026, 1, 2),
            )

    def test_none_tenant_with_allow_cross_tenant_succeeds(self):
        from neoguard.services.mql.parser import parse
        from datetime import datetime

        ast = parse("avg:aws.ec2.cpuutilization")
        compiled = compile_query(
            ast,
            tenant_id=None,
            start=datetime(2026, 1, 1),
            end=datetime(2026, 1, 2),
            allow_cross_tenant=True,
        )
        assert compiled.sql is not None
        assert "tenant_id" not in compiled.sql

    def test_with_tenant_id_includes_where_clause(self):
        from neoguard.services.mql.parser import parse
        from datetime import datetime

        ast = parse("avg:aws.ec2.cpuutilization")
        compiled = compile_query(
            ast,
            tenant_id="tenant-abc",
            start=datetime(2026, 1, 1),
            end=datetime(2026, 1, 2),
        )
        assert "tenant_id" in compiled.sql
        assert "tenant-abc" in compiled.params


# ---------------------------------------------------------------------------
# Task 6: Cache key namespace fix
# ---------------------------------------------------------------------------


class TestCacheKeyNamespace:
    """Cache keys use q2: prefix and proper tenant namespacing."""

    def test_prefix_is_q2(self):
        assert CACHE_KEY_PREFIX == "q2"

    def test_different_tenants_different_keys(self):
        key_a = make_cache_key("tenant-a", "SELECT 1", 1000, 2000, 60)
        key_b = make_cache_key("tenant-b", "SELECT 1", 1000, 2000, 60)
        assert key_a != key_b
        assert "tenant-a" in key_a
        assert "tenant-b" in key_b

    def test_none_tenant_uses_cross_tenant_namespace(self):
        key = make_cache_key(None, "SELECT 1", 1000, 2000, 60)
        assert "CROSS_TENANT" in key
        assert key.startswith("q2:")

    def test_old_q_prefix_not_used(self):
        key = make_cache_key("tenant-x", "SELECT 1", 1000, 2000, 60)
        assert key.startswith("q2:")
        assert not key.startswith("q:")


# ---------------------------------------------------------------------------
# Task 1: get_query_tenant_id dependency
# ---------------------------------------------------------------------------


class TestGetQueryTenantId:
    """get_query_tenant_id enforces explicit tenant context for query endpoints."""

    def _make_request(self, *, is_super_admin=False, tenant_id=None, query_params=None):
        request = MagicMock()
        request.state.is_super_admin = is_super_admin
        request.state.scopes = ["platform_admin"] if is_super_admin else ["read"]
        request.state.tenant_id = tenant_id
        request.query_params = query_params or {}
        return request

    def test_regular_user_returns_session_tenant(self):
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(tenant_id="tenant-123")
        result = get_query_tenant_id(request)
        assert result == "tenant-123"

    def test_super_admin_without_override_raises_400(self):
        from fastapi import HTTPException
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(is_super_admin=True, query_params={})
        with pytest.raises(HTTPException) as exc_info:
            get_query_tenant_id(request)
        assert exc_info.value.status_code == 400
        assert "tenant_context_required" in str(exc_info.value.detail)

    def test_super_admin_with_override_returns_override(self):
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(
            is_super_admin=True,
            query_params={"tenant_id": "tenant-B"},
        )
        result = get_query_tenant_id(request)
        assert result == "tenant-B"

    def test_regular_user_override_ignored(self):
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(
            tenant_id="tenant-A",
            query_params={"tenant_id": "tenant-B"},
        )
        result = get_query_tenant_id(request)
        assert result == "tenant-A"

    @patch("neoguard.api.deps.settings")
    def test_auth_disabled_returns_default(self, mock_settings):
        from neoguard.api.deps import get_query_tenant_id

        mock_settings.auth_enabled = False
        mock_settings.default_tenant_id = "dev-tenant"
        request = self._make_request()
        request.state.tenant_id = None
        request.state.is_super_admin = False
        request.state.scopes = []
        result = get_query_tenant_id(request)
        assert result == "dev-tenant"

    def test_no_tenant_and_auth_enabled_raises_401(self):
        from fastapi import HTTPException
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request()
        request.state.tenant_id = None
        request.state.scopes = ["read"]
        with pytest.raises(HTTPException) as exc_info:
            get_query_tenant_id(request)
        assert exc_info.value.status_code == 401
