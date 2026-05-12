from datetime import datetime

import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool
from neoguard.models.resources import Resource, ResourceCreate, ResourceUpdate


async def create_resource(tenant_id: str, data: ResourceCreate) -> Resource:
    resource_id = str(ULID())
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO resources
                (id, tenant_id, resource_type, provider, region, account_id,
                 name, external_id, tags, metadata, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
            """,
            resource_id, tenant_id, data.resource_type.value, data.provider.value,
            data.region, data.account_id, data.name, data.external_id,
            orjson.dumps(data.tags).decode(),
            orjson.dumps(data.metadata).decode(),
            data.status.value,
        )
    return _row_to_resource(row)


async def upsert_resource(tenant_id: str, data: ResourceCreate) -> Resource:
    """Insert or update based on (tenant_id, provider, external_id).

    On update, detects metadata/status changes and records them in
    ``resource_changes`` for drift-detection.
    """
    if not data.external_id:
        return await create_resource(tenant_id, data)

    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            """
            SELECT * FROM resources
            WHERE tenant_id = $1 AND provider = $2 AND external_id = $3
            """,
            tenant_id, data.provider.value, data.external_id,
        )

        if existing:
            old_resource = _row_to_resource(existing)
            row = await conn.fetchrow(
                """
                UPDATE resources SET
                    name = $3, tags = $4, metadata = $5, status = $6,
                    region = $7, account_id = $8, resource_type = $9,
                    last_seen_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND tenant_id = $2
                RETURNING *
                """,
                existing["id"], tenant_id, data.name,
                orjson.dumps(data.tags).decode(),
                orjson.dumps(data.metadata).decode(),
                data.status.value, data.region, data.account_id,
                data.resource_type.value,
            )
            await _record_changes(
                conn, tenant_id, existing["id"], old_resource, data,
            )
        else:
            resource_id = str(ULID())
            row = await conn.fetchrow(
                """
                INSERT INTO resources
                    (id, tenant_id, resource_type, provider, region, account_id,
                     name, external_id, tags, metadata, status, last_seen_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                RETURNING *
                """,
                resource_id, tenant_id, data.resource_type.value,
                data.provider.value, data.region, data.account_id,
                data.name, data.external_id,
                orjson.dumps(data.tags).decode(),
                orjson.dumps(data.metadata).decode(),
                data.status.value,
            )
    return _row_to_resource(row)


async def _record_changes(
    conn, tenant_id: str, resource_id: str,
    old: Resource, new_data: ResourceCreate,
) -> None:
    """Compare old resource state to incoming data; if anything changed,
    write a row to ``resource_changes``."""
    field_changes: list[dict] = []
    old_meta = old.metadata or {}
    new_meta = new_data.metadata or {}

    all_keys = set(old_meta.keys()) | set(new_meta.keys())
    for key in sorted(all_keys):
        old_val = old_meta.get(key)
        new_val = new_meta.get(key)
        if old_val != new_val:
            field_changes.append({
                "field": f"metadata.{key}",
                "old": old_val,
                "new": new_val,
            })

    if old.name != new_data.name:
        field_changes.append({
            "field": "name",
            "old": old.name,
            "new": new_data.name,
        })

    status_changed = old.status != new_data.status.value
    if status_changed:
        field_changes.append({
            "field": "status",
            "old": old.status,
            "new": new_data.status.value,
        })

    if old.region != new_data.region:
        field_changes.append({
            "field": "region",
            "old": old.region,
            "new": new_data.region,
        })

    if not field_changes:
        return

    change_type = "status_changed" if status_changed else "metadata_changed"
    change_id = str(ULID())
    await conn.execute(
        """
        INSERT INTO resource_changes
            (id, tenant_id, resource_id, change_type, field_changes,
             previous_status, new_status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        change_id, tenant_id, resource_id, change_type,
        orjson.dumps(field_changes).decode(),
        old.status if status_changed else None,
        new_data.status.value if status_changed else None,
    )


async def get_resource(tenant_id: str | None, resource_id: str) -> Resource | None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            row = await conn.fetchrow(
                "SELECT * FROM resources WHERE id = $1 AND tenant_id = $2",
                resource_id, tenant_id,
            )
        else:
            row = await conn.fetchrow(
                "SELECT * FROM resources WHERE id = $1", resource_id,
            )
    return _row_to_resource(row) if row else None


async def list_resources(
    tenant_id: str | None,
    resource_type: str | None = None,
    provider: str | None = None,
    account_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Resource]:
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1

    for field, value in [
        ("resource_type", resource_type),
        ("provider", provider),
        ("account_id", account_id),
        ("status", status),
    ]:
        if value:
            conditions.append(f"{field} = ${idx}")
            params.append(value)
            idx += 1

    if not status:
        conditions.append("status != 'removed'")

    where = (" AND ".join(conditions)) if conditions else "TRUE"
    pool = await get_pool()
    async with pool.acquire() as conn:
        if not tenant_id:
            rows = await conn.fetch(
                f"SELECT * FROM ("
                f"  SELECT DISTINCT ON (external_id) *"
                f"  FROM resources WHERE {where}"
                f"  ORDER BY external_id, updated_at DESC"
                f") sub ORDER BY name LIMIT {limit} OFFSET {offset}",
                *params,
            )
        else:
            rows = await conn.fetch(
                f"SELECT * FROM resources WHERE {where} ORDER BY name LIMIT {limit} OFFSET {offset}",
                *params,
            )
    return [_row_to_resource(r) for r in rows]


async def update_resource(
    tenant_id: str, resource_id: str, data: ResourceUpdate,
) -> Resource | None:
    updates = data.model_dump(exclude_none=True)
    if not updates:
        return await get_resource(tenant_id, resource_id)

    set_parts = []
    params = []
    idx = 3
    for field, value in updates.items():
        if field in ("tags", "metadata"):
            value = orjson.dumps(value).decode()
        elif field == "status":
            value = value.value
        set_parts.append(f"{field} = ${idx}")
        params.append(value)
        idx += 1
    set_parts.append("updated_at = NOW()")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE resources SET {', '.join(set_parts)}"
            " WHERE id = $1 AND tenant_id = $2 RETURNING *",
            resource_id, tenant_id, *params,
        )
    return _row_to_resource(row) if row else None


async def delete_resource(tenant_id: str, resource_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM resources WHERE id = $1 AND tenant_id = $2",
            resource_id, tenant_id,
        )
    return result == "DELETE 1"


async def get_resource_issues(tenant_id: str | None) -> dict:
    """Aggregate resources and alerts that need attention.

    Returns stopped/terminated resources, stale active resources (not seen
    in >15 min), and currently-firing alert events.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # --- 1. Stopped / terminated resources ---
        if tenant_id:
            stopped_rows = await conn.fetch(
                """
                SELECT id, name, resource_type, provider, account_id,
                       region, status, updated_at
                FROM resources
                WHERE status IN ('stopped', 'terminated')
                  AND tenant_id = $1
                ORDER BY updated_at DESC
                LIMIT 50
                """,
                tenant_id,
            )
        else:
            stopped_rows = await conn.fetch(
                """
                SELECT id, name, resource_type, provider, account_id,
                       region, status, updated_at
                FROM resources
                WHERE status IN ('stopped', 'terminated')
                ORDER BY updated_at DESC
                LIMIT 50
                """,
            )

        # --- 2. Stale active resources (last_seen_at > 15 min ago) ---
        # Only 'active' — 'unknown' resources already have uncertain state and should not be marked stale.
        if tenant_id:
            stale_rows = await conn.fetch(
                """
                SELECT id, name, resource_type, provider, account_id,
                       region, last_seen_at,
                       EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60
                           AS minutes_stale
                FROM resources
                WHERE status = 'active'
                  AND last_seen_at < NOW() - INTERVAL '15 minutes'
                  AND tenant_id = $1
                ORDER BY last_seen_at ASC
                LIMIT 50
                """,
                tenant_id,
            )
        else:
            stale_rows = await conn.fetch(
                """
                SELECT id, name, resource_type, provider, account_id,
                       region, last_seen_at,
                       EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60
                           AS minutes_stale
                FROM resources
                WHERE status = 'active'
                  AND last_seen_at < NOW() - INTERVAL '15 minutes'
                ORDER BY last_seen_at ASC
                LIMIT 50
                """,
            )

        # --- 3. Firing alerts ---
        if tenant_id:
            firing_rows = await conn.fetch(
                """
                SELECT id, rule_name, severity, fired_at, status
                FROM alert_events
                WHERE status = 'firing'
                  AND tenant_id = $1
                ORDER BY fired_at DESC
                LIMIT 20
                """,
                tenant_id,
            )
        else:
            firing_rows = await conn.fetch(
                """
                SELECT id, rule_name, severity, fired_at, status
                FROM alert_events
                WHERE status = 'firing'
                ORDER BY fired_at DESC
                LIMIT 20
                """,
            )

    stopped = [
        {
            "id": r["id"],
            "name": r["name"],
            "resource_type": r["resource_type"],
            "provider": r["provider"],
            "account_id": r["account_id"],
            "region": r["region"],
            "status": r["status"],
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in stopped_rows
    ]

    stale = [
        {
            "id": r["id"],
            "name": r["name"],
            "resource_type": r["resource_type"],
            "provider": r["provider"],
            "account_id": r["account_id"],
            "region": r["region"],
            "last_seen_at": r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
            "minutes_stale": round(float(r["minutes_stale"]), 1) if r["minutes_stale"] is not None else None,
        }
        for r in stale_rows
    ]

    firing = [
        {
            "event_id": r["id"],
            "rule_name": r["rule_name"],
            "severity": r["severity"],
            "fired_at": r["fired_at"].isoformat() if r["fired_at"] else None,
            "status": r["status"],
        }
        for r in firing_rows
    ]

    stopped_count = len(stopped)
    stale_count = len(stale)
    firing_count = len(firing)

    return {
        "stopped_resources": stopped,
        "stale_resources": stale,
        "firing_alerts": firing,
        "counts": {
            "stopped": stopped_count,
            "stale": stale_count,
            "firing_alerts": firing_count,
            "total_issues": stopped_count + stale_count + firing_count,
        },
    }


async def list_resource_changes(
    tenant_id: str | None,
    resource_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return change history for a specific resource or all resources."""
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"rc.tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if resource_id:
        conditions.append(f"rc.resource_id = ${idx}")
        params.append(resource_id)
        idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT rc.*, r.name AS resource_name, r.resource_type, r.provider
            FROM resource_changes rc
            JOIN resources r ON r.id = rc.resource_id
            WHERE {where}
            ORDER BY rc.detected_at DESC
            LIMIT {limit}
            """,
            *params,
        )

    changes: list[dict] = []
    for r in rows:
        fc = r["field_changes"]
        if isinstance(fc, str):
            fc = orjson.loads(fc)
        changes.append({
            "id": r["id"],
            "resource_id": r["resource_id"],
            "resource_name": r["resource_name"],
            "resource_type": r["resource_type"],
            "provider": r["provider"],
            "change_type": r["change_type"],
            "field_changes": fc,
            "previous_status": r["previous_status"],
            "new_status": r["new_status"],
            "detected_at": r["detected_at"].isoformat() if r["detected_at"] else None,
        })
    return changes


_TAG_KEY_VARIANTS: dict[str, list[str]] = {
    "env": ["env", "Environment", "environment", "Env"],
    "project": ["Project", "project"],
    "team": ["team", "Team"],
    "app": ["app", "Application", "application", "App"],
    "owner": ["Owner", "owner"],
    "service": ["service", "Service"],
    "department": ["department", "Department"],
    "cost-center": ["cost-center", "CostCenter", "cost_center"],
    "stack": ["stack", "Stack"],
    "managed-by": ["ManagedBy", "managed-by", "managed_by"],
}


async def get_resource_grouping(
    tenant_id: str | None,
    group_by: str = "env",
) -> list[dict]:
    """Group resources by a tag key (e.g. env, team, app, project).

    Handles common tag-key casing variations (env/Environment/Env etc.)
    by building a COALESCE across known variants.
    """
    if group_by not in _TAG_KEY_VARIANTS:
        group_by = "env"

    variants = _TAG_KEY_VARIANTS[group_by]
    coalesce_parts = ", ".join(f"tags ->> '{v}'" for v in variants)
    coalesce_expr = f"COALESCE({coalesce_parts}, 'untagged')"

    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                f"""
                SELECT
                    {coalesce_expr} AS group_value,
                    provider,
                    status,
                    COUNT(*) AS cnt
                FROM resources
                WHERE tenant_id = $1
                GROUP BY group_value, provider, status
                ORDER BY cnt DESC
                """,
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                f"""
                SELECT
                    {coalesce_expr} AS group_value,
                    provider,
                    status,
                    COUNT(*) AS cnt
                FROM resources
                GROUP BY group_value, provider, status
                ORDER BY cnt DESC
                """,
            )

    groups: dict[str, dict] = {}
    for r in rows:
        gv = r["group_value"]
        if gv not in groups:
            groups[gv] = {
                "name": gv,
                "total": 0,
                "by_provider": {},
                "by_status": {},
            }
        g = groups[gv]
        cnt = r["cnt"]
        g["total"] += cnt
        prov = r["provider"]
        g["by_provider"][prov] = g["by_provider"].get(prov, 0) + cnt
        st = r["status"]
        g["by_status"][st] = g["by_status"].get(st, 0) + cnt

    return sorted(groups.values(), key=lambda x: x["total"], reverse=True)


async def get_resource_topology(
    tenant_id: str | None,
    account_id: str | None = None,
) -> dict:
    """Infer resource relationships from metadata for topology visualization.

    Relationships are derived from metadata fields like vpc_id, subnet_id,
    attached_instance, security groups, etc.
    """
    conditions: list[str] = []
    params: list = []
    idx = 1

    if tenant_id:
        conditions.append(f"tenant_id = ${idx}")
        params.append(tenant_id)
        idx += 1
    if account_id:
        conditions.append(f"account_id = ${idx}")
        params.append(account_id)
        idx += 1

    where = (" AND ".join(conditions)) if conditions else "TRUE"
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT id, name, resource_type, provider, region, account_id,
                   external_id, metadata, status, tags
            FROM resources WHERE {where}
            ORDER BY resource_type, name
            LIMIT 500
            """,
            *params,
        )

    nodes: list[dict] = []
    edges: list[dict] = []
    ext_id_to_id: dict[str, str] = {}
    name_to_id: dict[str, str] = {}
    synthetic_nodes: dict[str, dict] = {}

    for r in rows:
        meta = r["metadata"]
        if isinstance(meta, str):
            meta = orjson.loads(meta)
        node = {
            "id": r["id"],
            "name": r["name"],
            "resource_type": r["resource_type"],
            "provider": r["provider"],
            "region": r["region"],
            "status": r["status"],
            "external_id": r["external_id"],
        }
        nodes.append(node)
        if r["external_id"]:
            ext_id_to_id[r["external_id"]] = r["id"]
        name_to_id[r["name"]] = r["id"]

    for r in rows:
        source_id = r["id"]
        meta = r["metadata"]
        if isinstance(meta, str):
            meta = orjson.loads(meta)
        rtype = r["resource_type"]

        rel_fields = _TOPOLOGY_RELATIONS.get(rtype, [])
        for field, rel_type, target_type in rel_fields:
            val = meta.get(field)
            if not val or val == "-" or val == "":
                continue
            targets = [val] if isinstance(val, str) else val
            for target_val in targets:
                tv = str(target_val)
                target_id = ext_id_to_id.get(tv)
                if not target_id:
                    target_id = name_to_id.get(tv)
                if not target_id and tv.startswith(("vpc-", "subnet-")):
                    if tv not in synthetic_nodes:
                        synth_type = "vpc" if tv.startswith("vpc-") else "subnet"
                        synthetic_nodes[tv] = {
                            "id": tv,
                            "name": tv,
                            "resource_type": synth_type,
                            "provider": r["provider"],
                            "region": r["region"],
                            "status": "active",
                            "external_id": tv,
                        }
                    target_id = tv
                if target_id and target_id != source_id:
                    edges.append({
                        "source": source_id,
                        "target": target_id,
                        "relation": rel_type,
                    })

    nodes.extend(synthetic_nodes.values())
    return {"nodes": nodes, "edges": edges}


_TOPOLOGY_RELATIONS: dict[str, list[tuple[str, str, str]]] = {
    "ec2": [
        ("vpc_id", "belongs_to", "vpc"),
        ("subnet_id", "belongs_to", "subnet"),
        ("attached_volumes", "uses", "ebs"),
    ],
    "ebs": [
        ("attached_instance", "attached_to", "ec2"),
    ],
    "rds": [
        ("vpc_id", "belongs_to", "vpc"),
    ],
    "alb": [
        ("vpc_id", "belongs_to", "vpc"),
    ],
    "nlb": [
        ("vpc_id", "belongs_to", "vpc"),
    ],
    "lambda": [
        ("vpc_id", "belongs_to", "vpc"),
    ],
    "nat_gateway": [
        ("vpc_id", "belongs_to", "vpc"),
        ("subnet_id", "belongs_to", "subnet"),
    ],
    "elasticache": [
        ("vpc_id", "belongs_to", "vpc"),
    ],
    "ecs_service": [
        ("cluster_arn", "runs_on", "ecs_cluster"),
    ],
    "azure_vm": [
        ("vnet_id", "belongs_to", "azure_vnet"),
    ],
    "azure_disk": [
        ("managed_by", "attached_to", "azure_vm"),
    ],
    "azure_nsg": [
        ("vnet_id", "belongs_to", "azure_vnet"),
    ],
}


async def get_resource_summary(tenant_id: str | None) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if tenant_id:
            rows = await conn.fetch(
                """
                SELECT resource_type, provider, status, COUNT(*) AS cnt
                FROM resources WHERE tenant_id = $1 AND status != 'removed'
                GROUP BY resource_type, provider, status
                ORDER BY resource_type
                """,
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT resource_type, provider, status, COUNT(*) AS cnt
                FROM (
                    SELECT DISTINCT ON (external_id) resource_type, provider, status
                    FROM resources
                    WHERE status != 'removed'
                    ORDER BY external_id, updated_at DESC
                ) deduped
                GROUP BY resource_type, provider, status
                ORDER BY resource_type
                """,
            )
    summary: dict = {"total": 0, "by_type": {}, "by_provider": {}, "by_status": {}}
    for r in rows:
        cnt = r["cnt"]
        summary["total"] += cnt
        rt = r["resource_type"]
        prov = r["provider"]
        st = r["status"]
        summary["by_type"][rt] = summary["by_type"].get(rt, 0) + cnt
        summary["by_provider"][prov] = summary["by_provider"].get(prov, 0) + cnt
        summary["by_status"][st] = summary["by_status"].get(st, 0) + cnt
    return summary


def _row_to_resource(row) -> Resource:
    tags = row["tags"]
    if isinstance(tags, str):
        tags = orjson.loads(tags)
    meta = row["metadata"]
    if isinstance(meta, str):
        meta = orjson.loads(meta)
    return Resource(
        id=row["id"],
        tenant_id=row["tenant_id"],
        resource_type=row["resource_type"],
        provider=row["provider"],
        region=row["region"],
        account_id=row["account_id"],
        name=row["name"],
        external_id=row["external_id"],
        tags=tags,
        metadata=meta,
        status=row["status"],
        last_seen_at=row["last_seen_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def reconcile_stale_resources(
    tenant_id: str,
    account_id: str,
    provider: str,
    cycle_start: datetime,
) -> int:
    """Mark resources that were NOT seen in the latest discovery cycle as removed.

    Any resource belonging to this (tenant, account, provider) whose
    ``last_seen_at`` is older than *cycle_start* gets status='removed'.
    Returns the number of resources removed.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE resources
            SET status = 'removed', updated_at = NOW()
            WHERE tenant_id = $1
              AND account_id = $2
              AND provider = $3
              AND status != 'removed'
              AND last_seen_at < $4
            """,
            tenant_id, account_id, provider, cycle_start,
        )
    count = int(result.split()[-1]) if result else 0
    return count
