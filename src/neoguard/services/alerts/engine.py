import asyncio
import contextlib
import math
import re
import time as _time
from collections import deque
from datetime import UTC, datetime, timedelta

import orjson
from ulid import ULID

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.timescale.connection import get_pool
from neoguard.models.alerts import AlertCondition
from neoguard.models.notifications import AlertPayload
from neoguard.services.alerts.silences import _is_recurring_active, _matches_rule, _parse_json
from neoguard.services.notifications.dispatcher import (
    dispatch_firing,
    dispatch_resolved,
)

_SAFE_TAG_KEY = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$")

CONDITION_OPS = {
    AlertCondition.GT: lambda v, t: v > t,
    AlertCondition.LT: lambda v, t: v < t,
    AlertCondition.GTE: lambda v, t: v >= t,
    AlertCondition.LTE: lambda v, t: v <= t,
    AlertCondition.EQ: lambda v, t: v == t,
    AlertCondition.NE: lambda v, t: v != t,
}

# SQL aggregate expressions keyed by aggregation name.
# "last" and percentiles need special handling — see _query_metric_value.
_AGG_SQL = {
    "avg": "AVG(value)",
    "min": "MIN(value)",
    "max": "MAX(value)",
    "sum": "SUM(value)",
    "count": "COUNT(*)",
    "p95": "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value)",
    "p99": "PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value)",
}


class AlertEngine:
    """Background task that evaluates alert rules on a fixed interval.

    State machine per rule:
      OK -> PENDING (threshold breached) -> FIRING (breached for duration_sec) -> RESOLVED (recovered)
      Any state -> NODATA (when no data and nodata_action='alert')
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
        self._eval_timeouts: int = 0
        self._last_rule_eval_duration_ms: float = 0.0
        self._silence_cache_size: int = 0

    async def start(self) -> None:
        if settings.alert_state_persistence:
            await self._restore_states()
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
        flapping_rules = sum(1 for s in self._rule_states.values() if s.flapping)
        nodata_rules = sum(1 for s in self._rule_states.values() if s.status == "nodata")
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
            "flapping_rules": flapping_rules,
            "nodata_rules": nodata_rules,
            "eval_timeouts": self._eval_timeouts,
            "last_rule_eval_duration_ms": round(self._last_rule_eval_duration_ms, 1),
            "silence_cache_size": self._silence_cache_size,
        }

    # ------------------------------------------------------------------
    # State persistence
    # ------------------------------------------------------------------

    async def _restore_states(self) -> None:
        """Load persisted rule states from alert_rule_states on startup."""
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT * FROM alert_rule_states")
            for row in rows:
                self._rule_states[row["rule_id"]] = _RuleState(
                    status=row["status"],
                    entered_at=row["entered_at"],
                    last_value=float(row["last_value"]) if row["last_value"] is not None else None,
                    last_fired_at=row["last_fired_at"],
                    transition_count=row["transition_count"] or 0,
                )
            await log.ainfo("AlertEngine restored states", count=len(rows))
        except Exception as e:
            await log.aerror("AlertEngine state restore failed, starting fresh", error=str(e))

    async def _persist_state(self, rule_id: str, state: "_RuleState") -> None:
        """Upsert a single rule state row."""
        if not settings.alert_state_persistence:
            return
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO alert_rule_states
                        (rule_id, status, entered_at, last_value,
                         last_fired_at, transition_count, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (rule_id) DO UPDATE SET
                        status          = EXCLUDED.status,
                        entered_at      = EXCLUDED.entered_at,
                        last_value      = EXCLUDED.last_value,
                        last_fired_at   = EXCLUDED.last_fired_at,
                        transition_count = EXCLUDED.transition_count,
                        updated_at      = EXCLUDED.updated_at
                    """,
                    rule_id,
                    state.status,
                    state.entered_at,
                    state.last_value,
                    state.last_fired_at,
                    state.transition_count,
                    datetime.now(UTC),
                )
        except Exception as e:
            await log.aerror("Failed to persist rule state", rule_id=rule_id, error=str(e))

    # ------------------------------------------------------------------
    # Eval loop
    # ------------------------------------------------------------------

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
                " ORDER BY tenant_id, created_at LIMIT $1",
                settings.alert_max_rules_per_cycle,
            )

        # ALERT-005: Batch-fetch all active silences once per cycle
        now = datetime.now(UTC)
        tenant_ids = list({r["tenant_id"] for r in rules})
        silence_cache: list[dict] = []
        if tenant_ids:
            async with pool.acquire() as conn:
                silence_cache = await conn.fetch(
                    """
                    SELECT tenant_id, rule_ids, matchers, recurring,
                           starts_at, ends_at, timezone,
                           recurrence_days, recurrence_start_time, recurrence_end_time
                    FROM alert_silences
                    WHERE tenant_id = ANY($1) AND enabled = TRUE
                    """,
                    tenant_ids,
                )
        self._silence_cache_size = len(silence_cache)

        self._rules_evaluated += len(rules)
        for rule in rules:
            await self._evaluate_rule(rule, silence_cache=silence_cache)

    # ------------------------------------------------------------------
    # Metric querying with aggregation choice
    # ------------------------------------------------------------------

    async def _query_metric_value(
        self,
        conn,  # noqa: ANN001
        rule: dict,
        tag_conditions: str,
        params: list,
    ) -> tuple[float | None, int]:
        """Query metric value using the rule's aggregation function.

        Returns (aggregated_value, row_count). value is None when no data.
        """
        aggregation = rule.get("aggregation", "avg")

        if aggregation == "last":
            # Special case: fetch the single most-recent value
            count_row = await conn.fetchrow(
                f"""
                SELECT COUNT(*) AS cnt
                FROM metrics
                WHERE tenant_id = $1 AND name = $2
                  AND time >= $3 AND time < $4
                  {tag_conditions}
                """,
                *params,
            )
            cnt = count_row["cnt"] if count_row else 0
            if cnt == 0:
                return None, 0

            val_row = await conn.fetchrow(
                f"""
                SELECT value
                FROM metrics
                WHERE tenant_id = $1 AND name = $2
                  AND time >= $3 AND time < $4
                  {tag_conditions}
                ORDER BY time DESC
                LIMIT 1
                """,
                *params,
            )
            if val_row is None:
                return None, 0
            return float(val_row["value"]), cnt

        # Standard aggregate path
        agg_expr = _AGG_SQL.get(aggregation, "AVG(value)")
        row = await conn.fetchrow(
            f"""
            SELECT {agg_expr} AS agg_val, COUNT(*) AS cnt
            FROM metrics
            WHERE tenant_id = $1 AND name = $2
              AND time >= $3 AND time < $4
              {tag_conditions}
            """,
            *params,
        )

        if not row or row["cnt"] == 0:
            return None, 0

        return float(row["agg_val"]), row["cnt"]

    # ------------------------------------------------------------------
    # Per-rule evaluation
    # ------------------------------------------------------------------

    async def _evaluate_rule(self, rule: dict, *, silence_cache: list | None = None) -> None:
        rule_id = rule["id"]
        tenant_id = rule["tenant_id"]
        state_key = f"{tenant_id}:{rule_id}"
        now = datetime.now(UTC)

        raw_tags = rule["tags_filter"]
        rule_tags = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

        # ALERT-005: Check silence from batch cache instead of per-rule DB query
        try:
            silenced = self._check_silence_cache(
                rule_id, tenant_id, rule_tags, silence_cache or [], now,
            )
        except Exception:
            silenced = False

        if silenced:
            self._silenced_count += 1
            if self._rule_states.get(state_key) and self._rule_states[state_key].status == "firing":
                pass
            return

        # ALERT-003: Wrap DB query in timeout, close conn on timeout
        rule_start = _time.monotonic()
        pool = await get_pool()
        conn = await pool.acquire()
        try:
            lookback = timedelta(seconds=rule["duration_sec"])

            tag_conditions = ""
            params: list = [tenant_id, rule["metric_name"], now - lookback, now]
            for k, v in rule_tags.items():
                if not _SAFE_TAG_KEY.match(k) or len(k) > 128:
                    await log.awarn(
                        "Invalid tag key skipped in alert rule — query broadened",
                        rule_id=rule_id, invalid_tag_key=k[:64],
                    )
                    continue
                idx = len(params) + 1
                tag_conditions += f" AND tags->>({f'${idx}'}) = ${idx + 1}"
                params.extend([k, v])

            current_value, cnt = await asyncio.wait_for(
                self._query_metric_value(conn, rule, tag_conditions, params),
                timeout=settings.alert_rule_eval_timeout_sec,
            )
        except asyncio.TimeoutError:
            self._eval_timeouts += 1
            await conn.close()
            await log.awarn("Rule eval timeout", rule_id=rule_id, tenant_id=tenant_id)
            return
        else:
            await pool.release(conn)
        finally:
            self._last_rule_eval_duration_ms = (_time.monotonic() - rule_start) * 1000

        # ---- No-data handling ----
        if cnt == 0 or current_value is None:
            nodata_action = rule.get("nodata_action", "ok")
            if nodata_action == "keep":
                return
            elif nodata_action == "alert":
                await self._transition(state_key, "nodata", now)
                await self._fire_nodata_alert(rule)
                return
            else:
                await self._transition(state_key, "ok", now)
                return

        # ---- Update last_value on the in-memory state ----
        state = self._rule_states.get(state_key)
        if state:
            state.last_value = current_value

        # ---- Threshold evaluation ----
        condition = AlertCondition(rule["condition"])
        threshold = float(rule["threshold"])
        breached = CONDITION_OPS[condition](current_value, threshold)

        if breached:
            if state is None or state.status in ("ok", "nodata"):
                await self._transition(state_key, "pending", now, last_value=current_value)
            elif state.status == "pending":
                # Increment breach_eval_count for strict mode
                state.breach_eval_count += 1

                elapsed = (now - state.entered_at).total_seconds()
                if elapsed >= rule["duration_sec"]:
                    # ALERT-006: Strict duration check (feature flag)
                    if settings.alert_strict_duration_check:
                        required_evals = max(
                            2, math.ceil(rule["duration_sec"] / settings.alert_eval_interval_sec),
                        )
                        if state.breach_eval_count < required_evals:
                            return

                    await self._transition(state_key, "firing", now, last_value=current_value)
                    await self._fire_alert(rule, current_value)
            elif state.status == "firing":
                await self._maybe_refire(rule, current_value, now)
        else:
            # Reset breach_eval_count on non-breach
            if state and state.status == "pending":
                state.breach_eval_count = 0
            if state and state.status == "firing":
                await self._transition(state_key, "resolved", now, last_value=current_value)
                await self._resolve_alert(rule, current_value)
            else:
                await self._transition(state_key, "ok", now, last_value=current_value)

    def _check_silence_cache(
        self,
        rule_id: str,
        tenant_id: str,
        rule_tags: dict[str, str],
        silence_cache: list,
        now: datetime,
    ) -> bool:
        """Check if a rule is silenced using the pre-fetched cache."""
        for row in silence_cache:
            if row["tenant_id"] != tenant_id:
                continue

            rule_ids = _parse_json(row["rule_ids"])
            matchers = _parse_json(row["matchers"])

            if not _matches_rule(rule_id, rule_tags, rule_ids, matchers):
                continue

            if not row["recurring"]:
                # ALERT-005: ends_at > now filter at read time
                if row["starts_at"] <= now < row["ends_at"]:
                    return True
            else:
                if _is_recurring_active(now, row):
                    return True

        return False

    # ------------------------------------------------------------------
    # State transitions + flapping detection
    # ------------------------------------------------------------------

    async def _transition(
        self,
        rule_id: str,
        new_status: str,
        now: datetime,
        *,
        last_value: float | None = None,
    ) -> None:
        current = self._rule_states.get(rule_id)
        if current and current.status == new_status:
            # No actual transition — but update last_value if provided
            if last_value is not None:
                current.last_value = last_value
            return

        self._state_transitions += 1

        # Carry forward fields from old state
        last_fired_at = current.last_fired_at if current else None
        old_transition_count = current.transition_count if current else 0

        new_state = _RuleState(
            status=new_status,
            entered_at=now,
            last_value=last_value,
            last_fired_at=last_fired_at,
            transition_count=old_transition_count + 1,
        )

        # Flapping detection: sliding window of transition timestamps
        prev_times = current.transition_times if current else deque()
        cutoff = now - timedelta(seconds=settings.alert_flap_window_sec)
        new_times = deque(t for t in prev_times if t > cutoff)
        new_times.append(now)
        new_state.transition_times = new_times
        new_state.transition_count = len(new_times)
        new_state.flapping = len(new_times) > settings.alert_flap_threshold

        self._rule_states[rule_id] = new_state
        await self._persist_state(rule_id, new_state)

    # ------------------------------------------------------------------
    # Cooldown logic
    # ------------------------------------------------------------------

    async def _maybe_refire(self, rule: dict, value: float, now: datetime) -> None:
        """While in FIRING state and still breached, re-fire only if cooldown elapsed."""
        state_key = f"{rule['tenant_id']}:{rule['id']}"
        state = self._rule_states.get(state_key)
        if not state:
            return

        cooldown_sec = rule.get("cooldown_sec", settings.alert_default_cooldown_sec)
        if state.last_fired_at and (now - state.last_fired_at).total_seconds() < cooldown_sec:
            return

        await self._fire_alert(rule, value)

    # ------------------------------------------------------------------
    # Fire / Resolve / No-data alerts
    # ------------------------------------------------------------------

    def _is_flapping(self, state_key: str) -> bool:
        state = self._rule_states.get(state_key)
        return bool(state and state.flapping)

    async def _fire_alert(self, rule: dict, value: float) -> None:
        message = (
            f"Alert '{rule['name']}': {rule['metric_name']}"
            f" {rule['condition']} {rule['threshold']} (current: {value:.2f})"
        )
        await self._fire_event(rule, value=value, status="firing", message=message)

    async def _fire_nodata_alert(self, rule: dict) -> None:
        """Fire a special no-data alert event."""
        message = (
            f"Alert '{rule['name']}': no data received for metric"
            f" '{rule['metric_name']}' in the last {rule['duration_sec']}s"
        )
        await self._fire_event(rule, value=0.0, status="nodata", message=message)

    async def _fire_event(self, rule: dict, *, value: float, status: str, message: str) -> None:
        event_id = str(ULID())
        rule_id = rule["id"]
        state_key = f"{rule['tenant_id']}:{rule_id}"
        now = datetime.now(UTC)

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO alert_events
                    (id, tenant_id, rule_id, rule_name, severity,
                     status, value, threshold, message, fired_at)
                VALUES ($1, $2, $3, $4, $5, $10, $6, $7, $8, $9)
                """,
                event_id, rule["tenant_id"], rule_id,
                rule["name"], rule["severity"],
                value, float(rule["threshold"]), message, now,
                status,
            )

        log_label = "Alert FIRING" if status == "firing" else "Alert NODATA"
        log_kwargs: dict = {"rule_id": rule_id, "rule_name": rule["name"]}
        if status == "firing":
            log_kwargs["value"] = value
            log_kwargs["threshold"] = float(rule["threshold"])
        await log.awarn(log_label, **log_kwargs)

        state = self._rule_states.get(state_key)
        if state:
            state.last_fired_at = now
            await self._persist_state(state_key, state)

        if self._is_flapping(state_key):
            flap_label = f"Alert flapping{' (nodata)' if status == 'nodata' else ''} — notification suppressed"
            await log.awarn(
                flap_label,
                rule_id=rule_id,
                rule_name=rule["name"],
                transition_count=state.transition_count if state else 0,
            )
            return

        notif = rule["notification"]
        if isinstance(notif, str):
            notif = orjson.loads(notif) if notif else {}

        raw_tags = rule["tags_filter"]
        tags_filter = orjson.loads(raw_tags) if isinstance(raw_tags, str) else raw_tags

        payload = AlertPayload(
            event_id=event_id,
            rule_id=rule_id,
            rule_name=rule["name"],
            metric_name=rule["metric_name"],
            condition=rule["condition"],
            threshold=float(rule["threshold"]),
            current_value=value,
            severity=rule["severity"],
            status=status,
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
            err_label = "Notification dispatch failed" if status == "firing" else "Nodata notification dispatch failed"
            await log.aerror(err_label, error=str(e))

    async def _resolve_alert(self, rule: dict, value: float) -> None:
        now = datetime.now(UTC)
        state_key = f"{rule['tenant_id']}:{rule['id']}"
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE alert_events
                SET status = 'resolved', resolved_at = $3
                WHERE rule_id = $1 AND tenant_id = $2
                  AND status IN ('firing', 'nodata') AND resolved_at IS NULL
                """,
                rule["id"], rule["tenant_id"], now,
            )
        await log.ainfo(
            "Alert RESOLVED",
            rule_id=rule["id"],
            rule_name=rule["name"],
            value=value,
        )

        if self._is_flapping(state_key):
            state = self._rule_states.get(state_key)
            await log.awarn(
                "Alert flapping — resolve notification suppressed",
                rule_id=rule["id"],
                rule_name=rule["name"],
                transition_count=state.transition_count if state else 0,
            )
            return

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
    # breach_eval_count: in-memory only, NOT persisted to alert_rule_states.
    # On restart during sustained breach, resets to 0 — rule needs required_evals more cycles before firing.
    __slots__ = ("status", "entered_at", "last_value", "last_fired_at", "transition_count", "flapping", "breach_eval_count", "transition_times")

    def __init__(
        self,
        status: str,
        entered_at: datetime,
        last_value: float | None = None,
        last_fired_at: datetime | None = None,
        transition_count: int = 0,
        flapping: bool = False,
        breach_eval_count: int = 0,
        transition_times: deque | None = None,
    ) -> None:
        self.status = status
        self.entered_at = entered_at
        self.last_value = last_value
        self.last_fired_at = last_fired_at
        self.transition_count = transition_count
        self.flapping = flapping
        self.breach_eval_count = breach_eval_count
        self.transition_times = transition_times if transition_times is not None else deque()


# TODO(production): Single-worker singleton; needs distributed leader election for multi-worker
# Current: Each worker runs its own alert evaluation loop with in-memory state
# Cloud: Redis distributed lock — only leader evaluates rules. State stored in DB.
# Migration risk: High — concurrent evaluation causes duplicate alerts and inconsistent state
# Reference: docs/cloud_migration.md#background-singletons
alert_engine = AlertEngine()
