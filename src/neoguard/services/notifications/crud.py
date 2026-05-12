import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.notifications import (
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
)


async def create_channel(
    tenant_id: str, data: NotificationChannelCreate,
) -> NotificationChannel:
    channel_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO notification_channels
                (id, tenant_id, name, channel_type, config, enabled)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            channel_id, tenant_id, data.name, data.channel_type.value,
            orjson.dumps(data.config).decode(), data.enabled,
        )
    return _row_to_channel(row)


async def get_channel(
    tenant_id: str | None, channel_id: str,
) -> NotificationChannel | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM notification_channels WHERE id = $1 AND tenant_id = $2",
                channel_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM notification_channels WHERE id = $1", channel_id,
            )
    return _row_to_channel(row) if row else None


async def list_channels(
    tenant_id: str | None, limit: int = 50, offset: int = 0,
) -> list[NotificationChannel]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT * FROM notification_channels WHERE tenant_id = $1"
                " ORDER BY created_at DESC LIMIT $2 OFFSET $3",
                tenant_id, limit, offset,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM notification_channels"
                " ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                limit, offset,
            )
    return [_row_to_channel(r) for r in rows]


async def list_enabled_channels(
    tenant_id: str, channel_ids: list[str],
) -> list[NotificationChannel]:
    if not channel_ids:
        return []
    pool = await get_pool()
    placeholders = ", ".join(f"${i + 2}" for i in range(len(channel_ids)))
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM notification_channels"  # noqa: S608
            f" WHERE tenant_id = $1 AND enabled = TRUE AND id IN ({placeholders})",
            tenant_id, *channel_ids,
        )
    return [_row_to_channel(r) for r in rows]


async def update_channel(
    tenant_id: str, channel_id: str, data: NotificationChannelUpdate,
) -> NotificationChannel | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_channel(tenant_id, channel_id)

    if data.config is not None:
        existing = await get_channel(tenant_id, channel_id)
        if existing:
            from neoguard.models.notifications import validate_channel_config
            validate_channel_config(existing.channel_type, data.config)

    set_parts = []
    params = []
    idx = 3

    for field, value in updates.items():
        if field == "config":
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE notification_channels SET {', '.join(set_parts)}"  # noqa: S608
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            channel_id, tenant_id, *params,
        )
    return _row_to_channel(row) if row else None


async def delete_channel(tenant_id: str, channel_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM notification_channels WHERE id = $1 AND tenant_id = $2",
            channel_id, tenant_id,
        )
    return result == "DELETE 1"


async def get_notification_delivery(
    tenant_id: str | None, event_id: str,
) -> dict | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                """
                SELECT id, rule_id, status, notification_meta, fired_at, resolved_at
                FROM alert_events
                WHERE id = $1 AND tenant_id = $2
                """,
                event_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                """
                SELECT id, rule_id, status, notification_meta, fired_at, resolved_at
                FROM alert_events
                WHERE id = $1
                """,
                event_id,
            )
    if not row:
        return None
    meta = row["notification_meta"]
    if isinstance(meta, str):
        meta = orjson.loads(meta)
    return {
        "event_id": row["id"],
        "rule_id": row["rule_id"],
        "status": row["status"],
        "notification_meta": meta if isinstance(meta, dict) else {},
        "fired_at": row["fired_at"].isoformat(),
        "resolved_at": row["resolved_at"].isoformat() if row["resolved_at"] else None,
    }


async def list_notification_deliveries(
    tenant_id: str | None,
    rule_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    conditions = ["notification_meta != '{}'::jsonb"]
    params: list = []
    idx = 1
    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if rule_id:
        conditions.append(f"rule_id = ${idx}")
        params.append(rule_id)
        idx += 1
    where = " AND ".join(conditions)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT id, rule_id, status, notification_meta, fired_at, resolved_at"  # noqa: S608
            f" FROM alert_events WHERE {where}"
            f" ORDER BY fired_at DESC LIMIT ${idx}",
            *params, limit,
        )
    results = []
    for row in rows:
        meta = row["notification_meta"]
        if isinstance(meta, str):
            meta = orjson.loads(meta)
        results.append({
            "event_id": row["id"],
            "rule_id": row["rule_id"],
            "status": row["status"],
            "notification_meta": meta if isinstance(meta, dict) else {},
            "fired_at": row["fired_at"].isoformat(),
            "resolved_at": row["resolved_at"].isoformat() if row["resolved_at"] else None,
        })
    return results


def _row_to_channel(row) -> NotificationChannel:
    config = row["config"]
    if isinstance(config, str):
        config = orjson.loads(config)

    return NotificationChannel(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        channel_type=row["channel_type"],
        config=config,
        enabled=row["enabled"],
        created_at=row["created_at"],
    )
