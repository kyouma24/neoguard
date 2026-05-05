# NEOGUARD — MASTER TEST & REVIEW PLAN

> **Owner**: Principal Engineer (Max mandate)
> **Created**: 2026-05-04
> **Last Updated**: 2026-05-04
> **Status**: ACTIVE — Revisit on every change cycle

---

## 0. PURPOSE

This document is the single source of truth for every test, review, and verification activity on NeoGuard. It is maintained as a living log — never deleted, only appended. When changes are made to the codebase, the corresponding sections are updated with results, dates, and pass/fail status.

The goal: **zero surprises**. If something breaks, this document should have predicted it as a risk. If a test passes, this document should have mandated it.

---

## 1. BASELINE SNAPSHOT (2026-05-04)

| Metric | Value | Date Verified |
|---|---|---|
| Backend unit tests | **1,469 passed**, 0 failed | 2026-05-04 (Phase C verified) |
| Frontend tests | **596 passed**, 33 files, 0 failed | 2026-05-04 (Phase C verified) |
| TypeScript compilation | **0 errors** | 2026-05-04 (Phase C verified) |
| Production build | **Success** (32.26s, 1,714 KB JS, 85.84 KB CSS) | 2026-05-04 (Phase C verified) |
| Backend Python files | ~125 across 25+ modules | 2026-05-04 |
| Frontend TS/TSX files | ~410 across pages/components/design-system | 2026-05-04 |
| API route modules | 21 routers | 2026-05-04 |
| Service modules | 62 files | 2026-05-04 |
| Database migrations | 6 (001–006) | 2026-05-04 |
| Spec documents | 16 (specs 00–12) | 2026-05-04 |
| Git state | 42 modified, 16 untracked, uncommitted | 2026-05-04 |

### Verification Commands (run after EVERY change cycle)
```bash
# Backend unit tests
NEOGUARD_DB_PORT=5433 NEOGUARD_DEBUG=true python -m pytest tests/unit/ --tb=short -q

# Frontend TypeScript
cd frontend && npx tsc --noEmit

# Frontend tests
cd frontend && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run

# Production build
cd frontend && npx vite build

# Integration tests (requires running DB)
NEOGUARD_DB_PORT=5433 python -m pytest tests/integration/ -v

# Functional tests (requires running backend on :8000)
NEOGUARD_DB_PORT=5433 NEOGUARD_DEBUG=true python -m pytest tests/functional/ -v
```

---

## 2. MODULE-BY-MODULE REVIEW REGISTRY

Every module gets reviewed against these dimensions:
- **F** = Functionality (does it do what it claims?)
- **S** = Security (tenant isolation, input validation, auth, audit)
- **D** = DRY (duplication with other modules?)
- **P** = Performance (N+1, unbounded queries, hot paths)
- **T** = Test coverage (happy path, failure path, adversarial)
- **B** = Best practices (error handling, naming, typing, logging)

Status: `NOT_STARTED` | `IN_PROGRESS` | `REVIEWED` | `ISSUES_FOUND` | `CLEAN`

### 2.1 BACKEND — API Routes (21 modules)

| # | Module | Path | F | S | D | P | T | B | Status | Last Reviewed | Findings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R01 | API Keys | `api/routes/auth.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Properly scoped; admin scope required for all ops; tenant isolation correct |
| R02 | User Auth (login/signup/logout/reset/sessions) | `api/routes/user_auth.py` | OK | OK | OK | OK | OK | WARN | REVIEWED | 2026-05-04 | R02-F01: private `_write_sec` import in route (B). R02-F02: signup email enumeration — 409 reveals registered emails (P2-S). Otherwise solid: rate limiting, CSRF cookies, telemetry, session mgmt all correct |
| R03 | Admin | `api/routes/admin.py` | OK | OK | WARN | OK | OK | OK | REVIEWED | 2026-05-04 | R03-F01: raw SQL in admin_create_user + admin_add_user_to_tenant (D — should use service fn). R03-F02: _client_ip duplicated from user_auth.py (D-P2). All routes super_admin gated, audit logging on every mutation. Self-protection (can't demote self) |
| R04 | Tenants | `api/routes/tenants.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | MAX_TENANTS_PER_USER=3 limit. Proper membership checks. Role-gated mutations. Audit logging. invite_member handles existing + pending users correctly |
| R05 | AWS Accounts | `api/routes/aws_accounts.py` | OK | WARN | OK | OK | OK | OK | REVIEWED | 2026-05-04 | R05-F01: update + delete use get_tenant_id (None for super admin) — super admin can modify/delete any account. Intentional per design but inconsistent with create (which uses get_tenant_id_required). DuplicateAccountError handled |
| R06 | Azure Subscriptions | `api/routes/azure_accounts.py` | OK | WARN | OK | OK | OK | OK | REVIEWED | 2026-05-04 | R06-F01: Same as R05-F01 — update/delete use get_tenant_id. Mirror of R05 structure, consistent |
| R07 | Resources | `api/routes/resources.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | All CRUD properly scoped. Write ops use get_tenant_id_required, reads use get_tenant_id. Limit clamping on all list endpoints. Issues/grouping/topology/changes endpoints all tenant-scoped |
| R08 | Metrics | `api/routes/metrics.py` | OK | OK | WARN | WARN | OK | OK | REVIEWED | 2026-05-04 | R08-F01: 4 query branches in tag-values (D — should extract to service). R08-F02: DISTINCT on metrics table without time bounds (P — full table scan on large data). R08-F03: _is_admin duplicated across metrics/mql routes (D). Ingest correctly uses server-side tenant_id (NG-004 fix verified) |
| R09 | MQL | `api/routes/mql.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Defense-in-depth: tokenizer→parser→compiler→executor chain. Cache with SWR. Streaming batch with semaphore (10 concurrent) and timeouts. Variable substitution validated. INTERNAL_METRIC_PREFIX guard on all paths. NDJSON streaming well-structured |
| R10 | Dashboards | `api/routes/dashboards.py` | OK | OK | OK | WARN | OK | WARN | REVIEWED | 2026-05-04 | R10-F01: update builds dynamic SQL with f-string SET clause — fields from Pydantic model so injection-safe, but f-string SQL is a pattern risk (B-P2). R10-F02: update fetches dashboard twice (before + after) — could use RETURNING (P). Permission system (view/edit/admin) properly layered. Version history auto-saves before edits. Favorites, duplicate, export all correctly scoped |
| R11 | Alerts | `api/routes/alerts.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | All CRUD properly scoped. Write ops use get_tenant_id_required. Silences CRUD complete. Preview/dry-run endpoint exists. Limit clamping on lists |
| R12 | Notifications | `api/routes/notifications.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Admin scope on all mutations. Test channel endpoint sends real test notification. Delivery tracking. Error handling for sender failures (502 responses) |
| R13 | Logs | `api/routes/logs.py` | OK | **FIXED** | OK | OK | OK | OK | ISSUES_FOUND | 2026-05-04 | **R13-F01 (P0-FIXED):** Log ingest used `batch.tenant_id or tenant_id` — allowed cross-tenant log writes. Fixed: now uses only authenticated tenant_id. **R13-F02 (P0-FIXED):** Log query used `q.tenant_id or tenant_id` — allowed cross-tenant log reads. Fixed: now uses only authenticated tenant_id |
| R14 | Annotations | `api/routes/annotations.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Write scope on mutations. Properly scoped by tenant. Dashboard/time range filtering on list. user_id from auth context |
| R15 | Metadata | `api/routes/metadata.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Read scope on all. Typeahead with query substring filter. Tag key length validated at service level. Functions catalog is static |
| R16 | Collection | `api/routes/collection.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Admin scope on discovery trigger. Account lookup scoped by tenant. Jobs list/get tenant-scoped |
| R17 | Onboarding | `api/routes/onboarding.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Admin scope on all sensitive ops. Duplicate detection (checks existing accounts before verify success). External ID crypto-generated. Input validation via Pydantic Field constraints. CFT/ARM template URLs hardcoded (acceptable for demo) |
| R18 | SSE/Streaming | `api/routes/sse.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Read scope enforced. Max duration 30min with auto-close. Heartbeat 15s. Client disconnect detection. Currently heartbeat-only (data push planned via Redis pub/sub) |
| R19 | Health | `api/routes/health.py` | OK | WARN | OK | OK | OK | OK | REVIEWED | 2026-05-04 | R19-F01: No auth required — intentional for LB health checks, but exposes DB connectivity status to unauthenticated users (P2-S). Acceptable for laptop demo |
| R20 | System | `api/routes/system.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Admin scope required. Process metrics via psutil with cross-platform guards. Pool utilization, writer stats, alert engine stats. No secrets exposed |
| R21 | Dashboard Permissions | (in dashboards.py) | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Integrated into R10. 3-tier permission model (view/edit/admin). Effective permission considers user-level + tenant role + super admin |

### 2.1.1 PHASE A.1 DETAILED FINDINGS (Backend Routes — 2026-05-04)

**Summary:** 21 route modules reviewed. 10 CLEAN, 8 REVIEWED (minor issues), 1 ISSUES_FOUND (2 P0 fixed), 2 entries merged (R21 into R10).

#### P0 Findings (Fixed Immediately)

| ID | Module | Finding | Fix | Status |
|---|---|---|---|---|
| R13-F01 | logs.py | Log ingest allowed client `batch.tenant_id` to override authenticated tenant_id — cross-tenant log injection | Removed `batch.tenant_id or` fallback, now always uses server-side `tenant_id` | **FIXED** 2026-05-04 |
| R13-F02 | logs.py | Log query allowed client `q.tenant_id` to override — cross-tenant log reads | Removed `q.tenant_id or` fallback, now always uses server-side `tenant_id` | **FIXED** 2026-05-04 |

#### P2 Findings (Schedule for Next Cycle)

| ID | Module | Finding | Category | Action |
|---|---|---|---|---|
| R02-F01 | user_auth.py:299 | Imports private `_write_sec` from telemetry module in route handler | Best Practice | Extract public API for password change telemetry |
| R02-F02 | user_auth.py:88 | Signup returns 409 for existing email — reveals registration status | Security | Consider always returning 201 with "check email" message (cloud feature) |
| R03-F01 | admin.py:189,449 | Raw SQL `INSERT INTO tenant_memberships` in route layer — should be in service | DRY | Extract to `add_membership()` in users service |
| R03-F02 | admin.py:69-73 | `_client_ip()` duplicated from user_auth.py | DRY | Extract to shared utility |
| R05-F01 | aws_accounts.py:64,80 | Update/delete use `get_tenant_id` (None for super admin) — can modify any account without specifying tenant | Security | Intentional per super admin bypass design — document the risk |
| R08-F01 | metrics.py:91-144 | 4 query branches for tag-values (tenant×metric combinations) | DRY | Extract to parameterized service function |
| R08-F02 | metrics.py:74-88 | `SELECT DISTINCT name FROM metrics` without time bounds | Performance | Add time window (e.g., last 30 days) to avoid full table scan |
| R08-F03 | metrics.py:13-15, mql.py:95-97 | `_is_admin()` helper duplicated across routes | DRY | Extract to deps.py |
| R10-F01 | dashboards.py:195 | `f"UPDATE dashboards SET {', '.join(set_parts)}"` — dynamic SQL built from Pydantic fields | Best Practice | Fields are from validated model so injection-safe, but pattern risk — consider parameterized update builder |
| R10-F02 | dashboards.py:151-204 | Dashboard update fetches existing, saves version, updates, fetches again — 4 DB round trips | Performance | Could combine with RETURNING and single transaction |
| R19-F01 | health.py | No auth required — exposes DB connectivity to unauthenticated callers | Security | Acceptable for LB health checks in demo; add auth or reduce info in production |

#### Positive Observations

- **Tenant isolation consistent**: 20 of 21 route modules correctly use `get_tenant_id` / `get_tenant_id_required` pattern (logs.py was the sole exception, now fixed)
- **Scope enforcement solid**: All mutating endpoints have `require_scope()` dependencies. Read endpoints are appropriately open
- **Rate limiting in place**: Login, signup, and password reset confirm all have Redis-backed rate limiting with Retry-After headers
- **Audit logging comprehensive**: Admin panel logs every mutation with actor_id, target, IP, timestamp. Tenant operations also audit-logged
- **CSRF protection**: Signup, login, and auth/me all set CSRF cookies. CSRF middleware validates on state-changing requests
- **Error handling uniform**: HTTPException with status codes, no raw exception leaks. Error envelope with correlation IDs on rate-limit responses
- **Pagination bounded**: All list endpoints have `min(limit, 500)` or similar upper bounds
- **Dashboard permission model**: 3-tier (view/edit/admin) with effective permission resolution considering user-level, tenant role, and super admin status

### 2.2 BACKEND — Services (by domain)

| # | Domain | Key Files | F | S | D | P | T | B | Status | Last Reviewed | Findings |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | Auth (sessions, users, passwords) | `services/auth/` (7 files) | OK | OK | OK | OK | OK | WARN | REVIEWED | 2026-05-04 | sessions.py: excellent crypto (secrets.token_urlsafe(32)). users.py: proper Argon2id, password_hash stripped from returns, email normalized. password_reset.py: exemplary — single-use tokens, rate-limited, atomic consumption. rate_limiter.py: Redis pipeline atomic, fail-open by design. Minor: users.py uses `result.endswith("1")` fragile pattern (B-P3) |
| S02 | API Keys | `services/auth/api_keys.py` | OK | WARN | OK | OK | OK | WARN | REVIEWED | 2026-05-04 | S02-F01: `list_api_keys(tenant_id=None)` returns ALL keys — intentional super admin bypass but list leaks key_prefix + scopes cross-tenant (P2-S). S02-F02: Dynamic SQL SET via f-string field names from Pydantic model — safe but pattern risk (P3-B). SHA-256→Argon2id migration working correctly |
| S03 | Admin | `services/auth/admin.py` | OK | OK | WARN | OK | OK | WARN | REVIEWED | 2026-05-04 | S03-F01: `set_tenant_status()` doesn't validate status values — should whitelist (P2-S). S03-F02: orjson imported inside functions 3x (P3-B). S03-F03: security_log query builds WHERE via f-string (safe — conditions parameterized, but style risk). Comprehensive audit logging |
| S04 | AWS Accounts | `services/aws/accounts.py` | OK | WARN | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | S04-F01: `list_aws_accounts` f-string LIMIT/OFFSET — values from function args (int), risk if caller passes unsanitized (P2-S). S04-F02: `update_aws_account` dynamic SET via f-string (P2-B). Tenant bypass for super admin is by design |
| S05 | AWS Discovery | `services/discovery/aws_discovery.py` | OK | OK | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | 1846 lines, 26+ discoverers. All pass tenant_id to upsert_resource. S05-F01: Serial discovery per resource type — could parallelize (P2-P). S05-F02: Lambda tags fetched serially per function — N+1 (P3-P). Comprehensive error handling with contextlib.suppress per discoverer |
| S06 | AWS CloudWatch | `services/aws/cloudwatch.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | 409 lines, 4 functions. Metric batching (500/batch). tenant_id properly passed to metric_writer. No SQL (delegated to writer). Efficient paginator usage |
| S07 | AWS Credentials | `services/aws/credentials.py` | OK | OK | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | S07-F01: In-memory session cache unbounded — potential memory growth with many account/region combos (P3-P). TTL at 3500s (STS 1hr - 100s buffer). Cache key includes account_id+region+role_arn — multi-tenant safe |
| S08 | Azure Accounts | `services/azure/accounts.py` | OK | WARN | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | S08-F01: Same f-string LIMIT/OFFSET as S04-F01 (P2-S). S08-F02: client_secret stored plaintext in DB (P1-S — documented KI-05). S08-F03: `cache_client_secret()` called on every list operation for each row (P2-P). Otherwise mirrors AWS accounts structure |
| S09 | Azure Discovery | `services/discovery/azure_discovery.py` | OK | OK | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | 670 lines, 14+ discoverers. All pass tenant_id. S09-F01: Serial discovery per service (P2-P). S09-F02: Azure SQL N+1 — list_by_server per server (P3-P). Comprehensive error handling |
| S10 | Azure Monitor | `services/azure/monitor.py` | OK | OK | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | S10-F01: Serial per-resource API calls — no parallelization (P2-P). tenant_id properly passed to metric_writer |
| S11 | Resources CRUD | `services/resources/crud.py` | OK | WARN | OK | WARN | OK | OK | REVIEWED | 2026-05-04 | 779 lines, 15 functions. S11-F01: f-string LIMIT/OFFSET in 5+ locations (P2-S — values from function args, not direct user input). S11-F02: upsert_resource uses provider+external_id+tenant_id as unique key — correct with tenant_id in WHERE. S11-F03: DISTINCT ON subquery performance unknown for large tables (P2-P). Reconciliation logic correct |
| S12 | Metrics Service | `services/metrics/` (3 files) | — | — | — | — | — | — | DEFERRED | — | Covered by R08 route review; writer is batch-optimized |
| S13 | MQL Engine | `services/mql/` (6 files) | OK | OK | WARN | OK | OK | OK | CLEAN | 2026-05-04 | **Exemplary security**: compiler.py — all SQL parameterized, tag keys regex-validated + parameterized via `tags->>($N)`. parser.py — whitelist validation (aggregators, functions, rollups). tokenizer.py — context-aware lexing, position tracking. cache.py — tenant_id is first cache key component, stale-while-revalidate. variables.py — value whitelist regex, sentinel handling. S13-F01: executor.py has 5 near-identical datapoint fold functions (P2-D) |
| S14 | Dashboards | `services/dashboards.py` | OK | WARN | WARN | OK | OK | WARN | REVIEWED | 2026-05-04 | S14-F01: f-string WHERE clause (noqa S608) — conditions parameterized but style risk (P2-B). S14-F02: `_row_to_dashboard()` has 5x repeated JSON parsing `if isinstance(raw, str): raw = orjson.loads(raw)` (P2-D). S14-F03: LIKE search properly escapes `\`, `%`, `_` |
| S15 | Dashboard Permissions | `services/dashboard_permissions.py` | OK | **FIXED** | OK | OK | OK | OK | ISSUES_FOUND | 2026-05-04 | **S15-F01 (P1-FIXED):** `remove_dashboard_permission()` had no tenant_id check. Fixed: added tenant_id param + WHERE clause. S15-F02: PERMISSION_HIERARCHY lookup without enum bounds check (P3-B) |
| S16 | Dashboard Versions | `services/dashboard_versions.py` | OK | **FIXED** | OK | OK | OK | OK | ISSUES_FOUND | 2026-05-04 | **S16-F01 (P1-FIXED):** `save_version()` had no tenant_id validation. Fixed: added tenant_id param + dashboard ownership verification before insert |
| S17 | Alerts CRUD + Engine | `services/alerts/` (4 files) | OK | **FIXED** | WARN | OK | OK | WARN | ISSUES_FOUND | 2026-05-04 | **S17-F01 (P0-FIXED):** alert preview in crud.py: `tags->>'{key}'` SQL injection — tag key from user input interpolated into SQL. Fixed: parameterized via `tags->>($N)` + regex validation. **S17-F02 (P0-FIXED):** engine.py evaluate_rule: same `tags->>'{k}'` injection in metric query. Fixed: parameterized + validated. S17-F03: crud.py list f-string LIMIT/OFFSET — fixed to parameterized `$N`. S17-F04: engine.py `_fire_alert` + `_fire_nodata_alert` 99% duplicated (P2-D). S17-F05: silences.py hardcoded timezone fallback "Asia/Kolkata" (P3-B) |
| S18 | Notifications | `services/notifications/` (5 files) | OK | OK | WARN | OK | OK | OK | REVIEWED | 2026-05-04 | senders.py: EXCELLENT SSRF prevention (validate_outbound_url on all 6 senders). HMAC signing for webhooks. Retry with jittered backoff. S18-F01: send_firing/send_resolved 99% duplicated across 6 senders (P2-D — 250+ redundant LOC). S18-F02: crud.py f-string LIMIT/OFFSET (P2-S) |
| S19 | Logs | `services/logs/` (3 files) | — | — | — | — | — | — | DEFERRED | — | Covered by R13 route review; writer is batch-optimized |
| S20 | Annotations | `services/annotations.py` | — | — | — | — | — | — | DEFERRED | — | Covered by R14 route review; standard CRUD |
| S21 | Collection Orchestrator | `services/collection/orchestrator.py` | OK | OK | OK | OK | OK | OK | CLEAN | 2026-05-04 | Reviewed in prior session; reconciliation working correctly |
| S22 | Collection Jobs | `services/collection/jobs.py` | — | — | — | — | — | — | DEFERRED | — | Standard CRUD; covered by R16 route review |
| S23 | Onboarding | `services/onboarding/` (3 files) | — | — | — | — | — | — | DEFERRED | — | Covered by R17 route review |
| S24 | Telemetry | `services/telemetry/` (2 files) | — | — | — | — | — | — | DEFERRED | — | Internal observability; low risk |
| S25 | Metadata | `services/metadata.py` | — | — | — | — | — | — | DEFERRED | — | Covered by R15 route review |
| S26 | Starter Dashboards | `services/dashboards_starter.py` | — | — | — | — | — | — | DEFERRED | — | Auto-generation utility; low risk |

### 2.2.1 PHASE A.2 DETAILED FINDINGS (Backend Services — 2026-05-04)

**Summary:** 20 service domains reviewed (6 deferred — covered by route review). 3 CLEAN, 13 REVIEWED with issues, 1 ISSUES_FOUND (2 P0 fixed). 1 exemplary module (MQL engine).

#### P0 Findings (Fixed Immediately)

| ID | Module | Finding | Fix | Status |
|---|---|---|---|---|
| S17-F01 | alerts/crud.py:204 | Tag key SQL injection: `tags->>'{key}'` interpolates user-controlled tag key from alert preview | Changed to `tags->>($N) = $N+1` with regex validation `^[a-zA-Z_][a-zA-Z0-9_\-]*$` | **FIXED** 2026-05-04 |
| S17-F02 | alerts/engine.py:285 | Tag key SQL injection: `tags->>'{k}'` in evaluate_rule metric query builder | Same fix: parameterized `tags->>($N)` with regex guard + module-level compiled regex | **FIXED** 2026-05-04 |
| S17-F03 | alerts/crud.py:64,70 | Unparameterized LIMIT/OFFSET: `LIMIT {limit} OFFSET {offset}` — values from int args but pattern is risky | Changed to `LIMIT $N OFFSET $N` parameterized | **FIXED** 2026-05-04 |

#### P1 Findings (Fix in Current Cycle)

| ID | Module | Finding | Action |
|---|---|---|---|
| S15-F01 | dashboard_permissions.py:134 | `remove_dashboard_permission()` has no tenant_id check — cross-tenant permission deletion possible | Add tenant_id parameter and WHERE clause |
| S16-F01 | dashboard_versions.py:17 | `save_version()` has no tenant_id validation — version saved for any dashboard_id | Add tenant_id parameter; verify dashboard belongs to tenant before saving |

#### P2 Findings (Schedule for Next Cycle)

| ID | Module | Finding | Category |
|---|---|---|---|
| S02-F01 | api_keys.py:101 | `list_api_keys(tenant_id=None)` returns ALL keys — leaks key_prefix+scopes cross-tenant | Security |
| S03-F01 | admin.py | `set_tenant_status()` doesn't validate allowed status values | Security |
| S04-F01 | aws/accounts.py:80 | f-string LIMIT/OFFSET in list query | Security/Style |
| S08-F01 | azure/accounts.py:94 | f-string LIMIT/OFFSET in list query (mirror of S04-F01) | Security/Style |
| S08-F03 | azure/accounts.py | `cache_client_secret()` called per row on every list | Performance |
| S11-F01 | resources/crud.py | f-string LIMIT/OFFSET in 5+ query locations | Security/Style |
| S13-F01 | mql/executor.py | 5 near-identical datapoint fold functions | DRY |
| S14-F02 | dashboards.py | 5x repeated JSON parsing pattern in _row_to_dashboard | DRY |
| S17-F04 | alerts/engine.py | `_fire_alert` + `_fire_nodata_alert` 99% duplicated (~200 LOC) | DRY |
| S18-F01 | notifications/senders.py | send_firing/send_resolved duplicated across 6 senders (~250 LOC) | DRY |
| S18-F02 | notifications/crud.py | f-string LIMIT/OFFSET | Security/Style |

#### Exemplary Modules

- **MQL Engine (S13)**: Defense-in-depth SQL injection prevention — tokenizer rejects dangerous chars, parser limits to IDENTIFIER tokens, compiler validates tag keys via regex AND parameterizes them, values always `$N` params. Stale-while-revalidate cache with tenant-scoped keys. This is the gold standard other modules should follow.
- **password_reset.py**: Single-use atomic token consumption, rate-limited, SHA-256 hashed storage, configurable expiry. Textbook implementation.
- **senders.py (SSRF)**: `validate_outbound_url()` called on all 6 notification senders before any HTTP request. Robust retry with jittered backoff.

### 2.5.1 PHASE A.3 DETAILED FINDINGS (Frontend Pages — 2026-05-04)

**Summary:** 16 frontend pages reviewed. 10 CLEAN, 6 REVIEWED with minor issues. 0 P0 findings, 0 P1 findings, 2 P2 findings, 3 P3 findings.

**Security Assessment:** EXCELLENT — no `dangerouslySetInnerHTML` in production code, no `eval()`, no `innerHTML` assignments. CSRF token reader in api.ts is the only `document.cookie` access (expected). All error messages use `formatError()` utility — no raw exception leakage. All forms use `onSubmit` with `preventDefault()` — no unprotected form actions.

#### P2 Findings

| ID | Page | Finding | Category |
|---|---|---|---|
| P05-F01 | OverviewPage.tsx:378-393 | "Coming Soon" cards reference MQL and Dashboards as unbuilt — both are fully implemented. Misleads demo viewers | Functionality |
| P06-F01 / P14-F01 / DRY-01 | InfrastructurePage.tsx + CloudTab.tsx | Region lists (AWS 22 regions + Azure 20 regions) duplicated between InfrastructurePage and CloudTab, with different subsets. Should be a shared constant | DRY |

#### P3 Findings

| ID | Page | Finding | Category |
|---|---|---|---|
| P01-P04 | Auth pages | Inline styles objects duplicated across all 4 auth pages (container, card, header, title, subtitle, error, form, field, label, input, button, footer, link — ~100 lines each) | DRY |
| P06-F02 | InfrastructurePage.tsx | File is 2000+ lines. Service tab definitions (AWS 8 tabs + Azure 15 tabs) are ~550 lines of data — could extract to a constants file | Maintainability |
| P15-F01 | AdminPage.tsx | 1,095 lines with 6 sub-components inline. Well-structured but large — TypedConfirmDialog, TenantMembersModal, CreateUserModal, UserTenantsModal could be extracted | Maintainability |

#### Test Coverage Assessment

| Page | Has Tests? | Test File | Notes |
|---|---|---|---|
| P01 LoginPage | NO | — | Auth flow critical — needs tests |
| P02 SignupPage | NO | — | Needs tests |
| P03 ForgotPasswordPage | NO | — | Needs tests |
| P04 ResetPasswordPage | NO | — | Needs tests |
| P05 OverviewPage | NO | — | Main landing page — needs tests |
| P06 InfrastructurePage | YES | `InfrastructurePage.test.tsx` | Has tests |
| P07 MetricsPage | NO | — | Needs tests |
| P08 LogsPage | NO | — | Needs tests |
| P09 AlertsPage | NO | — | Critical page — needs tests |
| P10 DashboardList | YES | `DashboardsPage.test.tsx` | Has tests (8 list tests pass) |
| P11 DashboardViewer | YES | `DashboardViewer.test.tsx` | Has tests (15 tests OOM in jsdom — KI-01) |
| P12 DashboardEditor | INDIRECT | via DashboardsPage.test.tsx | Tested indirectly |
| P13 SettingsPage | YES | `SettingsPage.test.tsx` | Has tests |
| P14 CloudTab | INDIRECT | via SettingsPage.test.tsx | Tested indirectly |
| P15 AdminPage | NO | — | Super admin functions — needs tests |
| P16 AlertDetailPage | NO | — | Needs tests |

**Pages with no tests: 10 of 16.** This is the biggest quality gap in the frontend. Priority for new tests: LoginPage, AlertsPage, OverviewPage, AdminPage, MetricsPage.

#### Positive Observations

- **No XSS surface**: Zero use of `dangerouslySetInnerHTML`, no `eval()`, no raw HTML injection anywhere in the frontend
- **Design system adoption**: All pages use design-system components (`Card`, `Button`, `Badge`, `StatusBadge`, `DataTable`, `Pagination`, `EmptyState`, `Modal`, `ConfirmDialog`, `PageHeader`, `Tabs`)
- **Design tokens**: CSS custom properties (var(--color-*, --spacing-*, --typography-*)) used consistently
- **Role-based UI**: `usePermissions()` hook applied in AlertsPage (canCreate/canEdit/canDelete), DashboardList, SettingsPage (role-gated tabs), CloudTab
- **Error handling consistent**: All API calls wrapped in try/catch with `formatError()` utility
- **Tenant isolation on frontend**: DashboardList scopes localStorage recent dashboards by tenant_id — prevents cross-tenant data leaks in browser storage
- **Anti-enumeration**: ForgotPasswordPage shows generic "if an account exists" message — doesn't reveal registration status
- **Destructive action safety**: AdminPage TypedConfirmDialog requires typing entity name for destructive ops (suspend, delete, deactivate). AlertsPage uses ConfirmDialog for deletes
- **URL state persistence**: MetricsPage and AdminPage use `useURLState` hook for tab/filter state in URL — shareable/bookmarkable
- **SettingsPage decomposition**: Properly refactored from 1,442 lines (KI-02) to 97 lines with 6 extracted sub-tab components

### 2.3 BACKEND — Models (13 files)

| # | Model | Path | F | S | T | Status |
|---|---|---|---|---|---|---|
| M01 | Resources | `models/resources.py` | | | | NOT_STARTED |
| M02 | AWS | `models/aws.py` | | | | NOT_STARTED |
| M03 | Azure | `models/azure.py` | | | | NOT_STARTED |
| M04 | Auth/Users | `models/auth.py`, `models/users.py` | | | | NOT_STARTED |
| M05 | Dashboards | `models/dashboards.py` | | | | NOT_STARTED |
| M06 | Dashboard Versions | `models/dashboard_versions.py` | | | | NOT_STARTED |
| M07 | Alerts | `models/alerts.py` | | | | NOT_STARTED |
| M08 | Notifications | `models/notifications.py` | | | | NOT_STARTED |
| M09 | Metrics | `models/metrics.py` | | | | NOT_STARTED |
| M10 | Logs | `models/logs.py` | | | | NOT_STARTED |
| M11 | Annotations | `models/annotations.py` | | | | NOT_STARTED |

### 2.4 BACKEND — Infrastructure & Middleware

| # | Component | Path | F | S | T | Status |
|---|---|---|---|---|---|---|
| I01 | App Init / Router Registration | `main.py` | | | | NOT_STARTED |
| I02 | Config | `core/config.py` | | | | NOT_STARTED |
| I03 | Logging | `core/logging.py` | | | | NOT_STARTED |
| I04 | Auth Middleware | `api/middleware/auth.py` | | | | NOT_STARTED |
| I05 | CSRF Middleware | `api/middleware/csrf.py` | | | | NOT_STARTED |
| I06 | Request Tracking | `api/middleware/request_id.py` | | | | NOT_STARTED |
| I07 | Dependencies (get_tenant_id, etc.) | `api/deps.py` | | | | NOT_STARTED |
| I08 | TimescaleDB Connection | `db/timescale/connection.py` | | | | NOT_STARTED |
| I09 | ClickHouse Connection | `db/clickhouse/connection.py` | | | | NOT_STARTED |
| I10 | Redis Connection | `db/redis/connection.py` | | | | NOT_STARTED |
| I11 | Alembic Migrations (001–006) | `alembic/versions/` | | | | NOT_STARTED |

### 2.5 FRONTEND — Pages (critical UI)

| # | Page | Path | F | S | T | Status |
|---|---|---|---|---|---|---|
| P01 | Login | `pages/LoginPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 194 lines. Clean form with formatError, design tokens, minLength=8 validation. No tests |
| P02 | Signup | `pages/SignupPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 213 lines. Clean form with tenant name field. Email verification banner (coming soon). No tests |
| P03 | Forgot Password | `pages/ForgotPasswordPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 203 lines. Generic success message ("if an account exists") — good anti-enumeration. No tests |
| P04 | Reset Password | `pages/ResetPasswordPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 228 lines. Token from URL params, confirm-match validation, disabled without token. Auto-redirect to login. No tests |
| P05 | Overview | `pages/OverviewPage.tsx` | WARN | OK | NONE | REVIEWED | 2026-05-04 | P05-F01: "Coming Soon" cards reference outdated info (MQL is built, dashboards are built). P05-F02: No tests. CPU/mem charts admin-only — correct. Auto-refresh 10s |
| P06 | Infrastructure | `pages/InfrastructurePage.tsx` | OK | OK | WARN | REVIEWED | 2026-05-04 | ~2000+ lines. P06-F01: Region lists duplicated from CloudTab (DRY-01). P06-F02: Service tab definitions very long — could extract. Has tests (InfrastructurePage.test.tsx). Feature-rich: 24 AWS + 15 Azure tabs, edit modal, metrics charts, search, topology, changes |
| P07 | Metrics | `pages/MetricsPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 322 lines. Multi-query overlay (1-5), URL state persistence, save-to-dashboard modal. Good empty state. No tests |
| P08 | Logs | `pages/LogsPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 154 lines. Search/filter by severity/service, pagination. Clean. No tests |
| P09 | Alerts | `pages/AlertsPage.tsx` | OK | OK | NONE | REVIEWED | 2026-05-04 | 605 lines. 3 tabs (rules/events/silences), role-gated CRUD, pagination, acknowledge flow. P09-F01: No tests. Uses usePermissions correctly. Clean modals extracted to sub-files |
| P10 | Dashboards (List) | `pages/dashboards/DashboardList.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | Tenant-scoped recent dashboards (localStorage by tenant_id — good). Template picker, search, tag filter, favorites. Has tests (DashboardsPage.test.tsx) |
| P11 | Dashboards (Viewer) | `pages/dashboards/DashboardViewer.tsx` | OK | OK | NONE | REVIEWED | 2026-05-04 | Has tests (DashboardViewer.test.tsx, but OOM). Complex: time range, variables, auto-refresh, kiosk, share, fullscreen, crosshair sync |
| P12 | Dashboards (Editor) | `pages/dashboards/DashboardEditor.tsx` | OK | OK | NONE | REVIEWED | 2026-05-04 | Complex: panel CRUD, @dnd-kit grid, display options, undo/redo. No direct tests (tested via DashboardsPage.test.tsx) |
| P13 | Settings | `pages/SettingsPage.tsx` | OK | OK | OK | CLEAN | 2026-05-04 | 97 lines — properly decomposed into sub-tabs. Role-gated tabs (admin/owner see cloud, notifications; canManageKeys see API keys; canInvite see team). Has tests (SettingsPage.test.tsx) |
| P14 | Settings — Cloud Tab | `pages/settings/CloudTab.tsx` | OK | OK | WARN | REVIEWED | 2026-05-04 | P14-F01: Region lists duplicated from InfrastructurePage (DRY-01). AWS wizard, account CRUD, enable/disable toggle. Uses usePermissions |
| P15 | Admin | `pages/AdminPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 1,095 lines. 5 tabs: overview stats, tenants (CRUD+suspend+delete+members), users (CRUD+super admin toggle+activate/deactivate+impersonate+tenant membership), audit log, security log. TypedConfirmDialog with name-typing for destructive ops — excellent pattern. CreateUserModal with tenant assignment. No tests |
| P16 | Alert Detail | `pages/AlertDetailPage.tsx` | OK | OK | NONE | CLEAN | 2026-05-04 | 254 lines. Metric chart with threshold overlay, alert event history table, auto-refresh. Good use of rule metadata display. No tests |

### 2.6 FRONTEND — Core Architecture

| # | Component | Path | F | S | T | Status |
|---|---|---|---|---|---|---|
| C01 | App Router | `App.tsx` | | | | NOT_STARTED |
| C02 | Layout + Sidebar | `components/Layout.tsx` | | | | NOT_STARTED |
| C03 | Auth Context | `contexts/AuthContext.tsx` | | | | NOT_STARTED |
| C04 | Theme Context | `contexts/ThemeContext.tsx` | | | | NOT_STARTED |
| C05 | API Client | `services/api.ts` | | | | NOT_STARTED |
| C06 | Type Definitions | `types/index.ts` | | | | NOT_STARTED |
| C07 | usePermissions Hook | `hooks/usePermissions.ts` | | | | NOT_STARTED |
| C08 | useApi Hook | `hooks/useApi.ts` | | | | NOT_STARTED |
| C09 | Tenant Switcher | `components/TenantSwitcher.tsx` | | | | NOT_STARTED |
| C10 | User Menu | `components/UserMenu.tsx` | | | | NOT_STARTED |
| C11 | Command Palette | `components/CommandPalette.tsx` | | | | NOT_STARTED |
| C12 | Cloud Account Wizard | `components/onboarding/CloudAccountWizard.tsx` | | | | NOT_STARTED |
| C13 | Cloud Provider Icons | `components/icons/CloudProviderIcons.tsx` | | | | NOT_STARTED |

### 2.7 FRONTEND — Dashboard Subsystem (high complexity)

| # | Component | Path | F | T | Status |
|---|---|---|---|---|---|
| D01 | Widget Registry | `components/charts/widgetRegistry.ts` | | | NOT_STARTED |
| D02 | TimeSeriesChart (uPlot) | `components/charts/TimeSeriesChart.tsx` | | | NOT_STARTED |
| D03 | All 34 Widget Types | `components/charts/*.tsx` | | | NOT_STARTED |
| D04 | Dashboard Grid (@dnd-kit) | `pages/dashboards/components/` | | | NOT_STARTED |
| D05 | MQL Editor (Monaco) | `components/dashboard/MQLEditor.tsx` | | | NOT_STARTED |
| D06 | Template Variables | `components/dashboard/VariableBar.tsx` | | | NOT_STARTED |
| D07 | Time Range Picker | `components/dashboard/TimeRangePicker.tsx` | | | NOT_STARTED |
| D08 | Panel Inspector | `components/dashboard/PanelInspector.tsx` | | | NOT_STARTED |
| D09 | Version History | `pages/dashboards/components/VersionHistoryDrawer.tsx` | | | NOT_STARTED |
| D10 | Share Menu | `components/dashboard/ShareMenu.tsx` | | | NOT_STARTED |
| D11 | Display Options | `components/dashboard/DisplaySection.tsx` | | | NOT_STARTED |

---

## 3. SECURITY AUDIT CHECKLIST

Each item must be verified with evidence (test name, code line, or manual verification).

### 3.1 Tenant Isolation (SACRED — per max.md Law 4)

| # | Check | How to Verify | Status | Evidence | Date |
|---|---|---|---|---|---|
| SEC-T01 | Every `list_*` service function accepts `tenant_id: str \| None` and applies WHERE filter | Grep all list_ functions | **VERIFIED** | Phase A.1+A.2: 21 routes + 20 services reviewed. All list functions accept tenant_id and apply WHERE clause when non-None | 2026-05-04 |
| SEC-T02 | Every `get_*` service function scopes by tenant_id | Grep all get_ functions | **VERIFIED** | All get functions reviewed in A.1+A.2. Consistent pattern: tenant_id in WHERE when provided | 2026-05-04 |
| SEC-T03 | Every `create_*` writes tenant_id from server-side session, never client input | Grep all create_ functions | **VERIFIED** | All create routes use `Depends(get_tenant_id_required)`. Two exceptions fixed: logs ingest (R13-F01) previously used `batch.tenant_id or tenant_id` | 2026-05-04 |
| SEC-T04 | Every `update_*` and `delete_*` scopes by tenant_id | Grep all update_/delete_ | **VERIFIED** | All update/delete ops verified. Two P1 gaps fixed: dashboard_permissions + dashboard_versions (KI-15, KI-16) | 2026-05-04 |
| SEC-T05 | Super admin bypass (`tenant_id=None`) never leaks data it shouldn't | Manual test: impersonate user, verify scoped | **PARTIAL** | By-design: super admin sees all data. api_keys list leaks key_prefix+scopes cross-tenant (S02-F01 — P2, accepted risk) | 2026-05-04 |
| SEC-T06 | MQL queries inject tenant_id at compile time from auth, never from user input | Read `services/mql/compiler.py` | **VERIFIED** | compiler.py line 220: `tenant_id = {self._param(self._tenant_id)}` — always from auth context. All 4 MQL routes pass server-side tenant_id | 2026-05-04 |
| SEC-T07 | Metric ingest uses authenticated tenant_id only (NG-004 fix verified) | Read `api/routes/metrics.py` ingest route | **VERIFIED** | metrics.py:26 uses `Depends(get_tenant_id_required)`. logs.py also fixed (R13-F01) | 2026-05-04 |
| SEC-T08 | RLS policies exist on ALL data tables | Read `docker/timescaledb/init.sql` + migrations | **PARTIAL** | 18/19 tenant-scoped tables have correct RLS. **P1 FIXED**: resource_changes used wrong GUC name (`app.tenant_id` vs `app.current_tenant_id`) + missing FORCE RLS — fixed in migration 006. Platform tables (users, tenants, memberships, invites, audit logs) intentionally without RLS | 2026-05-04 |
| SEC-T09 | Cross-tenant adversarial tests exist and pass | Run adversarial test suite | **VERIFIED** | 18 unit tests in `test_security_adversarial.py` (MQL injection, compiled SQL tenant isolation, viewer role restrictions, cross-tenant URL sharing). 56 functional tests in `test_rbac.py`. Total: 74 cross-tenant tests | 2026-05-04 |
| SEC-T10 | Cache keys include tenant_id prefix | Grep Redis key patterns | **VERIFIED** | cache.py line 79: `f"{CACHE_KEY_PREFIX}:{tid}:..."`. Session keys include user_id. Rate limit keys include IP | 2026-05-04 |

### 3.2 Authentication & Authorization

| # | Check | Status | Evidence | Date |
|---|---|---|---|---|
| SEC-A01 | Passwords hashed with Argon2id (OWASP params) | **VERIFIED** | users.py: `hash_password()` uses Argon2id. Rehash on login if params changed | 2026-05-04 |
| SEC-A02 | Session cookies are HttpOnly, Secure, SameSite | **VERIFIED** | user_auth.py: `httponly=True, samesite="lax", secure=settings.cookie_secure` on all set_cookie calls | 2026-05-04 |
| SEC-A03 | CSRF protection on all state-changing endpoints | **VERIFIED** | CSRF cookie set on signup/login/me. CSRF middleware validates X-CSRF-Token header on POST/PATCH/PUT/DELETE | 2026-05-04 |
| SEC-A04 | Rate limiting on login/signup (Redis-backed) | **VERIFIED** | user_auth.py: `check_auth_rate_limit("login", ip)` and `check_auth_rate_limit("signup", ip)`. Redis pipeline with atomic INCR+TTL | 2026-05-04 |
| SEC-A05 | API key v2 uses Argon2id, v1 SHA-256 with deprecation tracking | **VERIFIED** | api_keys.py: v2 `obl_live_` prefix + Argon2id. v1 SHA-256 lookup as fallback with deprecation warning log | 2026-05-04 |
| SEC-A06 | Role-based access (`require_scope`) on all mutating endpoints | **VERIFIED** | All POST/PATCH/DELETE routes have `dependencies=[Depends(require_scope("write"/"admin"))]`. deps.py: admin scope implies all scopes | 2026-05-04 |
| SEC-A07 | Super admin flag cannot be set via public API | **VERIFIED** | Only `admin_set_super_admin()` can change flag, gated by `_require_super_admin()`. Self-demotion prevented | 2026-05-04 |
| SEC-A08 | Session expiry enforced (30d sliding TTL) | **VERIFIED** | sessions.py: Redis SETEX with `settings.session_ttl_seconds`. Super admin: `settings.super_admin_session_ttl_seconds` | 2026-05-04 |
| SEC-A09 | Impersonation is read-only and time-limited | **VERIFIED** | admin.py: `is_super_admin=False` on impersonation session. TTL override from `data.duration_minutes`. Admin session stored for restoration | 2026-05-04 |
| SEC-A10 | Password reset tokens are single-use and time-limited | **VERIFIED** | password_reset.py: `used_at IS NULL AND expires_at > $1` in atomic UPDATE...RETURNING. Rate-limited (3/hr). SHA-256 hashed storage | 2026-05-04 |

### 3.3 Input Validation & Injection

| # | Check | Status | Evidence | Date |
|---|---|---|---|---|
| SEC-I01 | All SQL uses parameterized queries (no f-strings) | **PARTIAL** | MQL compiler + metrics + main CRUD all parameterized. 8+ remaining f-string LIMIT/OFFSET locations (KI-17). Alert tag keys now fixed (S17-F01/F02). Dynamic SET clauses in update functions use Pydantic field names (safe but style risk) | 2026-05-04 |
| SEC-I02 | MQL tag keys validated via regex, values parameterized | **VERIFIED** | compiler.py: `_SAFE_TAG_KEY` regex + `tags->>($N)` parameterization. Alert engine also fixed to use same pattern | 2026-05-04 |
| SEC-I03 | Pydantic models on all API inputs | **VERIFIED** | All route handlers accept Pydantic BaseModel subclasses for request bodies. Field validators on MQL interval, role enums, etc. | 2026-05-04 |
| SEC-I04 | Webhook/notification URLs validated (SSRF protection) | **VERIFIED** | senders.py: `validate_outbound_url()` called on all 6 sender types before HTTP requests. 13 tests exist | 2026-05-04 |
| SEC-I05 | XSS prevention (sanitize.ts, DashboardLink scheme, TextWidget href) | **VERIFIED** | Phase A.3: Grep of entire frontend found 0 `dangerouslySetInnerHTML`, 0 `eval()`, 0 `innerHTML` in production code. All user-facing text rendered via React JSX (auto-escaped). CSRF token is only document.cookie access | 2026-05-04 |
| SEC-I06 | Unbounded payload limits (max_items on arrays) | **VERIFIED** | MQL batch: max 10 queries. Stream batch: max 50. All list endpoints: `min(limit, 500)`. Annotation limit: 1000 | 2026-05-04 |
| SEC-I07 | Annotation text length limits | **VERIFIED** | `models/annotations.py`: title max_length=256, text max_length=4096. Create and Update models both have limits | 2026-05-04 |
| SEC-I08 | No secrets in error responses (standardized error envelope) | **VERIFIED** | `main.py:120-134`: Global exception handler returns generic "An unexpected error occurred" with correlation_id. HTTPException handler sanitizes detail. Stack traces logged server-side only, never in HTTP response. Tests exist in `test_plan.py` | 2026-05-04 |

### 3.4 Data Protection

| # | Check | Status | Evidence | Date |
|---|---|---|---|---|
| SEC-D01 | Azure `client_secret` not returned in API responses | **VERIFIED** | `models/azure.py:27-39`: AzureSubscription response model excludes client_secret. Only accepted in Create/Update models | 2026-05-04 |
| SEC-D02 | AWS credentials (role_arn, external_id) handled securely | **PARTIAL** | `models/aws.py:29-41`: role_arn and external_id ARE included in AWSAccount response. Needed by frontend for display. P2-S for production: create a slim response model that redacts external_id | 2026-05-04 |
| SEC-D03 | No PII in structured logs (scrubbing audit) | **PARTIAL** | Email addresses logged in plaintext in `services/auth/email.py` (password reset emails). API key prefixes logged (acceptable). No PII scrubbing framework exists. Request logs are safe (no credentials). P2-S for production | 2026-05-04 |
| SEC-D04 | Audit log on every admin mutation | **VERIFIED** | `admin.py`: `write_platform_audit()` called on ALL admin mutations — tenant create/suspend/delete, user create/grant/revoke/activate/deactivate, impersonate start/end, member add/change role/remove. 11 distinct audit points with actor, action, target, IP | 2026-05-04 |
| SEC-D05 | Platform audit log on super admin actions | **VERIFIED** | Same as SEC-D04. All super admin actions go through `write_platform_audit()` with `target_type` and `target_id` for traceability | 2026-05-04 |

---

## 4. FUNCTIONALITY TEST PLAN — PAGE BY PAGE

Every page tested manually in browser. Every button clicked. Every state exercised.

### 4.1 Auth Flow

| # | Test Case | Steps | Expected | Status | Date | Notes |
|---|---|---|---|---|---|---|
| F-AUTH-01 | Login with valid credentials | Enter admin@neoguard.dev / SuperAdmin1! → Submit | Redirect to Overview, user menu shows "Admin" | NOT_TESTED | — | — |
| F-AUTH-02 | Login with wrong password | Enter wrong password → Submit | Error message, no redirect | NOT_TESTED | — | — |
| F-AUTH-03 | Login with non-existent email | Enter fake@test.com → Submit | Error "Invalid credentials" | NOT_TESTED | — | — |
| F-AUTH-04 | Signup new user | Fill signup form → Submit | Account created, login page | NOT_TESTED | — | — |
| F-AUTH-05 | Logout | Click user menu → Logout | Redirect to login, session cleared | NOT_TESTED | — | — |
| F-AUTH-06 | Session persistence | Login → Close tab → Reopen | Still logged in (session cookie) | NOT_TESTED | — | — |
| F-AUTH-07 | CSRF token validation | Make POST without CSRF header | 403 Forbidden | NOT_TESTED | — | — |
| F-AUTH-08 | Rate limiting on login | 10+ failed logins rapidly | 429 Too Many Requests | NOT_TESTED | — | — |
| F-AUTH-09 | Password reset request | Enter email → Request reset | Console shows token URL | NOT_TESTED | — | — |
| F-AUTH-10 | Password reset complete | Use token URL → Set new password | Password changed, can login | NOT_TESTED | — | — |

### 4.2 Overview Page

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-OVR-01 | Page loads without errors | Resource summary, account counts visible | NOT_TESTED | — |
| F-OVR-02 | Data reflects correct tenant context | Non-admin sees only their tenant's data | NOT_TESTED | — |
| F-OVR-03 | Super admin sees all tenants | Aggregated counts across all tenants | NOT_TESTED | — |

### 4.3 Infrastructure Page

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-INF-01 | Accounts grid loads | AWS + Azure cards visible with correct logos | NOT_TESTED | — |
| F-INF-02 | Account card shows correct stats | Resources, regions, status, last sync | NOT_TESTED | — |
| F-INF-03 | Click account → Service tabs | EC2, EBS, RDS, Lambda tabs load with resources | NOT_TESTED | — |
| F-INF-04 | Resource table sorts by column | Click column header → sort toggles | NOT_TESTED | — |
| F-INF-05 | Resource search filters results | Type in search → table filters | NOT_TESTED | — |
| F-INF-06 | Resource detail panel | Click resource row → side panel with metadata | NOT_TESTED | — |
| F-INF-07 | **Add Account wizard** | + Add Account → 6-step wizard completes | NOT_TESTED | — |
| F-INF-08 | **Edit Configuration** | ⋮ menu → Edit Configuration → change regions/services → Save | NOT_TESTED | — |
| F-INF-09 | **Disable account** | ⋮ menu → Disable → card shows "stopped" | NOT_TESTED | — |
| F-INF-10 | **Enable account** | ⋮ menu → Enable → card shows "active" | NOT_TESTED | — |
| F-INF-11 | **Delete account** | ⋮ menu → Remove → confirm → card disappears | NOT_TESTED | — |
| F-INF-12 | **Scan Now** | ⋮ menu → Scan Now → spinner → "Discovery complete" | NOT_TESTED | — |
| F-INF-13 | What's Wrong panel | Shows firing alerts, stopped resources, stale resources | NOT_TESTED | — |
| F-INF-14 | Deleted resources don't appear | Resources removed from AWS don't show after next scan | NOT_TESTED | — |
| F-INF-15 | No duplicate resources | Same account in 2 tenants → deduped in super admin view | NOT_TESTED | — |
| F-INF-16 | Azure account cards | Azure subscriptions show with Azure logo | NOT_TESTED | — |
| F-INF-17 | Back navigation | Click account → Back → returns to grid | NOT_TESTED | — |
| F-INF-18 | Empty state (no accounts) | Shows "No cloud accounts" + Add button | NOT_TESTED | — |

### 4.4 Settings Page

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-SET-01 | Profile tab loads | User info visible | NOT_TESTED | — |
| F-SET-02 | Team tab — invite user | Send invite → appears in pending | NOT_TESTED | — |
| F-SET-03 | Team tab — change role | Change member role → persists on refresh | NOT_TESTED | — |
| F-SET-04 | Team tab — remove member | Remove member → gone from list | NOT_TESTED | — |
| F-SET-05 | Cloud tab — list accounts | AWS + Azure accounts listed with status | NOT_TESTED | — |
| F-SET-06 | Cloud tab — edit configuration | Pencil icon → edit regions/services → save | NOT_TESTED | — |
| F-SET-07 | Cloud tab — toggle enabled | Power icon → disable/enable → status updates | NOT_TESTED | — |
| F-SET-08 | Cloud tab — delete account | Trash icon → confirm → removed | NOT_TESTED | — |
| F-SET-09 | Cloud tab — add account wizard | + Add Account → wizard flows correctly | NOT_TESTED | — |
| F-SET-10 | Notifications tab | Channel CRUD works (webhook, slack, etc.) | NOT_TESTED | — |
| F-SET-11 | API Keys tab | Create, view, delete API keys | NOT_TESTED | — |
| F-SET-12 | Viewer role restrictions | Viewer cannot see edit/delete buttons | NOT_TESTED | — |

### 4.5 Dashboards

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-DSH-01 | Dashboard list loads | All dashboards listed with metadata | NOT_TESTED | — |
| F-DSH-02 | Create new dashboard | + Create → name → save → appears in list | NOT_TESTED | — |
| F-DSH-03 | Open dashboard viewer | Click dashboard → panels render with data | NOT_TESTED | — |
| F-DSH-04 | Edit dashboard | Edit button → add/remove/resize panels | NOT_TESTED | — |
| F-DSH-05 | Time range picker | Select preset → charts update | NOT_TESTED | — |
| F-DSH-06 | Template variables | Dropdown vars → charts re-query with substitution | NOT_TESTED | — |
| F-DSH-07 | Panel fullscreen | Click fullscreen icon → panel expands | NOT_TESTED | — |
| F-DSH-08 | Kiosk mode | Press F → chrome hidden → panels fill screen | NOT_TESTED | — |
| F-DSH-09 | Dashboard export/import | Export JSON → Import → identical dashboard | NOT_TESTED | — |
| F-DSH-10 | Dashboard duplicate | Duplicate → new copy with "(Copy)" suffix | NOT_TESTED | — |
| F-DSH-11 | Version history | Open history → see past versions → restore | NOT_TESTED | — |
| F-DSH-12 | Delete dashboard | Delete → confirm → removed from list | NOT_TESTED | — |
| F-DSH-13 | Auto-refresh | Enable auto-refresh → charts update periodically | NOT_TESTED | — |
| F-DSH-14 | 12 panel types render | Each widget type renders without errors | NOT_TESTED | — |

### 4.6 Alerts

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-ALR-01 | Alert rules list | All rules shown with status | NOT_TESTED | — |
| F-ALR-02 | Create alert rule | Fill form → save → appears in list | NOT_TESTED | — |
| F-ALR-03 | Edit alert rule | Modify threshold → save → updated | NOT_TESTED | — |
| F-ALR-04 | Delete alert rule | Delete → confirm → removed | NOT_TESTED | — |
| F-ALR-05 | Alert events list | Firing/resolved events shown | NOT_TESTED | — |
| F-ALR-06 | Acknowledge alert | Click acknowledge → status updates | NOT_TESTED | — |
| F-ALR-07 | Silences — create | Create silence → matching alerts muted | NOT_TESTED | — |
| F-ALR-08 | Alert preview/dry-run | Preview shows what would fire | NOT_TESTED | — |

### 4.7 Metrics & Logs

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-MET-01 | Metrics page loads | Metric list + chart area visible | NOT_TESTED | — |
| F-MET-02 | Select metric → chart renders | Time series for selected metric | NOT_TESTED | — |
| F-MET-03 | MQL query in editor | Type query → execute → results render | NOT_TESTED | — |
| F-LOG-01 | Logs page loads | Log entries visible | NOT_TESTED | — |
| F-LOG-02 | Log search/filter | Filter by severity/source | NOT_TESTED | — |

### 4.8 Admin Page (Super Admin Only)

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-ADM-01 | Admin page loads (super admin) | Stats, tenants, users, audit log tabs | NOT_TESTED | — |
| F-ADM-02 | Non-admin cannot access | Redirect or 403 | NOT_TESTED | — |
| F-ADM-03 | Tenant management | List, suspend, activate tenants | NOT_TESTED | — |
| F-ADM-04 | User management | Grant/revoke super admin, deactivate | NOT_TESTED | — |
| F-ADM-05 | Impersonation | Impersonate user → yellow banner → read-only | NOT_TESTED | — |
| F-ADM-06 | End impersonation | Click end → back to admin view | NOT_TESTED | — |
| F-ADM-07 | Audit log | Admin actions logged with timestamps | NOT_TESTED | — |

### 4.9 Theme & UI

| # | Test Case | Expected | Status | Date |
|---|---|---|---|---|
| F-UI-01 | Dark theme | All text readable, no white-on-white | NOT_TESTED | — |
| F-UI-02 | Light theme | All text readable, no dark-on-dark, proper contrast | NOT_TESTED | — |
| F-UI-03 | Theme toggle persists | Toggle → refresh → same theme | NOT_TESTED | — |
| F-UI-04 | Sidebar collapse/expand | Collapse → icons only, expand → labels | NOT_TESTED | — |
| F-UI-05 | Sidebar state persists | Collapse → refresh → still collapsed | NOT_TESTED | — |
| F-UI-06 | Command palette (Cmd+K) | Opens, search works, navigation works | NOT_TESTED | — |
| F-UI-07 | Favicon + apple-touch-icon | NeoGuard logo in browser tab | NOT_TESTED | — |
| F-UI-08 | AWS/Azure logos | Proper logos on account cards (not generic cloud) | NOT_TESTED | — |
| F-UI-09 | Responsive layout | Sidebar + content don't overlap at 1280px+ | NOT_TESTED | — |
| F-UI-10 | NeoGuard logo in sidebar | Logo renders in expanded + collapsed states | NOT_TESTED | — |

---

## 5. DRY AUDIT — KNOWN DUPLICATION RISKS

| # | Pattern | Locations | Severity | Action | Status |
|---|---|---|---|---|---|
| DRY-01 | Region lists duplicated | `InfrastructurePage.tsx`, `CloudTab.tsx`, `core/regions.py` | P2 | Extract shared constant | NOT_FIXED |
| DRY-02 | Service/resource type lists | `InfrastructurePage.tsx` tabs, `CloudTab.tsx` resource types | P2 | Unify from backend | NOT_FIXED |
| DRY-03 | Account toggle/delete logic | `InfrastructurePage.tsx` + `CloudTab.tsx` both have enable/disable/delete | P2 | Extract shared hook | NOT_FIXED |
| DRY-04 | Error formatting | `formatError()` used consistently? Or inline? | P3 | Audit all catch blocks | NOT_CHECKED |
| DRY-05 | `substituteVars` vs `substituteVariables` | Dashboard variable substitution | P2 | Deduplicate | **NOT_APPLICABLE** — only `substituteVars` exists in `VariableBar.tsx`. No duplication found |
| DRY-06 | `computeSeriesKey` vs `seriesKey` | Chart series identification in 6 files | P2 | Audit | CHECKED — references in BaseTimeChart, UPlotChart, AreaChart, TimeSeriesChart, ChartLegend, useChartInteractions. Multiple files but may serve different purposes per chart type |
| DRY-07 | Super admin tenant bypass pattern | Every service function has `if tenant_id:` guard | P1 | Ensure consistency | CHECKED — verified in Phase A.1+A.2. All 20+ service domains follow pattern consistently |
| DRY-08 | `_is_admin()` duplicated in metrics.py + mql.py | Route helper | P2 | Extract to deps.py | CHECKED — identical function at metrics.py:13 and mql.py:95. Same as R08-F03 |
| DRY-09 | Auth page inline styles (~100 lines × 4 pages) | LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage | P3 | Extract shared styles | CHECKED — from Phase A.3 finding P01-P04 |

---

## 6. PERFORMANCE AUDIT CHECKLIST

| # | Check | Risk | Status | Evidence |
|---|---|---|---|---|
| PERF-01 | `list_resources` with no tenant filter — unbounded? | N+1 or full table scan | CHECKED | Super admin gets all resources but with LIMIT/OFFSET (bounded). Non-super-admin always has tenant_id WHERE clause. Bounded by `min(limit, 500)` in routes |
| PERF-02 | `DISTINCT ON (external_id)` subquery performance | Seq scan on large tables? | CHECKED | Only used in super admin path (tenant_id=None). Current scale ~100 resources — no issue. For production: add composite index on (external_id, provider) |
| PERF-03 | Discovery cycle for 9 regions — serial or parallel? | Slow discovery | CHECKED | Serial per resource type within each region. S05-F01 documented (P2-P). ~45s for 9 regions currently. Acceptable for demo |
| PERF-04 | MQL batch query concurrency | 10 queries in series vs parallel | CHECKED | Parallel via `asyncio.Semaphore(10)` in `mql.py:270`. Correct — bounded concurrency. Streaming via NDJSON for real-time results |
| PERF-05 | Dashboard with 10+ panels — API call waterfall | Many sequential fetches | CHECKED | Frontend uses TanStack Query with stale-while-revalidate. Each panel fetches independently — parallel by default. uPlot canvas rendering for timeseries (50 series × 500pts target). Acceptable |
| PERF-06 | Frontend bundle size (1,714 KB) | Above 500 KB warning threshold | KNOWN | Code-split needed | — |
| PERF-07 | DashboardsPage test OOM (Monaco + dnd-kit + uPlot) | jsdom worker crash | KNOWN | Need browser-mode or deeper mocking |

---

## 7. CHANGE LOG

Every change to the codebase must be logged here with test results before and after.

### Entry Format:
```
### YYYY-MM-DD — [Brief Description]
**Changed**: [files modified]
**Why**: [reason]
**Tests Before**: backend X passed, frontend Y passed, TS 0 errors
**Tests After**: backend X passed, frontend Y passed, TS 0 errors
**Regressions**: none / [list]
**Manual Verification**: [what was tested in browser]
**Reviewer Notes**: [observations]
```

---

### 2026-05-04 — Light/Dark Theme Fix + Account Deletion Bug + Logo Replacement

**Changed**: 30+ frontend files (hardcoded #fff → CSS vars), `dark-theme.css` (full rewrite), `Layout.tsx` (new icons + logo), `Layout.module.scss` (glass morphism), `index.html` (favicon, fonts), `CloudProviderIcons.tsx` (new), `InfrastructurePage.tsx` (AWS/Azure icons, error feedback)

**Why**: Fonts invisible in light theme; generic cloud icons; no favicon; account deletion 404 for cross-tenant accounts

**Tests Before**: Backend 1,345 passed, Frontend 493 passed, TS 0 errors
**Tests After**: Backend 1,469 passed, Frontend 596 passed, TS 0 errors
**Regressions**: None detected
**Manual Verification**: Theme toggle verified on login, overview, infrastructure pages. Account deletion tested via curl for cross-tenant accounts.

---

### 2026-05-04 — Edit Configuration Modal (Regions + Services)

**Changed**: `InfrastructurePage.tsx` (+EditAccountModal, region/service data, edit handler), `CloudTab.tsx` (+EditAccountOverlay, pencil button), `types/index.ts` (+collect_config on create types), `index.css` (+edit modal styles)

**Why**: No UI to edit regions or services after account onboarding

**Tests Before**: Backend 1,469, Frontend 596, TS 0 errors
**Tests After**: Backend 1,469, Frontend 596, TS 0 errors
**Regressions**: None
**Manual Verification**: PENDING — need to test edit modal opens, saves, refreshes account card

---

### 2026-05-04 — Resource Deduplication (Super Admin Cross-Tenant)

**Changed**: `services/resources/crud.py` (DISTINCT ON external_id for list + summary when tenant_id=None)

**Why**: Same AWS account registered in 2 tenants → super admin sees 2x resources

**Tests Before**: 96 resources (34 duplicated)
**Tests After**: 52 resources (0 duplicated)
**Regressions**: None — tenant-scoped queries unchanged
**Manual Verification**: Verified via API — EC2 count correct, summary correct

---

### 2026-05-04 — Stale Resource Reconciliation

**Changed**: `services/resources/crud.py` (+reconcile_stale_resources), `services/collection/orchestrator.py` (call reconcile after each account discovery), `models/resources.py` (+REMOVED status), crud.py (exclude status='removed' from default listings + summary)

**Why**: Deleted EBS volumes (and any resource removed from AWS/Azure) persisted indefinitely in NeoGuard

**Tests Before**: 13 EBS volumes (6 stale from 2026-04-30)
**Tests After**: 7 EBS volumes (6 stale marked removed, filtered from listings). Discovery log: `removed=7`
**Regressions**: None — reconciliation only runs after successful discovery, only marks resources for the specific account+tenant+provider that was just discovered
**Manual Verification**: Waited for discovery cycle, confirmed `AWS discovery complete ... removed=7` in logs, verified API returns only active resources

---

### 2026-05-04 — Phase A.1 Backend Routes Review (R01–R21)

**Changed**: `api/routes/logs.py` (2 lines changed — removed client tenant_id override on ingest + query)

**Why**: Phase A.1 systematic review discovered P0 cross-tenant vulnerability in logs routes — identical to the NG-004 finding previously fixed in metrics.py but missed in logs.py

**Tests Before**: Backend 1,469 passed, Frontend 596 passed, TS 0 errors
**Tests After**: Backend 1,469 passed (all green)
**Regressions**: None
**Manual Verification**: Code review verified — both ingest and query now always use server-side authenticated tenant_id
**Reviewer Notes**: 21 route modules reviewed end-to-end. 10 CLEAN, 8 REVIEWED with minor issues (11 P2 findings documented), 1 ISSUES_FOUND with 2 P0s fixed immediately. Detailed findings recorded in Section 2.1.1. Key positive: tenant isolation consistent across all other modules, rate limiting solid, audit logging comprehensive.

---

### 2026-05-04 — Phase A.2 Backend Services Review (S01–S26)

**Changed**: `services/alerts/crud.py` (preview_alert_rule tag filter: parameterized tag keys + LIMIT/OFFSET), `services/alerts/engine.py` (evaluate_rule tag filter: parameterized tag keys + import re + module-level compiled regex)

**Why**: Phase A.2 systematic review discovered P0 SQL injection via tag key interpolation in alert preview and engine eval — same class as NG-003 (fixed in metrics.py) but missed in alerts. Also fixed unparameterized LIMIT/OFFSET in list_alert_rules.

**Tests Before**: Backend 1,469 passed
**Tests After**: Backend 1,469 passed (all green)
**Regressions**: None
**Manual Verification**: Code review verified — tag keys now use `tags->>($N) = $N+1` pattern matching MQL compiler gold standard. Regex validation `^[a-zA-Z_][a-zA-Z0-9_\-]*$` and 128-char limit applied.
**Reviewer Notes**: 20 service domains reviewed (6 deferred). 3 CLEAN, 13 REVIEWED, 1 ISSUES_FOUND. 3 P0 fixes, 2 P1 findings (dashboard_permissions + dashboard_versions tenant isolation — also fixed), 11 P2 findings. MQL engine identified as gold standard. Total P0 SQL injection fixes this session: 5 (2 in logs routes, 3 in alerts services).

---

### 2026-05-04 — P1 Security Fixes: Dashboard Permissions + Versions Tenant Isolation

**Changed**: `services/dashboard_permissions.py` (+tenant_id param on remove_dashboard_permission), `services/dashboard_versions.py` (+tenant_id param on save_version + ownership check), `api/routes/dashboards.py` (pass tenant_id to both calls)

**Why**: Phase A.2 review identified cross-tenant gaps — permission deletion and version save had no tenant scoping at service layer

**Tests Before**: Backend 1,469 passed
**Tests After**: Backend 1,469 passed (all green)
**Regressions**: None
**Manual Verification**: Code review verified — defense-in-depth tenant checks added without breaking backwards compatibility (tenant_id is optional with None default)
**Reviewer Notes**: Both callers in dashboards.py already had upstream tenant checks via get_dashboard(tenant_id, dashboard_id), but service-layer defense-in-depth is required per max.md Law 4 (Security First — tenant isolation is sacred).

---

### 2026-05-04 — Phase A.4 Security Audit (SEC-*) + RLS Fix

**Changed**: `alembic/versions/006_resource_changes.py` (fixed GUC name `app.tenant_id` → `app.current_tenant_id`, added `FORCE ROW LEVEL SECURITY`), `frontend/src/pages/OverviewPage.tsx` (updated stale "Coming Soon" cards)

**Why**: Phase A.4 security audit found RLS policy on resource_changes table using wrong GUC name — policy silently failed, making table accessible cross-tenant. Also fixed stale feature cards (P2).

**Tests Before**: Backend 1,469, Frontend 596, TS 0 errors
**Tests After**: Backend 1,469 (migration change only affects DB schema), Frontend 596, TS 0 errors
**Regressions**: None
**Manual Verification**: Code review verified. All other RLS policies confirmed using `app.current_tenant_id`. DB schema change requires re-running migration or `ALTER TABLE` in live DB.
**Reviewer Notes**: All 28 SEC-* items now have status. 20 VERIFIED, 6 PARTIAL (with documented reasons), 2 DEFERRED. 1 P1 fixed (KI-25). Security posture is strong for a laptop demo — remaining partials (RLS FORCE in init.sql, AWS external_id exposure, PII in logs) are all documented for cloud hardening.

---

### 2026-05-04 — Phase A.3 Frontend Pages Review (P01–P16)

**Changed**: No code changes — read-only audit

**Why**: Systematic review of all 16 frontend pages for functionality, security, DRY, and test coverage

**Tests Before**: Backend 1,469 passed, Frontend 596 passed, TS 0 errors
**Tests After**: N/A (no code changes)
**Regressions**: N/A
**Manual Verification**: N/A (read-only audit)
**Reviewer Notes**: 16 pages reviewed. 10 CLEAN, 6 REVIEWED with minor issues. **Zero XSS surface** — no dangerouslySetInnerHTML, no eval(), no innerHTML in production code. Biggest gap: 10 of 16 pages have NO tests. SettingsPage decomposition (KI-02) is resolved — now 97 lines with 6 sub-tab components. 2 P2 findings (stale "Coming Soon" cards, region list duplication), 3 P3 findings (auth page style duplication, large file sizes). Security checklist SEC-I05 now VERIFIED.

---

## 8. KNOWN ISSUES & TECH DEBT REGISTRY

| # | Issue | Severity | Module | Introduced | Status | Notes |
|---|---|---|---|---|---|---|
| KI-01 | DashboardsPage viewer/mql tests OOM in jsdom | P2 | Frontend tests | 2026-05-04 | OPEN | 15 tests crash, need browser-mode |
| KI-02 | SettingsPage.tsx is 1,442 lines | P3 | Frontend | Pre-existing | **RESOLVED** | Decomposed to 97 lines + 6 sub-tab components (see KI-24) |
| KI-03 | AlertsPage.tsx is 1,096 lines | P3 | Frontend | Pre-existing | OPEN | Could benefit from extraction |
| KI-04 | Frontend bundle 1,714 KB | P2 | Build | Pre-existing | OPEN | Needs code-splitting |
| KI-05 | Azure client_secret in plaintext (DB) | P1 | Security | Pre-existing | OPEN | Document as known risk |
| KI-06 | No HTTPS/TLS | P1 | Infra | By design | DEFERRED | Cloud deployment |
| KI-07 | CORS wide-open | P1 | Infra | By design | DEFERRED | Cloud deployment |
| KI-08 | No MFA/TOTP | P2 | Auth | Spec 10 gap | DEFERRED | Cloud feature |
| KI-09 | No Playwright E2E | P2 | Testing | Not built | OPEN | Phase 8 |
| KI-10 | `superadmin.txt` in repo root | P1 | Security | 2026-05-04 | OPEN | Should be in .gitignore |
| KI-11 | Region lists duplicated across frontend files | P2 | DRY | 2026-05-04 | OPEN | Infra page + CloudTab + backend |
| KI-12 | No log scrubbing for PII/tokens | P2 | Security | Pre-existing | OPEN | Needs audit |
| KI-13 | `alert_rule_states` table missing | P2 | DB | Pre-existing | OPEN | AlertEngine logs error on startup |
| KI-14 | 42 modified + 16 untracked files uncommitted | P1 | Git | 2026-05-04 | OPEN | Must commit |
| KI-15 | `remove_dashboard_permission()` no tenant_id check | P1 | Security | 2026-05-04 | **FIXED** | Added tenant_id param + WHERE clause; route passes tenant_id |
| KI-16 | `save_version()` no tenant_id validation | P1 | Security | 2026-05-04 | **FIXED** | Added tenant_id param + dashboard ownership check; route passes tenant_id |
| KI-17 | f-string LIMIT/OFFSET in 8+ SQL queries | P2 | Security/Style | 2026-05-04 | OPEN | aws/accounts, azure/accounts, resources/crud, notifications/crud (S04/S08/S11/S18) |
| KI-18 | Notification senders 250+ LOC duplication | P2 | DRY | 2026-05-04 | OPEN | send_firing/send_resolved nearly identical across 6 senders |
| KI-19 | Alert engine fire/nodata 200+ LOC duplication | P2 | DRY | 2026-05-04 | OPEN | `_fire_alert` + `_fire_nodata_alert` 99% identical |
| KI-20 | Discovery serial per resource type | P2 | Performance | 2026-05-04 | OPEN | AWS 26 discoverers run sequentially; could parallelize by service |
| KI-21 | OverviewPage "Coming Soon" cards stale | P2 | Functionality | 2026-05-04 | OPEN | MQL + Dashboard grid listed as "Coming Soon" but are fully built. Remove or update cards |
| KI-22 | 10 of 16 frontend pages have NO tests | P1 | Testing | 2026-05-04 | OPEN | Login, Signup, ForgotPassword, ResetPassword, Overview, Metrics, Logs, Alerts, Admin, AlertDetail — all untested |
| KI-23 | Auth pages share ~100 lines identical inline styles | P3 | DRY | 2026-05-04 | OPEN | LoginPage, SignupPage, ForgotPasswordPage, ResetPasswordPage — extract shared styles |
| KI-24 | SettingsPage.tsx decomposed (KI-02 resolved) | P3 | Cleanup | 2026-05-04 | **RESOLVED** | Was 1,442 lines, now 97 lines with 6 sub-tab components |
| KI-25 | resource_changes RLS used wrong GUC name | P1 | Security | 2026-05-04 | **FIXED** | Migration 006 used `app.tenant_id` instead of `app.current_tenant_id` — policy silently failed, allowing cross-tenant access. Also missing FORCE RLS. Both fixed |
| KI-26 | AWS external_id exposed in API responses | P2 | Security | 2026-05-04 | OPEN | AWSAccount response model includes external_id. Needed by frontend for demo. Production: create slim response model |
| KI-27 | Email PII logged in plaintext | P2 | Security | 2026-05-04 | OPEN | `email.py` logs recipient email in password reset flow. No PII scrubbing framework |

---

## 9. REVIEW EXECUTION PROTOCOL

When reviewing, follow this order (per max.md Working Protocol):

### Phase A: Read & Audit (no code changes)
1. Pick a module from Section 2
2. Read every file in the module end-to-end
3. Fill in the F/S/D/P/T/B columns
4. Log findings with severity (P0–P3)
5. Update this document with findings
6. Move to next module

### Phase B: Fix (code changes, with tracking)
1. Fix P0s immediately — these block everything
2. Fix P1s in current cycle
3. Log every fix in Section 7 (Change Log) with before/after test counts
4. Run ALL verification commands after each fix batch
5. Schedule P2s for next cycle
6. Backlog P3s

### Phase C: Verify (after all fixes)
1. Run full backend test suite
2. Run full frontend test suite
3. Run TypeScript compilation
4. Run production build
5. Manual testing per Section 4
6. Update baseline in Section 1

---

## 10. REVIEW SCHEDULE

| Phase | Target | Owner | Status |
|---|---|---|---|
| Phase A.1 — Backend routes review (R01–R21) | 2026-05-04 | Principal Engineer | **COMPLETE** — 2 P0 fixed, 11 P2 documented |
| Phase A.2 — Backend services review (S01–S26) | 2026-05-04 | Principal Engineer | **COMPLETE** — 3 P0 fixed, 2 P1 documented, 11 P2 documented |
| Phase A.3 — Frontend pages review (P01–P16) | 2026-05-04 | Principal Engineer | **COMPLETE** — 0 P0, 0 P1, 2 P2, 3 P3 documented. 10/16 pages have NO tests |
| Phase A.4 — Security audit (SEC-*) | 2026-05-04 | Principal Engineer | **COMPLETE** — 1 P1 fixed (RLS GUC mismatch), all SEC items now VERIFIED or PARTIAL with documented status |
| Phase A.5 — DRY audit (DRY-*) | 2026-05-04 | Principal Engineer | **COMPLETE** — 9 items audited. DRY-05 not applicable. DRY-07 verified consistent. No P0/P1 DRY issues. 6 P2 items + 1 P3 documented |
| Phase A.6 — Performance audit (PERF-*) | 2026-05-04 | Principal Engineer | **COMPLETE** — 7 items audited. All acceptable for laptop demo. No P0/P1 perf issues. Bundle size (1,714KB) and discovery serial execution are P2 for production |
| Phase B — Fix all P0/P1 findings | 2026-05-04 | Principal Engineer | **COMPLETE** — 8 P0/P1 fixes total: 2 cross-tenant logs (A.1), 3 SQL injection alerts (A.2), 2 tenant isolation dashboard services (A.2), 1 RLS GUC mismatch (A.4) |
| Phase C — Full verification + manual testing | 2026-05-04 | Principal Engineer | **COMPLETE** — Backend 1,469 passed, Frontend 596 passed (33 files), TS 0 errors, Build success. Manual testing per Section 4 NOT_TESTED (requires running backend+frontend) |

---

*This document is load-bearing. Do not summarize it. Do not skip sections. Update it in-place. Every reviewer, every session, starts here.*
