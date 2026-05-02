"""Invite management — store and accept tenant invitations."""

from __future__ import annotations

from datetime import timedelta
from uuid import UUID

from uuid_utils import uuid7

from neoguard.db.timescale.connection import get_pool
from neoguard.services.auth.passwords import hash_password


async def create_invite(
    tenant_id: UUID,
    email: str,
    role: str,
    invited_by: UUID,
    expires_days: int = 7,
) -> dict:
    pool = await get_pool()
    invite_id = uuid7()
    token = str(uuid7())
    token_hash = hash_password(token)

    row = await pool.fetchrow(
        """
        INSERT INTO user_invites (id, tenant_id, email, role, invited_by, token_hash, expires_at)
        VALUES ($1, $2, LOWER($3), $4, $5, $6, NOW() + $7::interval)
        RETURNING *
        """,
        invite_id, tenant_id, email, role, invited_by, token_hash,
        timedelta(days=expires_days),
    )
    return dict(row)


async def get_pending_invites_for_email(email: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT ui.*, t.name AS tenant_name
        FROM user_invites ui
        JOIN tenants t ON t.id = ui.tenant_id
        WHERE LOWER(ui.email) = LOWER($1)
          AND ui.accepted_at IS NULL
          AND ui.expires_at > NOW()
          AND t.status = 'active'
        ORDER BY ui.created_at
        """,
        email,
    )
    return [dict(r) for r in rows]


async def accept_invite(invite_id: UUID, user_id: UUID) -> bool:
    pool = await get_pool()
    invite = await pool.fetchrow(
        "SELECT * FROM user_invites WHERE id = $1 AND accepted_at IS NULL AND expires_at > NOW()",
        invite_id,
    )
    if not invite:
        return False

    existing = await pool.fetchval(
        "SELECT 1 FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $2",
        user_id, invite["tenant_id"],
    )
    if not existing:
        await pool.execute(
            "INSERT INTO tenant_memberships (user_id, tenant_id, role, invited_by) VALUES ($1, $2, $3, $4)",
            user_id, invite["tenant_id"], invite["role"], invite["invited_by"],
        )

    await pool.execute(
        "UPDATE user_invites SET accepted_at = NOW() WHERE id = $1",
        invite_id,
    )
    return True
