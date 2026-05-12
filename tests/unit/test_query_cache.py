"""Tests for the MQL query cache (spec D.5)."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import orjson
import pytest

from neoguard.services.mql.cache import (
    CACHE_KEY_PREFIX,
    CacheStatus,
    _align_ts,
    compute_ttl,
    flush_tenant_cache,
    get_cached,
    make_cache_key,
    set_cached,
)


# ---------------------------------------------------------------------------
# make_cache_key
# ---------------------------------------------------------------------------


class TestMakeCacheKey:
    def test_key_starts_with_prefix(self):
        key = make_cache_key("t1", "SELECT 1", 1000, 2000, 60)
        assert key.startswith(f"{CACHE_KEY_PREFIX}:")

    def test_tenant_id_is_first_component(self):
        key = make_cache_key("my-tenant", "SELECT 1", 1000, 2000, 60)
        parts = key.split(":")
        assert parts[0] == CACHE_KEY_PREFIX
        assert parts[1] == "my-tenant"

    def test_global_key_for_none_tenant(self):
        """Cache keys with tenant_id=None use CROSS_TENANT sentinel."""
        key = make_cache_key(None, "SELECT 1", 1000, 2000, 60)
        assert ":CROSS_TENANT:" in key

    def test_different_queries_produce_different_keys(self):
        k1 = make_cache_key("t1", "SELECT avg FROM m1", 1000, 2000, 60)
        k2 = make_cache_key("t1", "SELECT max FROM m2", 1000, 2000, 60)
        assert k1 != k2

    def test_same_query_same_key(self):
        k1 = make_cache_key("t1", "SELECT 1", 1000, 2000, 60)
        k2 = make_cache_key("t1", "SELECT 1", 1000, 2000, 60)
        assert k1 == k2

    def test_different_tenants_different_keys(self):
        k1 = make_cache_key("t1", "SELECT 1", 1000, 2000, 60)
        k2 = make_cache_key("t2", "SELECT 1", 1000, 2000, 60)
        assert k1 != k2

    def test_different_intervals_different_keys(self):
        k1 = make_cache_key("t1", "SELECT 1", 1000, 2000, 60)
        k2 = make_cache_key("t1", "SELECT 1", 1000, 2000, 300)
        assert k1 != k2

    def test_key_contains_hash(self):
        key = make_cache_key("t1", "SELECT 1", 0, 3600, 60)
        # Hash is the third colon-separated component
        parts = key.split(":")
        assert len(parts[2]) == 32  # sha256[:32]


# ---------------------------------------------------------------------------
# Timestamp alignment
# ---------------------------------------------------------------------------


class TestTimestampAlignment:
    def test_align_to_60s_boundary(self):
        # 1000 should floor to 960 (960 = 16 * 60)
        assert _align_ts(1000, 60) == 960

    def test_already_aligned(self):
        assert _align_ts(960, 60) == 960

    def test_align_to_300s_boundary(self):
        assert _align_ts(400, 300) == 300

    def test_zero_interval_returns_original(self):
        assert _align_ts(12345, 0) == 12345

    def test_negative_interval_returns_original(self):
        assert _align_ts(12345, -1) == 12345

    def test_alignment_shared_keys(self):
        """Two timestamps in the same bucket should produce the same aligned value."""
        # Both 970 and 1010 fall in the [960, 1020) bucket at 60s alignment
        assert _align_ts(970, 60) == _align_ts(1010, 60)


# ---------------------------------------------------------------------------
# compute_ttl
# ---------------------------------------------------------------------------


class TestComputeTTL:
    def test_1h_window_gives_60s(self):
        # 3600 / 60 = 60
        assert compute_ttl(0, 3600) == 60

    def test_1m_window_gives_1s(self):
        # 60 / 60 = 1
        assert compute_ttl(0, 60) == 1

    def test_capped_at_60(self):
        # 24h = 86400 / 60 = 1440 -> capped at 60
        assert compute_ttl(0, 86400) == 60

    def test_very_short_window_floor_at_1(self):
        # 10s / 60 = 0 -> floor at 1
        assert compute_ttl(0, 10) == 1

    def test_equal_timestamps_gives_1(self):
        assert compute_ttl(100, 100) == 1


# ---------------------------------------------------------------------------
# get_cached / set_cached  (mocked Redis)
# ---------------------------------------------------------------------------


class TestGetCached:
    @pytest.mark.asyncio
    async def test_miss_when_key_absent(self):
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=None)
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.MISS
        assert data is None

    @pytest.mark.asyncio
    async def test_fresh_when_within_ttl(self):
        now = time.time()
        envelope = orjson.dumps({"t": now, "d": [{"name": "cpu"}]}).decode()
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=envelope)
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.FRESH
        assert data == [{"name": "cpu"}]

    @pytest.mark.asyncio
    async def test_stale_when_between_ttl_and_2ttl(self):
        now = time.time()
        envelope = orjson.dumps({"t": now - 90, "d": [{"x": 1}]}).decode()
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=envelope)
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.STALE
        assert data == [{"x": 1}]

    @pytest.mark.asyncio
    async def test_miss_when_older_than_2ttl(self):
        now = time.time()
        envelope = orjson.dumps({"t": now - 200, "d": [{"x": 1}]}).decode()
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value=envelope)
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.MISS
        assert data is None

    @pytest.mark.asyncio
    async def test_miss_on_corrupt_data(self):
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(return_value="not json {{{")
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.MISS
        assert data is None

    @pytest.mark.asyncio
    async def test_miss_on_redis_error(self):
        with patch("neoguard.services.mql.cache.get_redis", side_effect=RuntimeError("down")):
            data, status = await get_cached("q:t1:abc:0:3600:60", ttl=60)
        assert status == CacheStatus.MISS
        assert data is None


class TestSetCached:
    @pytest.mark.asyncio
    async def test_sets_with_double_ttl(self):
        mock_redis = AsyncMock()
        mock_redis.set = AsyncMock()
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            await set_cached("q:t1:abc:0:3600:60", [{"name": "cpu"}], ttl=30)
        mock_redis.set.assert_called_once()
        call_kwargs = mock_redis.set.call_args
        # Redis TTL should be 2 * 30 = 60
        assert call_kwargs.kwargs.get("ex") == 60 or call_kwargs[1].get("ex") == 60

    @pytest.mark.asyncio
    async def test_silent_on_redis_error(self):
        with patch("neoguard.services.mql.cache.get_redis", side_effect=RuntimeError("down")):
            # Should not raise
            await set_cached("q:t1:abc:0:3600:60", [{"name": "cpu"}], ttl=30)


# ---------------------------------------------------------------------------
# flush_tenant_cache (mocked Redis)
# ---------------------------------------------------------------------------


class TestFlushTenantCache:
    @pytest.mark.asyncio
    async def test_deletes_matching_keys(self):
        mock_redis = AsyncMock()
        mock_redis.scan = AsyncMock(return_value=(0, ["q:t1:aaa:0:3600:60", "q:t1:bbb:0:3600:60"]))
        mock_redis.delete = AsyncMock(return_value=2)
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            count = await flush_tenant_cache("t1")
        assert count == 2
        mock_redis.scan.assert_called_once()
        mock_redis.delete.assert_called_once_with("q:t1:aaa:0:3600:60", "q:t1:bbb:0:3600:60")

    @pytest.mark.asyncio
    async def test_returns_0_when_no_keys(self):
        mock_redis = AsyncMock()
        mock_redis.scan = AsyncMock(return_value=(0, []))
        with patch("neoguard.services.mql.cache.get_redis", return_value=mock_redis):
            count = await flush_tenant_cache("t1")
        assert count == 0

    @pytest.mark.asyncio
    async def test_returns_0_on_redis_error(self):
        with patch("neoguard.services.mql.cache.get_redis", side_effect=RuntimeError("down")):
            count = await flush_tenant_cache("t1")
        assert count == 0


# ---------------------------------------------------------------------------
# CacheStatus enum
# ---------------------------------------------------------------------------


class TestCacheStatus:
    def test_values(self):
        assert CacheStatus.FRESH == "fresh"
        assert CacheStatus.STALE == "stale"
        assert CacheStatus.MISS == "miss"

    def test_enum_members(self):
        assert set(CacheStatus) == {CacheStatus.FRESH, CacheStatus.STALE, CacheStatus.MISS}
