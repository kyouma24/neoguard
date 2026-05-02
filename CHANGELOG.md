# NeoGuard Changelog

All notable changes to NeoGuard are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added — Phase 1: Auth + Multi-Tenancy (2026-05-01 → 2026-05-02)
- **User authentication**: Email+password signup/login with Argon2id hashing (OWASP params)
- **Redis session store**: HttpOnly cookies, 30-day sliding TTL for users, 4-hour absolute for super admins
- **Auth middleware**: Dual-path authentication (session cookies + API keys), scope enforcement
- **Multi-tenancy core**: `tenants`, `users`, `tenant_memberships`, `user_invites`, `audit_log`, `platform_audit_log`, `security_log` tables (UUIDv7)
- **RLS policies**: Row-Level Security on ALL data tables (metrics, resources, alerts, dashboards, etc.)
- **Tenant CRUD**: Create, list, update, switch tenants; invite/remove members; role management (owner/admin/member/viewer)
- **Admin panel**: Super admin CRUD for tenants (create/suspend/delete) and users (grant/revoke admin, activate/deactivate), platform audit log, security log
- **Admin UI**: Red "SUPER ADMIN MODE" banner, typed confirmation for destructive actions, impersonation with time-limited read-only sessions
- **API key v2**: Argon2id hashing with `obl_live_` prefix, v1 SHA-256 backward compatibility, hash_version column (ADR-0006)
- **Auth telemetry**: 9 counters + structured JSON logs for all auth/tenant events
- **Password reset**: Token-based flow with rate limiting, console email (cloud email deferred)
- **CSRF protection**: Double-submit cookie pattern with stale session recovery
- **Bootstrap CLI**: `python -m neoguard.cli bootstrap-admin` for initial super admin creation
- **Frontend auth**: Login, signup, AuthContext provider, protected routes, tenant switcher in sidebar
- **Settings page**: Profile tab (name + password change), Cloud Accounts, Notifications, API Keys, Team, Audit Log, Tenant Settings tabs — role-based visibility
- **Alembic migrations**: 001 initial schema + 002 password reset tokens

### Added — Sprint A: RBAC Security Hardening (2026-05-02)
- **Backend RBAC enforcement**: `require_scope("write")` / `require_scope("admin")` on ALL 27 unprotected write endpoints across 9 route files
- **Internal metric protection**: `neoguard.*` metrics blocked from non-admin users (query/batch/names endpoints), `/health` stripped to DB checks only, `/stats` endpoints admin-gated
- **Tenant creation limit**: 3 tenants per user (`MAX_TENANTS_PER_USER`)
- **Frontend hardening**: Admin-only CPU/Memory charts on Overview, System Monitor tab hidden from non-admins on Dashboards, role-based tab visibility on Settings
- **Coming soon placeholders**: SSO, MFA, Real-Time Dashboards, MQL Query Language — with lighthearted "boss approval needed" messages

### Added — Sprint B: Admin User Creation + Invite Flow (2026-05-02)
- **Admin create user endpoint**: `POST /admin/users` — super admin can create users with optional tenant assignment and role
- **Invite flow fix**: Invites for non-existing users now stored in `user_invites` table; signup auto-accepts pending invites, creating memberships in invited tenants
- **Admin Users UI**: "Create User" inline form in admin panel Users tab

### Added — Sprint 1: Demo Quick Wins (2026-05-02)
- **Tenant context in global top bar**: Tenant name + role ("ACME Corp · owner") shown in Layout top bar on every page automatically, replacing per-page PageHeader context
- **Auth rate limiting**: Redis-backed rate limiter on login (5/15min/IP) and signup (10/hr/IP), fail-open on Redis errors, configurable via `NEOGUARD_AUTH_*` env vars
- **Azure metric name alignment**: Fixed 12 metric name mismatches between frontend InfrastructurePage and backend Azure Monitor definitions
- **Dependency audit**: pip-audit (clean except pip itself CVE-2026-3219), npm audit (0 vulnerabilities)
- **+21 new backend tests**: Auth rate limiter test suite (rate limiting, fail-open, IP extraction, key expiry)

### Changed
- **SettingsPage**: Split from 1,442-line monolith into 6 sub-components (`ProfileTab`, `CloudTab`, `NotificationsTab`, `ApiKeysTab`, `AuditTab`, `TenantTab`)
- **Default settings tab**: Changed from "cloud" to "profile" (most users don't have admin access)
- **OverviewPage**: Removed internal system metrics exposure; added stat cards, alert summary, coming soon cards
- **DashboardsPage**: System Monitor tab admin-only; default tab context-aware
- **SignupPage**: Added "email verification coming soon" info banner

### Fixed
- **CSRF stale session**: `/auth/me` now sets CSRF cookie when missing, UI shows errors instead of silent empty state
- **Tenant ID migration**: 1.18M+ metric rows migrated from `default` to UUID tenant IDs
- **Super admin access**: All 55+ routes and 40+ service functions verified to handle `tenant_id=None` correctly

---

## [0.1.0] — 2026-04-30 — Foundation Release

### Added — Core Platform
- **Backend**: FastAPI with 12 route modules, 12 service modules, full CRUD
- **Metric pipeline**: Ingest (batch writer, COPY protocol), query (auto table selection raw/1m/1h), 8 aggregation types
- **Log pipeline**: ClickHouse ingest + query
- **Alert engine**: 15s eval loop, state machine (ok→pending→firing→resolved→nodata), configurable cooldown, flapping detection, no-data handling, alert preview/dry-run, event acknowledgment
- **Alert silences**: One-time + recurring (cross-midnight timezone support) + tag matchers
- **Notification channels**: 6 types (webhook+HMAC, Slack, email, Freshdesk lifecycle, PagerDuty Events v2, MS Teams Adaptive Cards), retry with backoff
- **Dashboard CRUD**: Create, update, delete, duplicate
- **Resource management**: CRUD + summary + upsert (dedup by external_id)

### Added — AWS Integration (Live Tested)
- **24 resource discoverers**: EC2, EBS, RDS, Aurora, Lambda, S3, DynamoDB, ElastiCache, ECS, EKS, ALB, NLB, CloudFront, Route53, SNS, SQS, Kinesis, Step Functions, API Gateway, NAT Gateway, VPC, Subnet, Security Group, IAM Role
- **20 CloudWatch namespaces**: Metric collection across all discovered resource types
- **Assume-role with external-id**: Cross-account IAM role (`NeoGuardCollectorRole`), account 271547278517
- **Live tested**: 43 resources discovered, 88,727+ metrics ingested, 0 dropped

### Added — Azure Integration (Live Tested)
- **15 resource discoverers**: VM, Disk, SQL, Function, App Service, AKS, Storage, Load Balancer, App Gateway, CosmosDB, Redis, VNet, NSG, DNS Zone, Key Vault
- **10 Azure Monitor metric types**: ~78 total metrics defined
- **Service principal auth**: Credential cache (3500s TTL), client cache (600s TTL)
- **Live tested**: 9 resources discovered, 216 metrics ingested

### Added — Self-Monitoring
- **Request correlation IDs**: ULID-based X-Request-ID on every request
- **Metrics registry**: Counter, Gauge, Histogram with MetricsRegistry singleton
- **Telemetry collector**: 32 `neoguard.*` metric series dogfooded into own pipeline
- **System stats API**: Real-time pool, writer, background task, process stats

### Added — Frontend (10 Pages)
- Login, Signup, Overview, Infrastructure (24 AWS tabs + drill-down), Metrics, Logs, Alerts (with silences), Dashboards, Settings, Admin

### Added — Infrastructure
- Docker Compose: TimescaleDB (pg16:5433) + ClickHouse (24.8:8123) + Redis (7.x:6379)
- Alembic migrations
- CI/CD pipeline: `.github/workflows/ci.yml` (5 parallel jobs)
- CloudFormation template for IAM role

### Documentation
- 11 docs in `docs/`: architecture, api-reference, deployment, testing, data-flow, database-schema, project-structure, build-plan, integration-map, risks, project-documentation
- 6 ADRs: stack selection, architecture topology, ID coexistence, SCSS tokens, API key hash versioning, multi-tenancy architecture
- CLAUDE.md: 11-section operating memory

### Test Coverage
- 724 backend tests (all passing)
- 72 frontend tests (all passing)
- 796 total tests
- TypeScript strict mode, zero errors
