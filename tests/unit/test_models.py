from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from neoguard.models.alerts import AlertCondition, AlertRuleCreate, AlertSeverity
from neoguard.models.logs import LogBatch, LogEntry, LogSeverity
from neoguard.models.metrics import MetricBatch, MetricPoint, MetricType


class TestMetricModels:
    def test_valid_metric_point(self):
        p = MetricPoint(name="cpu.usage", value=85.5, tags={"host": "web-1"})
        assert p.name == "cpu.usage"
        assert p.metric_type == MetricType.GAUGE

    def test_metric_name_validation(self):
        with pytest.raises(ValidationError):
            MetricPoint(name="", value=1.0)

        with pytest.raises(ValidationError):
            MetricPoint(name="123invalid", value=1.0)

    def test_metric_batch_size_limits(self):
        with pytest.raises(ValidationError):
            MetricBatch(metrics=[])

    def test_valid_batch(self):
        batch = MetricBatch(
            metrics=[MetricPoint(name="test.metric", value=1.0)],
            tenant_id="tenant-1",
        )
        assert len(batch.metrics) == 1
        assert batch.tenant_id == "tenant-1"

    def test_metric_with_timestamp(self):
        ts = datetime(2024, 1, 1, tzinfo=UTC)
        p = MetricPoint(name="test", value=42.0, timestamp=ts)
        assert p.timestamp == ts


class TestLogModels:
    def test_valid_log_entry(self):
        entry = LogEntry(
            service="api-gateway",
            message="Request processed",
            severity=LogSeverity.INFO,
        )
        assert entry.service == "api-gateway"
        assert entry.severity == LogSeverity.INFO

    def test_log_entry_defaults(self):
        entry = LogEntry(service="test", message="hello")
        assert entry.severity == LogSeverity.INFO
        assert entry.trace_id == ""
        assert entry.attributes == {}

    def test_log_batch_validation(self):
        with pytest.raises(ValidationError):
            LogBatch(logs=[])

    def test_valid_log_batch(self):
        batch = LogBatch(
            logs=[LogEntry(service="test", message="log line")],
        )
        assert len(batch.logs) == 1


class TestAlertModels:
    def test_valid_alert_rule_create(self):
        rule = AlertRuleCreate(
            name="High CPU",
            metric_name="system.cpu.percent",
            condition=AlertCondition.GT,
            threshold=90.0,
            duration_sec=60,
            severity=AlertSeverity.CRITICAL,
        )
        assert rule.name == "High CPU"
        assert rule.condition == AlertCondition.GT

    def test_duration_bounds(self):
        with pytest.raises(ValidationError):
            AlertRuleCreate(
                name="Test",
                metric_name="test",
                condition=AlertCondition.GT,
                threshold=1.0,
                duration_sec=5,
            )

    def test_default_values(self):
        rule = AlertRuleCreate(
            name="Test",
            metric_name="test",
            condition=AlertCondition.GT,
            threshold=1.0,
        )
        assert rule.duration_sec == 60
        assert rule.interval_sec == 30
        assert rule.severity == AlertSeverity.WARNING
