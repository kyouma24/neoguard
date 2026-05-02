from __future__ import annotations

import secrets
from uuid import UUID

import orjson

from neoguard.core.config import settings
from neoguard.db.redis.connection import get_redis
from neoguard.models.users import SessionInfo, TenantRole

SESSION_PREFIX = "session:"
ADMIN_SESSION_PREFIX = "admin_session:"
USER_SESSIONS_PREFIX = "user_sessions:"


def _session_key(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


def _admin_session_key(session_id: str) -> str:
    return f"{ADMIN_SESSION_PREFIX}{session_id}"


async def create_session(
    user_id: UUID,
    tenant_id: UUID,
    role: TenantRole,
    is_super_admin: bool = False,
    impersonated_by: UUID | None = None,
    ttl_override: int | None = None,
) -> str:
    session_id = secrets.token_urlsafe(32)
    data: dict = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id),
        "role": role.value,
        "is_super_admin": is_super_admin,
    }
    if impersonated_by:
        data["impersonated_by"] = str(impersonated_by)
    if ttl_override:
        ttl = ttl_override
    elif is_super_admin:
        ttl = settings.super_admin_session_ttl_seconds
    else:
        ttl = settings.session_ttl_seconds
    redis = get_redis()
    await redis.set(
        _session_key(session_id),
        orjson.dumps(data).decode(),
        ex=ttl,
    )
    index_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    await redis.sadd(index_key, session_id)
    await redis.expire(index_key, settings.session_ttl_seconds)
    return session_id


async def get_session(session_id: str) -> SessionInfo | None:
    redis = get_redis()
    raw = await redis.get(_session_key(session_id))
    if raw is None:
        return None
    data = orjson.loads(raw)
    if not data.get("is_super_admin", False):
        await redis.expire(_session_key(session_id), settings.session_ttl_seconds)
    impersonated_by = data.get("impersonated_by")
    return SessionInfo(
        user_id=UUID(data["user_id"]),
        tenant_id=UUID(data["tenant_id"]),
        role=TenantRole(data["role"]),
        is_super_admin=data.get("is_super_admin", False),
        impersonated_by=UUID(impersonated_by) if impersonated_by else None,
    )


async def store_admin_session(impersonation_session_id: str, admin_session_id: str, ttl: int) -> None:
    redis = get_redis()
    await redis.set(
        _admin_session_key(impersonation_session_id),
        admin_session_id,
        ex=ttl,
    )


async def get_admin_session(impersonation_session_id: str) -> str | None:
    redis = get_redis()
    return await redis.get(_admin_session_key(impersonation_session_id))


async def update_session_tenant(
    session_id: str,
    tenant_id: UUID,
    role: TenantRole,
) -> bool:
    redis = get_redis()
    raw = await redis.get(_session_key(session_id))
    if raw is None:
        return False
    data = orjson.loads(raw)
    data["tenant_id"] = str(tenant_id)
    data["role"] = role.value
    ttl = await redis.ttl(_session_key(session_id))
    if ttl < 0:
        ttl = settings.session_ttl_seconds
    await redis.set(
        _session_key(session_id),
        orjson.dumps(data).decode(),
        ex=ttl,
    )
    return True


async def delete_session(session_id: str, user_id: UUID | None = None) -> bool:
    redis = get_redis()
    result = await redis.delete(_session_key(session_id))
    if user_id:
        await redis.srem(f"{USER_SESSIONS_PREFIX}{user_id}", session_id)
    return result > 0


async def list_user_sessions(user_id: UUID) -> list[dict]:
    redis = get_redis()
    index_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    session_ids = await redis.smembers(index_key)
    sessions = []
    stale = []
    for sid in session_ids:
        raw = await redis.get(_session_key(sid))
        if raw is None:
            stale.append(sid)
            continue
        ttl = await redis.ttl(_session_key(sid))
        data = orjson.loads(raw)
        sessions.append({
            "session_id": sid,
            "tenant_id": data.get("tenant_id"),
            "role": data.get("role"),
            "is_super_admin": data.get("is_super_admin", False),
            "ttl_seconds": ttl if ttl > 0 else 0,
        })
    if stale:
        await redis.srem(index_key, *stale)
    return sessions


async def delete_all_user_sessions(
    user_id: UUID, except_session: str | None = None,
) -> int:
    redis = get_redis()
    index_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    session_ids = await redis.smembers(index_key)
    count = 0
    for sid in session_ids:
        if sid == except_session:
            continue
        await redis.delete(_session_key(sid))
        count += 1
    if except_session and except_session in session_ids:
        await redis.delete(index_key)
        await redis.sadd(index_key, except_session)
    else:
        await redis.delete(index_key)
    return count
