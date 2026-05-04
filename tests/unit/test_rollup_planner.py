"""Tests for the MQL rollup planner (spec D.6)."""

import pytest

from neoguard.services.mql.planner import plan_rollup


class TestRawTableSelection:
    """Short time ranges should use the raw metrics table."""

    def test_5min_range_uses_raw(self):
        # 5 minutes, default 800px
        table, interval = plan_rollup(0, 300, 800)
        assert table == "metrics"
        # ideal = 300 / 1600 = 0.1875 -> round(0.1875) = 0, clamped to 10
        assert interval == 10

    def test_30min_range_uses_raw(self):
        # 30 minutes, 800px -> ideal = 1800/1600 = 1.125 -> 10 (floor)
        table, interval = plan_rollup(0, 1800, 800)
        assert table == "metrics"
        assert interval == 10

    def test_2h_range_uses_raw(self):
        # 2 hours, 800px -> ideal = 7200/1600 = 4.5 -> round(4.5)=4, clamped to 10
        table, interval = plan_rollup(0, 7200, 800)
        assert table == "metrics"
        assert interval == 10

    def test_6h_range_narrow_widget_uses_raw(self):
        # 6 hours exactly, 800px -> ideal = 21600/1600 = 13.5 -> 14
        # range = 21600 <= 21600 (6*3600), so still raw
        table, interval = plan_rollup(0, 21600, 800)
        assert table == "metrics"
        assert interval == 14


class TestOneMinuteRollup:
    """Medium ranges (ideal 60-299s) should use metrics_1m."""

    def test_12h_range(self):
        # 12h, 800px -> ideal = 43200/1600 = 27 -> < 300, but range > 6h
        # ideal < 60? No, 27 < 60 but range > 6h so ideal < 60 path fails
        # Actually: ideal=27 < 60 but range_sec=43200 > 21600 so first branch fails
        # Falls to ideal < 300 -> metrics_1m, 60
        table, interval = plan_rollup(0, 43200, 800)
        assert table == "metrics_1m"
        assert interval == 60

    def test_24h_range(self):
        # 24h, 800px -> ideal = 86400/1600 = 54 -> < 300 -> metrics_1m, 60
        # But ideal < 60 and range > 6h, so falls to ideal < 300
        table, interval = plan_rollup(0, 86400, 800)
        assert table == "metrics_1m"
        assert interval == 60


class TestFiveMinuteRollup:
    """Larger ranges should use metrics_5m."""

    def test_3d_range(self):
        # 3 days = 259200s, 800px -> ideal = 259200/1600 = 162 -> < 3600 but >= 60
        # ideal < 300 -> metrics_1m? 162 < 300 -> yes metrics_1m
        # Actually 162 < 300, so this goes to metrics_1m
        table, interval = plan_rollup(0, 259200, 800)
        assert table == "metrics_1m"
        assert interval == 60

    def test_7d_range(self):
        # 7 days = 604800s, 800px -> ideal = 604800/1600 = 378 -> >= 300, < 3600
        table, interval = plan_rollup(0, 604800, 800)
        assert table == "metrics_5m"
        assert interval == 300


class TestOneHourRollup:
    """Large ranges should use metrics_1h."""

    def test_30d_range(self):
        # 30 days = 2592000s, 800px -> ideal = 2592000/1600 = 1620
        # 1620 >= 300 and < 3600 -> metrics_5m, 300
        table, interval = plan_rollup(0, 2592000, 800)
        assert table == "metrics_5m"
        assert interval == 300

    def test_90d_range(self):
        # 90 days = 7776000s, 800px -> ideal = 7776000/1600 = 4860
        # 4860 >= 3600, < 21600 -> metrics_1h, 3600
        table, interval = plan_rollup(0, 7776000, 800)
        assert table == "metrics_1h"
        assert interval == 3600

    def test_1y_range(self):
        # 365 days = 31536000s, 800px -> ideal = 31536000/1600 = 19710
        # 19710 >= 3600, < 21600 -> metrics_1h, 3600
        table, interval = plan_rollup(0, 31536000, 800)
        assert table == "metrics_1h"
        assert interval == 3600


class TestSixHourBucket:
    """Very large ranges should use 6h interval on metrics_1h."""

    def test_2y_range(self):
        # 2 years ~= 63072000s, 800px -> ideal = 63072000/1600 = 39420 -> >= 21600
        table, interval = plan_rollup(0, 63072000, 800)
        assert table == "metrics_1h"
        assert interval == 21600


class TestWidgetWidthAffectsInterval:
    """Different widget widths should change the ideal interval."""

    def test_narrow_widget_uses_coarser_interval(self):
        # 6h range, 100px -> ideal = 21600/200 = 108 -> >= 60, range <= 6h
        # Wait: ideal < 60? 108 >= 60. So first branch fails.
        # ideal < 300? yes -> metrics_1m, 60
        table, interval = plan_rollup(0, 21600, 100)
        assert table == "metrics_1m"
        assert interval == 60

    def test_wide_widget_uses_finer_interval(self):
        # 6h range, 2000px -> ideal = 21600/4000 = 5.4 -> < 60, range <= 6h
        table, interval = plan_rollup(0, 21600, 2000)
        assert table == "metrics"
        assert interval == 10  # max(10, round(5.4)) = 10


class TestEdgeCases:
    """Edge cases: very small range, zero width, etc."""

    def test_1s_range(self):
        table, interval = plan_rollup(0, 1, 800)
        assert table == "metrics"
        assert interval == 10

    def test_zero_width_clamped_to_1(self):
        # 0px width -> clamped to 1, target_buckets=2
        # 1h range: ideal = 3600/2 = 1800 -> >= 300, < 3600 -> metrics_5m
        table, interval = plan_rollup(0, 3600, 0)
        assert table == "metrics_5m"
        assert interval == 300

    def test_negative_width_clamped_to_1(self):
        table, interval = plan_rollup(0, 3600, -10)
        assert table == "metrics_5m"
        assert interval == 300

    def test_equal_timestamps(self):
        # from_ts == to_ts -> range = max(0, 1) = 1
        table, interval = plan_rollup(100, 100, 800)
        assert table == "metrics"
        assert interval == 10

    def test_returns_tuple(self):
        result = plan_rollup(0, 3600, 800)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], str)
        assert isinstance(result[1], int)
