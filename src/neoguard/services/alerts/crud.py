import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import (
    AlertEvent,
    AlertRule,
    AlertRuleCreate,
    AlertRuleUpdate,
    AlertStatus,
)


async def create_alert_rule(tenant_id: str, data: AlertRuleCreate) -> AlertRule:
    rule_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO alert_rules (id, tenant_id, name, description, metric_name, tags_filter,
                condition, threshold, duration_sec, interval_sec, severity, notification)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
            """,
            rule_id, tenant_id, data.name, data.description, data.metric_name,
            orjson.dumps(data.tags_filter).decode(),
            data.condition.value, data.threshold, data.duration_sec, data.interval_sec,
            data.severity.value, orjson.dumps(data.notification).decode(),
        )
    return _row_to_rule(row)


async def get_alert_rule(tenant_id: str, rule_id: str) -> AlertRule | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM alert_rules WHERE id = $1 AND tenant_id = $2",
            rule_id, tenant_id,
        )
    return _row_to_rule(row) if row else None


async def list_alert_rules(tenant_id: str) -> list[AlertRule]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM alert_rules WHERE tenant_id = $1 ORDER BY created_at DESC",
            tenant_id,
        )
    return [_row_to_rule(r) for r in rows]


async def update_alert_rule(
    tenant_id: str, rule_id: str, data: AlertRuleUpdate,
) -> AlertRule | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_alert_rule(tenant_id, rule_id)

    set_parts = []
    params = []
    idx = 3

    for field, value in updates.items():
        if field == "severity":
            value = value.value
        elif field == "notification":
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE alert_rules SET {', '.join(set_parts)}"  # noqa: S608
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            rule_id, tenant_id, *params,
        )
    return _row_to_rule(row) if row else None


async def delete_alert_rule(tenant_id: str, rule_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM alert_rules WHERE id = $1 AND tenant_id = $2",
            rule_id, tenant_id,
        )
    return result == "DELETE 1"


async def list_alert_events(
    tenant_id: str,
    rule_id: str | None = None,
    status: AlertStatus | None = None,
    limit: int = 50,
) -> list[AlertEvent]:
    conditions = ["tenant_id = $1"]
    params: list = [tenant_id]
    idx = 2

    if rule_id:
        conditions.append(f"rule_id = ${idx}")
        params.append(rule_id)
        idx += 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status.value)
        idx += 1

    where = " AND ".join(conditions)

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM alert_events WHERE {where} ORDER BY fired_at DESC LIMIT ${idx}",
            *params, limit,
        )

    return [AlertEvent(
        id=r["id"],
        tenant_id=r["tenant_id"],
        rule_id=r["rule_id"],
        status=AlertStatus(r["status"]),
        value=r["value"],
        threshold=r["threshold"],
        message=r["message"],
        fired_at=r["fired_at"],
        resolved_at=r["resolved_at"],
    ) for r in rows]


def _row_to_rule(row) -> AlertRule:
    tags = row["tags_filter"]
    if isinstance(tags, str):
        tags = orjson.loads(tags)
    notif = row["notification"]
    if isinstance(notif, str):
        notif = orjson.loads(notif)

    return AlertRule(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        description=row["description"],
        metric_name=row["metric_name"],
        tags_filter=tags,
        condition=row["condition"],
        threshold=row["threshold"],
        duration_sec=row["duration_sec"],
        interval_sec=row["interval_sec"],
        severity=row["severity"],
        enabled=row["enabled"],
        notification=notif,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
