import asyncio
import contextlib
from datetime import UTC, datetime, timedelta

import orjson
from ulid import ULID

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import AlertCondition

CONDITION_OPS = {
    AlertCondition.GT: lambda v, t: v > t,
    AlertCondition.LT: lambda v, t: v < t,
    AlertCondition.GTE: lambda v, t: v >= t,
    AlertCondition.LTE: lambda v, t: v <= t,
    AlertCondition.EQ: lambda v, t: v == t,
    AlertCondition.NE: lambda v, t: v != t,
}


class AlertEngine:
    """Background task that evaluates alert rules on a fixed interval.

    State machine per rule:
      OK → PENDING (threshold breached) → FIRING (breached for duration_sec) → RESOLVED (recovered)
    """

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None  # type: ignore[type-arg]
        self._running = False
        self._rule_states: dict[str, _RuleState] = {}

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._eval_loop())
        await log.ainfo("AlertEngine started", interval=settings.alert_eval_interval_sec)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        await log.ainfo("AlertEngine stopped")

    async def _eval_loop(self) -> None:
        while self._running:
            try:
                await self._evaluate_all()
            except Exception as e:
                await log.aerror("Alert evaluation cycle failed", error=str(e))
            await asyncio.sleep(settings.alert_eval_interval_sec)

    async def _evaluate_all(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rules = await conn.fetch(
                "SELECT * FROM alert_rules WHERE enabled = TRUE"
            )

        for rule in rules:
            await self._evaluate_rule(rule)

    async def _evaluate_rule(self, rule: dict) -> None:
        rule_id = rule["id"]
        now = datetime.now(UTC)

        pool = await get_pool()
        async with pool.acquire() as conn:
            lookback = timedelta(seconds=rule["duration_sec"])
            raw_tags = rule["tags_filter"]
            tags_filter = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

            tag_conditions = ""
            params: list = [rule["tenant_id"], rule["metric_name"], now - lookback, now]
            for k, v in tags_filter.items():
                idx = len(params) + 1
                tag_conditions += f" AND tags->>'{k}' = ${idx}"
                params.append(v)

            row = await conn.fetchrow(
                f"""
                SELECT AVG(value) AS avg_val, COUNT(*) AS cnt
                FROM metrics
                WHERE tenant_id = $1 AND name = $2
                  AND time >= $3 AND time < $4
                  {tag_conditions}
                """,
                *params,
            )

        if not row or row["cnt"] == 0:
            self._transition(rule_id, "ok", now)
            return

        current_value = float(row["avg_val"])
        condition = AlertCondition(rule["condition"])
        threshold = float(rule["threshold"])
        breached = CONDITION_OPS[condition](current_value, threshold)

        state = self._rule_states.get(rule_id)

        if breached:
            if state is None or state.status == "ok":
                self._transition(rule_id, "pending", now)
            elif state.status == "pending" and (
                (now - state.entered_at).total_seconds() >= rule["duration_sec"]
            ):
                    self._transition(rule_id, "firing", now)
                    await self._fire_alert(rule, current_value)
        else:
            if state and state.status == "firing":
                self._transition(rule_id, "resolved", now)
                await self._resolve_alert(rule, current_value)
            else:
                self._transition(rule_id, "ok", now)

    def _transition(self, rule_id: str, new_status: str, now: datetime) -> None:
        current = self._rule_states.get(rule_id)
        if current and current.status == new_status:
            return
        self._rule_states[rule_id] = _RuleState(status=new_status, entered_at=now)

    async def _fire_alert(self, rule: dict, value: float) -> None:
        event_id = str(ULID())
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO alert_events
                    (id, tenant_id, rule_id, status, value, threshold, message, fired_at)
                VALUES ($1, $2, $3, 'firing', $4, $5, $6, NOW())
                """,
                event_id,
                rule["tenant_id"],
                rule["id"],
                value,
                float(rule["threshold"]),
                f"Alert '{rule['name']}': {rule['metric_name']}"
                f" {rule['condition']} {rule['threshold']} (current: {value:.2f})",
            )
        await log.awarn("Alert FIRING",
                        rule_id=rule["id"],
                        rule_name=rule["name"],
                        value=value,
                        threshold=float(rule["threshold"]))

    async def _resolve_alert(self, rule: dict, value: float) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE alert_events
                SET status = 'resolved', resolved_at = NOW()
                WHERE rule_id = $1 AND status = 'firing' AND resolved_at IS NULL
                """,
                rule["id"],
            )
        await log.ainfo("Alert RESOLVED",
                        rule_id=rule["id"],
                        rule_name=rule["name"],
                        value=value)


class _RuleState:
    __slots__ = ("status", "entered_at")

    def __init__(self, status: str, entered_at: datetime) -> None:
        self.status = status
        self.entered_at = entered_at


alert_engine = AlertEngine()
