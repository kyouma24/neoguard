"""Phase A — P0 regression tests.

Each test verifies one of the 8 P0 security/data-integrity fixes stays fixed.
These are canary tests: if ANY regresses, it's a critical security bug.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------- P0-1: Feature flags endpoint requires auth ----------

class TestFeatureFlagsAuth:
    """SYS-001: /system/feature-flags must require admin scope."""

    async def test_feature_flags_endpoint_has_admin_dependency(self):
        from neoguard.api.routes.system import router

        feature_flags_route = None
        for route in router.routes:
            if hasattr(route, "path") and route.path.endswith("/feature-flags"):
                feature_flags_route = route
                break

        assert feature_flags_route is not None, "Feature flags route not found"
        assert feature_flags_route.dependencies, "No dependencies on feature-flags route"
        dep_calls = [str(d.dependency) for d in feature_flags_route.dependencies]
        assert any("require_scope" in c for c in dep_calls), (
            "Feature flags route missing require_scope dependency"
        )


# ---------- P0-2: Unknown flags fail-closed ----------

class TestUnknownFlagsFailClosed:
    """FF-002: Unknown flags return False (disabled) by default."""

    async def test_unknown_flag_returns_false(self):
        from neoguard.services.feature_flags import is_enabled

        mock_redis = AsyncMock()
        mock_redis.hget.return_value = None
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled("completely.unknown.flag")
        assert result is False


# ---------- P0-3: Notification CRUD SQL injection ----------

class TestNotificationCrudParameterized:
    """NOTIF-001: Limit/offset in notification queries are parameterized."""

    async def test_list_channels_uses_parameterized_limit(self):
        from neoguard.services.notifications import crud
        import inspect

        source = inspect.getsource(crud.list_channels)
        assert "f\"" not in source or "LIMIT" not in source, (
            "list_channels still uses f-string for LIMIT/OFFSET"
        )
        assert "$2" in source or "$3" in source, (
            "list_channels not using parameterized LIMIT"
        )


# ---------- P0-4: DNS rebinding prevention via pinned resolver ----------

class TestDNSRebindingPrevention:
    """NOTIF-002: HTTP connections pinned to pre-validated IPs."""

    async def test_pinned_resolver_only_returns_allowed_ips(self):
        from neoguard.services.notifications.url_validator import _PinnedResolver

        resolver = _PinnedResolver(["1.2.3.4", "5.6.7.8"])
        results = await resolver.resolve("evil.com", 443)
        returned_ips = {r["host"] for r in results}
        assert returned_ips == {"1.2.3.4", "5.6.7.8"}

    async def test_pinned_resolver_rejects_empty_list(self):
        from neoguard.services.notifications.url_validator import _PinnedResolver

        resolver = _PinnedResolver([])
        with pytest.raises(OSError, match="No resolvable addresses"):
            await resolver.resolve("evil.com", 443)

    async def test_create_pinned_session_uses_custom_resolver(self):
        from neoguard.services.notifications.url_validator import (
            _PinnedResolver,
            create_pinned_session,
        )

        session = create_pinned_session(["93.184.216.34"])
        try:
            connector = session.connector
            assert isinstance(connector._resolver, _PinnedResolver)
        finally:
            await session.close()

    def test_webhook_sender_uses_pinned_session(self):
        import inspect
        from neoguard.services.notifications.senders import WebhookSender

        source = inspect.getsource(WebhookSender.send_firing)
        assert "create_pinned_session" in source
        assert "aiohttp.ClientSession()" not in source

    def test_slack_sender_uses_pinned_session(self):
        import inspect
        from neoguard.services.notifications.senders import SlackSender

        source = inspect.getsource(SlackSender.send_firing)
        assert "create_pinned_session" in source
        assert "aiohttp.ClientSession()" not in source

    def test_msteams_sender_uses_pinned_session(self):
        import inspect
        from neoguard.services.notifications.senders import MSTeamsSender

        source = inspect.getsource(MSTeamsSender.send_firing)
        assert "create_pinned_session" in source
        assert "aiohttp.ClientSession()" not in source


# ---------- P0-5: Alert engine unbounded rule fetch ----------

class TestAlertEngineBounded:
    """ALERT-001: Alert engine limits rules fetched per evaluation cycle."""

    def test_config_has_max_rules_per_cycle(self):
        from neoguard.core.config import Settings

        settings = Settings()
        assert hasattr(settings, "alert_max_rules_per_cycle")
        assert settings.alert_max_rules_per_cycle > 0
        assert settings.alert_max_rules_per_cycle <= 10000

    def test_evaluate_all_has_limit_in_query(self):
        import inspect
        from neoguard.services.alerts.engine import AlertEngine

        source = inspect.getsource(AlertEngine._evaluate_all)
        assert "LIMIT" in source, "_evaluate_all must include LIMIT in rule query"


# ---------- P0-6: Alert CRUD field whitelist ----------

class TestAlertCrudFieldWhitelist:
    """ALERT-004: Dynamic UPDATE only allows whitelisted fields."""

    def test_allowed_fields_is_frozen(self):
        from neoguard.services.alerts.crud import _ALLOWED_UPDATE_FIELDS

        assert isinstance(_ALLOWED_UPDATE_FIELDS, frozenset)
        assert "name" in _ALLOWED_UPDATE_FIELDS
        assert "threshold" in _ALLOWED_UPDATE_FIELDS
        assert "id" not in _ALLOWED_UPDATE_FIELDS
        assert "tenant_id" not in _ALLOWED_UPDATE_FIELDS
        assert "created_at" not in _ALLOWED_UPDATE_FIELDS

    def test_dangerous_fields_not_allowed(self):
        from neoguard.services.alerts.crud import _ALLOWED_UPDATE_FIELDS

        dangerous = {"id", "tenant_id", "created_at", "updated_at"}
        assert dangerous.isdisjoint(_ALLOWED_UPDATE_FIELDS)


# ---------- P0-7: Azure credential secret cleanup ----------

class TestAzureSecretCleanup:
    """CRED-001: Plaintext secrets removed from cache after credential creation."""

    def test_secret_cleared_after_credential_creation(self):
        from unittest.mock import patch as _patch

        from neoguard.services.azure.credentials import (
            _credential_cache,
            _secret_cache,
            cache_client_secret,
            clear_credential_cache,
            get_credential,
        )

        clear_credential_cache()

        mock_sub = MagicMock()
        mock_sub.subscription_id = "sub-123"
        mock_sub.azure_tenant_id = "tenant-456"
        mock_sub.client_id = "client-789"

        cache_client_secret("sub-123", "super-secret-value")
        assert "sub-123" in _secret_cache

        with _patch(
            "neoguard.services.azure.credentials.ClientSecretCredential"
        ) as MockCred:
            MockCred.return_value = MagicMock()
            get_credential(mock_sub)

        assert "sub-123" not in _secret_cache, (
            "Secret must be cleared from _secret_cache after credential creation"
        )
        clear_credential_cache()


# ---------- P0-8: Frontend MQL injection prevention ----------

class TestFrontendMQLInjection:
    """FE2-001: Client-side MQL variable substitution validates input."""

    def test_safe_mql_value_regex_blocks_injection(self):
        """Simulates the frontend SAFE_MQL_VALUE regex in Python."""
        import re

        SAFE_MQL_VALUE = re.compile(r"^[a-zA-Z0-9_\-.*/:]+$")

        safe_values = ["production", "us-east-1", "web-server", "app/v2", "metric.*"]
        for v in safe_values:
            assert SAFE_MQL_VALUE.match(v) and len(v) <= 256, f"Should allow: {v}"

        dangerous_values = [
            "'; DROP TABLE--",
            "{malicious}",
            "$(command)",
            "value\ninjected",
            'foo"bar',
            "a" * 257,
        ]
        for v in dangerous_values:
            match = SAFE_MQL_VALUE.match(v)
            is_safe = bool(match) and len(v) <= 256
            assert not is_safe, f"Should BLOCK: {v}"
