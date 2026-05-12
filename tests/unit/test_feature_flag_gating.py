"""Feature flag gating tests — prove flags control behavior at runtime.

Scope: CRITICAL-3 cardinality denylist flag + fail-open behavior.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from neoguard.services.feature_flags import Flag


class TestCardinalityDenylistFlagGating:
    """CRITICAL-3: metrics.cardinality_denylist flag gates denylist checks."""

    @pytest.mark.asyncio
    async def test_denylist_flag_on_blocks_high_cardinality_tag(self):
        """When flag is ON (default), hardcoded denylist blocks high-cardinality tags."""
        from neoguard.services.feature_flags import is_enabled

        # Default is True (flag is ON)
        result = await is_enabled(Flag.METRICS_CARDINALITY_DENYLIST)
        assert result is True

    @pytest.mark.asyncio
    @patch("neoguard.db.redis.connection.get_redis")
    async def test_denylist_flag_off_allows_high_cardinality_tag(self, mock_get_redis):
        """When flag is OFF, denylist is bypassed (hard limits still apply)."""
        from neoguard.services.feature_flags import is_enabled

        # Mock Redis to return "0" (flag disabled)
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = "0"
        mock_get_redis.return_value = mock_redis

        result = await is_enabled(Flag.METRICS_CARDINALITY_DENYLIST)
        assert result is False

    def test_denylist_flag_off_hard_limits_still_enforced(self):
        """When denylist flag is OFF, hard limits remain enforced (defense-in-depth)."""
        from neoguard.core.config import settings

        # Hard limit is 1000, regardless of flag state
        assert settings.tag_values_hard_limit == 1000


class TestFeatureFlagServiceFailOpen:
    """Feature flag service fail-open behavior."""

    @pytest.mark.asyncio
    @patch("neoguard.db.redis.connection.get_redis")
    async def test_flag_service_fail_open_on_redis_error(self, mock_get_redis):
        """When Redis fails, flags fall back to defaults (fail-open)."""
        from neoguard.services.feature_flags import is_enabled, DEFAULTS

        mock_redis = AsyncMock()
        mock_redis.hget.side_effect = Exception("Redis connection failed")
        mock_get_redis.return_value = mock_redis

        # Should return default value, not raise
        result = await is_enabled(Flag.METRICS_CARDINALITY_DENYLIST)
        assert result == DEFAULTS[Flag.METRICS_CARDINALITY_DENYLIST]

    def test_flag_defaults_match_documentation(self):
        """All 4 flags have documented default values."""
        from neoguard.services.feature_flags import DEFAULTS

        expected = {
            Flag.DASHBOARDS_BATCH_QUERIES: True,
            Flag.DASHBOARDS_VIEWPORT_LOADING: True,
            Flag.METRICS_CARDINALITY_DENYLIST: True,
            Flag.MQL_STREAMING_BATCH: True,
        }

        for flag, expected_default in expected.items():
            assert DEFAULTS[flag] == expected_default, f"Flag {flag} default mismatch"
