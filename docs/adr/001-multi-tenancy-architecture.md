# ADR-001: NeoGuard Architecture Overview

## Status
Accepted

## Context
Building a production-grade monitoring platform (MVP Datadog) that handles:
- Metric ingestion at 100K metrics/sec
- Log ingestion and full-text search
- Threshold-based alerting
- Dashboard visualization
- Agent-based collection

Must support future multi-tenant complete isolation.

## Decision

### High-Level Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│  Collector   │────▶│              FastAPI Gateway                 │
│   Agent      │     │  (metric + log ingestion, query, alerts)    │
└─────────────┘     └──────┬──────────────┬───────────────┬────────┘
                           │              │               │
                    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
                    │ TimescaleDB │ │ ClickHouse │ │ PostgreSQL │
                    │ (metrics)   │ │  (logs)    │ │ (metadata) │
                    └─────────────┘ └────────────┘ └────────────┘
```

### Component Breakdown

1. **FastAPI Gateway** — Single process, async throughout
   - Metric ingestion: batch-aware endpoint, async bulk insert to TimescaleDB
   - Log ingestion: async bulk insert to ClickHouse
   - Query API: time-series aggregation, log search
   - Alert API: CRUD + evaluation engine running as background task

2. **TimescaleDB** — Metrics storage
   - Hypertable with time-based partitioning (7-day chunks)
   - Continuous aggregates for 1m, 5m, 1h rollups
   - Compression after 24h for storage efficiency
   - Why not InfluxDB: SQL compatibility, easier joins with metadata

3. **ClickHouse** — Log storage
   - MergeTree engine with time-based partitioning
   - Full-text index on message field
   - TTL-based retention (30 days default)
   - Why not Loki: need full SQL for custom analytics, own our query layer

4. **PostgreSQL** — Metadata store
   - Alert rules, dashboard definitions, notification channels
   - Shared instance with TimescaleDB (TimescaleDB IS PostgreSQL)

5. **Collector Agent** — Standalone Python process
   - Ships system metrics (CPU, memory, disk, network)
   - Configurable collection interval
   - Batches and compresses before sending

### Multi-Tenancy Strategy (Future)
- `tenant_id` column on ALL data tables from day 1
- Row-level security (RLS) in PostgreSQL/TimescaleDB
- Separate ClickHouse databases per tenant for true isolation
- API key scoped to tenant

### Key Design Decisions
- **No message queue for MVP**: At 100K/sec on single machine, async batching
  with in-process buffers is sufficient. Adding Kafka/Redis Streams adds
  operational complexity without proportional benefit at this scale.
  Revisit at 500K+/sec or multi-node deployment.
- **Single FastAPI process**: Uvicorn with multiple workers. Alert evaluation
  runs as async background task within the same process.
- **Tenant-aware from day 1**: Every table has tenant_id. Default tenant
  for single-tenant mode. Zero schema changes needed for multi-tenant.

## Consequences
- Simpler ops (fewer moving parts) at the cost of single-machine ceiling
- TimescaleDB continuous aggregates handle rollups without a separate job
- ClickHouse gives us log analytics SQL superpowers
- Future multi-tenant migration is data-only, not schema change
**Status:** Accepted
**Date:** 2025-01-XX
**Deciders:** Architecture
**Related:** ADR-0001 (stack), ADR-0002 (topology), Spec 00, Spec 03

---

## Context

NeoGuard is a SaaS platform serving multiple organizations. We need to
decide on a multi-tenancy model and the platform operator access model
before we build anything else, because:

1. Retrofitting multi-tenancy into an existing codebase is prohibitively
   expensive (weeks-to-months of risky migration work)
2. Retrofitting admin/support tooling after launch creates operational
   pain (can't debug customer issues)
3. Tenant isolation is a security contract with customers — breaches are
   catastrophic to trust and legally fraught

## Decision

### 1. Multi-tenant from Day 1

Every data-bearing row has `tenant_id UUID NOT NULL`. Tenant isolation is
enforced by:

- **Postgres Row-Level Security (RLS)** on every table
- **Application middleware** sets `app.tenant_id` session variable per
  request
- **Query layer** never trusts tenant_id from client input — derived from
  authenticated session
- **No exceptions** (except platform-level tables: users, platform_audit_log)

### 2. Users-to-Tenants: Many-to-Many

- A user may belong to multiple tenants (like GitHub organizations)
- Membership stored in `tenant_memberships(user_id, tenant_id, role)`
- Role is per-tenant (user can be Owner of A, Viewer of B)
- UI has tenant switcher; session stores `current_tenant_id`

### 3. Self-Service Tenant Creation

- Signup auto-creates tenant (Free tier) with user as Owner
- Invited users join existing tenant (no new tenant)
- Super Admin can also create tenants (enterprise sales)

### 4. Platform Super Admin (Separate Role System)

- Stored on `users` table: `is_super_admin BOOLEAN`, `platform_role TEXT`
- NOT a role on any tenant — orthogonal
- Four levels: `platform_owner`, `platform_admin`, `platform_support`,
  `platform_billing`
- **Bypasses RLS via explicit `app.is_super_admin = true` context setting**
- All actions written to immutable `platform_audit_log`
- MFA mandatory
- Sessions expire in 4 hours (vs 30 days for tenant users)
- Cannot self-register — only provisioned by existing platform_owner or CLI

### 5. Super Admin Impersonation

- Super Admin can view tenant data by setting tenant context
- UI shows persistent banner "Viewing as Super Admin: "
- Impersonation requires stating a reason (captured in audit)
- Time-bound (default 1hr, max 24hr)
- Tenant owner notified (email) of Super Admin access
- All actions during impersonation: audited + marked "via platform support"
  in tenant's own audit log

### 6. Tenant Quotas

- Tiered: Free, Pro, Enterprise
- Enforced at creation (hard block with upgrade CTA) and runtime
- Super Admin can override temporarily (audit-logged)

## Alternatives Considered

### Alternative 1: Single-tenant per deployment
**Pros:** Simpler, no cross-tenant bugs possible
**Cons:** Can't build SaaS; separate deployment per customer unsustainable
**Rejected:** Wrong business model fit.

### Alternative 2: Users belong to one tenant only
**Pros:** Simpler data model
**Cons:** Breaks for consultants, multi-org users, support scenarios
**Rejected:** Too restrictive; industry norm is many-to-many.

### Alternative 3: Super Admin as highest tenant role
**Pros:** Unified role system
**Cons:** Conceptually wrong (platform ops vs. tenant ops are different
concerns); accidentally exposes platform actions in tenant UI; harder to
secure with separate MFA policy
**Rejected:** Keeping platform roles separate is cleaner and safer.

### Alternative 4: Schema-per-tenant (Postgres)
**Pros:** Stronger isolation (physical separation)
**Cons:** Migration complexity (N schemas to update), connection pool
overhead, cross-tenant queries nightmarish, doesn't scale past ~1k tenants
**Rejected:** RLS provides sufficient isolation with better operational
characteristics.

### Alternative 5: Database-per-tenant
**Pros:** Maximum isolation, per-tenant backup/restore
**Cons:** Infra cost explodes, ops overhead catastrophic, cross-tenant
queries impossible (needed for platform metrics)
**Rejected:** Only viable for ~10s of customers at enterprise prices.

### Alternative 6: Application-level tenant filtering (no RLS)
**Pros:** Simpler DB setup
**Cons:** One missed `WHERE tenant_id = ?` = security breach; relying on
developer discipline at scale is a proven failure pattern
**Rejected:** Defense in depth is mandatory. RLS is non-negotiable.

## Consequences

### Positive
- Clean separation of platform ops vs. tenant ops
- Customers get strong isolation guarantees
- Retrofitting nightmares avoided
- Support tooling (impersonation) enables fast customer resolution
- Quota system ready for freemium business model

### Negative / Trade-offs
- ~10% development overhead to maintain tenant context discipline
- RLS policies must be tested adversarially (ongoing test burden)
- Super Admin code paths are security-sensitive (bugs = cross-tenant
  leakage)
- Per-tenant resource pools (queues, ML compute) add complexity

### Mitigations
- Automated adversarial test suite runs in CI (block merge on failure)
- Super Admin actions require MFA-fresh tokens + multi-factor auth
- Platform audit log is append-only + replicated to immutable storage
- Quarterly security audits of Super Admin code paths
- Per-tenant resource isolation enforced via Redis key prefixes +
  Postgres connection-level settings

## Implementation Notes

**Phase 1 (MVP):**
- All tables with `tenant_id` column + NOT NULL constraint
- RLS policies on every table with `tenant_isolation` + `super_admin_bypass`
- Middleware that sets `app.tenant_id` and `app.is_super_admin` per request
- `platform_audit_log` table + write on every admin action
- CLI tool for bootstrapping first `platform_owner`
- Tenant switcher UI
- Basic tenant CRUD for Super Admin panel
- Impersonation flow with banner + reason capture

**Phase 2+:**
- Advanced quota management UI
- Dual-control for tenant deletion (two admins required)
- SSO/SAML for enterprise tenants
- Tenant export (GDPR)

## Verification

Before shipping MVP, the following must pass:
- [ ] Adversarial test: User A cannot read Tenant B data via any endpoint
- [ ] SQL injection tests: payloads cannot escape tenant context
- [ ] Super Admin actions visible in both platform and tenant audit logs
- [ ] Super Admin session expiry works (4h absolute)
- [ ] Impersonation auto-exits on tab close + 1h timeout
- [ ] Platform audit log cannot be modified even by platform_owner
- [ ] Tenant context leaked across async boundaries is prevented
  (contextvars verified)
- [ ] RLS bypass requires both authenticated admin session AND explicit
  context setting
- [ ] Tenant switcher in UI works correctly; no URL-based tenant_id leakage

## References

- Spec 00 (Platform Overview) §3 (Tenancy Model)
- Spec 03 (Alerts) §5 (Multi-Tenancy Requirements)
- PostgreSQL RLS docs: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- "How to build a multi-tenant SaaS" — industry patterns survey