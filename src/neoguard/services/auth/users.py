from __future__ import annotations

import re
from uuid import UUID

from uuid_utils import uuid7

from neoguard.db.timescale.connection import get_pool
from neoguard.services.auth.passwords import hash_password, needs_rehash, verify_password


async def create_user(email: str, password: str, name: str) -> dict:
    pool = await get_pool()
    user_id = uuid7()
    pw_hash = hash_password(password)
    row = await pool.fetchrow(
        """
        INSERT INTO users (id, email, name, password_hash)
        VALUES ($1, LOWER($2), $3, $4)
        RETURNING id, email, name, is_super_admin, is_active, email_verified, created_at, updated_at
        """,
        user_id, email, name, pw_hash,
    )
    return dict(row)


async def get_user_by_email(email: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
        email,
    )
    return dict(row) if row else None


async def get_user_by_id(user_id: UUID) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row) if row else None


async def authenticate_user(email: str, password: str) -> dict | None:
    user = await get_user_by_email(email)
    if user is None:
        return None
    if not user["is_active"]:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    if needs_rehash(user["password_hash"]):
        new_hash = hash_password(password)
        pool = await get_pool()
        await pool.execute(
            "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            new_hash, user["id"],
        )
    return user


async def update_password(user_id: UUID, new_password: str) -> None:
    pool = await get_pool()
    pw_hash = hash_password(new_password)
    await pool.execute(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        pw_hash, user_id,
    )


async def update_user_name(user_id: UUID, name: str) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
        name, user_id,
    )
    return dict(row) if row else None


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "tenant"


async def create_tenant(name: str, owner_id: UUID) -> dict:
    pool = await get_pool()
    tenant_id = uuid7()
    base_slug = slugify(name)
    slug = base_slug

    for i in range(1, 100):
        existing = await pool.fetchval(
            "SELECT id FROM tenants WHERE slug = $1", slug,
        )
        if existing is None:
            break
        slug = f"{base_slug}-{i}"

    row = await pool.fetchrow(
        """
        INSERT INTO tenants (id, slug, name)
        VALUES ($1, $2, $3)
        RETURNING id, slug, name, tier, status, quotas, created_at, updated_at
        """,
        tenant_id, slug, name,
    )

    await pool.execute(
        """
        INSERT INTO tenant_memberships (user_id, tenant_id, role)
        VALUES ($1, $2, 'owner')
        """,
        owner_id, tenant_id,
    )

    return dict(row)


async def get_user_tenants(user_id: UUID) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT t.id, t.slug, t.name, t.tier, t.status, t.created_at, tm.role
        FROM tenants t
        JOIN tenant_memberships tm ON tm.tenant_id = t.id
        WHERE tm.user_id = $1 AND t.status != 'pending_deletion'
        ORDER BY tm.joined_at
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def get_membership(user_id: UUID, tenant_id: UUID) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT tm.*, u.email AS user_email, u.name AS user_name
        FROM tenant_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.user_id = $1 AND tm.tenant_id = $2
        """,
        user_id, tenant_id,
    )
    return dict(row) if row else None


async def get_tenant_members(tenant_id: UUID) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT tm.user_id, tm.tenant_id, tm.role, tm.joined_at,
               u.email AS user_email, u.name AS user_name
        FROM tenant_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.tenant_id = $1
        ORDER BY tm.joined_at
        """,
        tenant_id,
    )
    return [dict(r) for r in rows]


async def update_member_role(tenant_id: UUID, user_id: UUID, role: str) -> bool:
    pool = await get_pool()
    if role != "owner":
        owner_count = await pool.fetchval(
            "SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = $1 AND role = 'owner'",
            tenant_id,
        )
        current = await pool.fetchval(
            "SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2",
            user_id, tenant_id,
        )
        if current == "owner" and owner_count <= 1:
            return False

    result = await pool.execute(
        "UPDATE tenant_memberships SET role = $1 WHERE user_id = $2 AND tenant_id = $3",
        role, user_id, tenant_id,
    )
    return result.endswith("1")


async def remove_member(tenant_id: UUID, user_id: UUID) -> bool:
    pool = await get_pool()
    current = await pool.fetchval(
        "SELECT role FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2",
        user_id, tenant_id,
    )
    if current == "owner":
        owner_count = await pool.fetchval(
            "SELECT COUNT(*) FROM tenant_memberships WHERE tenant_id = $1 AND role = 'owner'",
            tenant_id,
        )
        if owner_count <= 1:
            return False

    result = await pool.execute(
        "DELETE FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2",
        user_id, tenant_id,
    )
    return result.endswith("1")


async def get_tenant_by_id(tenant_id: UUID) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    return dict(row) if row else None


async def update_tenant(tenant_id: UUID, name: str | None = None) -> dict | None:
    pool = await get_pool()
    if name is not None:
        await pool.execute(
            "UPDATE tenants SET name = $1, updated_at = NOW() WHERE id = $2",
            name, tenant_id,
        )
    row = await pool.fetchrow("SELECT * FROM tenants WHERE id = $1", tenant_id)
    return dict(row) if row else None
