# ADR-0001: Technology Stack Selection

**Status**: Accepted  
**Date**: 2026-05-01  
**Author**: ObserveLabs Engineering

---

## Context

ObserveLabs is an AWS-focused monitoring platform (Datadog competitor MVP). The project operates under tight constraints:

- Solo developer
- $500--1000/mo infrastructure budget
- 10k metrics/sec peak ingest rate
- Fewer than 100 users
- 3-month data retention
- Must ship a usable product quickly while leaving room to scale

We need to select a technology stack that maximizes development velocity without painting us into a corner on performance or operability.

## Decision

The following stack is **locked** for the MVP. Changes require a new ADR.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | Python 3.11+ / FastAPI | Async-first, excellent for I/O-bound monitoring workloads. boto3 ecosystem for AWS. Fast development velocity for a solo developer. |
| Metadata + Metrics DB | PostgreSQL 16 (TimescaleDB) | TimescaleDB hypertables for time-series on top of Postgres. Single DB engine for both metadata and metrics reduces operational complexity. Continuous aggregates handle 1m and 1h rollups without application code. |
| Logs DB | ClickHouse 24.8 | Column-oriented, 10--100x faster than Postgres for log queries. Compression ratios of 5--15x. Community edition handles our volume at zero license cost. |
| Cache / Sessions / Rate Limits | Redis | Session store, query cache, sliding-window rate limiting, and pub/sub for future WebSocket fan-out. One dependency serves multiple concerns. |
| Frontend | TypeScript (strict) / React 18 / Vite 6 | Industry standard. Strict TypeScript catches bugs at compile time. Vite provides sub-second HMR during development. |
| Charting | Recharts (evaluate uPlot later) | Recharts integrates natively with React component model. If performance degrades beyond 20 concurrent series, migrate to uPlot (canvas-based, 10x lighter). |
| Auth | Argon2id (passwords), Redis (sessions) | Argon2id is the OWASP-recommended password hash. Stateful Redis sessions enable instant revocation without JWT refresh complexity. |
| IDs | ULID (application), UUIDv7 (DB where native support exists) | Both are time-ordered. ULID is shorter and URL-safe for API responses. UUIDv7 leverages Postgres native uuid type where beneficial. |
| Serialization | orjson / Pydantic v2 | orjson is 3--10x faster than stdlib json. Pydantic v2 (Rust core) for request/response validation with minimal overhead. |
| Infra | Docker Compose (dev), EC2 + RDS (prod) | Compose provides local dev-prod parity. EC2 t3.large is sufficient for MVP scale at approximately $60/mo. |

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Go or Rust backend | Faster runtime, but significantly slower development velocity for a solo developer. Python's async model is sufficient for I/O-bound monitoring workloads at our scale. |
| InfluxDB instead of TimescaleDB | Less mature query ecosystem. InfluxQL/Flux are not SQL. TimescaleDB lets us use standard SQL, JOINs across metadata and metrics, and existing Postgres tooling (pg_dump, Alembic, asyncpg). |
| MongoDB for metadata | Poor fit for time-series data. No continuous aggregates. Flexible schema is a liability for a monitoring platform where data shapes are well-defined. |
| JWT sessions | No instant revocation without a blocklist (which reintroduces server state). Token refresh adds client complexity. Redis sessions are simpler and more secure for our user count. |
| Grafana embedding | Vendor lock-in on visualization. Limited control over UX. ObserveLabs needs to own its dashboard experience to differentiate from "just another Grafana wrapper." |
| Loki instead of ClickHouse | Designed for Kubernetes label-indexed logs. ClickHouse offers true columnar storage, faster ad-hoc queries, and better compression for our structured log format. |

## Consequences

### Positive

- Python + FastAPI enables rapid iteration; the entire backend (79 files, 12 route modules) was built by one developer.
- TimescaleDB continuous aggregates eliminate custom rollup infrastructure.
- Single-language backend (Python) means no context-switching between services.
- Strict TypeScript on the frontend catches integration errors early.

### Negative

- **Python GIL** limits CPU-bound parallelism. Mitigated by async I/O for all network calls and uvicorn process workers for CPU scaling.
- **TimescaleDB** requires PostgreSQL operational expertise (vacuuming, chunk management, connection pooling). Not NoSQL-friendly for developers used to document stores.
- **Redis is a SPOF** for sessions and rate limiting. Mitigated by Redis Sentinel or ElastiCache in production.
- **React bundle size** needs monitoring. Currently 794KB gzipped; budget is under 1MB. Tree-shaking and lazy routes will be needed as the app grows.
- **ClickHouse async client** is a thread-pool wrapper today. Native async is available only as a prerelease (0.12.0rc1). Acceptable for MVP log volumes.

### Risks

- Python 3.14 (bleeding edge) may have ecosystem compatibility gaps. Minimum supported is 3.11+.
- If metrics volume exceeds 50k/sec, the Python ingest path may become a bottleneck before the database does. Extraction to a Go/Rust ingest proxy is the planned escape hatch.
