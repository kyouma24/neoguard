"""Metadata service — metric name typeahead, tag key/value lookups, function catalog."""

from __future__ import annotations

from dataclasses import dataclass

from neoguard.db.timescale.connection import get_pool


async def get_metric_names(
    tenant_id: str,
    query: str = "",
    limit: int = 50,
) -> list[str]:
    """Search for distinct metric names matching *query* (case-insensitive).

    Always scoped to tenant_id (enforced by get_query_tenant_id at route level).
    """
    pool = await get_pool()

    conditions: list[str] = ["tenant_id = $1"]
    params: list[object] = [tenant_id]
    idx = 2

    if query:
        conditions.append(f"name ILIKE ${idx}")
        params.append(f"%{query}%")
        idx += 1

    where = " AND ".join(conditions)
    capped_limit = min(limit, 1000)
    sql = f"""
        SELECT DISTINCT name
        FROM metrics
        WHERE {where}
        ORDER BY name
        LIMIT ${idx}
    """
    params.append(capped_limit)

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    return [row["name"] for row in rows]


async def get_tag_keys(
    tenant_id: str,
    metric_name: str,
) -> list[str]:
    """Return distinct tag keys for a given metric name, scoped to tenant."""
    pool = await get_pool()

    sql = """
        SELECT DISTINCT jsonb_object_keys(tags) AS tag_key
        FROM metrics
        WHERE tenant_id = $1 AND name = $2
        ORDER BY tag_key
        LIMIT 1000
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, tenant_id, metric_name)

    return [row["tag_key"] for row in rows]


async def get_tag_values(
    tenant_id: str,
    metric_name: str,
    key: str,
    query: str = "",
    limit: int = 100,
) -> list[str]:
    """Return distinct values for *key* tag on *metric_name*, optionally filtered.

    Uses GROUP BY + ORDER BY freq DESC for top-K ordering.
    """
    pool = await get_pool()

    conditions: list[str] = ["tenant_id = $1", "name = $2", "tags->>$3 IS NOT NULL"]
    params: list[object] = [tenant_id, metric_name, key]
    idx = 4

    if query:
        conditions.append(f"tags->>$3 ILIKE ${idx}")
        params.append(f"%{query}%")
        idx += 1

    where = " AND ".join(conditions)
    capped_limit = min(limit, 1000)
    sql = f"""
        SELECT tags->>$3 AS tag_value, COUNT(*) AS freq
        FROM metrics
        WHERE {where}
        GROUP BY tag_value
        ORDER BY freq DESC
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
