"""Unit tests for auto-generated starter dashboards."""

from unittest.mock import AsyncMock, patch

import pytest

from neoguard.services.dashboards_starter import maybe_create_starter_dashboard


TENANT_ID = "tenant-123"


class TestMaybeCreateStarterDashboard:
    async def test_creates_aws_dashboard_when_none_exist(self):
        mock_create = AsyncMock()
        with (
            patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=[])),
            patch("neoguard.services.dashboards_starter.create_dashboard", mock_create),
        ):
            result = await maybe_create_starter_dashboard(TENANT_ID, "aws")
            assert result is True
            mock_create.assert_called_once()
            args = mock_create.call_args
            assert args[0][0] == TENANT_ID
            data = args[0][1]
            assert data.name == "AWS Overview"
            assert len(data.panels) == 6

    async def test_creates_azure_dashboard_when_none_exist(self):
        mock_create = AsyncMock()
        with (
            patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=[])),
            patch("neoguard.services.dashboards_starter.create_dashboard", mock_create),
        ):
            result = await maybe_create_starter_dashboard(TENANT_ID, "azure")
            assert result is True
            mock_create.assert_called_once()
            data = mock_create.call_args[0][1]
            assert data.name == "Azure Overview"
            assert len(data.panels) == 4

    async def test_skips_when_dashboards_exist(self):
        mock_create = AsyncMock()
        with (
            patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=["existing"])),
            patch("neoguard.services.dashboards_starter.create_dashboard", mock_create),
        ):
            result = await maybe_create_starter_dashboard(TENANT_ID, "aws")
            assert result is False
            mock_create.assert_not_called()

    async def test_returns_false_for_unknown_provider(self):
        with patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=[])):
            result = await maybe_create_starter_dashboard(TENANT_ID, "gcp")
            assert result is False

    async def test_aws_panels_have_correct_metrics(self):
        mock_create = AsyncMock()
        with (
            patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=[])),
            patch("neoguard.services.dashboards_starter.create_dashboard", mock_create),
        ):
            await maybe_create_starter_dashboard(TENANT_ID, "aws")
            panels = mock_create.call_args[0][1].panels
            metric_names = {p.metric_name for p in panels}
            assert "aws.ec2.CPUUtilization" in metric_names
            assert "aws.ebs.VolumeReadOps" in metric_names
            assert "aws.lambda.Invocations" in metric_names

    async def test_panels_use_12_column_grid(self):
        mock_create = AsyncMock()
        with (
            patch("neoguard.services.dashboards_starter.list_dashboards", AsyncMock(return_value=[])),
            patch("neoguard.services.dashboards_starter.create_dashboard", mock_create),
        ):
            await maybe_create_starter_dashboard(TENANT_ID, "aws")
            panels = mock_create.call_args[0][1].panels
            for p in panels:
                assert p.width + p.position_x <= 12
                assert p.width >= 1
