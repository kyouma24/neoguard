# NeoGuard — Production-Grade Monitoring Platform

## Project Structure
```
src/neoguard/          Python backend (FastAPI)
  api/routes/          REST API endpoints
  core/                Config, logging
  db/                  Database connections (TimescaleDB, ClickHouse)
  models/              Pydantic models
  services/            Business logic (metrics, logs, alerts, dashboards)
  collector/           System metrics collector agent
frontend/              React + TypeScript UI (Vite)
docker/                DB init scripts
tests/                 Unit + integration tests
docs/adr/              Architecture Decision Records
```

## Quick Start
```bash
# Start databases
docker compose up -d timescaledb clickhouse

# Install Python deps
pip install -e ".[dev]"

# Run API server
uvicorn neoguard.main:app --reload

# Run collector agent
python -m neoguard.collector.agent

# Frontend
cd frontend && npm install && npm run dev
```

## Key Conventions
- All data tables have `tenant_id` column (default: "default")
- Async everywhere — asyncpg for Postgres, async ClickHouse client
- Batch writers flush on size threshold OR time interval
- Use `python_ulid.ULID` for all generated IDs
- Pydantic v2 models for all API contracts
- orjson for JSON serialization (performance)

## Testing
```bash
pytest tests/unit/ -v           # Unit tests (no DB needed)
pytest tests/integration/ -v    # Integration tests (needs DB)
```
