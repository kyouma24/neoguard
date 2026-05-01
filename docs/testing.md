# NeoGuard Testing Guide

## Test Structure

```
tests/
  unit/                       # No database needed (167 tests)
    test_config.py            # Settings defaults and DSN format (4)
    test_models.py            # Core Pydantic model validation (11)
    test_models_extended.py   # Extended model validation — all models (36)
    test_auth.py              # API key generation and hashing (6)
    test_aws_utils.py         # _safe_id, _snake_case, tag conversion, metric defs (21)
    test_discovery.py         # All 24 AWS discovery functions (mocked) (23)
    test_middleware.py         # Auth, rate limiting, request logging middleware (15)
    test_writers.py           # MetricBatchWriter and LogBatchWriter (16)
    test_alert_engine.py      # Alert engine state machine and conditions (34)
  integration/                # Requires running databases (21 tests)
    test_api.py               # Full API endpoint tests — all CRUD lifecycles
```

---

## Running Tests

### Unit Tests (No Dependencies)

```bash
pytest tests/unit/ -v
```

These test Pydantic model validation, configuration defaults, and pure logic. They run anywhere without databases.

### Integration Tests (Requires Databases)

Start databases first:
```bash
docker compose up -d timescaledb clickhouse
```

Then run:
```bash
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v
```

Integration tests are gated — they automatically skip if the databases are unreachable.

### Full Suite

```bash
NEOGUARD_DB_PORT=5433 pytest tests/ -v --tb=short
```

### With Coverage

```bash
NEOGUARD_DB_PORT=5433 pytest tests/ --cov=neoguard --cov-report=term-missing
```

---

## Linting and Type Checking

### Ruff (Linter + Formatter)

```bash
# Check for issues
python -m ruff check src/ tests/

# Auto-fix safe issues
python -m ruff check src/ tests/ --fix

# Format code
python -m ruff format src/ tests/
```

Ruff configuration is in `pyproject.toml`:
- Line length: 100
- Target: Python 3.11
- Enabled rule sets: E, F, W, I, N, UP, S, B, A, C4, T20, SIM, TCH
- Ignored: S101 (assert in tests), S608 (parameterized SQL false positives), S110 (broad exception pass)

### MyPy (Type Checking)

```bash
python -m mypy src/neoguard/
```

Strict mode is enabled in `pyproject.toml`.

---

## Manual Testing

### Health Check

```bash
curl http://localhost:8000/health
```

Expected: all checks `"ok"`, status `"healthy"`.

### Metric Ingestion + Query

**Ingest**:
```bash
curl -X POST http://localhost:8000/api/v1/metrics/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [
      {"name": "test.metric", "value": 42.0, "tags": {"env": "test"}}
    ]
  }'
```

**Verify** (wait a few seconds for the batch writer to flush):
```bash
curl http://localhost:8000/api/v1/metrics/names
```

Should include `"test.metric"` in the response.

**Query**:
```bash
curl -X POST http://localhost:8000/api/v1/metrics/query \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test.metric",
    "start": "2026-04-29T00:00:00Z",
    "end": "2026-04-30T00:00:00Z",
    "interval": "1m",
    "aggregation": "avg"
  }'
```

### Log Ingestion + Query

**Ingest**:
```bash
curl -X POST http://localhost:8000/api/v1/logs/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "logs": [
      {
        "severity": "error",
        "service": "test-service",
        "message": "Something went wrong"
      }
    ]
  }'
```

**Query**:
```bash
curl -X POST http://localhost:8000/api/v1/logs/query \
  -H "Content-Type: application/json" \
  -d '{
    "service": "test-service",
    "severity": "error",
    "limit": 10
  }'
```

### Alert Rule CRUD

**Create**:
```bash
curl -X POST http://localhost:8000/api/v1/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High CPU Test",
    "metric_name": "system.cpu.percent",
    "condition": "gt",
    "threshold": 95.0,
    "duration_sec": 60,
    "severity": "critical"
  }'
```

**List**:
```bash
curl http://localhost:8000/api/v1/alerts/rules
```

**Check events** (after the rule has had time to evaluate):
```bash
curl http://localhost:8000/api/v1/alerts/events
```

### Resource CRUD

**Create**:
```bash
curl -X POST http://localhost:8000/api/v1/resources \
  -H "Content-Type: application/json" \
  -d '{
    "resource_type": "server",
    "provider": "local",
    "name": "test-server",
    "tags": {"env": "dev"}
  }'
```

**List with filter**:
```bash
curl "http://localhost:8000/api/v1/resources?provider=local"
```

**Summary**:
```bash
curl http://localhost:8000/api/v1/resources/summary
```

### AWS Account CRUD

**Create**:
```bash
curl -X POST http://localhost:8000/api/v1/aws/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Account",
    "account_id": "123456789012",
    "regions": ["us-east-1"]
  }'
```

**List**:
```bash
curl http://localhost:8000/api/v1/aws/accounts
```

### Trigger Discovery

```bash
# First, note the id from the AWS account create response
curl -X POST http://localhost:8000/api/v1/collection/discover \
  -H "Content-Type: application/json" \
  -d '{"aws_account_id": "<id-from-create>"}'
```

This will fail with credential errors unless valid AWS credentials are configured. That's expected in local dev without AWS access.

### Collection Job History

```bash
curl http://localhost:8000/api/v1/collection/jobs
```

---

## Collector Agent Testing

Start the collector and verify metrics flow through:

```bash
# Start collector
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10

# After 10-15 seconds, check metric names
curl http://localhost:8000/api/v1/metrics/names
```

Expected metrics include:
- `system.cpu.percent`, `system.cpu.user`, `system.cpu.system`, `system.cpu.idle`
- `system.memory.percent`, `system.memory.used_bytes`, `system.memory.available_bytes`
- `system.swap.percent`
- `system.disk.percent`, `system.disk.used_bytes`
- `system.disk.read_bytes`, `system.disk.write_bytes`, `system.disk.read_count`, `system.disk.write_count`
- `system.network.bytes_sent`, `system.network.bytes_recv`
- `system.process.count`, `system.process.cpu_percent`, `system.process.memory_percent`
- `system.tcp.connections`
- `system.load.1`, `system.load.5`, `system.load.15` (Linux/macOS only)

### Verify Metrics in TimescaleDB

```bash
docker exec newclaudeneoguard-timescaledb-1 psql -U neoguard -d neoguard -c \
  "SELECT name, COUNT(*), AVG(value) FROM metrics WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY name ORDER BY name;"
```

---

## Frontend Testing

Start the full stack (API + collector + frontend):

```bash
# Terminal 1: API
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Collector
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10

# Terminal 3: Frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` and verify:

1. **Overview page** (`/`): Shows "healthy" status, metrics written count increasing, both DB checks green
2. **Metrics page** (`/metrics`): Select a metric name from the dropdown, choose a time range, click query — chart should render
3. **Logs page** (`/logs`): Should show empty state or logs if you've ingested any
4. **Alerts page** (`/alerts`): Should show alert rules list (empty initially) and events
5. **Dashboards page** (`/dashboards`): Should show dashboard list

---

## Database Reset

To start fresh (deletes all data):

```bash
# Stop everything
docker compose down

# Remove volumes
docker volume rm newclaudeneoguard_timescaledb_data newclaudeneoguard_clickhouse_data

# Restart (init scripts re-run on fresh volumes)
docker compose up -d timescaledb clickhouse
```

---

## Troubleshooting

### API won't start — "password authentication failed"
The `NEOGUARD_DB_PORT` doesn't match the TimescaleDB port. In local dev with port 5433 mapping, set `NEOGUARD_DB_PORT=5433`.

### Collector shows connection errors
The API server isn't running or isn't reachable at the configured URL. Check `--api-url` parameter.

### Metrics names endpoint returns empty
The batch writer hasn't flushed yet. Wait 1-2 seconds (flush interval is 200ms). If still empty, check the health endpoint to verify TimescaleDB connectivity.

### ClickHouse authentication error (code 516)
The ClickHouse container needs `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: 1` in its environment. This is already set in `docker-compose.yml`.

### Frontend shows "Network Error"
The Vite dev proxy isn't reaching the backend. Ensure the API is running on port 8000 and check `frontend/vite.config.ts` proxy config.

### TimescaleDB port conflict
If port 5432 is used by a local PostgreSQL install, the compose file maps to 5433. Set `NEOGUARD_DB_PORT=5433` for local dev.
