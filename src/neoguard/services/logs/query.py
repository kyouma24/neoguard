from datetime import datetime

from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.models.logs import LogEntry, LogQuery, LogQueryResult, LogSeverity


def _build_conditions(
    tenant_id: str | None,
    start: datetime | None = None,
    end: datetime | None = None,
    service: str | None = None,
    severity: str | None = None,
    query: str | None = None,
) -> tuple[str, dict]:
    conditions: list[str] = []
    params: dict = {}

    if tenant_id:
        conditions.append("tenant_id = {tenant_id:String}")
        params["tenant_id"] = tenant_id

    if service:
        conditions.append("service = {service:String}")
        params["service"] = service

    if severity:
        conditions.append("severity = {severity:String}")
        params["severity"] = severity

    if start:
        conditions.append("timestamp >= {start:DateTime64(9)}")
        params["start"] = start

    if end:
        conditions.append("timestamp < {end:DateTime64(9)}")
        params["end"] = end

    if query:
        conditions.append("message ILIKE {query:String}")
        params["query"] = f"%{query}%"

    where = (" AND ".join(conditions)) if conditions else "1 = 1"
    return where, params


async def query_logs(q: LogQuery) -> LogQueryResult:
    where, params = _build_conditions(
        tenant_id=q.tenant_id,
        start=q.start,
        end=q.end,
        service=q.service,
        severity=q.severity.value if q.severity else None,
        query=q.query,
    )

    client = await get_clickhouse()

    count_sql = f"SELECT count() AS cnt FROM logs WHERE {where}"
    count_result = await client.query(count_sql, parameters=params)
    total = count_result.result_rows[0][0] if count_result.result_rows else 0

    data_sql = f"""
        SELECT timestamp, trace_id, span_id, severity, service, message, attributes, resource
        FROM logs
        WHERE {where}
        ORDER BY timestamp DESC
        LIMIT {{limit:UInt32}} OFFSET {{offset:UInt32}}
    """
    params["limit"] = q.limit
    params["offset"] = q.offset

    result = await client.query(data_sql, parameters=params)

    logs = []
    for row in result.result_rows:
        logs.append(LogEntry(
            timestamp=row[0],
            trace_id=row[1],
            span_id=row[2],
            severity=LogSeverity(row[3]),
            service=row[4],
            message=row[5],
            attributes=dict(row[6]) if row[6] else {},
            resource=dict(row[7]) if row[7] else {},
        ))

    return LogQueryResult(
        logs=logs,
        total=total,
        has_more=(q.offset + q.limit) < total,
    )


async def query_log_histogram(
    tenant_id: str | None,
    start: datetime,
    end: datetime,
    service: str | None = None,
    severity: str | None = None,
    query: str | None = None,
    buckets: int = 50,
) -> dict:
    where, params = _build_conditions(
        tenant_id=tenant_id,
        start=start,
        end=end,
        service=service,
        severity=severity,
        query=query,
    )

    total_seconds = int((end - start).total_seconds())
    interval_seconds = max(1, total_seconds // buckets)

    sql = f"""
        SELECT
            toStartOfInterval(timestamp, INTERVAL {{interval:UInt32}} second) AS bucket,
            severity,
            count() AS cnt
        FROM logs
        WHERE {where}
        GROUP BY bucket, severity
        ORDER BY bucket ASC
    """
    params["interval"] = interval_seconds

    client = await get_clickhouse()
    result = await client.query(sql, parameters=params)

    bucket_map: dict[str, dict[str, int]] = {}
    for row in result.result_rows:
        ts_str = row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0])
        sev = row[1]
        cnt = row[2]
        if ts_str not in bucket_map:
            bucket_map[ts_str] = {}
        bucket_map[ts_str][sev] = cnt

    histogram_buckets = []
    for ts_str, sev_counts in sorted(bucket_map.items()):
        total_count = sum(sev_counts.values())
        histogram_buckets.append({
            "timestamp": ts_str,
            "count": total_count,
            "severity_counts": sev_counts,
        })

    return {
        "buckets": histogram_buckets,
        "interval_seconds": interval_seconds,
    }


async def query_log_facets(
    tenant_id: str | None,
    start: datetime,
    end: datetime,
    query: str | None = None,
    service: str | None = None,
    severity: str | None = None,
) -> dict:
    where, params = _build_conditions(
        tenant_id=tenant_id,
        start=start,
        end=end,
        service=service,
        severity=severity,
        query=query,
    )

    client = await get_clickhouse()

    sev_sql = f"""
        SELECT severity, count() AS cnt
        FROM logs
        WHERE {where}
        GROUP BY severity
        ORDER BY cnt DESC
    """
    sev_result = await client.query(sev_sql, parameters=params)
    severity_facets = [{"value": row[0], "count": row[1]} for row in sev_result.result_rows]

    svc_sql = f"""
        SELECT service, count() AS cnt
        FROM logs
        WHERE {where}
        GROUP BY service
        ORDER BY cnt DESC
        LIMIT 20
    """
    svc_result = await client.query(svc_sql, parameters=params)
    service_facets = [{"value": row[0], "count": row[1]} for row in svc_result.result_rows]

    return {
        "severity": severity_facets,
        "service": service_facets,
    }
