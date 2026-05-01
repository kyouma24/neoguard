# NeoGuard Data Flow

This document traces how data moves through the system — from collection to storage to query to display.

---

## 1. OS Metric Collection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Collector Agent (python -m neoguard.collector.agent)                │
│                                                                     │
│  Every 10 seconds:                                                  │
│    1. psutil.cpu_percent()         → system.cpu.percent             │
│    2. psutil.virtual_memory()      → system.memory.*                │
│    3. psutil.disk_partitions()     → system.disk.percent/used_bytes │
│    4. psutil.disk_io_counters()    → system.disk.read/write_bytes   │
│    5. psutil.net_io_counters()     → system.network.*               │
│    6. psutil.process_iter()        → system.process.* (top 10)     │
│    7. psutil.net_connections()     → system.tcp.connections         │
│    8. psutil.getloadavg()          → system.load.1/5/15            │
│                                                                     │
│  Builds list of MetricPoint dicts with tags={host: hostname}        │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼  HTTP POST /api/v1/metrics/ingest
                                   Body: {"metrics": [...], "tenant_id": "default"}
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│ FastAPI Ingestion Endpoint (metrics.py)                              │
│                                                                     │
│  1. Validates MetricBatch (Pydantic)                                │
│  2. Resolves tenant_id                                              │
│  3. Calls metric_writer.write(tenant_id, points)                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ MetricBatchWriter (writer.py)                                        │
│                                                                      │
│  In-memory buffer: list of (time, tenant_id, name, tags, value, type)│
│                                                                      │
│  Flush triggers (whichever comes first):                             │
│    • Buffer reaches 5,000 rows (NEOGUARD_METRIC_BATCH_SIZE)         │
│    • 200ms elapsed since last flush (NEOGUARD_METRIC_FLUSH_INTERVAL) │
│                                                                      │
│  Flush mechanism:                                                    │
│    asyncpg conn.copy_records_to_table("metrics", records=batch)      │
│    (PostgreSQL COPY protocol — fastest possible bulk insert)         │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ TimescaleDB                                                          │
│                                                                      │
│  metrics (hypertable)          ← raw data lands here                 │
│    │                                                                 │
│    ├──▶ metrics_1m (continuous aggregate, auto-computed every 1 min) │
│    └──▶ metrics_1h (continuous aggregate, auto-computed every 1 hr)  │
│                                                                      │
│  Policies (automatic):                                               │
│    • Compression after 24h (10-20x storage savings)                  │
│    • Retention: drop raw data after 30 days                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. AWS CloudWatch Metric Collection Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│ Collection Orchestrator (orchestrator.py — background task)           │
│                                                                      │
│  Discovery Loop (every 5 minutes):                                   │
│    for each enabled AWS account:                                     │
│      for each configured region:                                     │
│        1. EC2:  describe_instances → upsert resources                │
│        2. RDS:  describe_db_instances → upsert resources             │
│        3. Lambda: list_functions → upsert resources                  │
│        4. ALB/NLB: describe_load_balancers → upsert resources        │
│        5. DynamoDB: list_tables + describe_table → upsert resources  │
│        6. SQS: list_queues → upsert resources                       │
│        7. ECS: list_clusters + list_services → upsert resources      │
│        8. ElastiCache: describe_cache_clusters → upsert resources    │
│        9. S3: list_buckets + get_bucket_location → upsert resources  │
│      Record job result in collection_jobs table                      │
│      Update last_sync_at on AWS account                              │
│                                                                      │
│  Metrics Loop (every 60 seconds):                                    │
│    for each enabled AWS account:                                     │
│      for each region:                                                │
│        1. Load resources from DB for this account+region             │
│        2. Group resources by CloudWatch namespace                     │
│        3. For each namespace:                                        │
│           Build GetMetricData queries (batch of up to 500)           │
│           CloudWatch returns timestamps + values                     │
│           Map to MetricPoint objects                                  │
│           Feed into MetricBatchWriter                                │
└───────────────────────────────────────────────────────────────────────┘
                                │
                                ▼  Same path as OS metrics
┌───────────────────────────────────────────────────────────────────────┐
│ MetricBatchWriter → asyncpg COPY → TimescaleDB                       │
│                                                                      │
│ CloudWatch metrics are stored with tags:                             │
│   resource_id, region, account_id, namespace, stat                   │
│                                                                      │
│ Naming convention: aws.<service>.<metric_name>                       │
│   Example: aws.ec2.cpu_utilization, aws.rds.database_connections     │
└──────────────────────────────────────────────────────────────────────┘
```

### AWS Credential Flow

```
NeoGuard                           AWS
   │
   │  sts.assume_role(
   │    RoleArn="arn:aws:iam::<target>:role/NeoGuardRole",
   │    ExternalId="...",
   │    DurationSeconds=3600
   │  )
   │──────────────────────────────▶│
   │◀──────────────────────────────│ Temporary credentials (1hr)
   │
   │  Cache session (key: account_id:region:role_arn)
   │  TTL: 3500s (refresh 100s before expiry)
   │
   │  Use cached session for all subsequent API calls
   │──────────────────────────────▶│ ec2.describe_instances()
   │──────────────────────────────▶│ cloudwatch.get_metric_data()
   │──────────────────────────────▶│ rds.describe_db_instances()
```

---

## 3. Log Ingestion Flow

```
Application / Log Shipper
      │
      ▼  HTTP POST /api/v1/logs/ingest
         Body: {"logs": [{severity, service, message, attributes, ...}]}
      │
┌─────▼─────────────────────────────────────────────────────────────────┐
│ FastAPI Log Ingestion Endpoint (logs.py)                              │
│  1. Validates LogBatch (Pydantic)                                    │
│  2. Resolves tenant_id                                               │
│  3. Calls log_writer.write(tenant_id, entries)                       │
└─────┬─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────────────────────┐
│ LogBatchWriter (logs/writer.py)                                       │
│                                                                      │
│  Buffer: list of [timestamp, tenant_id, trace_id, span_id,          │
│                    severity, service, message, attributes, resource]  │
│                                                                      │
│  Flush triggers:                                                     │
│    • Buffer reaches 2,000 rows                                       │
│    • 500ms elapsed since last flush                                  │
│                                                                      │
│  Flush: client.insert("logs", batch, column_names=[...])             │
└─────┬─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────────────────────┐
│ ClickHouse                                                           │
│                                                                      │
│  neoguard.logs (MergeTree)                                           │
│    Partitioned by: toYYYYMMDD(timestamp)                             │
│    Ordered by: (tenant_id, service, timestamp)                       │
│    Indexes: tokenbf on message, set on severity/service              │
│    TTL: 30 days auto-delete                                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Alert Evaluation Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│ AlertEngine (background task, runs every 15 seconds)                 │
│                                                                      │
│  1. SELECT * FROM alert_rules WHERE enabled = TRUE                   │
│                                                                      │
│  2. For each rule:                                                   │
│     a. Query: SELECT AVG(value) FROM metrics                         │
│        WHERE name = <metric_name>                                    │
│          AND time >= NOW() - <duration_sec>                          │
│          AND tags match <tags_filter>                                │
│                                                                      │
│     b. Evaluate: current_value <condition> threshold?                │
│                                                                      │
│     c. State machine transition:                                     │
│                                                                      │
│        ┌────┐  breached   ┌─────────┐  held for    ┌────────┐       │
│        │ OK │────────────▶│ PENDING │──duration──▶│ FIRING │       │
│        └──▲─┘             └─────────┘              └───┬────┘       │
│           │                                            │             │
│           │              ┌──────────┐                  │             │
│           └──────────────│ RESOLVED │◀── recovered ──┘             │
│                          └──────────┘                                │
│                                                                      │
│     d. On transition to FIRING:                                      │
│        INSERT INTO alert_events (status='firing', value, threshold)  │
│                                                                      │
│     e. On transition to RESOLVED:                                    │
│        UPDATE alert_events SET status='resolved', resolved_at=NOW()  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Query Flow (Metrics)

```
Frontend / API Client
      │
      ▼  POST /api/v1/metrics/query
         {name, tags, start, end, interval, aggregation}
      │
┌─────▼─────────────────────────────────────────────────────────────────┐
│ Query Engine (query.py)                                               │
│                                                                      │
│  1. Validate aggregation function (avg/min/max/sum/count)            │
│                                                                      │
│  2. Auto-select source table based on time range:                    │
│     • interval=raw → metrics (raw data)                              │
│     • range < 24h  → metrics_1m (1-minute rollups)                   │
│     • range >= 24h → metrics_1h (1-hour rollups)                     │
│                                                                      │
│  3. Build SQL with time_bucket() for bucketing                       │
│     • Apply tag filters via JSONB operator (tags->>'key' = $N)       │
│     • GROUP BY bucket, tags                                          │
│     • ORDER BY bucket                                                │
│                                                                      │
│  4. Execute via asyncpg and return results grouped by tag set        │
└─────┬─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Response                                                              │
│                                                                      │
│ [                                                                    │
│   {                                                                  │
│     "name": "system.cpu.percent",                                    │
│     "tags": {"host": "web-01"},                                      │
│     "datapoints": [                                                  │
│       ["2026-04-29T11:00:00Z", 42.5],                                │
│       ["2026-04-29T11:01:00Z", 38.1],                                │
│       ...                                                            │
│     ]                                                                │
│   }                                                                  │
│ ]                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Resource Registry Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ Resources are registered from three sources:                         │
│                                                                      │
│  1. AWS Discovery (automatic, every 5 min)                           │
│     discover_all() → upsert_resource()                               │
│     Populates: resource_type, provider, region, account_id,          │
│                external_id, tags, metadata, status                   │
│                                                                      │
│  2. Manual API (POST /api/v1/resources)                              │
│     For non-AWS resources (local servers, etc.)                      │
│                                                                      │
│  3. Collector Agent (future)                                         │
│     Self-register the host as a "server" resource                    │
│                                                                      │
│  Upsert logic:                                                       │
│    Match on (tenant_id, provider, external_id)                       │
│    If exists → UPDATE name, tags, metadata, status, last_seen_at     │
│    If not → INSERT new resource                                      │
│    If external_id is empty → always INSERT (local resources)         │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Frontend Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ React Frontend (Vite dev proxy → :8000)                             │
│                                                                     │
│  Overview Page:                                                     │
│    GET /health → status, writer stats, DB checks                    │
│                                                                     │
│  Metrics Page:                                                      │
│    1. GET /api/v1/metrics/names → dropdown of available metrics     │
│    2. POST /api/v1/metrics/query → time-series datapoints           │
│    3. Render with Recharts <LineChart>                               │
│                                                                     │
│  Logs Page:                                                         │
│    POST /api/v1/logs/query → paginated log entries                  │
│                                                                     │
│  Alerts Page:                                                       │
│    GET /api/v1/alerts/rules → list of rules                         │
│    GET /api/v1/alerts/events → recent events                        │
│                                                                     │
│  Dashboards Page:                                                   │
│    GET /api/v1/dashboards → list of dashboards                      │
│    GET /api/v1/dashboards/:id → single dashboard with panels        │
└─────────────────────────────────────────────────────────────────────┘
```
