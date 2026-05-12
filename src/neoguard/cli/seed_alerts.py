"""Seed demo alert rules, events, and silences for demo presentations."""

import asyncio
import random
from datetime import UTC, datetime, timedelta

import orjson
from ulid import ULID

from neoguard.db.timescale.connection import get_pool


ALERT_RULES = [
    {
        "name": "High CPU Utilization",
        "description": "Alert when average CPU usage exceeds 85% for 3 minutes",
        "metric_name": "aws.ec2.cpu_utilization",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 85.0,
        "duration_sec": 180,
        "interval_sec": 60,
        "severity": "P2",
        "aggregation": "avg",
        "cooldown_sec": 600,
        "nodata_action": "keep",
    },
    {
        "name": "Memory Usage Critical",
        "description": "Fires when memory utilization exceeds 90% across any instance",
        "metric_name": "aws.ec2.memory_utilization",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 90.0,
        "duration_sec": 120,
        "interval_sec": 30,
        "severity": "P1",
        "aggregation": "max",
        "cooldown_sec": 300,
        "nodata_action": "alert",
    },
    {
        "name": "Disk Space Low",
        "description": "Alert when disk usage exceeds 80% on any EBS volume",
        "metric_name": "aws.ebs.volume_used_percent",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 80.0,
        "duration_sec": 300,
        "interval_sec": 120,
        "severity": "P2",
        "aggregation": "max",
        "cooldown_sec": 1800,
        "nodata_action": "ok",
    },
    {
        "name": "API Error Rate Spike",
        "description": "Fires when 5xx error rate exceeds 5% of total requests",
        "metric_name": "aws.alb.http_5xx_rate",
        "tags_filter": {"environment": "production"},
        "condition": "gt",
        "threshold": 5.0,
        "duration_sec": 60,
        "interval_sec": 30,
        "severity": "P1",
        "aggregation": "avg",
        "cooldown_sec": 300,
        "nodata_action": "ok",
    },
    {
        "name": "Latency P99 High",
        "description": "Alert when P99 response time exceeds 2 seconds",
        "metric_name": "aws.alb.target_response_time",
        "tags_filter": {"environment": "production"},
        "condition": "gt",
        "threshold": 2000.0,
        "duration_sec": 120,
        "interval_sec": 30,
        "severity": "P2",
        "aggregation": "p99",
        "cooldown_sec": 600,
        "nodata_action": "ok",
    },
    {
        "name": "RDS Connection Pool Exhaustion",
        "description": "Fires when database connections exceed 80% of max",
        "metric_name": "aws.rds.database_connections",
        "tags_filter": {"engine": "postgres"},
        "condition": "gt",
        "threshold": 400.0,
        "duration_sec": 120,
        "interval_sec": 60,
        "severity": "P2",
        "aggregation": "max",
        "cooldown_sec": 600,
        "nodata_action": "keep",
    },
    {
        "name": "DynamoDB Throttled Requests",
        "description": "Alert when DynamoDB throttles exceed 10 per minute",
        "metric_name": "aws.dynamodb.throttled_requests",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 10.0,
        "duration_sec": 60,
        "interval_sec": 30,
        "severity": "P3",
        "aggregation": "sum",
        "cooldown_sec": 300,
        "nodata_action": "ok",
    },
    {
        "name": "Lambda Duration Anomaly",
        "description": "Alert when Lambda function duration exceeds 10 seconds (timeout risk)",
        "metric_name": "aws.lambda.duration",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 10000.0,
        "duration_sec": 60,
        "interval_sec": 30,
        "severity": "P3",
        "aggregation": "p95",
        "cooldown_sec": 600,
        "nodata_action": "ok",
    },
    {
        "name": "SQS Dead Letter Queue Growing",
        "description": "Fires when DLQ depth exceeds 100 messages",
        "metric_name": "aws.sqs.approximate_number_of_messages",
        "tags_filter": {"queue_type": "dlq"},
        "condition": "gt",
        "threshold": 100.0,
        "duration_sec": 300,
        "interval_sec": 120,
        "severity": "P2",
        "aggregation": "last",
        "cooldown_sec": 1800,
        "nodata_action": "ok",
    },
    {
        "name": "Network Packet Loss",
        "description": "Alert on network packet loss exceeding 1%",
        "metric_name": "aws.ec2.network_packets_dropped",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 1.0,
        "duration_sec": 180,
        "interval_sec": 60,
        "severity": "P3",
        "aggregation": "avg",
        "cooldown_sec": 600,
        "nodata_action": "ok",
    },
    {
        "name": "Azure VM CPU Critical",
        "description": "Azure virtual machine CPU exceeds 90% sustained",
        "metric_name": "azure.vm.cpu_percent",
        "tags_filter": {"resource_group": "production"},
        "condition": "gt",
        "threshold": 90.0,
        "duration_sec": 180,
        "interval_sec": 60,
        "severity": "P1",
        "aggregation": "avg",
        "cooldown_sec": 600,
        "nodata_action": "keep",
    },
    {
        "name": "S3 Bucket 4xx Errors",
        "description": "High rate of client errors on S3 bucket operations",
        "metric_name": "aws.s3.4xx_errors",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 50.0,
        "duration_sec": 120,
        "interval_sec": 60,
        "severity": "P4",
        "aggregation": "sum",
        "cooldown_sec": 300,
        "nodata_action": "ok",
    },
    {
        "name": "ECS Task Failure Rate",
        "description": "ECS tasks failing to start exceeds threshold",
        "metric_name": "aws.ecs.task_failures",
        "tags_filter": {"cluster": "production"},
        "condition": "gt",
        "threshold": 3.0,
        "duration_sec": 120,
        "interval_sec": 60,
        "severity": "P2",
        "aggregation": "count",
        "cooldown_sec": 600,
        "nodata_action": "ok",
    },
    {
        "name": "CloudFront Origin Latency",
        "description": "CDN origin response time exceeds 5 seconds",
        "metric_name": "aws.cloudfront.origin_latency",
        "tags_filter": {},
        "condition": "gt",
        "threshold": 5000.0,
        "duration_sec": 180,
        "interval_sec": 60,
        "severity": "P3",
        "aggregation": "p95",
        "cooldown_sec": 900,
        "nodata_action": "ok",
    },
    {
        "name": "Healthy Host Count Low",
        "description": "Alert when healthy targets drop below minimum",
        "metric_name": "aws.alb.healthy_host_count",
        "tags_filter": {},
        "condition": "lt",
        "threshold": 2.0,
        "duration_sec": 60,
        "interval_sec": 30,
        "severity": "P1",
        "aggregation": "min",
        "cooldown_sec": 300,
        "nodata_action": "alert",
    },
]


def _gen_events(rules: list[dict], tenant_id: str, now: datetime) -> list[dict]:
    """Generate realistic alert events for the past 48 hours."""
    events = []

    scenarios = [
        {"rule_idx": 0, "status": "firing", "value": 92.3, "hours_ago": 0.5},
        {"rule_idx": 0, "status": "resolved", "value": 87.1, "hours_ago": 3, "resolved_hours_ago": 2.5},
        {"rule_idx": 1, "status": "firing", "value": 94.7, "hours_ago": 0.2},
        {"rule_idx": 1, "status": "resolved", "value": 91.2, "hours_ago": 6, "resolved_hours_ago": 5.5},
        {"rule_idx": 3, "status": "firing", "value": 8.4, "hours_ago": 0.1},
        {"rule_idx": 3, "status": "resolved", "value": 6.2, "hours_ago": 12, "resolved_hours_ago": 11.8},
        {"rule_idx": 4, "status": "resolved", "value": 2450.0, "hours_ago": 18, "resolved_hours_ago": 17.5},
        {"rule_idx": 5, "status": "resolved", "value": 423.0, "hours_ago": 24, "resolved_hours_ago": 23},
        {"rule_idx": 8, "status": "firing", "value": 247.0, "hours_ago": 1},
        {"rule_idx": 10, "status": "resolved", "value": 93.1, "hours_ago": 8, "resolved_hours_ago": 7},
        {"rule_idx": 14, "status": "firing", "value": 1.0, "hours_ago": 0.05},
        {"rule_idx": 2, "status": "resolved", "value": 83.2, "hours_ago": 36, "resolved_hours_ago": 35},
        {"rule_idx": 7, "status": "resolved", "value": 12500.0, "hours_ago": 30, "resolved_hours_ago": 29.5},
        {"rule_idx": 6, "status": "resolved", "value": 15.0, "hours_ago": 20, "resolved_hours_ago": 19},
        {"rule_idx": 9, "status": "resolved", "value": 2.3, "hours_ago": 42, "resolved_hours_ago": 41},
        {"rule_idx": 12, "status": "resolved", "value": 5.0, "hours_ago": 15, "resolved_hours_ago": 14.5},
        {"rule_idx": 13, "status": "resolved", "value": 6200.0, "hours_ago": 22, "resolved_hours_ago": 21},
        {"rule_idx": 0, "status": "resolved", "value": 88.5, "hours_ago": 40, "resolved_hours_ago": 39},
        {"rule_idx": 3, "status": "resolved", "value": 7.8, "hours_ago": 32, "resolved_hours_ago": 31},
        {"rule_idx": 1, "status": "resolved", "value": 92.0, "hours_ago": 44, "resolved_hours_ago": 43.5},
        {"rule_idx": 11, "status": "resolved", "value": 72.0, "hours_ago": 10, "resolved_hours_ago": 9.5},
    ]

    for sc in scenarios:
        rule = rules[sc["rule_idx"]]
        fired_at = now - timedelta(hours=sc["hours_ago"])
        resolved_at = (
            now - timedelta(hours=sc["resolved_hours_ago"])
            if "resolved_hours_ago" in sc
            else None
        )
        ack_at = None
        ack_by = ""
        if sc["status"] == "resolved" and random.random() > 0.3:
            ack_at = fired_at + timedelta(minutes=random.randint(2, 30))
            ack_by = random.choice(["admin", "ops-team", "sre-oncall", "devops-bot"])

        events.append({
            "id": str(ULID()),
            "tenant_id": tenant_id,
            "rule_id": rule["_id"],
            "rule_name": rule["name"],
            "severity": rule["severity"],
            "status": sc["status"],
            "value": sc["value"],
            "threshold": rule["threshold"],
            "message": f'{rule["name"]}: {rule["metric_name"]} is {sc["value"]} (threshold: {rule["condition"]} {rule["threshold"]})',
            "notification_meta": orjson.dumps({}).decode(),
            "fired_at": fired_at,
            "resolved_at": resolved_at,
            "acknowledged_at": ack_at,
            "acknowledged_by": ack_by,
        })

    return events


def _gen_silences(rules: list[dict], tenant_id: str, now: datetime) -> list[dict]:
    """Generate demo silences."""
    silences = []

    silences.append({
        "id": str(ULID()),
        "tenant_id": tenant_id,
        "name": "Planned Maintenance Window",
        "comment": "Weekly database maintenance — suppress disk and connection alerts",
        "rule_ids": orjson.dumps([rules[2]["_id"], rules[5]["_id"]]).decode(),
        "matchers": orjson.dumps({}).decode(),
        "starts_at": now + timedelta(hours=2),
        "ends_at": now + timedelta(hours=4),
        "timezone": "Asia/Kolkata",
        "recurring": False,
        "recurrence_days": orjson.dumps([]).decode(),
        "recurrence_start_time": None,
        "recurrence_end_time": None,
        "enabled": True,
        "created_by": "ops-team",
    })

    silences.append({
        "id": str(ULID()),
        "tenant_id": tenant_id,
        "name": "Nightly Batch Window",
        "comment": "Suppress CPU/Lambda alerts during nightly ETL batch processing",
        "rule_ids": orjson.dumps([rules[0]["_id"], rules[7]["_id"]]).decode(),
        "matchers": orjson.dumps({"environment": "production"}).decode(),
        "starts_at": now - timedelta(hours=2),
        "ends_at": now + timedelta(hours=22),
        "timezone": "Asia/Kolkata",
        "recurring": True,
        "recurrence_days": orjson.dumps(["mon", "tue", "wed", "thu", "fri"]).decode(),
        "recurrence_start_time": "02:00",
        "recurrence_end_time": "04:00",
        "enabled": True,
        "created_by": "sre-oncall",
    })

    silences.append({
        "id": str(ULID()),
        "tenant_id": tenant_id,
        "name": "Deploy Cooldown",
        "comment": "Suppress error rate alerts for 30 min after each deployment",
        "rule_ids": orjson.dumps([rules[3]["_id"], rules[4]["_id"]]).decode(),
        "matchers": orjson.dumps({"service": "api-gateway"}).decode(),
        "starts_at": now - timedelta(hours=1),
        "ends_at": now - timedelta(minutes=30),
        "timezone": "Asia/Kolkata",
        "recurring": False,
        "recurrence_days": orjson.dumps([]).decode(),
        "recurrence_start_time": None,
        "recurrence_end_time": None,
        "enabled": False,
        "created_by": "ci-cd-pipeline",
    })

    silences.append({
        "id": str(ULID()),
        "tenant_id": tenant_id,
        "name": "Weekend Non-Critical",
        "comment": "Suppress P3/P4 alerts on weekends — only P1/P2 page oncall",
        "rule_ids": orjson.dumps([]).decode(),
        "matchers": orjson.dumps({"severity": "P3"}).decode(),
        "starts_at": now - timedelta(days=1),
        "ends_at": now + timedelta(days=6),
        "timezone": "Asia/Kolkata",
        "recurring": True,
        "recurrence_days": orjson.dumps(["sat", "sun"]).decode(),
        "recurrence_start_time": "00:00",
        "recurrence_end_time": "23:59",
        "enabled": True,
        "created_by": "platform-admin",
    })

    return silences


async def seed_alerts(tenant_id: str, clear_existing: bool = True) -> dict:
    """Seed demo alerts for the given tenant."""
    pool = await get_pool()
    now = datetime.now(UTC)
    stats = {"rules": 0, "events": 0, "silences": 0}

    async with pool.acquire() as conn:
        if clear_existing:
            await conn.execute("DELETE FROM alert_events WHERE tenant_id = $1", tenant_id)
            await conn.execute("DELETE FROM alert_silences WHERE tenant_id = $1", tenant_id)
            await conn.execute("DELETE FROM alert_rules WHERE tenant_id = $1", tenant_id)

        created_rules = []
        for rule_def in ALERT_RULES:
            rule_id = str(ULID())
            enabled = random.random() > 0.15
            await conn.execute(
                """
                INSERT INTO alert_rules (id, tenant_id, name, description, metric_name, tags_filter,
                    condition, threshold, duration_sec, interval_sec, severity, notification,
                    aggregation, cooldown_sec, nodata_action, enabled)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                """,
                rule_id, tenant_id, rule_def["name"], rule_def["description"],
                rule_def["metric_name"], orjson.dumps(rule_def["tags_filter"]).decode(),
                rule_def["condition"], rule_def["threshold"], rule_def["duration_sec"],
                rule_def["interval_sec"], rule_def["severity"],
                orjson.dumps({"channel_ids": []}).decode(),
                rule_def["aggregation"], rule_def["cooldown_sec"], rule_def["nodata_action"],
                enabled,
            )
            created_rules.append({**rule_def, "_id": rule_id})
            stats["rules"] += 1

        events = _gen_events(created_rules, tenant_id, now)
        for evt in events:
            await conn.execute(
                """
                INSERT INTO alert_events (id, tenant_id, rule_id, rule_name, severity, status,
                    value, threshold, message, notification_meta, fired_at, resolved_at,
                    acknowledged_at, acknowledged_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                """,
                evt["id"], evt["tenant_id"], evt["rule_id"], evt["rule_name"],
                evt["severity"], evt["status"], evt["value"], evt["threshold"],
                evt["message"], evt["notification_meta"], evt["fired_at"],
                evt["resolved_at"], evt["acknowledged_at"], evt["acknowledged_by"],
            )
            stats["events"] += 1

        silences = _gen_silences(created_rules, tenant_id, now)
        for sil in silences:
            await conn.execute(
                """
                INSERT INTO alert_silences (id, tenant_id, name, comment, rule_ids, matchers,
                    starts_at, ends_at, timezone, recurring, recurrence_days,
                    recurrence_start_time, recurrence_end_time, enabled, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                """,
                sil["id"], sil["tenant_id"], sil["name"], sil["comment"],
                sil["rule_ids"], sil["matchers"], sil["starts_at"], sil["ends_at"],
                sil["timezone"], sil["recurring"], sil["recurrence_days"],
                sil["recurrence_start_time"], sil["recurrence_end_time"],
                sil["enabled"], sil["created_by"],
            )
            stats["silences"] += 1

    return stats


def run_seed(tenant_id: str) -> None:
    """Entry point for CLI."""
    import os
    os.environ.setdefault("NEOGUARD_DB_PORT", "5433")

    async def _run():
        from neoguard.db.timescale.connection import init_pool, close_pool
        await init_pool()
        try:
            stats = await seed_alerts(tenant_id)
            print(f"Seeded alerts for tenant {tenant_id}:")
            print(f"  Rules:    {stats['rules']}")
            print(f"  Events:   {stats['events']}")
            print(f"  Silences: {stats['silences']}")
        finally:
            await close_pool()

    asyncio.run(_run())
