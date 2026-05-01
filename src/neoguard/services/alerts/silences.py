from datetime import UTC, datetime

import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import Silence, SilenceCreate, SilenceUpdate


async def create_silence(tenant_id: str, data: SilenceCreate, created_by: str = "") -> Silence:
    silence_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO alert_silences
                (id, tenant_id, name, comment, rule_ids, matchers,
                 starts_at, ends_at, timezone, recurring,
                 recurrence_days, recurrence_start_time, recurrence_end_time,
                 created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
            """,
            silence_id, tenant_id, data.name, data.comment,
            orjson.dumps(data.rule_ids).decode(),
            orjson.dumps(data.matchers).decode(),
            data.starts_at, data.ends_at, data.timezone, data.recurring,
            orjson.dumps([d.value for d in data.recurrence_days]).decode(),
            data.recurrence_start_time, data.recurrence_end_time,
            created_by,
        )
    return _row_to_silence(row)


async def get_silence(tenant_id: str | None, silence_id: str) -> Silence | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM alert_silences WHERE id = $1 AND tenant_id = $2",
                silence_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM alert_silences WHERE id = $1", silence_id,
            )
    return _row_to_silence(row) if row else None


async def list_silences(
    tenant_id: str | None, limit: int = 50, offset: int = 0,
) -> list[Silence]:
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM alert_silences WHERE {where}"  # noqa: S608
            f" ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
            *params, limit, offset,
        )
    return [_row_to_silence(r) for r in rows]


async def update_silence(
    tenant_id: str, silence_id: str, data: SilenceUpdate,
) -> Silence | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_silence(tenant_id, silence_id)

    set_parts = []
    params: list = []
    idx = 3

    for field, value in updates.items():
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE alert_silences SET {', '.join(set_parts)}"  # noqa: S608
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            silence_id, tenant_id, *params,
        )
    return _row_to_silence(row) if row else None


async def delete_silence(tenant_id: str, silence_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM alert_silences WHERE id = $1 AND tenant_id = $2",
            silence_id, tenant_id,
        )
    return result == "DELETE 1"


async def is_rule_silenced(
    rule_id: str, tenant_id: str, rule_tags: dict[str, str],
) -> bool:
    """Check if a rule is currently silenced by any active silence window.

    Handles both one-time silences (starts_at <= now < ends_at) and
    recurring silences (matched by day-of-week and time-of-day in the
    silence's configured timezone).
    """
    now = datetime.now(UTC)

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT rule_ids, matchers, recurring,
                   starts_at, ends_at, timezone,
                   recurrence_days, recurrence_start_time, recurrence_end_time
            FROM alert_silences
            WHERE tenant_id = $1 AND enabled = TRUE
            """,
            tenant_id,
        )

    for row in rows:
        rule_ids = _parse_json(row["rule_ids"])
        matchers = _parse_json(row["matchers"])

        if not _matches_rule(rule_id, rule_tags, rule_ids, matchers):
            continue

        if not row["recurring"]:
            if row["starts_at"] <= now < row["ends_at"]:
                return True
        else:
            if _is_recurring_active(now, row):
                return True

    return False


def _matches_rule(
    rule_id: str,
    rule_tags: dict[str, str],
    silence_rule_ids: list[str],
    silence_matchers: dict[str, str],
) -> bool:
    """Check if a rule matches a silence's rule_ids OR matchers."""
    if silence_rule_ids and rule_id in silence_rule_ids:
        return True

    if silence_matchers:
        return all(
            rule_tags.get(k) == v for k, v in silence_matchers.items()
        )

    return False


def _is_recurring_active(now: datetime, row: dict) -> bool:
    """Check if a recurring silence is active right now."""
    import zoneinfo

    tz_name = row["timezone"] or "Asia/Kolkata"
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except (KeyError, zoneinfo.ZoneInfoNotFoundError):
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")

    local_now = now.astimezone(tz)
    day_abbr = local_now.strftime("%a").lower()[:3]

    recurrence_days = _parse_json(row["recurrence_days"])
    if day_abbr not in recurrence_days:
        return False

    start_time = row["recurrence_start_time"]
    end_time = row["recurrence_end_time"]
    if not start_time or not end_time:
        return False

    current_time = local_now.strftime("%H:%M")

    if start_time <= end_time:
        return start_time <= current_time < end_time
    else:
        # Crosses midnight: e.g., 21:00 -> 09:00
        return current_time >= start_time or current_time < end_time


def _parse_json(val) -> dict | list:
    if isinstance(val, str):
        return orjson.loads(val)
    return val


def _row_to_silence(row) -> Silence:
    rule_ids = _parse_json(row["rule_ids"])
    matchers = _parse_json(row["matchers"])
    recurrence_days = _parse_json(row["recurrence_days"])

    return Silence(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        comment=row["comment"],
        rule_ids=rule_ids,
        matchers=matchers,
        starts_at=row["starts_at"],
        ends_at=row["ends_at"],
        timezone=row["timezone"],
        recurring=row["recurring"],
        recurrence_days=recurrence_days,
        recurrence_start_time=row["recurrence_start_time"],
        recurrence_end_time=row["recurrence_end_time"],
        enabled=row["enabled"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
