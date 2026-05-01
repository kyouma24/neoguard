from __future__ import annotations

import redis.asyncio as aioredis

from neoguard.core.config import settings

_pool: aioredis.Redis | None = None


async def init_redis() -> aioredis.Redis:
    global _pool
    _pool = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=20,
    )
    await _pool.ping()
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


def get_redis() -> aioredis.Redis:
    if _pool is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _pool
