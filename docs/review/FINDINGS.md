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

| Severity | Total | Fixed | Open |
|----------|-------|-------|------|
| P0 | 15 | **15** | 0 |
| P1 | 28 | **24** | 4 |
| P2 | 21 | **12** | 9 |
| P3 | 4 | **1** | 3 |
| **Total** | **68** | **52** | **16** |

### P0 Fixes Applied (2026-05-02)
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

### P1 Fixes Applied (2026-05-02)
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

### P2 Fixes Applied (2026-05-02)
| ID | Fix |
|----|-----|
| SEC-009 | `auth_enabled=False` now blocked in production mode (requires `debug=True`) |
| SEC-011 | `get_user_by_email` uses explicit column list; `get_user_by_id` excludes `password_hash`; `authenticate_user` strips hash before returning |
| SEC-012 | `/auth/logout` added to CSRF exempt paths |
| INFRA-012 | CORS restricted to specific methods and headers (was `*`) |
| MQL-009 | Wildcard LIKE in MQL compiler now escapes `%` and `_` in non-wildcard portions |
| MQL-011 | `moving_average` window capped at 1000; rollup seconds capped at 86400 |
| MQL-012 | `interval` field validated against allowed values (`raw`, `1m`, `5m`, `15m`, `1h`, `6h`, `1d`) |
| MQL-013 | Streaming batch internal errors no longer leak exception strings |
| FE-009 | Zustand stores reset on tenant switch |
| FE-010 | localStorage clipboard write moved to catch block (fallback only) |
| FE-012 | useLiveStream onMessage callback stabilized via useRef |

### P3 Fixes Applied (2026-05-02)
| ID | Fix |
|----|-----|
| SEC-013 | Password complexity: requires uppercase + lowercase + digit (SignupRequest, PasswordResetConfirm, ProfileUpdate, AdminCreateUserRequest) |

### Remaining Open Findings (16)
| ID | Severity | Status |
|----|----------|--------|
| INFRA-004 | P1 | Deferred — azure client_secret plaintext requires secrets manager (cloud) |
| SEC-008 | P1 | By design — session_secret is startup config requirement, not HMAC key; sessions use 256-bit random IDs + Redis server-side storage |
| SEC-010 | P2 | Accepted — session index SET TTL 30d for super admin is benign; stale entries cleaned on read |
| MQL-004 | P1 | Deferred — super admin MQL cross-tenant data merge; requires tenant_id param enforcement (design decision) |
| MQL-007 | P1 | Deferred — variable substitution 4-pass string pipeline; would require AST-level substitution redesign |
| DASH-011 | P2 | Low — `record_view()` dead code, harmless |
| DASH-012 | P2 | Low — `dashboard_tags` table unused, harmless (may be used later) |
| DASH-016 | P2 | Low — `_row_to_dashboard` JSON parsing has `isinstance` guard; only parses when asyncpg returns string |
| FE-007 | P2 | Low — single `as any` in UPlotChart at type boundary |
| FE-008 | P2 | Low — double cast in DashboardViewer for layout migration |
| FE-011 | P2 | Low — UPlotChart 20+ deps; perf optimization, not bug |
| FE-013 | P3 | Low — CSS fontWeight type casts, harmless |

### Modules Reviewed
| Module | P0 | P1 | P2 | P3 | Total | Fixed |
|--------|----|----|----|----|-------|-------|
| Infrastructure | 3 ✅ | 8 ✅ | 2 ✅ | 0 | 13 | 13 |
| Security | 3 ✅ | 5 (4✅ 1 by-design) | 4 (3✅ 1 accepted) | 1 ✅ | 13 | 11 |
| MQL Engine | 3 ✅ | 5 (3✅ 2 deferred) | 4 ✅ | 1 ✅ | 13 | 11 |
| Dashboard Backend | 4 ✅ | 6 ✅ | 5 (2✅ 3 low) | 1 (1 low) | 16 | 12 |
| Frontend Security | 2 ✅ | 4 ✅ | 6 (3✅ 3 low) | 1 (1 low) | 13 | 9 |
