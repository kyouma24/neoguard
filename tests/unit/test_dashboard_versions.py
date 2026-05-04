import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from neoguard.services.dashboard_versions import (
    save_version,
    list_versions,
    get_version,
    count_versions,
    _row_to_version,
)


def _make_row(overrides=None):
    base = {
        "id": "ver-1",
        "dashboard_id": "dash-1",
        "version_number": 1,
        "data": '{"name": "Test Dashboard", "panels": []}',
        "change_summary": "Auto-saved before update",
        "created_by": "user-1",
        "created_at": datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
    }
    if overrides:
        base.update(overrides)
    return base


def _mock_pool_with_conn():
    conn = MagicMock()
    conn.fetchrow = AsyncMock()
    conn.fetch = AsyncMock()
    conn.fetchval = AsyncMock()
    conn.execute = AsyncMock()
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)
    return pool, conn


class TestSaveVersion:
    @pytest.mark.asyncio
    async def test_saves_version_with_atomic_insert(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row({"version_number": 4})

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await save_version(
                dashboard_id="dash-1",
                data={"name": "Test", "panels": []},
                user_id="user-1",
                change_summary="Manual save",
            )

        assert result.version_number == 4
        conn.fetchrow.assert_called_once()
        sql = conn.fetchrow.call_args[0][0]
        assert "INSERT INTO dashboard_versions" in sql
        assert "COALESCE((SELECT MAX(version_number)" in sql

    @pytest.mark.asyncio
    async def test_first_version_is_1(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row({"version_number": 1})

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await save_version(
                dashboard_id="dash-1",
                data={"name": "New"},
                user_id="user-1",
            )

        assert result.version_number == 1
        sql = conn.fetchrow.call_args[0][0]
        assert "COALESCE" in sql
        assert "+ 1" in sql

    @pytest.mark.asyncio
    async def test_stores_data_as_json(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row()

        data = {"name": "Dashboard", "panels": [{"id": "p1"}]}
        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            await save_version(dashboard_id="dash-1", data=data, user_id="user-1")

        args = conn.fetchrow.call_args[0]
        # $3 is data_json in the atomic INSERT ($1=id, $2=dashboard_id, $3=data, $4=summary, $5=user)
        assert '"panels"' in args[3]

    @pytest.mark.asyncio
    async def test_stores_change_summary(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row({"version_number": 6, "change_summary": "Before restore"})

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await save_version(
                dashboard_id="dash-1",
                data={},
                user_id="user-1",
                change_summary="Before restore",
            )

        assert result.change_summary == "Before restore"

    @pytest.mark.asyncio
    async def test_generates_ulid_id(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row()

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            await save_version(dashboard_id="dash-1", data={}, user_id="user-1")

        args = conn.fetchrow.call_args[0]
        assert len(args[1]) == 26  # ULID string length


class TestListVersions:
    @pytest.mark.asyncio
    async def test_returns_versions_ordered_desc(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = [
            _make_row({"version_number": 3}),
            _make_row({"version_number": 2}),
            _make_row({"version_number": 1}),
        ]

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await list_versions("dash-1")

        assert len(result) == 3
        assert result[0].version_number == 3
        sql = conn.fetch.call_args[0][0]
        assert "ORDER BY version_number DESC" in sql

    @pytest.mark.asyncio
    async def test_applies_limit_and_offset(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            await list_versions("dash-1", limit=10, offset=5)

        args = conn.fetch.call_args[0]
        assert args[2] == 10  # limit
        assert args[3] == 5   # offset

    @pytest.mark.asyncio
    async def test_filters_by_dashboard_id(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            await list_versions("dash-42")

        args = conn.fetch.call_args[0]
        assert args[1] == "dash-42"

    @pytest.mark.asyncio
    async def test_empty_list(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await list_versions("dash-1")

        assert result == []


class TestGetVersion:
    @pytest.mark.asyncio
    async def test_returns_version_by_number(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_row({"version_number": 2})

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await get_version("dash-1", 2)

        assert result is not None
        assert result.version_number == 2
        args = conn.fetchrow.call_args[0]
        assert args[1] == "dash-1"
        assert args[2] == 2

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = None

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await get_version("dash-1", 999)

        assert result is None

    @pytest.mark.asyncio
    async def test_queries_by_dashboard_and_version(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = None

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            await get_version("dash-abc", 5)

        sql = conn.fetchrow.call_args[0][0]
        assert "dashboard_id = $1" in sql
        assert "version_number = $2" in sql


class TestCountVersions:
    @pytest.mark.asyncio
    async def test_returns_count(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchval.return_value = 7

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await count_versions("dash-1")

        assert result == 7

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_versions(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchval.return_value = 0

        with patch("neoguard.services.dashboard_versions.get_pool", AsyncMock(return_value=pool)):
            result = await count_versions("dash-1")

        assert result == 0


class TestRowToVersion:
    def test_parses_json_string_data(self):
        row = _make_row({"data": '{"name": "Test", "panels": [{"id": "p1"}]}'})
        result = _row_to_version(row)
        assert result.data == {"name": "Test", "panels": [{"id": "p1"}]}

    def test_parses_dict_data(self):
        row = _make_row({"data": {"name": "Already parsed"}})
        result = _row_to_version(row)
        assert result.data == {"name": "Already parsed"}

    def test_all_fields_mapped(self):
        row = _make_row()
        result = _row_to_version(row)
        assert result.id == "ver-1"
        assert result.dashboard_id == "dash-1"
        assert result.version_number == 1
        assert result.change_summary == "Auto-saved before update"
        assert result.created_by == "user-1"
        assert isinstance(result.created_at, datetime)
