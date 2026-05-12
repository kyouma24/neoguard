"""Phase C1b: P3/P2 warm-up tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: DASH-011, DASH-016, FE-013.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ===========================================================================
# DASH-011: record_view dead code removed
# ===========================================================================


class TestDash011RecordViewRemoved:
    """DASH-011: record_view() is never called — must be removed."""

    def test_record_view_not_in_module(self):
        """record_view should no longer exist in the dashboards service."""
        import neoguard.services.dashboards as dashboards_mod

        assert not hasattr(dashboards_mod, "record_view")


# ===========================================================================
# DASH-016: Lightweight summary for list endpoint
# ===========================================================================


class TestDash016DashboardSummary:
    """DASH-016: List endpoint should return DashboardSummary (no full panel parse)."""

    def test_dashboard_summary_model_exists(self):
        """DashboardSummary model must be importable."""
        from neoguard.models.dashboards import DashboardSummary

        assert DashboardSummary is not None

    def test_dashboard_summary_has_panel_count(self):
        """DashboardSummary must have panel_count field, not panels list."""
        from neoguard.models.dashboards import DashboardSummary

        fields = DashboardSummary.model_fields
        assert "panel_count" in fields
        assert "panels" not in fields

    @pytest.mark.asyncio
    async def test_list_dashboards_returns_summaries(self):
        """list_dashboards should return DashboardSummary instances."""
        from neoguard.models.dashboards import DashboardSummary
        from neoguard.services.dashboards import list_dashboards

        mock_row = {
            "id": "test-id",
            "tenant_id": "t1",
            "name": "Test",
            "description": "desc",
            "panels": '[{"id":"p1","title":"Panel 1","panel_type":"stat","metric_name":"cpu"}]',
            "tags": '["prod"]',
            "created_by": "user1",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "layout_version": 1,
        }

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [mock_row]
        mock_pool = MagicMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_pool.acquire.return_value = mock_ctx

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=mock_pool)):
            result = await list_dashboards("t1")

        assert len(result) == 1
        assert isinstance(result[0], DashboardSummary)
        assert result[0].panel_count == 1
        assert not hasattr(result[0], "panels") or "panels" not in result[0].model_fields


# ===========================================================================
# FE-013: CSS fontWeight type casts removed
# ===========================================================================


class TestFe013FontWeightCasts:
    """FE-013: fontWeight should use numeric values, not CSS var casts."""

    def test_forgot_password_no_unknown_casts(self):
        """ForgotPasswordPage must not contain 'as unknown as number' for fontWeight."""
        import pathlib

        path = pathlib.Path("frontend/src/pages/ForgotPasswordPage.tsx")
        content = path.read_text(encoding="utf-8")
        assert "as unknown as number" not in content

    def test_reset_password_no_unknown_casts(self):
        """ResetPasswordPage must not contain 'as unknown as number' for fontWeight."""
        import pathlib

        path = pathlib.Path("frontend/src/pages/ResetPasswordPage.tsx")
        content = path.read_text(encoding="utf-8")
        assert "as unknown as number" not in content
