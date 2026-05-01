from __future__ import annotations

import secrets
from uuid import UUID

import orjson

from neoguard.core.config import settings
from neoguard.db.redis.connection import get_redis
from neoguard.models.users import SessionInfo, TenantRole

SESSION_PREFIX = "session:"
ADMIN_SESSION_PREFIX = "admin_session:"


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
    ttl = ttl_override or settings.session_ttl_seconds
    redis = get_redis()
    await redis.set(
        _session_key(session_id),
        orjson.dumps(data).decode(),
        ex=ttl,
    )
    return session_id


async def get_session(session_id: str) -> SessionInfo | None:
    redis = get_redis()
    raw = await redis.get(_session_key(session_id))
    if raw is None:
        return None
    data = orjson.loads(raw)
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


async def delete_session(session_id: str) -> bool:
    redis = get_redis()
    result = await redis.delete(_session_key(session_id))
    return result > 0
