import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.dashboards import (
    Dashboard,
    DashboardCreate,
    DashboardLink,
    DashboardSummary,
    DashboardUpdate,
    DashboardVariable,
    PanelDefinition,
    PanelGroup,
)


async def create_dashboard(
    tenant_id: str, data: DashboardCreate, created_by: str | None = None,
) -> Dashboard:
    dash_id = str(ULID())
    panels_json = orjson.dumps([p.model_dump() for p in data.panels]).decode()
    variables_json = orjson.dumps([v.model_dump() for v in data.variables]).decode()
    groups_json = orjson.dumps([g.model_dump() for g in data.groups]).decode()
    tags_json = orjson.dumps(data.tags).decode()
    links_json = orjson.dumps([lk.model_dump() for lk in data.links]).decode()

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO dashboards (id, tenant_id, name, description, panels, variables, groups, tags, links, layout_version, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            """,
            dash_id, tenant_id, data.name, data.description, panels_json, variables_json, groups_json, tags_json, links_json, data.layout_version, created_by,
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
    tenant_id: str | None, limit: int = 50, offset: int = 0, search: str | None = None,
) -> list[DashboardSummary]:
    conditions = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    if search:
        if len(search) < 3:
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            conditions.append(f"name ILIKE ${idx}")
            params.append(f"%{escaped}%")
        else:
            conditions.append(f"search_vector @@ plainto_tsquery('english', ${idx})")
            params.append(search)
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"

    params.append(limit)
    limit_idx = idx
    idx += 1
    params.append(offset)
    offset_idx = idx

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM dashboards WHERE {where}"  # noqa: S608
            f" ORDER BY updated_at DESC LIMIT ${limit_idx} OFFSET ${offset_idx}",
            *params,
        )
    return [_row_to_summary(r) for r in rows]


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
        elif field == "variables":
            encoded = [v.model_dump() if isinstance(v, DashboardVariable) else v for v in value]
            value = orjson.dumps(encoded).decode()
        elif field == "groups":
            encoded = [g.model_dump() if isinstance(g, PanelGroup) else g for g in value]
            value = orjson.dumps(encoded).decode()
        elif field == "tags":
            value = orjson.dumps(value).decode()
        elif field == "links":
            encoded = [lk.model_dump() if isinstance(lk, DashboardLink) else lk for lk in value]
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


async def toggle_favorite(tenant_id: str, user_id: str, dashboard_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT 1 FROM dashboard_favorites df"
            " JOIN dashboards d ON d.id = df.dashboard_id"
            " WHERE df.user_id = $1 AND df.dashboard_id = $2 AND d.tenant_id = $3",
            user_id, dashboard_id, tenant_id,
        )
        if existing:
            await conn.execute(
                "DELETE FROM dashboard_favorites WHERE user_id = $1 AND dashboard_id = $2",
                user_id, dashboard_id,
            )
            return False
        else:
            await conn.execute(
                "INSERT INTO dashboard_favorites (tenant_id, user_id, dashboard_id)"
                " VALUES ($1, $2, $3)",
                tenant_id, user_id, dashboard_id,
            )
            return True


async def list_favorites(tenant_id: str, user_id: str) -> list[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT df.dashboard_id FROM dashboard_favorites df"
            " JOIN dashboards d ON d.id = df.dashboard_id"
            " WHERE df.user_id = $1 AND d.tenant_id = $2"
            " ORDER BY df.favorited_at DESC",
            user_id, tenant_id,
        )
    return [r["dashboard_id"] for r in rows]



async def delete_dashboard(tenant_id: str, dashboard_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM dashboards WHERE id = $1 AND tenant_id = $2",
            dashboard_id, tenant_id,
        )
    return result == "DELETE 1"


def _row_to_summary(row) -> DashboardSummary:
    panels_raw = row["panels"]
    if isinstance(panels_raw, str):
        panels_raw = orjson.loads(panels_raw)
    panel_count = len(panels_raw) if isinstance(panels_raw, list) else 0

    tags_raw = row.get("tags") or "[]"
    if isinstance(tags_raw, str):
        tags_raw = orjson.loads(tags_raw)

    return DashboardSummary(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        description=row["description"],
        panel_count=panel_count,
        tags=tags_raw,
        layout_version=row.get("layout_version", 1),
        created_by=row.get("created_by"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_dashboard(row) -> Dashboard:
    panels_raw = row["panels"]
    if isinstance(panels_raw, str):
        panels_raw = orjson.loads(panels_raw)
    panels = [PanelDefinition(**p) for p in panels_raw]

    variables_raw = row.get("variables") or "[]"
    if isinstance(variables_raw, str):
        variables_raw = orjson.loads(variables_raw)
    variables = [DashboardVariable(**v) for v in variables_raw]

    groups_raw = row.get("groups") or "[]"
    if isinstance(groups_raw, str):
        groups_raw = orjson.loads(groups_raw)
    groups = [PanelGroup(**g) for g in groups_raw]

    tags_raw = row.get("tags") or "[]"
    if isinstance(tags_raw, str):
        tags_raw = orjson.loads(tags_raw)

    links_raw = row.get("links") or "[]"
    if isinstance(links_raw, str):
        links_raw = orjson.loads(links_raw)
    links = [DashboardLink(**lk) for lk in links_raw]

    return Dashboard(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        description=row["description"],
        panels=panels,
        variables=variables,
        groups=groups,
        tags=tags_raw,
        links=links,
        layout_version=row.get("layout_version", 1),
        created_by=row.get("created_by"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
