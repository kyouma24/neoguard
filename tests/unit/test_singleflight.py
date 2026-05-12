"""Unit tests for singleflight — process-local query dedup."""

from __future__ import annotations

import asyncio

import pytest

from neoguard.services.mql.singleflight import (
    SingleflightTimeout,
    _inflight,
    _metrics,
    singleflight,
)


@pytest.fixture(autouse=True)
def _clear_state():
    """Reset inflight dict and metrics between tests."""
    _inflight.clear()
    _metrics["hits"] = 0
    _metrics["waits"] = 0
    _metrics["timeouts"] = 0
    _metrics["errors"] = 0
    yield
    _inflight.clear()


@pytest.mark.asyncio
async def test_single_caller_executes_normally():
    call_count = 0

    async def fn():
        nonlocal call_count
        call_count += 1
        return {"data": [1, 2, 3]}

    result = await singleflight("key-a", fn)
    assert result == {"data": [1, 2, 3]}
    assert call_count == 1


@pytest.mark.asyncio
async def test_concurrent_callers_share_result():
    call_count = 0

    async def expensive_query():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.1)
        return {"series": [1, 2, 3]}

    results = await asyncio.gather(
        singleflight("same-key", expensive_query),
        singleflight("same-key", expensive_query),
        singleflight("same-key", expensive_query),
    )

    assert call_count == 1
    assert all(r == {"series": [1, 2, 3]} for r in results)


@pytest.mark.asyncio
async def test_different_keys_execute_independently():
    calls = {"a": 0, "b": 0}

    async def fn_a():
        calls["a"] += 1
        await asyncio.sleep(0.05)
        return "result-a"

    async def fn_b():
        calls["b"] += 1
        await asyncio.sleep(0.05)
        return "result-b"

    r_a, r_b = await asyncio.gather(
        singleflight("key-a", fn_a),
        singleflight("key-b", fn_b),
    )

    assert r_a == "result-a"
    assert r_b == "result-b"
    assert calls["a"] == 1
    assert calls["b"] == 1


@pytest.mark.asyncio
async def test_error_propagates_to_all_waiters():
    call_count = 0

    async def failing():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        raise ValueError("db exploded")

    with pytest.raises(ValueError, match="db exploded"):
        await asyncio.gather(
            singleflight("err-key", failing),
            singleflight("err-key", failing),
        )

    assert call_count == 1


@pytest.mark.asyncio
async def test_timeout_raises_singleflight_timeout():
    async def slow():
        await asyncio.sleep(5.0)
        return "never"

    with pytest.raises(SingleflightTimeout):
        await singleflight("slow-key", slow, timeout_sec=0.1)


@pytest.mark.asyncio
async def test_cancellation_does_not_kill_other_waiters():
    call_count = 0

    async def work():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.2)
        return "done"

    async def cancel_after(task, delay):
        await asyncio.sleep(delay)
        task.cancel()

    t1 = asyncio.create_task(singleflight("cancel-key", work))
    t2 = asyncio.create_task(singleflight("cancel-key", work))
    t3 = asyncio.create_task(singleflight("cancel-key", work))

    cancel_task = asyncio.create_task(cancel_after(t1, 0.01))

    results = await asyncio.gather(t1, t2, t3, cancel_task, return_exceptions=True)

    # t1 may be cancelled, but t2 and t3 should succeed
    successful = [r for r in results[:3] if r == "done"]
    assert len(successful) >= 2
    assert call_count == 1


@pytest.mark.asyncio
async def test_inflight_cleaned_up_after_completion():
    async def fn():
        await asyncio.sleep(0.01)
        return "ok"

    await singleflight("cleanup-key", fn)
    assert "cleanup-key" not in _inflight
    assert len(_inflight) == 0
