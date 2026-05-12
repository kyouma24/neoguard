"""Unit tests for dashboard extension functions: record_view, toggle_favorite,
list_favorites, FTS search in list_dashboards, layout_version handling,
and new Pydantic models (DashboardTag, DashboardView, DashboardFavorite)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.dashboards import (
    Dashboard,
    DashboardCreate,
    DashboardFavorite,
    DashboardTag,
    DashboardUpdate,
    DashboardView,
)
from neoguard.services.dashboards import (
    create_dashboard,
    list_dashboards,
    list_favorites,
    toggle_favorite,
    _row_to_dashboard,
)


TENANT_ID = "tenant-abc"
USER_ID = "user-123"
DASH_ID = "dash-001"


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


def _make_dashboard_row(overrides=None):
    base = {
        "id": DASH_ID,
        "tenant_id": TENANT_ID,
        "name": "Test Dashboard",
        "description": "A test dashboard",
        "panels": "[]",
        "variables": "[]",
        "groups": "[]",
        "tags": "[]",
        "links": "[]",
        "layout_version": 1,
        "created_at": datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
    }
    if overrides:
        base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Pydantic model tests
# ---------------------------------------------------------------------------


class TestDashboardTagModel:
    def test_create_tag(self):
        tag = DashboardTag(tenant_id=TENANT_ID, dashboard_id=DASH_ID, tag="production")
        assert tag.tenant_id == TENANT_ID
        assert tag.dashboard_id == DASH_ID
        assert tag.tag == "production"

    def test_serialization_roundtrip(self):
        tag = DashboardTag(tenant_id=TENANT_ID, dashboard_id=DASH_ID, tag="env:prod")
        data = tag.model_dump()
        assert data == {"tenant_id": TENANT_ID, "dashboard_id": DASH_ID, "tag": "env:prod"}
        restored = DashboardTag(**data)
        assert restored == tag


class TestDashboardViewModel:
    def test_create_view(self):
        now = datetime(2026, 5, 2, 10, 0, tzinfo=timezone.utc)
        view = DashboardView(
            id=1, tenant_id=TENANT_ID, dashboard_id=DASH_ID,
            user_id=USER_ID, viewed_at=now,
        )
        assert view.id == 1
        assert view.dashboard_id == DASH_ID
        assert view.user_id == USER_ID
        assert view.viewed_at == now

    def test_serialization_roundtrip(self):
        now = datetime(2026, 5, 2, 10, 0, tzinfo=timezone.utc)
        view = DashboardView(
            id=42, tenant_id=TENANT_ID, dashboard_id=DASH_ID,
            user_id=USER_ID, viewed_at=now,
        )
        data = view.model_dump()
        assert data["id"] == 42
        restored = DashboardView(**data)
        assert restored == view


class TestDashboardFavoriteModel:
    def test_create_favorite(self):
        now = datetime(2026, 5, 2, 10, 0, tzinfo=timezone.utc)
        fav = DashboardFavorite(
            tenant_id=TENANT_ID, user_id=USER_ID,
            dashboard_id=DASH_ID, favorited_at=now,
        )
        assert fav.tenant_id == TENANT_ID
        assert fav.user_id == USER_ID
        assert fav.dashboard_id == DASH_ID
        assert fav.favorited_at == now


# ---------------------------------------------------------------------------
# layout_version model tests
# ---------------------------------------------------------------------------


class TestLayoutVersionModels:
    def test_dashboard_create_default_layout_version(self):
        d = DashboardCreate(name="Test")
        assert d.layout_version == 1

    def test_dashboard_create_custom_layout_version(self):
        d = DashboardCreate(name="Test", layout_version=2)
        assert d.layout_version == 2

    def test_dashboard_create_rejects_zero_layout_version(self):
        with pytest.raises(Exception):
            DashboardCreate(name="Test", layout_version=0)

    def test_dashboard_create_rejects_negative_layout_version(self):
        with pytest.raises(Exception):
            DashboardCreate(name="Test", layout_version=-1)

    def test_dashboard_update_layout_version_optional(self):
        u = DashboardUpdate()
        assert u.layout_version is None

    def test_dashboard_update_layout_version_set(self):
        u = DashboardUpdate(layout_version=3)
        assert u.layout_version == 3

    def test_dashboard_response_layout_version_default(self):
        d = Dashboard(
            id="d1", tenant_id="t1", name="test", description="",
            panels=[],
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert d.layout_version == 1

    def test_dashboard_response_layout_version_custom(self):
        d = Dashboard(
            id="d1", tenant_id="t1", name="test", description="",
            panels=[], layout_version=5,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        assert d.layout_version == 5


# ---------------------------------------------------------------------------
# _row_to_dashboard layout_version
# ---------------------------------------------------------------------------


class TestRowToDashboardLayoutVersion:
    def test_includes_layout_version(self):
        row = _make_dashboard_row({"layout_version": 3})
        d = _row_to_dashboard(row)
        assert d.layout_version == 3

    def test_defaults_to_1_when_missing(self):
        row = _make_dashboard_row()
        del row["layout_version"]
        d = _row_to_dashboard(row)
        assert d.layout_version == 1


# ---------------------------------------------------------------------------
# create_dashboard with layout_version
# ---------------------------------------------------------------------------


class TestCreateDashboardLayoutVersion:
    @pytest.mark.asyncio
    async def test_passes_layout_version_to_insert(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_dashboard_row({"layout_version": 2})

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            data = DashboardCreate(name="New Dash", layout_version=2)
            result = await create_dashboard(TENANT_ID, data)

        assert result.layout_version == 2
        sql = conn.fetchrow.call_args[0][0]
        assert "layout_version" in sql
        # $10 should be layout_version
        args = conn.fetchrow.call_args[0]
        assert args[10] == 2

    @pytest.mark.asyncio
    async def test_default_layout_version_is_1(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = _make_dashboard_row()

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            data = DashboardCreate(name="Default Version")
            await create_dashboard(TENANT_ID, data)

        args = conn.fetchrow.call_args[0]
        assert args[10] == 1



# ---------------------------------------------------------------------------
# toggle_favorite
# ---------------------------------------------------------------------------


class TestToggleFavorite:
    @pytest.mark.asyncio
    async def test_adds_favorite_when_not_exists(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = None  # no existing favorite

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            result = await toggle_favorite(TENANT_ID, USER_ID, DASH_ID)

        assert result is True
        # Check INSERT was called with tenant_id
        insert_call = conn.execute.call_args
        sql = insert_call[0][0]
        assert "INSERT INTO dashboard_favorites" in sql
        assert "tenant_id" in sql
        assert insert_call[0][1] == TENANT_ID
        assert insert_call[0][2] == USER_ID
        assert insert_call[0][3] == DASH_ID

    @pytest.mark.asyncio
    async def test_removes_favorite_when_exists(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = {"exists": 1}  # existing favorite

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            result = await toggle_favorite(TENANT_ID, USER_ID, DASH_ID)

        assert result is False
        delete_call = conn.execute.call_args
        sql = delete_call[0][0]
        assert "DELETE FROM dashboard_favorites" in sql

    @pytest.mark.asyncio
    async def test_checks_tenant_isolation(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetchrow.return_value = None

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await toggle_favorite(TENANT_ID, USER_ID, DASH_ID)

        # The SELECT check should join dashboards for tenant isolation
        select_sql = conn.fetchrow.call_args[0][0]
        assert "d.tenant_id = $3" in select_sql
        assert conn.fetchrow.call_args[0][3] == TENANT_ID


# ---------------------------------------------------------------------------
# list_favorites
# ---------------------------------------------------------------------------


class TestListFavorites:
    @pytest.mark.asyncio
    async def test_returns_dashboard_ids(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = [
            {"dashboard_id": "dash-1"},
            {"dashboard_id": "dash-2"},
        ]

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            result = await list_favorites(TENANT_ID, USER_ID)

        assert result == ["dash-1", "dash-2"]

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_favorites(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            result = await list_favorites(TENANT_ID, USER_ID)

        assert result == []

    @pytest.mark.asyncio
    async def test_orders_by_favorited_at_desc(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_favorites(TENANT_ID, USER_ID)

        sql = conn.fetch.call_args[0][0]
        assert "ORDER BY df.favorited_at DESC" in sql

    @pytest.mark.asyncio
    async def test_joins_dashboards_for_tenant_isolation(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_favorites(TENANT_ID, USER_ID)

        sql = conn.fetch.call_args[0][0]
        assert "JOIN dashboards d ON d.id = df.dashboard_id" in sql
        assert "d.tenant_id = $2" in sql


# ---------------------------------------------------------------------------
# list_dashboards FTS search
# ---------------------------------------------------------------------------


class TestListDashboardsFTS:
    @pytest.mark.asyncio
    async def test_uses_fts_for_plain_text_search(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(TENANT_ID, search="CPU overview")

        sql = conn.fetch.call_args[0][0]
        assert "search_vector @@ plainto_tsquery" in sql
        assert "ILIKE" not in sql
        # search term passed directly (no % wrapping)
        params = conn.fetch.call_args[0]
        assert params[2] == "CPU overview"

    @pytest.mark.asyncio
    async def test_uses_fts_for_long_search_with_special_chars(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(TENANT_ID, search="100%_cpu")

        sql = conn.fetch.call_args[0][0]
        assert "search_vector" in sql
        assert "ILIKE" not in sql

    @pytest.mark.asyncio
    async def test_falls_back_to_ilike_for_short_search(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(TENANT_ID, search="ab")

        sql = conn.fetch.call_args[0][0]
        assert "ILIKE" in sql
        assert "search_vector" not in sql

    @pytest.mark.asyncio
    async def test_no_search_skips_both_fts_and_ilike(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(TENANT_ID)

        sql = conn.fetch.call_args[0][0]
        assert "search_vector" not in sql
        assert "ILIKE" not in sql

    @pytest.mark.asyncio
    async def test_fts_with_no_tenant(self):
        """Super admin: no tenant filter, FTS search only."""
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(None, search="overview")

        sql = conn.fetch.call_args[0][0]
        assert "search_vector @@ plainto_tsquery" in sql
        assert "tenant_id" not in sql
        # $1 should be the search term (no tenant param before it)
        params = conn.fetch.call_args[0]
        assert params[1] == "overview"

    @pytest.mark.asyncio
    async def test_fts_search_passes_english_config(self):
        pool, conn = _mock_pool_with_conn()
        conn.fetch.return_value = []

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            await list_dashboards(TENANT_ID, search="monitoring")

        sql = conn.fetch.call_args[0][0]
        assert "plainto_tsquery('english'" in sql
