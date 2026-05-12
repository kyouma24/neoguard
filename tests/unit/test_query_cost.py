"""Unit tests for QueryCost — multi-factor cost model."""

from __future__ import annotations

import pytest

from neoguard.services.mql.compiler import CompiledQuery
from neoguard.services.mql.cost import (
    AGGREGATOR_WEIGHT,
    POST_PROCESSOR_WEIGHT,
    SOURCE_TABLE_WEIGHT,
    QueryCost,
    estimate_cost,
)


def _make_cost(**overrides) -> QueryCost:
    defaults = dict(
        time_range_sec=300,
        source_table="metrics_1h",
        aggregator="avg",
        post_processor_count=0,
        expected_buckets=5,
        estimated_series=50,
    )
    defaults.update(overrides)
    return QueryCost(**defaults)


def _make_compiled(sql: str = "SELECT avg(value) FROM metrics_1m", post_processors: tuple = ()) -> CompiledQuery:
    return CompiledQuery(sql=sql, params=("t-1",), metric_name="cpu", post_processors=post_processors)


class TestCostBandClassification:
    def test_cheap_query(self):
        # 50 series * 5 buckets * 0.3 (metrics_1h) * 1.0 (avg) = 75
        cost = _make_cost(source_table="metrics_1h", expected_buckets=5, estimated_series=50)
        assert cost.static_score == 75.0
        assert cost.cost_band == "cheap"

    def test_moderate_query(self):
        # 50 series * 60 buckets * 1.5 (metrics_1m) * 1.0 (avg) = 4500
        cost = _make_cost(source_table="metrics_1m", expected_buckets=60, estimated_series=50)
        assert cost.static_score == 4500.0
        assert cost.cost_band == "moderate"

    def test_expensive_query(self):
        # 100 series * 1440 buckets * 1.0 (metrics_5m) * 1.0 (avg) = 144,000
        cost = _make_cost(source_table="metrics_5m", expected_buckets=1440, estimated_series=100)
        assert 50_000 <= cost.static_score < 500_000
        assert cost.cost_band == "expensive"

    def test_extreme_query(self):
        # 200 series * 1440 buckets * 5.0 (raw metrics) * 3.0 (p99) = 4,320,000
        cost = _make_cost(source_table="metrics", expected_buckets=1440, estimated_series=200, aggregator="p99")
        assert cost.static_score > 500_000
        assert cost.cost_band == "extreme"


class TestScoreCalculation:
    def test_raw_table_most_expensive(self):
        raw = _make_cost(source_table="metrics", expected_buckets=60)
        rollup = _make_cost(source_table="metrics_1h", expected_buckets=60)
        assert raw.static_score > rollup.static_score
        assert raw.static_score / rollup.static_score == pytest.approx(
            SOURCE_TABLE_WEIGHT["metrics"] / SOURCE_TABLE_WEIGHT["metrics_1h"]
        )

    def test_percentile_aggregator_more_expensive(self):
        avg_cost = _make_cost(aggregator="avg")
        p99_cost = _make_cost(aggregator="p99")
        assert p99_cost.static_score > avg_cost.static_score
        assert p99_cost.static_score / avg_cost.static_score == pytest.approx(
            AGGREGATOR_WEIGHT["p99"] / AGGREGATOR_WEIGHT["avg"]
        )

    def test_post_processors_multiply_cost(self):
        zero = _make_cost(post_processor_count=0)
        two = _make_cost(post_processor_count=2)
        assert two.static_score / zero.static_score == pytest.approx(POST_PROCESSOR_WEIGHT ** 2)


class TestHistoricalOverride:
    def test_historical_p95_overrides_static(self):
        cost = _make_cost(historical_p95_ms=42.0)
        assert cost.effective_score == 42.0
        assert cost.effective_score != cost.static_score

    def test_no_history_uses_static(self):
        cost = _make_cost(historical_p95_ms=None)
        assert cost.effective_score == cost.static_score


class TestEstimateCostFunction:
    def test_produces_correct_buckets(self):
        compiled = _make_compiled()
        result = estimate_cost(compiled, time_range_sec=3600, interval_sec=60, source_table="metrics_1m")
        assert result.expected_buckets == 60

        result2 = estimate_cost(compiled, time_range_sec=300, interval_sec=60, source_table="metrics_1m")
        assert result2.expected_buckets == 5
