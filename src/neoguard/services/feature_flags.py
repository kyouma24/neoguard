"""Feature flag service — Redis-backed, toggleable without restart.

Flags are stored in Redis as a hash at key `neoguard:feature_flags`.
Each field is the flag name, value is "1" (enabled) or "0" (disabled).

If Redis is unavailable, flags fall back to their hardcoded defaults.
Flags that gate EXISTING features (batch queries, viewport loading) fail-open
so users keep working. Flags that gate NEW or RESTRICTIVE behavior (cardinality
denylist, singleflight) fail-closed so experimental features don't activate
during an outage.
"""

from __future__ import annotations

import logging
import time
from enum import Enum

logger = logging.getLogger(__name__)

_FLAG_CACHE_TTL = 5.0  # seconds
_flag_cache: dict[str, tuple[bool, float]] = {}

# TODO(production): Local Redis; needs HA Redis with replication
# Current: Single Redis instance, fail-closed for new behavior
# Cloud: ElastiCache cluster with automatic failover
# Migration risk: Low — fail-closed is safer than fail-open
# Reference: docs/cloud_migration.md#redis-ha
REDIS_KEY = "neoguard:feature_flags"


class Flag(str, Enum):
    DASHBOARDS_BATCH_QUERIES = "dashboards.batch_queries"
    DASHBOARDS_VIEWPORT_LOADING = "dashboards.viewport_loading"
    METRICS_CARDINALITY_DENYLIST = "metrics.cardinality_denylist"
    MQL_STREAMING_BATCH = "mql.streaming_batch"
    MQL_SINGLEFLIGHT = "mql.singleflight"


DEFAULTS: dict[str, bool] = {
    Flag.DASHBOARDS_BATCH_QUERIES: True,
    Flag.DASHBOARDS_VIEWPORT_LOADING: True,
    Flag.METRICS_CARDINALITY_DENYLIST: True,
    Flag.MQL_STREAMING_BATCH: True,
    Flag.MQL_SINGLEFLIGHT: False,
}

# Flags that gate EXPERIMENTAL or UNPROVEN behavior must fail-closed on Redis outage.
# If Redis is down, these return False regardless of their default, preventing
# experimental features from activating during infrastructure failures.
# Note: METRICS_CARDINALITY_DENYLIST is a SAFETY feature (restricts dangerous queries)
# and therefore fails OPEN — it stays enabled even during Redis outage.
_FAIL_CLOSED_FLAGS: frozenset[str] = frozenset({
    Flag.MQL_SINGLEFLIGHT,
})


def _flag_key(flag: str | Flag) -> str:
    return flag.value if isinstance(flag, Flag) else flag


async def is_enabled(flag: str | Flag) -> bool:
    """Check if a feature flag is enabled.

    Fail-open for existing features (users keep working during outage).
    Fail-closed for new/restrictive features (experiments don't activate during outage).
    Uses in-process cache with 5s TTL to avoid Redis call on every check.
    """
    key = _flag_key(flag)
    now = time.monotonic()
    cached = _flag_cache.get(key)
    if cached is not None:
        value, ts = cached
        if (now - ts) < _FLAG_CACHE_TTL:
            return value

    try:
        from neoguard.db.redis.connection import get_redis
        redis = get_redis()
        val = await redis.hget(REDIS_KEY, key)
        if val is None:
            result = DEFAULTS.get(key, False)
        else:
            result = val == "1"
        _flag_cache[key] = (result, now)
        return result
    except Exception:
        logger.warning("Feature flag Redis check failed for %s, using fallback", key)
        if key in _FAIL_CLOSED_FLAGS:
            return False
        return DEFAULTS.get(key, False)


async def set_flag(flag: str | Flag, enabled: bool) -> None:
    """Set a feature flag value in Redis."""
    from neoguard.db.redis.connection import get_redis
    redis = get_redis()
    key = _flag_key(flag)
    await redis.hset(REDIS_KEY, key, "1" if enabled else "0")
    _flag_cache.pop(key, None)


async def get_all_flags() -> dict[str, bool]:
    """Return all flags with their current effective values."""
    try:
        from neoguard.db.redis.connection import get_redis
        redis = get_redis()
        stored = await redis.hgetall(REDIS_KEY)
    except Exception:
        stored = {}

    result = {}
    for flag_name, default in DEFAULTS.items():
        if flag_name in stored:
            result[flag_name] = stored[flag_name] == "1"
        else:
            result[flag_name] = default
    return result


async def delete_flag(flag: str | Flag) -> None:
    """Remove a flag override, reverting to default."""
    from neoguard.db.redis.connection import get_redis
    redis = get_redis()
    await redis.hdel(REDIS_KEY, _flag_key(flag))
