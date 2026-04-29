
from neoguard.db.clickhouse.connection import get_clickhouse
from neoguard.models.logs import LogEntry, LogQuery, LogQueryResult, LogSeverity


async def query_logs(q: LogQuery) -> LogQueryResult:
    tenant_id = q.tenant_id or "default"

    conditions = ["tenant_id = {tenant_id:String}"]
    params: dict = {"tenant_id": tenant_id}

    if q.service:
        conditions.append("service = {service:String}")
        params["service"] = q.service

    if q.severity:
        conditions.append("severity = {severity:String}")
        params["severity"] = q.severity.value

    if q.start:
        conditions.append("timestamp >= {start:DateTime64(9)}")
        params["start"] = q.start

    if q.end:
        conditions.append("timestamp < {end:DateTime64(9)}")
        params["end"] = q.end

    if q.query:
        conditions.append("message ILIKE {query:String}")
        params["query"] = f"%{q.query}%"

    where = " AND ".join(conditions)

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
