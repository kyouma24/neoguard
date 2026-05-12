"""Phase C2: Alert engine refactoring tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: ALERT-009, ALERT-010, ALERT-011, ALERT-012.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ===========================================================================
# ALERT-009: Invalid tag keys must warn, not silently skip
# ===========================================================================


class TestAlert009InvalidTagKeyWarning:
    """ALERT-009: Invalid tag keys should log a warning, not silently broaden the query."""

    @pytest.mark.asyncio
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_invalid_tag_key_logs_warning(self, mock_get_pool):
        """When a rule has an invalid tag key, engine must log a warning."""
        from neoguard.services.alerts.engine import AlertEngine

        with patch("neoguard.services.alerts.engine.settings") as mock_settings:
            mock_settings.alert_flap_threshold = 6
            mock_settings.alert_flap_window_sec = 3600
            mock_settings.alert_state_persistence = False
            mock_settings.alert_rule_eval_timeout_sec = 30

            engine = AlertEngine()

            rule = {
                "id": "rule-1",
                "tenant_id": "t1",
                "name": "Test Rule",
                "metric_name": "cpu.usage",
                "tags_filter": '{"valid_tag": "ok", "invalid tag!": "bad", "": "empty"}',
                "condition": "gt",
                "threshold": 80.0,
                "duration_sec": 60,
                "interval_sec": 30,
                "severity": "P3",
                "notification": "{}",
                "aggregation": "avg",
                "cooldown_sec": 300,
                "nodata_action": "ok",
                "enabled": True,
            }

            mock_conn = AsyncMock()
            mock_pool = MagicMock()
            mock_pool.acquire = AsyncMock(return_value=mock_conn)
            mock_pool.release = AsyncMock()
            mock_get_pool.return_value = mock_pool

            # Mock _query_metric_value to avoid DB access
            engine._query_metric_value = AsyncMock(return_value=(90.0, 10))

            with patch("neoguard.services.alerts.engine.log") as mock_log:
                mock_log.awarn = AsyncMock()
                mock_log.aerror = AsyncMock()

                with patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock):
                    await engine._evaluate_rule(rule, silence_cache=[])

                # Must have warned about at least one invalid tag key
                warn_calls = [
                    call for call in mock_log.awarn.call_args_list
                    if "invalid" in str(call).lower() and "tag" in str(call).lower()
                ]
                assert len(warn_calls) >= 1, (
                    f"Expected warning about invalid tag key, got: {mock_log.awarn.call_args_list}"
                )


# ===========================================================================
# ALERT-010: DRY _fire_alert and _fire_nodata_alert via shared helper
# ===========================================================================


class TestAlert010FireEventDRY:
    """ALERT-010: _fire_alert and _fire_nodata_alert should share a common helper."""

    def test_shared_fire_helper_exists(self):
        """A shared helper _fire_event must exist on AlertEngine."""
        from neoguard.services.alerts.engine import AlertEngine

        assert hasattr(AlertEngine, "_fire_event")

    @pytest.mark.asyncio
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_fire_event_handles_firing_status(self, mock_get_pool):
        """_fire_event with status='firing' must produce a firing event."""
        from neoguard.services.alerts.engine import AlertEngine

        with patch("neoguard.services.alerts.engine.settings") as mock_settings:
            mock_settings.alert_flap_threshold = 6
            mock_settings.alert_flap_window_sec = 3600
            mock_settings.alert_state_persistence = False

            engine = AlertEngine()
            rule = {
                "id": "r1", "tenant_id": "t1", "name": "Test",
                "metric_name": "cpu", "condition": "gt", "threshold": 80.0,
                "duration_sec": 60, "severity": "P3",
                "notification": "{}", "tags_filter": "{}",
            }

            mock_conn = AsyncMock()
            mock_pool = MagicMock()
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_pool.acquire.return_value = mock_ctx
            mock_get_pool.return_value = mock_pool

            with patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock):
                with patch("neoguard.services.alerts.engine.log") as mock_log:
                    mock_log.awarn = AsyncMock()
                    mock_log.aerror = AsyncMock()
                    await engine._fire_event(rule, value=95.0, status="firing", message="Test alert firing")

            sql = mock_conn.execute.call_args[0][0]
            args = mock_conn.execute.call_args[0][1:]
            assert "$10" in sql, "status must be parameterized as $10"
            assert "firing" in args, f"'firing' must be passed as parameter, got: {args}"

    @pytest.mark.asyncio
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_fire_event_handles_nodata_status(self, mock_get_pool):
        """_fire_event with status='nodata' must produce a nodata event with value=0."""
        from neoguard.services.alerts.engine import AlertEngine

        with patch("neoguard.services.alerts.engine.settings") as mock_settings:
            mock_settings.alert_flap_threshold = 6
            mock_settings.alert_flap_window_sec = 3600
            mock_settings.alert_state_persistence = False

            engine = AlertEngine()
            rule = {
                "id": "r1", "tenant_id": "t1", "name": "Test",
                "metric_name": "cpu", "condition": "gt", "threshold": 80.0,
                "duration_sec": 60, "severity": "P3",
                "notification": "{}", "tags_filter": "{}",
            }

            mock_conn = AsyncMock()
            mock_pool = MagicMock()
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_pool.acquire.return_value = mock_ctx
            mock_get_pool.return_value = mock_pool

            with patch("neoguard.services.alerts.engine.dispatch_firing", new_callable=AsyncMock):
                with patch("neoguard.services.alerts.engine.log") as mock_log:
                    mock_log.awarn = AsyncMock()
                    mock_log.aerror = AsyncMock()
                    await engine._fire_event(rule, value=0.0, status="nodata", message="Test nodata alert")

            sql = mock_conn.execute.call_args[0][0]
            args = mock_conn.execute.call_args[0][1:]
            assert "$10" in sql, "status must be parameterized as $10"
            assert "nodata" in args, f"'nodata' must be passed as parameter, got: {args}"


# ===========================================================================
# ALERT-011: CONDITION_OPS shared between engine and crud
# ===========================================================================


class TestAlert011SharedConditionOps:
    """ALERT-011: crud._check_condition should use CONDITION_OPS, not duplicate logic."""

    def test_crud_imports_condition_ops(self):
        """crud module should import CONDITION_OPS from engine (or a shared location)."""
        from neoguard.services.alerts import crud

        # The module should not define its own _check_condition anymore
        # OR it should delegate to CONDITION_OPS
        source_lines = open(crud.__file__).read()
        assert "CONDITION_OPS" in source_lines, (
            "crud.py should reference CONDITION_OPS instead of reimplementing condition checks"
        )

    def test_crud_no_duplicate_if_chain(self):
        """crud.py should not have the if/elif condition chain anymore."""
        from neoguard.services.alerts import crud

        source = open(crud.__file__).read()
        # Count occurrences of the pattern "if condition == AlertCondition."
        import re
        matches = re.findall(r"if condition == AlertCondition\.", source)
        assert len(matches) == 0, (
            f"Found {len(matches)} if-chain condition checks — should use CONDITION_OPS instead"
        )


# ===========================================================================
# ALERT-012: Notification config typed
# ===========================================================================


class TestAlert012NotificationTyped:
    """ALERT-012: notification field should have a typed model, not bare dict."""

    def test_notification_config_model_exists(self):
        """NotificationConfig model must be importable from alerts models."""
        from neoguard.models.alerts import NotificationConfig

        assert NotificationConfig is not None

    def test_notification_config_has_channel_ids(self):
        """NotificationConfig must have channel_ids field."""
        from neoguard.models.alerts import NotificationConfig

        fields = NotificationConfig.model_fields
        assert "channel_ids" in fields

    def test_alert_rule_create_uses_typed_notification(self):
        """AlertRuleCreate.notification should be NotificationConfig, not dict."""
        from neoguard.models.alerts import AlertRuleCreate, NotificationConfig

        field_type = AlertRuleCreate.model_fields["notification"].annotation
        # Should be NotificationConfig, not dict
        assert field_type is NotificationConfig or (
            hasattr(field_type, "__origin__") and NotificationConfig in str(field_type)
        ), f"Expected NotificationConfig, got {field_type}"
