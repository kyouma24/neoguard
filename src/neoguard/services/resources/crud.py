import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.resources import Resource, ResourceCreate, ResourceUpdate


async def create_resource(tenant_id: str, data: ResourceCreate) -> Resource:
    resource_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO resources
                (id, tenant_id, resource_type, provider, region, account_id,
                 name, external_id, tags, metadata, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            """,
            resource_id, tenant_id, data.resource_type.value, data.provider.value,
            data.region, data.account_id, data.name, data.external_id,
            orjson.dumps(data.tags).decode(),
            orjson.dumps(data.metadata).decode(),
            data.status.value,
        )
    return _row_to_resource(row)


async def upsert_resource(tenant_id: str, data: ResourceCreate) -> Resource:
    """Insert or update based on (tenant_id, provider, external_id)."""
    if not data.external_id:
        return await create_resource(tenant_id, data)

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            """
            SELECT id FROM resources
            WHERE tenant_id = $1 AND provider = $2 AND external_id = $3
            """,
            tenant_id, data.provider.value, data.external_id,
        )

        if existing:
            row = await conn.fetchrow(
                """
                UPDATE resources SET
                    name = $3, tags = $4, metadata = $5, status = $6,
                    region = $7, account_id = $8, resource_type = $9,
                    last_seen_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND tenant_id = $2
                RETURNING *
                """,
                existing["id"], tenant_id, data.name,
                orjson.dumps(data.tags).decode(),
                orjson.dumps(data.metadata).decode(),
                data.status.value, data.region, data.account_id,
                data.resource_type.value,
            )
        else:
            resource_id = str(ULID())
            row = await conn.fetchrow(
                """
                INSERT INTO resources
                    (id, tenant_id, resource_type, provider, region, account_id,
                     name, external_id, tags, metadata, status, last_seen_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                RETURNING *
                """,
                resource_id, tenant_id, data.resource_type.value,
                data.provider.value, data.region, data.account_id,
                data.name, data.external_id,
                orjson.dumps(data.tags).decode(),
                orjson.dumps(data.metadata).decode(),
                data.status.value,
            )
    return _row_to_resource(row)


async def get_resource(tenant_id: str | None, resource_id: str) -> Resource | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM resources WHERE id = $1 AND tenant_id = $2",
                resource_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM resources WHERE id = $1", resource_id,
            )
    return _row_to_resource(row) if row else None


async def list_resources(
    tenant_id: str | None,
    resource_type: str | None = None,
    provider: str | None = None,
    account_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Resource]:
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    for field, value in [
        ("resource_type", resource_type),
        ("provider", provider),
        ("account_id", account_id),
        ("status", status),
    ]:
        if value:
            conditions.append(f"{field} = ${idx}")
            params.append(value)
            idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM resources WHERE {where} ORDER BY name LIMIT {limit} OFFSET {offset}",
            *params,
        )
    return [_row_to_resource(r) for r in rows]


async def update_resource(
    tenant_id: str, resource_id: str, data: ResourceUpdate,
) -> Resource | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_resource(tenant_id, resource_id)

    set_parts = []
    params = []
    idx = 3
    for field, value in updates.items():
        if field in ("tags", "metadata"):
            value = orjson.dumps(value).decode()
        elif field == "status":
            value = value.value
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1
    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE resources SET {', '.join(set_parts)}"
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            resource_id, tenant_id, *params,
        )
    return _row_to_resource(row) if row else None


async def delete_resource(tenant_id: str, resource_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM resources WHERE id = $1 AND tenant_id = $2",
            resource_id, tenant_id,
        )
    return result == "DELETE 1"


async def get_resource_summary(tenant_id: str | None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                """
                SELECT resource_type, provider, status, COUNT(*) AS cnt
                FROM resources WHERE tenant_id = $1
                GROUP BY resource_type, provider, status
                ORDER BY resource_type
                """,
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT resource_type, provider, status, COUNT(*) AS cnt
                FROM resources
                GROUP BY resource_type, provider, status
                ORDER BY resource_type
                """,
            )
    summary: dict = {"total": 0, "by_type": {}, "by_provider": {}, "by_status": {}}
    for r in rows:
        cnt = r["cnt"]
        summary["total"] += cnt
        rt = r["resource_type"]
        prov = r["provider"]
        st = r["status"]
        summary["by_type"][rt] = summary["by_type"].get(rt, 0) + cnt
        summary["by_provider"][prov] = summary["by_provider"].get(prov, 0) + cnt
        summary["by_status"][st] = summary["by_status"].get(st, 0) + cnt
    return summary


def _row_to_resource(row) -> Resource:
    tags = row["tags"]
    if isinstance(tags, str):
        tags = orjson.loads(tags)
    meta = row["metadata"]
    if isinstance(meta, str):
        meta = orjson.loads(meta)
    return Resource(
        id=row["id"],
        tenant_id=row["tenant_id"],
        resource_type=row["resource_type"],
        provider=row["provider"],
        region=row["region"],
        account_id=row["account_id"],
        name=row["name"],
        external_id=row["external_id"],
        tags=tags,
        metadata=meta,
        status=row["status"],
        last_seen_at=row["last_seen_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
