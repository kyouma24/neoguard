# NeoGuard — Claude Operating Memory

> **Read this at every session start. Update at every task end. This is the source of truth.**

---

## 1. North Star

**Mission**: Evolve NeoGuard into ObserveLabs — production-grade multi-tenant AWS+Azure monitoring SaaS (Datadog competitor).

**Current goal**: Build boss demo on laptop. Show multi-tenant auth, role-based access, tenant isolation, admin panel, AWS+Azure monitoring, alerting. Get approval, then move to AWS cloud.

**Scope (Laptop Demo — NOW)**:
- Everything already built (7 pages, 39 resource types, 6 alert channels) — keep as-is
- User auth (email+password, Argon2id, Redis sessions)
- Multi-tenancy (RLS, tenants, memberships, roles, tenant switcher)
- Basic admin panel (tenant CRUD, impersonation, audit log)
- Auth telemetry (structured logs + metrics)
- API key v2 (Argon2id) with v1 SHA-256 compatibility

**Scope (After Cloud Approval — AWS)**:
- Google/GitHub OAuth (needs public callback URL)
- Azure AD SSO, AWS IAM Identity Center SSO (needs IdP config)
- Email delivery (SES/SMTP with verified domain) — verification, password reset, invites
- CloudFormation onboarding wizard (needs customer AWS account)
- HTTPS/TLS (needs domain + ACM cert)
- CORS lock-down (needs production domain)
- Secrets Manager integration
- MFA (TOTP with pyotp)
- GDPR export/delete (needs S3 for file storage)
- Multi-stage production Dockerfile
- WebSocket/real-time dashboards
- MQL query language
- Dashboard grid upgrade (drag/resize, 4 widget types)
- Home page redesign (spec 01)
- Metrics explorer upgrade
- Load testing (Locust)
- E2E tests (Playwright)

**Non-Goals**: Distributed tracing, ML/anomaly detection, mobile, advanced BI, GCP.

**Constraints**: Single AWS account, 10k metrics/sec peak, 3mo retention, <100 users, $500-1000/mo infra, solo dev.

---

## 2. Architecture Snapshot

```
                    +-----------+
                    | React SPA |  :5173 (Vite dev)
                    +-----+-----+
                          |
                    +-----v-----+
                    | FastAPI    |  :8000
                    | (uvicorn)  |
                    +--+--+--+--+
                       |  |  |
              +--------+  |  +--------+
              v           v           v
    +---------+--+  +-----+----+  +---+----------+
    | TimescaleDB|  | Redis    |  | ClickHouse   |
    | (pg16)     |  | :6379    |  | (24.8) :8123 |
    | :5433      |  | sessions |  | - logs       |
    | - metrics  |  | cache    |  +--------------+
    | - resources|  | rate lim |
    | - alerts   |  | pub/sub  |
    | - users    |  +----------+
    | - tenants  |
    | - api_keys |
    +------------+
```

**Topology**: Modular monolith (ADR-0002). Single FastAPI process with internal package boundaries. Background tasks (AlertEngine, Collector, Telemetry) run as asyncio coroutines in-process. Extraction path: alert engine first, collector second, API last.

**Tech Stack**:

| Layer | Tech | Version |
|-------|------|---------|
| Backend | Python / FastAPI / asyncpg / SQLAlchemy | 3.14 / 0.115+ / 0.30+ / 2.0+ |
| Frontend | TypeScript / React / Vite / Recharts | strict / 18.3 / 6.0 / 2.13 |
| Metrics DB | TimescaleDB (pg16) | latest-pg16 |
| Logs DB | ClickHouse | 24.8 |
| Serialization | orjson / Pydantic v2 | 3.10+ / 2.10+ |
| AWS SDK | boto3 / aioboto3 | 1.35+ / 13.0+ |
| Azure SDK | azure-identity + 8 mgmt packages | various |
| Sessions / Cache | Redis | 7.x |
| Tooling | ruff / mypy / pytest / vitest | 0.8+ / 1.13+ / latest / 4.1+ |

---

## 3. Current State

### Built
- **Backend** (79 Python files): 12 route modules, 12 service modules, full CRUD everywhere
- **AWS**: 24 discoverers, 20 CW namespaces, assume-role with external-id, live-tested (43 resources, 88K+ metrics)
- **Azure**: 15 discoverers, 10 Monitor metric types, service principal auth, live-tested (9 resources, 216 metrics)
- **Auth**: User auth (email+password, Argon2id, Redis sessions), API keys (v1 SHA-256 + v2 Argon2id), multi-tenancy (tenants, memberships, roles), admin panel (super admin CRUD, platform audit log), auth telemetry (9 counters), RLS on all tables
- **Alerting**: Rule CRUD, AlertEngine (15s eval loop, state machine ok->pending->firing->resolved->nodata), state persistence (survives restarts), 8 aggregation types (avg/min/max/sum/count/last/p95/p99), configurable cooldown, no-data handling (ok/keep/alert), flapping detection, silences (one-time + recurring + tag matchers), alert preview/dry-run, event acknowledgment
- **Notifications**: 6 channel types (webhook+HMAC signing, slack, email, freshdesk, pagerduty Events API v2, msteams Adaptive Cards), pluggable senders, dispatch on fire/resolve, Freshdesk ticket lifecycle, retry with backoff
- **Self-monitoring**: Request correlation IDs (ULID), metrics registry, telemetry collector (32 neoguard.* series), /system/stats, enhanced /health
- **Frontend** (26 TS/TSX files, 10 pages): Login, Signup, Overview, Infrastructure (24 AWS tabs + drill-down), Metrics, Logs, Alerts (with silences), Dashboards, Settings (wizard onboarding + notifications + API keys + team), Admin (super admin only — stats, tenants, users, audit log). Auth context, protected routes, tenant switcher.
- **MQL**: Tokenizer, recursive-descent parser, parameterized SQL compiler (defense-in-depth: tag key regex validation + parameterized values), post-processing executor (rate, derivative, moving_average, as_rate, as_count, abs, log). 3 API routes: query, batch, validate — all scope-enforced (`require_scope("read")`), tenant-isolated at compile time. Frontend MQL API client + panel editor MQL mode (maxLength=2000, debounced validation) + WidgetRenderer MQL-first integration.
- **Tests**: 1,001 total passing (891 unit + 110 frontend)
- **Infra**: Docker Compose (TimescaleDB + ClickHouse + API), Dockerfile (single-stage), Alembic migrations, CFT template for IAM role
- **Docs**: 8 docs in docs/ + ADR-001

### Phase 0 Complete — Planning Deliverables
- `docs/integration-map.md` — ER diagram, service topology, dependency DAG, 10 shared contracts, 8 conflicts, 11 gaps
- `docs/risks.md` — Top 10 risks ranked (H/H: multi-tenancy retrofit, auth complexity)
- `docs/build-plan.md` — 8-phase master roadmap, 70-87 days, +440 tests → ~1,070 total
- 6 ADRs: 0001 (stack), 0002 (topology), 0004 (ID coexistence), 0005 (SCSS tokens), 0006 (API key hash)

### Phase 1 Complete — Auth + Multi-Tenancy
**Auth + Multi-Tenancy (DONE):**
- [x] Add Redis to Docker Compose
- [x] DB tables: `users`, `tenants`, `tenant_memberships`, `user_invites`, `audit_log`, `platform_audit_log`, `security_log` (UUIDv7)
- [x] RLS policies on ALL existing data tables
- [x] Password auth service (Argon2id hashing, OWASP params)
- [x] Redis session store (HttpOnly cookie, 30d sliding TTL)
- [x] Auth middleware (session cookies + API keys, dual auth paths)
- [x] Auth routes: POST /auth/signup, /auth/login, /auth/logout, GET /auth/me
- [x] Tenant routes: POST/GET/PATCH /tenants, invite, member CRUD, role assignment, switch
- [x] API key v2 (Argon2id, `obl_live_` prefix) with v1 SHA-256 compatibility + hash_version column
- [x] Auth telemetry: 9 counters + structured JSON logs for all auth/tenant events
- [x] Frontend: login page, signup page
- [x] Frontend: AuthContext provider, protected routes, public routes
- [x] Frontend: tenant switcher in sidebar
- [x] Frontend: user info + logout in sidebar
- [x] Settings page: Team tab (invite, roles, remove members)
- [x] Existing 7 pages: wrapped in auth, UI unchanged
- [x] +76 new backend tests (sessions, users, admin, models, telemetry)

**Admin Panel (DONE):**
- [x] DB tables: `audit_log`, `platform_audit_log`, `security_log` (UUIDv7)
- [x] Admin routes under /api/v1/admin/* (super_admin gated): stats, tenants, users, audit-log
- [x] Tenant management: list, suspend/activate
- [x] User management: grant/revoke super_admin, activate/deactivate
- [x] Platform audit log (all admin actions logged)
- [x] Frontend: Admin page (overview stats, tenants table, users table, audit log)
- [x] Admin nav item (visible only to super admins)

**Laptop Demo TODO — ALL COMPLETE:**
- [x] Alembic migrations for new tables (001 initial schema + 002 password reset tokens)
- [x] CSRF protection middleware (double-submit cookie, stale session recovery on /auth/me)
- [x] Super admin bootstrap CLI: `python -m neoguard.cli bootstrap-admin`
- [x] Password reset flow (backend tokens + frontend pages + console email)
- [x] User impersonation (read-only session, time-limited, audit-logged, yellow banner)
- [x] Role-based UI constraints (viewer=read-only, usePermissions hook across all pages)
- [x] Tenant ID migration (1.18M+ rows from "default" to UUID, fixed 4 source files)
- [x] Super admin platform-wide access audited and documented (bypass filtering, tenant_id=None)

### After Cloud TODO (post-approval)
- [ ] Google/GitHub OAuth (needs public callback URL + registered OAuth app)
- [ ] Azure AD SSO (needs IdP config + SAML/OIDC endpoint)
- [ ] AWS IAM Identity Center SSO (needs AWS org setup)
- [ ] Email delivery — SES/SMTP (verification, password reset, invites)
- [ ] CloudFormation onboarding wizard
- [ ] HTTPS/TLS (domain + ACM cert)
- [ ] CORS lock-down to production domain
- [ ] Secrets Manager integration
- [ ] MFA (TOTP with pyotp, backup codes)
- [ ] GDPR export/delete (needs S3)
- [ ] Multi-stage production Dockerfile
- [ ] WebSocket/real-time dashboards
- [x] MQL query language (tokenizer + parser + compiler + executor + API + frontend integration)
- [x] Dashboard grid (react-grid-layout, 6 widget types, MQL query mode, time controls)
- [ ] Dashboard variables system ($env substitution, dropdown in header)
- [ ] Home page redesign (spec 01 — health banner, firing alerts, favorites)
- [ ] Metrics explorer upgrade (typeahead, multi-query overlay, save-to-dashboard)
- [ ] Load testing (Locust, 100 concurrent users)
- [ ] E2E tests (Playwright, 5 critical paths)
- [ ] Spec 09 onboarding flow (self-service signup → auto-CloudFormation → first dashboard <5min)

---

## 4. Conventions

**Python**:
- Existing tables: `from ulid import ULID` for IDs (package: `python-ulid`)
- New tables (Phase 1+): UUIDv7 via `uuid-utils` package (ADR-0004)
- Pydantic v2 models for all API contracts
- orjson for JSON serialization
- All env vars: `NEOGUARD_` prefix
- `tenant_id` on every data table (default: "default")
- Async everywhere (asyncpg, async ClickHouse)
- Batch writers flush on size OR time threshold
- Parameterized SQL only, never f-strings in queries
- ruff for lint, mypy strict mode

**TypeScript/React**:
- Strict TS, no `any`
- SCSS with design tokens from spec 00 §5.2 (ADR-0005) — no Tailwind/Shadcn
- All new components: use token system, not hardcoded values
- Lucide icons
- date-fns for date formatting
- API client in `services/api.ts`, types in `types/index.ts`
- Count badges inside buttons/tabs: ALWAYS set explicit `color` and `background` — never rely on inherited text color from parent. Active state: white text on semi-transparent white bg. Inactive state: `var(--color-neutral-700)` text on `var(--color-neutral-200)` bg.

**Super Admin Access**:
- Super admin (`is_super_admin=True`) has unrestricted access to the entire platform regardless of tenant
- Implementation: bypass filtering approach — `get_tenant_id()` returns `None` for super admin, service functions skip `WHERE tenant_id` filter, returning all data across all tenants (including future tenants automatically)
- Reads: `get_tenant_id()` → `None` → no tenant filter → sees ALL data. Can scope to one tenant via `?tenant_id=X` query param
- Writes: `get_tenant_id_required()` → falls back to session's own tenant (prevents accidental cross-tenant writes)
- Super admin is NOT added to every tenant's membership table — access is via flag bypass, not membership rows
- Revoking `is_super_admin=False` immediately removes all cross-tenant visibility
- Every new `list_*` / `get_*` service function MUST handle `tenant_id: str | None` with an `if tenant_id:` guard — never assume tenant_id is present

**Commits**: Conventional commits (`feat()`, `fix()`, `test()`, `docs()`, `chore()`)

**Tests**:
- pytest asyncio_mode=auto
- Unit tests: no DB needed, mock with AsyncMock
- Integration tests: need NEOGUARD_DB_PORT=5433
- Frontend: vitest + RTL + jsdom

---

## 5. ADR Index

- ADR-001: Architecture overview — `docs/adr/001-architecture-overview.md`
- ADR-0001: Stack selection (locked) — `docs/adr/0001-stack-selection.md`
- ADR-0002: Modular monolith topology — `docs/adr/0002-architecture-topology.md`
- ADR-0004: ID format coexistence (ULID + UUIDv7) — `docs/adr/0004-id-format-coexistence.md`
- ADR-0005: SCSS with design tokens (defer Tailwind) — `docs/adr/0005-design-system-scss-tokens.md`
- ADR-0006: API key hash versioned format (SHA-256→Argon2id) — `docs/adr/0006-api-key-hash-versioned-format.md`
- (Pending) ADR-003: CFT over Terraform for AWS onboarding — cloud-native provisioning per provider

---

## 6. Gotchas

- **Port 5432 occupied**: Local PostgreSQL on 5432, TimescaleDB on 5433. ALWAYS use `NEOGUARD_DB_PORT=5433`.
- **ULID import**: `from ulid import ULID` not `import ulid`. Package is `python-ulid`.
- **ap-south-2 (Hyderabad)**: Opt-in region, NOT enabled on account 271547278517. Discovery auto-skips.
- **psutil cross-platform**: `iowait` and `getloadavg` only work on Linux. Guard with try/except.
- **API key prefix**: Backend uses `raw_key[:11]` (not 10) for key_prefix storage.
- **ClickHouse async**: Current client is thread-pool wrapper. Native async available as prerelease (`0.12.0rc1`).
- **Windows dev**: Forward slashes in bash, PowerShell for Windows-specific ops. `zip` not available in Git Bash.
- **Python 3.14**: Running bleeding edge. Package requires 3.11+.

---

## 7. Commands Cheatsheet

```bash
# Databases
docker compose up -d timescaledb clickhouse

# Backend
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000 --reload

# Collector agent
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10

# Frontend
cd frontend && npm run dev          # Dev server :5173
cd frontend && npm run build        # Production build
cd frontend && npm run test         # Vitest

# Tests
pytest tests/unit/ -v                                     # 891 backend tests
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v        # 48 integration tests
cd frontend && npx vitest run                             # 72 frontend tests

# Quality
python -m ruff check src/ tests/
python -m mypy src/neoguard/
cd frontend && npx tsc --noEmit
```

---

## 8. Open Questions / Tech Debt

- [x] Design system integrated — all 7 pages use new component library
- [x] CI/CD pipeline — `.github/workflows/ci.yml` (lint, types, unit, integration, frontend, build)
- [ ] SettingsPage.tsx is 1,442 lines — should split into sub-components (Phase 6)
- [ ] AlertsPage.tsx is 1,096 lines — could benefit from component extraction
- [ ] Single-stage Dockerfile — needs multi-stage for production (Phase 8)
- [ ] No WebSocket/real-time — dashboards poll only (Phase 8)
- [ ] GCP: enum + regions defined, zero implementation (parked)
- [ ] CloudWatch Logs: only metrics collected, not logs
- [ ] CORS wide-open — needs production domain lock-down (Phase 8)
- [ ] HTTPS/TLS deferred to cloud deployment
- [ ] Secrets in env vars — Secrets Manager integration deferred to cloud
- [ ] No Playwright E2E tests (Phase 8)
- [x] Dashboards page has frontend tests (23 tests). Overview, Metrics, Logs, Alerts pages still untested.
- [ ] Overview, Metrics, Logs, Alerts pages have no frontend tests
- **Cross-spec conflicts to resolve (from integration-map.md):**
  - ID format: ULID (current) vs UUIDv7 (spec) — both time-ordered, can coexist during transition
  - CSS framework: custom SCSS (current) vs Shadcn/Tailwind (spec) — decide at Phase 1 gate
  - API key hash: SHA-256 (current) vs Argon2id (spec) — version format, support both
  - State management: useState (current) vs Zustand+TanStack Query (spec) — adopt TanStack Query first
  - Pagination: offset-based (current) vs cursor-based (spec) — migrate in Phase 2
- **API key v1 (SHA-256) sunset**: 12 months from ObserveLabs launch (ADR-0006). Track adoption rate via `api_keys.deprecated_version_used` metric.

---

## 9. Last Session Summary

**Date**: 2026-05-02
**Branch**: `master`

**Completed (previous session — 2026-05-01)**:
- Phase 1 Auth + Multi-Tenancy core: Redis, 7 DB tables, RLS, Argon2id auth, sessions, middleware, routes
- Admin panel: stats, tenant/user management, platform audit log
- Frontend: AuthContext, login/signup, protected routes, tenant switcher, Team tab, Admin page
- All 6 Phase 1 remaining tasks: bootstrap CLI, Alembic migrations, CSRF middleware, password reset, role-based UI, impersonation

**Completed (earlier — 2026-05-02)**:
- Tenant ID migration: 1.18M+ metric rows + 350 rows across 11 tables from `tenant_id='default'` to UUID
- Fixed 4 source files (cloudwatch, azure monitor, orchestrator, telemetry collector) to derive tenant_id from account objects
- CSRF stale session fix: `/auth/me` sets CSRF cookie when missing, UI shows errors instead of silent empty state
- Sprint A (RBAC hardening) + Sprint B (admin create user + invite flow)
- Platform audit: `docs/platform-audit.md` (gap analysis), `CHANGELOG.md`, `docs/todo.md` (master to-do), `docs/test-inventory.md`

**Completed (Sprint 1 — 2026-05-02)**:
- Tenant context in global top bar: Layout.tsx shows "ACME Corp · owner" on every page automatically
- Auth rate limiting: Redis-backed on login (5/15min/IP) and signup (10/hr/IP), fail-open, 21 tests
- Azure metric name alignment: 12 frontend/backend mismatches fixed in InfrastructurePage.tsx
- Dependency audit: pip-audit clean (except pip CVE-2026-3219), npm audit 0 vulnerabilities
- Discovered P1-P4 severity, error envelope, SSRF protection were already implemented
- 796 tests passing (724 backend + 72 frontend), TypeScript clean

**Completed (Sprint 2 Phase A — MQL Core — 2026-05-02)**:
- MQL tokenizer: 14 token types, identifier-with-hyphens, negative numbers, IN keyword, aggregator position detection
- MQL parser: recursive descent, all grammar productions (aggregator, metric, filters, functions, rollup), 2-token lookahead for metric-vs-function boundary
- MQL compiler: parameterized SQL ($N placeholders), source table selection (raw/1m/1h), aggregation per rollup method, tag filter compilation (exact/wildcard/negation/in-set), tenant_id injection at compile time
- MQL executor: post-processing pipeline (rate, derivative, moving_average, as_rate, as_count, abs, log), None propagation, counter reset clamping
- MQL API: POST /api/v1/mql/query, /query/batch (up to 10), /validate (dry-run), admin-gated neoguard.* metrics
- MQL tests: 153 backend tests (tokenizer 20 + parser 49 + compiler 42 + executor 20 + routes 22)

**Completed (Sprint 2 Phase B — Dashboard MQL Integration — 2026-05-02)**:
- Frontend MQL API client (api.mql.query, queryBatch, validate) + types (MQLQueryRequest, MQLValidateResponse)
- PanelDefinition: added mql_query field (frontend types + backend Pydantic model)
- WidgetRenderer: MQL-first rendering — prefers mql_query over legacy metric_name when both present
- PanelEditorDrawer: Simple/MQL toggle, MQL textarea with debounced validation (400ms), valid/error indicators, syntax hint
- Dashboard + Widget frontend tests: 38 new tests (15 WidgetRenderer + 23 DashboardsPage)

**Completed (Sprint 2 Phase C — MQL Security Hardening — 2026-05-02)**:
- SQL injection fix: tag key regex validation (`^[a-zA-Z_][a-zA-Z0-9_\-]*$`, 128 char max) in compiler before f-string interpolation — defense-in-depth (tokenizer rejects → parser limits → compiler validates)
- Scope enforcement: added `require_scope("read")` to all 3 MQL routes (query, batch, validate)
- Parser security boundaries: 6 new tests — SQL injection in tag key/metric name, backtick/semicolon/double-dash rejection
- Compiler tag key sanitization: 14 new tests — valid/invalid keys across all 4 filter types, injection attempts
- MQL route auth + tenancy tests: 22 new tests — scope enforcement, tenant isolation (compile-time injection), internal metric protection, input validation, batch limits, end-to-end tag key injection
- Frontend MQL textarea: maxLength=2000 with character counter (red at >1900)
- 1,001 tests passing (891 backend + 110 frontend), TypeScript clean

**Phase 1 Status**: COMPLETE — all laptop demo items done
**Sprint 1 Status**: COMPLETE — all P0 demo blockers resolved
**Sprint 2 Status**: Phase A (MQL Core) COMPLETE, Phase B (Dashboard MQL Integration) COMPLETE, Phase C (Security Hardening) COMPLETE
**Next**: User direction needed — remaining Sprint 2 backlog items or demo prep

---

## 10. Performance Budgets

| Metric | Budget | Current |
|--------|--------|---------|
| API p99 latency | < 200ms | ~25ms (measured via request logging) |
| Ingest batch (1000 points) | < 50ms | ~30ms (COPY protocol) |
| Discovery cycle (9 AWS regions) | < 60s | ~45s |
| Alert eval loop | < 5s | ~2s |
| Frontend first paint | < 2s | Not measured (no Lighthouse yet) |
| DB query p95 | < 50ms | Not measured (need EXPLAIN ANALYZE baseline) |
| Home page interactive | < 1.5s | Not built yet (Spec 01) |
| Tenant switch | < 800ms | Not built yet (Spec 01) |
| MQL batch query (10 queries) | < 800ms p95 | Not built yet (Spec 00) |
| Dashboard render (10 widgets) | < 2s | Not built yet (Spec 02) |

---

## 11. Security Checklist Status

- [x] API key auth on all routes (no exempt prefixes)
- [x] SHA-256 key hashing (raw keys never stored)
- [x] Per-key rate limiting (sliding window, 429 + Retry-After)
- [x] Scope-based authorization (read/write/admin/platform_admin)
- [x] Tenant isolation (tenant_id on every table, enforced in service layer)
- [x] Super admin platform-wide access (bypass filtering — `tenant_id=None` skips WHERE clause, sees all tenants including future ones; writes scoped to session tenant)
- [x] Parameterized SQL everywhere (values via $N placeholders, tag keys via regex validation)
- [x] MQL defense-in-depth: tokenizer rejects dangerous chars → parser limits to IDENTIFIER tokens → compiler validates tag keys (`^[a-zA-Z_][a-zA-Z0-9_\-]*$`, 128 max) → values always parameterized
- [x] MQL scope enforcement: all routes require `read` scope minimum
- [x] MQL tenant isolation: tenant_id injected at compile time from auth state, never from user input
- [x] Input validation via Pydantic models
- [x] Request correlation IDs for audit trail
- [x] No secrets in code (env vars only)
- [x] External ID for cross-account IAM (128-bit cryptographic, ng-xxxx format)
- [ ] HTTPS/TLS (deferred to cloud)
- [ ] CORS production lock-down (deferred)
- [ ] Secrets Manager integration (deferred)
- [x] Dependency audit (`pip-audit`, `npm audit`) — clean (Sprint 1, 2026-05-02)
- [x] Auth rate limiting on login/signup (Redis-backed, fail-open) (Sprint 1, 2026-05-02)
- [x] SSRF protection on webhook/notification URLs (validate_outbound_url, 13 tests)
- [x] Standardized error envelope on all HTTP errors ({error: {code, message, correlation_id}})
- [ ] Log scrubbing for PII/tokens — not audited
