"""Tests for adaptive tag cardinality detection."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.services.metrics.cardinality import (
    ADAPTIVE_THRESHOLD,
    is_high_cardinality,
    observe_cardinality,
)

TENANT = "tenant-1"


def _mock_pool_with_conn(mock_conn: AsyncMock) -> MagicMock:
    mock_pool = MagicMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    return mock_pool


class TestIsHighCardinality:
    async def test_returns_false_when_no_observations(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await is_high_cardinality(TENANT, "env")

        assert result is False

    async def test_returns_false_when_below_threshold(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"observed_distinct_count": 500}
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await is_high_cardinality(TENANT, "env")

        assert result is False

    async def test_returns_true_when_at_threshold(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"observed_distinct_count": ADAPTIVE_THRESHOLD}
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await is_high_cardinality(TENANT, "request_uuid")

        assert result is True

    async def test_returns_true_when_above_threshold(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = {"observed_distinct_count": 50_000}
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await is_high_cardinality(TENANT, "correlation_uuid")

        assert result is True

    async def test_queries_correct_tenant_and_tag(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            await is_high_cardinality("t-abc", "my_tag")

        args = mock_conn.fetchrow.call_args[0]
        assert "t-abc" in args
        assert "my_tag" in args


class TestObserveCardinality:
    async def test_returns_observations_list(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {"tag_key": "env", "distinct_count": 5, "sample_size": 1000},
            {"tag_key": "request_id", "distinct_count": 15000, "sample_size": 1000},
        ]
        mock_conn.execute = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await observe_cardinality(TENANT)

        assert len(result) == 2
        assert result[0]["tag_key"] == "env"
        assert result[0]["distinct_count"] == 5
        assert result[1]["tag_key"] == "request_id"
        assert result[1]["distinct_count"] == 15000

    async def test_writes_upsert_for_each_tag(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {"tag_key": "env", "distinct_count": 3, "sample_size": 500},
        ]
        mock_conn.execute = AsyncMock()
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            await observe_cardinality(TENANT)

        mock_conn.execute.assert_called_once()
        sql = mock_conn.execute.call_args[0][0]
        assert "INSERT INTO tag_cardinality_observations" in sql
        assert "ON CONFLICT" in sql

    async def test_empty_result_when_no_metrics(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.metrics.cardinality.get_pool", AsyncMock(return_value=mock_pool)):
            result = await observe_cardinality(TENANT)

        assert result == []


class TestAdaptiveThreshold:
    def test_threshold_value(self):
        assert ADAPTIVE_THRESHOLD == 10_000
