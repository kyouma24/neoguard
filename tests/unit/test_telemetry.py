"""Tests for the in-process metrics registry."""

import pytest

from neoguard.core.telemetry import Counter, Gauge, Histogram, MetricsRegistry


class TestCounter:
    def test_starts_at_zero(self):
        c = Counter()
        assert c.get() == 0.0

    def test_inc_default(self):
        c = Counter()
        c.inc()
        assert c.get() == 1.0

    def test_inc_custom_value(self):
        c = Counter()
        c.inc(5.0)
        assert c.get() == 5.0

    def test_inc_accumulates(self):
        c = Counter()
        c.inc(3.0)
        c.inc(7.0)
        assert c.get() == 10.0

    def test_reset_returns_value_and_zeros(self):
        c = Counter()
        c.inc(42.0)
        val = c.reset()
        assert val == 42.0
        assert c.get() == 0.0

    def test_reset_on_zero(self):
        c = Counter()
        assert c.reset() == 0.0


class TestGauge:
    def test_starts_at_zero(self):
        g = Gauge()
        assert g.get() == 0.0

    def test_set(self):
        g = Gauge()
        g.set(99.5)
        assert g.get() == 99.5

    def test_set_overwrites(self):
        g = Gauge()
        g.set(10.0)
        g.set(20.0)
        assert g.get() == 20.0

    def test_inc(self):
        g = Gauge()
        g.set(10.0)
        g.inc(5.0)
        assert g.get() == 15.0

    def test_inc_default(self):
        g = Gauge()
        g.inc()
        assert g.get() == 1.0

    def test_dec(self):
        g = Gauge()
        g.set(10.0)
        g.dec(3.0)
        assert g.get() == 7.0

    def test_dec_default(self):
        g = Gauge()
        g.set(5.0)
        g.dec()
        assert g.get() == 4.0

    def test_goes_negative(self):
        g = Gauge()
        g.dec(5.0)
        assert g.get() == -5.0


class TestHistogram:
    def test_empty_percentiles(self):
        h = Histogram()
        p = h.percentiles()
        assert p == {0.5: 0.0, 0.95: 0.0, 0.99: 0.0}

    def test_single_value(self):
        h = Histogram()
        h.observe(42.0)
        p = h.percentiles()
        assert p[0.5] == 42.0
        assert p[0.95] == 42.0
        assert p[0.99] == 42.0

    def test_count_and_sum(self):
        h = Histogram()
        h.observe(10.0)
        h.observe(20.0)
        h.observe(30.0)
        assert h.count() == 3
        assert h.sum() == 60.0

    def test_percentiles_ordered(self):
        h = Histogram()
        for v in range(1, 101):
            h.observe(float(v))
        p = h.percentiles()
        assert p[0.5] == pytest.approx(50.0, abs=1.0)
        assert p[0.95] == pytest.approx(95.0, abs=1.0)
        assert p[0.99] == pytest.approx(99.0, abs=1.0)

    def test_bounded_memory(self):
        h = Histogram(buffer_size=100)
        for i in range(10000):
            h.observe(float(i))
        assert h.count() == 10000
        assert len(h._buffer) == 100

    def test_custom_quantiles(self):
        h = Histogram()
        for v in range(1, 1001):
            h.observe(float(v))
        p = h.percentiles([0.25, 0.75])
        assert 0.25 in p
        assert 0.75 in p
        assert p[0.25] < p[0.75]

    def test_reset_returns_stats_and_clears(self):
        h = Histogram()
        for v in range(1, 101):
            h.observe(float(v))
        result = h.reset()
        assert result["count"] == 100
        assert result["sum"] == 5050.0
        assert result["p50"] > 0
        assert result["p95"] > result["p50"]
        assert result["p99"] >= result["p95"]
        assert h.count() == 0
        assert h.sum() == 0.0
        assert len(h._buffer) == 0


class TestMetricsRegistry:
    def test_counter_creation(self):
        r = MetricsRegistry()
        c = r.counter("test.count")
        c.inc()
        assert c.get() == 1.0

    def test_gauge_creation(self):
        r = MetricsRegistry()
        g = r.gauge("test.gauge")
        g.set(42.0)
        assert g.get() == 42.0

    def test_histogram_creation(self):
        r = MetricsRegistry()
        h = r.histogram("test.latency")
        h.observe(5.0)
        assert h.count() == 1

    def test_same_name_same_tags_returns_same_instance(self):
        r = MetricsRegistry()
        c1 = r.counter("req.count", {"method": "GET"})
        c2 = r.counter("req.count", {"method": "GET"})
        assert c1 is c2

    def test_same_name_different_tags_returns_different(self):
        r = MetricsRegistry()
        c1 = r.counter("req.count", {"method": "GET"})
        c2 = r.counter("req.count", {"method": "POST"})
        assert c1 is not c2

    def test_none_tags_equals_empty_tags(self):
        r = MetricsRegistry()
        c1 = r.counter("req.count")
        c2 = r.counter("req.count", {})
        assert c1 is c2

    def test_snapshot_includes_all_types(self):
        r = MetricsRegistry()
        r.counter("c1").inc(10)
        r.gauge("g1").set(20)
        r.histogram("h1").observe(30)

        snap = r.snapshot()
        assert len(snap["counters"]) == 1
        assert snap["counters"][0]["name"] == "c1"
        assert snap["counters"][0]["value"] == 10.0

        assert len(snap["gauges"]) == 1
        assert snap["gauges"][0]["name"] == "g1"
        assert snap["gauges"][0]["value"] == 20.0

        assert len(snap["histograms"]) == 1
        assert snap["histograms"][0]["name"] == "h1"
        assert snap["histograms"][0]["count"] == 1

    def test_snapshot_includes_tags(self):
        r = MetricsRegistry()
        r.counter("req", {"method": "GET"}).inc()
        snap = r.snapshot()
        assert snap["counters"][0]["tags"] == {"method": "GET"}
