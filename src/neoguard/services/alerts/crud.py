from datetime import UTC, datetime, timedelta

import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import (
    AlertCondition,
    AlertEvent,
    AlertPreviewResult,
    AlertRule,
    AlertRuleCreate,
    AlertRulePreview,
    AlertRuleUpdate,
    AlertSeverity,
    AlertStatus,
)


async def create_alert_rule(tenant_id: str, data: AlertRuleCreate) -> AlertRule:
    rule_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO alert_rules (id, tenant_id, name, description, metric_name, tags_filter,
                condition, threshold, duration_sec, interval_sec, severity, notification,
                aggregation, cooldown_sec, nodata_action)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
            """,
            rule_id, tenant_id, data.name, data.description, data.metric_name,
            orjson.dumps(data.tags_filter).decode(),
            data.condition.value, data.threshold, data.duration_sec, data.interval_sec,
            data.severity.value, orjson.dumps(data.notification).decode(),
            data.aggregation.value, data.cooldown_sec, data.nodata_action.value,
        )
    return _row_to_rule(row)


async def get_alert_rule(tenant_id: str | None, rule_id: str) -> AlertRule | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM alert_rules WHERE id = $1 AND tenant_id = $2",
                rule_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM alert_rules WHERE id = $1", rule_id,
            )
    return _row_to_rule(row) if row else None


async def list_alert_rules(
    tenant_id: str | None, limit: int = 50, offset: int = 0,
) -> list[AlertRule]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT * FROM alert_rules WHERE tenant_id = $1"
                " ORDER BY created_at DESC LIMIT $2 OFFSET $3",
                tenant_id, limit, offset,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM alert_rules"
                " ORDER BY created_at DESC LIMIT $1 OFFSET $2",
                limit, offset,
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

    enum_fields = {"severity", "condition", "aggregation", "nodata_action"}
    json_fields = {"notification", "tags_filter"}

    for field, value in updates.items():
        if field in enum_fields:
            value = value.value
        elif field in json_fields:
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
    tenant_id: str | None,
    rule_id: str | None = None,
    status: AlertStatus | None = None,
    severity: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 50,
) -> list[AlertEvent]:
    conditions: list[str] = []
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

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status.value)
        idx += 1

    if severity:
        conditions.append(f"severity = ${idx}")
        params.append(severity)
        idx += 1

    if start:
        conditions.append(f"fired_at >= ${idx}")
        params.append(start)
        idx += 1

    if end:
        conditions.append(f"fired_at <= ${idx}")
        params.append(end)
        idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM alert_events WHERE {where} ORDER BY fired_at DESC LIMIT ${idx}",
            *params, limit,
        )

    return [_row_to_event(r) for r in rows]


async def acknowledge_alert_event(
    tenant_id: str, event_id: str, acknowledged_by: str,
) -> AlertEvent | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE alert_events
            SET acknowledged_at = NOW(), acknowledged_by = $3
            WHERE id = $1 AND tenant_id = $2
            RETURNING *
            """,
            event_id, tenant_id, acknowledged_by,
        )
    return _row_to_event(row) if row else None


async def preview_alert_rule(
    tenant_id: str, preview: AlertRulePreview,
) -> AlertPreviewResult:
    pool = await get_pool()
    now = datetime.now(UTC)
    lookback_start = now - timedelta(hours=preview.lookback_hours)

    import re
    _SAFE_TAG_KEY = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$")

    tag_conditions = ""
    tag_params: list = [tenant_id, preview.metric_name, lookback_start]
    idx = 4
    for key, val in preview.tags_filter.items():
        if not _SAFE_TAG_KEY.match(key) or len(key) > 128:
            continue
        tag_conditions += f" AND tags->>({f'${idx}'}) = ${idx + 1}"
        tag_params.extend([key, val])
        idx += 2

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT time, value
            FROM metrics
            WHERE tenant_id = $1 AND name = $2 AND time >= $3{tag_conditions}
            ORDER BY time ASC
            """,
            *tag_params,
        )

    datapoints = len(rows)
    if datapoints == 0:
        return AlertPreviewResult(
            would_fire=False,
            current_value=None,
            datapoints=0,
            simulated_events=[],
        )

    # Extract current (latest) value
    current_value = float(rows[-1]["value"])

    # Simulate the evaluation loop
    condition = preview.condition
    threshold = preview.threshold
    duration_sec = preview.duration_sec
    step_sec = duration_sec  # evaluate every duration_sec

    simulated_events: list[dict] = []
    is_firing = False
    pending_since: datetime | None = None

    # Group datapoints into buckets of step_sec
    bucket_start = lookback_start
    while bucket_start < now:
        bucket_end = bucket_start + timedelta(seconds=step_sec)
        bucket_values = [float(r["value"]) for r in rows if bucket_start <= r["time"] < bucket_end]

        if bucket_values:
            agg_value = _aggregate(bucket_values, preview.aggregation.value)
            breaching = _check_condition(agg_value, condition, threshold)

            if breaching and not is_firing:
                if pending_since is None:
                    pending_since = bucket_start
                # Check if we've been pending long enough
                if (bucket_end - pending_since).total_seconds() >= duration_sec:
                    is_firing = True
                    pending_since = None
                    simulated_events.append({
                        "timestamp": bucket_end.isoformat(),
                        "value": agg_value,
                        "status": "firing",
                    })
            elif not breaching and is_firing:
                is_firing = False
                simulated_events.append({
                    "timestamp": bucket_end.isoformat(),
                    "value": agg_value,
                    "status": "resolved",
                })
            elif not breaching:
                pending_since = None

        bucket_start = bucket_end

    return AlertPreviewResult(
        would_fire=len(simulated_events) > 0,
        current_value=current_value,
        datapoints=datapoints,
        simulated_events=simulated_events,
    )


def _check_condition(value: float, condition: AlertCondition, threshold: float) -> bool:
    if condition == AlertCondition.GT:
        return value > threshold
    if condition == AlertCondition.LT:
        return value < threshold
    if condition == AlertCondition.GTE:
        return value >= threshold
    if condition == AlertCondition.LTE:
        return value <= threshold
    if condition == AlertCondition.EQ:
        return value == threshold
    if condition == AlertCondition.NE:
        return value != threshold
    return False


def _aggregate(values: list[float], aggregation: str) -> float:
    if not values:
        return 0.0
    if aggregation == "avg":
        return sum(values) / len(values)
    if aggregation == "min":
        return min(values)
    if aggregation == "max":
        return max(values)
    if aggregation == "sum":
        return sum(values)
    if aggregation == "count":
        return float(len(values))
    if aggregation == "last":
        return values[-1]
    if aggregation == "p95":
        return _percentile(values, 95)
    if aggregation == "p99":
        return _percentile(values, 99)
    return sum(values) / len(values)


def _percentile(values: list[float], pct: int) -> float:
    sorted_vals = sorted(values)
    k = (len(sorted_vals) - 1) * pct / 100
    f = int(k)
    c = f + 1
    if c >= len(sorted_vals):
        return sorted_vals[-1]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


def _row_to_rule(row) -> AlertRule:  # type: ignore[no-untyped-def]
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
        aggregation=row.get("aggregation", "avg"),
        cooldown_sec=row.get("cooldown_sec", 300),
        nodata_action=row.get("nodata_action", "ok"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_event(r) -> AlertEvent:  # type: ignore[no-untyped-def]
    notif_meta = r.get("notification_meta")
    if isinstance(notif_meta, str):
        notif_meta = orjson.loads(notif_meta)
    elif notif_meta is None:
        notif_meta = {}

    return AlertEvent(
        id=r["id"],
        tenant_id=r["tenant_id"],
        rule_id=r["rule_id"],
        rule_name=r.get("rule_name") or "",
        severity=AlertSeverity(r.get("severity") or "P3"),
        status=AlertStatus(r["status"]),
        value=r["value"],
        threshold=r["threshold"],
        message=r["message"],
        notification_meta=notif_meta,
        fired_at=r["fired_at"],
        resolved_at=r["resolved_at"],
        acknowledged_at=r.get("acknowledged_at"),
        acknowledged_by=r.get("acknowledged_by") or "",
    )
