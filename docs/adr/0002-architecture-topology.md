# ADR-0002: Architecture Topology — Modular Monolith

**Status**: Accepted  
**Date**: 2026-05-01  
**Author**: ObserveLabs Engineering

---

## Context

ObserveLabs needs to define its service topology for the MVP: how many deployable units, how they communicate, and where data flows. The platform has several distinct workloads:

- **API serving**: REST endpoints for the React dashboard and external integrations
- **Metric collection**: Polling AWS CloudWatch and Azure Monitor on intervals
- **Alert evaluation**: 15-second loop evaluating threshold rules against recent metrics
- **Telemetry**: Self-monitoring (32 internal metric series)
- **Log ingestion**: Receiving and storing structured logs in ClickHouse

A microservices architecture would give independent scaling and fault isolation. A monolith would simplify development, deployment, and debugging. We must choose the right trade-off for a solo developer shipping an MVP.

## Decision

**Modular monolith**: a single FastAPI process with internal package boundaries. Not microservices.

### Runtime Topology

```
┌─────────────────────────────────────────────────────┐
│                  FastAPI Process                     │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  REST API   │  │  Background  │  │ WebSocket  │  │
│  │  (12 route  │  │  Tasks       │  │ Connections│  │
│  │   modules)  │  │  - AlertEngine│ │ (planned)  │  │
│  │             │  │  - Collector  │  │            │  │
│  │             │  │  - Telemetry  │  │            │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                │          │
│         └────────┬───────┴────────┬───────┘          │
│                  │                │                   │
└──────────────────┼────────────────┼───────────────────┘
                   │                │
        ┌──────────┴──┐    ┌───────┴────────┐
        │ TimescaleDB  │    │   ClickHouse   │
        │ (metrics,    │    │   (logs)       │
        │  metadata,   │    │                │
        │  alerts,     │    └────────────────┘
        │  resources)  │
        └──────────────┘
```

### Internal Package Boundaries

The monolith is organized into clear Python packages that mirror potential future service boundaries:

| Package | Responsibility |
|---------|---------------|
| `neoguard.api.routes.*` | HTTP route handlers (12 modules) |
| `neoguard.services.*` | Business logic (12 service modules) |
| `neoguard.models.*` | SQLAlchemy models, Pydantic schemas |
| `neoguard.collector.*` | AWS/Azure discovery and metric collection |
| `neoguard.alerting.*` | Alert engine, rule evaluation, notifications |
| `neoguard.core.*` | Config, auth, database connections, middleware |

### Communication Patterns

| Path | Protocol | Library |
|------|----------|---------|
| Browser to API | HTTP REST + WebSocket | fetch / native WS |
| API to TimescaleDB | PostgreSQL wire protocol | asyncpg |
| API to ClickHouse | HTTP interface | clickhouse-connect |
| API to Redis | RESP protocol | redis.asyncio |
| API to AWS | HTTPS (SigV4) | aioboto3 |
| API to Azure | HTTPS (OAuth2) | azure-identity + mgmt SDKs |
| API to webhooks/notifications | HTTPS | aiohttp |
| Internal (service to service) | Direct Python function calls | None (no message bus) |

### Rationale

1. **Solo developer** — the operational overhead of deploying, monitoring, and debugging multiple services is unjustifiable at this stage.
2. **One repo, one deployment unit, one process** — `git push` deploys everything. No service mesh, no API gateway, no inter-service auth.
3. **Package boundaries enforce modularity** — `neoguard.alerting` does not import from `neoguard.collector`. These boundaries make future extraction straightforward.
4. **Background tasks as asyncio coroutines** within the same event loop. No Celery, no message broker, no task queue infrastructure.
5. **Shared database connections** — a single asyncpg pool serves both API queries and background task writes, with connection limits tuned to avoid contention.

## Scaling Strategy (When Needed)

Extraction follows workload priority, not arbitrary service boundaries:

1. **Horizontal process scaling** — run multiple uvicorn workers behind a load balancer. Redis handles shared state (sessions, rate limits, distributed locks).
2. **Extract alert engine first** — it is the most CPU-intensive workload (rule evaluation, aggregation, state machine transitions). Runs as a separate process reading from the same TimescaleDB.
3. **Extract collector second** — metric discovery and CloudWatch polling are I/O-heavy and independently schedulable. Natural fit for a separate worker process.
4. **API remains monolithic last** — it is the simplest workload (thin handlers delegating to services) and benefits least from extraction.
5. **Message bus (Redis Streams or SQS) introduced only at step 2** — when the alert engine becomes a separate process, it needs a channel to receive metric events.

## Consequences

### Positive

- **Simplicity**: one Docker image, one process to monitor, one log stream to tail.
- **Development velocity**: no inter-service contracts to negotiate, no distributed transaction concerns, no network serialization overhead for internal calls.
- **Testing**: unit and integration tests run against a single process. No test harness needed to spin up dependent services.
- **Debugging**: a single stack trace from HTTP request to database query. No distributed tracing required (for now).

### Negative

- **Resource contention**: all background tasks (alert engine, collector, telemetry) compete with API request handling for CPU and event loop time. Mitigated by asyncio cooperative scheduling and by keeping background tasks I/O-bound.
- **Blast radius**: a bug in the alert engine (e.g., infinite loop, memory leak) could degrade API responsiveness. Mitigated by asyncio task isolation and watchdog timeouts.
- **No independent scaling**: cannot scale ingest separately from query or alerting. Acceptable at 10k metrics/sec and fewer than 100 users.
- **Deployment coupling**: a change to alert logic requires redeploying the entire application. Acceptable trade-off for solo development velocity.

### Review Trigger

Revisit this ADR when any of the following occur:
- Sustained metrics ingest exceeds 50k/sec
- Alert evaluation loop consistently exceeds 5 seconds
- Team grows beyond 3 developers working on independent subsystems
- Uptime SLA requires independent failure domains
