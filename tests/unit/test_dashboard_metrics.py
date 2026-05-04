"""Tests for dashboard observability metrics (spec Part K)."""

import pytest

from neoguard.core.telemetry import MetricsRegistry
from neoguard.services import dashboard_metrics as dm


@pytest.fixture(autouse=True)
def _fresh_registry(monkeypatch):
    """Replace the global registry with a fresh instance for each test."""
    fresh = MetricsRegistry()
    monkeypatch.setattr(dm, "registry", fresh)
    # Re-create module-level counter references to use the fresh registry
    monkeypatch.setattr(dm, "_page_load_count", fresh.counter("neoguard.dashboards.page.load_count"))
    monkeypatch.setattr(dm, "_cache_hit", fresh.counter("neoguard.dashboards.query.cache_hit"))
    monkeypatch.setattr(dm, "_cache_miss", fresh.counter("neoguard.dashboards.query.cache_miss"))
    monkeypatch.setattr(dm, "_layout_saves", fresh.counter("neoguard.dashboards.layout.saves"))
    monkeypatch.setattr(dm, "_context_missing", fresh.counter("neoguard.dashboards.tenant_context_missing"))
    monkeypatch.setattr(dm, "_cross_tenant_reject", fresh.counter("neoguard.dashboards.cross_tenant_reject"))
    monkeypatch.setattr(dm, "_quota_blocked", fresh.counter("neoguard.dashboards.quota_blocked"))
    yield fresh


class TestRecordPageLoad:
    def test_increments_global_counter(self, _fresh_registry):
        dm.record_page_load("tenant-1")
        assert _fresh_registry.counter("neoguard.dashboards.page.load_count").get() == 1.0

    def test_increments_tenant_specific_counter(self, _fresh_registry):
        dm.record_page_load("tenant-abc")
        tenant_counter = _fresh_registry.counter(
            "neoguard.dashboards.page.load_count",
            {"tenant_id": "tenant-abc"},
        )
        assert tenant_counter.get() == 1.0

    def test_none_tenant_skips_tenant_counter(self, _fresh_registry):
        dm.record_page_load(None)
        # Global counter incremented
        assert _fresh_registry.counter("neoguard.dashboards.page.load_count").get() == 1.0
        # No tenant-specific counter should exist beyond the global one
        snapshot = _fresh_registry.snapshot()
        tenant_counters = [
            c for c in snapshot["counters"]
            if c["name"] == "neoguard.dashboards.page.load_count" and c["tags"].get("tenant_id")
        ]
        assert len(tenant_counters) == 0


class TestRecordWidgetError:
    def test_records_with_labels(self, _fresh_registry):
        dm.record_widget_error("tenant-1", "timeseries", "query_timeout")
        counter = _fresh_registry.counter(
            "neoguard.dashboards.widget.error_count",
            {"widget_type": "timeseries", "error_code": "query_timeout", "tenant_id": "tenant-1"},
        )
        assert counter.get() == 1.0

    def test_records_without_tenant(self, _fresh_registry):
        dm.record_widget_error(None, "gauge", "no_data")
        counter = _fresh_registry.counter(
            "neoguard.dashboards.widget.error_count",
            {"widget_type": "gauge", "error_code": "no_data"},
        )
        assert counter.get() == 1.0


class TestRecordCacheHitMiss:
    def test_cache_hit_increments(self, _fresh_registry):
        dm.record_cache_hit("t1")
        assert _fresh_registry.counter("neoguard.dashboards.query.cache_hit").get() == 1.0

    def test_cache_miss_increments(self, _fresh_registry):
        dm.record_cache_miss("t1")
        assert _fresh_registry.counter("neoguard.dashboards.query.cache_miss").get() == 1.0


class TestRecordLayoutSave:
    def test_increments_counter(self, _fresh_registry):
        dm.record_layout_save("tenant-x")
        assert _fresh_registry.counter("neoguard.dashboards.layout.saves").get() == 1.0

    def test_multiple_saves(self, _fresh_registry):
        dm.record_layout_save("tenant-x")
        dm.record_layout_save("tenant-x")
        dm.record_layout_save("tenant-y")
        assert _fresh_registry.counter("neoguard.dashboards.layout.saves").get() == 3.0


class TestRecordContextMissing:
    def test_increments_counter(self, _fresh_registry):
        dm.record_context_missing()
        assert _fresh_registry.counter("neoguard.dashboards.tenant_context_missing").get() == 1.0


class TestRecordCrossTenantReject:
    def test_increments_with_tenant(self, _fresh_registry):
        dm.record_cross_tenant_reject("tenant-bad")
        counter = _fresh_registry.counter(
            "neoguard.dashboards.cross_tenant_reject",
            {"tenant_id": "tenant-bad"},
        )
        assert counter.get() == 1.0

    def test_increments_without_tenant(self, _fresh_registry):
        dm.record_cross_tenant_reject(None)
        counter = _fresh_registry.counter("neoguard.dashboards.cross_tenant_reject")
        assert counter.get() == 1.0


class TestRecordQuotaBlocked:
    def test_increments_counter(self, _fresh_registry):
        dm.record_quota_blocked("tenant-z")
        assert _fresh_registry.counter("neoguard.dashboards.quota_blocked").get() == 1.0
