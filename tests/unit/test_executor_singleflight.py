"""Unit tests for singleflight wiring in the MQL executor."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from neoguard.services.mql.compiler import CompiledQuery
from neoguard.services.mql.singleflight import _inflight


def _make_compiled(sql: str = "SELECT avg(value) FROM metrics_1m WHERE tenant_id = $1") -> CompiledQuery:
    return CompiledQuery(sql=sql, params=("tenant-a",), metric_name="cpu", post_processors=())


def _mock_pool(fetch_fn):
    """Create a mock pool where acquire() is a proper async context manager."""
    mock_conn = AsyncMock()
    mock_conn.fetch = fetch_fn

    @asynccontextmanager
    async def acquire():
        yield mock_conn

    pool = AsyncMock()
    pool.acquire = acquire
    return pool


@pytest.fixture(autouse=True)
def _clear_inflight():
    _inflight.clear()
    yield
    _inflight.clear()


@pytest.mark.asyncio
@patch("neoguard.services.mql.executor.get_pool")
@patch("neoguard.services.feature_flags.is_enabled", new_callable=AsyncMock, return_value=False)
async def test_singleflight_flag_off_executes_directly(mock_flag, mock_pool_fn):
    from neoguard.services.mql.executor import execute

    fetch_mock = AsyncMock(return_value=[])
    mock_pool_fn.return_value = _mock_pool(fetch_mock)

    compiled = _make_compiled()
    result = await execute(compiled, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60)

    assert result == []
    fetch_mock.assert_called_once()


@pytest.mark.asyncio
@patch("neoguard.services.mql.executor.get_pool")
@patch("neoguard.services.feature_flags.is_enabled", new_callable=AsyncMock, return_value=True)
async def test_singleflight_flag_on_deduplicates(mock_flag, mock_pool_fn):
    from neoguard.services.mql.executor import execute

    call_count = 0

    async def counting_fetch(sql, *params):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.1)
        return []

    mock_pool_fn.return_value = _mock_pool(counting_fetch)

    compiled = _make_compiled()
    results = await asyncio.gather(
        execute(compiled, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60),
        execute(compiled, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60),
    )

    assert call_count == 1
    assert all(r == [] for r in results)


@pytest.mark.asyncio
@patch("neoguard.services.mql.executor.get_pool")
@patch("neoguard.services.feature_flags.is_enabled", new_callable=AsyncMock, return_value=True)
async def test_singleflight_different_queries_execute_independently(mock_flag, mock_pool_fn):
    from neoguard.services.mql.executor import execute

    call_count = 0

    async def counting_fetch(sql, *params):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        return []

    mock_pool_fn.return_value = _mock_pool(counting_fetch)

    c1 = _make_compiled(sql="SELECT avg(value) FROM metrics_1m WHERE tenant_id = $1")
    c2 = _make_compiled(sql="SELECT max(value) FROM metrics_1m WHERE tenant_id = $1")

    await asyncio.gather(
        execute(c1, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60),
        execute(c2, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60),
    )

    assert call_count == 2


@pytest.mark.asyncio
@patch("neoguard.services.mql.executor.get_pool")
@patch("neoguard.services.feature_flags.is_enabled", new_callable=AsyncMock, return_value=True)
async def test_singleflight_error_still_propagates(mock_flag, mock_pool_fn):
    from neoguard.services.mql.executor import execute

    async def exploding_fetch(sql, *params):
        raise RuntimeError("connection lost")

    mock_pool_fn.return_value = _mock_pool(exploding_fetch)

    compiled = _make_compiled()

    with pytest.raises(RuntimeError, match="connection lost"):
        await execute(compiled, tenant_id="t-1", from_ts=1000, to_ts=2000, interval_sec=60)
