"""Admin service — platform-level operations for super admins."""

from __future__ import annotations

from uuid import UUID

from uuid_utils import uuid7

from neoguard.db.timescale.connection import get_pool


async def list_all_tenants(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    if status:
        rows = await pool.fetch(
            """
            SELECT t.*, COUNT(tm.user_id) AS member_count
            FROM tenants t
            LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id
            WHERE t.status = $1
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT $2 OFFSET $3
            """,
            status, limit, offset,
        )
    else:
        rows = await pool.fetch(
            """
            SELECT t.*, COUNT(tm.user_id) AS member_count
            FROM tenants t
            LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at DESC
            LIMIT $1 OFFSET $2
            """,
            limit, offset,
        )
    return [dict(r) for r in rows]


async def list_all_users(
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT u.id, u.email, u.name, u.is_super_admin, u.is_active,
               u.email_verified, u.created_at, u.updated_at,
               COUNT(tm.tenant_id) AS tenant_count
        FROM users u
        LEFT JOIN tenant_memberships tm ON tm.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
        """,
        limit, offset,
    )
    return [dict(r) for r in rows]


async def set_tenant_status(tenant_id: UUID, status: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE tenants SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
        """,
        status, tenant_id,
    )
    return dict(row) if row else None


async def set_super_admin(user_id: UUID, is_super_admin: bool) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE users SET is_super_admin = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, name, is_super_admin, is_active, email_verified, created_at, updated_at
        """,
        is_super_admin, user_id,
    )
    return dict(row) if row else None


async def set_user_active(user_id: UUID, is_active: bool) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        UPDATE users SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, email, name, is_super_admin, is_active, email_verified, created_at, updated_at
        """,
        is_active, user_id,
    )
    return dict(row) if row else None


async def write_platform_audit(
    actor_id: UUID,
    action: str,
    target_type: str,
    target_id: str,
    reason: str = "",
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    pool = await get_pool()
    import orjson
    await pool.execute(
        """
        INSERT INTO platform_audit_log (id, actor_id, action, target_type, target_id, reason, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        uuid7(), actor_id, action, target_type, target_id, reason,
        orjson.dumps(details or {}).decode(), ip_address,
    )


async def get_platform_audit_log(
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT pal.*, u.email AS actor_email, u.name AS actor_name
        FROM platform_audit_log pal
        LEFT JOIN users u ON u.id = pal.actor_id
        ORDER BY pal.created_at DESC
        LIMIT $1 OFFSET $2
        """,
        limit, offset,
    )
    return [dict(r) for r in rows]


async def get_platform_stats() -> dict:
    pool = await get_pool()
    tenant_count = await pool.fetchval("SELECT COUNT(*) FROM tenants")
    active_tenants = await pool.fetchval("SELECT COUNT(*) FROM tenants WHERE status = 'active'")
    user_count = await pool.fetchval("SELECT COUNT(*) FROM users")
    active_users = await pool.fetchval("SELECT COUNT(*) FROM users WHERE is_active = TRUE")
    total_memberships = await pool.fetchval("SELECT COUNT(*) FROM tenant_memberships")
    api_key_count = await pool.fetchval("SELECT COUNT(*) FROM api_keys WHERE enabled = TRUE")
    return {
        "tenants": {"total": tenant_count, "active": active_tenants},
        "users": {"total": user_count, "active": active_users},
        "memberships": total_memberships,
        "api_keys_active": api_key_count,
    }
