# NeoGuard

Production-grade monitoring and observability platform. Collects metrics from servers and AWS cloud services, stores time-series data and logs, evaluates alerts, and provides a web dashboard for visualization.

## Features

- **Metric Ingestion** — High-throughput batch writer using PostgreSQL COPY protocol (target: 100K metrics/sec)
- **Time-Series Storage** — TimescaleDB with automatic continuous aggregates (1m, 1h rollups) and compression
- **Log Storage** — ClickHouse with full-text search, column-store efficiency, and TTL retention
- **Alert Engine** — Background evaluator with state machine (OK → PENDING → FIRING → RESOLVED)
- **OS Monitoring** — Collector agent gathers CPU, memory, disk, disk IO, network, process, and TCP metrics via psutil
- **AWS Cloud Monitoring** — Auto-discovers EC2, RDS, Lambda, ALB/NLB, DynamoDB, SQS, ECS, ElastiCache, S3 resources and collects CloudWatch metrics across 15 namespaces (98 metric definitions)
- **Resource Registry** — Central inventory of all monitored infrastructure with provider-specific metadata
- **Dashboard Builder** — Custom dashboards with configurable panels
- **Multi-Tenant Ready** — `tenant_id` on every table from day 1, single-tenant default

## Architecture

```
  Collector Agent ──┐        ┌── React Frontend
                    ▼        ▼
              ┌──────────────────┐
              │  FastAPI Backend  │
              │  (async, Python)  │
              └──┬───────────┬───┘
                 ▼           ▼
           TimescaleDB   ClickHouse
           (metrics)      (logs)
```

## Quick Start

```bash
# 1. Start databases
docker compose up -d timescaledb clickhouse

# 2. Install Python dependencies
pip install -e ".[dev]"

# 3. Start API server
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000

# 4. Start collector agent (separate terminal)
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10

# 5. Start frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173` to access the dashboard.

## API Endpoints

| Group | Prefix | Operations |
|-------|--------|------------|
| Health | `/health` | System health + DB checks |
| Metrics | `/api/v1/metrics` | Ingest, query, list names, writer stats |
| Logs | `/api/v1/logs` | Ingest, query with full-text search |
| Alerts | `/api/v1/alerts` | Rule CRUD, event history |
| Dashboards | `/api/v1/dashboards` | Dashboard CRUD |
| Resources | `/api/v1/resources` | Resource CRUD, summary |
| AWS Accounts | `/api/v1/aws/accounts` | AWS account CRUD |
| Collection | `/api/v1/collection` | Discovery trigger, job history |

Interactive API docs: `http://localhost:8000/docs` (Swagger UI)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Python 3.11+, FastAPI, asyncpg, Pydantic v2 |
| Metrics DB | TimescaleDB (PostgreSQL) |
| Logs DB | ClickHouse |
| Frontend | React 18, TypeScript, Vite, Recharts |
| AWS | boto3 with STS assume-role |
| System Metrics | psutil |
| Serialization | orjson |
| Logging | structlog |
| IDs | python-ulid (ULID) |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, components, tech decisions |
| [API Reference](docs/api-reference.md) | Full endpoint documentation with examples |
| [Deployment Guide](docs/deployment.md) | Local dev, production, AWS IAM, DB maintenance |
| [Testing Guide](docs/testing.md) | Test commands, manual testing, troubleshooting |
| [Data Flow](docs/data-flow.md) | How data moves through the system |
| [Database Schema](docs/database-schema.md) | All table definitions, indexes, policies |
| [Project Structure](docs/project-structure.md) | Full annotated file tree |
| [ADR-001](docs/adr/001-architecture-overview.md) | Architecture Decision Record |

## Testing

```bash
pytest tests/unit/ -v                                  # Unit tests (no DB needed)
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v     # Integration tests (needs DB)
python -m ruff check src/ tests/                       # Lint
python -m mypy src/neoguard/                           # Type check
```

## License

Proprietary. All rights reserved.
