import asyncpg
import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.aws import AWSAccount, AWSAccountCreate, AWSAccountUpdate


class DuplicateAccountError(Exception):
    def __init__(self, account_id: str, tenant_id: str):
        self.account_id = account_id
        self.tenant_id = tenant_id
        super().__init__(
            f"AWS account {account_id} is already connected to this tenant."
        )


async def create_aws_account(tenant_id: str, data: AWSAccountCreate) -> AWSAccount:
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM aws_accounts WHERE tenant_id = $1 AND account_id = $2",
            tenant_id, data.account_id,
        )
        if existing:
            raise DuplicateAccountError(data.account_id, tenant_id)

    acct_id = str(ULID())
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO aws_accounts
                    (id, tenant_id, name, account_id, role_arn, external_id,
                     regions, collect_config)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                acct_id, tenant_id, data.name, data.account_id,
                data.role_arn, data.external_id,
                orjson.dumps(data.regions).decode(),
                orjson.dumps(data.collect_config).decode(),
            )
    except asyncpg.UniqueViolationError:
        raise DuplicateAccountError(data.account_id, tenant_id)
    return _row_to_account(row)


async def get_aws_account(tenant_id: str | None, acct_id: str) -> AWSAccount | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM aws_accounts WHERE id = $1 AND tenant_id = $2",
                acct_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM aws_accounts WHERE id = $1", acct_id,
            )
    return _row_to_account(row) if row else None


async def list_aws_accounts(
    tenant_id: str | None, enabled_only: bool = False, limit: int = 50, offset: int = 0,
) -> list[AWSAccount]:
    pool = await get_pool()
    conditions: list[str] = []
    params: list = []
    idx = 1
    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if enabled_only:
        conditions.append("enabled = TRUE")
    where = (" AND ".join(conditions)) if conditions else "TRUE"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM aws_accounts WHERE {where}"
            f" ORDER BY name LIMIT {limit} OFFSET {offset}",
            *params,
        )
    return [_row_to_account(r) for r in rows]


async def update_aws_account(
    tenant_id: str | None, acct_id: str, data: AWSAccountUpdate,
) -> AWSAccount | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_aws_account(tenant_id, acct_id)

    set_parts = []
    params = []
    if tenant_id:
        where = "WHERE id = $1 AND tenant_id = $2"
        base_params = [acct_id, tenant_id]
        idx = 3
    else:
        where = "WHERE id = $1"
        base_params = [acct_id]
        idx = 2
    for field, value in updates.items():
        if field in ("regions", "collect_config"):
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1
    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE aws_accounts SET {', '.join(set_parts)} {where} RETURNING *",
            *base_params, *params,
        )
    return _row_to_account(row) if row else None


async def delete_aws_account(tenant_id: str | None, acct_id: str) -> bool:
    pool = await get_pool()
    if tenant_id:
        query = "DELETE FROM aws_accounts WHERE id = $1 AND tenant_id = $2"
        args = (acct_id, tenant_id)
    else:
        query = "DELETE FROM aws_accounts WHERE id = $1"
        args = (acct_id,)
    async with pool.acquire() as conn:
        result = await conn.execute(query, *args)
    return result == "DELETE 1"


async def mark_synced(tenant_id: str, acct_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE aws_accounts SET last_sync_at = NOW() WHERE id = $1 AND tenant_id = $2",
            acct_id, tenant_id,
        )


def _row_to_account(row) -> AWSAccount:
    regions = row["regions"]
    if isinstance(regions, str):
        regions = orjson.loads(regions)
    config = row["collect_config"]
    if isinstance(config, str):
        config = orjson.loads(config)
    return AWSAccount(
        id=row["id"],
        tenant_id=row["tenant_id"],
        name=row["name"],
        account_id=row["account_id"],
        role_arn=row["role_arn"],
        external_id=row["external_id"],
        regions=regions,
        enabled=row["enabled"],
        collect_config=config,
        last_sync_at=row["last_sync_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
