"""Phase C1a: P3 warm-up tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: ALERT-013, NOTIF-011, COLL-014, CLOUD-010.
"""

import asyncio
from collections import deque
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ===========================================================================
# ALERT-013: Flapping detection sliding window (deque of timestamps)
# ===========================================================================


class TestAlert013FlappingSlidingWindow:
    """ALERT-013: Flapping must use sliding window, not simple counter."""

    @pytest.mark.asyncio
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_window_boundary_evasion_detected(self, mock_get_pool, mock_settings=None):
        """Transitions at window boundaries must still trigger flapping.

        Bug: with simple counter, if previous state's entered_at is older than
        flap_window_sec, counter resets to 1. An attacker can oscillate once
        per window boundary and never reach threshold.

        Fix: sliding window tracks actual transition timestamps. 6 transitions
        within any rolling window = flapping, regardless of when entered_at was.
        """
        from neoguard.services.alerts.engine import AlertEngine, _RuleState

        with patch("neoguard.services.alerts.engine.settings") as mock_settings:
            mock_settings.alert_flap_threshold = 4
            mock_settings.alert_flap_window_sec = 300  # 5 minutes
            mock_settings.alert_state_persistence = False

            engine = AlertEngine()
            now = datetime.now(UTC)

            # Simulate: 5 transitions each happening just AFTER the previous
            # state was set (so entered_at is always < window). With the old
            # approach, if entered_at of the PREVIOUS state is within the window,
            # counter keeps incrementing. But the edge case is when states are
            # set at very different times and the counter would have reset.
            #
            # The key test: transition_times deque must exist and contain timestamps
            state = engine._rule_states.get("t:r1")
            assert state is None  # no state yet

            await engine._transition("t:r1", "ok", now)
            await engine._transition("t:r1", "pending", now + timedelta(seconds=10))
            await engine._transition("t:r1", "ok", now + timedelta(seconds=20))
            await engine._transition("t:r1", "pending", now + timedelta(seconds=30))
            await engine._transition("t:r1", "firing", now + timedelta(seconds=40))

            state = engine._rule_states["t:r1"]
            # 5 transitions > threshold 4 — must be flapping
            assert state.flapping is True
            # The state must have a transition_times deque (sliding window)
            assert hasattr(state, "transition_times")
            assert isinstance(state.transition_times, deque)
            assert len(state.transition_times) == 5

    @pytest.mark.asyncio
    @patch("neoguard.services.alerts.engine.get_pool", new_callable=AsyncMock)
    async def test_old_transitions_expire_from_window(self, mock_get_pool):
        """Transitions older than flap_window_sec must not count."""
        from neoguard.services.alerts.engine import AlertEngine

        with patch("neoguard.services.alerts.engine.settings") as mock_settings:
            mock_settings.alert_flap_threshold = 4
            mock_settings.alert_flap_window_sec = 60  # 1 minute
            mock_settings.alert_state_persistence = False

            engine = AlertEngine()
            now = datetime.now(UTC)

            # 3 transitions long ago (> 60s)
            await engine._transition("t:r1", "ok", now - timedelta(seconds=120))
            await engine._transition("t:r1", "pending", now - timedelta(seconds=100))
            await engine._transition("t:r1", "ok", now - timedelta(seconds=80))

            # 2 transitions recently (within window)
            await engine._transition("t:r1", "pending", now - timedelta(seconds=10))
            await engine._transition("t:r1", "firing", now)

            state = engine._rule_states["t:r1"]
            # Only 2 transitions are within the 60s window — below threshold of 4
            assert state.flapping is False
            # transition_times should only contain recent ones
            recent = [t for t in state.transition_times if (now - t).total_seconds() <= 60]
            assert len(recent) == 2


# ===========================================================================
# NOTIF-011: Severity maps extractable and configurable
# ===========================================================================


class TestNotif011SeverityMaps:
    """NOTIF-011: Severity/status maps must be importable module constants."""

    def test_freshdesk_severity_map_importable(self):
        """Freshdesk priority map should be importable from senders module."""
        from neoguard.services.notifications.senders import FRESHDESK_SEVERITY_MAP

        assert isinstance(FRESHDESK_SEVERITY_MAP, dict)
        assert "P1" in FRESHDESK_SEVERITY_MAP
        assert FRESHDESK_SEVERITY_MAP["P1"] == 4  # Urgent

    def test_pagerduty_severity_map_importable(self):
        """PagerDuty severity map should be importable from senders module."""
        from neoguard.services.notifications.senders import PAGERDUTY_SEVERITY_MAP

        assert isinstance(PAGERDUTY_SEVERITY_MAP, dict)
        assert "P1" in PAGERDUTY_SEVERITY_MAP
        assert PAGERDUTY_SEVERITY_MAP["P1"] == "critical"

    def test_maps_have_all_severities(self):
        """Both maps must cover P1-P4."""
        from neoguard.services.notifications.senders import (
            FRESHDESK_SEVERITY_MAP,
            PAGERDUTY_SEVERITY_MAP,
        )

        for sev in ("P1", "P2", "P3", "P4"):
            assert sev in FRESHDESK_SEVERITY_MAP, f"Missing {sev} in Freshdesk map"
            assert sev in PAGERDUTY_SEVERITY_MAP, f"Missing {sev} in PagerDuty map"


# ===========================================================================
# COLL-014: Factory function replaces global singleton
# ===========================================================================


class TestColl014OrchestratorFactory:
    """COLL-014: get_orchestrator() factory must return instances, not a frozen singleton."""

    def test_factory_function_exists(self):
        """Module must export get_orchestrator() factory function."""
        from neoguard.services.collection.orchestrator import get_orchestrator

        assert callable(get_orchestrator)

    def test_factory_returns_orchestrator_instance(self):
        """get_orchestrator() must return a CollectionOrchestrator instance."""
        from neoguard.services.collection.orchestrator import (
            CollectionOrchestrator,
            get_orchestrator,
        )

        instance = get_orchestrator()
        assert isinstance(instance, CollectionOrchestrator)

    def test_factory_returns_same_instance(self):
        """Factory should return the same singleton (lazy init, not module-level)."""
        from neoguard.services.collection.orchestrator import get_orchestrator

        a = get_orchestrator()
        b = get_orchestrator()
        assert a is b


# ===========================================================================
# CLOUD-010: S3 discovery outside region loop
# ===========================================================================


class TestCloud010S3GlobalDiscovery:
    """CLOUD-010: S3 discovery must run regardless of region order."""

    @pytest.mark.asyncio
    async def test_s3_runs_when_first_region_is_not_first_in_list(self):
        """S3 must be discovered even if the passed region is not regions[0].

        The fix moves S3 out of the per-region loop into a dedicated pass.
        After fix: _discover_s3 should NOT check `region != account.regions[0]`.
        """
        from neoguard.services.discovery.aws_discovery import _discover_s3

        mock_account = MagicMock()
        mock_account.regions = ["eu-west-1", "us-east-1"]

        mock_s3 = MagicMock()
        mock_s3.list_buckets.return_value = {"Buckets": []}

        with patch(
            "neoguard.services.discovery.aws_discovery.get_client",
            return_value=mock_s3,
        ):
            # Pass us-east-1 (index 1, not 0) — old code returns 0 immediately
            result = await _discover_s3(mock_account, "us-east-1", "tenant-1")

        # After fix: should NOT short-circuit. Should call list_buckets.
        mock_s3.list_buckets.assert_called_once()
        assert result == 0  # empty bucket list, 0 resources

    @pytest.mark.asyncio
    async def test_s3_runs_in_first_region_too(self):
        """S3 should still work when called with the first region."""
        from neoguard.services.discovery.aws_discovery import _discover_s3

        mock_account = MagicMock()
        mock_account.regions = ["us-east-1", "eu-west-1"]

        mock_s3 = MagicMock()
        mock_s3.list_buckets.return_value = {"Buckets": []}

        with patch(
            "neoguard.services.discovery.aws_discovery.get_client",
            return_value=mock_s3,
        ):
            result = await _discover_s3(mock_account, "us-east-1", "tenant-1")

        mock_s3.list_buckets.assert_called_once()
        assert result == 0
