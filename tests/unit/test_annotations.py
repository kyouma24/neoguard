"""Unit tests for annotation service (no DB required)."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.annotations import Annotation, AnnotationCreate, AnnotationUpdate
from neoguard.services.annotations import (
    create_annotation,
    delete_annotation,
    get_annotation,
    list_annotations,
    update_annotation,
)

TENANT_ID = "t-001"
USER_ID = "u-001"
ANN_ID = "ann-001"
NOW = datetime(2026, 5, 2, 12, 0, 0, tzinfo=UTC)


def _mock_pool_with_conn(mock_conn: AsyncMock | None = None) -> MagicMock:
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_pool = MagicMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    return mock_pool


def _make_row(
    ann_id: str = ANN_ID,
    tenant_id: str = TENANT_ID,
    dashboard_id: str | None = None,
    title: str = "Deploy v2.3",
    text: str = "Rolling update",
    tags: str = '["deploy"]',
    starts_at: datetime = NOW,
    ends_at: datetime | None = None,
    created_by: str = USER_ID,
    created_at: datetime = NOW,
) -> dict:
    return {
        "id": ann_id,
        "tenant_id": tenant_id,
        "dashboard_id": dashboard_id,
        "title": title,
        "text": text,
        "tags": tags,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "created_by": created_by,
        "created_at": created_at,
    }


class TestCreateAnnotation:
    async def test_inserts_and_returns_annotation(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row()
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationCreate(
            title="Deploy v2.3",
            text="Rolling update",
            tags=["deploy"],
            starts_at=NOW,
        )

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await create_annotation(TENANT_ID, USER_ID, data)

        assert isinstance(result, Annotation)
        assert result.title == "Deploy v2.3"
        assert result.tags == ["deploy"]
        assert result.tenant_id == TENANT_ID
        mock_conn.fetchrow.assert_awaited_once()
        sql = mock_conn.fetchrow.call_args[0][0]
        assert "INSERT INTO annotations" in sql

    async def test_passes_dashboard_id(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(dashboard_id="dash-1")
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationCreate(
            dashboard_id="dash-1",
            title="Deploy",
            starts_at=NOW,
        )

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await create_annotation(TENANT_ID, USER_ID, data)

        assert result.dashboard_id == "dash-1"

    async def test_handles_range_annotation(self):
        end = NOW + timedelta(hours=1)
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(ends_at=end)
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationCreate(
            title="Incident",
            starts_at=NOW,
            ends_at=end,
        )

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await create_annotation(TENANT_ID, USER_ID, data)

        assert result.ends_at == end

    async def test_empty_tags_serialized(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags="[]")
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationCreate(title="Test", starts_at=NOW)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await create_annotation(TENANT_ID, USER_ID, data)

        assert result.tags == []

    async def test_generates_uuid7_id(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row()
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationCreate(title="Test", starts_at=NOW)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await create_annotation(TENANT_ID, USER_ID, data)

        args = mock_conn.fetchrow.call_args[0]
        ann_id = args[1]
        assert isinstance(ann_id, str)
        assert len(ann_id) == 36


class TestListAnnotations:
    async def test_returns_all_for_tenant(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [_make_row(), _make_row(ann_id="ann-002", title="Second")]
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await list_annotations(TENANT_ID)

        assert len(result) == 2
        assert all(isinstance(a, Annotation) for a in result)
        sql = mock_conn.fetch.call_args[0][0]
        assert "tenant_id = $1" in sql

    async def test_service_omits_tenant_filter_when_none(self):
        """Service layer handles tenant_id=None (no WHERE tenant_id).

        Routes use get_query_tenant_id which never passes None to services,
        but the service supports it for internal/background callers.
        """
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [_make_row()]
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await list_annotations(None)

        assert len(result) == 1
        sql = mock_conn.fetch.call_args[0][0]
        assert "tenant_id" not in sql

    async def test_filters_by_dashboard_id(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await list_annotations(TENANT_ID, dashboard_id="dash-1")

        sql = mock_conn.fetch.call_args[0][0]
        assert "dashboard_id" in sql

    async def test_filters_by_time_range(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        from_time = NOW - timedelta(hours=1)
        to_time = NOW

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await list_annotations(TENANT_ID, from_time=from_time, to_time=to_time)

        sql = mock_conn.fetch.call_args[0][0]
        assert "starts_at" in sql
        assert "ends_at" in sql

    async def test_respects_limit(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await list_annotations(TENANT_ID, limit=50)

        sql = mock_conn.fetch.call_args[0][0]
        assert "LIMIT $" in sql
        args = mock_conn.fetch.call_args[0]
        assert 50 in args

    async def test_empty_result(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await list_annotations(TENANT_ID)

        assert result == []

    async def test_combined_filters(self):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await list_annotations(
                TENANT_ID,
                dashboard_id="dash-1",
                from_time=NOW - timedelta(hours=1),
                to_time=NOW,
                limit=100,
            )

        sql = mock_conn.fetch.call_args[0][0]
        assert "tenant_id = $1" in sql
        assert "dashboard_id" in sql
        assert "LIMIT $" in sql
        args = mock_conn.fetch.call_args[0]
        assert args[1] == TENANT_ID
        assert args[2] == "dash-1"
        assert 100 in args


class TestGetAnnotation:
    async def test_returns_annotation_with_tenant(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row()
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, ANN_ID)

        assert result is not None
        assert result.id == ANN_ID
        sql = mock_conn.fetchrow.call_args[0][0]
        assert "tenant_id = $2" in sql

    async def test_returns_none_when_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, "nonexistent")

        assert result is None

    async def test_service_omits_tenant_filter_when_none(self):
        """Service layer handles tenant_id=None for get_annotation.

        Routes enforce tenant context; this tests service-level None handling
        for internal callers (alert engine, background jobs).
        """
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row()
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(None, ANN_ID)

        assert result is not None
        sql = mock_conn.fetchrow.call_args[0][0]
        assert "tenant_id" not in sql

    async def test_parses_tags_from_string(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags='["deploy", "prod"]')
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, ANN_ID)

        assert result.tags == ["deploy", "prod"]

    async def test_parses_tags_from_list(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags=["deploy", "prod"])
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, ANN_ID)

        assert result.tags == ["deploy", "prod"]


class TestUpdateAnnotation:
    async def test_updates_title(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(title="Updated Title")
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationUpdate(title="Updated Title")

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await update_annotation(TENANT_ID, ANN_ID, data)

        assert result is not None
        assert result.title == "Updated Title"
        sql = mock_conn.fetchrow.call_args[0][0]
        assert "UPDATE annotations SET" in sql
        assert "WHERE id = $1 AND tenant_id = $2" in sql

    async def test_updates_tags(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags='["new-tag"]')
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationUpdate(tags=["new-tag"])

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await update_annotation(TENANT_ID, ANN_ID, data)

        assert result.tags == ["new-tag"]

    async def test_returns_none_when_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationUpdate(title="X")

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await update_annotation(TENANT_ID, ANN_ID, data)

        assert result is None

    async def test_no_changes_returns_existing(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row()
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationUpdate()

        with (
            patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)),
            patch("neoguard.services.annotations.get_annotation", AsyncMock(return_value=Annotation(
                id=ANN_ID, tenant_id=TENANT_ID, title="Deploy v2.3", text="Rolling update",
                tags=["deploy"], starts_at=NOW, created_by=USER_ID, created_at=NOW,
            ))) as mock_get,
        ):
            result = await update_annotation(TENANT_ID, ANN_ID, data)

        assert result is not None
        mock_get.assert_awaited_once_with(TENANT_ID, ANN_ID)

    async def test_updates_multiple_fields(self):
        end = NOW + timedelta(hours=2)
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(title="New", text="Updated", ends_at=end)
        mock_pool = _mock_pool_with_conn(mock_conn)

        data = AnnotationUpdate(title="New", text="Updated", ends_at=end)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await update_annotation(TENANT_ID, ANN_ID, data)

        assert result.title == "New"
        assert result.text == "Updated"
        assert result.ends_at == end


class TestDeleteAnnotation:
    async def test_returns_true_on_success(self):
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = "DELETE 1"
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await delete_annotation(TENANT_ID, ANN_ID)

        assert result is True
        sql = mock_conn.execute.call_args[0][0]
        assert "DELETE FROM annotations" in sql
        assert "tenant_id = $2" in sql

    async def test_returns_false_when_not_found(self):
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = "DELETE 0"
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await delete_annotation(TENANT_ID, "nonexistent")

        assert result is False

    async def test_scoped_to_tenant(self):
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = "DELETE 1"
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            await delete_annotation(TENANT_ID, ANN_ID)

        args = mock_conn.execute.call_args[0]
        assert args[1] == ANN_ID
        assert args[2] == TENANT_ID


class TestRowToAnnotation:
    async def test_handles_null_tags(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags=None)
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, ANN_ID)

        assert result.tags == []

    async def test_handles_empty_string_tags(self):
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = _make_row(tags="")
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.annotations.get_pool", AsyncMock(return_value=mock_pool)):
            result = await get_annotation(TENANT_ID, ANN_ID)

        assert result.tags == []
