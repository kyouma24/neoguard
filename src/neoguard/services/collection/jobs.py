import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool


async def create_job(
    tenant_id: str,
    job_type: str,
    target_id: str,
    config: dict | None = None,
) -> dict:
    job_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO collection_jobs
                (id, tenant_id, job_type, target_id, status, config)
            VALUES ($1, $2, $3, $4, 'running', $5)
            RETURNING *
            """,
            job_id, tenant_id, job_type, target_id,
            orjson.dumps(config or {}).decode(),
        )
    return _row_to_dict(row)


async def complete_job(
    job_id: str, tenant_id: str, result: dict | None = None, error: str | None = None,
) -> None:
    pool = await get_pool()
    status = "failed" if error else "completed"
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE collection_jobs SET
                status = $3, result = $4, error_message = $5, completed_at = NOW()
            WHERE id = $1 AND tenant_id = $2
            """,
            job_id, tenant_id, status,
            orjson.dumps(result or {}).decode(),
            error or "",
        )


async def get_job(tenant_id: str | None, job_id: str) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM collection_jobs WHERE id = $1 AND tenant_id = $2",
                job_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM collection_jobs WHERE id = $1", job_id,
            )
    return _row_to_dict(row) if row else None


async def list_jobs(
    tenant_id: str | None,
    job_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict]:
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if job_type:
        conditions.append(f"job_type = ${idx}")
        params.append(job_type)
        idx += 1
    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM collection_jobs WHERE {where} ORDER BY created_at DESC LIMIT {limit}",
            *params,
        )
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row) -> dict:
    config = row["config"]
    if isinstance(config, str):
        config = orjson.loads(config)
    result = row["result"]
    if isinstance(result, str):
        result = orjson.loads(result)
    return {
        "id": row["id"],
        "tenant_id": row["tenant_id"],
        "job_type": row["job_type"],
        "target_id": row["target_id"],
        "status": row["status"],
        "config": config,
        "result": result,
        "started_at": str(row["started_at"]) if row["started_at"] else None,
        "completed_at": str(row["completed_at"]) if row["completed_at"] else None,
        "error_message": row["error_message"],
        "created_at": str(row["created_at"]),
    }
