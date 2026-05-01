"""Extended model validation tests covering all Pydantic models."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from neoguard.models.alerts import (
    AlertCondition,
    AlertRuleCreate,
    AlertSeverity,
    AlertStatus,
)
from neoguard.models.auth import APIKeyCreate, APIKeyUpdate
from neoguard.models.aws import AWSAccountCreate, AWSAccountUpdate
from neoguard.models.dashboards import DashboardCreate, PanelDefinition, PanelType
from neoguard.models.logs import LogBatch, LogEntry, LogSeverity
from neoguard.models.metrics import MetricBatch, MetricPoint, MetricType
from neoguard.models.resources import (
    Provider,
    ResourceCreate,
    ResourceStatus,
    ResourceType,
    ResourceUpdate,
)


class TestResourceModels:
    def test_all_resource_types(self):
        for rt in ResourceType:
            res = ResourceCreate(
                resource_type=rt, provider=Provider.AWS, name=f"test-{rt.value}",
            )
            assert res.resource_type == rt

    def test_all_providers(self):
        for p in Provider:
            res = ResourceCreate(
                resource_type=ResourceType.SERVER, provider=p, name="test",
            )
            assert res.provider == p

    def test_all_statuses(self):
        for s in ResourceStatus:
            res = ResourceCreate(
                resource_type=ResourceType.EC2, provider=Provider.AWS,
                name="test", status=s,
            )
            assert res.status == s

    def test_name_required(self):
        with pytest.raises(ValidationError):
            ResourceCreate(resource_type=ResourceType.EC2, provider=Provider.AWS, name="")

    def test_name_max_length(self):
        with pytest.raises(ValidationError):
            ResourceCreate(
                resource_type=ResourceType.EC2, provider=Provider.AWS,
                name="x" * 513,
            )

    def test_defaults(self):
        res = ResourceCreate(
            resource_type=ResourceType.SERVER, provider=Provider.LOCAL, name="test",
        )
        assert res.region == ""
        assert res.account_id == ""
        assert res.external_id == ""
        assert res.tags == {}
        assert res.metadata == {}
        assert res.status == ResourceStatus.ACTIVE

    def test_update_partial(self):
        update = ResourceUpdate(status=ResourceStatus.STOPPED)
        assert update.name is None
        assert update.tags is None
        assert update.status == ResourceStatus.STOPPED

    def test_update_empty_is_valid(self):
        update = ResourceUpdate()
        dumped = update.model_dump(exclude_none=True)
        assert dumped == {}


class TestAWSAccountModels:
    def test_valid_account_id(self):
        acct = AWSAccountCreate(name="Test", account_id="123456789012")
        assert acct.account_id == "123456789012"

    def test_invalid_account_id_short(self):
        with pytest.raises(ValidationError):
            AWSAccountCreate(name="Test", account_id="12345")

    def test_invalid_account_id_letters(self):
        with pytest.raises(ValidationError):
            AWSAccountCreate(name="Test", account_id="12345678901a")

    def test_invalid_account_id_long(self):
        with pytest.raises(ValidationError):
            AWSAccountCreate(name="Test", account_id="1234567890123")

    def test_default_regions(self):
        acct = AWSAccountCreate(name="Test", account_id="123456789012")
        assert "ap-south-1" in acct.regions
        assert "us-east-1" in acct.regions
        assert len(acct.regions) == 9

    def test_custom_regions(self):
        acct = AWSAccountCreate(
            name="Test", account_id="123456789012",
            regions=["eu-west-1", "ap-southeast-1"],
        )
        assert len(acct.regions) == 2

    def test_update_partial(self):
        update = AWSAccountUpdate(enabled=False)
        assert update.name is None
        assert update.enabled is False


class TestAPIKeyModels:
    def test_valid_create(self):
        key = APIKeyCreate(name="test-key")
        assert key.tenant_id == "default"
        assert key.scopes == ["read", "write"]
        assert key.rate_limit == 1000

    def test_custom_scopes(self):
        key = APIKeyCreate(name="admin-key", scopes=["admin"])
        assert key.scopes == ["admin"]

    def test_rate_limit_bounds(self):
        key = APIKeyCreate(name="low", rate_limit=10)
        assert key.rate_limit == 10

        key = APIKeyCreate(name="high", rate_limit=100000)
        assert key.rate_limit == 100000

        with pytest.raises(ValidationError):
            APIKeyCreate(name="too-low", rate_limit=5)

        with pytest.raises(ValidationError):
            APIKeyCreate(name="too-high", rate_limit=100001)

    def test_name_required(self):
        with pytest.raises(ValidationError):
            APIKeyCreate(name="")

    def test_expiry(self):
        key = APIKeyCreate(
            name="expiring", expires_at=datetime(2027, 1, 1, tzinfo=UTC),
        )
        assert key.expires_at is not None

    def test_update_partial(self):
        update = APIKeyUpdate(enabled=False)
        assert update.name is None
        assert update.enabled is False


class TestAlertModels:
    def test_all_conditions(self):
        for cond in AlertCondition:
            rule = AlertRuleCreate(
                name="test", metric_name="test.metric",
                condition=cond, threshold=50.0,
            )
            assert rule.condition == cond

    def test_all_severities(self):
        for sev in AlertSeverity:
            rule = AlertRuleCreate(
                name="test", metric_name="test.metric",
                condition=AlertCondition.GT, threshold=50.0,
                severity=sev,
            )
            assert rule.severity == sev

    def test_all_statuses(self):
        statuses = [s.value for s in AlertStatus]
        assert "ok" in statuses
        assert "pending" in statuses
        assert "firing" in statuses
        assert "resolved" in statuses

    def test_duration_bounds(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(
                name="test", metric_name="m", condition="gt",
                threshold=1, duration_sec=5,
            )
        with pytest.raises(ValidationError):
            AlertRuleCreate(
                name="test", metric_name="m", condition="gt",
                threshold=1, duration_sec=3601,
            )

    def test_interval_bounds(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(
                name="test", metric_name="m", condition="gt",
                threshold=1, interval_sec=5,
            )


class TestDashboardModels:
    def test_valid_dashboard(self):
        dash = DashboardCreate(
            name="Test", panels=[
                PanelDefinition(
                    id="panel-1",
                    title="CPU", panel_type=PanelType.TIMESERIES,
                    metric_name="system.cpu.percent",
                ),
            ],
        )
        assert len(dash.panels) == 1
        assert dash.panels[0].title == "CPU"

    def test_empty_panels(self):
        dash = DashboardCreate(name="Empty", panels=[])
        assert dash.panels == []


class TestMetricModels:
    def test_metric_types(self):
        for mt in MetricType:
            p = MetricPoint(name="test.m", value=1.0, metric_type=mt)
            assert p.metric_type == mt

    def test_name_pattern_valid(self):
        for name in ["a", "cpu.percent", "system.cpu.idle", "_private", "A_B_C.d"]:
            p = MetricPoint(name=name, value=1.0)
            assert p.name == name

    def test_name_pattern_invalid(self):
        for name in ["123bad", "has spaces", "has-dashes", ""]:
            with pytest.raises(ValidationError):
                MetricPoint(name=name, value=1.0)

    def test_batch_max_size(self):
        metrics = [MetricPoint(name="t.m", value=float(i)) for i in range(10000)]
        batch = MetricBatch(metrics=metrics)
        assert len(batch.metrics) == 10000

        with pytest.raises(ValidationError):
            MetricBatch(metrics=[MetricPoint(name="t.m", value=float(i)) for i in range(10001)])


class TestLogModels:
    def test_all_severities(self):
        for sev in LogSeverity:
            entry = LogEntry(service="test", message="msg", severity=sev)
            assert entry.severity == sev

    def test_service_required(self):
        with pytest.raises(ValidationError):
            LogEntry(service="", message="msg")

    def test_message_required(self):
        with pytest.raises(ValidationError):
            LogEntry(service="svc", message="")

    def test_batch_max_size(self):
        with pytest.raises(ValidationError):
            LogBatch(logs=[])
