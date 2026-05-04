"""Password reset token management — create, validate, consume."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from uuid_utils import uuid7

from neoguard.db.timescale.connection import get_pool
from neoguard.services.auth.passwords import hash_password

TOKEN_BYTES = 32
TOKEN_TTL = timedelta(hours=1)
MAX_REQUESTS_PER_HOUR = 3


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def check_rate_limit(user_id: UUID) -> bool:
    pool = await get_pool()
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    count = await pool.fetchval(
        "SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = $1 AND created_at > $2",
        user_id, one_hour_ago,
    )
    return count < MAX_REQUESTS_PER_HOUR


async def create_reset_token(user_id: UUID) -> str:
    pool = await get_pool()
    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    token_hash = _hash_token(raw_token)
    token_id = uuid7()
    expires_at = datetime.now(timezone.utc) + TOKEN_TTL

    await pool.execute(
        """
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        """,
        token_id, user_id, token_hash, expires_at,
    )

    return raw_token


async def validate_and_consume_token(token: str) -> UUID | None:
    pool = await get_pool()
    token_hash = _hash_token(token)
    now = datetime.now(timezone.utc)

    row = await pool.fetchrow(
        """
        UPDATE password_reset_tokens
        SET used_at = $1
        WHERE token_hash = $2
          AND used_at IS NULL
          AND expires_at > $1
        RETURNING user_id
        """,
        now, token_hash,
    )

    if not row:
        return None

    return row["user_id"]


async def update_user_password(user_id: UUID, new_password: str) -> None:
    pool = await get_pool()
    pw_hash = hash_password(new_password)
    await pool.execute(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        pw_hash, user_id,
    )

    await pool.execute(
        "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
        user_id,
    )
