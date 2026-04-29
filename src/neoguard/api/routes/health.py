from fastapi import APIRouter

from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.db.timescale.connection import get_pool
from neoguard.services.logs.writer import log_writer
from neoguard.services.metrics.writer import metric_writer

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    checks = {}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["timescaledb"] = "ok"
    except Exception as e:
        checks["timescaledb"] = f"error: {e}"

    try:
        client = await get_clickhouse()
        await client.query("SELECT 1")
        checks["clickhouse"] = "ok"
    except Exception as e:
        checks["clickhouse"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())

    return {
        "status": "healthy" if all_ok else "degraded",
        "checks": checks,
        "writers": {
            "metrics": metric_writer.stats,
            "logs": log_writer.stats,
        },
    }
