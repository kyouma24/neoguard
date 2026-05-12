"""Tests for the feature flag service."""

from unittest.mock import AsyncMock, patch

import pytest

from neoguard.services.feature_flags import (
    DEFAULTS,
    REDIS_KEY,
    Flag,
    delete_flag,
    get_all_flags,
    is_enabled,
    set_flag,
)


class TestIsEnabled:
    async def test_returns_default_when_redis_has_no_value(self):
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = None
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled(Flag.DASHBOARDS_BATCH_QUERIES)
        assert result is True
        mock_redis.hget.assert_called_once_with(REDIS_KEY, "dashboards.batch_queries")

    async def test_returns_true_when_redis_value_is_1(self):
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = "1"
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled(Flag.MQL_STREAMING_BATCH)
        assert result is True

    async def test_returns_false_when_redis_value_is_0(self):
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = "0"
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled(Flag.MQL_STREAMING_BATCH)
        assert result is False

    async def test_falls_back_to_default_on_redis_error(self):
        with patch("neoguard.db.redis.connection.get_redis", side_effect=RuntimeError("not initialized")):
            result = await is_enabled(Flag.DASHBOARDS_VIEWPORT_LOADING)
        assert result is True

    async def test_accepts_string_flag_name(self):
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = "0"
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled("metrics.cardinality_denylist")
        assert result is False

    async def test_unknown_flag_defaults_to_true(self):
        mock_redis = AsyncMock()
        mock_redis.hget.return_value = None
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await is_enabled("unknown.flag")
        assert result is True


class TestSetFlag:
    async def test_sets_flag_enabled(self):
        mock_redis = AsyncMock()
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            await set_flag(Flag.DASHBOARDS_BATCH_QUERIES, True)
        mock_redis.hset.assert_called_once_with(REDIS_KEY, "dashboards.batch_queries", "1")

    async def test_sets_flag_disabled(self):
        mock_redis = AsyncMock()
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            await set_flag(Flag.DASHBOARDS_BATCH_QUERIES, False)
        mock_redis.hset.assert_called_once_with(REDIS_KEY, "dashboards.batch_queries", "0")


class TestGetAllFlags:
    async def test_returns_defaults_when_redis_empty(self):
        mock_redis = AsyncMock()
        mock_redis.hgetall.return_value = {}
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await get_all_flags()
        assert result == {k: v for k, v in DEFAULTS.items()}

    async def test_merges_redis_overrides_with_defaults(self):
        mock_redis = AsyncMock()
        mock_redis.hgetall.return_value = {"dashboards.batch_queries": "0"}
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            result = await get_all_flags()
        assert result["dashboards.batch_queries"] is False
        assert result["dashboards.viewport_loading"] is True

    async def test_falls_back_to_defaults_on_redis_error(self):
        with patch("neoguard.db.redis.connection.get_redis", side_effect=RuntimeError("not initialized")):
            result = await get_all_flags()
        assert result == {k: v for k, v in DEFAULTS.items()}


class TestDeleteFlag:
    async def test_deletes_flag_from_redis(self):
        mock_redis = AsyncMock()
        with patch("neoguard.db.redis.connection.get_redis", return_value=mock_redis):
            await delete_flag(Flag.MQL_STREAMING_BATCH)
        mock_redis.hdel.assert_called_once_with(REDIS_KEY, "mql.streaming_batch")


class TestFlagEnum:
    def test_all_defaults_have_enum_entries(self):
        for flag in Flag:
            assert flag.value in DEFAULTS

    def test_enum_values_are_dotted_names(self):
        for flag in Flag:
            assert "." in flag.value
