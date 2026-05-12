"""QueryIdentity — canonical, stable identity for MQL queries.

Used by cache, single-flight, dedup, and admission control systems.
Identity is derived from CompiledQuery (not raw query strings) to
eliminate ambiguity and match the existing cache key logic in cache.py.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import orjson

from neoguard.services.mql.compiler import CompiledQuery


CACHE_KEY_PREFIX = "q2"


def _align_ts(ts: int, interval: int) -> int:
    # Guard against malformed input; alignment is a no-op for non-positive intervals.
    if interval <= 0:
        return ts
    return (ts // interval) * interval


@dataclass(frozen=True)
class QueryIdentity:
    """Canonical identity for a query.

    Two QueryIdentity instances that compare equal represent the same
    logical query and MUST share cache entries, single-flight slots,
    and dedup keys.
    """

    tenant_id: str
    sql_hash: str
    # Stored for future singleflight dedup where two queries with identical
    # SQL but different bound parameters should occupy separate flight slots.
    # Not included in cache_key (matches existing make_cache_key format).
    params_hash: str
    aligned_from: int
    aligned_to: int
    interval_sec: int

    @classmethod
    def from_compiled(
        cls,
        tenant_id: str | None,
        compiled: CompiledQuery,
        from_ts: int,
        to_ts: int,
        interval_sec: int,
    ) -> QueryIdentity:
        tenant_part = tenant_id if tenant_id else "CROSS_TENANT"
        sql_hash = hashlib.sha256(compiled.sql.encode()).hexdigest()[:32]
        params_hash = hashlib.sha256(
            orjson.dumps(compiled.params)
        ).hexdigest()[:32]
        aligned_from = _align_ts(from_ts, interval_sec)
        aligned_to = _align_ts(to_ts, interval_sec)
        return cls(
            tenant_id=tenant_part,
            sql_hash=sql_hash,
            params_hash=params_hash,
            aligned_from=aligned_from,
            aligned_to=aligned_to,
            interval_sec=interval_sec,
        )

    @property
    def cache_key(self) -> str:
        return (
            f"{CACHE_KEY_PREFIX}:{self.tenant_id}:{self.sql_hash}"
            f":{self.aligned_from}:{self.aligned_to}:{self.interval_sec}"
        )

    @property
    def singleflight_key(self) -> str:
        return self.cache_key

    def __str__(self) -> str:
        return self.cache_key
