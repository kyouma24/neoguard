import pytest
from pydantic import ValidationError

from neoguard.models.dashboards import (
    DashboardCreate,
    DashboardLink,
    DashboardVariable,
    PanelDefinition,
    PanelGroup,
)
from neoguard.models.annotations import AnnotationCreate, AnnotationUpdate


class TestDashboardLinkSchemeValidation:
    def test_rejects_javascript_uri(self):
        with pytest.raises(ValidationError, match="javascript:"):
            DashboardLink(label="xss", url="javascript:alert(1)")

    def test_rejects_javascript_uri_case_insensitive(self):
        with pytest.raises(ValidationError, match="javascript:"):
            DashboardLink(label="xss", url="JAVASCRIPT:alert(1)")

    def test_rejects_javascript_uri_with_whitespace(self):
        with pytest.raises(ValidationError, match="javascript:"):
            DashboardLink(label="xss", url="  javascript:alert(1)")

    def test_rejects_data_uri(self):
        with pytest.raises(ValidationError, match="data:"):
            DashboardLink(label="xss", url="data:text/html,<script>alert(1)</script>")

    def test_rejects_vbscript_uri(self):
        with pytest.raises(ValidationError, match="vbscript:"):
            DashboardLink(label="xss", url="vbscript:MsgBox")

    def test_allows_https(self):
        link = DashboardLink(label="safe", url="https://example.com")
        assert link.url == "https://example.com"

    def test_allows_http(self):
        link = DashboardLink(label="safe", url="http://example.com")
        assert link.url == "http://example.com"

    def test_allows_relative_path(self):
        link = DashboardLink(label="safe", url="/dashboards/abc")
        assert link.url == "/dashboards/abc"

    def test_allows_mailto(self):
        link = DashboardLink(label="email", url="mailto:user@example.com")
        assert link.url == "mailto:user@example.com"


class TestDashboardCreateMaxItems:
    def test_panels_max_50(self):
        panels = [
            PanelDefinition(
                id=f"p{i}",
                title=f"Panel {i}",
                panel_type="stat",
                width=3,
                height=3,
                position_x=0,
                position_y=0,
            )
            for i in range(51)
        ]
        with pytest.raises(ValidationError, match="should have at most 50"):
            DashboardCreate(name="test", panels=panels)

    def test_panels_at_50_ok(self):
        panels = [
            PanelDefinition(
                id=f"p{i}",
                title=f"Panel {i}",
                panel_type="stat",
                width=3,
                height=3,
                position_x=0,
                position_y=0,
            )
            for i in range(50)
        ]
        d = DashboardCreate(name="test", panels=panels)
        assert len(d.panels) == 50

    def test_variables_max_20(self):
        variables = [
            DashboardVariable(name=f"var{i}", type="custom")
            for i in range(21)
        ]
        with pytest.raises(ValidationError, match="should have at most 20"):
            DashboardCreate(name="test", variables=variables)

    def test_groups_max_20(self):
        groups = [
            PanelGroup(id=f"g{i}", label=f"Group {i}")
            for i in range(21)
        ]
        with pytest.raises(ValidationError, match="should have at most 20"):
            DashboardCreate(name="test", groups=groups)

    def test_tags_max_20(self):
        with pytest.raises(ValidationError, match="should have at most 20"):
            DashboardCreate(name="test", tags=[f"tag{i}" for i in range(21)])

    def test_links_max_20(self):
        links = [
            DashboardLink(label=f"Link {i}", url=f"https://example.com/{i}")
            for i in range(21)
        ]
        with pytest.raises(ValidationError, match="should have at most 20"):
            DashboardCreate(name="test", links=links)

    def test_description_max_4096(self):
        with pytest.raises(ValidationError):
            DashboardCreate(name="test", description="x" * 4097)


class TestAnnotationMaxLength:
    def test_text_max_4096(self):
        from datetime import datetime, timezone

        with pytest.raises(ValidationError):
            AnnotationCreate(
                title="test",
                text="x" * 4097,
                starts_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
            )

    def test_text_at_4096_ok(self):
        from datetime import datetime, timezone

        a = AnnotationCreate(
            title="test",
            text="x" * 4096,
            starts_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
        )
        assert len(a.text) == 4096

    def test_tags_max_20(self):
        from datetime import datetime, timezone

        with pytest.raises(ValidationError, match="should have at most 20"):
            AnnotationCreate(
                title="test",
                tags=[f"tag{i}" for i in range(21)],
                starts_at=datetime(2026, 5, 1, tzinfo=timezone.utc),
            )

    def test_update_text_max_4096(self):
        with pytest.raises(ValidationError):
            AnnotationUpdate(text="x" * 4097)

    def test_update_tags_max_20(self):
        with pytest.raises(ValidationError, match="should have at most 20"):
            AnnotationUpdate(tags=[f"tag{i}" for i in range(21)])


class TestSearchWildcardEscaping:
    @pytest.mark.asyncio
    async def test_escapes_percent_in_search(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        conn = MagicMock()
        conn.fetch = AsyncMock(return_value=[])
        pool = MagicMock()
        pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
        pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.dashboards import list_dashboards

            await list_dashboards("tenant-1", search="%_")

        args = conn.fetch.call_args[0]
        search_param = args[2]
        assert "\\%" in search_param
        assert "\\_" in search_param

    @pytest.mark.asyncio
    async def test_escapes_underscore_in_search(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        conn = MagicMock()
        conn.fetch = AsyncMock(return_value=[])
        pool = MagicMock()
        pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
        pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.dashboards import list_dashboards

            await list_dashboards("tenant-1", search="_x")

        args = conn.fetch.call_args[0]
        search_param = args[2]
        assert "\\_" in search_param

    @pytest.mark.asyncio
    async def test_normal_search_uses_fts(self):
        from unittest.mock import AsyncMock, MagicMock, patch

        conn = MagicMock()
        conn.fetch = AsyncMock(return_value=[])
        pool = MagicMock()
        pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
        pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.dashboards.get_pool", AsyncMock(return_value=pool)):
            from neoguard.services.dashboards import list_dashboards

            await list_dashboards("tenant-1", search="CPU Dashboard")

        args = conn.fetch.call_args[0]
        # Plain text search now uses FTS — search term passed directly
        sql = args[0]
        assert "search_vector @@ plainto_tsquery" in sql
        search_param = args[2]
        assert search_param == "CPU Dashboard"
