from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from neoguard.services.mql.ast_nodes import (
    AbsFunc,
    AsCountFunc,
    AsRateFunc,
    DerivativeFunc,
    ExactMatch,
    InSetMatch,
    LogFunc,
    MQLFunction,
    MQLQuery,
    MovingAverageFunc,
    NegationMatch,
    RateFunc,
    Rollup,
    TagFilter,
    WildcardMatch,
)


_SAFE_TAG_KEY = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$")


def _validate_tag_key(key: str) -> str:
    if not _SAFE_TAG_KEY.match(key) or len(key) > 128:
        raise ValueError(f"Invalid tag key: {key!r}")
    return key


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    params: tuple
    metric_name: str
    post_processors: tuple[MQLFunction, ...]


def compile_query(
    query: MQLQuery,
    *,
    tenant_id: str | None,
    start: datetime,
    end: datetime,
    interval: str = "1m",
) -> CompiledQuery:
    source = _pick_source_table(start, end, interval)
    bucket_sql = _interval_to_bucket(interval)
    rollup_override = query.rollup

    if rollup_override:
        bucket_sql = f"{rollup_override.seconds} seconds"

    agg = query.aggregator
    if rollup_override:
        agg = rollup_override.method

    builder = _SQLBuilder(
        source=source,
        metric_name=query.metric_name,
        tenant_id=tenant_id,
        start=start,
        end=end,
        agg=agg,
        bucket_sql=bucket_sql,
        filters=query.filters,
        is_raw=(source == "metrics"),
    )
    sql, params = builder.build()

    return CompiledQuery(
        sql=sql,
        params=tuple(params),
        metric_name=query.metric_name,
        post_processors=query.functions,
    )


INTERVAL_TO_BUCKET = {
    "raw": None,
    "1m": "1 minute",
    "5m": "5 minutes",
    "15m": "15 minutes",
    "1h": "1 hour",
    "6h": "6 hours",
    "1d": "1 day",
}


def _interval_to_bucket(interval: str) -> str | None:
    if interval in INTERVAL_TO_BUCKET:
        return INTERVAL_TO_BUCKET[interval]
    raise ValueError(f"Invalid interval: {interval}")


def _pick_source_table(start: datetime, end: datetime, interval: str) -> str:
    if interval == "raw":
        return "metrics"
    span = end - start
    if span > timedelta(hours=24) or interval in ("1h", "6h", "1d"):
        return "metrics_1h"
    return "metrics_1m"


class _SQLBuilder:
    def __init__(
        self,
        *,
        source: str,
        metric_name: str,
        tenant_id: str | None,
        start: datetime,
        end: datetime,
        agg: str,
        bucket_sql: str | None,
        filters: tuple[TagFilter, ...],
        is_raw: bool,
    ) -> None:
        self._source = source
        self._metric_name = metric_name
        self._tenant_id = tenant_id
        self._start = start
        self._end = end
        self._agg = agg
        self._bucket_sql = bucket_sql
        self._filters = filters
        self._is_raw = is_raw
        self._params: list = []
        self._idx = 1

    def _param(self, value: object) -> str:
        ref = f"${self._idx}"
        self._params.append(value)
        self._idx += 1
        return ref

    def build(self) -> tuple[str, list]:
        time_col = self._time_column()
        select_agg = self._select_aggregation()
        where = self._build_where()

        sql = f"""
            SELECT {time_col} AS bucket, tags, {select_agg} AS agg_value
            FROM {self._source}
            WHERE {where}
            GROUP BY bucket, tags
            ORDER BY bucket
        """
        return sql, self._params

    def _time_column(self) -> str:
        time_field = "time" if self._is_raw else "bucket"
        if self._bucket_sql:
            return f"time_bucket('{self._bucket_sql}', {time_field})"
        return time_field

    def _select_aggregation(self) -> str:
        if self._is_raw:
            return f"{self._agg.upper()}(value)"

        agg = self._agg
        if agg in ("avg", "min", "max"):
            return f"{agg.upper()}({agg}_value)"
        if agg == "count":
            return "SUM(sample_count)"
        if agg == "sum":
            return "SUM(avg_value * sample_count)"
        return f"{agg.upper()}(avg_value)"

    def _build_where(self) -> str:
        conditions: list[str] = []

        if self._tenant_id:
            conditions.append(f"tenant_id = {self._param(self._tenant_id)}")

        conditions.append(f"name = {self._param(self._metric_name)}")

        time_field = "time" if self._is_raw else "bucket"
        conditions.append(f"{time_field} >= {self._param(self._start)}")
        conditions.append(f"{time_field} < {self._param(self._end)}")

        for f in self._filters:
            conditions.extend(self._compile_filter(f))

        return " AND ".join(conditions)

    def _compile_filter(self, f: TagFilter) -> list[str]:
        key = _validate_tag_key(f.key)
        if isinstance(f, ExactMatch):
            return [f"tags->>'{key}' = {self._param(f.value)}"]
        if isinstance(f, WildcardMatch):
            pattern = f.pattern.replace("*", "%")
            return [f"tags->>'{key}' LIKE {self._param(pattern)}"]
        if isinstance(f, NegationMatch):
            return [f"(tags->>'{key}' IS NULL OR tags->>'{key}' != {self._param(f.value)})"]
        if isinstance(f, InSetMatch):
            placeholders = ", ".join(self._param(v) for v in f.values)
            return [f"tags->>'{key}' IN ({placeholders})"]
        return []
