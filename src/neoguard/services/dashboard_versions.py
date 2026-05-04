import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.dashboard_versions import DashboardVersion


async def save_version(
    dashboard_id: str,
    data: dict,
    user_id: str,
    change_summary: str = "",
) -> DashboardVersion:
    version_id = str(ULID())
    data_json = orjson.dumps(data).decode()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO dashboard_versions (id, dashboard_id, version_number, data, change_summary, created_by)
            VALUES ($1, $2,
                    COALESCE((SELECT MAX(version_number) FROM dashboard_versions WHERE dashboard_id = $2), 0) + 1,
                    $3, $4, $5)
            RETURNING *
            """,
            version_id, dashboard_id, data_json, change_summary, user_id,
        )
    return _row_to_version(row)


async def list_versions(
    dashboard_id: str, limit: int = 50, offset: int = 0, *, tenant_id: str | None = None,
) -> list[DashboardVersion]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT dv.* FROM dashboard_versions dv"
                " JOIN dashboards d ON d.id = dv.dashboard_id"
                " WHERE dv.dashboard_id = $1 AND d.tenant_id = $2"
                " ORDER BY dv.version_number DESC LIMIT $3 OFFSET $4",
                dashboard_id, tenant_id, limit, offset,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM dashboard_versions WHERE dashboard_id = $1"
                " ORDER BY version_number DESC LIMIT $2 OFFSET $3",
                dashboard_id, limit, offset,
            )
    return [_row_to_version(r) for r in rows]


async def get_version(
    dashboard_id: str, version_number: int, *, tenant_id: str | None = None,
) -> DashboardVersion | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT dv.* FROM dashboard_versions dv"
                " JOIN dashboards d ON d.id = dv.dashboard_id"
                " WHERE dv.dashboard_id = $1 AND dv.version_number = $2 AND d.tenant_id = $3",
                dashboard_id, version_number, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM dashboard_versions WHERE dashboard_id = $1 AND version_number = $2",
                dashboard_id, version_number,
            )
    return _row_to_version(row) if row else None


async def count_versions(dashboard_id: str, *, tenant_id: str | None = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            return await conn.fetchval(
                "SELECT COUNT(*) FROM dashboard_versions dv"
                " JOIN dashboards d ON d.id = dv.dashboard_id"
                " WHERE dv.dashboard_id = $1 AND d.tenant_id = $2",
                dashboard_id, tenant_id,
            )
        return await conn.fetchval(
            "SELECT COUNT(*) FROM dashboard_versions WHERE dashboard_id = $1",
            dashboard_id,
        )


def _row_to_version(row) -> DashboardVersion:
    data_raw = row["data"]
    if isinstance(data_raw, str):
        data_raw = orjson.loads(data_raw)
    return DashboardVersion(
        id=row["id"],
        dashboard_id=row["dashboard_id"],
        version_number=row["version_number"],
        data=data_raw,
        change_summary=row["change_summary"],
        created_by=row["created_by"],
        created_at=row["created_at"],
    )
