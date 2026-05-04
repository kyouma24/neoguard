"""Tests for the metadata service — metric name search, tag keys/values, function catalog."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.services.metadata import (
    MQL_FUNCTIONS,
    get_functions,
    get_metric_names,
    get_tag_keys,
    get_tag_values,
)

TENANT_A = "tenant-aaa"


def _mock_pool(rows: list[dict]):
    """Build a mock asyncpg pool that returns *rows* from conn.fetch()."""
    conn = MagicMock()
    conn.fetch = AsyncMock(return_value=rows)
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


class TestGetMetricNames:
    async def test_returns_distinct_names(self):
        pool, conn = _mock_pool([{"name": "cpu"}, {"name": "memory"}])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            result = await get_metric_names(tenant_id=TENANT_A, query="")
        assert result == ["cpu", "memory"]
        conn.fetch.assert_called_once()

    async def test_filters_by_tenant(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_metric_names(tenant_id=TENANT_A, query="cpu")
        sql = conn.fetch.call_args[0][0]
        assert "tenant_id = $1" in sql
        params = conn.fetch.call_args[0][1:]
        assert TENANT_A in params

    async def test_super_admin_no_tenant_filter(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_metric_names(tenant_id=None, query="")
        sql = conn.fetch.call_args[0][0]
        assert "tenant_id" not in sql

    async def test_query_uses_ilike(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_metric_names(tenant_id=TENANT_A, query="cpu")
        sql = conn.fetch.call_args[0][0]
        assert "ILIKE" in sql
        params = conn.fetch.call_args[0][1:]
        assert "%cpu%" in params

    async def test_limit_capped_at_200(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_metric_names(tenant_id=TENANT_A, query="", limit=500)
        # Last param is the limit, should be capped to 200
        params = conn.fetch.call_args[0][1:]
        assert params[-1] == 200

    async def test_empty_result(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            result = await get_metric_names(tenant_id=TENANT_A, query="nonexistent")
        assert result == []


class TestGetTagKeys:
    async def test_returns_tag_keys(self):
        pool, conn = _mock_pool([{"tag_key": "env"}, {"tag_key": "host"}])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            result = await get_tag_keys(tenant_id=TENANT_A, metric_name="cpu")
        assert result == ["env", "host"]

    async def test_scoped_to_metric_and_tenant(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_tag_keys(tenant_id=TENANT_A, metric_name="cpu")
        sql = conn.fetch.call_args[0][0]
        assert "tenant_id = $1" in sql
        assert "name = $2" in sql

    async def test_empty_for_nonexistent_metric(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            result = await get_tag_keys(tenant_id=TENANT_A, metric_name="nonexistent")
        assert result == []


class TestGetTagValues:
    async def test_returns_tag_values(self):
        pool, conn = _mock_pool([{"tag_value": "prod"}, {"tag_value": "staging"}])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            result = await get_tag_values(
                tenant_id=TENANT_A,
                metric_name="cpu",
                key="env",
            )
        assert result == ["prod", "staging"]

    async def test_query_filter_applied(self):
        pool, conn = _mock_pool([{"tag_value": "prod"}])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_tag_values(
                tenant_id=TENANT_A,
                metric_name="cpu",
                key="env",
                query="pro",
            )
        sql = conn.fetch.call_args[0][0]
        assert "ILIKE" in sql
        params = conn.fetch.call_args[0][1:]
        assert "%pro%" in params

    async def test_limit_capped_at_10000(self):
        pool, conn = _mock_pool([])
        with patch("neoguard.services.metadata.get_pool", AsyncMock(return_value=pool)):
            await get_tag_values(
                tenant_id=TENANT_A,
                metric_name="cpu",
                key="env",
                limit=50000,
            )
        params = conn.fetch.call_args[0][1:]
        assert params[-1] == 10000


class TestGetFunctions:
    def test_returns_all_functions(self):
        funcs = get_functions()
        assert len(funcs) == 7
        names = [f.name for f in funcs]
        assert "rate" in names
        assert "derivative" in names
        assert "moving_average" in names
        assert "as_rate" in names
        assert "as_count" in names
        assert "abs" in names
        assert "log" in names

    def test_all_have_docs(self):
        for fn in get_functions():
            assert fn.description, f"{fn.name} missing description"
            assert fn.example, f"{fn.name} missing example"
            assert fn.arity >= 0, f"{fn.name} has invalid arity"

    def test_moving_average_has_arity_1(self):
        funcs = get_functions()
        ma = next(f for f in funcs if f.name == "moving_average")
        assert ma.arity == 1

    def test_zero_arity_functions(self):
        funcs = get_functions()
        for fn in funcs:
            if fn.name != "moving_average":
                assert fn.arity == 0, f"{fn.name} should have arity 0"
