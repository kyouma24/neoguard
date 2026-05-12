"""Phase C4b: Collection/config refinement tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: COLL-010, COLL-012, COLL-013.
"""

import time
from unittest.mock import AsyncMock, patch

import pytest


# ===========================================================================
# COLL-010: Feature flag local cache with TTL
# ===========================================================================


class TestColl010FeatureFlagCache:
    """COLL-010: is_enabled() must cache results to avoid Redis call every time."""

    @pytest.mark.asyncio
    async def test_is_enabled_caches_result(self):
        """Two calls within TTL should only hit Redis once."""
        from neoguard.services import feature_flags
        from neoguard.services.feature_flags import Flag, is_enabled

        feature_flags._flag_cache.clear()

        mock_redis = AsyncMock()
        mock_redis.hget = AsyncMock(return_value="1")

        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result1 = await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)
            result2 = await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)

        assert result1 is True
        assert result2 is True
        assert mock_redis.hget.call_count == 1

    @pytest.mark.asyncio
    async def test_cache_expires_after_ttl(self):
        """After TTL, the next call should hit Redis again."""
        from neoguard.services import feature_flags
        from neoguard.services.feature_flags import Flag, is_enabled, _FLAG_CACHE_TTL

        feature_flags._flag_cache.clear()

        mock_redis = AsyncMock()
        mock_redis.hget = AsyncMock(return_value="1")

        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)

            # Simulate TTL expiry by manipulating cache timestamps
            for key in feature_flags._flag_cache:
                feature_flags._flag_cache[key] = (
                    feature_flags._flag_cache[key][0],
                    time.monotonic() - _FLAG_CACHE_TTL - 1,
                )

            await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)

        assert mock_redis.hget.call_count == 2

    @pytest.mark.asyncio
    async def test_set_flag_invalidates_cache(self):
        """set_flag() must invalidate the cache for that flag."""
        from neoguard.services import feature_flags
        from neoguard.services.feature_flags import Flag, is_enabled, set_flag

        feature_flags._flag_cache.clear()

        mock_redis = AsyncMock()
        mock_redis.hget = AsyncMock(return_value="1")
        mock_redis.hset = AsyncMock()

        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)
            await set_flag(Flag.DASHBOARDS_BATCH_QUERIES, False)

            mock_redis.hget.return_value = "0"
            result = await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)

        assert result is False
        assert mock_redis.hget.call_count == 2


# ===========================================================================
# COLL-012: Async-safe logging
# ===========================================================================


class TestColl012AsyncLogging:
    """COLL-012: Logging should use WriteLoggerFactory, not PrintLoggerFactory."""

    @pytest.fixture(autouse=True)
    def _reset_structlog(self):
        """Ensure structlog is reconfigured after tests that mutate it."""
        yield
        import structlog
        structlog.reset_defaults()
        from neoguard.core.logging import setup_logging
        setup_logging(debug=False)

    def test_logging_uses_write_logger_factory(self):
        """setup_logging must use WriteLoggerFactory (non-blocking)."""
        import structlog
        from neoguard.core.logging import setup_logging

        setup_logging(debug=False)
        config = structlog.get_config()
        factory = config["logger_factory"]
        assert not isinstance(factory, structlog.PrintLoggerFactory), (
            "Must use WriteLoggerFactory, not PrintLoggerFactory"
        )

    def test_logging_output_reaches_stdout(self, capsys):
        """Logs produced via setup_logging actually reach stdout."""
        import structlog
        from neoguard.core.logging import setup_logging

        setup_logging(debug=True)
        logger = structlog.get_logger()
        logger.info("coll012_test_probe", key="value")

        captured = capsys.readouterr()
        assert "coll012_test_probe" in captured.out


# ===========================================================================
# COLL-013: Configurable SSE heartbeat/duration
# ===========================================================================


class TestColl013SSEConfigurable:
    """COLL-013: SSE heartbeat and max duration must come from settings."""

    def test_settings_has_sse_heartbeat_sec(self):
        """settings must have sse_heartbeat_sec with default 15."""
        from neoguard.core.config import settings
        assert hasattr(settings, "sse_heartbeat_sec")
        assert settings.sse_heartbeat_sec == 15

    def test_settings_has_sse_max_duration_sec(self):
        """settings must have sse_max_duration_sec with default 1800."""
        from neoguard.core.config import settings
        assert hasattr(settings, "sse_max_duration_sec")
        assert settings.sse_max_duration_sec == 1800

    def test_sse_module_reads_from_settings_at_request_time(self):
        """SSE handler must reference settings directly, not cached module constants."""
        import inspect
        from neoguard.api.routes import sse

        source = inspect.getsource(sse.event_generator) if hasattr(sse, "event_generator") else inspect.getsource(sse)
        assert "settings.sse_heartbeat_sec" in source or "settings.sse_max_duration_sec" in source, (
            "SSE module must reference settings directly in handler (no module-level constants)"
        )
        assert "HEARTBEAT_INTERVAL" not in source, (
            "Module-level HEARTBEAT_INTERVAL constant must be removed"
        )
        assert "MAX_DURATION" not in source or "sse_max_duration_sec" in source, (
            "Module-level MAX_DURATION constant must be removed"
        )
