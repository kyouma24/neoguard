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


async def admin_create_tenant(name: str, owner_id: UUID | None = None) -> dict:
    """Create a tenant from admin panel. Optionally assign an owner."""
    pool = await get_pool()
    from neoguard.services.auth.users import slugify
    tenant_id = uuid7()
    base_slug = slugify(name)
    slug = base_slug
    for i in range(1, 100):
        existing = await pool.fetchval("SELECT id FROM tenants WHERE slug = $1", slug)
        if existing is None:
            break
        slug = f"{base_slug}-{i}"

    row = await pool.fetchrow(
        """
        INSERT INTO tenants (id, slug, name)
        VALUES ($1, $2, $3)
        RETURNING *, 0 AS member_count
        """,
        tenant_id, slug, name,
    )
    if owner_id:
        await pool.execute(
            "INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')",
            owner_id, tenant_id,
        )
    return dict(row)


async def admin_delete_tenant(tenant_id: UUID) -> bool:
    pool = await get_pool()
    result = await pool.execute(
        "UPDATE tenants SET status = 'deleted', updated_at = NOW() WHERE id = $1 AND status != 'deleted'",
        tenant_id,
    )
    return result == "UPDATE 1"


async def write_tenant_audit(
    tenant_id: UUID,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    actor_id: UUID | None = None,
    actor_type: str = "user",
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    pool = await get_pool()
    import orjson
    await pool.execute(
        """
        INSERT INTO audit_log (id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
        uuid7(), tenant_id, actor_id, actor_type, action, resource_type,
        resource_id, orjson.dumps(details or {}).decode(), ip_address,
    )


async def get_tenant_audit_log(
    tenant_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT al.*, u.email AS actor_email, u.name AS actor_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.actor_id
        WHERE al.tenant_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2 OFFSET $3
        """,
        tenant_id, limit, offset,
    )
    return [dict(r) for r in rows]


async def write_security_log(
    event_type: str,
    success: bool,
    user_id: UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
) -> None:
    pool = await get_pool()
    import orjson
    await pool.execute(
        """
        INSERT INTO security_log (id, user_id, event_type, success, ip_address, user_agent, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        uuid7(), user_id, event_type, success, ip_address, user_agent,
        orjson.dumps(details or {}).decode(),
    )


async def get_security_log(
    event_type: str | None = None,
    success: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = await get_pool()
    conditions = []
    params: list = []
    idx = 1

    if event_type is not None:
        conditions.append(f"sl.event_type = ${idx}")
        params.append(event_type)
        idx += 1
    if success is not None:
        conditions.append(f"sl.success = ${idx}")
        params.append(success)
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])

    rows = await pool.fetch(
        f"""
        SELECT sl.*, u.email AS user_email, u.name AS user_name
        FROM security_log sl
        LEFT JOIN users u ON u.id = sl.user_id
        {where}
        ORDER BY sl.created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
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
