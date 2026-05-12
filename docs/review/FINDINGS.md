# NeoGuard Codebase Review — Findings Index

> Maintained by Max (Principal Engineer review). Severity levels:
> - **P0** — Security / data integrity: fix before any other work
> - **P1** — Correctness / reliability: fix in current cycle
> - **P2** — Quality / maintainability: scheduled refactor
> - **P3** — Polish: backlog

---

## Module 1: Infrastructure Layer (config, DB connections, migrations, SSRF)

**Reviewed by:** Max (direct)
**Date:** 2026-05-02
**Files reviewed:** `core/config.py`, `db/timescale/connection.py`, `db/timescale/tenant_ctx.py`, `db/redis/connection.py`, `db/clickhouse/connection.py`, `alembic.ini`, `alembic/env.py`, `alembic/versions/001_initial_schema.py`, `alembic/versions/003_dashboard_extensions.py`, `main.py`, `services/notifications/url_validator.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| INFRA-001 | **P0** | `alembic.ini:3` | `sqlalchemy.url` hardcodes port **5432** but DB runs on **5433**. `alembic upgrade head` silently hits wrong DB or fails. | Fix to 5433 and add env var override in `alembic/env.py`. |
| INFRA-002 | **P0** | `config.py:14` | `db_password` has hardcoded default `"neoguard_dev"`. In prod, if env var unset, app connects with dev creds. | Remove default. Fail at startup if `NEOGUARD_DB_PASSWORD` unset. |
| INFRA-003 | **P0** | `config.py:40` | `session_secret` defaults to `"change-me-in-production"`. If unset in prod, **any attacker can forge sessions** with this known value. | Remove default. Require env var. Fail at startup if missing. |
| INFRA-004 | **P1** | `001_initial_schema.py:238` | `azure_subscriptions.client_secret` stored as **plaintext** TEXT column. Azure service principal secret in the clear. | Encrypt at rest or use secrets manager reference. Document as known risk until cloud deployment. |
| INFRA-005 | **P1** | Alembic migrations | `dashboard_versions` table is **not in any migration**. Created ad-hoc at runtime. Fresh deploy = missing table = PATCH dashboards fails. | Write migration 004 with correct schema. |
| INFRA-006 | **P1** | Alembic migrations | `dashboards.variables`, `dashboards.groups`, `dashboards.links` columns **not in any migration**. Added ad-hoc. Fresh deploy = dashboards table missing 3 critical JSONB columns. | Add to migration 004. |
| INFRA-007 | **P1** | Alembic migrations | `annotations` table **not in any migration**. Created ad-hoc. Fresh deploy = annotations endpoint fails. | Add to migration 004. |
| INFRA-008 | **P1** | `alembic/env.py` | Does NOT read `NEOGUARD_DB_PORT` env var. Only uses hardcoded URL from `alembic.ini`. | Override URL from settings DSN or env var. |
| INFRA-009 | **P1** | `url_validator.py:55` | **DNS rebinding risk**: URL resolved once at validation, HTTP request happens later. Attacker DNS can rotate from public IP to `169.254.169.254` between resolve and request. | Pin resolved IP for connection, or re-validate at request time. |
| INFRA-010 | **P1** | `url_validator.py:14-17` | `_BLOCKED_HOSTS` incomplete. Missing: `[::1]`, numeric IP forms (`0177.0.0.1`, `0x7f000001`), `instance-data` hostname, Azure IMDS hostname. | Expand blocked hosts list. Add IPv6 and alternate encoding checks. |
| INFRA-011 | **P1** | `connection.py:18` | asyncpg pool uses default `statement_cache_size=1024`. Schema changes at runtime (e.g., DROP/CREATE table) break cached prepared statements, causing silent INTERNAL_ERROR. Root cause of the PATCH dashboard bug. | Set `statement_cache_size=0` for dev, or document restart requirement. |
| INFRA-012 | **P2** | `main.py:153-159` | CORS allows `*` methods and `*` headers. Fine for dev, must be locked for prod. | Config via env var, document as cloud-deployment requirement. |
| INFRA-013 | **P2** | `config.py:12` | `db_port` default `5432` doesn't match actual setup (5433). Every dev must override. | Change default to 5433, or require env var. |

**Summary:** 3 P0, 8 P1, 2 P2. The P0 findings (session secret default, DB password default, alembic port) are **deploy-blocking** — any production deployment without env var overrides would have forgeable sessions and potentially connect to the wrong database. The migration drift (5 P1 findings) means a fresh deploy from this codebase produces a broken application.

---

## Module 2: Security Layer (auth, sessions, CSRF, tenant isolation)

**Reviewed by:** Max (agent)
**Date:** 2026-05-02
**Files reviewed:** `api/middleware/auth.py`, `api/middleware/csrf.py`, `services/auth/sessions.py`, `services/auth/passwords.py`, `services/auth/api_keys.py`, `services/auth/users.py`, `services/auth/rate_limiter.py`, `services/auth/password_reset.py`, `db/timescale/tenant_ctx.py`, `api/routes/user_auth.py`, `api/routes/tenants.py`, `core/config.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| SEC-001 | **P0** | `001_initial_schema.py:430-456` | **RLS policies are a no-op.** The `neoguard` DB user is the table owner. PostgreSQL RLS does not apply to table owners unless `FORCE ROW LEVEL SECURITY` is set. No `FORCE RLS` exists anywhere. **All tenant isolation depends entirely on application-layer WHERE clauses** — RLS is documentation theater. | Add `ALTER TABLE <table> FORCE ROW LEVEL SECURITY` for every RLS-enabled table, OR use the already-stubbed `neoguard_app` role (line 422-428) as the connection pool user. |
| SEC-002 | **P0** | `services/auth/api_keys.py:75-76` | **Argon2id API key validation scans ALL enabled keys across ALL tenants.** `WHERE hash_version = $1 AND enabled = TRUE` with no tenant filter. O(n) table scan on every API key auth. DoS vector at scale. | Add `key_prefix` lookup column. Store first 8 chars of raw key as index to narrow Argon2id verification to 1-2 candidates. |
| SEC-003 | **P0** | `services/auth/password_reset.py:52-78` | **TOCTOU race in password reset.** SELECT (line 57) and UPDATE (line 73) are not atomic. Two concurrent requests with same token both read `used_at IS NULL`, both pass, both reset the password. Token replay attack. | Use single `UPDATE ... WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2 RETURNING user_id`. |
| SEC-004 | **P1** | `api/middleware/auth.py:106-114` | **Bootstrap token is a permanent backdoor.** No rate limiting, no audit logging, no expiry. If env var leaked, permanent admin access. | Add audit logging, startup warning, auto-disable after first use. |
| SEC-005 | **P1** | `api/routes/user_auth.py:116,194,270` | **`secure=False` hardcoded** on all 9 `set_cookie` calls. Cookies sent over HTTP even when deployed with HTTPS. | Add `settings.cookie_secure` config toggle. |
| SEC-006 | **P1** | `services/auth/rate_limiter.py:56-67` | **`X-Forwarded-For` spoofing bypasses rate limiting.** `extract_client_ip()` trusts first value in header without validation. Attacker sends random IPs to bypass per-IP rate limits. | Default to `request.client.host`. Add `settings.trust_forwarded_for: bool = False`. |
| SEC-007 | **P1** | `api/routes/user_auth.py:325-332` | **Password reset confirm has no rate limiting.** Public endpoint, no IP throttling. Token has 256-bit entropy so brute-force is infeasible, but defense-in-depth says rate-limit. | Add `check_auth_rate_limit("password_reset_confirm", ip)`. |
| SEC-008 | **P1** | `core/config.py:40` | **`session_secret` is declared but never used.** Dead security config creates false sense of security — someone might think sessions are HMAC-signed. | Remove field, or actually use it to sign session cookies (defense in depth). |
| SEC-009 | **P2** | `api/middleware/auth.py:40-48` | **`auth_enabled=False` disables all security with one env var.** Auth, CSRF, scopes all bypassed. Single config flag → total security bypass. | Guard: only honor `auth_enabled=False` when `debug=True`. |
| SEC-010 | **P2** | `services/auth/sessions.py:56` | **Super admin session index TTL uses regular 30-day TTL** even though session expires in 4 hours. Index entry lingers 30 days. | Set index TTL to `min(ttl, settings.session_ttl_seconds)`. |
| SEC-011 | **P2** | `services/auth/users.py:27-33` | **`get_user_by_email` returns `SELECT *` including `password_hash`.** Hash flows through Python memory in route handlers. If any route returns raw dict, hash leaks. | Use explicit column list. Keep `SELECT *` only in `authenticate_user`. |
| SEC-012 | **P2** | `api/middleware/csrf.py:24-29` | **Logout requires CSRF token.** If CSRF cookie cleared but session remains, user cannot log out. | Consider exempting `/auth/logout` — worst case is attacker-forced logout (low impact). |
| SEC-013 | **P3** | `models/users.py:32-37` | **Password validation is length-only (8-128).** No complexity requirements, no breached-password check. | For production, add HaveIBeenPwned k-Anonymity check or basic complexity rules. |

**Strengths noted:** Argon2id with OWASP params, cryptographically random session tokens (256-bit), CSRF timing-safe comparison, impersonation security (read-only + audit + time-limited), error envelope never leaks internals, owner protection prevents last-owner removal, comprehensive audit logging.

**Summary:** 3 P0, 5 P1, 4 P2, 1 P3. **SEC-001 (RLS bypass) is the most critical finding in the entire review** — the multi-tenancy safety net advertised throughout the codebase is not actually functioning.

## Module 3: MQL Engine (tokenizer, parser, compiler, executor)

**Reviewed by:** Max (agent)
**Date:** 2026-05-02
**Files reviewed:** `services/mql/tokenizer.py`, `parser.py`, `ast_nodes.py`, `compiler.py`, `executor.py`, `variables.py`, `cache.py`, `planner.py`, `api/routes/mql.py`, `frontend/src/lib/mql/tokenizer.ts`, `parser.ts`, `validator.ts`, `ast.ts`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| MQL-001 | **P0** | `compiler.py:27,205` | **Tag key f-string SQL injection surface.** Tag keys interpolated into SQL via `f"tags>>'{key}'"`. Regex `^[a-zA-Z_][a-zA-Z0-9_\-]*$` is the single point of defense. Currently sufficient but fragile — any relaxation of regex enables injection. | Migrate to parameterized `tags>>($N)` syntax. Add compile-time assertion that regex blocks `'`. |
| MQL-002 | **P0** | Frontend vs backend tokenizers | **Frontend/backend grammar divergence.** Frontend supports STRING (`'abc'`), VARIABLE (`$env`), FLOAT (`3.14`), aggregators `p50/p95/p99`. Backend has none of these. Queries validate green on client, fail 400 on server. | Sync grammars. Either add to backend or remove from frontend. |
| MQL-003 | **P0** | `compiler.py:169` | **`bucket_sql` in SQL via f-string.** `f"time_bucket('{self._bucket_sql}', ...)"`. Currently safe (all inputs are int-derived), but latent injection vector if anyone adds a user-input path. | Parameterize: `time_bucket($N * interval '1 second', ...)` with seconds as param. |
| MQL-004 | **P1** | `compiler.py:188` | **Super admin MQL returns merged cross-tenant data.** `tenant_id=None` skips WHERE clause, intermixes tenant A and B metrics with no attribution. | Require super admin to specify `?tenant_id=X` for MQL, or add tenant_id to GROUP BY. |
| MQL-005 | **P1** | `cache.py:75` | **Cache key collision with `__global__` sentinel.** If tenant ID equals `__global__`, cache entries collide with super admin's unscoped queries. Cross-tenant data leak via cache. | Use impossible sentinel like `\x00__platform__`. |
| MQL-006 | **P1** | `mql.py:399-400` | **Content-Length check is after body parsing.** Check on `content-length` header occurs after Starlette already read and parsed the body. Check is a no-op. | Use middleware-level body size limit. |
| MQL-007 | **P1** | `variables.py:96-105` | **String-based variable substitution is fragile.** 4-pass pipeline operates on raw query string. Brace-finding can be confused by modifications in earlier passes. | Parse MQL to AST, substitute on AST nodes, serialize back. |
| MQL-008 | **P1** | `executor.py:27` | **No query timeout on SQL execution.** Single `/query` and `/query/batch` have no timeout. Broad time range queries can scan millions of rows. | Add `asyncio.wait_for(conn.fetch(...), timeout=10.0)`. |
| MQL-009 | **P2** | `compiler.py:207` | **Wildcard LIKE pattern doesn't escape `_` and `%`.** `_` in tag values acts as LIKE single-char wildcard. | Escape before `*` → `%` conversion. |
| MQL-010 | **P2** | `cache.py:76` | **SHA-256 hash truncated to 64 bits.** Birthday collision at ~4B entries. | Use 128 bits (32 hex chars). |
| MQL-011 | **P2** | `parser.py:206-209` | **No upper bound on `moving_average` window.** `moving_average(999999999)` accepted. OOM risk. | Cap at 1000. |
| MQL-012 | **P2** | `mql.py:48` | **`interval` field is unvalidated freeform string.** Invalid intervals silently default to 60s. | Use `Literal["raw","1m","5m","15m","1h","6h","1d"]`. |
| MQL-013 | **P3** | `mql.py:329-335` | **Internal error message leaks exception string to client.** | Return generic message, log details server-side. |

**Defense-in-depth assessment:** The MQL→SQL pipeline has 4 layers (tokenizer char restrict → parser IDENTIFIER check → compiler regex → parameterized values). Effective for values. Tag keys are the sole f-string surface — 3-layer protected but should be parameterized. Tenant isolation is sound (tenant_id from server auth state, never user input).

**Summary:** 3 P0, 5 P1, 4 P2, 1 P3. The tag key f-string and frontend/backend divergence are the most critical.

---

## Module 4: Dashboard Backend (models, services, routes, schema)

**Reviewed by:** Max (agent)
**Date:** 2026-05-02
**Files reviewed:** `models/dashboards.py`, `models/dashboard_versions.py`, `models/annotations.py`, `services/dashboards.py`, `services/dashboard_versions.py`, `api/routes/dashboards.py`, `api/routes/annotations.py`, `alembic/versions/001_initial_schema.py`, `alembic/versions/003_dashboard_extensions.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| DASH-001 | **P0** | `services/dashboard_versions.py:20` | **`dashboard_versions` table not in any migration.** Every INSERT/SELECT returns `UndefinedTableError`. Direct cause of PATCH bug. | Write migration 004 with correct schema. |
| DASH-002 | **P0** | `services/annotations.py:20` | **`annotations` table not in any migration.** All annotation CRUD returns 500. | Add to migration 004. |
| DASH-003 | **P0** | `services/dashboards.py:29` | **`create_dashboard()` references columns `variables, groups, tags, links`** that don't exist in any migration. Dashboard creation fails on fresh DB. | Add ALTER TABLE to migration 004. |
| DASH-004 | **P0** | `alembic/003:65` | **FK type mismatch:** `dashboard_favorites.user_id` is TEXT referencing `users.id` which is UUID. PostgreSQL rejects this FK. | Change to `UUID NOT NULL REFERENCES users(id)`. |
| DASH-005 | **P1** | `routes/dashboards.py:120-129` | **No transaction safety on PATCH.** `save_version` + `update_dashboard` use separate connections. Failure between them creates phantom versions. | Wrap in single transaction. |
| DASH-006 | **P1** | `routes/dashboards.py:72-73` | **`/import` accepts raw `dict` with no size limits.** Millions of panels parsed before Pydantic validation. OOM risk. | Use typed Pydantic model with `max_length`. |
| DASH-007 | **P1** | `models/dashboards.py:111-119` | **`DashboardUpdate` has no `max_length` on any field.** PATCH can send 100MB name or 10,000 panels. `DashboardCreate` has constraints but `DashboardUpdate` does not. | Mirror `DashboardCreate` constraints. |
| DASH-008 | **P1** | `models/dashboards.py:32-45` | **`PanelDefinition` fields unbounded.** `id`, `title`, `metric_name`, `mql_query`, `content` have no `max_length`. `content` is completely unbounded. `display_options: dict` unconstrained. | Add `max_length` to all string fields. |
| DASH-009 | **P1** | `models/dashboards.py:32-45` | **No panel ID uniqueness validation.** Duplicate panel IDs cause frontend rendering bugs, lost drag-and-drop updates. | Add `model_validator` checking ID uniqueness. |
| DASH-010 | **P1** | `services/dashboards.py:83` | **`limit`/`offset` interpolated via f-string into SQL.** Violates "parameterized SQL only" convention. Same in annotations service. | Use `$N` params. |
| DASH-011 | **P2** | `services/dashboards.py:168-183` | **`record_view()` defined but never called.** Dead code. | Wire into GET route or remove. |
| DASH-012 | **P2** | `alembic/003:34-40` | **`dashboard_tags` table created but never used.** Tags stored as JSONB on dashboards instead. Dead schema. | Implement sync or remove. |
| DASH-013 | **P2** | `services/dashboard_versions.py:31-53` | **Version history has no tenant_id filtering.** Queried by `dashboard_id` alone. No RLS policy on table. | Add tenant_id to queries and RLS. |
| DASH-014 | **P2** | `services/dashboards.py:65-74` | **ILIKE branch logic inverted.** `_` in search triggers ILIKE path that escapes wildcards, making pattern matching impossible while bypassing FTS. | Remove ILIKE branch, use FTS for all searches. |
| DASH-015 | **P2** | `models/dashboards.py:80-97` | **URL validator stores unnormalized value.** Validates lowercased URL but returns original. | Return normalized value. |
| DASH-016 | **P3** | `services/dashboards.py:196-234` | **`_row_to_dashboard` parses JSON 5x per row.** List of 500 dashboards = 2,500 parse operations. | Add lightweight `DashboardSummary` for list endpoint. |

**Summary:** 4 P0, 6 P1, 5 P2, 1 P3. Schema drift is the dominant issue — 4 P0s are all "table/column doesn't exist in migrations."

## Module 5: Frontend Security (XSS, auth handling, state management)

**Reviewed by:** Max (agent)
**Date:** 2026-05-02
**Files reviewed:** `sanitize.ts`, `TextWidget.tsx`, `AuthContext.tsx`, `api.ts`, `DashboardViewer.tsx`, `WidgetRenderer.tsx`, `UPlotChart.tsx`, `MQLEditor.tsx`, `DashboardEditor.tsx`, `DisplaySection.tsx`, all Zustand stores, type files. Codebase-wide greps for `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function`, `as any`, `@ts-ignore`, `rehypeRaw`, `document.cookie`, `localStorage`.

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| FE-001 | **P0** | `DataLinkMenu.tsx:50-55` | **XSS: Data link URLs rendered as `<a href>` without `isSafeHref()` validation.** User-defined data link templates are interpolated and rendered directly. Attacker with dashboard edit access can inject `javascript:alert(document.cookie)`. | Apply `isSafeHref()` on interpolated href before rendering. Fall back to `<span>` for unsafe URLs. |
| FE-002 | **P0** | `services/api.ts:61-97` | **No global 401 handler.** Session expiry returns 401, but `request()` throws generic Error. No redirect to `/login`. User sees broken pages with "API 401" error strings. | Add 401 interceptor in `request()` that clears auth state and redirects to `/login`. |
| FE-003 | **P1** | `hooks/useRecentDashboards.ts` | **Cross-tenant data leak via localStorage.** Recent dashboards stored in single `neoguard_recent_dashboards` key — no tenant scoping. Dashboard names from tenant A visible after switching to tenant B. | Scope key by tenant ID: `neoguard_recent_dashboards_${tenantId}`. |
| FE-004 | **P1** | `DashboardEditor.tsx:168-188` | **Clipboard paste accepts arbitrary JSON.** `pastePanelFromClipboard` only checks `panel_type` and `title` exist. Malicious JSON can inject XSS via `display_options.dataLinks` (chains with FE-001). | Validate pasted JSON against PanelDefinition schema. Sanitize dataLinks URLs. |
| FE-005 | **P1** | `AuthContext.tsx:42-56` | **No distinction between "session invalid" and "server down."** Both show login page. User with valid session sees login page when backend is temporarily unreachable. | Differentiate 401 (show login) from network/5xx (show "server unreachable" with retry). |
| FE-006 | **P1** | `DashboardEditor.tsx:80-93` | **No save-in-progress guard.** Double-clicks queue multiple PATCH requests. No optimistic locking — two tabs editing same dashboard, last write silently wins. | Add `saving` lock. Include `updated_at` in PATCH for conflict detection (409 on mismatch). |
| FE-007 | **P2** | `UPlotChart.tsx:309` | Single `as any` cast at uPlot/utility type boundary. Documented, narrow. | Consider typed wrapper to eliminate escape hatch. Low urgency. |
| FE-008 | **P2** | `DashboardViewer.tsx:38` | Double `as unknown as` cast for layout migration bypasses all type checking. | Type `migrateToLatest` to return `Dashboard` directly. |
| FE-009 | **P2** | Zustand stores | Global singletons with no tenant scoping. `hasUnsavedChanges`, crosshair state persist across tenant switches. | Reset stores on tenant switch. |
| FE-010 | **P2** | `DashboardEditor.tsx:163-165` | localStorage clipboard fallback always written (not just on clipboard API failure). Panel JSON with metric names persists unencrypted indefinitely. | Only write to localStorage in catch block. |
| FE-011 | **P2** | `UPlotChart.tsx:510-536` | Chart recreated on 20+ dependencies. Many could use `setData()`/`setSeries()` instead. 31 panels = visible flicker on minor option changes. | Separate structural from data dependencies. |
| FE-012 | **P2** | `hooks/useLiveStream.ts:112` | Inline `onMessage` callback creates new reference every render, causing SSE disconnect/reconnect churn. | Use ref for callback, or consumer wraps in `useCallback`. |
| FE-013 | **P3** | Auth pages | `as unknown as number` casts for CSS fontWeight. Harmless but type-incorrect. | Move to SCSS per ADR-0005. |

**Strengths noted:** Zero `dangerouslySetInnerHTML`, zero `eval()`, zero `@ts-ignore`. `react-markdown` used WITHOUT `rehypeRaw` (safe default). `isSafeHref()` well-implemented. Session cookies never accessed by frontend. CSRF double-submit pattern correct.

**Summary:** 2 P0, 4 P1, 6 P2, 1 P3. DataLinkMenu XSS (FE-001) is the most critical — it's a real exploitable vector for anyone with dashboard edit access.

---

## Summary Statistics

| Severity | Total | Fixed | Deferred/Closed | Open (Phase C) |
|----------|-------|-------|-----------------|----------------|
| P0 | 22 | **22** | 0 | 0 |
| P1 | 54 | **49** | 5 | 0 |
| P2 | 43 | **24** | 6 | 13 |
| P3 | 10 | **1** | 1 | 8 |
| **Total** | **129** | **96** | **12** | **21** |

> **Note (2026-05-12 reconciliation):** Original "Updated Summary Statistics" at end of file reported P2=39. Recount yields P2=43 (modules 6-10 contribute 22, not 18). P1 original was 54 but recount of module tables gives 53 + FE2-004(struck-through P1) = 54. Total findings = 22+54+43+10 = 129. +2 from CLOUD-006b/CLOUD-008b (P3 follow-ups added during C5 close). COLL-008 fixed in C4a. FE2-010 Won't Fix in C6b (subtree load-bearing).

### P0 Fixes Applied (Phase A, 2026-05-02)
| ID | Fix |
|----|-----|
| INFRA-001 | `alembic.ini` port fixed to 5433 + `alembic/env.py` reads env vars |
| INFRA-002 | `db_password` default removed; fails in prod if unset (dev defaults via `NEOGUARD_DEBUG=true`) |
| INFRA-003 | `session_secret` default removed; fails in prod if unset; rejects "change-me-in-production" |
| SEC-001 | `FORCE ROW LEVEL SECURITY` on all 18 RLS-enabled tables (migration 004) |
| SEC-002 | `key_prefix` index added; Argon2id lookup narrowed from O(n) to O(1) |
| SEC-003 | Password reset atomic: single `UPDATE ... WHERE used_at IS NULL RETURNING user_id` |
| DASH-001 | `dashboard_versions` table in migration 004 |
| DASH-002 | `annotations` table in migration 004 |
| DASH-003 | `dashboards.variables/groups/links` columns in migration 004 |
| DASH-004 | `dashboard_favorites.user_id` FK type fixed (TEXT→UUID) in migration 004 |
| DASH-007 | `DashboardUpdate` constraints mirrored from `DashboardCreate` |
| DASH-008 | `PanelDefinition` fields bounded with `max_length` |
| DASH-009 | Panel ID uniqueness validator on `DashboardCreate` |
| DASH-010 | `limit`/`offset` parameterized in dashboards + annotations services |
| DASH-015 | `DashboardLink.url` validator now returns normalized value |
| MQL-001 | Tag keys fully parameterized via `tags->>($N)` |
| MQL-002 | Frontend/backend grammar synced: STRING, VARIABLE, FLOAT, p50/p95/p99 added to backend |
| MQL-003 | `bucket_sql` parameterized: `time_bucket($N * interval '1 second', ...)` |
| FE-001 | `isSafeHref()` applied to DataLinkMenu; unsafe URLs render as inert `<span>` |
| FE-002 | Global 401 handler redirects to `/login` (skips auth endpoints) |
| NOTIF-001 | `LIMIT $N OFFSET $N+1` parameterized in `notifications/crud.py:56,62` |
| NOTIF-002 | `safe_ips` pinned via `create_pinned_session()` in all 6 HTTP senders — DNS rebinding prevented |
| COLL-001 | Feature flags endpoint gated with `require_scope("admin")` at `system.py:97` |
| COLL-002 | Feature flags fail-closed on Redis error for experimental behavior flags (`feature_flags.py:44-75`) |
| CLOUD-001 | Partial: plaintext secret popped from `_secret_cache` after credential creation (`credentials.py:34`); TTL-limited cache. Full encrypted store NOT implemented — `ClientSecretCredential` still holds secret internally. Accepted: OS-level memory isolation is sufficient for single-process demo; encrypted store deferred to cloud |
| FE2-001 | (Attribution correction: actually fixed in Phase B5 — see B5 fix table. Listed here for P0 completeness) |

### P1 Fixes Applied (Phase A, 2026-05-02)
| ID | Fix |
|----|-----|
| INFRA-005/006/007 | dashboard_versions, annotations, dashboards columns — all in migration 004 |
| INFRA-008 | `alembic/env.py` now reads `NEOGUARD_DB_*` env vars |
| INFRA-009/010 | URL validator: expanded blocked hosts, added `_normalize_ip_hostname()`, returns `(url, ips)` tuple for DNS rebinding prevention |
| INFRA-011 | asyncpg `statement_cache_size=0` — eliminates stale prepared statement bug |
| SEC-005 | `secure=False` → `secure=settings.cookie_secure` on all 9 set_cookie calls |
| SEC-006 | `extract_client_ip()` defaults to `request.client.host`; X-Forwarded-For only trusted when `NEOGUARD_TRUST_PROXY_HEADERS=true` |
| MQL-005 | Cache key sentinel changed from `__global__` to `\x00__platform__` |
| MQL-008 | Query timeout: `asyncio.wait_for(..., timeout=30.0)` on SQL execution |
| MQL-010 | Cache key hash extended from 64 bits to 128 bits (P2 fix) |
| DASH-005 | PATCH dashboard uses single transaction (save_version + update in same conn) |
| DASH-006 | `/import` now accepts typed `DashboardCreate` model (not raw dict) |
| FE-003 | localStorage recent dashboards scoped by tenant ID |
| FE-004 | Clipboard paste validates against allowed panel keys + sanitizes dataLink URLs |
| FE-005 | AuthContext distinguishes 401 (show login) from network/5xx (show "Server unreachable" + retry) |
| FE-006 | Save button disabled during PATCH, `saving` guard prevents double-click |
| SEC-004 | Bootstrap token usage now audit-logged (path, method, IP) |
| SEC-007 | Password reset confirm rate-limited (5/15min/IP) |
| DASH-013 | Version service `list_versions`/`get_version`/`count_versions` now accept and enforce tenant_id via JOIN |
| DASH-014 | Search: FTS for normal text, ILIKE only for short queries (<3 chars); LIKE wildcards properly escaped |
| MQL-006 | Removed no-op content-length check (runs after body already parsed) |

### P2 Fixes Applied (Phase A, 2026-05-02)
| ID | Fix |
|----|-----|
| SEC-009 | `auth_enabled=False` now blocked in production mode (requires `debug=True`) |
| SEC-011 | `get_user_by_email` uses explicit column list; `get_user_by_id` excludes `password_hash`; `authenticate_user` strips hash before returning |
| SEC-012 | `/auth/logout` added to CSRF exempt paths |
| INFRA-012 | CORS restricted to specific methods and headers (was `*`) |
| INFRA-013 | `db_port` default changed to 5433 in `config.py` |
| MQL-009 | Wildcard LIKE in MQL compiler now escapes `%` and `_` in non-wildcard portions |
| MQL-011 | `moving_average` window capped at 1000; rollup seconds capped at 86400 |
| MQL-012 | `interval` field validated against allowed values (`raw`, `1m`, `5m`, `15m`, `1h`, `6h`, `1d`) |
| MQL-013 | Streaming batch internal errors no longer leak exception strings |
| FE-009 | Zustand stores reset on tenant switch |
| FE-010 | localStorage clipboard write moved to catch block (fallback only) |
| FE-012 | useLiveStream onMessage callback stabilized via useRef |
| COLL-011 | System stats endpoint gated with `require_scope("admin")` at `system.py:23`. Fixed in same phase as COLL-001, applying the same admin-scope pattern to a different endpoint (stats at :23 vs feature-flags at :97) |

### P3 Fixes Applied (Phase A, 2026-05-02)
| ID | Fix |
|----|-----|
| SEC-013 | Password complexity: requires uppercase + lowercase + digit (SignupRequest, PasswordResetConfirm, ProfileUpdate, AdminCreateUserRequest) |

### Phase B5 Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| FE2-001 | Variable values validated against `SAFE_MQL_VALUE = /^[a-zA-Z0-9_\-.*/:]+$/` before MQL substitution | `useBatchPanelQueries.ts:34-37,52` |
| FE2-002 | Alert acknowledgment uses actual user email from AuthContext (not hardcoded "admin") | `AlertsPage.tsx:202` |
| FE2-003 | 401 redirect skipped when already on /login (infinite loop prevention) | `api.ts:108-109` |
| FE2-005 | Removed dead `|| true` in useVisiblePanels — text panels now properly excluded | `useVisiblePanels.ts:35` |
| FE2-006 | Stable variable serialization via sorted keys prevents spurious refetches | `useBatchPanelQueries.ts:96` |

### Phase B2 Fixes Applied (2026-05-12)
| ID | Fix |
|----|-----|
| NOTIF-003 | SMTP host validated against SSRF at creation time (`validate_outbound_host`) + send-time defense-in-depth in `_send_email` |
| NOTIF-004 | Blocked headers (Host, Authorization, Transfer-Encoding, etc.) rejected at channel creation with explicit error; stripped silently at send time for legacy configs |
| NOTIF-005 | `list_all` route changed from `get_tenant_id` to `get_query_tenant_id` — super admin scoped to session tenant by default, explicit `?tenant_id=X` for cross-tenant |
| NOTIF-006 | PagerDuty `test_connection()` uses `/v2/change/enqueue` (Change Events API, non-paging); Freshdesk `test_connection()` already existed (GET /api/v2/tickets?per_page=1) |

### Phase B4 Fixes Applied (2026-05-12)
| ID | Fix |
|----|-----|
| CLOUD-002 | Azure credential + mgmt client cache keys now include NeoGuard `tenant_id` — prevents cross-tenant cache sharing |
| CLOUD-003 | AWS SESSION_TTL reduced from 3500→3300 (55 min); configurable via `settings.aws_session_ttl` |
| CLOUD-004 | All 20 AWS paginator calls now use `PaginationConfig={"MaxItems": 5000}` — prevents unbounded enumeration |
| CLOUD-005 | Azure VM status defaults to `UNKNOWN` (not `ACTIVE`) when instance_view API call fails |

### Phase B1 Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| ALERT-001 | Rule fetch bounded: `ORDER BY tenant_id, created_at LIMIT $1` with `settings.alert_max_rules_per_cycle` | `engine.py:190-193` |
| ALERT-002 | `_ALLOWED_UPDATE_FIELDS` frozenset whitelist; unknown fields skipped | `crud.py:76-100` |
| ALERT-003 | `asyncio.wait_for(..., timeout=settings.alert_rule_eval_timeout_sec)` wraps metric query | `engine.py:328-331` |
| ALERT-004 | Composite key `f"{tenant_id}:{rule_id}"` for in-memory state dict | `engine.py:292` (runtime), `engine.py:472` (transition), `engine.py:124` (restore from DB) |
| ALERT-005 | Batch-fetch all active silences once per `_evaluate_all` cycle; passed to `_evaluate_rule` | `engine.py:196-216` |
| ALERT-006 | `breach_eval_count` + `settings.alert_strict_duration_check` feature flag (default OFF) | `engine.py:369-389, 710-730` |
| ALERT-007 | Timezone fallback changed from `Asia/Kolkata` to `UTC`; invalid timezone logged as warning | `silences.py:181,185` |
| ALERT-008 | `_PREVIEW_ROW_LIMIT = 100000` applied to preview query; truncation detected and reported | `crud.py:226,235,240` |

### Phase B3 Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| COLL-003 | Buffer cap: `metric_buffer_max_size` setting + backpressure when retry in progress AND buffer full | `writer.py:63-66`, `config.py:71` |
| COLL-004 | Retry with exponential backoff (3 attempts); `_flush_retries_total`, `_flush_retries_exhausted` counters; backpressure when retry active + buffer full | `writer.py:95-136` |
| COLL-005 | SSE connection caps: `_active_sse_connections` global + `_tenant_sse_connections` per-tenant dict; 503 rejection when exceeded; cleanup in finally block | `sse.py:38-39, 84-96, 144-149` |
| COLL-006 | `asyncio.Semaphore(settings.discovery_max_concurrency)` + `asyncio.gather(*tasks)` for AWS and Azure discovery | `orchestrator.py:235,241,291,297` |
| COLL-007 | Single `conn.executemany()` call replaces N+1 individual INSERTs for cardinality observations | `cardinality.py:86,104` |

### Phase C1a Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| ALERT-013 | Sliding window flapping: `transition_times` deque replaces simple counter; timestamps pruned outside `alert_flap_window_sec` | `engine.py:7` (import), `engine.py:458-464` (window logic), `engine.py:712,722,731` (`_RuleState` slot+init) |
| NOTIF-011 | Severity maps extracted as public module constants (`FRESHDESK_SEVERITY_MAP`, `PAGERDUTY_SEVERITY_MAP`) importable from senders | `senders.py:30-41` (maps), `senders.py:467` (usage) |
| COLL-014 | `get_orchestrator()` factory function with lazy singleton init; backward-compat `orchestrator` variable preserved | `orchestrator.py:442-453` |
| CLOUD-010 | Removed `if region != account.regions[0]: return 0` guard — S3 discovery runs for any region | `aws_discovery.py:737-739` |

### Phase C1b Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| DASH-011 | Removed dead `record_view()` function and its 3 tests — never called from any route | `dashboards.py` (function removed), `test_dashboard_extensions.py` (TestRecordView class removed) |
| DASH-016 | `DashboardSummary` model + `_row_to_summary()` for list endpoint — skips Pydantic construction of panels/variables/groups/links, returns `panel_count` integer | `models/dashboards.py:168-179`, `services/dashboards.py:185-205`, route `dashboards.py:97` |
| FE-013 | Replaced `fontWeight: "var(--)" as unknown as number` casts with numeric literals (700, 600) | `ForgotPasswordPage.tsx:114,164`, `ResetPasswordPage.tsx:145,189` |

### Phase C2 Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| ALERT-009 | Invalid tag keys now log warning (`"Invalid tag key skipped in alert rule — query broadened"`) before skipping — no longer silent | `engine.py:323-327` |
| ALERT-010 | Extracted `_fire_event(rule, *, value, status, message)` shared helper; `_fire_alert` and `_fire_nodata_alert` are now thin wrappers that construct the message and delegate | `engine.py:496-515` (wrappers), `engine.py:517-584` (shared helper) |
| ALERT-011 | `crud.py._check_condition` now delegates to `CONDITION_OPS` from engine (2-line function replaces 13-line if-chain) | `crud.py:7` (import), `crud.py:308-309` (delegating function) |
| ALERT-012 | `NotificationConfig` Pydantic model (with `channel_ids: list[str]`) replaces bare `dict` on `AlertRuleCreate`, `AlertRuleUpdate`, and `AlertRule` notification fields | `models/alerts.py:120-122` (model), `models/alerts.py:134,151,170` (field types), `crud.py:36,105` (serialization) |

### Phase C3 Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| NOTIF-007 | Won't fix — premature abstraction. **Counter-example**: a hypothetical `_http_send(url, *, method="POST", session_type: Literal["pinned","bare"], auth: aiohttp.BasicAuth|None, body: bytes|dict, content_type: str|None, headers: dict|None, timeout: ClientTimeout, response_parser: Callable|None, extra_validation: Callable|None) -> dict` would need 10 parameters. Call-site wrapping: Webhook (8 lines: HMAC signing + header merge), Slack (6 lines: custom "ok" body check), Email (doesn't use HTTP at all — excluded), Freshdesk firing (10 lines: JSON parse + ticket_id extraction), Freshdesk resolved (excluded — 2 sequential requests), PagerDuty (4 lines: JSON parse + dedup_key), MSTeams (2 lines: straightforward). 4 of 6 senders need multi-line wrappers; Email is excluded entirely. Net: helper saves ~15 lines per sender but adds 10-param function + per-sender wrapper = net complexity increase. Existing shared infra (`_retry`, `_check_response`, `create_pinned_session`) already captures the genuinely common logic. **Re-open if**: a 7th sender is added, OR a cross-cutting change (e.g., universal timeout/retry update) requires touching all 6 senders simultaneously. | Analysis + counter-example sketch |
| NOTIF-008 | `email` added to `_REQUIRED_CONFIG_KEYS["freshdesk"]`; email format validation added in `validate_channel_config`; fake default removed from `FreshdeskSender.send_firing` | `models/notifications.py:18` (required key), `models/notifications.py:48-53` (format check), `senders.py:342` (no default) |
| NOTIF-009 | `group_id` numeric validation added in `validate_channel_config`; belt-and-suspenders try/except in sender | `models/notifications.py:54-59` (validation), `senders.py:372-375` (defensive guard) |
| NOTIF-010 | Won't fix — premature abstraction. **Counter-example**: unified `async def _dispatch(payload, config, action: Literal["firing","resolved"])` body: `channels = await list_enabled_channels(...)` [shared]; `if not channels:` → `if action == "firing": await log.awarn(...)` [branch 1]; `if action == "resolved": firing_meta = await _load_notification_meta(...)` [branch 2]; loop: `if action == "firing": meta = await sender.send_firing(payload, ch.config)` else `await sender.send_resolved(payload, ch.config, ch_meta)` [branch 3]; `if action == "firing": all_meta[ch.id] = {...}` else pass [branch 4]; `if action == "firing": await _store_notification_meta(...)` [branch 5]. Result: 5 `if action` branches in a 40-line function — every other line is a conditional. The two functions share only the channel lookup and loop structure (~8 lines). Net: merging saves 8 lines, adds 5 branches + `action` parameter threading. **Re-open if**: a 3rd dispatch function is added (e.g., `dispatch_acknowledged` or `dispatch_escalated`). | Analysis + counter-example pseudocode |

### Phase C4a Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| COLL-008 | MetricsRegistry now enforces `max_metrics` cap (default 10,000). Design: (a) at cap, new registrations return no-op objects (`_NoOpCounter`/`_NoOpGauge`/`_NoOpHistogram`) that discard writes silently; (b) `_cap_rejections` int tracks overflow count; (c) ops detects via `registry._cap_rejections > 0` in snapshot or health check; (d) cap is per-registry (global singleton). Existing series continue working. No-op objects implement full interface (inc/get/reset/observe/set/dec/percentiles/count/sum) returning zero values. | `core/telemetry.py:109-165` (no-op classes), `telemetry.py:170-172` (max_metrics + cap_rejections fields), `telemetry.py:174-176` (_total_series helper), `telemetry.py:178-210` (cap checks in counter/gauge/histogram) |
| COLL-009 | Won't fix — premature abstraction. **Analysis**: AWS `discover_all` (12 lines) and Azure `discover_all` (13 lines) share ~10 lines of loop structure. Differences: (1) input types (`AWSAccount` vs `AzureSubscription`), (2) AWS has extra `_warn_if_near_cap()` call, (3) different log messages. A shared helper would require: new shared module, union type `AWSAccount | AzureSubscription`, optional `warn_fn` parameter, type: ignore annotations. Net: saves 8 lines, adds new import dependency + type complexity. **Re-open if**: a 3rd cloud provider (GCP) discovery is added. | Analysis documented in C4a pre-analysis |

### Phase C4b Fixes Applied (2026-05-12)
| ID | Fix | Evidence |
|----|-----|----------|
| COLL-010 | Added in-process dict cache with 5s monotonic TTL to `is_enabled()`. Cache lookup before Redis; on hit within TTL, returns cached value (0 Redis ops). `set_flag()` invalidates cache entry. Thread-safe: single async event loop, no concurrent mutation. **Note:** The production code also contains a Phase A fix (FF-002) that changed `DEFAULTS.get(key, True)` → `DEFAULTS.get(key, False)` for unknown flags, plus `_FAIL_CLOSED_FLAGS` logic for MQL_SINGLEFLIGHT. These behavioral changes predate COLL-010 (committed in singleflight feature, corrected by Phase A P0 fix). COLL-010 added only the cache; the fail-closed semantics were pre-existing. Reverting COLL-010 cache requires preserving the `DEFAULTS.get(key, False)` default and `_FAIL_CLOSED_FLAGS` logic. | `feature_flags.py:21-22` (cache + TTL constant), `feature_flags.py:70-75` (cache check), `feature_flags.py:85` (cache write), `feature_flags.py:100` (invalidation on set) |
| COLL-012 | Replaced `structlog.PrintLoggerFactory()` with `structlog.WriteLoggerFactory(file=sys.stdout)`. WriteLoggerFactory omits the per-line `flush()` call that PrintLoggerFactory makes. Trade-off: slightly reduced event loop blocking, but crash may lose unflushed recent logs (OS buffers typically 4KB). | `core/logging.py:1` (import sys), `core/logging.py:18` (WriteLoggerFactory) |
| COLL-013 | Added `sse_heartbeat_sec: int = 15` and `sse_max_duration_sec: int = 1800` to settings. SSE handler reads `settings.sse_heartbeat_sec` and `settings.sse_max_duration_sec` directly at request time (not cached at import). Configurable via env vars `NEOGUARD_SSE_HEARTBEAT_SEC` / `NEOGUARD_SSE_MAX_DURATION_SEC`. | `core/config.py:68-69` (settings fields), `api/routes/sse.py:120,140` (reads settings in handler) |

### Finding Disposition (29 open for Phase C, 11 deferred/closed)
| ID | Severity | Status | Phase C Disposition |
|----|----------|--------|---------------------|
| INFRA-004 | P1 | Deferred — azure client_secret plaintext requires secrets manager (cloud) | Out of scope (cloud infra) |
| SEC-008 | P1 | By design — session_secret is startup config requirement, not HMAC key; sessions use 256-bit random IDs + Redis server-side storage | Closed (by design) |
| SEC-010 | P2 | Accepted as designed. Stale session index TTL is benign; cleaned on read | Closed (accepted) |
| MQL-004 | P1 | Deferred — super admin MQL cross-tenant data merge; requires tenant_id param enforcement (design decision) | Out of scope (design decision) |
| MQL-007 | P1 | Deferred — variable substitution 4-pass string pipeline; would require AST-level substitution redesign | Out of scope (architectural) |
| DASH-011 | P2 | Dead code — `record_view()` never called | **Fixed (C1b)** |
| DASH-012 | P2 | Deferred to cloud deployment phase. Requires migration planning. Dead `dashboard_tags` table | Closed (deferred to cloud) |
| DASH-016 | P3 | `_row_to_dashboard` 5x JSON parse per row on list endpoint | **Fixed (C1b)** |
| FE-007 | P2 | Remain closed per Phase B classification as Low/No-Action. Not reopened | Closed (Low/No-Action) |
| FE-008 | P2 | Remain closed per Phase B classification as Low/No-Action. Not reopened | Closed (Low/No-Action) |
| FE-011 | P2 | UPlotChart rebuild on 20+ deps; perf optimization, not bug | Closed (Low/No-Action) |
| FE-013 | P3 | CSS fontWeight type casts in auth pages | **Fixed (C1b)** |
| ALERT-009 | P2 | Invalid tag keys silently skipped (broadens query) | **Fixed (C2)** |
| ALERT-010 | P2 | DRY: `_fire_alert` / `_fire_nodata_alert` 85% identical | **Fixed (C2)** |
| ALERT-011 | P2 | DRY: `CONDITION_OPS` duplicated in engine + crud | **Fixed (C2)** |
| ALERT-012 | P2 | `notification: dict` untyped — no schema validation | **Fixed (C2)** |
| ALERT-013 | P3 | Flapping uses simple counter, not sliding window — edge evasion possible | **Fixed (C1a)** |
| NOTIF-007 | P2 | DRY: 6 HTTP senders duplicate pattern (~70 lines each) | **Won't fix (C3) — premature abstraction** |
| NOTIF-008 | P2 | Freshdesk requester_email defaults to fake internal address | **Fixed (C3)** |
| NOTIF-009 | P2 | Freshdesk group_id `int()` conversion unguarded | **Fixed (C3)** |
| NOTIF-010 | P2 | DRY: `dispatch_firing` / `dispatch_resolved` 80% identical | **Won't fix (C3) — premature abstraction** |
| NOTIF-011 | P3 | Hardcoded severity/status maps not configurable | **Fixed (C1a)** |
| COLL-008 | P1 | Unbounded metric cardinality in MetricsRegistry (no size limit on counter/gauge/histogram dicts). Classified as P1 in original review, omitted from initial Phase C scope in error, reopened for Phase C per 2026-05-12 planning session | **Fixed (C4a)** |
| COLL-009 | P2 | DRY: AWS + Azure discovery loops structurally identical (~140 lines each) | **Won't fix (C4a) — premature abstraction** |
| COLL-010 | P2 | Feature flags: Redis call on every check, no local cache | **Fixed (C4b)** |
| COLL-012 | P2 | Synchronous `PrintLoggerFactory` blocks event loop under load | **Fixed (C4b)** |
| COLL-013 | P2 | SSE heartbeat/duration hardcoded, not configurable | **Fixed (C4b)** |
| COLL-014 | P3 | Module-level singleton `orchestrator = CollectionOrchestrator()` prevents testing | **Fixed (C1a)** |
| CLOUD-006 | P2 | AWS credentials: no error handling, no circuit breaker on STS assume-role | **Fixed (C5)** |
| CLOUD-007 | P2 | Generic `except Exception` in discoverers loses error classification | **Fixed (C5)** |
| CLOUD-008 | P2 | Azure `ClientSecretCredential` creation unvalidated | **Fixed (C5)** |
| CLOUD-009 | P2 | N+1 resource query per (account, region) pair | **Fixed (C5)** |
| CLOUD-010 | P3 | S3 discovery only in first region — skipped if first region is disabled | **Fixed (C1a)** |
| FE2-007 | P2 | AlertsPage fetches 500 events every 15s with no incremental/since param (requires backend change) | **Fixed (C6a)** |
| FE2-008 | P2 | `filteredEvents` recalculated every render without `useMemo` | **Fixed (C6a)** |
| FE2-009 | P2 | Facet values use `title` attribute instead of `aria-label` | **Fixed (C6a)** |
| FE2-010 | P2 | MutationObserver `subtree: true` overkill — fires on any DOM change | **Won't fix (C6b) — subtree load-bearing for groups** |
| FE2-011 | P2 | No AbortController timeout on fetch requests — hung requests block indefinitely | **Fixed (C6a)** |
| FE2-012 | P3 | AlertDetailPage test coverage insufficient (6 tests). Deferred to post-Phase-C test debt initiative. 200+ LOC of new tests exceeds P3 warm-up scope | Deferred (test debt) |
| FE2-004 | ~~P1~~ | Won't Fix. React `title` attribute escapes values. No XSS vector | Closed (won't fix) |

---

## Module 6: Alert Engine (engine, CRUD, silences, state machine)

**Reviewed by:** Max (direct)
**Date:** 2026-05-12
**Files reviewed:** `services/alerts/engine.py`, `services/alerts/crud.py`, `services/alerts/silences.py`, `models/alerts.py`, `api/routes/alerts.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| ALERT-001 | **P0** | `engine.py:183-184` | **No tenant filtering on rule fetch.** `SELECT * FROM alert_rules WHERE enabled = TRUE` evaluates ALL tenants' rules on every 15s cycle. Single-worker model means all tenants' alerts evaluated by same process. Not a security leak (notifications go to tenant's channels), but a correctness risk: if rule references a metric_name shared across tenants, the WHERE includes `tenant_id` in the per-rule query (line 286). However the initial list fetch is unbounded — with 10K rules this becomes O(n) per cycle. | Add `ORDER BY tenant_id, created_at` and consider chunking evaluation by tenant. Add configurable `max_rules_per_cycle` limit. |
| ALERT-002 | **P0** | `crud.py:104` | **Dynamic SQL field names from user input.** `update_alert_rule` builds `SET {field} = ${idx}` from `data.model_dump()` keys. While Pydantic restricts fields, the `# noqa: S608` suppresses bandit's SQL injection warning. If any model field name contains special characters (unlikely with Pydantic but fragile), this is injectable. | Whitelist allowed field names explicitly: `ALLOWED_UPDATE_FIELDS = {"name", "description", ...}`. |
| ALERT-003 | **P1** | `engine.py:164-178` | **No eval loop timeout.** Single rule evaluation has no timeout. If DB query hangs (network partition, lock contention), the entire alert engine stalls. All rules stop evaluating. | Wrap `_evaluate_rule` in `asyncio.wait_for(..., timeout=30.0)`. |
| ALERT-004 | **P1** | `engine.py:53-54` | **In-memory state not tenant-scoped.** `_rule_states` dict keyed by `rule_id` alone. If two tenants have rules with colliding IDs (ULIDs are unique, but if migrated data has duplicates), state would collide. Minor risk given ULID uniqueness, but defense-in-depth says use `(tenant_id, rule_id)` tuple. | Use composite key: `f"{tenant_id}:{rule_id}"` for state dict. |
| ALERT-005 | **P1** | `silences.py:128-137` | **Full table scan on every rule evaluation.** `is_rule_silenced` fetches ALL active silences for a tenant on every eval cycle for every rule. 100 rules × 50 silences = 5,000 rows fetched per 15s cycle. | Cache active silences per tenant per eval cycle. Fetch once per `_evaluate_all`, pass to `_evaluate_rule`. |
| ALERT-006 | **P1** | `engine.py:326` | **Pending→Firing transition uses wall clock diff.** `(now - state.entered_at).total_seconds() >= rule["duration_sec"]` depends on eval loop timing. If loop is delayed (e.g., by 30s backlog), a rule with `duration_sec=5` fires after first successful re-check regardless of actual breach duration. | Track breach start time separately from state entry time. Verify breach persistence across multiple eval cycles. |
| | | | **Resolution (B1):** Added `settings.alert_strict_duration_check` feature flag (default OFF). When ON, requires `breach_eval_count >= max(2, ceil(duration_sec / eval_interval))` confirming evaluations before firing. `breach_eval_count` is **in-memory only** (not persisted to `alert_rule_states` table). On service restart during a sustained breach, it resets to 0 and the rule needs `required_evals` more confirming cycles before firing. Accepted tradeoff for default-off feature flag. | |
| ALERT-007 | **P1** | `silences.py:182` | **Timezone fallback to Asia/Kolkata.** If timezone string is invalid, silently defaults to `Asia/Kolkata` instead of UTC. Production rule silences in UTC systems would fire at wrong times. | Default to UTC. Log warning on invalid timezone. |
| ALERT-008 | **P1** | `crud.py:193-225` | **Alert preview has no time bounds.** `preview_alert_rule` fetches raw metrics from `lookback_start` to `now` with no LIMIT. With 24h lookback and 1-second resolution metric, this could return 86,400 rows. | Add `LIMIT 100000` and warn user if truncated. |
| ALERT-009 | **P2** | `engine.py:291-294` | **Tag key validation discards invalid keys silently.** `if not _SAFE_TAG_KEY.match(k)` → `continue`. Attacker-crafted tag filter key is silently ignored, potentially broadening the query. | Raise/log warning instead of skipping. The rule should have been validated at creation time. |
| ALERT-010 | **P2** | `engine.py:416-488` | **DRY: `_fire_alert` and `_fire_nodata_alert` are 85% identical.** Same event insert, same notification dispatch, same flapping check. Only differs in status string and message. | Extract `_fire_event(rule, value, status, message)` shared helper. |
| ALERT-011 | **P2** | `crud.py:288-301,304-323` | **DRY: `_check_condition` duplicates `CONDITION_OPS` from engine.py.** Same 6 condition comparisons implemented twice — once as lambdas (engine), once as if-chain (crud). | Import `CONDITION_OPS` from engine or extract to shared module. |
| ALERT-012 | **P2** | `models/alerts.py:130` | **`notification: dict` is untyped.** No schema validation for notification config. Could contain arbitrary webhook URLs without SSRF check at rule creation time. | Define `NotificationConfig` Pydantic model with channel_ids list validation. |
| ALERT-013 | **P3** | `engine.py:374-386` | **Flapping detection resets on window expiry.** If transitions are 1 per window boundary, counter resets every window and never reaches threshold. Rapid oscillation at window edges evades detection. | Use sliding window (deque of transition timestamps) instead of simple counter. |

**Summary:** 2 P0, 7 P1, 4 P2, 1 P3. The unbounded rule fetch and dynamic SQL field names are the most critical. Performance concerns (silence full scan, no eval timeout) are reliability blockers.

---

## Module 7: Notification System (dispatcher, senders, CRUD, routes)

**Reviewed by:** Max (direct)
**Date:** 2026-05-12
**Files reviewed:** `services/notifications/dispatcher.py`, `services/notifications/senders.py`, `services/notifications/crud.py`, `models/notifications.py`, `api/routes/notifications.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| NOTIF-001 | **P0** | `crud.py:56,61` | **SQL injection via limit/offset f-string interpolation.** `LIMIT {limit} OFFSET {offset}` not parameterized. Although types are `int` (from FastAPI), defense-in-depth requires parameterized queries per convention. | Use `LIMIT $N OFFSET $N+1` parameters. |
| NOTIF-002 | **P0** | `senders.py:116,147,179,228,536,594` | **DNS rebinding: resolved IPs discarded.** `validate_outbound_url()` returns `(url, safe_ips)` but all 6 callers discard `safe_ips`: `url, _ = validate_outbound_url(...)`. aiohttp will re-resolve DNS, potentially hitting a rebinded internal IP. | Pass safe_ips to aiohttp via `TCPConnector(local_addr=...)` or use `trust_env=False` and pin resolved IPs. |
| NOTIF-003 | **P1** | `senders.py:672-699` | **SMTP host not validated for SSRF.** Email sender connects to user-provided `smtp_host` without `validate_outbound_url()` check. Attacker could configure channel with `smtp_host=169.254.169.254:25` to probe metadata service. | Add `validate_outbound_url(f"http://{smtp_host}")` check before SMTP connection. |
| NOTIF-004 | **P1** | `senders.py:117,148` | **Custom HTTP headers from user config not validated.** `headers = {**config.get("headers", {})}` allows setting `Host`, `Authorization`, or `X-Forwarded-For` headers. Could be used to bypass SSRF protections or impersonate other services. | Whitelist allowed custom headers. Block `Host`, `Authorization`, `Cookie`, `X-Forwarded-*`. |
| NOTIF-005 | **P1** | `crud.py:53-63` | **Super admin list_channels returns ALL tenants' channels.** When `tenant_id=None`, query has no tenant filter. Route uses `get_tenant_id` (which returns None for super admin). Notification channel configs contain secrets (API keys, webhook URLs). | Use `get_query_tenant_id` (falls back to session tenant) or require explicit `?tenant_id=X` for super admin. |
| NOTIF-006 | **P1** | `routes/notifications.py:133-143` | **Test notification payload has hardcoded fake values.** Test fires a real notification to external services (Slack, PagerDuty, etc.) with `event_id=""` and `rule_id="test"`. Could trigger PagerDuty incident or Freshdesk ticket in production. | Add `is_test: true` flag in payload. Senders should suppress side effects (no PagerDuty incident, no Freshdesk ticket) on test. |
| NOTIF-007 | **P2** | `senders.py:105-172,175-262,532-638` | **DRY: 6 senders duplicate HTTP pattern.** All follow: validate URL → build headers → build body → POST → check response. Extracting `_http_send(url, headers, body, timeout)` would reduce 6×70 lines to shared 50-line helper. | Extract `_http_send()` base helper. Keep sender-specific body builders. |
| NOTIF-008 | **P2** | `senders.py:319-320` | **Freshdesk requester_email defaults to internal address.** `config.get("requester_email", "neoguard@alerts.internal")` — if Freshdesk validates emails, this will fail. | Make required field with email format validation in `NotificationChannelCreate`. |
| NOTIF-009 | **P2** | `senders.py:350` | **Freshdesk group_id int conversion unguarded.** `int(config.get("group_id"))` throws `ValueError` if non-numeric string. | Wrap in try-except or validate at channel creation. |
| NOTIF-010 | **P2** | `dispatcher.py:23-62,65-95` | **DRY: `dispatch_firing` and `dispatch_resolved` are 80% identical.** Both iterate channels, instantiate sender, call method, store metadata. | Extract `_dispatch(payload, config, action: Literal["firing", "resolved"])`. |
| NOTIF-011 | **P3** | `senders.py:23-31` | **Hardcoded severity/status maps not configurable.** Freshdesk priority mapping, PagerDuty severity mapping, Slack colors all hardcoded. | Move to config or channel-level settings for customization. |

**Summary:** 2 P0, 4 P1, 4 P2, 1 P3. The DNS rebinding bypass (NOTIF-002) is the most critical — it undermines the entire SSRF defense.

---

## Module 8: Collection & Metrics Pipeline (orchestrator, writer, cardinality, SSE)

**Reviewed by:** Max (direct)
**Date:** 2026-05-12
**Files reviewed:** `services/collection/orchestrator.py`, `services/metrics/writer.py`, `services/metrics/cardinality.py`, `services/feature_flags.py`, `api/routes/sse.py`, `api/routes/system.py`, `core/telemetry.py`, `core/logging.py`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| COLL-001 | **P0** | `system.py:98` | **Feature flags endpoint has NO authentication.** `GET /api/v1/system/feature-flags` has no `Depends(require_scope(...))`. Any unauthenticated request can read all feature flag states. Exposes internal experiment configuration. | Add `dependencies=[Depends(require_scope("admin"))]`. |
| COLL-002 | **P0** | `feature_flags.py:55-60` | **Fail-open on Redis failure.** If Redis is unreachable, `is_enabled()` returns default value (which is `True` for most flags). This means Redis outage enables all experimental features including potentially unsafe ones (METRICS_CARDINALITY_DENYLIST, MQL_STREAMING_BATCH). | Fail-closed: return `False` on Redis error for any flag that gates new behavior. Only fail-open for flags that gate bug fixes. |
| COLL-003 | **P1** | `writer.py:65` | **Unbounded buffer growth.** `_buffer.append(row)` with no size cap. If flush fails repeatedly (DB down), buffer grows until OOM. 1M metric points × ~200 bytes = 200MB memory consumed. | Add `max_buffer_size` config. Drop oldest points or apply backpressure when limit reached. Log dropped count. |
| COLL-004 | **P1** | `writer.py:96-98` | **Data loss on flush failure with no retry or dead letter.** Failed COPY drops all buffered points silently (only logged). No retry, no persistent queue. If DB is down for 10 minutes at 10K points/sec, 6M data points are lost. | Implement retry with exponential backoff (3 attempts). After max retries, write to local WAL file for recovery. |
| COLL-005 | **P1** | `sse.py:57-131` | **No max concurrent SSE connections.** Each SSE connection holds an asyncio coroutine + response stream. 1000 malicious connections = 1000 coroutines with 15s heartbeats = DoS. | Add `_active_connections` counter with configurable max (e.g., 100). Reject with 503 when exceeded. |
| COLL-006 | **P1** | `orchestrator.py:233,268` | **Discovery fetches all accounts without tenant scoping.** `list_aws_accounts(None, ...)` and `list_azure_subscriptions(None, ...)` load ALL tenants' cloud credentials into single worker memory. | Iterate by tenant: `for tenant in get_active_tenants(): list_aws_accounts(tenant.id, ...)`. |
| COLL-007 | **P1** | `cardinality.py:86-103` | **N+1 INSERT in observe_cardinality.** Individual INSERT per tag key observation. With 500 unique tags, this is 500 round-trips to DB. | Use multi-row INSERT: `INSERT INTO ... VALUES ($1,$2,$3), ($4,$5,$6), ...` or COPY. |
| COLL-008 | **P1** | `telemetry.py:112-114` | **Unbounded metric cardinality.** `MetricsRegistry._counters`, `_gauges`, `_histograms` dicts have no size limit. Each unique (name, tags) combination creates a new entry. Careless metric registration can OOM the process. | Add `max_metrics: int = 10000` config. Reject new registrations after limit with warning log. |
| COLL-009 | **P2** | `orchestrator.py:226-263,265-297` | **DRY: AWS and Azure discovery loops are structurally identical.** Both: list accounts → iterate regions → run discovery → reconcile stale → mark synced. ~140 lines of near-duplicate code. | Extract `_run_provider_discovery(provider, list_fn, discover_fn, regions_fn)`. |
| COLL-010 | **P2** | `feature_flags.py:48-60` | **Redis call on every flag check — no local cache.** Each `is_enabled()` call hits Redis. 1000 req/s × 2 flag checks = 2000 Redis ops/s for feature flags alone. | Add in-process LRU cache with 5s TTL. Stale flags acceptable for this use case. |
| COLL-011 | **P2** | `system.py:24-96` | **System stats endpoint returns global metrics, not tenant-scoped.** Any authenticated user sees the same system-wide stats (DB pool size, process memory, alert engine state). Internal metrics exposed to regular users. | Move to admin-only or filter sensitive fields by role. |
| COLL-012 | **P2** | `logging.py:16` | **Synchronous PrintLoggerFactory.** `structlog.PrintLoggerFactory()` writes to stdout synchronously. Under high log volume, this blocks the event loop. | Use `structlog.WriteLoggerFactory(file=sys.stdout.buffer)` or async wrapper. |
| COLL-013 | **P2** | `sse.py:33-34` | **Hardcoded SSE timeouts not configurable.** `HEARTBEAT_INTERVAL = 15`, `MAX_DURATION = 30 * 60` — cannot adjust without code change. | Move to `settings.sse_heartbeat_sec` and `settings.sse_max_duration_sec`. |
| COLL-014 | **P3** | `orchestrator.py:405` | **Global singleton prevents testing.** `orchestrator = CollectionOrchestrator()` instantiated at module import. Cannot mock or replace in tests without monkeypatch. | Use dependency injection or factory function. |

**Summary:** 2 P0, 6 P1, 5 P2, 1 P3. The unauthenticated feature flags endpoint (COLL-001) and fail-open Redis behavior (COLL-002) are the most critical. The metrics writer data loss (COLL-004) is a reliability time bomb.

---

## Module 9: Cloud Credentials & Discovery (AWS, Azure)

**Reviewed by:** Max (direct)
**Date:** 2026-05-12
**Files reviewed:** `services/aws/credentials.py`, `services/azure/credentials.py`, `services/discovery/aws_discovery.py` (1845 lines), `services/discovery/azure_discovery.py` (669 lines)

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| CLOUD-001 | **P0** | `azure/credentials.py:54-58` | **Plaintext client secrets stored indefinitely in process memory.** `_secret_cache: dict[str, str] = {}` holds Azure service principal secrets with no TTL, no secure deletion, no encryption. Memory dump or `/proc/self/mem` read exposes all cached secrets. | Use encrypted in-memory store (e.g., `memoryview` with XOR masking) or integrate with OS keyring. At minimum, delete secrets after credential object creation. |
| CLOUD-002 | **P1** | `azure/credentials.py:20` | **Credential cache key lacks NeoGuard tenant_id.** `cache_key = f"{sub.subscription_id}:{sub.azure_tenant_id}:{sub.client_id}"`. If two NeoGuard tenants share the same Azure subscription (rare but possible in MSP scenarios), they share cached credentials. | Add NeoGuard `tenant_id` to cache key: `f"{neoguard_tenant_id}:{sub.subscription_id}:..."`. |
| CLOUD-003 | **P1** | `aws/credentials.py:17` | **Hardcoded session TTL with no clock skew tolerance.** `SESSION_TTL = 3500` (58m20s). If system clock drifts >100s ahead, expired tokens are reused. If clock drifts behind, tokens expire 100s early causing unnecessary re-auth. | Reduce to 3300 (55 min) for safety margin. Make configurable via `settings.aws_session_ttl`. |
| CLOUD-004 | **P1** | `aws_discovery.py:46,130,etc.` | **AWS API pagination without MaxItems.** Paginators enumerate all resources without limit. Account with 50K EC2 instances → 50K API calls → rate limiting → discovery timeout → all subsequent resources skipped. | Set `PaginationConfig={'MaxItems': 5000}` as safety cap. Log truncation warning. |
| CLOUD-005 | **P1** | `azure_discovery.py:87-94` | **Instance view error suppressed to ACTIVE.** `try: get_instance_view(); except: status = "active"`. Failed VM status queries (auth error, network timeout) report all VMs as ACTIVE. False negative in monitoring. | Default to "unknown" instead of "active". Log the error for investigation. |
| CLOUD-006 | **P2 ✅** | `aws/credentials.py:35-55,96-119` | **Fixed (C5).** `get_boto_session` catches `ClientError`/`EndpointConnectionError`/`NoCredentialsError` with structured logging (error_code, error_class). `get_enabled_regions` catches `ClientError`/`EndpointConnectionError`. All re-raise (no swallowing). Circuit breaker deferred — adaptive retries via `BotoConfig` sufficient for demo. | Tests: `test_phase_c5.py::TestCloud006AWSErrorHandling` (3 tests). |
| CLOUD-007 | **P2 ✅** | `aws_discovery.py:44-55,66-77` | **Fixed (C5).** `_classify_aws_error()` classifies into auth/throttle/connectivity/unknown. `discover_all()` uses `log.awarn` for throttle (non-critical), `log.aerror` for auth/connectivity/unknown. Structured fields: `error_class`, `error_code`. | Tests: `test_phase_c5.py::TestCloud007ErrorClassification` (5 tests). |
| CLOUD-008 | **P2 ✅** | `azure/credentials.py:27-42,46` | **Fixed (C5).** `get_credential()` wraps `ClientSecretCredential(...)` in `try-except (ValueError, TypeError)` → RuntimeError re-raise with structured log. Also clears `_secret_cache[sub.subscription_id]` after credential creation (minimizes secret exposure window). Eager `get_token()` validation skipped — deferred to first use (avoids network call on credential creation). | Tests: `test_phase_c5.py::TestCloud008AzureCredentialValidation` (3 tests). |
| CLOUD-009 | **P2 ✅** | `orchestrator.py:357-359` | **Fixed (C5).** `list_resources()` called once per account (above region loop), filtered by `res.region != region` in Python. 10 accounts × 1 query = 10 DB calls (was 10×9=90). **Behavioral note**: Same data returned, fewer DB round-trips. Revert hazard: reverting moves `list_resources()` back inside region loop — functionally identical but O(n×m) DB calls. | Tests: `test_phase_c5.py::TestCloud009ResourceQueryOptimization` (1 test). |
| CLOUD-006b | **P3** | `aws/credentials.py` | **Circuit breaker for sustained account failures not implemented.** Current behavior: failed account retries every discovery cycle indefinitely. BotoConfig adaptive retries handle transient per-request failures but do NOT disable an account after sustained failure. These are different safeguards. | Implement 3-consecutive-failure circuit breaker (disable account for 5 min). Re-open trigger: cloud migration or customer reports "dead account spamming error logs." |
| CLOUD-008b | **P3** | `azure/credentials.py` | **Azure credentials not validated at configuration time.** `get_credential()` wraps creation errors but does not call `credential.get_token()` eagerly. Invalid Azure creds (wrong client_id/secret) "succeed" at configuration but fail silently on first discovery cycle. | Add eager `get_token("https://management.azure.com/.default")` call in a `test_connection()` flow when a subscription is first configured via UI (not on every `get_credential()` call). Re-open trigger: customer reports "Azure subscription configured but no discovery running." |
| CLOUD-010 | **P3** | `aws_discovery.py:716-717` | **S3 discovery only in first region.** `if region == account.regions[0]` — if first region is disabled or slow, S3 discovery silently skipped for all accounts. | Use dedicated S3 discovery pass outside region loop. S3 is a global service. |

**Summary:** 1 P0, 4 P1, 4 P2 (all ✅ C5), 3 P3 (CLOUD-006b, CLOUD-008b, CLOUD-010). All original 10 findings resolved. 2 follow-up P3s added for deferred behaviors identified during C5 close. The Azure plaintext secrets in memory (CLOUD-001) was the most critical (fixed B4). CLOUD-006/007/008/009 fixed in Phase C5 with 12 regression tests.

---

## Module 10: Frontend Application Layer (API client, pages, hooks)

**Reviewed by:** Max (direct)
**Date:** 2026-05-12
**Files reviewed:** `services/api.ts`, `pages/AlertsPage.tsx`, `hooks/useBatchPanelQueries.ts`, `hooks/useVisiblePanels.ts`, `components/LogFacetsSidebar.tsx`, `pages/AlertDetailPage.test.tsx`

| ID | Severity | File:Line | Finding | Recommendation |
|----|----------|-----------|---------|----------------|
| FE2-001 | **P0** | `useBatchPanelQueries.ts:42-52` | **MQL injection via unsanitized variable substitution.** Template variables resolved from user-editable dashboard variable dropdowns are injected directly into MQL query strings without escaping. A variable value of `"} OR 1=1 --"` would break MQL parsing and could leak data on backend. | Validate resolved variable values against `^[a-zA-Z0-9_\-.*]+$` before substitution. Reject values with special characters. |
| FE2-002 | **P1** | `AlertsPage.tsx:202` | **Hardcoded "admin" user in alert acknowledgment.** `acknowledged_by: "admin"` always sent regardless of actual user. Audit trail shows all acks from "admin", making incident forensics useless. | Use `user?.email ?? user?.name ?? "unknown"` from AuthContext. |
| FE2-003 | **P1** | `api.ts:109` | **401 redirect can infinite-loop.** If `/login` page triggers an API call that returns 401 (e.g., CSRF check), browser loops infinitely between login redirect and 401 response. No loop detection. | Add `isRedirecting` flag. Skip redirect if `window.location.pathname === "/login"`. |
| FE2-004 | ~~P1~~ | `AlertsPage.tsx:599` | **Won't Fix.** React's `title` attribute is set via `setAttribute`, which escapes values. No XSS vector exists. Original finding overstated the risk — `{error}` in JSX text is safe, and `title={value}` is also safe in React's DOM model. | No action required. |
| FE2-005 | **P1** | `useVisiblePanels.ts:35` | **Dead filter logic — always returns true.** `.filter((p) => p.panel_type !== "text" || true)` — the `|| true` makes the condition always true. Text panels are never filtered. All panels treated as visible, defeating viewport optimization. | Remove `|| true`. Change to `.filter((p) => p.panel_type !== "text")` — text panels don't need data queries. |
| FE2-006 | **P1** | `useBatchPanelQueries.ts:81` | **Unstable useEffect dependency.** `JSON.stringify(variables)` used as dependency — object property order is not guaranteed. Same variables in different order trigger re-fetch. Causes unnecessary API calls and chart flicker. | Use stable serialization: `Object.keys(variables).sort().map(k => `${k}=${variables[k]}`).join("&")`. |
| FE2-007 | **P2 ✅** | `AlertsPage.tsx:91-120`, `alerts/crud.py:135-143`, `alerts.py:101-114`, `api.ts:320-331` | **Fixed (C6a).** Backend: added `since: datetime | None` param to `list_alert_events()` and `/events` route. Uses `fired_at > $N` (strict gt, avoids re-fetching boundary). Frontend: tracks `lastEventTime` ref, passes `since` on interval refetch, merges new events into state without duplicates (Set-based dedup by id), caps at 500. | Tests: `test_phase_c6a.py::TestFE2007BackendSinceParam` (4 tests). |
| FE2-008 | **P2 ✅** | `AlertsPage.tsx:107` | **Fixed (C6a).** `filteredEvents` wrapped in `useMemo(() => ..., [events, eventFilter, severityFilter])`. Only recalculates when inputs change. | Tests: `test_phase_c6a.py::TestFE2008UseMemo` (2 tests). |
| FE2-009 | **P2 ✅** | `LogFacetsSidebar.tsx:113-124` | **Fixed (C6a).** Replaced `title={...}` with `aria-label={...}` on both include span and exclude button. Added `role="button"` on include span for a11y. | Tests: `test_phase_c6a.py::TestFE2009AriaLabel` (2 tests). |
| FE2-010 | **P2** | `useVisiblePanels.ts:119` | **Won't Fix (C6b).** `subtree: true` is load-bearing. Dashboard groups expand by conditionally rendering DashboardGrid inside an existing direct child — panels are added as deep descendants, not direct children. `childList: true, subtree: false` would NOT fire for group expansion, breaking viewport optimization. Callback already short-circuits (only processes `data-panel-id` nodes). No `attributes: true` or `characterData: true` — only childList mutations trigger the callback. Performance cost is callback invocation overhead from unrelated DOM insertions (tooltips/dropdowns), which is negligible (< 0.1ms per mutation batch). | Tests: `test_phase_c6b.py::TestFE2010MutationObserverConfig` (4 tests documenting rationale). |
| FE2-011 | **P2 ✅** | `api.ts:90-108` | **Fixed (C6a).** `request()` creates `AbortController` with 30s timeout (`REQUEST_TIMEOUT_MS = 30_000`). `clearTimeout` in `finally` prevents timer leak. `anySignal()` helper composes caller-provided signal with timeout signal. Does NOT affect streaming endpoint (uses its own fetch with caller signal). | Tests: `test_phase_c6a.py::TestFE2011AbortControllerTimeout` (4 tests). |
| FE2-012 | **P3** | `AlertDetailPage.test.tsx` | **Insufficient test coverage.** Only 6 tests. No coverage for: edit operations, permission checks, silence CRUD, event acknowledgment, real-time updates, error recovery, super admin behavior. | Add 15+ tests covering critical user flows. |

**Summary:** 1 P0, 5 P1, 5 P2 (4 ✅ C6a, 1 won't-fix C6b: FE2-010), 1 P3. All 12 findings resolved or dispositioned. The MQL injection via variables (FE2-001) was the most critical (fixed B5). FE2-007/008/009/011 fixed in Phase C6a. FE2-010 investigated and retained (subtree load-bearing for group expansion).

---

## Updated Summary Statistics (Reconciled 2026-05-12)

| Severity | Total | Fixed | Deferred/Closed | Open (Phase C) |
|----------|-------|-------|-----------------|----------------|
| P0 | 22 | **22** | 0 | 0 |
| P1 | 54 | **49** | 5 (INFRA-004, SEC-008, MQL-004, MQL-007, FE2-004) | 0 |
| P2 | 43 | **24** | 6 (SEC-010, DASH-012, FE-007, FE-008, FE-011, FE2-010) | 13 |
| P3 | 10 | **1** | 1 (FE2-012 deferred) | 8 |
| **Total** | **129** | **96** | **12** | **21** |

> See top-of-file note: original review summary miscounted Phase 2 P2 findings as 18 (actual: 22). Totals corrected here. COLL-008 fixed in C4a. FE2-010 Won't Fix in C6b (subtree load-bearing for group expansion).

### Phase 2 P0 Findings — ALL FIXED

| ID | Module | Fix Phase |
|----|--------|-----------|
| ALERT-001 | Alert Engine | Phase B1 |
| ALERT-002 | Alert Engine | Phase B1 |
| NOTIF-001 | Notifications | Phase A |
| NOTIF-002 | Notifications | Phase A |
| COLL-001 | System | Phase A |
| COLL-002 | Feature Flags | Phase A |
| CLOUD-001 | Azure Creds | Phase B4 (partial — pop after use, TTL; encrypted store deferred) |
| FE2-001 | Frontend | Phase B5 |

### Modules Reviewed (Reconciled)
| Module | P0 | P1 | P2 | P3 | Total | Fixed | Deferred | Open |
|--------|----|----|----|----|-------|-------|----------|------|
| Infrastructure | 3 ✅ | 8 ✅ | 2 ✅ | 0 | 13 | 12 | 1 (INFRA-004) | 0 |
| Security | 3 ✅ | 5 ✅ | 4 ✅ | 1 ✅ | 13 | 11 | 2 (SEC-008, SEC-010) | 0 |
| MQL Engine | 3 ✅ | 5 ✅ | 4 ✅ | 1 ✅ | 13 | 11 | 2 (MQL-004, MQL-007) | 0 |
| Dashboard Backend | 4 ✅ | 6 ✅ | 5 (3✅) | 1 | 16 | 13 | 1 (DASH-012) | 2 (DASH-011, DASH-016) |
| Frontend Security | 2 ✅ | 4 ✅ | 6 | 1 | 13 | 9 | 3 (FE-007/008/011) | 1 (FE-013) |
| Alert Engine | 2 ✅ | 6 ✅ | 4 | 1 | 13 | 8 | 0 | 5 |
| Notification System | 2 ✅ | 4 ✅ | 4 | 1 | 11 | 6 | 0 | 5 |
| Collection & Metrics | 2 ✅ | 6 (5✅) | 5 (1✅) | 1 | 14 | 8 | 0 | 6 |
| Cloud Credentials | 1 ✅ | 4 ✅ | 4 ✅ | 3 (1✅) | 12 | 10 | 0 | 2 (CLOUD-006b, CLOUD-008b) |
| Frontend App Layer | 1 ✅ | 5 ✅ | 5 (4✅ 1 won't-fix) | 1 | 12 | 9 | 3 (FE2-004, FE2-010, FE2-012) | 0 |
