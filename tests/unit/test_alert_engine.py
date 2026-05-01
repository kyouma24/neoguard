"""Unit tests for AlertEngine state machine and condition operators (no DB required)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.alerts import AlertCondition
from neoguard.services.alerts.engine import CONDITION_OPS, AlertEngine, _RuleState

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_pool_with_conn(mock_conn: AsyncMock | None = None) -> MagicMock:
    """Build a mock asyncpg pool whose acquire() yields a mock connection.

    pool.acquire() in asyncpg returns an async context manager (not a coroutine),
    so the pool itself must be a MagicMock so .acquire() is a regular call.
    """
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_pool = MagicMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    return mock_pool


def _make_rule(
    rule_id: str = "rule-1",
    tenant_id: str = "default",
    metric_name: str = "cpu_usage",
    condition: str = "gt",
    threshold: float = 80.0,
    duration_sec: int = 60,
    tags_filter: str = "{}",
    name: str = "High CPU",
    severity: str = "warning",
    notification: str = "{}",
) -> dict:
    """Create a dict mimicking an asyncpg Row for an alert rule."""
    return {
        "id": rule_id,
        "tenant_id": tenant_id,
        "metric_name": metric_name,
        "condition": condition,
        "threshold": threshold,
        "duration_sec": duration_sec,
        "tags_filter": tags_filter,
        "name": name,
        "severity": severity,
        "notification": notification,
    }


def _make_db_row(avg_val: float | None, cnt: int) -> dict:
    """Create a dict mimicking an asyncpg Row for a metric query result."""
    return {"avg_val": avg_val, "cnt": cnt}


# ---------------------------------------------------------------------------
# CONDITION_OPS
# ---------------------------------------------------------------------------


class TestConditionOps:
    """Verify each AlertCondition maps to the correct comparison lambda."""

    def test_gt_true(self):
        assert CONDITION_OPS[AlertCondition.GT](10, 5) is True

    def test_gt_false(self):
        assert CONDITION_OPS[AlertCondition.GT](5, 10) is False

    def test_gt_equal_is_false(self):
        assert CONDITION_OPS[AlertCondition.GT](5, 5) is False

    def test_lt_true(self):
        assert CONDITION_OPS[AlertCondition.LT](3, 7) is True

    def test_lt_false(self):
        assert CONDITION_OPS[AlertCondition.LT](7, 3) is False

    def test_lt_equal_is_false(self):
        assert CONDITION_OPS[AlertCondition.LT](5, 5) is False

    def test_gte_true(self):
        assert CONDITION_OPS[AlertCondition.GTE](10, 5) is True

    def test_gte_equal(self):
        assert CONDITION_OPS[AlertCondition.GTE](5, 5) is True

    def test_gte_false(self):
        assert CONDITION_OPS[AlertCondition.GTE](3, 5) is False

    def test_lte_true(self):
        assert CONDITION_OPS[AlertCondition.LTE](3, 5) is True

    def test_lte_equal(self):
        assert CONDITION_OPS[AlertCondition.LTE](5, 5) is True

    def test_lte_false(self):
        assert CONDITION_OPS[AlertCondition.LTE](7, 5) is False

    def test_eq_true(self):
        assert CONDITION_OPS[AlertCondition.EQ](42, 42) is True

    def test_eq_false(self):
        assert CONDITION_OPS[AlertCondition.EQ](42, 43) is False

    def test_ne_true(self):
        assert CONDITION_OPS[AlertCondition.NE](1, 2) is True

    def test_ne_false(self):
        assert CONDITION_OPS[AlertCondition.NE](1, 1) is False


# ---------------------------------------------------------------------------
# _RuleState
# ---------------------------------------------------------------------------


class TestRuleState:
    """Basic sanity checks for the _RuleState dataclass-like object."""

    def test_creation(self):
        now = datetime.now(UTC)
        state = _RuleState(status="ok", entered_at=now)
        assert state.status == "ok"
        assert state.entered_at == now

    def test_slots(self):
        """_RuleState uses __slots__ so no arbitrary attributes."""
        state = _RuleState(status="ok", entered_at=datetime.now(UTC))
        with pytest.raises(AttributeError):
            state.extra = "nope"  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# AlertEngine._transition
# ---------------------------------------------------------------------------


class TestTransition:
    """Tests for the AlertEngine._transition helper."""

    def test_transition_sets_new_state(self):
        engine = AlertEngine()
        now = datetime.now(UTC)
        engine._transition("rule-1", "pending", now)

        assert "rule-1" in engine._rule_states
        assert engine._rule_states["rule-1"].status == "pending"
        assert engine._rule_states["rule-1"].entered_at == now

    def test_transition_noop_when_status_unchanged(self):
        engine = AlertEngine()
        t1 = datetime.now(UTC)
        engine._transition("rule-1", "pending", t1)

        t2 = t1 + timedelta(seconds=10)
        engine._transition("rule-1", "pending", t2)

        # entered_at should remain t1 because the transition was a no-op
        assert engine._rule_states["rule-1"].entered_at == t1

    def test_transition_updates_when_status_changes(self):
        engine = AlertEngine()
        t1 = datetime.now(UTC)
        engine._transition("rule-1", "pending", t1)

        t2 = t1 + timedelta(seconds=30)
        engine._transition("rule-1", "firing", t2)

        assert engine._rule_states["rule-1"].status == "firing"
        assert engine._rule_states["rule-1"].entered_at == t2

    def test_transition_from_none_to_ok(self):
        """First transition for a rule should always succeed."""
        engine = AlertEngine()
        now = datetime.now(UTC)
        engine._transition("new-rule", "ok", now)
        assert engine._rule_states["new-rule"].status == "ok"


# ---------------------------------------------------------------------------
# AlertEngine._evaluate_rule — state machine
# ---------------------------------------------------------------------------


class TestEvaluateRule:
    """Integration-style tests for the state machine in _evaluate_rule."""

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_no_data_transitions_to_ok(self, mock_get_pool, mock_log, _mock_silence):
        """When DB returns no rows, rule should transition to 'ok'."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=None, cnt=0)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()

        await engine._evaluate_rule(rule)

        assert engine._rule_states["rule-1"].status == "ok"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_breach_transitions_ok_to_pending(self, mock_get_pool, mock_log, _mock_silence):
        """When threshold is breached from ok state, transition to 'pending'."""
        mock_conn = AsyncMock()
        # cpu_usage > 80 (threshold), avg_val=95 means breached
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0)

        await engine._evaluate_rule(rule)

        assert engine._rule_states["rule-1"].status == "pending"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_pending_to_firing_after_duration(
        self, mock_get_pool, mock_log, mock_dispatch, _mock_silence,
    ):
        """After pending for duration_sec, should fire."""
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0, duration_sec=60)

        # First call: ok -> pending
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        # Simulate that enough time has passed by backdating entered_at
        engine._rule_states["rule-1"].entered_at = (
            datetime.now(UTC) - timedelta(seconds=120)
        )

        # Second call: pending -> firing (duration exceeded)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "firing"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_pending_stays_pending_before_duration(self, mock_get_pool, mock_log, _mock_silence):
        """While still in the duration window, should stay pending."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0, duration_sec=300)

        # First call: ok -> pending
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        # entered_at was just set (now), so duration_sec=300 is NOT exceeded.
        # Second call: should remain pending (transition is noop for same status)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.dispatch_resolved", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_firing_to_resolved_when_recovered(
        self, mock_get_pool, mock_log, mock_dispatch, _mock_silence,
    ):
        """When value drops below threshold, firing -> resolved."""
        mock_log.awarn = AsyncMock()
        mock_log.ainfo = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0)

        # Manually set state to firing
        engine._rule_states["rule-1"] = _RuleState(
            status="firing",
            entered_at=datetime.now(UTC) - timedelta(seconds=120),
        )

        # Value is now below threshold (not breached)
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=10)

        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "resolved"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_ok_stays_ok_when_not_breached(self, mock_get_pool, mock_log, _mock_silence):
        """When value is under threshold and state is ok, should remain ok."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=10)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0)

        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"

        # Call again — still ok
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_pending_back_to_ok_when_recovered(self, mock_get_pool, mock_log, _mock_silence):
        """If pending but value recovers before duration, goes back to ok."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0, duration_sec=300)

        # First: breach -> pending
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        # Second: value recovers -> ok
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"


# ---------------------------------------------------------------------------
# AlertEngine._fire_alert and _resolve_alert
# ---------------------------------------------------------------------------


class TestFireAndResolve:
    """Tests for _fire_alert and _resolve_alert DB interactions."""

    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_fire_alert_inserts_event(
        self, mock_get_pool, mock_log, mock_dispatch,
    ):
        """_fire_alert should INSERT an alert_events row."""
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()

        await engine._fire_alert(rule, 95.0)

        mock_conn.execute.assert_awaited_once()
        sql = mock_conn.execute.call_args[0][0]
        assert "INSERT INTO alert_events" in sql
        assert "'firing'" in sql

        # Check the passed parameters
        args = mock_conn.execute.call_args[0]
        # args[1] = event_id (ULID string), args[2] = tenant_id, etc.
        assert args[2] == "default"    # tenant_id
        assert args[3] == "rule-1"     # rule_id
        assert args[4] == 95.0         # value
        assert args[5] == 80.0         # threshold

    @patch("neoguard.services.alerts.engine.dispatch_resolved", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_resolve_alert_updates_events(
        self, mock_get_pool, mock_log, mock_dispatch,
    ):
        """_resolve_alert should UPDATE alert_events to 'resolved'."""
        mock_log.ainfo = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()

        await engine._resolve_alert(rule, 50.0)

        mock_conn.execute.assert_awaited_once()
        sql = mock_conn.execute.call_args[0][0]
        assert "UPDATE alert_events" in sql
        assert "resolved" in sql
        # Should filter by rule_id
        assert mock_conn.execute.call_args[0][1] == "rule-1"

    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_fire_alert_message_format(
        self, mock_get_pool, mock_log, mock_dispatch,
    ):
        """The alert message should contain the rule name, metric, condition, and value."""
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(name="High CPU", metric_name="cpu_usage",
                          condition="gt", threshold=80.0)

        await engine._fire_alert(rule, 95.50)

        args = mock_conn.execute.call_args[0]
        message = args[6]
        assert "High CPU" in message
        assert "cpu_usage" in message
        assert "gt" in message
        assert "95.50" in message


# ---------------------------------------------------------------------------
# AlertEngine._evaluate_rule with tags_filter
# ---------------------------------------------------------------------------


class TestEvaluateRuleWithTags:
    """Test that tags_filter is correctly parsed and applied."""

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_tags_filter_adds_sql_conditions(self, mock_get_pool, mock_log, _mock_silence):
        """When tags_filter has entries, they should appear as query params."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=5)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(tags_filter='{"host": "web-1", "region": "us-east"}')

        await engine._evaluate_rule(rule)

        call_args = mock_conn.fetchrow.call_args
        sql = call_args[0][0]
        # The SQL should contain tag conditions for host and region
        assert "tags->>" in sql
        # The params should include the tag values
        params = call_args[0][1:]
        assert "web-1" in params
        assert "us-east" in params

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_empty_tags_filter_no_extra_conditions(self, mock_get_pool, mock_log, _mock_silence):
        """Empty tags_filter should not add extra SQL conditions."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=5)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(tags_filter="{}")

        await engine._evaluate_rule(rule)

        call_args = mock_conn.fetchrow.call_args
        sql = call_args[0][0]
        assert "tags->>" not in sql


# ---------------------------------------------------------------------------
# AlertEngine silence integration
# ---------------------------------------------------------------------------


class TestSilenceIntegration:
    """Tests for silence checking in _evaluate_rule."""

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=True)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_silenced_rule_skips_evaluation(self, mock_get_pool, mock_log, _mock_silence):
        """When a rule is silenced, _evaluate_rule should return early without querying metrics."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()

        await engine._evaluate_rule(rule)

        mock_conn.fetchrow.assert_not_awaited()
        assert engine._silenced_count == 1

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=True)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_silenced_firing_rule_stays_firing(self, mock_get_pool, mock_log, _mock_silence):
        """If a rule is firing and gets silenced, it should stay in firing state (not reset)."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        engine._rule_states["rule-1"] = _RuleState(
            status="firing",
            entered_at=datetime.now(UTC) - timedelta(seconds=120),
        )

        await engine._evaluate_rule(rule)

        assert engine._rule_states["rule-1"].status == "firing"
        assert engine._silenced_count == 1

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, side_effect=Exception("db error"))
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_silence_check_failure_does_not_block_evaluation(
        self, mock_get_pool, mock_log, _mock_silence,
    ):
        """If is_rule_silenced raises, evaluation should proceed normally."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0)

        await engine._evaluate_rule(rule)

        assert engine._rule_states["rule-1"].status == "pending"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=True)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_silenced_counter_increments_per_rule(self, mock_get_pool, mock_log, _mock_silence):
        """Silenced count should increment for each silenced evaluation."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule1 = _make_rule(rule_id="rule-1")
        rule2 = _make_rule(rule_id="rule-2")

        await engine._evaluate_rule(rule1)
        await engine._evaluate_rule(rule2)

        assert engine._silenced_count == 2

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=True)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_silenced_pending_rule_stays_pending(self, mock_get_pool, mock_log, _mock_silence):
        """If a pending rule is silenced, it should stay pending (not reset to ok)."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        engine._rule_states["rule-1"] = _RuleState(
            status="pending",
            entered_at=datetime.now(UTC) - timedelta(seconds=30),
        )

        await engine._evaluate_rule(rule)
        # pending rules that aren't firing just return — state preserved
        assert engine._rule_states["rule-1"].status == "pending"


# ---------------------------------------------------------------------------
# AlertEngine.stats
# ---------------------------------------------------------------------------


class TestEngineStats:
    """Tests for the stats property."""

    def test_initial_stats(self):
        engine = AlertEngine()
        stats = engine.stats
        assert stats["running"] is False
        assert stats["rules_evaluated"] == 0
        assert stats["active_rules"] == 0
        assert stats["state_transitions"] == 0
        assert stats["notifications_sent"] == 0
        assert stats["notifications_failed"] == 0
        assert stats["silenced"] == 0
        assert stats["eval"]["success_count"] == 0
        assert stats["eval"]["failure_count"] == 0
        assert stats["eval"]["consecutive_errors"] == 0

    def test_stats_after_transitions(self):
        engine = AlertEngine()
        now = datetime.now(UTC)
        engine._transition("r1", "pending", now)
        engine._transition("r1", "firing", now)
        engine._transition("r2", "ok", now)

        stats = engine.stats
        assert stats["state_transitions"] == 3
        assert stats["active_rules"] == 2

    def test_stats_reflect_notification_counts(self):
        engine = AlertEngine()
        engine._notifications_sent = 5
        engine._notifications_failed = 2
        assert engine.stats["notifications_sent"] == 5
        assert engine.stats["notifications_failed"] == 2


# ---------------------------------------------------------------------------
# AlertEngine._evaluate_all
# ---------------------------------------------------------------------------


class TestEvaluateAll:
    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_evaluate_all_processes_multiple_rules(self, mock_get_pool, mock_log, _mock_silence):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            _make_rule(rule_id="rule-1"),
            _make_rule(rule_id="rule-2"),
            _make_rule(rule_id="rule-3"),
        ]
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=5)
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        await engine._evaluate_all()

        assert engine._rules_evaluated == 3
        assert len(engine._rule_states) == 3

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_evaluate_all_with_zero_rules(self, mock_get_pool, mock_log, _mock_silence):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        await engine._evaluate_all()

        assert engine._rules_evaluated == 0
        assert len(engine._rule_states) == 0


# ---------------------------------------------------------------------------
# AlertEngine notification tracking
# ---------------------------------------------------------------------------


class TestNotificationTracking:
    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_successful_dispatch_increments_sent(self, mock_get_pool, mock_log, mock_dispatch):
        mock_log.awarn = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        await engine._fire_alert(rule, 95.0)

        assert engine._notifications_sent == 1

    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock, side_effect=Exception("send failed"))
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_failed_dispatch_increments_failed(self, mock_get_pool, mock_log, mock_dispatch):
        mock_log.awarn = AsyncMock()
        mock_log.aerror = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        await engine._fire_alert(rule, 95.0)

        assert engine._notifications_failed == 1
        assert engine._notifications_sent == 0

    @patch("neoguard.services.alerts.engine.dispatch_resolved", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_resolve_dispatch_increments_sent(self, mock_get_pool, mock_log, mock_dispatch):
        mock_log.ainfo = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        await engine._resolve_alert(rule, 50.0)

        assert engine._notifications_sent == 1

    @patch("neoguard.services.alerts.engine.dispatch_resolved", new_callable=AsyncMock, side_effect=Exception("fail"))
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_resolve_dispatch_failure_increments_failed(self, mock_get_pool, mock_log, mock_dispatch):
        mock_log.ainfo = AsyncMock()
        mock_log.aerror = AsyncMock()
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule()
        await engine._resolve_alert(rule, 50.0)

        assert engine._notifications_failed == 1


# ---------------------------------------------------------------------------
# AlertEngine full state machine cycle
# ---------------------------------------------------------------------------


class TestFullStateMachineCycle:
    """Test complete ok -> pending -> firing -> resolved -> ok cycle."""

    @patch("neoguard.services.alerts.engine.dispatch_resolved", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock)
    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_full_cycle(self, mock_get_pool, mock_log, _mock_silence, mock_dispatch_fire, mock_dispatch_resolve):
        mock_log.awarn = AsyncMock()
        mock_log.ainfo = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="gt", threshold=80.0, duration_sec=60)

        # Step 1: breach -> ok to pending
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=95.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        # Step 2: still breached, backdate to exceed duration -> pending to firing
        engine._rule_states["rule-1"].entered_at = datetime.now(UTC) - timedelta(seconds=120)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "firing"
        mock_dispatch_fire.assert_awaited_once()

        # Step 3: value recovers -> firing to resolved
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "resolved"
        mock_dispatch_resolve.assert_awaited_once()

        # Step 4: still recovered -> resolved to ok
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_lt_condition_cycle(self, mock_get_pool, mock_log, _mock_silence):
        """Test LT condition: breaches when value drops below threshold."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="lt", threshold=20.0, duration_sec=300)

        # Value below threshold -> breach -> pending
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=5.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        # Value recovers above threshold -> ok
        mock_conn.fetchrow.return_value = _make_db_row(avg_val=50.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_eq_condition(self, mock_get_pool, mock_log, _mock_silence):
        """Test EQ condition: breaches when value exactly equals threshold."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="eq", threshold=42.0)

        mock_conn.fetchrow.return_value = _make_db_row(avg_val=42.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        mock_conn.fetchrow.return_value = _make_db_row(avg_val=41.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"

    @patch("neoguard.services.alerts.engine.is_rule_silenced", new_callable=AsyncMock, return_value=False)
    @patch("neoguard.services.alerts.engine.log")
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_ne_condition(self, mock_get_pool, mock_log, _mock_silence):
        """Test NE condition: breaches when value is NOT equal to threshold."""
        mock_conn = AsyncMock()
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        engine = AlertEngine()
        rule = _make_rule(condition="ne", threshold=0.0)

        mock_conn.fetchrow.return_value = _make_db_row(avg_val=1.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "pending"

        mock_conn.fetchrow.return_value = _make_db_row(avg_val=0.0, cnt=10)
        await engine._evaluate_rule(rule)
        assert engine._rule_states["rule-1"].status == "ok"
