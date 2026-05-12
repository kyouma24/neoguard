from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

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
from neoguard.services.mql.planner import plan_rollup


# Defense-in-depth: this regex intentionally excludes single quotes, double
# quotes, backslashes, semicolons, parentheses, spaces, and all other
# characters outside [a-zA-Z0-9_\-].  Even though tag keys are now fully
# parameterized (never interpolated into SQL), the regex remains as a
# compile-time assertion — any future relaxation MUST NOT admit characters
# that could enable SQL injection if parameterization were ever bypassed.
_SAFE_TAG_KEY = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_\-]*$")


def _validate_tag_key(key: str) -> str:
    if not _SAFE_TAG_KEY.match(key) or len(key) > 128:
        raise ValueError(f"Invalid tag key: {key!r}")
    assert "'" not in key, "tag key must never contain single quotes"
    return key


@dataclass(frozen=True)
class CompiledQuery:
    sql: str
    params: tuple
    metric_name: str
    post_processors: tuple[MQLFunction, ...]


class CompilerError(Exception):
    """Raised when the MQL compiler cannot proceed safely."""


def compile_query(
    query: MQLQuery,
    *,
    tenant_id: str | None,
    start: datetime,
    end: datetime,
    interval: str = "1m",
    widget_width_px: int | None = None,
    allow_cross_tenant: bool = False,
) -> CompiledQuery:
    if tenant_id is None and not allow_cross_tenant:
        raise CompilerError(
            "tenant_id is required for query compilation. "
            "Cross-tenant queries require explicit allow_cross_tenant=True."
        )

    if allow_cross_tenant:
        from neoguard.core.telemetry import registry
        registry.counter("mql.cross_tenant_compilation_total").inc()
        logger.info(
            "cross_tenant_compilation",
            extra={"metric_name": query.metric_name, "caller": "compile_query"},
        )

    # If the caller specifies a widget width, use the planner to pick
    # the source table and interval automatically (spec D.6).
    if widget_width_px is not None and interval != "raw":
        from_ts = int(start.timestamp())
        to_ts = int(end.timestamp())
        source, planned_interval_sec = plan_rollup(from_ts, to_ts, widget_width_px)
        bucket_seconds: int | None = planned_interval_sec
    else:
        source = _pick_source_table(start, end, interval)
        bucket_seconds = _interval_to_bucket_seconds(interval)

    rollup_override = query.rollup

    if rollup_override:
        bucket_seconds = rollup_override.seconds

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
        bucket_seconds=bucket_seconds,
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


INTERVAL_TO_BUCKET_SECONDS: dict[str, int | None] = {
    "raw": None,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
    "1d": 86400,
}


def _interval_to_bucket_seconds(interval: str) -> int | None:
    if interval in INTERVAL_TO_BUCKET_SECONDS:
        return INTERVAL_TO_BUCKET_SECONDS[interval]
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
        bucket_seconds: int | None,
        filters: tuple[TagFilter, ...],
        is_raw: bool,
    ) -> None:
        self._source = source
        self._metric_name = metric_name
        self._tenant_id = tenant_id
        self._start = start
        self._end = end
        self._agg = agg
        self._bucket_seconds = bucket_seconds
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
        if self._bucket_seconds is not None:
            # MQL-003: parameterize the bucket interval instead of f-string
            # interpolation.  Pass seconds as an integer parameter and let
            # PostgreSQL compute the interval expression.
            p = self._param(self._bucket_seconds)
            return f"time_bucket({p} * interval '1 second', {time_field})"
        return time_field

    # Percentile aggregation SQL for the raw metrics table.
    _PERCENTILE_RAW_SQL: dict[str, str] = {
        "p50": "PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value)",
        "p95": "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value)",
        "p99": "PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value)",
    }

    # Percentile fractions for aggregate tables (approx via avg_value).
    _PERCENTILE_FRACTION: dict[str, str] = {
        "p50": "0.50",
        "p95": "0.95",
        "p99": "0.99",
    }

    def _select_aggregation(self) -> str:
        if self._is_raw:
            if self._agg in self._PERCENTILE_RAW_SQL:
                return self._PERCENTILE_RAW_SQL[self._agg]
            return f"{self._agg.upper()}(value)"

        agg = self._agg
        if agg in ("avg", "min", "max"):
            return f"{agg.upper()}({agg}_value)"
        if agg == "count":
            return "SUM(sample_count)"
        if agg == "sum":
            return "SUM(avg_value * sample_count)"
        # Percentiles on aggregate tables: approximate via avg_value
        if agg in self._PERCENTILE_FRACTION:
            frac = self._PERCENTILE_FRACTION[agg]
            return f"PERCENTILE_CONT({frac}) WITHIN GROUP (ORDER BY avg_value)"
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
        # MQL-001: tag keys are now fully parameterized via tags->>($N).
        # The regex validation in _validate_tag_key remains as defense-in-depth.
        _validate_tag_key(f.key)
        key_param = self._param(f.key)
        if isinstance(f, ExactMatch):
            return [f"tags->>({key_param}) = {self._param(f.value)}"]
        if isinstance(f, WildcardMatch):
            escaped = f.pattern.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = escaped.replace("*", "%")
            return [f"tags->>({key_param}) LIKE {self._param(pattern)}"]
        if isinstance(f, NegationMatch):
            # Need two references to the same key param — but each must be a
            # separate positional parameter for asyncpg.
            key_param2 = self._param(f.key)
            return [f"(tags->>({key_param}) IS NULL OR tags->>({key_param2}) != {self._param(f.value)})"]
        if isinstance(f, InSetMatch):
            placeholders = ", ".join(self._param(v) for v in f.values)
            return [f"tags->>({key_param}) IN ({placeholders})"]
        return []
