"""QueryCost — multi-factor cost estimation for MQL queries.

Quantifies query expense based on source table, aggregator,
post-processors, time range, and estimated series cardinality.

Design target: estimate_cost() completes in <1ms with no I/O.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from neoguard.services.mql.compiler import CompiledQuery


SourceTable = Literal["metrics", "metrics_1m", "metrics_5m", "metrics_1h"]
Aggregator = Literal["avg", "sum", "min", "max", "count", "last", "p50", "p95", "p99"]

SOURCE_TABLE_WEIGHT: dict[str, float] = {
    "metrics": 5.0,
    "metrics_1m": 1.5,
    "metrics_5m": 1.0,
    "metrics_1h": 0.3,
}

AGGREGATOR_WEIGHT: dict[str, float] = {
    "avg": 1.0,
    "sum": 1.0,
    "min": 1.0,
    "max": 1.0,
    "count": 1.0,
    "last": 1.0,
    "p50": 2.5,
    "p95": 3.0,
    "p99": 3.0,
}

POST_PROCESSOR_WEIGHT: float = 1.2


@dataclass(frozen=True)
class QueryCost:
    """Estimated cost of a query.

    Fields ``historical_p50_ms``, ``historical_p95_ms``, and
    ``historical_avg_series`` are reserved for Phase 5 — always None
    until query observation recording is implemented.
    """

    time_range_sec: int
    source_table: SourceTable
    aggregator: Aggregator
    post_processor_count: int
    expected_buckets: int
    estimated_series: int = 50

    historical_p50_ms: float | None = None
    historical_p95_ms: float | None = None
    historical_avg_series: float | None = None

    @property
    def static_score(self) -> float:
        base = float(self.estimated_series * self.expected_buckets)
        base *= SOURCE_TABLE_WEIGHT.get(self.source_table, 1.0)
        base *= AGGREGATOR_WEIGHT.get(self.aggregator, 1.0)
        for _ in range(self.post_processor_count):
            base *= POST_PROCESSOR_WEIGHT
        return base

    @property
    def effective_score(self) -> float:
        if self.historical_p95_ms is not None:
            return self.historical_p95_ms
        return self.static_score

    @property
    def cost_band(self) -> Literal["cheap", "moderate", "expensive", "extreme"]:
        s = self.effective_score
        if s < 1_000:
            return "cheap"
        if s < 50_000:
            return "moderate"
        if s < 500_000:
            return "expensive"
        return "extreme"


@dataclass(frozen=True)
class QueryObservation:
    """Recorded after query execution. Feeds back into cost model in Phase 5."""

    identity_cache_key: str
    wall_time_ms: float
    rows_returned: int
    series_returned: int
    cache_status: Literal["fresh", "stale", "miss"]
    source_table: SourceTable
    timestamp: int


def estimate_cost(
    compiled: CompiledQuery,
    time_range_sec: int,
    interval_sec: int,
    source_table: SourceTable,
) -> QueryCost:
    """Compute a static cost estimate from a compiled query.

    Pure computation — no I/O, no database calls. Design target: <1ms.
    Historical observations are not populated in Phase 0.
    """
    expected_buckets = max(1, time_range_sec // interval_sec)

    aggregator: Aggregator = "avg"
    sql_lower = compiled.sql.lower()
    for agg in ("p99", "p95", "p50", "last", "count", "sum", "min", "max", "avg"):
        if agg in sql_lower:
            aggregator = agg  # type: ignore[assignment]
            break

    return QueryCost(
        time_range_sec=time_range_sec,
        source_table=source_table,
        aggregator=aggregator,
        post_processor_count=len(compiled.post_processors),
        expected_buckets=expected_buckets,
    )
