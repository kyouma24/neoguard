import asyncpg

from neoguard.core.config import settings
from neoguard.core.logging import log

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_pool() first.")
    return _pool


async def init_pool() -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.asyncpg_dsn,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
    )
    await log.ainfo(
        "TimescaleDB pool initialized", min=settings.db_pool_min, max=settings.db_pool_max
    )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        await log.ainfo("TimescaleDB pool closed")
