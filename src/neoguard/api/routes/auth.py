from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.auth import APIKeyCreate, APIKeyCreated, APIKeyResponse, APIKeyUpdate
from neoguard.services.auth.api_keys import (
    create_api_key,
    delete_api_key,
    get_api_key,
    list_api_keys,
    update_api_key,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post(
    "/keys",
    response_model=APIKeyCreated,
    status_code=201,
    dependencies=[Depends(require_scope("admin"))],
)
async def create_key(
    data: APIKeyCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> APIKeyCreated:
    """Create a new API key. The raw key is returned ONLY in this response."""
    data.tenant_id = tenant_id
    return await create_api_key(data)


@router.get(
    "/keys",
    response_model=list[APIKeyResponse],
    dependencies=[Depends(require_scope("admin"))],
)
async def list_keys(
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[APIKeyResponse]:
    return await list_api_keys(tenant_id)


@router.get(
    "/keys/{key_id}",
    response_model=APIKeyResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def get_key(
    key_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> APIKeyResponse:
    key = await get_api_key(key_id, tenant_id)
    if not key:
        raise HTTPException(404, "API key not found")
    return key


@router.patch(
    "/keys/{key_id}",
    response_model=APIKeyResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def update_key(
    key_id: str,
    data: APIKeyUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> APIKeyResponse:
    key = await update_api_key(key_id, tenant_id, data)
    if not key:
        raise HTTPException(404, "API key not found")
    return key


@router.delete(
    "/keys/{key_id}",
    status_code=204,
    dependencies=[Depends(require_scope("admin"))],
)
async def delete_key(
    key_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_api_key(key_id, tenant_id)
    if not deleted:
        raise HTTPException(404, "API key not found")
