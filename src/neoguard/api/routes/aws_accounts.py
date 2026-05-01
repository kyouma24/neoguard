from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required
from neoguard.models.aws import AWSAccount, AWSAccountCreate, AWSAccountUpdate
from neoguard.services.aws.accounts import (
    create_aws_account,
    delete_aws_account,
    get_aws_account,
    list_aws_accounts,
    update_aws_account,
)

router = APIRouter(prefix="/api/v1/aws/accounts", tags=["aws-accounts"])


@router.get("", response_model=list[AWSAccount])
async def list_all(
    enabled_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[AWSAccount]:
    return await list_aws_accounts(
        tenant_id, enabled_only=enabled_only, limit=min(limit, 500), offset=offset,
    )


@router.post("", response_model=AWSAccount, status_code=201)
async def create(
    data: AWSAccountCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AWSAccount:
    return await create_aws_account(tenant_id, data)


@router.get("/{acct_id}", response_model=AWSAccount)
async def get_one(
    acct_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> AWSAccount:
    acct = await get_aws_account(tenant_id, acct_id)
    if not acct:
        raise HTTPException(404, "AWS account not found")
    return acct


@router.patch("/{acct_id}", response_model=AWSAccount)
async def update(
    acct_id: str,
    data: AWSAccountUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AWSAccount:
    acct = await update_aws_account(tenant_id, acct_id, data)
    if not acct:
        raise HTTPException(404, "AWS account not found")
    return acct


@router.delete("/{acct_id}", status_code=204)
async def delete(
    acct_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_aws_account(tenant_id, acct_id)
    if not deleted:
        raise HTTPException(404, "AWS account not found")
