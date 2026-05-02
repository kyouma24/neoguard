from fastapi import APIRouter

from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.db.timescale.connection import get_pool

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    checks = {}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["timescaledb"] = "ok"
    except Exception:
        checks["timescaledb"] = "error"

    try:
        client = await get_clickhouse()
        await client.query("SELECT 1")
        checks["clickhouse"] = "ok"
    except Exception:
        checks["clickhouse"] = "error"

    status = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"

    return {
        "status": status,
        "checks": checks,
    }
