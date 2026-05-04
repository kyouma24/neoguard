from __future__ import annotations

from datetime import datetime

import orjson

from neoguard.db.timescale.connection import get_pool
from neoguard.models.metrics import MetricQueryResult
from neoguard.services.mql.ast_nodes import (
    AbsFunc,
    AsCountFunc,
    AsRateFunc,
    DerivativeFunc,
    LogFunc,
    MQLFunction,
    MovingAverageFunc,
    RateFunc,
)
from neoguard.services.mql.compiler import CompiledQuery

import asyncio
import math

QUERY_TIMEOUT_SECONDS = 30.0


async def execute(compiled: CompiledQuery) -> list[MetricQueryResult]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await asyncio.wait_for(
            conn.fetch(compiled.sql, *compiled.params),
            timeout=QUERY_TIMEOUT_SECONDS,
        )

    results = _rows_to_results(compiled.metric_name, rows)

    if compiled.post_processors:
        results = [_apply_functions(r, compiled.post_processors) for r in results]

    return results


def _rows_to_results(name: str, rows: list) -> list[MetricQueryResult]:
    grouped: dict[str, list[tuple[datetime, float | None]]] = {}

    for row in rows:
        raw_tags = row["tags"]
        tags_key = raw_tags if isinstance(raw_tags, str) else orjson.dumps(raw_tags).decode()

        if tags_key not in grouped:
            grouped[tags_key] = []

        grouped[tags_key].append((row["bucket"], row["agg_value"]))

    results = []
    for tags_key, datapoints in grouped.items():
        tags = orjson.loads(tags_key) if isinstance(tags_key, str) else tags_key
        results.append(MetricQueryResult(name=name, tags=tags, datapoints=datapoints))

    return results


def _apply_functions(
    result: MetricQueryResult,
    functions: tuple[MQLFunction, ...],
) -> MetricQueryResult:
    datapoints = list(result.datapoints)

    for func in functions:
        datapoints = _apply_single_function(datapoints, func)

    return MetricQueryResult(
        name=result.name,
        tags=result.tags,
        datapoints=datapoints,
    )


def _apply_single_function(
    datapoints: list[tuple[datetime, float | None]],
    func: MQLFunction,
) -> list[tuple[datetime, float | None]]:
    if isinstance(func, (RateFunc, AsRateFunc)):
        return _compute_rate(datapoints)
    if isinstance(func, DerivativeFunc):
        return _compute_derivative(datapoints)
    if isinstance(func, MovingAverageFunc):
        return _compute_moving_average(datapoints, func.window)
    if isinstance(func, AsCountFunc):
        return _compute_as_count(datapoints)
    if isinstance(func, AbsFunc):
        return [(ts, abs(v) if v is not None else None) for ts, v in datapoints]
    if isinstance(func, LogFunc):
        return [
            (ts, math.log(v) if v is not None and v > 0 else None)
            for ts, v in datapoints
        ]
    return datapoints


def _compute_rate(
    datapoints: list[tuple[datetime, float | None]],
) -> list[tuple[datetime, float | None]]:
    if len(datapoints) < 2:
        return [(ts, None) for ts, _ in datapoints]

    result: list[tuple[datetime, float | None]] = [(datapoints[0][0], None)]
    for i in range(1, len(datapoints)):
        ts_prev, val_prev = datapoints[i - 1]
        ts_curr, val_curr = datapoints[i]
        if val_prev is not None and val_curr is not None:
            dt_seconds = (ts_curr - ts_prev).total_seconds()
            if dt_seconds > 0:
                rate = (val_curr - val_prev) / dt_seconds
                result.append((ts_curr, max(rate, 0.0)))
            else:
                result.append((ts_curr, None))
        else:
            result.append((ts_curr, None))
    return result


def _compute_derivative(
    datapoints: list[tuple[datetime, float | None]],
) -> list[tuple[datetime, float | None]]:
    if len(datapoints) < 2:
        return [(ts, None) for ts, _ in datapoints]

    result: list[tuple[datetime, float | None]] = [(datapoints[0][0], None)]
    for i in range(1, len(datapoints)):
        ts_prev, val_prev = datapoints[i - 1]
        ts_curr, val_curr = datapoints[i]
        if val_prev is not None and val_curr is not None:
            dt_seconds = (ts_curr - ts_prev).total_seconds()
            if dt_seconds > 0:
                result.append((ts_curr, (val_curr - val_prev) / dt_seconds))
            else:
                result.append((ts_curr, None))
        else:
            result.append((ts_curr, None))
    return result


def _compute_moving_average(
    datapoints: list[tuple[datetime, float | None]],
    window: int,
) -> list[tuple[datetime, float | None]]:
    result: list[tuple[datetime, float | None]] = []
    values: list[float] = []

    for ts, val in datapoints:
        if val is not None:
            values.append(val)
        if len(values) > window:
            values.pop(0)
        if len(values) == window:
            result.append((ts, sum(values) / window))
        else:
            result.append((ts, None))
    return result


def _compute_as_count(
    datapoints: list[tuple[datetime, float | None]],
) -> list[tuple[datetime, float | None]]:
    if len(datapoints) < 2:
        return [(ts, None) for ts, _ in datapoints]

    result: list[tuple[datetime, float | None]] = [(datapoints[0][0], None)]
    for i in range(1, len(datapoints)):
        ts_prev, val_prev = datapoints[i - 1]
        ts_curr, val_curr = datapoints[i]
        if val_prev is not None and val_curr is not None:
            diff = val_curr - val_prev
            result.append((ts_curr, max(diff, 0.0)))
        else:
            result.append((ts_curr, None))
    return result
