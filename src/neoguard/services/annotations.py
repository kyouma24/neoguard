from datetime import datetime

import orjson
from uuid_utils import uuid7

from neoguard.db.timescale.connection import get_pool
from neoguard.models.annotations import Annotation, AnnotationCreate, AnnotationUpdate


async def create_annotation(
    tenant_id: str, user_id: str, data: AnnotationCreate,
) -> Annotation:
    ann_id = str(uuid7())
    tags_json = orjson.dumps(data.tags).decode()

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO annotations (id, tenant_id, dashboard_id, title, text, tags, starts_at, ends_at, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
            """,
            ann_id, tenant_id, data.dashboard_id, data.title, data.text,
            tags_json, data.starts_at, data.ends_at, user_id,
        )
    return _row_to_annotation(row)


async def list_annotations(
    tenant_id: str | None,
    dashboard_id: str | None = None,
    from_time: datetime | None = None,
    to_time: datetime | None = None,
    limit: int = 200,
) -> list[Annotation]:
    pool = await get_pool()
    conditions = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    if dashboard_id:
        conditions.append(f"(dashboard_id = ${idx} OR dashboard_id IS NULL)")
        params.append(dashboard_id)
        idx += 1

    if from_time:
        conditions.append(f"(ends_at IS NULL AND starts_at >= ${idx} OR ends_at >= ${idx})")
        params.append(from_time)
        idx += 1

    if to_time:
        conditions.append(f"starts_at <= ${idx}")
        params.append(to_time)
        idx += 1

    where = " AND ".join(conditions) if conditions else "TRUE"

    params.append(limit)
    limit_idx = idx

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"SELECT * FROM annotations WHERE {where}"  # noqa: S608
            f" ORDER BY starts_at DESC LIMIT ${limit_idx}",
            *params,
        )
    return [_row_to_annotation(r) for r in rows]


async def get_annotation(tenant_id: str | None, annotation_id: str) -> Annotation | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM annotations WHERE id = $1 AND tenant_id = $2",
                annotation_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM annotations WHERE id = $1", annotation_id,
            )
    return _row_to_annotation(row) if row else None


async def update_annotation(
    tenant_id: str, annotation_id: str, data: AnnotationUpdate,
) -> Annotation | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_annotation(tenant_id, annotation_id)

    set_parts = []
    params: list = []
    idx = 3

    for field, value in updates.items():
        if field == "tags":
            value = orjson.dumps(value).decode()
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE annotations SET {', '.join(set_parts)}"  # noqa: S608
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            annotation_id, tenant_id, *params,
        )
    return _row_to_annotation(row) if row else None


async def delete_annotation(tenant_id: str, annotation_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM annotations WHERE id = $1 AND tenant_id = $2",
            annotation_id, tenant_id,
        )
    return result == "DELETE 1"


def _row_to_annotation(row) -> Annotation:
    tags_raw = row.get("tags") or "[]"
    if isinstance(tags_raw, str):
        tags_raw = orjson.loads(tags_raw)

    return Annotation(
        id=row["id"],
        tenant_id=row["tenant_id"],
        dashboard_id=row.get("dashboard_id"),
        title=row["title"],
        text=row["text"],
        tags=tags_raw,
        starts_at=row["starts_at"],
        ends_at=row.get("ends_at"),
        created_by=row["created_by"],
        created_at=row["created_at"],
    )
