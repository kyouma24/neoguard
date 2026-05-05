from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from neoguard.api.deps import get_current_user_id, get_query_tenant_id, get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.annotations import Annotation, AnnotationCreate, AnnotationUpdate
from neoguard.services.annotations import (
    create_annotation,
    delete_annotation,
    get_annotation,
    list_annotations,
    update_annotation,
)

router = APIRouter(prefix="/api/v1/annotations", tags=["annotations"])


@router.post(
    "",
    status_code=201,
    dependencies=[Depends(require_scope("write"))],
)
async def create(
    data: AnnotationCreate,
    tenant_id: str = Depends(get_tenant_id_required),
    user_id: str = Depends(get_current_user_id),
) -> Annotation:
    return await create_annotation(tenant_id, user_id, data)


@router.get("")
async def list_all(
    dashboard_id: str | None = Query(default=None),
    start: datetime | None = Query(default=None, alias="from"),
    end: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=200, le=1000),
    tenant_id: str = Depends(get_query_tenant_id),
) -> list[Annotation]:
    return await list_annotations(tenant_id, dashboard_id, start, end, limit)


@router.get("/{annotation_id}")
async def get_one(
    annotation_id: str,
    tenant_id: str = Depends(get_query_tenant_id),
) -> Annotation:
    ann = await get_annotation(tenant_id, annotation_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return ann


@router.patch(
    "/{annotation_id}",
    dependencies=[Depends(require_scope("write"))],
)
async def update(
    annotation_id: str,
    data: AnnotationUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> Annotation:
    ann = await update_annotation(tenant_id, annotation_id, data)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return ann


@router.delete(
    "/{annotation_id}",
    status_code=204,
    dependencies=[Depends(require_scope("write"))],
)
async def delete(
    annotation_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_annotation(tenant_id, annotation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Annotation not found")
