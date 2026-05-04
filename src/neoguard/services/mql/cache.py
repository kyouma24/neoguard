"""Redis-backed MQL query cache with stale-while-revalidate semantics.

Spec reference: D.5 — query cache.

Cache key derivation:
    ``q:{tenant_id}:{sha256(compiled_query)[:16]}:{aligned_from}:{aligned_to}:{interval}``

Timestamp alignment:
    Timestamps are floored to the nearest *interval* boundary so that
    slightly-different time windows that fall in the same bucket share
    cache entries.

TTL policy:
    TTL = min(60, (to - from) / 60).  A 1-hour window gets 60 s TTL,
    a 1-minute window gets 1 s.  Capped at 60 s.

Stale-while-revalidate:
    age < TTL           -> FRESH  (serve, no refresh)
    TTL < age < 2*TTL   -> STALE  (serve + flag for async refresh)
    age > 2*TTL         -> MISS   (must re-query)

Tenant isolation:
    ``tenant_id`` is the FIRST component of the key — belt-and-suspenders
    on top of the SQL-level tenant filter.
"""

from __future__ import annotations

import hashlib
import logging
import time
from enum import Enum

import orjson

from neoguard.db.redis.connection import get_redis

logger = logging.getLogger(__name__)

CACHE_KEY_PREFIX = "q"


class CacheStatus(str, Enum):
    """Result of a cache lookup."""

    FRESH = "fresh"
    STALE = "stale"
    MISS = "miss"


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------


def _align_ts(ts: int, interval: int) -> int:
    """Floor *ts* to the nearest *interval* boundary."""
    if interval <= 0:
        return ts
    return (ts // interval) * interval


def make_cache_key(
    tenant_id: str | None,
    compiled_query: str,
    from_ts: int,
    to_ts: int,
    interval: int,
) -> str:
    """Build a deterministic Redis key for a compiled MQL query.

    The compiled SQL (not the raw user query) is hashed so that
    semantically equivalent queries share cache entries.
    """
    tid = tenant_id or "\x00__platform__"
    query_hash = hashlib.sha256(compiled_query.encode()).hexdigest()[:32]
    aligned_from = _align_ts(from_ts, interval)
    aligned_to = _align_ts(to_ts, interval)
    return f"{CACHE_KEY_PREFIX}:{tid}:{query_hash}:{aligned_from}:{aligned_to}:{interval}"


def compute_ttl(from_ts: int, to_ts: int) -> int:
    """Compute TTL in seconds for the given time range.

    TTL = min(60, range_seconds / 60), with a floor of 1.
    """
    range_sec = max(to_ts - from_ts, 1)
    ttl = range_sec // 60
    return max(1, min(60, ttl))


# ---------------------------------------------------------------------------
# Cache read / write
# ---------------------------------------------------------------------------

# Internal envelope stored in Redis:
#   {"t": <unix-timestamp-when-stored>, "d": <serialised-query-result>}


async def get_cached(
    key: str,
    ttl: int,
) -> tuple[object | None, CacheStatus]:
    """Look up *key* in Redis and classify freshness.

    Args:
        key: The cache key (from :func:`make_cache_key`).
        ttl: The TTL that was used when the entry was stored.

    Returns:
        ``(data, status)`` where *data* is the deserialised result
        (or ``None`` on a miss) and *status* is the freshness class.
    """
    try:
        redis = get_redis()
        raw = await redis.get(key)
    except Exception:
        logger.warning("Redis cache read failed for key=%s", key, exc_info=True)
        return None, CacheStatus.MISS

    if raw is None:
        return None, CacheStatus.MISS

    try:
        envelope = orjson.loads(raw)
    except Exception:
        return None, CacheStatus.MISS

    stored_at: float = envelope.get("t", 0)
    data = envelope.get("d")

    age = time.time() - stored_at

    if age <= ttl:
        return data, CacheStatus.FRESH
    if age <= 2 * ttl:
        return data, CacheStatus.STALE

    return None, CacheStatus.MISS


async def set_cached(key: str, data: object, ttl: int) -> None:
    """Store *data* under *key* with a Redis TTL of ``2 * ttl``.

    We set the Redis-level expiry to ``2 * ttl`` so the entry remains
    readable during the stale window.  The age-based freshness check
    in :func:`get_cached` decides whether it is fresh or stale.
    """
    try:
        redis = get_redis()
        envelope = orjson.dumps({"t": time.time(), "d": data}).decode()
        await redis.set(key, envelope, ex=2 * ttl)
    except Exception:
        logger.warning("Redis cache write failed for key=%s", key, exc_info=True)


async def flush_tenant_cache(tenant_id: str) -> int:
    """Delete all cached queries for a single tenant.

    Uses SCAN with the tenant-scoped key prefix so the operation is
    non-blocking on the Redis event loop.

    Returns:
        The number of keys deleted.
    """
    try:
        redis = get_redis()
        pattern = f"{CACHE_KEY_PREFIX}:{tenant_id}:*"
        deleted = 0
        cursor: int | str = 0
        while True:
            cursor, keys = await redis.scan(cursor=cursor, match=pattern, count=200)
            if keys:
                deleted += await redis.delete(*keys)
            if cursor == 0:
                break
        return deleted
    except Exception:
        logger.warning(
            "Redis cache flush failed for tenant_id=%s", tenant_id, exc_info=True,
        )
        return 0
