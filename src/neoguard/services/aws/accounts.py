import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.aws import AWSAccount, AWSAccountCreate, AWSAccountUpdate


async def create_aws_account(tenant_id: str, data: AWSAccountCreate) -> AWSAccount:
    acct_id = str(ULID())
    pool = await get_pool()
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
    tenant_id: str, acct_id: str, data: AWSAccountUpdate,
) -> AWSAccount | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_aws_account(tenant_id, acct_id)

    set_parts = []
    params = []
    idx = 3
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
            f"UPDATE aws_accounts SET {', '.join(set_parts)}"
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            acct_id, tenant_id, *params,
        )
    return _row_to_account(row) if row else None


async def delete_aws_account(tenant_id: str, acct_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM aws_accounts WHERE id = $1 AND tenant_id = $2",
            acct_id, tenant_id,
        )
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
