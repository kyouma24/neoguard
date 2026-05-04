"""SSE (Server-Sent Events) endpoint for live dashboard updates.

Implements spec 02-dashboards-technical.md Part F:
- One SSE connection per dashboard
- Heartbeat every 15s
- Auto-close at 30 min, client reconnects
- Auth via session cookie (EventSource with credentials: 'include')

For now the stream only sends heartbeats and connection lifecycle events.
Actual metric data push will be wired via Redis pub/sub in a later sprint.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import orjson
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from neoguard.api.deps import get_tenant_id, require_scope
from neoguard.core.logging import log

router = APIRouter(prefix="/api/v1/query", tags=["sse"])

HEARTBEAT_INTERVAL = 15  # seconds
MAX_DURATION = 30 * 60  # 30 minutes


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
    response_class=StreamingResponse,
    summary="SSE stream for live dashboard updates",
)
async def query_stream(
    request: Request,
    dashboard_id: str = Query(..., min_length=1, max_length=200),
    tenant_id: str | None = Depends(get_tenant_id),
) -> StreamingResponse:
    """SSE endpoint for live dashboard updates.

    Opens a long-lived ``text/event-stream`` connection that emits:

    * **connected** — immediately on open, confirms the subscription
    * **heartbeat** — every 15 s so proxies/browsers keep the conn alive
    * **points** — (future) metric datapoints pushed via Redis pub/sub
    * **close** — server-initiated shutdown after 30 min; client should reconnect

    Auth is via session cookie — ``EventSource`` must use
    ``withCredentials: true``.
    """
    await log.ainfo(
        "sse_stream_open",
        dashboard_id=dashboard_id,
        tenant_id=tenant_id,
        user_id=getattr(request.state, "user_id", None),
    )

    async def event_generator():
        # 1. Connection confirmation
        yield format_sse({
            "type": "connected",
            "dashboard_id": dashboard_id,
            "ts": int(datetime.now(tz=UTC).timestamp()),
        })

        start_time = asyncio.get_event_loop().time()

        try:
            while True:
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > MAX_DURATION:
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

                await asyncio.sleep(HEARTBEAT_INTERVAL)
        except asyncio.CancelledError:
            pass
        finally:
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
