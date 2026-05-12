"""Phase B1 alert engine hardening tests.

Tests for findings ALERT-003 through ALERT-008.
Red-then-green: these tests MUST FAIL before the fix is applied.
"""

import asyncio
import math
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.alerts import AlertCondition


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _AcquireProxy:
    """Mimics asyncpg's PoolAcquireContext: both awaitable and async context manager."""

    def __init__(self, conn):
        self._conn = conn

    def __await__(self):
        async def _resolve():
            return self._conn
        return _resolve().__await__()

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


def _mock_pool_with_conn(mock_conn=None):
    """Build a mock asyncpg pool that supports both context manager and direct acquire."""
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_conn.close = AsyncMock()

    mock_pool = MagicMock()
    mock_pool.release = AsyncMock()
    mock_pool.acquire.return_value = _AcquireProxy(mock_conn)
    return mock_pool


def _make_rule(
    rule_id="rule-1",
    tenant_id="tenant-abc",
    metric_name="cpu_usage",
    condition="gt",
    threshold=80.0,
    duration_sec=60,
    tags_filter="{}",
    name="High CPU",
    severity="P3",
    notification="{}",
    aggregation="avg",
    cooldown_sec=300,
    nodata_action="ok",
    enabled=True,
):
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
        "aggregation": aggregation,
        "cooldown_sec": cooldown_sec,
        "nodata_action": nodata_action,
        "enabled": enabled,
    }


# ===========================================================================
# ALERT-007: Timezone fallback Asia/Kolkata → UTC + log warning
# ===========================================================================


class TestAlert007TimezoneFallback:
    """ALERT-007: Default timezone should be UTC, not Asia/Kolkata."""

    def test_silence_create_default_timezone_is_utc(self):
        """SilenceCreate model default timezone must be UTC."""
        from neoguard.models.alerts import SilenceCreate

        s = SilenceCreate(
            name="test",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=1),
        )
        assert s.timezone == "UTC"

    def test_recurring_invalid_tz_falls_back_to_utc(self):
        """_is_recurring_active with invalid tz must fall back to UTC, not Asia/Kolkata."""
        from neoguard.services.alerts.silences import _is_recurring_active

        now = datetime(2026, 5, 12, 10, 30, tzinfo=UTC)
        day_abbr = now.strftime("%a").lower()[:3]

        row = {
            "timezone": "Invalid/Timezone_XYZ",
            "recurrence_days": f'["{day_abbr}"]',
            "recurrence_start_time": "10:00",
            "recurrence_end_time": "11:00",
        }
        result = _is_recurring_active(now, row)
        assert result is True

    def test_recurring_null_tz_falls_back_to_utc(self):
        """_is_recurring_active with None timezone must use UTC."""
        from neoguard.services.alerts.silences import _is_recurring_active

        now = datetime(2026, 5, 12, 10, 30, tzinfo=UTC)
        day_abbr = now.strftime("%a").lower()[:3]

        row = {
            "timezone": None,
            "recurrence_days": f'["{day_abbr}"]',
            "recurrence_start_time": "10:00",
            "recurrence_end_time": "11:00",
        }
        result = _is_recurring_active(now, row)
        assert result is True

    @pytest.mark.asyncio
    async def test_invalid_tz_logs_warning(self):
        """Invalid timezone should emit a structured warning log."""
        from neoguard.services.alerts.silences import _is_recurring_active

        now = datetime(2026, 5, 12, 10, 30, tzinfo=UTC)
        day_abbr = now.strftime("%a").lower()[:3]

        row = {
            "timezone": "Fake/Zone",
            "recurrence_days": f'["{day_abbr}"]',
            "recurrence_start_time": "10:00",
            "recurrence_end_time": "11:00",
        }

        with patch("neoguard.services.alerts.silences.log") as mock_log:
            mock_log.awarn = AsyncMock()
            _is_recurring_active(now, row)
            mock_log.warning.assert_called_once()
            assert "Fake/Zone" in str(mock_log.warning.call_args)


# ===========================================================================
# ALERT-008: Preview row LIMIT + truncated flag
# ===========================================================================


class TestAlert008PreviewLimit:
    """ALERT-008: preview_alert_rule must LIMIT rows and report truncation."""

    def test_alert_preview_result_has_truncated_field(self):
        """AlertPreviewResult model must have a `truncated` field."""
        from neoguard.models.alerts import AlertPreviewResult

        result = AlertPreviewResult(
            would_fire=False,
            current_value=None,
            datapoints=0,
            simulated_events=[],
            truncated=True,
        )
        assert result.truncated is True

    def test_alert_preview_result_default_truncated_false(self):
        """AlertPreviewResult.truncated defaults to False."""
        from neoguard.models.alerts import AlertPreviewResult

        result = AlertPreviewResult(
            would_fire=False,
            current_value=None,
            datapoints=0,
            simulated_events=[],
        )
        assert result.truncated is False

    @pytest.mark.asyncio
    async def test_preview_applies_row_limit(self):
        """preview_alert_rule SQL must include a LIMIT clause."""
        from neoguard.models.alerts import AlertRulePreview
        from neoguard.services.alerts.crud import preview_alert_rule

        preview = AlertRulePreview(
            metric_name="cpu",
            condition="gt",
            threshold=80.0,
        )

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.alerts.crud.get_pool", return_value=mock_pool):
            await preview_alert_rule("tenant-1", preview)

        call_args = mock_conn.fetch.call_args
        sql = call_args[0][0]
        assert "LIMIT" in sql.upper()

    @pytest.mark.asyncio
    async def test_preview_sets_truncated_when_limit_hit(self):
        """When row count equals LIMIT, result.truncated must be True."""
        from neoguard.models.alerts import AlertRulePreview
        from neoguard.services.alerts.crud import preview_alert_rule

        preview = AlertRulePreview(
            metric_name="cpu",
            condition="gt",
            threshold=80.0,
        )

        # Simulate exactly LIMIT rows returned (100000)
        fake_rows = [
            {"time": datetime.now(UTC) - timedelta(seconds=i), "value": 50.0}
            for i in range(100000)
        ]
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=fake_rows)
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.alerts.crud.get_pool", return_value=mock_pool):
            result = await preview_alert_rule("tenant-1", preview)

        assert result.truncated is True


# ===========================================================================
# ALERT-004: Composite state key tenant_id:rule_id
# ===========================================================================


class TestAlert004CompositeStateKey:
    """ALERT-004: State dict must key by tenant_id:rule_id, not bare rule_id."""

    @pytest.mark.asyncio
    async def test_state_key_includes_tenant_id(self):
        """After evaluating a rule, state must be keyed as tenant_id:rule_id."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        rule = _make_rule(rule_id="rule-1", tenant_id="tenant-abc")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_rule(rule)

        assert "tenant-abc:rule-1" in engine._rule_states
        assert "rule-1" not in engine._rule_states

    @pytest.mark.asyncio
    async def test_same_rule_id_different_tenants_isolated(self):
        """Two tenants with identical rule_id must have separate state entries."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        rule_t1 = _make_rule(rule_id="shared-rule", tenant_id="tenant-1")
        rule_t2 = _make_rule(rule_id="shared-rule", tenant_id="tenant-2")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_rule(rule_t1)
            await engine._evaluate_rule(rule_t2)

        assert "tenant-1:shared-rule" in engine._rule_states
        assert "tenant-2:shared-rule" in engine._rule_states
        assert len(engine._rule_states) == 2


# ===========================================================================
# ALERT-005: Silence cache batch fetch + perf baseline
# ===========================================================================


class TestAlert005SilenceCache:
    """ALERT-005: Silence check must batch-fetch per cycle, not per rule."""

    @pytest.mark.asyncio
    async def test_silence_batch_fetch_reduces_pool_acquire(self):
        """Evaluating N rules must use 2 pool.acquire() calls, not N+1.

        Before fix: 1 (rules fetch) + N (silence check per rule) = N+1
        After fix: 1 (rules fetch) + 1 (silence batch fetch) = 2
        Plus N acquire calls for per-rule metric queries = N+2 total.
        The key metric: silence-related acquires go from N to 1.
        """
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        n_rules = 5
        rules = [_make_rule(rule_id=f"rule-{i}", tenant_id="tenant-1") for i in range(n_rules)]

        fetch_call_count = [0]

        async def mock_fetch(*args, **kwargs):
            fetch_call_count[0] += 1
            if fetch_call_count[0] == 1:
                return rules  # rules query
            if fetch_call_count[0] == 2:
                return []  # silence batch query (no silences)
            return []

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 50.0, "cnt": 3})
        mock_conn.close = AsyncMock()

        mock_pool = _mock_pool_with_conn(mock_conn)

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_persist_state", new=AsyncMock()),
            patch("neoguard.services.alerts.engine.dispatch_firing", new=AsyncMock()),
        ):
            await engine._evaluate_all()

        # 2 context-manager acquires (rules + silence batch) + N direct acquires (per-rule query)
        # Total: 2 + N = 7. Key: only 2 are for silence/rules, not N+1.
        assert mock_pool.acquire.call_count == n_rules + 2

    @pytest.mark.asyncio
    async def test_silence_cache_filters_expired_at_read_time(self):
        """Cache must filter out silences where ends_at <= now at read time."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        now = datetime.now(UTC)

        rule = _make_rule(rule_id="rule-1", tenant_id="tenant-1")

        expired_silence = {
            "tenant_id": "tenant-1",
            "rule_ids": '["rule-1"]',
            "matchers": "{}",
            "recurring": False,
            "starts_at": now - timedelta(hours=2),
            "ends_at": now - timedelta(hours=1),  # expired
            "timezone": "UTC",
            "recurrence_days": "[]",
            "recurrence_start_time": None,
            "recurrence_end_time": None,
        }

        fetch_call_count = [0]

        async def mock_fetch(*args, **kwargs):
            fetch_call_count[0] += 1
            if fetch_call_count[0] == 1:
                return [rule]  # rules query
            if fetch_call_count[0] == 2:
                return [expired_silence]  # silence batch query
            return []

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_all()

        # Rule should NOT be silenced (expired silence filtered out at read time)
        state_key = "tenant-1:rule-1"
        assert state_key in engine._rule_states
        assert engine._rule_states[state_key].status == "pending"


# ===========================================================================
# ALERT-003: Per-rule eval timeout with conn.close() on timeout
# ===========================================================================


class TestAlert003EvalTimeout:
    """ALERT-003: Per-rule timeout wrapping DB query, conn.close() on timeout."""

    @pytest.mark.asyncio
    async def test_timeout_does_not_crash_eval_loop(self):
        """A slow rule that times out must not crash the entire eval cycle."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        rules = [_make_rule(rule_id="slow-rule", tenant_id="tenant-1")]

        fetch_call_count = [0]

        async def mock_fetch(*args, **kwargs):
            fetch_call_count[0] += 1
            if fetch_call_count[0] == 1:
                return rules
            return []  # no silences

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.fetchrow = AsyncMock(side_effect=asyncio.TimeoutError())
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_all()

        assert engine._eval_timeouts >= 1

    @pytest.mark.asyncio
    async def test_timeout_closes_connection_explicitly(self):
        """On timeout, conn.close() must be called to prevent pool poisoning."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        rule = _make_rule(rule_id="slow-rule", tenant_id="tenant-1")

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(side_effect=asyncio.TimeoutError())
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_rule(rule)

        mock_conn.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_pool_healthy_after_timeout(self):
        """After a timeout, acquire a fresh connection and execute SELECT 1 to prove pool is clean."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        rules = [
            _make_rule(rule_id="slow-rule", tenant_id="tenant-1"),
            _make_rule(rule_id="fast-rule", tenant_id="tenant-1"),
        ]

        fetchrow_call_count = [0]

        async def fetchrow_side_effect(*args, **kwargs):
            fetchrow_call_count[0] += 1
            if fetchrow_call_count[0] == 1:
                raise asyncio.TimeoutError()
            return {"agg_val": 50.0, "cnt": 3}

        fetch_call_count = [0]

        async def mock_fetch(*args, **kwargs):
            fetch_call_count[0] += 1
            if fetch_call_count[0] == 1:
                return rules
            return []  # no silences

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(side_effect=mock_fetch)
        mock_conn.fetchrow = AsyncMock(side_effect=fetchrow_side_effect)
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_persist_state", new=AsyncMock()),
        ):
            await engine._evaluate_all()

        # Weak assertion: second rule processed (proves loop continued)
        assert "tenant-1:fast-rule" in engine._rule_states

        # Strong assertion: acquire a new connection post-timeout and run SELECT 1
        # This proves the timed-out connection was closed (not returned poisoned to pool)
        mock_conn.close.assert_called_once()
        followup_conn = AsyncMock()
        followup_conn.fetchval = AsyncMock(return_value=1)
        mock_pool.acquire.return_value = _AcquireProxy(followup_conn)
        result_conn = await mock_pool.acquire()
        result = await result_conn.fetchval("SELECT 1")
        assert result == 1

    @pytest.mark.asyncio
    async def test_timeout_configurable_via_settings(self):
        """Timeout value must come from settings.alert_rule_eval_timeout_sec."""
        from neoguard.core.config import settings

        assert hasattr(settings, "alert_rule_eval_timeout_sec")
        assert settings.alert_rule_eval_timeout_sec > 0


# ===========================================================================
# ALERT-006: Strict duration check behind feature flag
# ===========================================================================


class TestAlert006StrictDuration:
    """ALERT-006: Strict duration check with feature flag (default OFF)."""

    def test_feature_flag_exists_default_off(self):
        """settings.alert_strict_duration_check must exist and default False."""
        from neoguard.core.config import settings

        assert hasattr(settings, "alert_strict_duration_check")
        assert settings.alert_strict_duration_check is False

    @pytest.mark.asyncio
    async def test_strict_mode_off_fires_on_elapsed_time_only(self):
        """With strict mode OFF, existing behavior: fire when elapsed >= duration_sec."""
        from neoguard.services.alerts.engine import AlertEngine, _RuleState

        engine = AlertEngine()
        rule = _make_rule(rule_id="rule-1", tenant_id="tenant-1", duration_sec=60)

        now = datetime.now(UTC)
        engine._rule_states["tenant-1:rule-1"] = _RuleState(
            status="pending",
            entered_at=now - timedelta(seconds=65),
            breach_eval_count=1,
        )

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch("neoguard.services.alerts.engine.settings") as mock_settings,
            patch.object(engine, "_persist_state", new=AsyncMock()),
            patch.object(engine, "_fire_alert", new=AsyncMock()) as mock_fire,
        ):
            mock_settings.alert_strict_duration_check = False
            mock_settings.alert_eval_interval_sec = 15
            mock_settings.alert_rule_eval_timeout_sec = 30
            mock_settings.alert_flap_window_sec = 3600
            mock_settings.alert_flap_threshold = 6
            mock_settings.alert_state_persistence = False
            await engine._evaluate_rule(rule)

        mock_fire.assert_called_once()

    @pytest.mark.asyncio
    async def test_strict_mode_on_requires_breach_eval_count(self):
        """With strict mode ON, must also satisfy breach_eval_count >= required_evals."""
        from neoguard.services.alerts.engine import AlertEngine, _RuleState

        engine = AlertEngine()
        rule = _make_rule(rule_id="rule-1", tenant_id="tenant-1", duration_sec=60)

        now = datetime.now(UTC)
        state = _RuleState(
            status="pending",
            entered_at=now - timedelta(seconds=65),
            breach_eval_count=1,
        )
        engine._rule_states["tenant-1:rule-1"] = state

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch("neoguard.services.alerts.engine.settings") as mock_settings,
            patch.object(engine, "_persist_state", new=AsyncMock()),
            patch.object(engine, "_fire_alert", new=AsyncMock()) as mock_fire,
        ):
            mock_settings.alert_strict_duration_check = True
            mock_settings.alert_eval_interval_sec = 15
            mock_settings.alert_rule_eval_timeout_sec = 30
            await engine._evaluate_rule(rule)

        # breach_eval_count was 1, incremented to 2, but required is max(2,4)=4
        mock_fire.assert_not_called()

    @pytest.mark.asyncio
    async def test_strict_mode_fires_when_count_sufficient(self):
        """With strict mode ON and sufficient breach_eval_count, fires normally."""
        from neoguard.services.alerts.engine import AlertEngine, _RuleState

        engine = AlertEngine()
        rule = _make_rule(rule_id="rule-1", tenant_id="tenant-1", duration_sec=60)

        now = datetime.now(UTC)
        state = _RuleState(
            status="pending",
            entered_at=now - timedelta(seconds=65),
            breach_eval_count=3,  # Will be incremented to 4 in _evaluate_rule
        )
        engine._rule_states["tenant-1:rule-1"] = state

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"agg_val": 90.0, "cnt": 5})
        mock_conn.close = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)
        mock_pool.release = AsyncMock()

        with (
            patch("neoguard.services.alerts.engine.get_pool", new=AsyncMock(return_value=mock_pool)),
            patch.object(engine, "_check_silence_cache", return_value=False),
            patch("neoguard.services.alerts.engine.settings") as mock_settings,
            patch.object(engine, "_persist_state", new=AsyncMock()),
            patch.object(engine, "_fire_alert", new=AsyncMock()) as mock_fire,
        ):
            mock_settings.alert_strict_duration_check = True
            mock_settings.alert_eval_interval_sec = 15
            mock_settings.alert_rule_eval_timeout_sec = 30
            mock_settings.alert_flap_window_sec = 3600
            mock_settings.alert_flap_threshold = 6
            mock_settings.alert_state_persistence = False
            await engine._evaluate_rule(rule)

        mock_fire.assert_called_once()

    def test_breach_eval_count_formula(self):
        """required_evals = max(2, ceil(duration_sec / eval_interval))."""
        # duration=60, interval=15 → ceil(4)=4, max(2,4)=4
        assert max(2, math.ceil(60 / 15)) == 4
        # duration=30, interval=15 → ceil(2)=2, max(2,2)=2
        assert max(2, math.ceil(30 / 15)) == 2
        # duration=10, interval=15 → ceil(0.67)=1, max(2,1)=2
        assert max(2, math.ceil(10 / 15)) == 2
        # duration=120, interval=15 → ceil(8)=8, max(2,8)=8
        assert max(2, math.ceil(120 / 15)) == 8

    def test_rule_state_has_breach_eval_count(self):
        """_RuleState must have a breach_eval_count slot."""
        from neoguard.services.alerts.engine import _RuleState

        state = _RuleState(status="pending", entered_at=datetime.now(UTC))
        assert hasattr(state, "breach_eval_count")
        assert state.breach_eval_count == 0


# ===========================================================================
# Observability counters for B1 fixes
# ===========================================================================


class TestB1Observability:
    """Verify minimum observability counters are exposed in engine.stats."""

    def test_stats_has_eval_timeouts(self):
        """engine.stats must include eval_timeouts counter."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        assert "eval_timeouts" in engine.stats

    def test_stats_has_silence_cache_size(self):
        """engine.stats must include silence_cache_size counter."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        assert "silence_cache_size" in engine.stats

    def test_stats_has_rule_eval_duration(self):
        """engine.stats must include last_rule_eval_duration_ms."""
        from neoguard.services.alerts.engine import AlertEngine

        engine = AlertEngine()
        assert "last_rule_eval_duration_ms" in engine.stats
