import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.dashboards import (
    Dashboard,
    DashboardCreate,
    DashboardUpdate,
    PanelDefinition,
)


async def create_dashboard(tenant_id: str, data: DashboardCreate) -> Dashboard:
    dash_id = str(ULID())
    panels_json = orjson.dumps([p.model_dump() for p in data.panels]).decode()

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO dashboards (id, tenant_id, name, description, panels)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
            """,
            dash_id, tenant_id, data.name, data.description, panels_json,
        )
    return _row_to_dashboard(row)


async def get_dashboard(tenant_id: str | None, dashboard_id: str) -> Dashboard | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM dashboards WHERE id = $1 AND tenant_id = $2",
                dashboard_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM dashboards WHERE id = $1", dashboard_id,
            )
    return _row_to_dashboard(row) if row else None


async def list_dashboards(
    tenant_id: str | None, limit: int = 50, offset: int = 0,
) -> list[Dashboard]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT * FROM dashboards WHERE tenant_id = $1 ORDER BY updated_at DESC"
                f" LIMIT {limit} OFFSET {offset}",
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM dashboards ORDER BY updated_at DESC"
                f" LIMIT {limit} OFFSET {offset}",
            )
    return [_row_to_dashboard(r) for r in rows]


async def update_dashboard(
    tenant_id: str, dashboard_id: str, data: DashboardUpdate
) -> Dashboard | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_dashboard(tenant_id, dashboard_id)

    set_parts = []
    params = []
    idx = 3

    for field, value in updates.items():
        if field == "panels":
            encoded = [p.model_dump() if isinstance(p, PanelDefinition) else p for p in value]
            value = orjson.dumps(encoded).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE dashboards SET {', '.join(set_parts)}"  # noqa: S608
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            dashboard_id, tenant_id, *params,
        )
    return _row_to_dashboard(row) if row else None


async def delete_dashboard(tenant_id: str, dashboard_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM dashboards WHERE id = $1 AND tenant_id = $2",
            dashboard_id, tenant_id,
        )
    return result == "DELETE 1"


def _row_to_dashboard(row) -> Dashboard:
    panels_raw = row["panels"]
    if isinstance(panels_raw, str):
        panels_raw = orjson.loads(panels_raw)
    panels = [PanelDefinition(**p) for p in panels_raw]

    return Dashboard(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        description=row["description"],
        panels=panels,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
