"""Metadata service — metric name typeahead, tag key/value lookups, function catalog."""

from __future__ import annotations

from dataclasses import dataclass

from neoguard.db.timescale.connection import get_pool


async def get_metric_names(
    tenant_id: str | None,
    query: str = "",
    limit: int = 50,
) -> list[str]:
    """Search for distinct metric names matching *query* (case-insensitive).

    Scoped to *tenant_id* when provided (regular user). Super admins pass
    ``None`` to see all tenants.
    """
    pool = await get_pool()

    conditions: list[str] = []
    params: list[object] = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    if query:
        conditions.append(f"name ILIKE ${idx}")
        params.append(f"%{query}%")
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    sql = f"""
        SELECT DISTINCT name
        FROM metrics
        {where}
        ORDER BY name
        LIMIT ${idx}
    """
    params.append(min(limit, 200))

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    return [row["name"] for row in rows]


async def get_tag_keys(
    tenant_id: str | None,
    metric_name: str,
) -> list[str]:
    """Return distinct tag keys for a given metric name, scoped to tenant."""
    pool = await get_pool()

    conditions: list[str] = []
    params: list[object] = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    conditions.append(f"name = ${idx}")
    params.append(metric_name)
    idx += 1

    where = " AND ".join(conditions)
    sql = f"""
        SELECT DISTINCT jsonb_object_keys(tags) AS tag_key
        FROM metrics
        WHERE {where}
        ORDER BY tag_key
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    return [row["tag_key"] for row in rows]


async def get_tag_values(
    tenant_id: str | None,
    metric_name: str,
    key: str,
    query: str = "",
    limit: int = 100,
) -> list[str]:
    """Return distinct values for *key* tag on *metric_name*, optionally filtered."""
    pool = await get_pool()

    conditions: list[str] = []
    params: list[object] = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    conditions.append(f"name = ${idx}")
    params.append(metric_name)
    idx += 1

    # Extract tag value — parameterize the key name via ->> $N
    conditions.append(f"tags->>${ idx} IS NOT NULL")
    params.append(key)
    tag_key_idx = idx
    idx += 1

    if query:
        conditions.append(f"tags->>${tag_key_idx} ILIKE ${idx}")
        params.append(f"%{query}%")
        idx += 1

    where = " AND ".join(conditions)
    capped_limit = min(limit, 10000)
    sql = f"""
        SELECT DISTINCT tags->>${tag_key_idx} AS tag_value
        FROM metrics
        WHERE {where}
        ORDER BY tag_value
        LIMIT ${idx}
    """
    params.append(capped_limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    return [row["tag_value"] for row in rows]


# ---------------------------------------------------------------------------
# Static MQL function catalog
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MQLFunctionInfo:
    """Metadata about a supported MQL post-processing function."""

    name: str
    description: str
    arity: int
    example: str


MQL_FUNCTIONS: list[MQLFunctionInfo] = [
    MQLFunctionInfo(
        name="rate",
        description="Compute per-second rate of change. Clamps negative resets to zero.",
        arity=0,
        example="avg:system.cpu{host:web-1}.rate()",
    ),
    MQLFunctionInfo(
        name="derivative",
        description="Compute the difference between consecutive points.",
        arity=0,
        example="sum:network.bytes_in{}.derivative()",
    ),
    MQLFunctionInfo(
        name="moving_average",
        description="Smooth series with a sliding window average.",
        arity=1,
        example="avg:app.latency{}.moving_average(5)",
    ),
    MQLFunctionInfo(
        name="as_rate",
        description="Convert a count metric to per-second rate based on query interval.",
        arity=0,
        example="sum:http.requests{}.as_rate()",
    ),
    MQLFunctionInfo(
        name="as_count",
        description="Convert a rate metric to a count based on query interval.",
        arity=0,
        example="sum:http.requests{}.as_count()",
    ),
    MQLFunctionInfo(
        name="abs",
        description="Return absolute value of each point.",
        arity=0,
        example="avg:temperature.delta{}.abs()",
    ),
    MQLFunctionInfo(
        name="log",
        description="Return natural logarithm (ln) of each point. Null for non-positive values.",
        arity=0,
        example="avg:queue.depth{}.log()",
    ),
]


def get_functions() -> list[MQLFunctionInfo]:
    """Return the static catalog of supported MQL functions."""
    return MQL_FUNCTIONS
