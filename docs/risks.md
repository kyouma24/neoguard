# ObserveLabs Risk Assessment

**Document**: Risk Assessment for NeoGuard-to-ObserveLabs SaaS Evolution
**Date**: 2026-05-01
**Author**: Engineering
**Status**: Active -- review quarterly or after any Phase gate

---

## Executive Summary

ObserveLabs is transitioning from a working single-tenant monitoring POC (79 backend files, 7 frontend pages, 630 tests, AWS+Azure collection) into a multi-tenant SaaS platform. The specs define 200+ Definition of Done items, 27 new database tables, full user auth (email/password, OAuth, MFA, SSO), row-level security, an admin panel, a custom query DSL, and more. This document identifies the ten highest-priority risks to that transition and prescribes concrete mitigations.

---

## Risk Matrix

| # | Risk | Prob | Impact | When to Act |
|---|------|:----:|:------:|-------------|
| 1 | Multi-tenancy retrofit breaks everything | H | H | Now (Phase 1) |
| 2 | Auth system complexity vs. timeline | H | H | Now (Phase 1) |
| 3 | Frontend framework migration | M | H | Phase 1 decision gate |
| 4 | MQL parser/compiler complexity | M | H | Phase 2 |
| 5 | Redis as single point of failure | M | H | Phase 2 |
| 6 | Data migration from current schema | H | M | Phase 1 |
| 7 | Solo dev velocity vs. scope | H | M | Now (continuous) |
| 8 | WebSocket/real-time infrastructure | M | M | Phase 3 |
| 9 | Third-party integration brittleness | M | M | On-signal |
| 10 | Performance regression under RLS | M | M | Phase 1 validation |

---

## Detailed Analysis

### 1. Multi-tenancy retrofit breaks everything

**Description**: Adding PostgreSQL RLS policies, tenant-context middleware, and UUID-based `tenant_id` to every existing table, endpoint, and test is the single riskiest change in the migration. Every query that touches tenant-scoped data must carry the correct context. One missed `WHERE` clause or one RLS policy gap results in cross-tenant data leakage -- a P0 security incident that would end the product.

**Probability**: **High** -- The current schema already has `tenant_id` columns (string, defaulting to `"default"`), but no enforcement. Retrofitting enforcement across 12 route modules, 12 service modules, and 47 integration tests guarantees breakage.

**Impact**: **High** -- Cross-tenant data exposure is an existential risk for any SaaS platform.

**Mitigation**: Write RLS policies first in an isolated migration. Build a tenant-context test harness that runs every integration test twice (Tenant A writes, Tenant B must not see). Adopt `SET app.current_tenant` at connection checkout so RLS is enforced at the database level, not in application code. Add a CI gate that fails if any new query touches a tenant-scoped table without the tenant context set.

**When**: Now. This must be the first change in Phase 1 -- all other features depend on correct tenant isolation.

### 2. Auth system complexity vs. timeline

**Description**: The specs require email+password registration, OAuth (Google, GitHub), MFA (TOTP), Redis-backed sessions, SSO (Azure AD, AWS IAM Identity Center), password reset flows, email verification, and account lockout. That is 52 DoD items touching security-critical code paths. Getting auth wrong means credential leaks, session hijacking, or account takeover.

**Probability**: **High** -- Auth is sprawling and every edge case (token refresh, MFA recovery, SSO SAML parsing) is a place to introduce vulnerabilities. Solo dev with no dedicated security review amplifies this.

**Impact**: **High** -- A compromised auth system undermines every other security control.

**Mitigation**: Phase the rollout: email+password with sessions in Phase 1, OAuth in Phase 2, MFA and SSO in Phase 3. Use battle-tested libraries (passlib/argon2 for hashing, authlib for OAuth/OIDC, pyotp for TOTP). Do not hand-roll JWT or session management. Commission an external security review before enabling SSO for enterprise customers.

**When**: Now. Design the session model and middleware before building any tenant-aware UI.

### 3. Frontend framework migration

**Description**: The specs prescribe Shadcn UI + Tailwind CSS. The current frontend uses a custom SCSS-based design system integrated across all 7 pages (18 TSX files). Migrating means replacing every component, restyling every page, and re-validating 72 frontend tests. This is weeks of rework that delivers zero new functionality.

**Probability**: **Medium** -- Migration is optional. The current design system works. But diverging from the spec creates ongoing friction if new pages assume Shadcn primitives.

**Impact**: **High** -- If attempted mid-stream, it blocks all frontend feature work. If deferred indefinitely, new pages have inconsistent styling.

**Mitigation**: Make an explicit decision at Phase 1 kickoff: keep the current design system or migrate. If migrating, do it as a dedicated sprint before any new page work, not interleaved. If keeping, document which Shadcn components to adopt incrementally and which custom components to retain.

**When**: Phase 1 decision gate. Do not let this drift as an implicit assumption.

### 4. MQL parser/compiler complexity

**Description**: The specs define a custom query DSL (MQL) with tag filters, aggregation functions, variables, rollup windows, and tenant_id injection at compile time. Hand-rolling a parser that is both expressive and secure against SQL injection is non-trivial. Parser bugs manifest as wrong data, query timeouts, or injection vulnerabilities.

**Probability**: **Medium** -- Parser generators (Lark, PEG) reduce the risk of hand-rolling, but semantic analysis (tenant injection, rollup rewriting) is still custom code.

**Impact**: **High** -- An injection vulnerability in a query layer that touches all metric data is critical. Even non-security bugs cause silent data corruption in dashboards.

**Mitigation**: Use Lark or a PEG parser for syntax. Compile MQL to parameterized SQL only -- never string-interpolate user input. Build a fuzz test suite (Hypothesis) that generates random MQL and asserts no raw SQL escapes. Keep the initial grammar minimal (metrics + tags + 3 functions) and expand incrementally.

**When**: Phase 2. The current direct-SQL metric queries work for MVP. MQL is a usability feature, not a blocker.

### 5. Redis as single point of failure

**Description**: The specs route sessions, cache, rate limiting, pub/sub (WebSocket fan-out), and background job queues through Redis. A single Redis instance failure means: no user logins (sessions lost), no rate limiting (abuse window), no real-time updates, and degraded API responses (cache miss storm).

**Probability**: **Medium** -- Redis is reliable, but a single instance with no replication is a known fragility pattern.

**Impact**: **High** -- Simultaneous degradation of auth, rate limiting, and real-time features during an outage.

**Mitigation**: Use Redis Sentinel or a managed Redis service (ElastiCache, Azure Cache) with automatic failover from day one. Implement graceful degradation: if Redis is down, fall back to DB-backed sessions (slower, not dead), disable rate limiting with an alert, and switch dashboards to polling. Separate Redis instances or logical databases for sessions vs. cache vs. pub/sub so a cache flush does not kill sessions.

**When**: Phase 2 (when Redis is introduced). Design the fallback paths before going to production.

### 6. Data migration from current schema

**Description**: Existing tables use string `tenant_id` (`"default"`), ULID-based IDs, and a schema that predates the spec's 27-table design. The specs want UUID `tenant_id`, UUIDv7 for all primary keys, and restructured tables. Migration must preserve existing data (43 AWS resources, 88K+ metrics, 9 Azure resources, alert rules/history) without breaking 630 tests.

**Probability**: **High** -- Schema migrations with ID type changes are mechanically complex. ULID-to-UUIDv7 conversion requires custom migration logic. Any missed foreign key = broken joins.

**Impact**: **Medium** -- Data loss or test breakage is recoverable (backups exist, test data is regenerable), but it stalls development for days.

**Mitigation**: Write the migration as a multi-step Alembic chain: (1) add new UUID columns alongside old ones, (2) backfill with deterministic conversion, (3) swap foreign keys, (4) drop old columns. Run the full migration against a copy of production data before applying. Keep ULID compatibility in a transition period if UUIDv7 conversion proves too disruptive.

**When**: Phase 1, immediately after RLS policies are designed (Risk 1). The two are coupled.

### 7. Solo dev velocity vs. scope

**Description**: 200+ DoD items across 12 spec files, 27 new tables, auth, multi-tenancy, admin panel, MQL, WebSocket, onboarding flows, billing integration. Even with AI-assisted development, this is 3-6 months of focused work. The risk is shipping half-built features that create support burden without delivering value.

**Probability**: **High** -- Scope is large by any measure. Solo dev means no parallelism, no code review, no second opinion on architecture decisions.

**Impact**: **Medium** -- The POC already works. Slow delivery delays revenue but does not destroy the product.

**Mitigation**: Ruthlessly phase the work. Phase 1: multi-tenancy + auth + onboarding (minimum viable SaaS). Phase 2: admin panel + MQL + notifications upgrade. Phase 3: real-time + SSO + advanced features. Cut scope within each phase: e.g., skip SSO until an enterprise customer requests it. Track velocity weekly and re-scope if actuals diverge more than 40% from estimates.

**When**: Now. Establish the phase plan and cut list before writing code.

### 8. WebSocket/real-time infrastructure

**Description**: Tenant-scoped, authenticated WebSocket connections with Redis pub/sub for live dashboard updates, alert notifications, and system events. Connection lifecycle management (auth on connect, re-auth on token refresh, graceful disconnect, reconnection backoff) is non-trivial. Tenant isolation in pub/sub channels must be airtight.

**Probability**: **Medium** -- FastAPI has good WebSocket support, but production-grade connection management with tenant isolation is custom work.

**Impact**: **Medium** -- Dashboards already work with polling. WebSocket is a UX improvement, not a correctness requirement.

**Mitigation**: Start with a simple polling fallback that works without WebSocket. Add WebSocket as a progressive enhancement. Use tenant-prefixed Redis channels (`tenant:{id}:metrics`). Implement connection limits per tenant to prevent resource exhaustion. Load test with 100 concurrent connections before shipping.

**When**: Phase 3. Polling is sufficient for early customers.

### 9. Third-party integration brittleness

**Description**: OAuth providers (Google, GitHub), AWS CloudFormation stack provisioning, Azure AD SSO, SMTP relay, PagerDuty, Slack, and MS Teams integrations all depend on external APIs. Any can change authentication flows, deprecate endpoints, or experience outages. Each integration is a maintenance surface.

**Probability**: **Medium** -- Individual integrations are stable, but the aggregate probability of at least one breaking in any 6-month window is high.

**Impact**: **Medium** -- A broken OAuth provider degrades onboarding but does not affect monitoring. A broken notification channel degrades alerting.

**Mitigation**: Wrap every third-party call in a retry-with-backoff adapter. Use circuit breakers (3 failures in 60s = open circuit, fallback behavior). Pin SDK versions and test upgrades in CI. For OAuth, support at least two providers so one can fail without blocking all signups. Monitor integration health as a first-class metric in self-monitoring.

**When**: On-signal. Implement circuit breakers when each integration is built. Review SDK deprecation notices quarterly.

### 10. Performance regression under RLS

**Description**: PostgreSQL RLS adds a security barrier filter to every query on tenant-scoped tables. With TimescaleDB hypertables, RLS predicates must align with chunk boundaries or the planner will scan all chunks instead of pruning. This could turn sub-50ms queries into multi-second scans, especially on the metrics hypertable with months of data.

**Probability**: **Medium** -- RLS is well-supported in PostgreSQL, but TimescaleDB hypertable interaction is less documented. The risk is real but discoverable with testing.

**Impact**: **Medium** -- Performance degradation is fixable (index tuning, policy rewriting) but could delay launch if discovered late.

**Mitigation**: After writing RLS policies (Risk 1), immediately run `EXPLAIN ANALYZE` on the 10 most common queries with RLS enabled vs. disabled. Verify that chunk pruning still works by checking for `Seq Scan` on chunks outside the tenant's data. If RLS defeats pruning, use composite indexes on `(tenant_id, time)` or move tenant filtering to a security-definer function that preserves the planner's ability to prune.

**When**: Phase 1 validation, immediately after RLS policies are applied. Do not wait until load testing.

---

## Review Cadence

- **Weekly**: Check velocity against Phase 1 plan (Risk 7).
- **Phase gates**: Review this document and update probabilities before starting each phase.
- **On-signal**: Any production incident, dependency deprecation, or scope change triggers a re-review of affected risks.
