from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.azure import (
    AzureSubscription,
    AzureSubscriptionCreate,
    AzureSubscriptionUpdate,
)
from neoguard.services.azure.accounts import (
    DuplicateSubscriptionError,
    create_azure_subscription,
    delete_azure_subscription,
    get_azure_subscription,
    list_azure_subscriptions,
    update_azure_subscription,
)

router = APIRouter(prefix="/api/v1/azure/subscriptions", tags=["azure-subscriptions"])


@router.get("", response_model=list[AzureSubscription])
async def list_all(
    enabled_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[AzureSubscription]:
    return await list_azure_subscriptions(
        tenant_id, enabled_only=enabled_only, limit=min(limit, 500), offset=offset,
    )


@router.post(
    "",
    response_model=AzureSubscription,
    status_code=201,
    dependencies=[Depends(require_scope("admin"))],
)
async def create(
    data: AzureSubscriptionCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AzureSubscription:
    try:
        return await create_azure_subscription(tenant_id, data)
    except DuplicateSubscriptionError as e:
        raise HTTPException(409, str(e))


@router.get("/{sub_id}", response_model=AzureSubscription)
async def get_one(
    sub_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> AzureSubscription:
    sub = await get_azure_subscription(tenant_id, sub_id)
    if not sub:
        raise HTTPException(404, "Azure subscription not found")
    return sub


@router.patch(
    "/{sub_id}",
    response_model=AzureSubscription,
    dependencies=[Depends(require_scope("admin"))],
)
async def update(
    sub_id: str,
    data: AzureSubscriptionUpdate,
    tenant_id: str | None = Depends(get_tenant_id),
) -> AzureSubscription:
    sub = await update_azure_subscription(tenant_id, sub_id, data)
    if not sub:
        raise HTTPException(404, "Azure subscription not found")
    return sub


@router.delete(
    "/{sub_id}",
    status_code=204,
    dependencies=[Depends(require_scope("admin"))],
)
async def delete(
    sub_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> None:
    deleted = await delete_azure_subscription(tenant_id, sub_id)
    if not deleted:
        raise HTTPException(404, "Azure subscription not found")
