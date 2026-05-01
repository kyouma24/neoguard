# NeoGuard Project Structure

```
NewClaudeNeoGuard/
│
├── docker-compose.yml              # Service orchestration (TimescaleDB, ClickHouse, API)
├── Dockerfile                      # API container image (Python 3.11-slim, uvicorn 4 workers)
├── pyproject.toml                  # Python project config, dependencies, ruff/mypy/pytest settings
├── CLAUDE.md                       # Developer quick-reference (conventions, commands)
│
├── docker/
│   ├── timescaledb/
│   │   └── init.sql                # Full DB schema: hypertables, continuous aggregates,
│   │                               #   compression, retention, alert/dashboard/resource tables
│   └── clickhouse/
│       └── init.sql                # Log table: MergeTree, bloom filter index, TTL retention
│
├── src/neoguard/                   # Python backend package
│   ├── __init__.py
│   ├── main.py                     # FastAPI app — lifespan, CORS, router registration
│   │
│   ├── core/
│   │   ├── config.py               # Pydantic Settings (NEOGUARD_ env prefix, all defaults)
│   │   └── logging.py              # structlog setup (JSON in prod, console in debug)
│   │
│   ├── api/
│   │   ├── deps.py                 # get_tenant_id() dependency (single-tenant → "default")
│   │   ├── middleware/
│   │   │   └── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── health.py           # GET /health — DB checks, writer stats
│   │       ├── metrics.py          # POST /ingest, POST /query, GET /names, GET /stats
│   │       ├── logs.py             # POST /ingest, POST /query
│   │       ├── alerts.py           # Alert rules CRUD, events list
│   │       ├── dashboards.py       # Dashboard CRUD
│   │       ├── resources.py        # Resource CRUD + summary
│   │       ├── aws_accounts.py     # AWS account CRUD
│   │       └── collection.py       # Discovery trigger, collection job history
│   │
│   ├── models/                     # Pydantic v2 data models
│   │   ├── __init__.py
│   │   ├── metrics.py              # MetricPoint, MetricBatch, MetricQuery, MetricQueryResult
│   │   ├── logs.py                 # LogEntry, LogBatch, LogQuery, LogQueryResult
│   │   ├── alerts.py               # AlertRuleCreate/Update/AlertRule, AlertEvent
│   │   ├── dashboards.py           # PanelDefinition, DashboardCreate/Update/Dashboard
│   │   ├── resources.py            # ResourceType (30+ types), Provider, Resource CRUD models
│   │   └── aws.py                  # AWSAccount CRUD models, CollectionJob
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── timescale/
│   │   │   ├── __init__.py
│   │   │   └── connection.py       # asyncpg pool: init_pool(), close_pool(), get_pool()
│   │   └── clickhouse/
│   │       ├── __init__.py
│   │       └── connection.py       # Async ClickHouse client management
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   │
│   │   ├── metrics/
│   │   │   ├── __init__.py
│   │   │   ├── writer.py           # MetricBatchWriter — COPY protocol, dual flush triggers
│   │   │   └── query.py            # Auto table selection (raw/1m/1h), aggregation, tag filters
│   │   │
│   │   ├── logs/
│   │   │   ├── __init__.py
│   │   │   ├── writer.py           # LogBatchWriter — ClickHouse bulk insert
│   │   │   └── query.py            # Parameterized ClickHouse queries, full-text search
│   │   │
│   │   ├── alerts/
│   │   │   ├── __init__.py
│   │   │   ├── crud.py             # Alert rules CRUD, events list
│   │   │   └── engine.py           # Background AlertEngine — state machine, 15s eval loop
│   │   │
│   │   ├── resources/
│   │   │   ├── __init__.py
│   │   │   └── crud.py             # Resource CRUD + upsert (dedup by external_id) + summary
│   │   │
│   │   ├── aws/
│   │   │   ├── __init__.py
│   │   │   ├── credentials.py      # boto3 session mgmt, assume-role, session caching (3500s TTL)
│   │   │   ├── accounts.py         # AWS account CRUD, mark_synced
│   │   │   └── cloudwatch.py       # CloudWatch batch collector — 98 metrics, 15 namespaces
│   │   │
│   │   ├── discovery/
│   │   │   ├── __init__.py
│   │   │   └── aws_discovery.py    # Auto-discover: EC2, RDS, Lambda, ALB, DynamoDB, SQS,
│   │   │                           #   ECS, ElastiCache, S3
│   │   │
│   │   ├── collection/
│   │   │   ├── __init__.py
│   │   │   ├── jobs.py             # Collection job CRUD (create, complete, list)
│   │   │   └── orchestrator.py     # Background loops: discovery (5min), metrics (60sec)
│   │   │
│   │   └── dashboards.py           # Dashboard CRUD service
│   │
│   ├── collector/
│   │   ├── __init__.py
│   │   └── agent.py                # Standalone CLI agent — psutil metrics → HTTP → API
│   │                               #   CPU, memory, disk, disk IO, network, processes, TCP
│   │
│   └── schemas/
│       └── __init__.py
│
├── frontend/                       # React + TypeScript SPA
│   ├── package.json                # React 18, React Router, Recharts, Lucide, date-fns
│   ├── tsconfig.json               # Strict mode, ES2020 target, @/* path alias
│   ├── vite.config.ts              # React plugin, /api + /health proxy → localhost:8000
│   │
│   └── src/
│       ├── main.tsx                # Entry point — React 18 createRoot, BrowserRouter
│       ├── App.tsx                 # Route definitions (/, /metrics, /logs, /alerts, /dashboards)
│       ├── index.css               # Dark theme, CSS variables, base styles
│       │
│       ├── components/
│       │   ├── Layout.tsx          # Sidebar navigation (Activity, Metrics, Logs, Alerts, Dashboards)
│       │   └── TimeSeriesChart.tsx # Recharts LineChart wrapper
│       │
│       ├── pages/
│       │   ├── OverviewPage.tsx    # System health, writer stats, DB checks
│       │   ├── MetricsPage.tsx     # Metric explorer — name picker, time range, aggregation
│       │   ├── LogsPage.tsx        # Log viewer
│       │   ├── AlertsPage.tsx      # Alert rules table, events table
│       │   └── DashboardsPage.tsx  # Dashboard list
│       │
│       ├── hooks/
│       │   ├── useApi.ts           # Generic fetch hook (loading, error, data, refetch)
│       │   └── useInterval.ts      # setInterval hook
│       │
│       ├── services/
│       │   └── api.ts              # HTTP client — all API methods (health, metrics, logs, alerts, dashboards)
│       │
│       └── types/
│           └── index.ts            # TypeScript interfaces for all data models
│
├── tests/
│   ├── unit/                        # 167 tests — no database needed
│   │   ├── test_config.py          # Settings defaults, DSN format (4)
│   │   ├── test_models.py          # Core Pydantic model validation (11)
│   │   ├── test_models_extended.py # All model validation — resources, auth, alerts (36)
│   │   ├── test_auth.py            # API key generation and hashing (6)
│   │   ├── test_aws_utils.py       # CloudWatch helpers, tag conversion, metrics (21)
│   │   ├── test_discovery.py       # All 24 AWS discovery functions, mocked (23)
│   │   ├── test_middleware.py      # Auth, rate limit, request logging middleware (15)
│   │   ├── test_writers.py         # MetricBatchWriter and LogBatchWriter (16)
│   │   └── test_alert_engine.py    # Alert engine state machine and conditions (34)
│   └── integration/                # 21 tests — requires running databases
│       └── test_api.py             # Full API CRUD lifecycle tests
│
└── docs/
    ├── architecture.md             # System architecture, components, tech stack
    ├── api-reference.md            # Full API endpoint documentation
    ├── deployment.md               # Local dev, production, AWS IAM, DB maintenance
    ├── testing.md                  # Test commands, manual testing, troubleshooting
    ├── data-flow.md                # How data moves through the system
    ├── database-schema.md          # All table definitions, indexes, policies
    ├── project-structure.md        # This file
    └── adr/
        └── 001-architecture-overview.md  # Architecture Decision Record
```
