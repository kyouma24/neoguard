"""Generate realistic demo logs for NeoGuard demo calls.

Produces diverse log entries across multiple services, severities,
and message formats (plain text, JSON, stack traces, key=value).
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import UTC, datetime, timedelta

import clickhouse_connect

from neoguard.core.config import settings

SERVICES = [
    "api-gateway",
    "auth-service",
    "payment-service",
    "user-service",
    "notification-service",
    "order-service",
    "inventory-service",
    "search-service",
    "billing-service",
    "analytics-engine",
    "cache-warmer",
    "scheduler",
]

ENDPOINTS = [
    "/api/v1/users",
    "/api/v1/orders",
    "/api/v1/payments/charge",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
    "/api/v1/inventory/check",
    "/api/v1/notifications/send",
    "/api/v1/search/query",
    "/api/v1/billing/invoice",
    "/api/v1/analytics/events",
    "/health",
    "/metrics",
]

HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "NeoGuard-Agent/2.1.0",
    "PostmanRuntime/7.32.3",
    "python-requests/2.31.0",
    "okhttp/4.12.0",
]

ERROR_MESSAGES = [
    "Connection refused to downstream service",
    "Request timeout after 30000ms",
    "Circuit breaker OPEN for payment-service",
    "Rate limit exceeded: 429 Too Many Requests",
    "Database connection pool exhausted (max: 50, active: 50)",
    "TLS handshake failed: certificate expired",
    "Out of memory: heap allocation failed (requested 256MB)",
    "Deadlock detected on transaction T-8847291",
    "DNS resolution failed for redis-primary.internal",
    "Disk I/O latency spike detected: 850ms avg (threshold: 100ms)",
    "Invalid JWT: token signature verification failed",
    "Foreign key constraint violation: order_id references non-existent record",
    "Kafka consumer lag exceeding threshold: partition 3, lag 150000",
    "S3 PutObject failed: AccessDenied (bucket: prod-artifacts-us-east-1)",
    "gRPC deadline exceeded: upstream inventory-service (2000ms timeout)",
]

WARN_MESSAGES = [
    "Slow query detected: SELECT * FROM orders took 4.2s",
    "Memory usage at 85% (6.8GB / 8GB) — approaching OOM threshold",
    "Connection pool nearing capacity: 42/50 active connections",
    "Retry attempt 3/5 for downstream call to notification-service",
    "Cache miss rate elevated: 34% (normal: <10%)",
    "Response time degraded: p99=1.2s (SLO target: 500ms)",
    "Certificate expiring in 7 days: *.api.neoguard.io",
    "Deprecated API version v1 called — sunset date 2026-06-01",
    "Disk usage at 78% on /var/lib/postgresql/data",
    "Background job queue depth: 2,847 (normal: <500)",
    "Stale cache entries detected: 1,203 keys expired but not evicted",
    "High GC pressure: 180ms pause observed (threshold: 50ms)",
]

INFO_MESSAGES_TEMPLATES = [
    'HTTP {method} {endpoint} completed in {latency}ms status={status}',
    'User {user_id} authenticated successfully from {ip}',
    'Order {order_id} created: total=${amount:.2f}, items={items}',
    'Payment processed: txn={txn_id} amount=${amount:.2f} provider=stripe',
    'Email notification sent to {email} template={template}',
    'Cache invalidated: key={cache_key} reason=write-through',
    'Background job completed: type={job_type} duration={duration}ms',
    'Database migration applied: version={version} tables_affected={tables}',
    'Health check passed: all {count} dependencies healthy',
    'Deployment marker recorded: service={service} commit={commit}',
    'Rate limiter reset: tenant={tenant} bucket={bucket} tokens=100',
    'Metric ingestion batch: {count} points written in {duration}ms',
]

DEBUG_MESSAGES = [
    "Entering request handler: correlation_id={corr_id}",
    "Cache lookup: key=user:profile:{user_id} hit=true ttl=842s",
    "SQL prepared statement executed: rows_affected=1 duration=2ms",
    "WebSocket frame received: type=ping payload_size=0",
    "Thread pool stats: active=3 idle=7 queued=0 max=10",
    "Serializing response: content_type=application/json size=4.2KB",
    "Connection acquired from pool: wait_time=0ms pool_id=primary",
    "Token refresh: old_exp={old_exp} new_exp={new_exp}",
]

STACK_TRACES = [
    '''Traceback (most recent call last):
  File "/app/services/payment.py", line 142, in process_charge
    response = await stripe_client.charges.create(amount=amount, currency="usd")
  File "/app/lib/stripe/client.py", line 89, in create
    return await self._post("/v1/charges", data=payload)
  File "/app/lib/http.py", line 45, in _post
    raise TimeoutError(f"Request timed out after {self.timeout}ms")
TimeoutError: Request timed out after 30000ms''',
    '''java.lang.NullPointerException: Cannot invoke "String.length()" because "str" is null
    at com.neoguard.service.UserService.validateInput(UserService.java:234)
    at com.neoguard.api.UserController.createUser(UserController.java:87)
    at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
    at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:897)''',
    '''panic: runtime error: index out of range [5] with length 3

goroutine 1 [running]:
main.processMetrics(0xc000104000, 0x3, 0x5)
    /app/cmd/collector/main.go:147 +0x1a2
main.(*MetricBatcher).Flush(0xc0001a4000)
    /app/cmd/collector/batcher.go:89 +0x64
main.main()
    /app/cmd/collector/main.go:52 +0x2f8''',
    '''Error: ECONNREFUSED 127.0.0.1:6379
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)
    at RedisClient.connect (/app/node_modules/redis/lib/client.js:178:12)
    at CacheService.get (/app/src/services/cache.ts:45:22)
    at OrderController.getOrder (/app/src/controllers/order.ts:67:18)
    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)''',
    '''sqlalchemy.exc.OperationalError: (psycopg2.OperationalError) could not connect to server: Connection refused
    Is the server running on host "db-primary.internal" (10.0.3.45) and accepting TCP/IP connections on port 5432?

[SQL: SELECT users.id, users.email FROM users WHERE users.tenant_id = %(tenant_id)s]
[parameters: {'tenant_id': 'tenant_abc123'}]''',
]

JSON_MESSAGES: list[str] = []


def _build_json_message() -> str:
    """Generate a random structured JSON log message."""
    import json
    templates = [
        lambda: json.dumps({"event": "user.signup", "user_id": _rand_user_id(), "email": random.choice(EMAILS), "plan": "pro", "source": "organic", "utm_campaign": "summer_launch"}),
        lambda: json.dumps({"event": "payment.failed", "txn_id": _rand_txn_id(), "amount": round(random.uniform(10, 5000), 2), "currency": "USD", "error_code": "card_declined", "retry_count": 2}),
        lambda: json.dumps({"event": "deployment.started", "service": random.choice(SERVICES), "commit": _rand_commit(), "author": random.choice(["alice", "bob", "charlie", "deploy-bot"]), "branch": "main", "environment": "production"}),
        lambda: json.dumps({"event": "alert.fired", "rule_id": f"rule_{uuid.uuid4().hex[:8]}", "metric": "cpu_utilization", "value": round(random.uniform(85, 99), 1), "threshold": 90, "duration_sec": 180, "severity": "critical"}),
        lambda: json.dumps({"event": "circuit_breaker.opened", "service": random.choice(SERVICES), "failure_count": 5, "threshold": 3, "half_open_after_ms": 30000}),
        lambda: json.dumps({"event": "cache.eviction", "cache_name": "user_sessions", "evicted_keys": random.randint(100, 5000), "reason": "memory_pressure", "current_mb": 1024, "max_mb": 1024}),
        lambda: json.dumps({"event": "query.slow", "duration_ms": random.randint(1000, 30000), "query": "SELECT o.* FROM orders o JOIN users u ON o.user_id = u.id WHERE u.tenant_id = $1", "rows_examined": random.randint(10000, 1000000)}),
    ]
    return random.choice(templates)()

FATAL_MESSAGES = [
    "FATAL: PostgreSQL primary unreachable after 5 retries — entering read-only mode",
    "FATAL: Unrecoverable data corruption detected in WAL segment 0000000100000003",
    "FATAL: Process received SIGKILL — OOM killer invoked (RSS: 7.8GB, limit: 8GB)",
    "FATAL: Configuration validation failed on startup — missing required secret: STRIPE_API_KEY",
    "FATAL: Cluster split-brain detected — refusing to accept writes until quorum restored",
]

IPS = [
    "10.0.1.45", "10.0.2.112", "10.0.3.7", "172.16.0.88",
    "192.168.1.100", "203.0.113.42", "198.51.100.73",
]

EMAILS = [
    "alice@company.com", "bob@startup.io", "charlie@enterprise.co",
    "deploy-bot@neoguard.io", "ci@github.internal",
]

REGIONS = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
ENVS = ["production", "staging", "development"]
HOSTS = [
    "api-prod-01", "api-prod-02", "worker-prod-01", "worker-prod-02",
    "scheduler-prod-01", "cache-prod-01", "db-primary", "db-replica-01",
]


def _rand_trace_id() -> str:
    return uuid.uuid4().hex


def _rand_span_id() -> str:
    return uuid.uuid4().hex[:16]


def _rand_user_id() -> str:
    return f"usr_{uuid.uuid4().hex[:12]}"


def _rand_order_id() -> str:
    return f"ord_{uuid.uuid4().hex[:10]}"


def _rand_txn_id() -> str:
    return f"txn_{uuid.uuid4().hex[:14]}"


def _rand_commit() -> str:
    return uuid.uuid4().hex[:7]


def _generate_info_message() -> str:
    template = random.choice(INFO_MESSAGES_TEMPLATES)
    return template.format(
        method=random.choice(HTTP_METHODS),
        endpoint=random.choice(ENDPOINTS),
        latency=random.randint(2, 450),
        status=random.choice([200, 200, 200, 201, 204, 301, 304]),
        user_id=_rand_user_id(),
        ip=random.choice(IPS),
        order_id=_rand_order_id(),
        amount=random.uniform(9.99, 999.99),
        items=random.randint(1, 12),
        txn_id=_rand_txn_id(),
        email=random.choice(EMAILS),
        template=random.choice(["welcome", "order_confirm", "password_reset", "invoice"]),
        cache_key=f"user:session:{uuid.uuid4().hex[:8]}",
        job_type=random.choice(["email_send", "report_gen", "cleanup", "sync"]),
        duration=random.randint(50, 5000),
        version=f"00{random.randint(1, 99)}",
        tables=random.randint(1, 5),
        count=random.randint(3, 12),
        service=random.choice(SERVICES),
        commit=_rand_commit(),
        tenant=f"tenant_{uuid.uuid4().hex[:6]}",
        bucket=random.choice(["api", "ingest", "query"]),
    )


def _generate_debug_message() -> str:
    template = random.choice(DEBUG_MESSAGES)
    return template.format(
        corr_id=uuid.uuid4().hex[:16],
        user_id=_rand_user_id(),
        old_exp="2026-05-05T10:00:00Z",
        new_exp="2026-05-05T11:00:00Z",
    )


def _generate_json_message() -> str:
    return _build_json_message()


def _generate_log_entry(ts: datetime, tenant_id: str) -> list:
    severity_weights = {
        "info": 50,
        "debug": 20,
        "warn": 15,
        "error": 10,
        "fatal": 2,
        "trace": 3,
    }
    severity = random.choices(
        list(severity_weights.keys()),
        weights=list(severity_weights.values()),
        k=1,
    )[0]

    service = random.choice(SERVICES)
    trace_id = _rand_trace_id() if random.random() > 0.3 else ""
    span_id = _rand_span_id() if trace_id else ""

    if severity == "error":
        if random.random() < 0.3:
            message = random.choice(STACK_TRACES)
        else:
            message = random.choice(ERROR_MESSAGES)
    elif severity == "fatal":
        message = random.choice(FATAL_MESSAGES)
    elif severity == "warn":
        message = random.choice(WARN_MESSAGES)
    elif severity == "info":
        if random.random() < 0.25:
            message = _generate_json_message()
        else:
            message = _generate_info_message()
    elif severity == "debug":
        message = _generate_debug_message()
    else:
        message = f"TRACE {random.choice(ENDPOINTS)} correlation={uuid.uuid4().hex[:12]}"

    attributes: dict[str, str] = {}
    if random.random() > 0.4:
        attributes["http.method"] = random.choice(HTTP_METHODS)
        attributes["http.url"] = random.choice(ENDPOINTS)
    if random.random() > 0.5:
        attributes["http.status_code"] = str(random.choice([200, 201, 400, 401, 403, 404, 500, 502, 503]))
    if random.random() > 0.6:
        attributes["user.id"] = _rand_user_id()
    if random.random() > 0.7:
        attributes["duration_ms"] = str(random.randint(1, 5000))

    resource: dict[str, str] = {
        "service.name": service,
        "host.name": random.choice(HOSTS),
        "deployment.environment": random.choice(ENVS),
    }
    if random.random() > 0.5:
        resource["cloud.region"] = random.choice(REGIONS)
    if random.random() > 0.6:
        resource["service.version"] = f"2.{random.randint(0, 9)}.{random.randint(0, 20)}"

    return [ts, tenant_id, trace_id, span_id, severity, service, message, attributes, resource]


def run_seed_logs(tenant_id: str, count: int, hours_back: int) -> None:
    """Generate and insert demo logs into ClickHouse."""
    asyncio.run(_seed_logs_async(tenant_id, count, hours_back))


async def _seed_logs_async(tenant_id: str, count: int, hours_back: int) -> None:
    print(f"Generating {count} demo logs for tenant '{tenant_id}' spanning last {hours_back}h...")

    client = await clickhouse_connect.get_async_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
    )

    now = datetime.now(UTC)
    start = now - timedelta(hours=hours_back)

    batch_size = 1000
    total_inserted = 0

    try:
        for batch_start in range(0, count, batch_size):
            batch_end = min(batch_start + batch_size, count)
            rows = []
            for _ in range(batch_end - batch_start):
                ts = start + timedelta(
                    seconds=random.uniform(0, hours_back * 3600)
                )
                rows.append(_generate_log_entry(ts, tenant_id))

            rows.sort(key=lambda r: r[0])

            await client.insert(
                "logs",
                rows,
                column_names=[
                    "timestamp", "tenant_id", "trace_id", "span_id",
                    "severity", "service", "message", "attributes", "resource",
                ],
            )
            total_inserted += len(rows)
            print(f"  Inserted {total_inserted}/{count} logs...")

    finally:
        await client.close()

    print(f"Done! {total_inserted} logs seeded into ClickHouse for tenant '{tenant_id}'.")
    print(f"Time range: {start.isoformat()} to {now.isoformat()}")
