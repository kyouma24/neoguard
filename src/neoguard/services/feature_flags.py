"""Feature flag service — Redis-backed, toggleable without restart.

Flags are stored in Redis as a hash at key `neoguard:feature_flags`.
Each field is the flag name, value is "1" (enabled) or "0" (disabled).

If Redis is unavailable, flags fall back to their hardcoded defaults
(fail-open for safety — existing features stay enabled).
"""

from __future__ import annotations

import logging
from enum import Enum

logger = logging.getLogger(__name__)

# TODO(production): Local Redis; needs HA Redis with replication
# Current: Single Redis instance, fail-open to defaults
# Cloud: ElastiCache cluster with automatic failover
# Migration risk: Low — fail-open design handles outages gracefully
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
    # mql.streaming_batch is frontend-only — controls whether the frontend calls
    # /query/batch/stream (NDJSON) or /query/batch (JSON array). No backend fallback.
    Flag.MQL_STREAMING_BATCH: True,
    Flag.MQL_SINGLEFLIGHT: False,
}


def _flag_key(flag: str | Flag) -> str:
    return flag.value if isinstance(flag, Flag) else flag


async def is_enabled(flag: str | Flag) -> bool:
    """Check if a feature flag is enabled. Fail-open on Redis errors."""
    key = _flag_key(flag)
    try:
        from neoguard.db.redis.connection import get_redis
        redis = get_redis()
        val = await redis.hget(REDIS_KEY, key)
        if val is None:
            return DEFAULTS.get(key, True)
        return val == "1"
    except Exception:
        logger.debug("Feature flag check failed, using default for %s", key)
        return DEFAULTS.get(key, True)


async def set_flag(flag: str | Flag, enabled: bool) -> None:
    """Set a feature flag value in Redis."""
    from neoguard.db.redis.connection import get_redis
    redis = get_redis()
    await redis.hset(REDIS_KEY, _flag_key(flag), "1" if enabled else "0")


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
