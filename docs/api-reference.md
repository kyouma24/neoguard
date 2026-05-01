# NeoGuard API Reference

Base URL: `http://localhost:8000`

All endpoints return JSON. Tenant ID is derived from the authenticated API key (or server default when auth is disabled).

---

## Authentication

When `NEOGUARD_AUTH_ENABLED=true`, all endpoints (except `/health`, `/docs`, `/redoc`, and `/api/v1/auth/*`) require an API key.

**Pass the key via either header:**
```
Authorization: Bearer ng_<your-key>
X-API-Key: ng_<your-key>
```

**Error responses:**
- `401` — Missing, invalid, disabled, or expired API key
- `403` — API key lacks required scope
- `429` — Rate limit exceeded (per-key, configurable RPM)

### `POST /api/v1/auth/keys`

Create a new API key. The raw key is returned **only in this response** — store it securely.

**Request body**:
```json
{
  "name": "production-collector",
  "tenant_id": "default",
  "scopes": ["read", "write"],
  "rate_limit": 5000,
  "expires_at": "2027-01-01T00:00:00Z"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | 1-256 chars, human-readable label |
| `tenant_id` | string | no | Default: `"default"` |
| `scopes` | array | no | `["read"]`, `["write"]`, `["read","write"]`, `["admin"]`. Default: `["read","write"]` |
| `rate_limit` | int | no | Requests per minute. 10-100,000. Default: 1000 |
| `expires_at` | ISO 8601 | no | Key expiry. Null = never expires |

**Response** (201):
```json
{
  "id": "01KQCP...",
  "tenant_id": "default",
  "name": "production-collector",
  "key_prefix": "ng_abc1234",
  "scopes": ["read", "write"],
  "rate_limit": 5000,
  "enabled": true,
  "expires_at": "2027-01-01T00:00:00Z",
  "last_used_at": null,
  "created_at": "2026-04-29T13:00:00Z",
  "raw_key": "ng_abc1234xyzFULLKEYHERE..."
}
```

The `raw_key` field is **only returned on creation**. The `key_prefix` (first 11 chars) is stored for identification.

### `GET /api/v1/auth/keys?tenant_id=default`

List all API keys for a tenant. Raw keys are never returned.

### `GET /api/v1/auth/keys/{key_id}?tenant_id=default`

Get a single API key's metadata.

### `PATCH /api/v1/auth/keys/{key_id}?tenant_id=default`

Update key name, scopes, rate_limit, enabled status, or expiry.

### `DELETE /api/v1/auth/keys/{key_id}?tenant_id=default`

Delete an API key. Returns 204.

---

## Health

### `GET /health`

Returns system health status and writer statistics.

**Response**:
```json
{
  "status": "healthy",
  "checks": {
    "timescaledb": "ok",
    "clickhouse": "ok"
  },
  "writers": {
    "metrics": { "buffer_size": 0, "total_written": 1540, "total_dropped": 0 },
    "logs": { "buffer_size": 0, "total_written": 0, "total_dropped": 0 }
  }
}
```

`status` is `"healthy"` when all checks pass, `"degraded"` otherwise.

---

## Metrics

### `POST /api/v1/metrics/ingest`

Ingest a batch of metric points.

**Request body**:
```json
{
  "metrics": [
    {
      "name": "system.cpu.percent",
      "value": 45.2,
      "tags": { "host": "web-01" },
      "metric_type": "gauge",
      "timestamp": "2026-04-29T12:00:00Z"
    }
  ],
  "tenant_id": "default"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `metrics` | array | yes | 1-10,000 MetricPoint objects |
| `metrics[].name` | string | yes | Pattern: `^[a-zA-Z_][a-zA-Z0-9_.]*$`, max 512 chars |
| `metrics[].value` | float | yes | |
| `metrics[].tags` | object | no | Key-value string pairs |
| `metrics[].metric_type` | string | no | `gauge` (default), `counter`, `histogram` |
| `metrics[].timestamp` | ISO 8601 | no | Defaults to server time |
| `tenant_id` | string | no | Overrides header-derived tenant |

**Response** (202):
```json
{ "accepted": 5 }
```

### `POST /api/v1/metrics/query`

Query time-series data with aggregation.

**Request body**:
```json
{
  "name": "system.cpu.percent",
  "tags": { "host": "web-01" },
  "start": "2026-04-29T11:00:00Z",
  "end": "2026-04-29T12:00:00Z",
  "interval": "1m",
  "aggregation": "avg"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | Metric name to query |
| `tags` | object | no | Filter by tag values |
| `start` | ISO 8601 | yes | Inclusive start time |
| `end` | ISO 8601 | yes | Exclusive end time |
| `interval` | string | no | `raw`, `1m`, `5m`, `15m`, `1h`, `6h`, `1d`. Default: `1m` |
| `aggregation` | string | no | `avg`, `min`, `max`, `sum`, `count`. Default: `avg` |

**Response** (200):
```json
[
  {
    "name": "system.cpu.percent",
    "tags": { "host": "web-01" },
    "datapoints": [
      ["2026-04-29T11:00:00Z", 42.5],
      ["2026-04-29T11:01:00Z", 38.1]
    ]
  }
]
```

The query engine auto-selects the optimal source table:
- `interval=raw` → raw `metrics` table
- Time range < 24h → `metrics_1m` continuous aggregate
- Time range >= 24h → `metrics_1h` continuous aggregate

### `GET /api/v1/metrics/names`

List all distinct metric names.

**Response** (200):
```json
["system.cpu.percent", "system.memory.percent", "system.disk.percent"]
```

### `GET /api/v1/metrics/stats`

Return batch writer statistics.

**Response** (200):
```json
{ "buffer_size": 12, "total_written": 1540, "total_dropped": 0 }
```

---

## Logs

### `POST /api/v1/logs/ingest`

Ingest a batch of log entries.

**Request body**:
```json
{
  "logs": [
    {
      "severity": "error",
      "service": "auth-service",
      "message": "Failed to authenticate user",
      "trace_id": "abc123",
      "span_id": "def456",
      "attributes": { "user_id": "42", "method": "POST" },
      "resource": { "host": "web-01" }
    }
  ],
  "tenant_id": "default"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `logs` | array | yes | 1-5,000 LogEntry objects |
| `logs[].severity` | string | no | `trace`, `debug`, `info` (default), `warn`, `error`, `fatal` |
| `logs[].service` | string | yes | 1-256 chars |
| `logs[].message` | string | yes | 1-65,536 chars |
| `logs[].trace_id` | string | no | OpenTelemetry trace ID |
| `logs[].span_id` | string | no | OpenTelemetry span ID |
| `logs[].attributes` | object | no | Key-value string pairs |
| `logs[].resource` | object | no | Key-value string pairs |
| `logs[].timestamp` | ISO 8601 | no | Defaults to server time |

**Response** (202):
```json
{ "accepted": 1 }
```

### `POST /api/v1/logs/query`

Search and filter logs.

**Request body**:
```json
{
  "query": "authentication",
  "service": "auth-service",
  "severity": "error",
  "start": "2026-04-29T00:00:00Z",
  "end": "2026-04-29T23:59:59Z",
  "limit": 100,
  "offset": 0
}
```

All fields are optional. `query` performs case-insensitive substring match on the message field.

**Response** (200):
```json
{
  "logs": [
    {
      "timestamp": "2026-04-29T12:30:00Z",
      "severity": "error",
      "service": "auth-service",
      "message": "Failed to authenticate user",
      "trace_id": "abc123",
      "span_id": "def456",
      "attributes": { "user_id": "42" },
      "resource": { "host": "web-01" }
    }
  ],
  "total": 1,
  "has_more": false
}
```

---

## Alerts

### `POST /api/v1/alerts/rules`

Create an alert rule.

**Request body**:
```json
{
  "name": "High CPU",
  "description": "CPU usage above 90% for 2 minutes",
  "metric_name": "system.cpu.percent",
  "tags_filter": { "host": "web-01" },
  "condition": "gt",
  "threshold": 90.0,
  "duration_sec": 120,
  "interval_sec": 30,
  "severity": "critical"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | 1-256 chars |
| `metric_name` | string | yes | Must match an ingested metric name |
| `condition` | string | yes | `gt`, `lt`, `gte`, `lte`, `eq`, `ne` |
| `threshold` | float | yes | Value to compare against |
| `duration_sec` | int | no | Seconds the condition must hold before firing. 10-3600, default 60 |
| `interval_sec` | int | no | Evaluation interval. 10-600, default 30 |
| `severity` | string | no | `info`, `warning` (default), `critical` |
| `tags_filter` | object | no | Only evaluate metrics matching these tags |
| `notification` | object | no | Notification config (future use) |

**Response** (201): The created AlertRule object.

### `GET /api/v1/alerts/rules`

List all alert rules.

### `GET /api/v1/alerts/rules/{rule_id}`

Get a single alert rule.

### `PATCH /api/v1/alerts/rules/{rule_id}`

Update an alert rule. Only fields present in the request body are updated.

### `DELETE /api/v1/alerts/rules/{rule_id}`

Delete an alert rule. Returns 204 on success.

### `GET /api/v1/alerts/events`

List alert events. Query parameters:

| Param | Type | Notes |
|-------|------|-------|
| `rule_id` | string | Filter by rule |
| `status` | string | `firing` or `resolved` |
| `limit` | int | Default 100, max 1000 |

---

## Dashboards

### `POST /api/v1/dashboards`

Create a dashboard.

**Request body**:
```json
{
  "name": "System Overview",
  "description": "Key system metrics",
  "panels": [
    {
      "title": "CPU Usage",
      "panel_type": "timeseries",
      "metric_name": "system.cpu.percent",
      "tags": { "host": "web-01" },
      "aggregation": "avg",
      "width": 6,
      "height": 4
    }
  ]
}
```

### `GET /api/v1/dashboards`

List all dashboards.

### `GET /api/v1/dashboards/{dashboard_id}`

Get a single dashboard with panel definitions.

### `PATCH /api/v1/dashboards/{dashboard_id}`

Update a dashboard.

### `DELETE /api/v1/dashboards/{dashboard_id}`

Delete a dashboard. Returns 204.

---

## Resources

### `GET /api/v1/resources`

List monitored resources. Query parameters:

| Param | Type | Notes |
|-------|------|-------|
| `resource_type` | string | `ec2`, `rds`, `lambda`, `server`, etc. |
| `provider` | string | `aws`, `local`, `gcp`, `azure` |
| `account_id` | string | AWS account number |
| `status` | string | `active`, `stopped`, `terminated`, `unknown` |

**Response** (200):
```json
[
  {
    "id": "01KQCM...",
    "tenant_id": "default",
    "resource_type": "ec2",
    "provider": "aws",
    "region": "us-east-1",
    "account_id": "123456789012",
    "name": "web-server-01",
    "external_id": "i-0abc123def456",
    "tags": { "Name": "web-server-01", "env": "prod" },
    "metadata": {
      "instance_type": "t3.medium",
      "private_ip": "10.0.1.5",
      "vpc_id": "vpc-abc123"
    },
    "status": "active",
    "last_seen_at": "2026-04-29T12:50:00Z",
    "created_at": "2026-04-29T10:00:00Z",
    "updated_at": "2026-04-29T12:50:00Z"
  }
]
```

### `GET /api/v1/resources/summary`

Aggregated counts by type, provider, and status.

**Response** (200):
```json
{
  "total": 47,
  "by_type": { "ec2": 12, "rds": 3, "lambda": 20, "s3": 8, "sqs": 4 },
  "by_provider": { "aws": 45, "local": 2 },
  "by_status": { "active": 42, "stopped": 5 }
}
```

### `POST /api/v1/resources`

Manually register a resource. Returns 201.

### `GET /api/v1/resources/{resource_id}`

Get a single resource.

### `PATCH /api/v1/resources/{resource_id}`

Update resource name, tags, metadata, or status.

### `DELETE /api/v1/resources/{resource_id}`

Delete a resource. Returns 204.

---

## AWS Accounts

### `GET /api/v1/aws/accounts`

List configured AWS accounts. Query parameters: `enabled_only` (bool).

### `POST /api/v1/aws/accounts`

Register an AWS account for monitoring.

**Request body**:
```json
{
  "name": "Production Account",
  "account_id": "123456789012",
  "role_arn": "arn:aws:iam::123456789012:role/NeoGuardRole",
  "external_id": "neoguard-external-id",
  "regions": ["us-east-1", "us-west-2", "eu-west-1"],
  "collect_config": {}
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | yes | 1-256 chars |
| `account_id` | string | yes | Must be exactly 12 digits |
| `role_arn` | string | no | IAM role to assume for cross-account access |
| `external_id` | string | no | STS external ID for assume-role |
| `regions` | array | no | Default: `["us-east-1"]` |
| `collect_config` | object | no | Per-account collection settings |

### `GET /api/v1/aws/accounts/{acct_id}`

Get a single AWS account.

### `PATCH /api/v1/aws/accounts/{acct_id}`

Update account config (name, role_arn, regions, enabled, collect_config).

### `DELETE /api/v1/aws/accounts/{acct_id}`

Remove an AWS account. Returns 204.

---

## Collection

### `POST /api/v1/collection/discover`

Trigger AWS resource discovery for an account.

**Request body**:
```json
{
  "aws_account_id": "01KQCM...",
  "region": "us-east-1"
}
```

If `region` is omitted, discovery runs across all configured regions for the account.

**Response** (202):
```json
{
  "status": "completed",
  "results": {
    "us-east-1": {
      "ec2": 12,
      "rds": 3,
      "lambda": 20,
      "alb_nlb": 2,
      "dynamodb": 5,
      "sqs": 4,
      "ecs": 8,
      "elasticache": 1,
      "s3": 15
    }
  }
}
```

### `GET /api/v1/collection/jobs`

List collection job history. Query parameters:

| Param | Type | Notes |
|-------|------|-------|
| `job_type` | string | `discovery`, `cloudwatch`, `os_metrics` |
| `status` | string | `pending`, `running`, `completed`, `failed` |
| `limit` | int | Default 50 |

### `GET /api/v1/collection/jobs/{job_id}`

Get details of a specific collection job.

---

## OpenAPI Documentation

FastAPI auto-generates interactive API docs at:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`
