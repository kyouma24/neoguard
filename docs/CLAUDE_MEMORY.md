# CLAUDE MEMORY — NeoGuard Project

## 1. ACTIVE DIRECTIVES
The Principal Engineer Mandate is in effect. I adhere to the Seven Laws.
Mandate file: `.claude/persona/max.md`

## 2. CURRENT TASK STATE
- Task: Codebase hardening round 2 COMPLETE
- Phase: All 15 P0 + 24 P1 + 12 P2 + 1 P3 = 52 findings fixed. 16 remain (4 P1, 9 P2, 3 P3).
- Blockers: None
- Last action: Fixed 18 more findings (7 P1, 10 P2, 1 P3). 1,309 backend + 508 frontend = 1,817 tests passing.
- Next action: Remaining 16 findings are design decisions (MQL-007 variable substitution architecture), deferred to cloud (INFRA-004 secrets), or cosmetic (FE-007/008/011/013 type casts)

## 3. KEY ARCHITECTURAL DECISIONS (from ADRs + specs)
- ADR-0001: Stack selection — Python/FastAPI/asyncpg/TimescaleDB/React/Vite (locked)
- ADR-0002: Modular monolith topology — single FastAPI process, internal package boundaries
- ADR-0004: ID coexistence — ULID (existing tables) + UUIDv7 (Phase 1+ tables)
- ADR-0005: SCSS with design tokens, no Tailwind/Shadcn
- ADR-0006: API key hash versioned format — SHA-256 (v1) migrating to Argon2id (v2)
- MQL: Recursive-descent parser, parameterized SQL, defense-in-depth (tokenizer->parser->compiler->RLS)
- Sessions: Redis, HttpOnly cookies, 30d sliding TTL (users), 4h absolute (super admins)
- Dashboards: uPlot for timeseries/area, Recharts for others, @dnd-kit grid, widget registry pattern
- Real-time: SSE (not WebSocket) for live mode
- Spec 00 governs security posture, Spec 02 governs dashboards

## 4. MODULES REVIEWED
| Module | Last reviewed | Findings | Status |
|---|---|---|---|
| Infrastructure | 2026-05-02 | 3 P0, 8 P1, 2 P2 (13) | Review complete |
| Security | 2026-05-02 | 3 P0, 5 P1, 4 P2, 1 P3 (13) | Review complete |
| MQL Engine | 2026-05-02 | 3 P0, 5 P1, 4 P2, 1 P3 (13) | Review complete |
| Dashboard Backend | 2026-05-02 | 4 P0, 6 P1, 5 P2, 1 P3 (16) | Review complete |
| Frontend Security | 2026-05-02 | 2 P0, 4 P1, 6 P2, 1 P3 (13) | Review complete |

## 5. OPEN FINDINGS STATUS
All 15 P0 FIXED. 17 of 28 P1 FIXED. 2 P2 bonus fixes.
See `docs/review/FINDINGS.md` for full fix log (34 fixes applied).
Remaining: 11 P1, 19 P2, 4 P3 = 34 open

## 6. PATTERNS I HAVE ESTABLISHED IN THIS CODEBASE
(To be populated during review)

## 7. THINGS I HAVE VERIFIED EXIST
- `docs/CLAUDE_MEMORY.md` — this file
- `docs/review/FINDINGS.md` — findings index
- `.claude/persona/max.md` — Principal Engineer Mandate
- DB port: 5433 (not 5432 — local PostgreSQL occupies 5432)
- `alembic.ini` has port 5432 (WRONG — known bug, not yet fixed in file)
- `dashboard_versions` table was rebuilt via ad-hoc SQL (not Alembic) — schema mismatch risk

## 8. TRAPS / GOTCHAS DISCOVERED
- ~~`alembic.ini` uses port 5432~~ FIXED: port 5433 + env var override in env.py
- ~~`dashboard_versions` not in migration~~ FIXED: migration 004
- ~~PATCH INTERNAL_ERROR from stale prepared statements~~ FIXED: statement_cache_size=0
- Metric names in DB are snake_case (e.g., `aws.ec2.cpuutilization`), but CloudWatch METRIC_DEFINITIONS use CamelCase — mismatch was silently introduced and required manual DB fixup
- `panels` column in `dashboards` table is JSONB but asyncpg returns it as `str` (not parsed) — must json.loads() before use
- Super admin bypass: `get_tenant_id()` returns `None`, service functions must handle `if tenant_id:` guard
- Config: `NEOGUARD_DEBUG=true` required for dev (provides default db_password and session_secret)
- Migration 004 adds FORCE RLS — existing dev DB needs `alembic upgrade head` after this change

## 9. SCRATCHPAD
Session started: 2026-05-02
Prior session context: ~1,769 tests passing, dashboard with 31 panels created, metric names fixed in DB
Known broken: PATCH dashboard API, alembic.ini port, dashboard_versions not in migration chain
