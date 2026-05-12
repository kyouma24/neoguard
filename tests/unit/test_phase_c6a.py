"""Phase C6a: Frontend + backend refinement tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: FE2-007 (backend since param), FE2-008 (useMemo), FE2-009 (aria-label), FE2-011 (timeout).
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from neoguard.models.alerts import AlertStatus


# ===========================================================================
# FE2-007 (backend): list_alert_events must support `since` parameter
# ===========================================================================


class _FakeAcquireCtx:
    """Mimics asyncpg pool.acquire() which returns an async context manager."""

    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *args):
        pass


def _mock_pool_with_conn(mock_conn):
    """Create a mock pool that supports `async with pool.acquire() as conn:`."""
    from unittest.mock import MagicMock
    mock_pool = MagicMock()
    mock_pool.acquire.return_value = _FakeAcquireCtx(mock_conn)
    return mock_pool


class TestFE2007BackendSinceParam:
    """FE2-007: /api/v1/alerts/events must accept `since` query param for incremental fetch."""

    @pytest.mark.asyncio
    async def test_list_alert_events_accepts_since_param(self):
        """Service function must accept since kwarg without error."""
        from neoguard.services.alerts.crud import list_alert_events

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.alerts.crud.get_pool", AsyncMock(return_value=mock_pool)):
            since_time = datetime(2026, 5, 12, 10, 0, 0, tzinfo=timezone.utc)
            result = await list_alert_events("t1", since=since_time)
            assert result == []

            query = mock_conn.fetch.call_args[0][0]
            assert "fired_at >" in query

    @pytest.mark.asyncio
    async def test_since_param_uses_strict_greater_than(self):
        """since must use `>` not `>=` to avoid re-fetching the boundary event."""
        from neoguard.services.alerts.crud import list_alert_events

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.alerts.crud.get_pool", AsyncMock(return_value=mock_pool)):
            since_time = datetime(2026, 5, 12, 10, 0, 0, tzinfo=timezone.utc)
            await list_alert_events("t1", since=since_time)

            query = mock_conn.fetch.call_args[0][0]
            assert "fired_at > $" in query

    @pytest.mark.asyncio
    async def test_since_param_in_route(self):
        """The /events route must accept since as a query parameter."""
        import inspect
        from neoguard.api.routes.alerts import list_events

        sig = inspect.signature(list_events)
        assert "since" in sig.parameters
        param = sig.parameters["since"]
        assert param.default is None

    @pytest.mark.asyncio
    async def test_since_none_returns_all(self):
        """When since is None, query has no fired_at > filter."""
        from neoguard.services.alerts.crud import list_alert_events

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = _mock_pool_with_conn(mock_conn)

        with patch("neoguard.services.alerts.crud.get_pool", AsyncMock(return_value=mock_pool)):
            await list_alert_events("t1", since=None)

            query = mock_conn.fetch.call_args[0][0]
            assert "fired_at > $" not in query


# ===========================================================================
# FE2-008: filteredEvents must use useMemo (source inspection)
# ===========================================================================


class TestFE2008UseMemo:
    """FE2-008: filteredEvents in AlertsPage must be memoized."""

    def test_alerts_page_imports_usememo(self):
        """AlertsPage.tsx must import useMemo from React."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/pages/AlertsPage.tsx"
        ).read_text(encoding="utf-8")
        assert "useMemo" in source

    def test_filtered_events_wrapped_in_usememo(self):
        """filteredEvents assignment must use useMemo, not raw .filter()."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/pages/AlertsPage.tsx"
        ).read_text(encoding="utf-8")
        import re
        pattern = r"const\s+filteredEvents\s*=\s*useMemo"
        assert re.search(pattern, source), (
            "filteredEvents must be wrapped in useMemo(() => ..., [deps])"
        )


# ===========================================================================
# FE2-009: LogFacetsSidebar must use aria-label, not title
# ===========================================================================


class TestFE2009AriaLabel:
    """FE2-009: Facet values must use aria-label for accessibility."""

    def test_facet_include_uses_aria_label(self):
        """Include span must use aria-label, not title."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/components/LogFacetsSidebar.tsx"
        ).read_text(encoding="utf-8")
        assert 'aria-label={`Include' in source
        assert 'title={`Include' not in source

    def test_facet_exclude_uses_aria_label(self):
        """Exclude button must use aria-label, not title."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/components/LogFacetsSidebar.tsx"
        ).read_text(encoding="utf-8")
        assert 'aria-label={`Exclude' in source
        assert 'title={`Exclude' not in source


# ===========================================================================
# FE2-011: request() must have AbortController timeout
# ===========================================================================


class TestFE2011AbortControllerTimeout:
    """FE2-011: api.ts request() must use AbortController with 30s timeout."""

    def test_request_has_abort_controller(self):
        """request() function must create an AbortController."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/services/api.ts"
        ).read_text(encoding="utf-8")
        assert "AbortController" in source
        assert "REQUEST_TIMEOUT_MS" in source

    def test_timeout_is_30_seconds(self):
        """Timeout must be 30 seconds (30_000ms)."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/services/api.ts"
        ).read_text(encoding="utf-8")
        assert "30_000" in source or "30000" in source

    def test_timeout_cleared_after_response(self):
        """clearTimeout must be called to avoid timer leak."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/services/api.ts"
        ).read_text(encoding="utf-8")
        assert "clearTimeout" in source

    def test_streaming_endpoint_not_affected(self):
        """The batch/stream endpoint must NOT use the timeout (it has its own signal)."""
        import pathlib
        source = pathlib.Path(
            "frontend/src/services/api.ts"
        ).read_text(encoding="utf-8")
        import re
        stream_section = source[source.index("batch/stream"):]
        stream_fetch_end = stream_section[:500]
        assert "REQUEST_TIMEOUT_MS" not in stream_fetch_end, (
            "Streaming fetch must not use the request timeout"
        )
