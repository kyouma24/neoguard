"""Tenant-scoped DB connection for RLS enforcement.

Sets `app.current_tenant_id` GUC on the connection so RLS policies filter rows.
Resets to empty string on release to prevent leaking between requests.

Usage:
    async with tenant_connection(tenant_id) as conn:
        rows = await conn.fetch("SELECT * FROM alert_rules")

The middleware sets `current_tenant_id` contextvar per-request so
services can call `tenant_connection()` without passing tenant_id explicitly.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import AsyncGenerator

import asyncpg

from neoguard.db.timescale.connection import get_pool

current_tenant_id: ContextVar[str | None] = ContextVar("current_tenant_id", default=None)


@asynccontextmanager
async def tenant_connection(tenant_id: str | None = None) -> AsyncGenerator[asyncpg.Connection, None]:
    tid = tenant_id or current_tenant_id.get()
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tid:
            await conn.execute("SELECT set_config('app.current_tenant_id', $1, false)", str(tid))
        try:
            yield conn
        finally:
            await conn.execute("SELECT set_config('app.current_tenant_id', '', false)")
