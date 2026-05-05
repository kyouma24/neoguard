import asyncpg
import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.azure import (
    AzureSubscription,
    AzureSubscriptionCreate,
    AzureSubscriptionUpdate,
)
from neoguard.services.azure.credentials import cache_client_secret


class DuplicateSubscriptionError(Exception):
    def __init__(self, subscription_id: str, tenant_id: str):
        self.subscription_id = subscription_id
        self.tenant_id = tenant_id
        super().__init__(
            f"Azure subscription {subscription_id} is already connected to this tenant."
        )


async def create_azure_subscription(
    tenant_id: str, data: AzureSubscriptionCreate,
) -> AzureSubscription:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM azure_subscriptions WHERE tenant_id = $1 AND subscription_id = $2",
            tenant_id, data.subscription_id,
        )
        if existing:
            raise DuplicateSubscriptionError(data.subscription_id, tenant_id)

    sub_id = str(ULID())
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO azure_subscriptions
                    (id, tenant_id, name, subscription_id, azure_tenant_id,
                     client_id, client_secret, regions, collect_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
                """,
                sub_id, tenant_id, data.name, data.subscription_id,
                data.tenant_id, data.client_id, data.client_secret,
                orjson.dumps(data.regions).decode(),
                orjson.dumps(data.collect_config).decode(),
            )
    except asyncpg.UniqueViolationError:
        raise DuplicateSubscriptionError(data.subscription_id, tenant_id)
    sub = _row_to_subscription(row)
    cache_client_secret(sub.subscription_id, data.client_secret)
    return sub


async def get_azure_subscription(
    tenant_id: str | None, sub_id: str,
) -> AzureSubscription | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM azure_subscriptions WHERE id = $1 AND tenant_id = $2",
                sub_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM azure_subscriptions WHERE id = $1", sub_id,
            )
    if not row:
        return None
    sub = _row_to_subscription(row)
    cache_client_secret(sub.subscription_id, row["client_secret"])
    return sub


async def list_azure_subscriptions(
    tenant_id: str | None, enabled_only: bool = False, limit: int = 50, offset: int = 0,
) -> list[AzureSubscription]:
    pool = await get_pool()
    conditions: list[str] = []
    params: list = []
    idx = 1
    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if enabled_only:
        conditions.append("enabled = TRUE")
    where = (" AND ".join(conditions)) if conditions else "TRUE"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM azure_subscriptions WHERE {where}"
            f" ORDER BY name LIMIT {limit} OFFSET {offset}",
            *params,
        )
    subs = []
    for r in rows:
        sub = _row_to_subscription(r)
        cache_client_secret(sub.subscription_id, r["client_secret"])
        subs.append(sub)
    return subs


async def update_azure_subscription(
    tenant_id: str | None, sub_id: str, data: AzureSubscriptionUpdate,
) -> AzureSubscription | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_azure_subscription(tenant_id, sub_id)

    set_parts = []
    params = []
    if tenant_id:
        where = "WHERE id = $1 AND tenant_id = $2"
        base_params = [sub_id, tenant_id]
        idx = 3
    else:
        where = "WHERE id = $1"
        base_params = [sub_id]
        idx = 2
    for field, value in updates.items():
        if field in ("regions", "collect_config"):
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1
    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE azure_subscriptions SET {', '.join(set_parts)} {where} RETURNING *",
            *base_params, *params,
        )
    if not row:
        return None
    sub = _row_to_subscription(row)
    cache_client_secret(sub.subscription_id, row["client_secret"])
    return sub


async def delete_azure_subscription(tenant_id: str | None, sub_id: str) -> bool:
    pool = await get_pool()
    if tenant_id:
        query = "DELETE FROM azure_subscriptions WHERE id = $1 AND tenant_id = $2"
        args = (sub_id, tenant_id)
    else:
        query = "DELETE FROM azure_subscriptions WHERE id = $1"
        args = (sub_id,)
    async with pool.acquire() as conn:
        result = await conn.execute(query, *args)
    return result == "DELETE 1"


async def mark_synced(tenant_id: str, sub_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE azure_subscriptions SET last_sync_at = NOW()"
            " WHERE id = $1 AND tenant_id = $2",
            sub_id, tenant_id,
        )


def _row_to_subscription(row) -> AzureSubscription:
    regions = row["regions"]
    if isinstance(regions, str):
        regions = orjson.loads(regions)
    config = row["collect_config"]
    if isinstance(config, str):
        config = orjson.loads(config)
    return AzureSubscription(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        subscription_id=row["subscription_id"],
        azure_tenant_id=row["azure_tenant_id"],
        client_id=row["client_id"],
        regions=regions,
        enabled=row["enabled"],
        collect_config=config,
        last_sync_at=row["last_sync_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
