# ADR-001: NeoGuard Architecture Overview

## Status
Accepted

## Context
Building a production-grade monitoring platform (MVP Datadog) that handles:
- Metric ingestion at 100K metrics/sec
- Log ingestion and full-text search
- Threshold-based alerting
- Dashboard visualization
- Agent-based collection

Must support future multi-tenant complete isolation.

## Decision

### High-Level Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│  Collector   │────▶│              FastAPI Gateway                 │
│   Agent      │     │  (metric + log ingestion, query, alerts)    │
└─────────────┘     └──────┬──────────────┬───────────────┬────────┘
                           │              │               │
                    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
                    │ TimescaleDB │ │ ClickHouse │ │ PostgreSQL │
                    │ (metrics)   │ │  (logs)    │ │ (metadata) │
                    └─────────────┘ └────────────┘ └────────────┘
```

### Component Breakdown

1. **FastAPI Gateway** — Single process, async throughout
   - Metric ingestion: batch-aware endpoint, async bulk insert to TimescaleDB
   - Log ingestion: async bulk insert to ClickHouse
   - Query API: time-series aggregation, log search
   - Alert API: CRUD + evaluation engine running as background task

2. **TimescaleDB** — Metrics storage
   - Hypertable with time-based partitioning (7-day chunks)
   - Continuous aggregates for 1m, 5m, 1h rollups
   - Compression after 24h for storage efficiency
   - Why not InfluxDB: SQL compatibility, easier joins with metadata

3. **ClickHouse** — Log storage
   - MergeTree engine with time-based partitioning
   - Full-text index on message field
   - TTL-based retention (30 days default)
   - Why not Loki: need full SQL for custom analytics, own our query layer

4. **PostgreSQL** — Metadata store
   - Alert rules, dashboard definitions, notification channels
   - Shared instance with TimescaleDB (TimescaleDB IS PostgreSQL)

5. **Collector Agent** — Standalone Python process
   - Ships system metrics (CPU, memory, disk, network)
   - Configurable collection interval
   - Batches and compresses before sending

### Multi-Tenancy Strategy (Future)
- `tenant_id` column on ALL data tables from day 1
- Row-level security (RLS) in PostgreSQL/TimescaleDB
- Separate ClickHouse databases per tenant for true isolation
- API key scoped to tenant

### Key Design Decisions
- **No message queue for MVP**: At 100K/sec on single machine, async batching
  with in-process buffers is sufficient. Adding Kafka/Redis Streams adds
  operational complexity without proportional benefit at this scale.
  Revisit at 500K+/sec or multi-node deployment.
- **Single FastAPI process**: Uvicorn with multiple workers. Alert evaluation
  runs as async background task within the same process.
- **Tenant-aware from day 1**: Every table has tenant_id. Default tenant
  for single-tenant mode. Zero schema changes needed for multi-tenant.

## Consequences
- Simpler ops (fewer moving parts) at the cost of single-machine ceiling
- TimescaleDB continuous aggregates handle rollups without a separate job
- ClickHouse gives us log analytics SQL superpowers
- Future multi-tenant migration is data-only, not schema change
