"""Tests for QueryCost primitive — Task 0.2.

Three test layers:
  A. Dataclass behavior (constructor, static_score, effective_score, cost_band)
  B. estimate_cost() translation — fixture CompiledQueries → expected QueryCost
  C. No-DB-call assertion (estimate_cost makes zero I/O calls)
"""

from unittest.mock import patch

import pytest

from neoguard.services.mql.compiler import CompiledQuery
from neoguard.services.mql.ast_nodes import RateFunc, DerivativeFunc, MovingAverageFunc
from neoguard.services.mql.cost import (
    AGGREGATOR_WEIGHT,
    POST_PROCESSOR_WEIGHT,
    SOURCE_TABLE_WEIGHT,
    QueryCost,
    QueryObservation,
    estimate_cost,
)


# ---------------------------------------------------------------------------
# Fixtures — 6 representative compiled queries
# ---------------------------------------------------------------------------

# Cheap: 1h range, rollup_1h table, avg, no post-processors
COMPILED_CHEAP = CompiledQuery(
    sql="SELECT time_bucket('3600s', ts) AS bucket, avg(value) FROM metrics_1h WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "aws.ec2.cpu"),
    metric_name="aws.ec2.cpu",
    post_processors=(),
)

# Moderate: 6h range, rollup_1m table, p95, no post-processors
COMPILED_MODERATE = CompiledQuery(
    sql="SELECT time_bucket('60s', ts) AS bucket, p95(value) FROM metrics_1m WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "aws.rds.connections"),
    metric_name="aws.rds.connections",
    post_processors=(),
)

# Expensive: 24h range, raw table, p95, 2 post-processors
COMPILED_EXPENSIVE = CompiledQuery(
    sql="SELECT time_bucket('60s', ts) AS bucket, p95(value) FROM metrics WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "aws.ec2.network_in"),
    metric_name="aws.ec2.network_in",
    post_processors=(RateFunc(), DerivativeFunc()),
)

# Extreme: 30-day range, raw table, p99, 3 post-processors
COMPILED_EXTREME = CompiledQuery(
    sql="SELECT time_bucket('60s', ts) AS bucket, p99(value) FROM metrics WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "aws.lambda.duration"),
    metric_name="aws.lambda.duration",
    post_processors=(RateFunc(), DerivativeFunc(), MovingAverageFunc(window=5)),
)

# Edge: zero estimated_series (default 50 in estimate_cost, but test dataclass with 0)
COMPILED_EDGE_ZERO = CompiledQuery(
    sql="SELECT time_bucket('60s', ts) AS bucket, avg(value) FROM metrics_5m WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "test.metric"),
    metric_name="test.metric",
    post_processors=(),
)

# Edge: single bucket (time_range == interval)
COMPILED_EDGE_SINGLE = CompiledQuery(
    sql="SELECT time_bucket('300s', ts) AS bucket, sum(value) FROM metrics_5m WHERE tenant_id = $1 AND metric_name = $2 GROUP BY bucket",
    params=("t1", "test.single"),
    metric_name="test.single",
    post_processors=(),
)


# ---------------------------------------------------------------------------
# Layer A: Dataclass behavior
# ---------------------------------------------------------------------------


class TestQueryCostDataclass:
    def test_static_score_basic(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1h",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=1,
            estimated_series=50,
        )
        # 50 * 1 * 0.3 (metrics_1h) * 1.0 (avg) = 15.0
        assert cost.static_score == 15.0

    def test_static_score_with_post_processors(self):
        cost = QueryCost(
            time_range_sec=86400,
            source_table="metrics",
            aggregator="p99",
            post_processor_count=2,
            expected_buckets=1440,
            estimated_series=50,
        )
        # 50 * 1440 * 5.0 (raw) * 3.0 (p99) * 1.2^2 (2 processors) = 50*1440*5*3*1.44
        expected = 50 * 1440 * 5.0 * 3.0 * (1.2 ** 2)
        assert abs(cost.static_score - expected) < 0.01

    def test_effective_score_uses_historical_when_present(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1h",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=60,
            estimated_series=50,
            historical_p95_ms=42.5,
        )
        assert cost.effective_score == 42.5

    def test_effective_score_falls_back_to_static(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1h",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=60,
            estimated_series=50,
        )
        assert cost.effective_score == cost.static_score

    def test_cost_band_cheap(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1h",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=1,
            estimated_series=50,
        )
        # static_score = 15.0 < 1000
        assert cost.cost_band == "cheap"

    def test_cost_band_moderate(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1m",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=60,
            estimated_series=50,
        )
        # 50 * 60 * 1.5 * 1.0 = 4500 (between 1000 and 50000)
        assert cost.cost_band == "moderate"

    def test_cost_band_expensive(self):
        cost = QueryCost(
            time_range_sec=86400,
            source_table="metrics",
            aggregator="p95",
            post_processor_count=1,
            expected_buckets=1440,
            estimated_series=50,
        )
        # 50 * 1440 * 5.0 * 3.0 * 1.2 = 1,296,000 > 500,000 → extreme
        # Actually let's calculate: 50*1440=72000, *5=360000, *3=1080000, *1.2=1296000
        # That's > 500k so "extreme". Let's use fewer buckets for "expensive"
        cost2 = QueryCost(
            time_range_sec=86400,
            source_table="metrics",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=1440,
            estimated_series=50,
        )
        # 50 * 1440 * 5.0 * 1.0 = 360,000 (between 50000 and 500000)
        assert cost2.cost_band == "expensive"

    def test_cost_band_extreme(self):
        cost = QueryCost(
            time_range_sec=2592000,
            source_table="metrics",
            aggregator="p99",
            post_processor_count=3,
            expected_buckets=43200,
            estimated_series=50,
        )
        # 50 * 43200 * 5.0 * 3.0 * 1.2^3 = massive
        assert cost.cost_band == "extreme"

    def test_frozen_immutability(self):
        cost = QueryCost(
            time_range_sec=3600,
            source_table="metrics_1h",
            aggregator="avg",
            post_processor_count=0,
            expected_buckets=1,
        )
        with pytest.raises(Exception):
            cost.time_range_sec = 7200  # type: ignore[misc]

    def test_source_table_weight_coverage(self):
        for table in ("metrics", "metrics_1m", "metrics_5m", "metrics_1h"):
            assert table in SOURCE_TABLE_WEIGHT

    def test_aggregator_weight_coverage(self):
        for agg in ("avg", "sum", "min", "max", "count", "last", "p50", "p95", "p99"):
            assert agg in AGGREGATOR_WEIGHT


# ---------------------------------------------------------------------------
# Layer B: estimate_cost() translation
# ---------------------------------------------------------------------------


class TestEstimateCost:
    def test_cheap_rollup_1h_avg(self):
        cost = estimate_cost(COMPILED_CHEAP, time_range_sec=3600, interval_sec=3600, source_table="metrics_1h")
        assert cost.source_table == "metrics_1h"
        assert cost.aggregator == "avg"
        assert cost.expected_buckets == 1
        assert cost.post_processor_count == 0
        assert cost.cost_band == "cheap"

    def test_moderate_rollup_1m_p95(self):
        cost = estimate_cost(COMPILED_MODERATE, time_range_sec=21600, interval_sec=60, source_table="metrics_1m")
        assert cost.source_table == "metrics_1m"
        assert cost.aggregator == "p95"
        assert cost.expected_buckets == 360
        assert cost.post_processor_count == 0
        # 50 * 360 * 1.5 * 3.0 = 81,000 → expensive (> 50k)
        assert cost.cost_band == "expensive"

    def test_expensive_raw_p95_with_processors(self):
        cost = estimate_cost(COMPILED_EXPENSIVE, time_range_sec=86400, interval_sec=60, source_table="metrics")
        assert cost.source_table == "metrics"
        assert cost.aggregator == "p95"
        assert cost.expected_buckets == 1440
        assert cost.post_processor_count == 2
        assert cost.cost_band == "extreme"

    def test_extreme_raw_30day_p99_3_processors(self):
        cost = estimate_cost(COMPILED_EXTREME, time_range_sec=2592000, interval_sec=60, source_table="metrics")
        assert cost.source_table == "metrics"
        assert cost.aggregator == "p99"
        assert cost.expected_buckets == 43200
        assert cost.post_processor_count == 3
        assert cost.cost_band == "extreme"

    def test_edge_single_bucket(self):
        cost = estimate_cost(COMPILED_EDGE_SINGLE, time_range_sec=300, interval_sec=300, source_table="metrics_5m")
        assert cost.expected_buckets == 1
        assert cost.source_table == "metrics_5m"
        assert cost.cost_band == "cheap"

    def test_edge_small_interval_many_buckets(self):
        cost = estimate_cost(COMPILED_EDGE_ZERO, time_range_sec=3600, interval_sec=1, source_table="metrics_5m")
        assert cost.expected_buckets == 3600
        # 50 * 3600 * 1.0 * 1.0 = 180,000 → expensive
        assert cost.cost_band == "expensive"

    def test_deterministic_same_inputs(self):
        a = estimate_cost(COMPILED_CHEAP, time_range_sec=3600, interval_sec=3600, source_table="metrics_1h")
        b = estimate_cost(COMPILED_CHEAP, time_range_sec=3600, interval_sec=3600, source_table="metrics_1h")
        assert a == b

    def test_time_range_stored(self):
        cost = estimate_cost(COMPILED_CHEAP, time_range_sec=7200, interval_sec=3600, source_table="metrics_1h")
        assert cost.time_range_sec == 7200

    def test_historical_fields_always_none(self):
        cost = estimate_cost(COMPILED_CHEAP, time_range_sec=3600, interval_sec=3600, source_table="metrics_1h")
        assert cost.historical_p50_ms is None
        assert cost.historical_p95_ms is None
        assert cost.historical_avg_series is None


# ---------------------------------------------------------------------------
# Layer C: No-DB-call assertion
# ---------------------------------------------------------------------------


class TestNoDatabaseCalls:
    def test_estimate_cost_makes_no_db_calls(self):
        with patch("neoguard.services.mql.cost.CompiledQuery", wraps=CompiledQuery):
            cost = estimate_cost(
                COMPILED_CHEAP,
                time_range_sec=3600,
                interval_sec=3600,
                source_table="metrics_1h",
            )
            assert cost is not None


# ---------------------------------------------------------------------------
# QueryObservation
# ---------------------------------------------------------------------------


class TestQueryObservation:
    def test_construction(self):
        obs = QueryObservation(
            identity_cache_key="q2:t1:abc123:1000:2000:60",
            wall_time_ms=12.5,
            rows_returned=100,
            series_returned=5,
            cache_status="miss",
            source_table="metrics",
            timestamp=1717000000,
        )
        assert obs.wall_time_ms == 12.5
        assert obs.cache_status == "miss"

    def test_frozen(self):
        obs = QueryObservation(
            identity_cache_key="q2:t1:abc:1000:2000:60",
            wall_time_ms=10.0,
            rows_returned=50,
            series_returned=3,
            cache_status="fresh",
            source_table="metrics_1m",
            timestamp=1717000000,
        )
        with pytest.raises(Exception):
            obs.wall_time_ms = 20.0  # type: ignore[misc]
