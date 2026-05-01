"""API key management — create, validate, revoke keys."""

import hashlib
import secrets
from datetime import UTC, datetime

import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.auth import APIKeyCreate, APIKeyCreated, APIKeyResponse, APIKeyUpdate


def _generate_key() -> str:
    return f"ng_{secrets.token_urlsafe(32)}"


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


async def create_api_key(data: APIKeyCreate) -> APIKeyCreated:
    key_id = str(ULID())
    raw_key = _generate_key()
    key_hash = _hash_key(raw_key)
    key_prefix = raw_key[:11]

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO api_keys
                (id, tenant_id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            key_id, data.tenant_id, data.name, key_hash, key_prefix,
            orjson.dumps(data.scopes).decode(), data.rate_limit, data.expires_at,
        )
    resp = _row_to_response(row)
    return APIKeyCreated(**resp.model_dump(), raw_key=raw_key)


async def validate_api_key(raw_key: str) -> APIKeyResponse | None:
    key_hash = _hash_key(raw_key)
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM api_keys WHERE key_hash = $1 AND enabled = TRUE",
            key_hash,
        )
    if not row:
        return None

    if row["expires_at"] and row["expires_at"] < datetime.now(UTC):
        return None

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
            row["id"],
        )

    return _row_to_response(row)


async def list_api_keys(tenant_id: str | None) -> list[APIKeyResponse]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                "SELECT * FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC",
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM api_keys ORDER BY created_at DESC",
            )
    return [_row_to_response(r) for r in rows]


async def get_api_key(key_id: str, tenant_id: str | None) -> APIKeyResponse | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM api_keys WHERE id = $1 AND tenant_id = $2",
                key_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM api_keys WHERE id = $1", key_id,
            )
    return _row_to_response(row) if row else None


async def update_api_key(
    key_id: str, tenant_id: str, data: APIKeyUpdate,
) -> APIKeyResponse | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_api_key(key_id, tenant_id)

    set_parts = []
    params = []
    idx = 3
    for field, value in updates.items():
        if field == "scopes":
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE api_keys SET {', '.join(set_parts)}"
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            key_id, tenant_id, *params,
        )
    return _row_to_response(row) if row else None


async def delete_api_key(key_id: str, tenant_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM api_keys WHERE id = $1 AND tenant_id = $2",
            key_id, tenant_id,
        )
    return result == "DELETE 1"


def _row_to_response(row) -> APIKeyResponse:
    scopes = row["scopes"]
    if isinstance(scopes, str):
        scopes = orjson.loads(scopes)
    return APIKeyResponse(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        key_prefix=row["key_prefix"],
        scopes=scopes,
        rate_limit=row["rate_limit"],
        enabled=row["enabled"],
        expires_at=row["expires_at"],
        last_used_at=row["last_used_at"],
        created_at=row["created_at"],
    )
