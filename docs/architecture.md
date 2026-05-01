# NeoGuard Architecture

## Overview

NeoGuard is a production-grade monitoring and observability platform — an MVP Datadog clone. It collects metrics and logs from servers and cloud infrastructure, stores them in purpose-built databases, evaluates alerts, and visualizes everything through a web dashboard.

**Target scale**: 100K metrics/sec on a single machine (POC).

---

## System Architecture

```
                          ┌──────────────────────┐
                          │    React Frontend     │
                          │   (Vite + TypeScript) │
                          └──────────┬───────────┘
                                     │ HTTP /api/*
                                     ▼
┌──────────────┐          ┌──────────────────────────────────────────────────┐
│  Collector   │──HTTP──▶ │                FastAPI Backend                   │
│  Agent       │          │                                                  │
│  (psutil)    │          │  ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
└──────────────┘          │  │  Ingestion │ │  Query     │ │  Alert       │ │
                          │  │  Endpoints │ │  Endpoints │ │  Engine      │ │
┌──────────────┐          │  └─────┬──────┘ └─────┬──────┘ └──────┬───────┘ │
│  AWS         │──boto3──▶│       │              │              │         │
│  CloudWatch  │          │  ┌────▼──────────────▼──────────────▼───────┐ │
│  Discovery   │          │  │          Async Batch Writers              │ │
└──────────────┘          │  │  (COPY protocol / bulk insert)           │ │
                          │  └────┬───────────────────────────┬─────────┘ │
                          └───────┼───────────────────────────┼───────────┘
                                  │                           │
                           ┌──────▼──────┐            ┌──────▼──────┐
                           │ TimescaleDB │            │ ClickHouse  │
                           │  (metrics)  │            │   (logs)    │
                           │  (metadata) │            └─────────────┘
                           └─────────────┘
```

---

## Component Details

### 1. FastAPI Backend (`src/neoguard/`)

Single async Python process serving all functionality:

| Layer | Path | Purpose |
|-------|------|---------|
| API Routes | `api/routes/` | REST endpoints for metrics, logs, alerts, dashboards, resources, AWS accounts, collection |
| Models | `models/` | Pydantic v2 data models for all API contracts |
| Services | `services/` | Business logic — writers, query engines, alert engine, AWS integration |
| DB Layer | `db/` | Connection pool management for TimescaleDB (asyncpg) and ClickHouse |
| Core | `core/` | Configuration (pydantic-settings) and structured logging (structlog) |
| Collector | `collector/` | Standalone agent process for OS-level metric collection |

**Key design: async everywhere**. Every database call, HTTP request, and background task is async. This allows a single process to handle high concurrency without thread pools.

### 2. TimescaleDB (Metrics + Metadata)

PostgreSQL extension optimized for time-series data.

**Metrics storage**:
- `metrics` hypertable — raw datapoints partitioned by day
- `metrics_1m` continuous aggregate — 1-minute rollups (auto-computed)
- `metrics_1h` continuous aggregate — 1-hour rollups (auto-computed)
- Compression after 24 hours for 10-20x storage reduction
- 30-day retention policy on raw data

**Metadata tables** (shared PostgreSQL instance):
- `alert_rules` — alert definitions with conditions and thresholds
- `alert_events` — firing/resolved event history
- `dashboards` — dashboard panel definitions (JSON)
- `resources` — resource registry (servers, EC2, RDS, Lambda, etc.)
- `aws_accounts` — AWS account configuration (role ARN, regions)
- `collection_jobs` — collection run tracking
- `notification_channels` — webhook/email/Slack config

**Query optimization**: The query engine auto-selects the optimal table based on time range:
- Under 1 hour → raw `metrics` table
- 1-24 hours → `metrics_1m` rollup
- Over 24 hours → `metrics_1h` rollup

### 3. ClickHouse (Logs)

Column-oriented OLAP database for high-volume log storage.

- MergeTree engine partitioned by day
- Ordered by `(tenant_id, service, timestamp)` for fast filtering
- Token bloom filter index on `message` for full-text search
- Set indexes on `severity` and `service` for fast lookups
- 30-day TTL auto-deletes old data

**Why ClickHouse over Loki**: SQL flexibility, custom analytics queries, and full control over the query layer.

### 4. Collector Agent (`collector/agent.py`)

Standalone Python process that collects OS-level metrics via `psutil`:

| Category | Metrics |
|----------|---------|
| CPU | `system.cpu.percent`, `system.cpu.user/system/idle/iowait` |
| Memory | `system.memory.percent`, `system.memory.used_bytes`, `system.memory.available_bytes` |
| Swap | `system.swap.percent` |
| Disk | `system.disk.percent`, `system.disk.used_bytes` (per mountpoint) |
| Disk IO | `system.disk.read_bytes/write_bytes/read_count/write_count/read_time_ms/write_time_ms` (per device) |
| Network | `system.network.bytes_sent/recv`, `system.network.packets_sent/recv` |
| Load | `system.load.1/5/15` (Linux/macOS only) |
| Processes | `system.process.count`, `system.process.cpu_percent/memory_percent` (top 10 by CPU) |
| TCP | `system.tcp.connections` (by state: ESTABLISHED, TIME_WAIT, etc.) |

Ships metrics to the API every 10 seconds (configurable) via HTTP POST.

### 5. AWS Integration

Three components handle cloud monitoring:

**Credential Management** (`services/aws/credentials.py`):
- STS assume-role for cross-account access
- Session cache with 3500s TTL (refreshes 100s before 1hr STS expiry)
- Adaptive retries with 10s connect / 30s read timeouts

**Resource Discovery** (`services/discovery/aws_discovery.py`):
- Auto-discovers resources across 9 AWS services: EC2, RDS, Lambda, ALB/NLB, DynamoDB, SQS, ECS, ElastiCache, S3
- Upserts into the resource registry (no duplicates on re-discovery)
- Extracts instance metadata, tags, and status for each resource

**CloudWatch Metrics** (`services/aws/cloudwatch.py`):
- Batch `GetMetricData` API (up to 500 queries per call)
- 98 metric definitions across 15 AWS namespaces:
  - EC2 (11 metrics), RDS (11), Lambda (7), ELB (7), ALB (8), DynamoDB (7), SQS (6), SNS (3), ECS (2), ElastiCache (7), S3 (2), Kinesis (5), API Gateway (5), NAT Gateway (5), CloudFront (4), Step Functions (4)

**Collection Orchestrator** (`services/collection/orchestrator.py`):
- Runs discovery every 5 minutes
- Collects CloudWatch metrics every 60 seconds
- Tracks all runs in the `collection_jobs` table

### 6. Alert Engine (`services/alerts/engine.py`)

Background task evaluating alert rules every 15 seconds.

**State machine per rule**:
```
OK ──(threshold breached)──▶ PENDING ──(breached for duration_sec)──▶ FIRING
 ▲                                                                       │
 └──────────────────────(recovered)──── RESOLVED ◀───(recovered)─────────┘
```

- Queries raw metrics over the rule's `duration_sec` window
- Supports conditions: `gt`, `lt`, `gte`, `lte`, `eq`, `ne`
- Fires alert events on transition to FIRING
- Resolves all open events when metric recovers

### 7. Frontend (`frontend/`)

React 18 + TypeScript + Vite single-page application.

| Page | Route | Purpose |
|------|-------|---------|
| Overview | `/` | System health, writer stats, DB status |
| Metrics | `/metrics` | Time-series explorer with aggregation controls |
| Logs | `/logs` | Log search with severity/service filters |
| Alerts | `/alerts` | Alert rules and event history |
| Dashboards | `/dashboards` | Custom dashboard management |

- Dark theme with CSS variables
- Recharts for time-series visualization
- Vite dev proxy forwards `/api` and `/health` to the backend

---

## Data Flow

### Metric Ingestion (Hot Path)

```
Collector Agent
      │
      ▼  POST /api/v1/metrics/ingest  (batch of up to 10,000 points)
  FastAPI
      │
      ▼  append to in-memory buffer
  MetricBatchWriter
      │
      ▼  flush on buffer_size=5000 OR every 200ms (whichever first)
  asyncpg COPY protocol  ──▶  TimescaleDB metrics hypertable
```

### Log Ingestion

```
Application
      │
      ▼  POST /api/v1/logs/ingest  (batch of up to 5,000 entries)
  FastAPI
      │
      ▼  append to in-memory buffer
  LogBatchWriter
      │
      ▼  flush on buffer_size=2000 OR every 500ms
  ClickHouse async insert  ──▶  neoguard.logs table
```

### AWS Collection

```
Orchestrator (background loop)
      │
      ├──▶ Discovery (every 5 min)
      │       ├── EC2: describe_instances → upsert resources
      │       ├── RDS: describe_db_instances → upsert resources
      │       ├── Lambda: list_functions → upsert resources
      │       ├── ... (9 services total)
      │       └── Records job in collection_jobs table
      │
      └──▶ Metrics Collection (every 60 sec)
              ├── Group resources by CloudWatch namespace
              ├── Build GetMetricData queries (batches of 500)
              ├── Map results to MetricPoint objects
              └── Feed into MetricBatchWriter → TimescaleDB
```

---

## Multi-Tenancy Strategy

Every data table includes a `tenant_id` column (default: `"default"`).

**Current mode**: Single-tenant. The `get_tenant_id()` dependency always returns the configured default.

**Future multi-tenant migration** (no schema changes needed):
1. Replace `get_tenant_id()` with JWT/API-key extraction
2. Enable PostgreSQL Row-Level Security (RLS) on all tables
3. Create separate ClickHouse databases per tenant
4. Scope all API queries to the authenticated tenant

---

## Technology Stack

| Component | Technology | Version | Why |
|-----------|-----------|---------|-----|
| API Server | FastAPI + Uvicorn | 0.115+ | Async, automatic OpenAPI docs, dependency injection |
| Metrics DB | TimescaleDB | latest-pg16 | SQL-native time-series, continuous aggregates, compression |
| Logs DB | ClickHouse | 24.8 | Column-store, fast full-text search, TTL retention |
| ORM/DB Driver | asyncpg | 0.30+ | Native PostgreSQL async driver, COPY protocol support |
| Models | Pydantic v2 | 2.10+ | Validation, serialization, automatic OpenAPI schemas |
| JSON | orjson | 3.10+ | 2-10x faster than stdlib json |
| Logging | structlog | 24.4+ | Structured JSON logging |
| IDs | python-ulid | 3.0+ | Sortable, unique, URL-safe |
| AWS | boto3 | 1.35+ | Official AWS SDK |
| System Metrics | psutil | 6.1+ | Cross-platform OS metrics |
| Frontend | React 18 + TypeScript | - | Component model, type safety |
| Build Tool | Vite | - | Fast HMR, dev proxy |
| Charts | Recharts | - | React-native charting |
