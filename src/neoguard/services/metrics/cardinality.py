"""Adaptive cardinality observation — detects high-cardinality tags at runtime.

Samples the metrics table to count distinct values per tag key per tenant.
Tags exceeding the threshold are blocked from value enumeration, complementing
the hardcoded denylist in config.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from neoguard.core.config import settings
from neoguard.db.timescale.connection import get_pool

logger = logging.getLogger(__name__)

ADAPTIVE_THRESHOLD = 10_000


async def is_high_cardinality(tenant_id: str, tag_key: str) -> bool:
    """Check if a tag exceeds the cardinality threshold based on observations.

    NOTE: Returns False (allow) when no observations exist. The observation
    table is populated by observe_cardinality() which must be called by a
    background scheduler (not yet wired — TODO(phase1): add 24h cron job).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT observed_distinct_count
            FROM tag_cardinality_observations
            WHERE tenant_id = $1 AND tag_key = $2
            ORDER BY observation_window_start DESC
            LIMIT 1
            """,
            tenant_id,
            tag_key,
        )
    if row is None:
        logger.debug(
            "cardinality_check_no_data",
            tenant_id=tenant_id,
            tag_key=tag_key,
            result="allow_no_observations",
        )
        return False
    return row["observed_distinct_count"] >= ADAPTIVE_THRESHOLD


async def observe_cardinality(tenant_id: str) -> list[dict]:
    """Sample the metrics table and record per-tag cardinality for a tenant.

    Returns the list of observations written (for logging/testing).
    Designed to be called by a daily background job.
    """
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=24)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                key AS tag_key,
                COUNT(DISTINCT value) AS distinct_count,
                COUNT(*) AS sample_size
            FROM (
                SELECT (jsonb_each_text(tags)).*
                FROM metrics
                WHERE tenant_id = $1
                  AND time >= $2
                  AND time < $3
                LIMIT 100000
            ) sub
            GROUP BY key
            """,
            tenant_id,
            window_start,
            now,
        )

        observations = []
        if rows:
            # COLL-007: batch all upserts in a single executemany call.
            # Unit test validates application-level batching (1 call not N).
            # Actual network round-trip reduction depends on asyncpg pipeline mode (PG14+).
            params = []
            for row in rows:
                params.append((
                    tenant_id,
                    row["tag_key"],
                    row["distinct_count"],
                    window_start,
                    now,
                    row["sample_size"],
                ))
                observations.append({
                    "tag_key": row["tag_key"],
                    "distinct_count": row["distinct_count"],
                    "sample_size": row["sample_size"],
                })
            await conn.executemany(
                """
                INSERT INTO tag_cardinality_observations
                    (tenant_id, tag_key, observed_distinct_count,
                     observation_window_start, observation_window_end, sample_size)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (tenant_id, tag_key, observation_window_start)
                DO UPDATE SET
                    observed_distinct_count = EXCLUDED.observed_distinct_count,
                    sample_size = EXCLUDED.sample_size
                """,
                params,
            )

    logger.info(
        "cardinality_observation_complete",
        tenant_id=tenant_id,
        tags_observed=len(observations),
        high_cardinality=[o["tag_key"] for o in observations if o["distinct_count"] >= ADAPTIVE_THRESHOLD],
    )
    return observations
