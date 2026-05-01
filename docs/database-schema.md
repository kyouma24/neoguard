# NeoGuard Database Schema

## TimescaleDB (PostgreSQL)

### `metrics` (Hypertable)

Core time-series storage for all metric data.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `time` | TIMESTAMPTZ | NOT NULL | Partition key (1-day chunks) |
| `tenant_id` | TEXT | `'default'` | Tenant isolation |
| `name` | TEXT | NOT NULL | Metric name (e.g., `system.cpu.percent`) |
| `tags` | JSONB | `'{}'` | Key-value labels (host, region, etc.) |
| `value` | DOUBLE PRECISION | NOT NULL | Metric value |
| `metric_type` | TEXT | `'gauge'` | `gauge`, `counter`, `histogram` |

**Indexes**:
- `(tenant_id, name, time DESC)` — primary query path
- GIN on `tags` — tag-based filtering

**Policies**:
- Compression after 24 hours (`timescaledb.compress_segmentby = 'tenant_id, name'`)
- Retention: drop raw data after 30 days

### `metrics_1m` (Continuous Aggregate)

Auto-computed 1-minute rollups.

| Column | Type | Notes |
|--------|------|-------|
| `bucket` | TIMESTAMPTZ | 1-minute time bucket |
| `tenant_id` | TEXT | |
| `name` | TEXT | |
| `tags` | JSONB | |
| `avg_value` | DOUBLE PRECISION | |
| `min_value` | DOUBLE PRECISION | |
| `max_value` | DOUBLE PRECISION | |
| `sample_count` | BIGINT | |

Refresh policy: every 1 minute, covers data from 1 hour ago to 1 minute ago.

### `metrics_1h` (Continuous Aggregate)

Auto-computed 1-hour rollups. Same columns as `metrics_1m` but with hourly buckets.

Refresh policy: every 1 hour, covers data from 3 hours ago to 1 hour ago.

---

### `alert_rules`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `name` | TEXT | NOT NULL | Human-readable name |
| `description` | TEXT | `''` | |
| `metric_name` | TEXT | NOT NULL | Metric to evaluate |
| `tags_filter` | JSONB | `'{}'` | Only evaluate metrics matching these tags |
| `condition` | TEXT | NOT NULL | `gt`, `lt`, `gte`, `lte`, `eq`, `ne` |
| `threshold` | DOUBLE PRECISION | NOT NULL | Value to compare against |
| `duration_sec` | INTEGER | `60` | Seconds condition must hold before firing |
| `interval_sec` | INTEGER | `30` | Evaluation frequency |
| `severity` | TEXT | `'warning'` | `info`, `warning`, `critical` |
| `enabled` | BOOLEAN | `TRUE` | |
| `notification` | JSONB | `'{}'` | Notification channel config |
| `created_at` | TIMESTAMPTZ | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | |

**Indexes**: `(tenant_id, enabled)`

### `alert_events`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `rule_id` | TEXT | NOT NULL | FK → alert_rules.id (CASCADE) |
| `status` | TEXT | NOT NULL | `firing` or `resolved` |
| `value` | DOUBLE PRECISION | NOT NULL | Value that triggered the alert |
| `threshold` | DOUBLE PRECISION | NOT NULL | Threshold at time of firing |
| `message` | TEXT | `''` | Human-readable message |
| `fired_at` | TIMESTAMPTZ | `NOW()` | When the alert started firing |
| `resolved_at` | TIMESTAMPTZ | NULL | When the alert resolved |

**Indexes**: `(tenant_id, rule_id, fired_at DESC)`

---

### `resources`

Registry of all monitored resources (servers, AWS services, etc.).

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `resource_type` | TEXT | NOT NULL | `ec2`, `rds`, `lambda`, `server`, etc. |
| `provider` | TEXT | NOT NULL | `aws`, `local`, `gcp`, `azure` |
| `region` | TEXT | `''` | AWS region or empty for local |
| `account_id` | TEXT | `''` | AWS account number |
| `name` | TEXT | NOT NULL | Display name |
| `external_id` | TEXT | `''` | Provider-specific ID (e.g., `i-0abc123`) |
| `tags` | JSONB | `'{}'` | Resource tags |
| `metadata` | JSONB | `'{}'` | Provider-specific metadata (instance type, etc.) |
| `status` | TEXT | `'active'` | `active`, `stopped`, `terminated`, `unknown` |
| `last_seen_at` | TIMESTAMPTZ | NULL | Last discovery/update time |
| `created_at` | TIMESTAMPTZ | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | |

**Indexes**:
- `(tenant_id, resource_type)` — filter by type
- `(tenant_id, provider, account_id)` — filter by account
- UNIQUE `(tenant_id, provider, external_id)` WHERE `external_id != ''` — prevent duplicates
- GIN on `tags` — tag-based queries

### `aws_accounts`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `name` | TEXT | NOT NULL | Display name |
| `account_id` | TEXT | NOT NULL | 12-digit AWS account number |
| `role_arn` | TEXT | `''` | IAM role to assume |
| `external_id` | TEXT | `''` | STS ExternalId |
| `regions` | JSONB | `'["us-east-1"]'` | Regions to monitor |
| `enabled` | BOOLEAN | `TRUE` | Enable/disable collection |
| `collect_config` | JSONB | `'{}'` | Per-account collection settings |
| `last_sync_at` | TIMESTAMPTZ | NULL | Last successful discovery |
| `created_at` | TIMESTAMPTZ | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | |

**Indexes**: UNIQUE `(tenant_id, account_id)`

### `collection_jobs`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `job_type` | TEXT | NOT NULL | `discovery`, `cloudwatch`, `os_metrics` |
| `target_id` | TEXT | `''` | Resource or account ID |
| `status` | TEXT | `'pending'` | `pending`, `running`, `completed`, `failed` |
| `config` | JSONB | `'{}'` | Job configuration |
| `result` | JSONB | `'{}'` | Job output/results |
| `started_at` | TIMESTAMPTZ | NULL | |
| `completed_at` | TIMESTAMPTZ | NULL | |
| `error_message` | TEXT | `''` | Error details on failure |
| `created_at` | TIMESTAMPTZ | `NOW()` | |

**Indexes**: `(tenant_id, status, created_at DESC)`

---

### `dashboards`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `name` | TEXT | NOT NULL | |
| `description` | TEXT | `''` | |
| `panels` | JSONB | `'[]'` | Array of panel definitions |
| `created_at` | TIMESTAMPTZ | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | `NOW()` | |

**Indexes**: `(tenant_id)`

### `notification_channels`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT | PK | ULID |
| `tenant_id` | TEXT | `'default'` | |
| `name` | TEXT | NOT NULL | |
| `channel_type` | TEXT | NOT NULL | `webhook`, `email`, `slack` |
| `config` | JSONB | `'{}'` | Channel-specific configuration |
| `enabled` | BOOLEAN | `TRUE` | |
| `created_at` | TIMESTAMPTZ | `NOW()` | |

---

## ClickHouse

### `neoguard.logs`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `timestamp` | DateTime64(9, 'UTC') | | Nanosecond precision |
| `tenant_id` | LowCardinality(String) | `'default'` | Optimized for low-cardinality filtering |
| `trace_id` | String | `''` | OpenTelemetry trace ID |
| `span_id` | String | `''` | OpenTelemetry span ID |
| `severity` | LowCardinality(String) | | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `service` | LowCardinality(String) | | Service name |
| `message` | String | | Log message body |
| `attributes` | Map(String, String) | | Structured key-value attributes |
| `resource` | Map(String, String) | | Resource metadata |

**Engine**: MergeTree

**Partition**: `toYYYYMMDD(timestamp)` — daily partitions

**Order by**: `(tenant_id, service, timestamp)` — optimal for filtering by tenant+service and time range scans

**Indexes**:
- `idx_message` — tokenbf_v1(10240, 3, 0) GRANULARITY 4 — bloom filter for full-text search on message
- `idx_severity` — set(0) GRANULARITY 1 — fast severity filtering
- `idx_service` — set(0) GRANULARITY 1 — fast service filtering

**TTL**: `toDateTime(timestamp) + INTERVAL 30 DAY` — automatic retention

**Index granularity**: 8192 rows

---

## Entity Relationship Diagram

```
alert_rules ──────1:N──────▶ alert_events
    │                            (rule_id FK, CASCADE delete)
    │
    └── tenant_id
        name
        metric_name → references metrics.name (logical, not FK)
        condition + threshold

resources ◀────── aws_discovery.discover_all() populates
    │
    └── (tenant_id, provider, external_id) UNIQUE

aws_accounts ◀─── orchestrator reads enabled accounts
    │
    └── (tenant_id, account_id) UNIQUE

collection_jobs ◀── orchestrator creates per discovery/collection run
    │
    └── target_id → logical reference to aws_accounts.id or resources.id

dashboards
    │
    └── panels JSONB array references metrics by name

metrics (hypertable)
    │
    ├── metrics_1m (continuous aggregate)
    └── metrics_1h (continuous aggregate)

logs (ClickHouse, separate database)
```
