# NeoGuard — Production-Grade Monitoring Platform

## Quick Start
```bash
# Start databases
docker compose up -d timescaledb clickhouse

# Install Python deps
pip install -e ".[dev]"

# Run API server (use port 5433 if local PG occupies 5432)
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000 --reload

# Run collector agent
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10

# Frontend
cd frontend && npm install && npm run dev
```

## Key Conventions
- All data tables have `tenant_id` column (default: "default")
- Async everywhere — asyncpg for Postgres, async ClickHouse client
- Batch writers flush on size threshold OR time interval
- Use `from ulid import ULID` for all generated IDs (package: `python-ulid`, import: `ulid`)
- Pydantic v2 models for all API contracts
- orjson for JSON serialization (performance)
- All environment variables use `NEOGUARD_` prefix

## Testing
```bash
pytest tests/unit/ -v                                     # Unit tests (no DB needed)
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v        # Integration tests (needs DB)
python -m ruff check src/ tests/                          # Lint
python -m mypy src/neoguard/                              # Type check
```

## Documentation
See `docs/` for comprehensive documentation:
- `docs/architecture.md` — System architecture, components, tech stack
- `docs/api-reference.md` — Full REST API documentation
- `docs/deployment.md` — Local dev, production deploy, AWS IAM setup
- `docs/testing.md` — Test commands, manual testing, troubleshooting
- `docs/data-flow.md` — How data moves through the system (with diagrams)
- `docs/database-schema.md` — All table definitions, indexes, policies
- `docs/project-structure.md` — Full file tree with descriptions
- `docs/adr/001-architecture-overview.md` — Architecture Decision Record
