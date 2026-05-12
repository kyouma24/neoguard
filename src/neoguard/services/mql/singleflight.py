"""Process-local single-flight for MQL query dedup.

Two concurrent callers with the same key share one execution.
Caller cancellation does NOT cancel the shared task (asyncio.shield).
"""
# TODO(production): Process-local only — does NOT deduplicate across workers.
# Cloud: Use Redis-based distributed lock or pub/sub for cross-process dedup.
# Migration risk: Medium — requires careful coordination protocol.
# Reference: docs/cloud_migration.md#cache-coordination

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")

_inflight: dict[str, asyncio.Future] = {}
_metrics: dict[str, int] = {"hits": 0, "waits": 0, "timeouts": 0, "errors": 0}


class SingleflightTimeout(Exception):
    """Raised when waiting for a shared result exceeds timeout."""


async def singleflight(
    key: str,
    fn: Callable[[], Awaitable[T]],
    *,
    timeout_sec: float = 15.0,
) -> T:
    """Run fn() at most once concurrently for the given key.

    Concurrent callers with the same key share the result.
    """
    existing = _inflight.get(key)
    if existing is not None and not existing.done():
        _metrics["waits"] += 1
        try:
            return await asyncio.wait_for(asyncio.shield(existing), timeout=timeout_sec)
        except asyncio.TimeoutError:
            _metrics["timeouts"] += 1
            raise SingleflightTimeout(f"Timed out waiting for key={key}")

    _metrics["hits"] += 1
    loop = asyncio.get_running_loop()
    future: asyncio.Future = loop.create_future()
    _inflight[key] = future

    async def _run() -> None:
        try:
            result = await fn()
            if not future.done():
                future.set_result(result)
        except BaseException as exc:
            _metrics["errors"] += 1
            if not future.done():
                future.set_exception(exc)
        finally:
            _inflight.pop(key, None)

    asyncio.create_task(_run())

    try:
        return await asyncio.wait_for(asyncio.shield(future), timeout=timeout_sec)
    except asyncio.TimeoutError:
        _metrics["timeouts"] += 1
        raise SingleflightTimeout(f"Timed out waiting for key={key}")


def get_singleflight_metrics() -> dict[str, int]:
    """Return current counters for /system/stats endpoint."""
    return dict(_metrics)
