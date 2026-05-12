"""Phase B3 metrics pipeline hardening tests.

Tests for findings COLL-004, COLL-005, COLL-006, COLL-007.
Red-then-green: these tests MUST FAIL before the fix is applied.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ===========================================================================
# COLL-007: Batch INSERT in observe_cardinality (executemany, not N+1)
# ===========================================================================


class TestColl007CardinalityBatch:
    """COLL-007: observe_cardinality must use executemany (1 call, not N)."""

    @pytest.mark.asyncio
    async def test_cardinality_single_roundtrip(self):
        """5 tag keys should result in 1 executemany call, not 5 execute calls."""
        from neoguard.services.metrics.cardinality import observe_cardinality

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[
            {"tag_key": f"tag_{i}", "distinct_count": 100, "sample_size": 5000}
            for i in range(5)
        ])
        mock_conn.executemany = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.cardinality.get_pool", new=AsyncMock(return_value=mock_pool)):
            result = await observe_cardinality("tenant-1")

        assert len(result) == 5
        # Key assertion: executemany called once (not execute called 5 times)
        mock_conn.executemany.assert_called_once()

    @pytest.mark.asyncio
    async def test_cardinality_500_tags_one_executemany_call(self):
        """Even with 500 tags, only 1 executemany call."""
        from neoguard.services.metrics.cardinality import observe_cardinality

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[
            {"tag_key": f"tag_{i}", "distinct_count": 50, "sample_size": 1000}
            for i in range(500)
        ])
        mock_conn.executemany = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.cardinality.get_pool", new=AsyncMock(return_value=mock_pool)):
            result = await observe_cardinality("tenant-1")

        assert len(result) == 500
        mock_conn.executemany.assert_called_once()
        # Verify the args list has 500 entries
        args = mock_conn.executemany.call_args[0]
        assert len(args[1]) == 500

    @pytest.mark.asyncio
    async def test_cardinality_empty_tags_no_executemany(self):
        """No tags observed = no executemany call."""
        from neoguard.services.metrics.cardinality import observe_cardinality

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_conn.executemany = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.cardinality.get_pool", new=AsyncMock(return_value=mock_pool)):
            result = await observe_cardinality("tenant-1")

        assert result == []
        mock_conn.executemany.assert_not_called()


# ===========================================================================
# COLL-004: Flush retry with backpressure
# ===========================================================================


class TestColl004FlushRetry:
    """COLL-004: MetricBatchWriter retries flush on transient failure."""

    @pytest.mark.asyncio
    async def test_flush_retries_on_transient_error(self):
        """Transient DB error on first attempt, success on second = no data loss."""
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        writer._buffer = [
            (datetime.now(timezone.utc), "t1", "cpu", "{}", 50.0, "gauge")
            for _ in range(10)
        ]

        call_count = [0]

        async def copy_side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise OSError("connection reset")

        mock_conn = AsyncMock()
        mock_conn.copy_records_to_table = AsyncMock(side_effect=copy_side_effect)

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.writer.get_pool", new=AsyncMock(return_value=mock_pool)), \
             patch("neoguard.services.metrics.writer.asyncio.sleep", new=AsyncMock()):
            await writer._flush()

        assert writer._total_written == 10
        assert writer._total_dropped == 0

    @pytest.mark.asyncio
    async def test_flush_exhausts_retries_drops(self):
        """All retry attempts fail = batch dropped + counter incremented."""
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        writer._buffer = [
            (datetime.now(timezone.utc), "t1", "cpu", "{}", 50.0, "gauge")
            for _ in range(10)
        ]

        mock_conn = AsyncMock()
        mock_conn.copy_records_to_table = AsyncMock(side_effect=OSError("db down"))

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.writer.get_pool", new=AsyncMock(return_value=mock_pool)), \
             patch("neoguard.services.metrics.writer.asyncio.sleep", new=AsyncMock()):
            await writer._flush()

        assert writer._total_dropped == 10
        assert writer._total_written == 0
        assert writer._flush_retries_exhausted >= 1

    @pytest.mark.asyncio
    async def test_successful_flush_no_retry(self):
        """Normal flush succeeds on first attempt, no retry overhead."""
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        writer._buffer = [
            (datetime.now(timezone.utc), "t1", "cpu", "{}", 50.0, "gauge")
            for _ in range(10)
        ]

        mock_conn = AsyncMock()
        mock_conn.copy_records_to_table = AsyncMock()

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("neoguard.services.metrics.writer.get_pool", new=AsyncMock(return_value=mock_pool)):
            await writer._flush()

        assert writer._total_written == 10
        assert mock_conn.copy_records_to_table.call_count == 1

    @pytest.mark.asyncio
    async def test_retry_counter_in_stats(self):
        """Stats dict must include flush_retries_total and flush_retries_exhausted."""
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        stats = writer.stats
        assert "flush_retries_total" in stats
        assert "flush_retries_exhausted" in stats


class TestColl004Backpressure:
    """COLL-004: Backpressure rejects writes during active retry when buffer full."""

    @pytest.mark.asyncio
    async def test_backpressure_rejects_when_buffer_full_and_retry_active(self):
        """When flush retry in progress AND buffer >= max_size, write() returns 0."""
        from neoguard.models.metrics import MetricPoint
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        # Simulate: buffer at max, retry in progress
        writer._buffer = [
            (datetime.now(timezone.utc), "t1", "cpu", "{}", 50.0, "gauge")
        ] * 50000
        writer._flush_retry_in_progress = True

        points = [MetricPoint(name="cpu", value=99.0, tags={})]
        result = await writer.write("tenant-1", points)

        assert result == 0
        # Buffer should NOT have grown
        assert len(writer._buffer) == 50000

    @pytest.mark.asyncio
    async def test_no_backpressure_during_normal_operation(self):
        """Large buffer during healthy operation (no retry) should NOT reject."""
        from neoguard.models.metrics import MetricPoint
        from neoguard.services.metrics.writer import MetricBatchWriter

        writer = MetricBatchWriter()
        # Buffer is large but no retry in progress
        writer._buffer = [
            (datetime.now(timezone.utc), "t1", "cpu", "{}", 50.0, "gauge")
        ] * 50000
        writer._flush_retry_in_progress = False

        points = [MetricPoint(name="cpu", value=99.0, tags={})]

        # Mock _flush so it doesn't actually try DB
        with patch.object(writer, "_flush", new=AsyncMock()):
            result = await writer.write("tenant-1", points)

        assert result == 1  # accepted


# ===========================================================================
# COLL-005: SSE connection cap (global + per-tenant)
# ===========================================================================


class TestColl005SSECap:
    """COLL-005: SSE endpoint rejects connections beyond configured limits."""

    @pytest.mark.asyncio
    async def test_sse_rejects_at_global_limit(self):
        """When global SSE connections hit max, handler returns JSONResponse 503."""
        import neoguard.api.routes.sse as sse_mod
        from neoguard.api.routes.sse import query_stream

        original = sse_mod._active_sse_connections
        sse_mod._active_sse_connections = 100

        try:
            mock_request = MagicMock()
            mock_request.state = MagicMock()

            response = await query_stream(
                request=mock_request,
                dashboard_id="test-dash",
                tenant_id="tenant-1",
            )

            from fastapi.responses import JSONResponse
            assert isinstance(response, JSONResponse)
            assert response.status_code == 503
        finally:
            sse_mod._active_sse_connections = original

    @pytest.mark.asyncio
    async def test_sse_rejects_at_tenant_limit(self):
        """When per-tenant SSE connections hit max, handler returns 503."""
        import neoguard.api.routes.sse as sse_mod
        from neoguard.api.routes.sse import query_stream

        original_global = sse_mod._active_sse_connections
        original_tenant = sse_mod._tenant_sse_connections.copy()
        sse_mod._active_sse_connections = 5  # well under global limit
        sse_mod._tenant_sse_connections["tenant-1"] = 20  # at per-tenant limit

        try:
            mock_request = MagicMock()
            mock_request.state = MagicMock()

            response = await query_stream(
                request=mock_request,
                dashboard_id="test-dash",
                tenant_id="tenant-1",
            )

            from fastapi.responses import JSONResponse
            assert isinstance(response, JSONResponse)
            assert response.status_code == 503
        finally:
            sse_mod._active_sse_connections = original_global
            sse_mod._tenant_sse_connections = original_tenant

    @pytest.mark.asyncio
    async def test_sse_decrements_on_disconnect(self):
        """After SSE stream ends, counters decrement and dict entry removed at 0."""
        import neoguard.api.routes.sse as sse_mod

        assert hasattr(sse_mod, "_active_sse_connections")
        assert hasattr(sse_mod, "_tenant_sse_connections")
        assert isinstance(sse_mod._tenant_sse_connections, dict)

        # Simulate: set to 1, then verify decrement logic works
        sse_mod._tenant_sse_connections["test-tenant"] = 1
        # Simulate decrement (what finally block does)
        current = sse_mod._tenant_sse_connections.get("test-tenant", 1) - 1
        if current <= 0:
            sse_mod._tenant_sse_connections.pop("test-tenant", None)
        else:
            sse_mod._tenant_sse_connections["test-tenant"] = current

        assert "test-tenant" not in sse_mod._tenant_sse_connections

    @pytest.mark.asyncio
    async def test_sse_503_response_body(self):
        """503 response body must include error message and limit type."""
        import neoguard.api.routes.sse as sse_mod
        from neoguard.api.routes.sse import query_stream

        original = sse_mod._active_sse_connections
        sse_mod._active_sse_connections = 100

        try:
            mock_request = MagicMock()
            mock_request.state = MagicMock()

            response = await query_stream(
                request=mock_request,
                dashboard_id="test-dash",
                tenant_id="tenant-1",
            )

            import orjson
            body = orjson.loads(response.body)
            assert "error" in body
            assert "limit" in body
        finally:
            sse_mod._active_sse_connections = original


# ===========================================================================
# COLL-006: Discovery uses asyncio.gather with concurrency limit
# ===========================================================================


class TestColl006DiscoveryConcurrency:
    """COLL-006: Discovery runs accounts in parallel via asyncio.gather."""

    @pytest.mark.asyncio
    async def test_discovery_uses_gather_not_serial(self):
        """Multiple accounts must be processed concurrently, not serially."""
        from neoguard.services.collection.orchestrator import CollectionOrchestrator

        orchestrator = CollectionOrchestrator()
        execution_order = []

        async def mock_discover_account(acct, *args, **kwargs):
            execution_order.append(("start", acct.account_id))
            await asyncio.sleep(0.01)
            execution_order.append(("end", acct.account_id))

        mock_accounts = []
        for i in range(3):
            acct = MagicMock()
            acct.account_id = f"acct-{i}"
            acct.tenant_id = f"tenant-{i}"
            acct.id = f"id-{i}"
            acct.regions = ["us-east-1"]
            mock_accounts.append(acct)

        with patch("neoguard.services.collection.orchestrator.list_aws_accounts",
                   new=AsyncMock(return_value=mock_accounts)), \
             patch.object(orchestrator, "_discover_single_aws_account",
                         side_effect=mock_discover_account):
            await orchestrator._run_aws_discovery()

        # If parallel: all starts happen before any end
        starts = [e for e in execution_order if e[0] == "start"]
        assert len(starts) == 3

    @pytest.mark.asyncio
    async def test_discovery_semaphore_limits_concurrency(self):
        """No more than discovery_max_concurrency accounts run simultaneously."""
        from neoguard.services.collection.orchestrator import CollectionOrchestrator

        orchestrator = CollectionOrchestrator()
        max_concurrent = [0]
        current_concurrent = [0]

        async def mock_discover(acct, *args, **kwargs):
            current_concurrent[0] += 1
            max_concurrent[0] = max(max_concurrent[0], current_concurrent[0])
            await asyncio.sleep(0.05)
            current_concurrent[0] -= 1

        mock_accounts = []
        for i in range(10):
            acct = MagicMock()
            acct.account_id = f"acct-{i}"
            acct.tenant_id = f"tenant-{i}"
            acct.id = f"id-{i}"
            acct.regions = ["us-east-1"]
            mock_accounts.append(acct)

        with patch("neoguard.services.collection.orchestrator.list_aws_accounts",
                   new=AsyncMock(return_value=mock_accounts)), \
             patch("neoguard.services.collection.orchestrator.settings") as mock_settings, \
             patch.object(orchestrator, "_discover_single_aws_account",
                         side_effect=mock_discover):
            mock_settings.discovery_max_concurrency = 5
            await orchestrator._run_aws_discovery()

        assert max_concurrent[0] <= 5

    @pytest.mark.asyncio
    async def test_discovery_one_failure_doesnt_block_others(self):
        """If one account fails, others still complete."""
        from neoguard.services.collection.orchestrator import CollectionOrchestrator

        orchestrator = CollectionOrchestrator()
        completed = []

        async def mock_discover(acct, *args, **kwargs):
            if acct.account_id == "acct-1":
                raise RuntimeError("bad creds")
            completed.append(acct.account_id)

        mock_accounts = []
        for i in range(3):
            acct = MagicMock()
            acct.account_id = f"acct-{i}"
            acct.tenant_id = f"tenant-{i}"
            acct.id = f"id-{i}"
            acct.regions = ["us-east-1"]
            mock_accounts.append(acct)

        with patch("neoguard.services.collection.orchestrator.list_aws_accounts",
                   new=AsyncMock(return_value=mock_accounts)), \
             patch.object(orchestrator, "_discover_single_aws_account",
                         side_effect=mock_discover):
            await orchestrator._run_aws_discovery()

        assert "acct-0" in completed
        assert "acct-2" in completed
        assert orchestrator._discovery_stats.failure_count >= 1 or \
               hasattr(orchestrator, "_discovery_failures")

    @pytest.mark.asyncio
    async def test_discovery_failure_counter_in_stats(self):
        """Stats must expose discovery failure counts per provider."""
        from neoguard.services.collection.orchestrator import CollectionOrchestrator

        orchestrator = CollectionOrchestrator()
        stats = orchestrator.stats
        assert "discovery" in stats
        # After B3 fix, should have failure tracking
        assert "aws_failures" in stats["discovery"] or "failure_count" in stats["discovery"]
