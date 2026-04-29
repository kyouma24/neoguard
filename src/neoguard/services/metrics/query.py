from datetime import datetime, timedelta

import asyncpg
import orjson

from neoguard.db.timescale.connection import get_pool
from neoguard.models.metrics import MetricQuery, MetricQueryResult

VALID_AGGREGATIONS = {"avg", "min", "max", "sum", "count"}

INTERVAL_TO_TABLE = {
    "raw": "metrics",
    "1m": "metrics_1m",
    "5m": "metrics_1m",
    "1h": "metrics_1h",
}

INTERVAL_TO_BUCKET = {
    "raw": None,
    "1m": "1 minute",
    "5m": "5 minutes",
    "15m": "15 minutes",
    "1h": "1 hour",
    "6h": "6 hours",
    "1d": "1 day",
}


def _pick_source_table(start: datetime, end: datetime, interval: str) -> str:
    if interval == "raw":
        return "metrics"
    span = end - start
    if span > timedelta(hours=24) or interval in ("1h", "6h", "1d"):
        return "metrics_1h"
    return "metrics_1m"


async def query_metrics(q: MetricQuery) -> list[MetricQueryResult]:
    agg = q.aggregation.lower()
    if agg not in VALID_AGGREGATIONS:
        raise ValueError(f"Invalid aggregation: {agg}. Must be one of {VALID_AGGREGATIONS}")

    bucket_sql = INTERVAL_TO_BUCKET.get(q.interval)
    source = _pick_source_table(q.start, q.end, q.interval)
    tenant_id = q.tenant_id or "default"

    pool = await get_pool()

    if source == "metrics":
        return await _query_raw(pool, q, tenant_id, agg, bucket_sql)
    return await _query_aggregate(pool, q, tenant_id, source, agg, bucket_sql)


async def _query_raw(
    pool: asyncpg.Pool,
    q: MetricQuery,
    tenant_id: str,
    agg: str,
    bucket_sql: str | None,
) -> list[MetricQueryResult]:
    time_col = f"time_bucket('{bucket_sql}', time)" if bucket_sql else "time"

    tags_filter, params = _build_tags_filter(q.tags, param_offset=3)
    where_tags = f" AND {tags_filter}" if tags_filter else ""

    sql = f"""
        SELECT {time_col} AS bucket, tags, {agg}(value) AS agg_value
        FROM metrics
        WHERE tenant_id = $1 AND name = $2 AND time >= $3 AND time < $4 {where_tags}
        GROUP BY bucket, tags
        ORDER BY bucket
    """

    all_params: list = [tenant_id, q.name, q.start, q.end, *params]

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *all_params)

    return _rows_to_results(q.name, rows)


async def _query_aggregate(
    pool: asyncpg.Pool,
    q: MetricQuery,
    tenant_id: str,
    source: str,
    agg: str,
    bucket_sql: str | None,
) -> list[MetricQueryResult]:
    agg_col = f"{agg}_value" if agg in ("avg", "min", "max") else "sample_count"

    time_col = f"time_bucket('{bucket_sql}', bucket)" if bucket_sql else "bucket"

    tags_filter, params = _build_tags_filter(q.tags, param_offset=3)
    where_tags = f" AND {tags_filter}" if tags_filter else ""

    if agg == "count":
        select_agg = "SUM(sample_count)"
    elif agg == "sum":
        select_agg = "SUM(avg_value * sample_count)"
    else:
        select_agg = f"{agg.upper()}({agg_col})"

    sql = f"""
        SELECT {time_col} AS ts, tags, {select_agg} AS agg_value
        FROM {source}
        WHERE tenant_id = $1 AND name = $2 AND bucket >= $3 AND bucket < $4 {where_tags}
        GROUP BY ts, tags
        ORDER BY ts
    """

    all_params: list = [tenant_id, q.name, q.start, q.end, *params]

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *all_params)

    return _rows_to_results(q.name, rows)


def _build_tags_filter(tags: dict[str, str], param_offset: int) -> tuple[str, list]:
    if not tags:
        return "", []

    conditions = []
    params = []
    for k, v in tags.items():
        idx = param_offset + len(params) + 2
        conditions.append(f"tags->>'{k}' = ${idx}")
        params.append(v)

    return " AND ".join(conditions), params


def _rows_to_results(name: str, rows: list) -> list[MetricQueryResult]:
    grouped: dict[str, list[tuple[datetime, float | None]]] = {}

    for row in rows:
        raw_tags = row["tags"]
        tags_key = raw_tags if isinstance(raw_tags, str) else orjson.dumps(raw_tags).decode()
        key = tags_key

        if key not in grouped:
            grouped[key] = []

        ts = row["bucket"] if "bucket" in row else row["ts"]
        grouped[key].append((ts, row["agg_value"]))

    results = []
    for tags_key, datapoints in grouped.items():
        tags = orjson.loads(tags_key) if isinstance(tags_key, str) else tags_key
        results.append(MetricQueryResult(name=name, tags=tags, datapoints=datapoints))

    return results
