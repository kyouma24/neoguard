"""Unit tests for auth telemetry counters and emit functions."""

from unittest.mock import AsyncMock, patch

import pytest

from neoguard.core.telemetry import registry


class TestAuthTelemetryCounters:
    def test_counters_registered(self):
        from neoguard.services.auth import telemetry
        assert telemetry._signup_attempts is not None
        assert telemetry._login_success is not None
        assert telemetry._login_failure is not None
        assert telemetry._session_created is not None
        assert telemetry._session_revoked is not None
        assert telemetry._tenant_created is not None
        assert telemetry._tenant_deleted is not None
        assert telemetry._rls_violations is not None
        assert telemetry._deprecated_key_used is not None


class TestEmitSignup:
    async def test_increments_counters(self):
        from neoguard.services.auth.telemetry import _signup_attempts, _session_created, _tenant_created, emit_signup

        before_signup = _signup_attempts.get()
        before_session = _session_created.get()
        before_tenant = _tenant_created.get()

        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.ainfo = AsyncMock()
            await emit_signup("user-1", "tenant-1", "test@example.com")

        assert _signup_attempts.get() == before_signup + 1
        assert _session_created.get() == before_session + 1
        assert _tenant_created.get() == before_tenant + 1


class TestEmitLoginSuccess:
    async def test_increments_counters(self):
        from neoguard.services.auth.telemetry import _login_success, emit_login_success

        before = _login_success.get()
        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.ainfo = AsyncMock()
            await emit_login_success("user-1", "tenant-1")
        assert _login_success.get() == before + 1


class TestEmitLoginFailure:
    async def test_increments_counter(self):
        from neoguard.services.auth.telemetry import _login_failure, emit_login_failure

        before = _login_failure.get()
        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.awarn = AsyncMock()
            await emit_login_failure("bad@example.com")
        assert _login_failure.get() == before + 1


class TestEmitLogout:
    async def test_increments_counter(self):
        from neoguard.services.auth.telemetry import _session_revoked, emit_logout

        before = _session_revoked.get()
        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.ainfo = AsyncMock()
            await emit_logout("user-1")
        assert _session_revoked.get() == before + 1


class TestEmitTenantCreated:
    async def test_increments_counter(self):
        from neoguard.services.auth.telemetry import _tenant_created, emit_tenant_created

        before = _tenant_created.get()
        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.ainfo = AsyncMock()
            await emit_tenant_created("tenant-1", "user-1")
        assert _tenant_created.get() == before + 1


class TestEmitDeprecatedKey:
    async def test_increments_counter(self):
        from neoguard.services.auth.telemetry import _deprecated_key_used, emit_deprecated_key

        before = _deprecated_key_used.get()
        with patch("neoguard.services.auth.telemetry.log") as mock_log:
            mock_log.awarn = AsyncMock()
            await emit_deprecated_key("ng_abc")
        assert _deprecated_key_used.get() == before + 1
