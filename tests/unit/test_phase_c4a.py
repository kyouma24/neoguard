"""Phase C4a: Collection/telemetry tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: COLL-008 (P1 — unbounded cardinality), COLL-009 (P2 — DRY discovery loops).
"""

import threading

import pytest


# ===========================================================================
# COLL-008: MetricsRegistry must enforce a cardinality cap
# ===========================================================================


class TestColl008MetricsCardinality:
    """COLL-008: MetricsRegistry must reject new series beyond max_metrics."""

    def test_registry_has_max_metrics_param(self):
        """MetricsRegistry.__init__ must accept max_metrics parameter."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=100)
        assert r._max_metrics == 100

    def test_registry_default_max_metrics(self):
        """Default max_metrics should be 10000."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry()
        assert r._max_metrics == 10000

    def test_counter_rejected_at_cap(self):
        """New counter registration beyond cap returns a no-op counter."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=3)
        c1 = r.counter("a")
        c2 = r.counter("b")
        c3 = r.counter("c")

        # All 3 registered
        c1.inc()
        c2.inc()
        c3.inc()
        assert c1.get() == 1.0
        assert c2.get() == 1.0
        assert c3.get() == 1.0

        # 4th should be rejected — returns counter that discards writes
        c4 = r.counter("d")
        c4.inc(100)
        assert c4.get() == 0.0

    def test_gauge_rejected_at_cap(self):
        """New gauge registration beyond cap returns a no-op gauge."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=2)
        r.counter("a")
        r.gauge("b")

        # 3rd should be rejected
        g = r.gauge("c")
        g.set(42)
        assert g.get() == 0.0

    def test_histogram_rejected_at_cap(self):
        """New histogram registration beyond cap returns a no-op histogram."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=2)
        r.counter("a")
        r.counter("b")

        # 3rd should be rejected
        h = r.histogram("c")
        h.observe(1.5)
        assert h.count() == 0

    def test_existing_series_not_affected_by_cap(self):
        """Already-registered series are returned normally even after cap."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=2)
        c1 = r.counter("a")
        c2 = r.counter("b")

        # Hit cap
        r.counter("c")  # rejected

        # Original series still work
        c1.inc(5)
        assert c1.get() == 5.0

        # Re-fetching existing series works
        c1_again = r.counter("a")
        assert c1_again.get() == 5.0

    def test_cap_rejection_increments_overflow_counter(self):
        """Each rejected registration increments _cap_rejections counter."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=2)
        r.counter("a")
        r.counter("b")

        # Reject 3 times
        r.counter("c")
        r.counter("d")
        r.gauge("e")

        assert r._cap_rejections >= 3

    def test_cap_counts_across_all_metric_types(self):
        """Cap is global across counters + gauges + histograms."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=3)
        r.counter("a")
        r.gauge("b")
        r.histogram("c")

        # Any new metric type rejected
        c = r.counter("d")
        c.inc()
        assert c.get() == 0.0

    def test_different_tags_count_as_different_series(self):
        """Same name with different tags = different series toward the cap."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=3)
        r.counter("req", {"method": "GET"})
        r.counter("req", {"method": "POST"})
        r.counter("req", {"method": "PUT"})

        # 4th tag variant is rejected
        c = r.counter("req", {"method": "DELETE"})
        c.inc()
        assert c.get() == 0.0


    def test_noop_counter_full_interface(self):
        """No-op counter must support inc(), get(), reset() without crashing."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=1)
        r.counter("real")
        c = r.counter("rejected")
        c.inc()
        c.inc(10.0)
        assert c.get() == 0.0
        assert c.reset() == 0.0

    def test_noop_gauge_full_interface(self):
        """No-op gauge must support set(), inc(), dec(), get() without crashing."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=1)
        r.counter("real")
        g = r.gauge("rejected")
        g.set(100.0)
        g.inc(5.0)
        g.dec(2.0)
        assert g.get() == 0.0

    def test_noop_histogram_full_interface(self):
        """No-op histogram must support observe(), percentiles(), count(), sum(), reset()."""
        from neoguard.core.telemetry import MetricsRegistry

        r = MetricsRegistry(max_metrics=1)
        r.histogram("real")
        h = r.histogram("rejected")
        h.observe(1.0)
        h.observe(5.0)
        assert h.percentiles([0.5, 0.99]) == {}
        assert h.count() == 0
        assert h.sum() == 0.0
        reset_result = h.reset()
        assert reset_result["count"] == 0
        assert reset_result["p95"] == 0.0


# ===========================================================================
# COLL-009: Discovery loop DRY — won't fix (premature abstraction)
# ===========================================================================


class TestColl009DiscoveryAssessment:
    """COLL-009: Verify both discover_all functions exist and are functional."""

    def test_aws_discover_all_exists(self):
        """AWS discover_all must be importable."""
        from neoguard.services.discovery.aws_discovery import discover_all
        assert callable(discover_all)

    def test_azure_discover_all_exists(self):
        """Azure discover_all must be importable."""
        from neoguard.services.discovery.azure_discovery import discover_all
        assert callable(discover_all)

    def test_both_use_discoverers_registry(self):
        """Both modules define a _DISCOVERERS dict."""
        from neoguard.services.discovery import aws_discovery, azure_discovery

        assert hasattr(aws_discovery, "_DISCOVERERS")
        assert hasattr(azure_discovery, "_DISCOVERERS")
        assert isinstance(aws_discovery._DISCOVERERS, dict)
        assert isinstance(azure_discovery._DISCOVERERS, dict)
