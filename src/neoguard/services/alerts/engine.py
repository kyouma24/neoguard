import asyncio
import contextlib
import time as _time
from datetime import UTC, datetime, timedelta

import orjson
from ulid import ULID

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import AlertCondition
from neoguard.models.notifications import AlertPayload
from neoguard.services.alerts.silences import is_rule_silenced
from neoguard.services.notifications.dispatcher import (
    dispatch_firing,
    dispatch_resolved,
)

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
        self._eval_last_run_at: float = 0.0
        self._eval_last_duration_ms: float = 0.0
        self._eval_success_count: int = 0
        self._eval_failure_count: int = 0
        self._eval_consecutive_errors: int = 0
        self._rules_evaluated: int = 0
        self._state_transitions: int = 0
        self._notifications_sent: int = 0
        self._notifications_failed: int = 0
        self._silenced_count: int = 0

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

    @property
    def stats(self) -> dict:
        return {
            "running": self._running,
            "eval": {
                "last_run_at": self._eval_last_run_at,
                "last_duration_ms": round(self._eval_last_duration_ms, 1),
                "success_count": self._eval_success_count,
                "failure_count": self._eval_failure_count,
                "consecutive_errors": self._eval_consecutive_errors,
            },
            "rules_evaluated": self._rules_evaluated,
            "active_rules": len(self._rule_states),
            "state_transitions": self._state_transitions,
            "notifications_sent": self._notifications_sent,
            "notifications_failed": self._notifications_failed,
            "silenced": self._silenced_count,
        }

    async def _eval_loop(self) -> None:
        while self._running:
            start = _time.monotonic()
            try:
                await self._evaluate_all()
                self._eval_success_count += 1
                self._eval_consecutive_errors = 0
            except Exception as e:
                self._eval_failure_count += 1
                self._eval_consecutive_errors += 1
                await log.aerror("Alert evaluation cycle failed", error=str(e))
            finally:
                self._eval_last_duration_ms = (_time.monotonic() - start) * 1000
                self._eval_last_run_at = _time.time()
            await asyncio.sleep(settings.alert_eval_interval_sec)

    async def _evaluate_all(self) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            rules = await conn.fetch(
                "SELECT * FROM alert_rules WHERE enabled = TRUE"
            )

        self._rules_evaluated += len(rules)
        for rule in rules:
            await self._evaluate_rule(rule)

    async def _evaluate_rule(self, rule: dict) -> None:
        rule_id = rule["id"]
        now = datetime.now(UTC)

        raw_tags = rule["tags_filter"]
        rule_tags = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

        try:
            silenced = await is_rule_silenced(rule_id, rule["tenant_id"], rule_tags)
        except Exception:
            silenced = False

        if silenced:
            self._silenced_count += 1
            if self._rule_states.get(rule_id) and self._rule_states[rule_id].status == "firing":
                pass  # keep firing state, just suppress notifications
            return

        pool = await get_pool()
        async with pool.acquire() as conn:
            lookback = timedelta(seconds=rule["duration_sec"])

            tag_conditions = ""
            params: list = [rule["tenant_id"], rule["metric_name"], now - lookback, now]
            for k, v in rule_tags.items():
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
        self._state_transitions += 1
        self._rule_states[rule_id] = _RuleState(status=new_status, entered_at=now)

    async def _fire_alert(self, rule: dict, value: float) -> None:
        event_id = str(ULID())
        message = (
            f"Alert '{rule['name']}': {rule['metric_name']}"
            f" {rule['condition']} {rule['threshold']} (current: {value:.2f})"
        )
        now = datetime.now(UTC)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO alert_events
                    (id, tenant_id, rule_id, status, value, threshold,
                     message, fired_at)
                VALUES ($1, $2, $3, 'firing', $4, $5, $6, $7)
                """,
                event_id, rule["tenant_id"], rule["id"],
                value, float(rule["threshold"]), message, now,
            )
        await log.awarn("Alert FIRING",
                        rule_id=rule["id"],
                        rule_name=rule["name"],
                        value=value,
                        threshold=float(rule["threshold"]))

        notif = rule["notification"]
        if isinstance(notif, str):
            notif = orjson.loads(notif) if notif else {}

        raw_tags = rule["tags_filter"]
        tags_filter = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

        payload = AlertPayload(
            event_id=event_id,
            rule_id=rule["id"],
            rule_name=rule["name"],
            metric_name=rule["metric_name"],
            condition=rule["condition"],
            threshold=float(rule["threshold"]),
            current_value=value,
            severity=rule["severity"],
            status="firing",
            message=message,
            tenant_id=rule["tenant_id"],
            fired_at=now,
            tags_filter=tags_filter,
        )
        try:
            await dispatch_firing(payload, notif)
            self._notifications_sent += 1
        except Exception as e:
            self._notifications_failed += 1
            await log.aerror("Notification dispatch failed", error=str(e))

    async def _resolve_alert(self, rule: dict, value: float) -> None:
        now = datetime.now(UTC)
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE alert_events
                SET status = 'resolved', resolved_at = $3
                WHERE rule_id = $1 AND tenant_id = $2
                  AND status = 'firing' AND resolved_at IS NULL
                """,
                rule["id"], rule["tenant_id"], now,
            )
        await log.ainfo("Alert RESOLVED",
                        rule_id=rule["id"],
                        rule_name=rule["name"],
                        value=value)

        notif = rule["notification"]
        if isinstance(notif, str):
            notif = orjson.loads(notif) if notif else {}

        raw_tags = rule["tags_filter"]
        tags_filter = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

        payload = AlertPayload(
            event_id="",
            rule_id=rule["id"],
            rule_name=rule["name"],
            metric_name=rule["metric_name"],
            condition=rule["condition"],
            threshold=float(rule["threshold"]),
            current_value=value,
            severity=rule["severity"],
            status="resolved",
            message=f"Alert '{rule['name']}' resolved ({value:.2f})",
            tenant_id=rule["tenant_id"],
            fired_at=now,
            resolved_at=now,
            tags_filter=tags_filter,
        )
        try:
            await dispatch_resolved(payload, notif)
            self._notifications_sent += 1
        except Exception as e:
            self._notifications_failed += 1
            await log.aerror("Resolution dispatch failed", error=str(e))


class _RuleState:
    __slots__ = ("status", "entered_at")

    def __init__(self, status: str, entered_at: datetime) -> None:
        self.status = status
        self.entered_at = entered_at


alert_engine = AlertEngine()
