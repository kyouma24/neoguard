"""SSE (Server-Sent Events) endpoint for live dashboard updates.

Implements spec 02-dashboards-technical.md Part F:
- One SSE connection per dashboard
- Heartbeat every 15s
- Auto-close at 30 min, client reconnects
- Auth via session cookie (EventSource with credentials: 'include')

For now the stream only sends heartbeats and connection lifecycle events.
Actual metric data push will be wired via Redis pub/sub in a later sprint.

TODO(production): Heartbeat-only; needs Redis pub/sub fan-out for real-time push
Current: SSE stream sends only heartbeat + lifecycle events, client must poll
Cloud: Redis pub/sub channel per dashboard/tenant, worker subscribes and forwards events
Migration risk: Medium — requires Redis Streams or pub/sub + connection affinity
Reference: docs/cloud_migration.md#sse-realtime
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import orjson
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from neoguard.api.deps import get_tenant_id, require_scope
from neoguard.core.config import settings
from neoguard.core.logging import log

router = APIRouter(prefix="/api/v1/query", tags=["sse"])


# COLL-005: connection caps to prevent DoS via unbounded SSE coroutines
_active_sse_connections: int = 0
_tenant_sse_connections: dict[str, int] = {}
_sse_connections_rejected: int = 0


def format_sse(data: dict, event: str | None = None) -> str:
    """Format a dict as an SSE message.

    SSE wire format:
        event: <name>\\n       (optional)
        data: <json>\\n
        \\n                     (blank line terminates the message)
    """
    line = f"data: {orjson.dumps(data).decode()}\n"
    if event:
        line = f"event: {event}\n{line}"
    return f"{line}\n"


@router.get(
    "/stream",
    dependencies=[Depends(require_scope("read"))],
    response_model=None,
    summary="SSE stream for live dashboard updates",
)
async def query_stream(
    request: Request,
    dashboard_id: str = Query(..., min_length=1, max_length=200),
    tenant_id: str | None = Depends(get_tenant_id),
):
    """SSE endpoint for live dashboard updates.

    Opens a long-lived ``text/event-stream`` connection that emits:

    * **connected** — immediately on open, confirms the subscription
    * **heartbeat** — every 15 s so proxies/browsers keep the conn alive
    * **points** — (future) metric datapoints pushed via Redis pub/sub
    * **close** — server-initiated shutdown after 30 min; client should reconnect

    Auth is via session cookie — ``EventSource`` must use
    ``withCredentials: true``.
    """
    global _active_sse_connections, _sse_connections_rejected

    # COLL-005: enforce connection caps
    effective_tenant = tenant_id or "anonymous"
    if _active_sse_connections >= settings.sse_max_connections_global:
        _sse_connections_rejected += 1
        return JSONResponse(
            status_code=503,
            content={"error": "max SSE connections reached", "limit": "global"},
        )
    tenant_count = _tenant_sse_connections.get(effective_tenant, 0)
    if tenant_count >= settings.sse_max_connections_per_tenant:
        _sse_connections_rejected += 1
        return JSONResponse(
            status_code=503,
            content={"error": "max SSE connections reached", "limit": "per_tenant"},
        )

    _active_sse_connections += 1
    _tenant_sse_connections[effective_tenant] = tenant_count + 1

    await log.ainfo(
        "sse_stream_open",
        dashboard_id=dashboard_id,
        tenant_id=tenant_id,
        user_id=getattr(request.state, "user_id", None),
    )

    async def event_generator():
        global _active_sse_connections
        try:
            # 1. Connection confirmation
            yield format_sse({
                "type": "connected",
                "dashboard_id": dashboard_id,
                "ts": int(datetime.now(tz=UTC).timestamp()),
            })

            start_time = asyncio.get_event_loop().time()

            while True:
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > settings.sse_max_duration_sec:
                    yield format_sse({
                        "type": "close",
                        "reason": "max_duration",
                        "ts": int(datetime.now(tz=UTC).timestamp()),
                    })
                    break

                # Check if the client has disconnected
                if await request.is_disconnected():
                    break

                # Heartbeat
                yield format_sse({
                    "type": "heartbeat",
                    "ts": int(datetime.now(tz=UTC).timestamp()),
                })

                await asyncio.sleep(settings.sse_heartbeat_sec)
        except asyncio.CancelledError:
            pass
        finally:
            _active_sse_connections -= 1
            current = _tenant_sse_connections.get(effective_tenant, 1) - 1
            if current <= 0:
                _tenant_sse_connections.pop(effective_tenant, None)
            else:
                _tenant_sse_connections[effective_tenant] = current
            await log.ainfo(
                "sse_stream_close",
                dashboard_id=dashboard_id,
                tenant_id=tenant_id,
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Prevent Nginx buffering
        },
    )
