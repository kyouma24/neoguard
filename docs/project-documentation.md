# NeoGuard / ObserveLabs -- Comprehensive Project Documentation

> **Version**: 1.0 | **Date**: 2026-05-01 | **Stage**: Laptop Demo (Phase 1 Complete)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Flow](#3-data-flow)
4. [Prerequisites](#4-prerequisites)
5. [Setup & Running](#5-setup--running)
6. [Authentication Flow](#6-authentication-flow)
7. [Multi-Tenancy](#7-multi-tenancy)
8. [Admin Panel](#8-admin-panel)
9. [Alerting System](#9-alerting-system)
10. [Tests](#10-tests)
11. [Changelog (Phase 1)](#11-changelog-phase-1)
12. [SOP (Standard Operating Procedures)](#12-sop-standard-operating-procedures)
13. [SOW (Statement of Work)](#13-sow-statement-of-work)
14. [Limitations](#14-limitations)
15. [What's Covered vs Not Covered](#15-whats-covered-vs-not-covered)
16. [FAQ](#16-faq)

---

## 1. Overview

### What is NeoGuard?

NeoGuard is a **production-grade, multi-tenant AWS and Azure monitoring SaaS platform** -- a Datadog competitor built from scratch. It is being developed under the codename **ObserveLabs** for its eventual product launch.

### Mission

Evolve NeoGuard into ObserveLabs -- a multi-tenant monitoring platform that provides infrastructure discovery, metrics collection, log aggregation, alerting, dashboards, and team management across AWS and Azure cloud providers.

### Current Stage

**Laptop Demo** -- Phase 1 (Auth + Multi-Tenancy) is complete. The system runs entirely on a single developer machine using Docker containers for databases and local processes for the API and frontend. The goal is to demonstrate:

- Multi-tenant authentication with role-based access
- Tenant isolation across all data
- Admin panel with impersonation and audit logging
- AWS monitoring (24 resource types, 20 CloudWatch namespaces)
- Azure monitoring (15 resource types, 10 Monitor metric types)
- Alerting with 6 notification channels
- 10 frontend pages (Login, Signup, Overview, Infrastructure, Metrics, Logs, Alerts, Dashboards, Settings, Admin)

### Key Numbers

| Metric | Value |
|--------|-------|
| Backend Python files | 90+ |
| Route modules | 15 |
| Service modules | 12+ |
| Frontend pages | 10 |
| Frontend components (design system) | 30+ |
| AWS resource discoverers | 24 |
| AWS CloudWatch namespaces | 20 |
| Azure resource discoverers | 15 |
| Azure Monitor metric types | 10 |
| Alert notification channels | 6 |
| Database tables | 20+ |
| Total tests passing | 709 (637 unit + 72 frontend) |

---

## 2. Architecture

### System Diagram

```
                     +-----------------+
                     |   React SPA     |  :5173 (Vite dev server)
                     |   TypeScript    |
                     |   SCSS + Tokens |
                     +--------+--------+
                              |
                     HTTP (CORS, Cookies, CSRF)
                              |
                     +--------v--------+
                     |    FastAPI       |  :8000
                     |   (uvicorn)     |
                     |                  |
                     |  +-- Routes --+  |    15 route modules
                     |  +-- Services-+  |    12+ service modules
                     |  +-- Middleware+ |    Auth, CSRF, Rate Limit, RequestID, Logging
                     |  +-- Background+ |    AlertEngine, Orchestrator, TelemetryCollector
                     +--+------+-----+-+
                        |      |     |
               +--------+  +--+--+  +--------+
               v            v     v           v
     +---------+---+  +----+----+  +----------+---+
     | TimescaleDB |  | Redis   |  | ClickHouse   |
     | (pg16)      |  | 7.x     |  | (24.8)       |
     | :5433       |  | :6379   |  | :8123         |
     |             |  |         |  |               |
     | - metrics   |  | sessions|  | - logs        |
     | - resources |  | cache   |  |               |
     | - alerts    |  | rate lim|  +---------------+
     | - users     |  | pub/sub |
     | - tenants   |  +---------+
     | - api_keys  |
     | - dashboards|
     | - audit_log |
     +-------------+
```

### Topology

**Modular monolith** (ADR-0002). A single FastAPI process with internal package boundaries. Background tasks run as asyncio coroutines in-process:

- **AlertEngine** -- 15-second evaluation loop for alert rules
- **CollectionOrchestrator** -- Discovery (5-min cycle) + Metrics collection (1-min cycle)
- **TelemetryCollector** -- Self-monitoring metrics (15-sec interval, 32 neoguard.* series)
- **MetricWriter** -- Batched COPY-based metric ingestion (5000 batch size, 200ms flush)
- **LogWriter** -- Batched log ingestion to ClickHouse (2000 batch size, 500ms flush)

### Component Breakdown

#### Backend (`src/neoguard/`)

| Package | Purpose | Key Files |
|---------|---------|-----------|
| `api/routes/` | HTTP endpoints | 15 route modules: health, user_auth, auth, metrics, logs, alerts, dashboards, resources, aws_accounts, azure_accounts, notifications, collection, system, tenants, admin |
| `api/middleware/` | Request processing pipeline | auth.py (AuthMiddleware, RateLimitMiddleware, RequestLoggingMiddleware), csrf.py (CSRFMiddleware), request_id.py (RequestIDMiddleware) |
| `api/deps.py` | FastAPI dependency injection | get_tenant_id, require_scope |
| `services/auth/` | Authentication & authorization | passwords.py, users.py, sessions.py, api_keys.py, admin.py, telemetry.py, password_reset.py, email.py |
| `services/alerts/` | Alert evaluation & management | engine.py (AlertEngine), crud.py, silences.py |
| `services/aws/` | AWS integration | credentials.py (assume-role + STS), accounts.py, cloudwatch.py |
| `services/azure/` | Azure integration | credentials.py (service principal), accounts.py, monitor.py |
| `services/discovery/` | Resource auto-discovery | aws_discovery.py (24 discoverers), azure_discovery.py (15 discoverers) |
| `services/collection/` | Collection orchestration | orchestrator.py, jobs.py |
| `services/metrics/` | Metric read/write | writer.py (batched COPY), query.py |
| `services/logs/` | Log read/write | writer.py (batched ClickHouse insert), query.py |
| `services/notifications/` | Alert notifications | dispatcher.py, senders.py (6 channel types), crud.py |
| `services/telemetry/` | Self-monitoring | collector.py |
| `services/dashboards.py` | Dashboard CRUD | Single-file service |
| `services/resources/` | Resource CRUD | crud.py (upsert_resource) |
| `core/` | Cross-cutting concerns | config.py (pydantic-settings), logging.py (structlog), telemetry.py (metrics registry), regions.py |
| `models/` | Pydantic v2 data models | auth.py, users.py, alerts.py, resources.py, metrics.py, notifications.py, aws.py, azure.py, dashboards.py, logs.py |
| `db/` | Database connections | timescale/connection.py, clickhouse/connection.py, redis/connection.py, timescale/tenant_ctx.py |
| `cli/` | Management commands | bootstrap_admin.py, __main__.py |

#### Frontend (`frontend/src/`)

| Directory | Purpose |
|-----------|---------|
| `pages/` | 10 page components + 2 test files |
| `components/` | Shared UI (TimeSeriesChart) |
| `design-system/` | Full design system: primitives (Button, Badge, Input, etc.), composites (Card, Modal, Tabs, etc.), patterns (DataTable, FilterBar, FormLayout, etc.) |
| `services/` | API client (`api.ts`) |
| `types/` | TypeScript type definitions |
| `contexts/` | AuthContext provider |

#### Pages

| Page | Route | Description |
|------|-------|-------------|
| LoginPage | `/login` | Email + password authentication |
| SignupPage | `/signup` | User registration with tenant creation |
| ForgotPasswordPage | `/forgot-password` | Password reset request |
| ResetPasswordPage | `/reset-password` | Password reset confirmation |
| OverviewPage | `/` | System health summary |
| InfrastructurePage | `/infrastructure` | 24 AWS resource tabs with drill-down |
| MetricsPage | `/metrics` | Metric exploration and charting |
| LogsPage | `/logs` | Log search and filtering |
| AlertsPage | `/alerts` | Alert rules, events, silences |
| DashboardsPage | `/dashboards` | Custom dashboard management |
| SettingsPage | `/settings` | Onboarding wizard, notifications, API keys, team management |
| AdminPage | `/admin` | Super admin panel (stats, tenants, users, audit log) |

### Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend Runtime | Python | 3.14 |
| Web Framework | FastAPI + uvicorn | 0.115+ |
| Database Driver | asyncpg (raw SQL) | 0.30+ |
| ORM | None (raw parameterized SQL) | - |
| Serialization | orjson + Pydantic v2 | 3.10+ / 2.10+ |
| Password Hashing | argon2-cffi (Argon2id) | latest |
| ID Generation | python-ulid (existing), uuid-utils (new) | latest |
| AWS SDK | boto3 / aioboto3 | 1.35+ / 13.0+ |
| Azure SDK | azure-identity + 8 mgmt packages | various |
| Frontend Framework | React + TypeScript | 18.3 / strict |
| Build Tool | Vite | 6.0+ |
| Charting | Recharts | 2.13+ |
| Icons | Lucide React | 0.460+ |
| Date Utils | date-fns | 4.1+ |
| CSS | SCSS with design tokens | sass 1.99+ |
| Metrics DB | TimescaleDB (PostgreSQL 16) | latest-pg16 |
| Logs DB | ClickHouse | 24.8 |
| Sessions/Cache | Redis | 7.x |
| Linting | ruff (Python), ESLint (TS) | 0.8+ |
| Type Checking | mypy (Python), tsc (TS) | 1.13+ |
| Testing | pytest (Python), vitest + RTL (TS) | latest / 4.1+ |

### Middleware Stack (execution order, outermost first)

```
CORSMiddleware          -- allow localhost:5173, credentials=true
AuthMiddleware          -- session cookie or API key validation
CSRFMiddleware          -- double-submit cookie on mutating requests
RateLimitMiddleware     -- sliding window per API key (default 600 RPM)
RequestLoggingMiddleware -- logs method, path, status, duration, tenant
RequestIDMiddleware     -- ULID-based X-Request-Id header
```

---

## 3. Data Flow

### Metric Collection (AWS)

```
AWS Account (assume-role + external-id)
    |
    v
CollectionOrchestrator._run_aws_discovery()   [every 5 minutes]
    |
    +-- For each enabled AWS account:
    |   +-- Resolve enabled regions (cached 1hr)
    |   +-- For each region:
    |       +-- aws_discover_all() -> 24 discoverers
    |           (ec2, ebs, rds, aurora, lambda, alb, nlb, elb,
    |            dynamodb, sqs, sns, ecs, eks, elasticache, s3,
    |            cloudfront, api_gateway, kinesis, redshift,
    |            opensearch, step_functions, nat_gateway,
    |            route53, efs, fsx, vpn)
    |       +-- upsert_resource() -> TimescaleDB resources table
    v
CollectionOrchestrator._run_aws_metrics()     [every 60 seconds]
    |
    +-- For each enabled AWS account:
    |   +-- For each region:
    |       +-- List resources by type, map to CloudWatch namespace
    |       +-- collect_cloudwatch_metrics(account, region, namespace, resource_entries)
    |           +-- GetMetricData API (batch up to 500 metrics)
    |           +-- MetricWriter.write() -> batched COPY -> TimescaleDB metrics hypertable
    v
TimescaleDB (metrics hypertable)
    |
    +-- Raw data: metrics table (chunk_time_interval = 1 day)
    +-- 1-minute rollup: metrics_1m continuous aggregate
    +-- 1-hour rollup: metrics_1h continuous aggregate
    +-- Compression: chunks > 24 hours
    +-- Retention: raw data dropped after 30 days
```

### Metric Collection (Azure)

```
Azure Subscription (service principal auth)
    |
    v
CollectionOrchestrator._run_azure_discovery()  [every 5 minutes]
    |
    +-- For each enabled subscription:
    |   +-- For each region:
    |       +-- azure_discover_all() -> 15 discoverers
    |           (vm, disk, sql, function, app_service, aks,
    |            storage, lb, app_gw, cosmosdb, redis,
    |            vnet, nsg, dns_zone, key_vault)
    |       +-- upsert_resource() -> TimescaleDB resources table
    v
CollectionOrchestrator._run_azure_metrics()    [every 60 seconds]
    |
    +-- For each enabled subscription:
    |   +-- Group resources by type
    |   +-- collect_azure_metrics(subscription, resource_type, entries)
    |       +-- Azure Monitor REST API
    |       +-- MetricWriter.write() -> batched COPY -> TimescaleDB
    v
TimescaleDB metrics hypertable (same as AWS)
```

### Log Ingestion

```
Log Sources (API POST /api/v1/logs)
    |
    v
LogWriter.write()
    +-- Batch buffer (2000 entries or 500ms timeout)
    +-- Flush -> ClickHouse INSERT (neoguard.logs table)
    v
ClickHouse (neoguard database)
    +-- Queried via GET /api/v1/logs (with filters, pagination)
```

### Authentication Flow

```
User (browser)
    |
    +-- POST /auth/signup  (email, password, name, tenant_name)
    |   +-- create_user() -> Argon2id hash -> users table
    |   +-- create_tenant() -> tenants table + membership as 'owner'
    |   +-- create_session() -> Redis (session:xxx, 30-day TTL)
    |   +-- Set-Cookie: neoguard_session=<session_id> (HttpOnly, SameSite=Lax)
    |   +-- Set-Cookie: neoguard_csrf=<csrf_token> (readable by JS)
    |
    +-- POST /auth/login  (email, password)
    |   +-- authenticate_user() -> Argon2id verify
    |   +-- get_user_tenants() -> pick first active tenant
    |   +-- create_session() -> Redis
    |   +-- Set cookies (session + CSRF)
    |
    +-- Any subsequent request:
        +-- AuthMiddleware reads neoguard_session cookie
        +-- get_session(session_id) -> Redis lookup
        +-- Sets request.state: user_id, tenant_id, role, scopes, is_super_admin
        +-- Slides TTL (resets 30-day expiry on each request)
        +-- CSRFMiddleware validates X-CSRF-Token header matches cookie
```

### API Key Authentication

```
Machine Client
    |
    +-- Authorization: Bearer obl_live_xxxxxxxxxxxx
    |   OR
    +-- X-API-Key: obl_live_xxxxxxxxxxxx
    |
    v
AuthMiddleware
    +-- validate_api_key(raw_key)
    |   +-- hash_version=2: Argon2id verify
    |   +-- hash_version=1: SHA-256 verify (legacy)
    +-- Sets request.state: tenant_id, scopes, rate_limit
    +-- RateLimitMiddleware: sliding window check (per key)
```

### Alert Evaluation

```
AlertEngine._eval_loop()  [every 15 seconds]
    |
    +-- Fetch all enabled alert_rules from TimescaleDB
    +-- For each rule:
    |   +-- Check if silenced (alert_silences table)
    |   +-- Query metric value (aggregation: avg/min/max/sum/count/last/p95/p99)
    |   +-- State machine evaluation:
    |       OK -> PENDING (threshold breached)
    |       PENDING -> FIRING (breached for duration_sec)
    |       FIRING -> RESOLVED (recovered)
    |       Any -> NODATA (no data + nodata_action='alert')
    |   +-- If FIRING: dispatch_firing(payload, notification_config)
    |   +-- If RESOLVED: dispatch_resolved(payload, notification_config)
    |   +-- Persist state to alert_rule_states table
    v
Notification Dispatcher
    +-- Route to channel sender based on channel_type
    +-- 6 channels: Webhook, Slack, Email, Freshdesk, PagerDuty, MS Teams
    +-- Retry with exponential backoff (3 retries, 1-10s delay)
```

---

## 4. Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Docker Desktop | 4.x+ | Run TimescaleDB, ClickHouse, Redis containers |
| Python | 3.11+ (3.14 recommended) | Backend API server |
| Node.js | 22+ | Frontend build and dev server |
| npm | 10+ | Frontend package manager |
| Git | 2.x+ | Version control |

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 8 GB | 16 GB |
| Disk | 10 GB free | 20 GB free |
| CPU | 4 cores | 8 cores |
| OS | Windows 10/11, macOS 12+, Linux | Windows 11 (dev environment) |

### Required Ports

| Port | Service | Notes |
|------|---------|-------|
| 5433 | TimescaleDB | Mapped from container 5432 (5432 often occupied by local PostgreSQL) |
| 8123 | ClickHouse HTTP | Default ClickHouse port |
| 6379 | Redis | Default Redis port |
| 8000 | FastAPI Backend | uvicorn server |
| 5173 | Vite Dev Server | Frontend hot-reload |

### Environment Variables

All variables use the `NEOGUARD_` prefix. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEOGUARD_DB_HOST` | localhost | TimescaleDB host |
| `NEOGUARD_DB_PORT` | 5432 | TimescaleDB port (**use 5433 locally**) |
| `NEOGUARD_DB_NAME` | neoguard | Database name |
| `NEOGUARD_DB_USER` | neoguard | Database user |
| `NEOGUARD_DB_PASSWORD` | neoguard_dev | Database password |
| `NEOGUARD_CLICKHOUSE_HOST` | localhost | ClickHouse host |
| `NEOGUARD_CLICKHOUSE_PORT` | 8123 | ClickHouse HTTP port |
| `NEOGUARD_REDIS_URL` | redis://localhost:6379/0 | Redis connection URL |
| `NEOGUARD_AUTH_ENABLED` | true | Enable/disable auth middleware |
| `NEOGUARD_AUTH_BOOTSTRAP_TOKEN` | (empty) | Bootstrap token for initial setup |
| `NEOGUARD_SESSION_SECRET` | change-me-in-production | Session signing secret |
| `NEOGUARD_SESSION_TTL_SECONDS` | 2592000 | Session TTL (30 days) |
| `NEOGUARD_DEBUG` | false | Debug mode |

### AWS Account Setup (Optional)

To connect an AWS account for monitoring:

1. Deploy the CloudFormation template (`cft/neoguard-role.yml`) in the target account
2. The template creates an IAM role with read-only CloudWatch and resource-describe permissions
3. Configure assume-role with the external-id generated by NeoGuard
4. Add the account in Settings > Onboarding

### Azure Subscription Setup (Optional)

To connect an Azure subscription for monitoring:

1. Register an Azure AD application (service principal)
2. Grant Reader role on the target subscription
3. Note: tenant_id (Azure AD), client_id, client_secret, subscription_id
4. Add the subscription in Settings > Onboarding

---

## 5. Setup & Running

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <repo-url> NewClaudeNeoGuard
cd NewClaudeNeoGuard

# Install Python dependencies
pip install -e ".[dev]"
# OR
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Start Database Containers

```bash
# Start TimescaleDB, ClickHouse, and Redis
cd docker
docker compose up -d timescaledb clickhouse redis
cd ..

# Wait ~10 seconds for containers to initialize
# TimescaleDB auto-runs docker/timescaledb/init.sql on first start
```

### Step 3: Bootstrap Super Admin

```bash
# Create the first super admin user
NEOGUARD_DB_PORT=5433 python -m neoguard.cli.bootstrap_admin \
    --email admin@example.com \
    --password "YourSecurePassword123" \
    --name "Admin"
```

This creates a super admin user with a "Platform Admin" tenant.

### Step 4: Start the Backend

```bash
NEOGUARD_DB_PORT=5433 python -m uvicorn neoguard.main:app \
    --host 0.0.0.0 --port 8000 --reload
```

On startup, the following background tasks begin:
- MetricWriter (batch flush)
- LogWriter (batch flush)
- AlertEngine (15-second eval loop)
- CollectionOrchestrator (discovery every 5 min, metrics every 1 min)
- TelemetryCollector (self-monitoring every 15 sec)

### Step 5: Start the Frontend

```bash
cd frontend
npm run dev
```

Access the application at: **http://localhost:5173**

### Step 6: Log In

1. Open http://localhost:5173/login
2. Enter the email and password from Step 3
3. You are now logged in as a super admin with access to all features including the Admin panel

### Optional: Start the Collector Agent

For local/OS metrics collection:

```bash
python -m neoguard.collector.agent --api-url http://localhost:8000 --interval 10
```

### Quick Verification

```bash
# Health check
curl http://localhost:8000/health

# System stats (requires auth)
# Use browser dev tools to get the session cookie after login
curl -b "neoguard_session=<your-session>" http://localhost:8000/api/v1/system/stats
```

---

## 6. Authentication Flow

### Overview

NeoGuard uses a dual-auth system:

1. **Session-based auth** (browser users) -- HttpOnly cookie + Redis sessions
2. **API key auth** (machine clients) -- Bearer token or X-API-Key header

### Signup Flow

```
1. User submits:  POST /auth/signup
   Body: { email, password, name, tenant_name }

2. Backend:
   a. Check if email already exists (409 if so)
   b. Hash password with Argon2id (OWASP params)
   c. Create user record (UUIDv7 PK)
   d. Create tenant (auto-generated slug from name)
   e. Create tenant_membership (role: 'owner')
   f. Create Redis session (30-day TTL)
   g. Set cookies: neoguard_session (HttpOnly) + neoguard_csrf

3. Response: { user, tenant, role: 'owner' }
```

### Login Flow

```
1. User submits:  POST /auth/login
   Body: { email, password }

2. Backend:
   a. Look up user by email (case-insensitive)
   b. Verify password against Argon2id hash
   c. Check user is active
   d. Get user's tenants, pick first active
   e. Create Redis session with tenant context
   f. Set cookies: neoguard_session + neoguard_csrf

3. Response: { user, tenant, role }
```

### Session Management

- **Storage**: Redis with key pattern `session:<session_id>`
- **TTL**: 30 days, sliding (renewed on each authenticated request)
- **Data stored**: user_id, tenant_id, role, is_super_admin, impersonated_by (optional)
- **Cookie**: `neoguard_session`, HttpOnly, SameSite=Lax, Secure=false (for local dev)
- **Session ID generation**: `secrets.token_urlsafe(32)` (256-bit entropy)

### CSRF Protection

NeoGuard uses the **double-submit cookie** pattern:

1. On login/signup, a CSRF token is set as a **non-HttpOnly** cookie (`neoguard_csrf`)
2. The frontend reads this cookie and sends it as `X-CSRF-Token` header on mutating requests
3. CSRFMiddleware validates the header matches the cookie using `secrets.compare_digest`

**Exempt from CSRF**: GET/HEAD/OPTIONS requests, /auth/signup, /auth/login, password reset endpoints, API key auth (no session cookie present).

### Password Reset Flow

```
1. User submits:  POST /auth/password-reset/request
   Body: { email }

2. Backend:
   a. Look up user by email
   b. Rate-limit check (prevent abuse)
   c. Generate reset token (UUIDv7)
   d. Hash token with SHA-256, store in password_reset_tokens table
   e. Send reset email (console output in laptop demo, SES/SMTP in cloud)

3. User submits:  POST /auth/password-reset/confirm
   Body: { token, new_password }

4. Backend:
   a. Hash submitted token, look up in password_reset_tokens
   b. Validate: not expired, not already used
   c. Mark token as used
   d. Hash new password with Argon2id
   e. Update user record

Note: In the laptop demo, the reset URL is printed to the console
(email delivery requires SES/SMTP, deferred to cloud deployment).
```

### API Key Authentication

| Version | Prefix | Hash Algorithm | Status |
|---------|--------|----------------|--------|
| v1 | (any) | SHA-256 | Legacy, sunset in 12 months |
| v2 | `obl_live_` | Argon2id | Current standard |

- API keys are scoped: `read`, `write`, `admin`
- Per-key rate limiting: sliding window, default 1000 RPM per key, configurable
- Raw key shown only once at creation time
- Key prefix stored for identification (`raw_key[:11]`)

### Role-to-Scope Mapping

| Role | Scopes | UI Permissions |
|------|--------|----------------|
| viewer | `[read]` | Read-only access |
| member | `[read, write]` | Create + edit resources |
| admin | `[read, write, admin]` | Full management, invite members |
| owner | `[read, write, admin]` | Full management, role changes, delete tenant |

---

## 7. Multi-Tenancy

### Design Principles

1. **Every data table has a `tenant_id` column** -- no exceptions
2. **Row-Level Security (RLS)** policies on all tenant-scoped tables
3. **Tenant context set per request** via PostgreSQL GUC variable `app.current_tenant_id`
4. **Cross-tenant access is impossible** at the database level (when RLS is enforced)

### Tenant-Scoped Tables (RLS Enforced)

| Table | tenant_id Type | RLS Policy |
|-------|---------------|------------|
| metrics | TEXT | `tenant_id = current_setting('app.current_tenant_id')` |
| resources | TEXT | Same |
| alert_rules | TEXT | Same |
| alert_events | TEXT | Same |
| alert_rule_states | TEXT | Via JOIN to alert_rules |
| alert_silences | TEXT | Same |
| dashboards | TEXT | Same |
| notification_channels | TEXT | Same |
| aws_accounts | TEXT | Same |
| azure_subscriptions | TEXT | Same |
| collection_jobs | TEXT | Same |
| api_keys | TEXT | Same |
| audit_log | UUID | Cast to text for comparison |

### Platform-Level Tables (No RLS)

These tables are accessed cross-tenant by auth/admin middleware:

| Table | Purpose |
|-------|---------|
| users | User accounts (email, password_hash, is_super_admin) |
| tenants | Tenant registry (name, slug, tier, status) |
| tenant_memberships | User-to-tenant mappings with roles |
| user_invites | Pending invitations |
| platform_audit_log | Super admin action audit trail |
| security_log | Authentication events (login, logout, password changes) |
| password_reset_tokens | Password reset flow tokens |

### How Tenant Context Is Set

```python
# In AuthMiddleware.dispatch():
def _set_tenant(self, request: Request, tenant_id: str | None) -> None:
    request.state.tenant_id = tenant_id
    current_tenant_id.set(tenant_id)  # Python contextvars

# In database queries, tenant_id is always passed as a parameter:
# SELECT * FROM resources WHERE tenant_id = $1
```

### Tenant Switching

Users who belong to multiple tenants can switch via:

```
POST /api/v1/tenants/{tenant_id}/switch
```

This updates the Redis session's tenant_id and role without requiring re-login.

### Tenant Roles

| Role | Can Invite | Can Change Roles | Can Remove Members | Can Edit Tenant | Can Delete Tenant |
|------|-----------|------------------|-------------------|-----------------|-------------------|
| viewer | No | No | No | No | No |
| member | No | No | No | No | No |
| admin | Yes | No | Yes | Yes | No |
| owner | Yes | Yes (all) | Yes | Yes | Yes |

---

## 8. Admin Panel

### Access Control

The Admin panel is restricted to **super admins** only. Super admin status is a user-level flag (`is_super_admin`), independent of any tenant role.

### Endpoints

All admin endpoints are under `/api/v1/admin/*` and gated by `_require_super_admin()`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/stats` | GET | Platform-wide statistics (total users, tenants, resources, metrics) |
| `/api/v1/admin/tenants` | GET | List all tenants (with filters, pagination) |
| `/api/v1/admin/tenants/{id}/status` | PATCH | Suspend or activate a tenant |
| `/api/v1/admin/users` | GET | List all users |
| `/api/v1/admin/users/{id}/super-admin` | PATCH | Grant or revoke super admin status |
| `/api/v1/admin/users/{id}/active` | PATCH | Activate or deactivate a user |
| `/api/v1/admin/audit-log` | GET | Platform audit log (all admin actions) |
| `/api/v1/admin/impersonate` | POST | Start impersonation session |
| `/api/v1/admin/end-impersonation` | POST | End impersonation, restore admin session |

### User Impersonation

Impersonation allows super admins to view the platform as another user for debugging purposes.

**Safeguards:**

1. **Read-only**: All write operations (POST, PUT, PATCH, DELETE) are blocked during impersonation, except for the end-impersonation endpoint
2. **Time-limited**: Impersonation sessions have a configurable duration (default: 60 minutes)
3. **Audit-logged**: Both start and end of impersonation are logged to `platform_audit_log` with reason, IP, and user details
4. **Reason required**: Admin must provide a reason for impersonation
5. **Cannot self-impersonate**: The API rejects attempts to impersonate yourself
6. **Admin session preserved**: The admin's original session is stored in Redis and restored when impersonation ends

**Impersonation Flow:**

```
1. Admin requests: POST /api/v1/admin/impersonate
   Body: { user_id, reason, duration_minutes }

2. Backend:
   a. Validate super admin status
   b. Look up target user and their first tenant
   c. Create impersonation session (with impersonated_by field)
   d. Store admin's original session_id in Redis
   e. Set new session cookie (shorter TTL)
   f. Log to platform_audit_log

3. During impersonation:
   a. AuthMiddleware detects impersonated_by field
   b. All write requests return 403 "impersonation_read_only"
   c. GET requests work normally, showing target user's data

4. Admin requests: POST /api/v1/admin/end-impersonation
   a. Retrieve original admin session from Redis
   b. Delete impersonation session
   c. Restore admin session cookie
   d. Log end-of-impersonation to audit log
```

### Audit Logging

NeoGuard maintains three audit log tables:

| Table | Scope | What's Logged |
|-------|-------|---------------|
| `audit_log` | Per-tenant | Tenant-level actions (resource changes, alert modifications) |
| `platform_audit_log` | Platform-wide | Super admin actions (tenant suspend, user promote, impersonation) |
| `security_log` | Platform-wide | Auth events (login success/failure, logout, password changes) |

### Frontend Admin Page

The Admin page (visible only to super admins in the sidebar) has four tabs:

1. **Overview** -- Platform stats (total users, tenants, resources, active alerts)
2. **Tenants** -- Table of all tenants with status, member count, suspend/activate actions
3. **Users** -- Table of all users with super admin toggle, activate/deactivate
4. **Audit Log** -- Chronological list of all platform-level administrative actions

---

## 9. Alerting System

### Overview

The alerting system consists of:

- **AlertEngine** -- Background asyncio task evaluating all enabled rules every 15 seconds
- **Alert Rules** -- User-defined threshold conditions on metrics
- **Alert Events** -- History of firings, resolutions, and no-data events
- **Alert Silences** -- Scheduled suppression of notifications
- **Notification Dispatch** -- 6 channel types with retry

### Alert Rule Configuration

| Field | Type | Description |
|-------|------|-------------|
| name | text | Human-readable rule name |
| metric_name | text | The metric to monitor (e.g., `aws.ec2.CPUUtilization`) |
| tags_filter | JSONB | Optional tag matchers (e.g., `{"instance_type": "m5.xlarge"}`) |
| condition | enum | `gt`, `lt`, `gte`, `lte`, `eq`, `ne` |
| threshold | float | Threshold value |
| duration_sec | int | How long the condition must hold before firing (default: 60s) |
| interval_sec | int | Evaluation interval (default: 30s) |
| aggregation | enum | `avg`, `min`, `max`, `sum`, `count`, `last`, `p95`, `p99` |
| severity | enum | `info`, `warning`, `critical` |
| cooldown_sec | int | Minimum time between re-fires (default: 300s) |
| nodata_action | enum | `ok` (clear), `keep` (preserve state), `alert` (fire nodata event) |
| notification | JSONB | Notification channel configuration |

### State Machine

```
              threshold breached
    OK --------------------------> PENDING
    ^                                 |
    |                                 | breached for duration_sec
    |         recovered               v
    +------------ RESOLVED <------- FIRING
                                      |
                                      | cooldown elapsed & still breached
                                      v
                                   (re-fire)

    Any State ---- no data + nodata_action='alert' ----> NODATA
```

**States:**
- **OK** -- Metric is within normal range
- **PENDING** -- Threshold breached but waiting for duration_sec confirmation
- **FIRING** -- Alert is active, notifications sent
- **RESOLVED** -- Previously firing, metric returned to normal
- **NODATA** -- No metric data received (when nodata_action='alert')

### Flapping Detection

If a rule transitions more than 6 times within 1 hour (configurable), it is marked as **flapping**. Flapping alerts:
- Continue evaluating and recording events
- Suppress notification dispatch to prevent notification storms

### Alert Silences

Silences suppress notifications for matching rules or tag patterns.

| Feature | Description |
|---------|-------------|
| One-time silence | Start/end timestamps |
| Recurring silence | Day-of-week + time window (e.g., "Sat-Sun 22:00-06:00 IST") |
| Rule-based | Silence specific rule IDs |
| Tag-based | Silence by tag matchers (e.g., all alerts with `environment=staging`) |
| Enable/disable | Toggle without deleting |

### Notification Channels

| Channel | Protocol | Features |
|---------|----------|----------|
| **Webhook** | HTTP POST + optional HMAC-SHA256 signing | Custom headers, JSON payload, signed with `X-NeoGuard-Signature` |
| **Slack** | Incoming Webhook | Color-coded attachments (red=critical, yellow=warning), rich fields |
| **Email** | SMTP with STARTTLS | Firing and resolved emails with metric details |
| **Freshdesk** | REST API v2 | Auto-creates tickets on fire, adds resolution note + closes on resolve |
| **PagerDuty** | Events API v2 | Trigger with dedup key, auto-resolve, severity mapping |
| **MS Teams** | Adaptive Cards webhook | Rich card format with fact set, color coding |

All senders implement retry with exponential backoff (3 retries, 1-10s delay, jitter). Retryable HTTP status codes: 408, 429, 500, 502, 503, 504.

### Alert Preview / Dry Run

Before creating a rule, users can run a **dry run** to see what the alert would have done over a recent time window -- without actually creating any events or sending notifications.

---

## 10. Tests

### Test Summary

| Category | Count | Framework | Location |
|----------|-------|-----------|----------|
| Backend Unit | 637 | pytest (asyncio_mode=auto) | `tests/unit/` |
| Backend Integration | (available) | pytest | `tests/integration/` |
| Frontend | 72 | vitest + RTL + jsdom | `frontend/src/**/*.test.{ts,tsx}` |
| **Total** | **709** | | |

### Backend Test Files

| Test File | Module Under Test | Key Coverage |
|-----------|-------------------|-------------|
| `test_models.py` | Pydantic models | Metric, resource, alert model validation |
| `test_models_extended.py` | Extended models | Additional model edge cases |
| `test_auth_models.py` | Auth models | User, session, API key models |
| `test_aws_utils.py` | AWS utilities | Credential helpers, region config |
| `test_cloudwatch.py` | CloudWatch | Metric collection, namespace mapping |
| `test_discovery.py` | AWS discovery | All 24 discoverers |
| `test_azure.py` | Azure discovery | All 15 discoverers |
| `test_orchestrator.py` | Orchestrator | Discovery and collection loops |
| `test_telemetry.py` | Telemetry registry | Metrics counters, telemetry emission |
| `test_telemetry_collector.py` | Telemetry collector | Background collection task |
| `test_request_id.py` | RequestID middleware | ULID generation, X-Request-Id header |
| `test_writers.py` | Metric + Log writers | Batch flushing, COPY protocol |
| `test_silences.py` | Alert silences | One-time, recurring, tag matching |
| `test_alert_engine.py` | Alert engine | State machine, all transitions, flapping |
| `test_notifications.py` | Notification senders | All 6 channels, retry logic |
| `test_middleware.py` | Auth middleware | Session auth, API key auth, role mapping |
| `test_auth.py` | Auth routes | Signup, login, logout, /me |
| `test_sessions.py` | Session store | Create, get, delete, update, TTL |
| `test_users_service.py` | User service | CRUD, password hashing, tenant creation |
| `test_admin_service.py` | Admin service | Platform stats, tenant/user management |
| `test_admin_routes.py` | Admin routes | Super admin gating, impersonation |
| `test_auth_telemetry.py` | Auth telemetry | 9 counters, structured logging |
| `test_tenant_ctx.py` | Tenant context | Context variable management |
| `test_bootstrap_cli.py` | Bootstrap CLI | User creation, promotion, validation |
| `test_config.py` | Settings | Configuration loading, defaults |
| `test_system_stats.py` | System stats | /system/stats endpoint |
| `test_csrf.py` | CSRF middleware | Token validation, exempt paths |
| `test_password_reset.py` | Password reset | Token generation, validation, expiry |
| `test_impersonation.py` | Impersonation | Read-only enforcement, session handling |

### Frontend Test Files

| Test File | Component | Key Coverage |
|-----------|-----------|-------------|
| `InfrastructurePage.test.tsx` | Infrastructure page | Tab rendering, resource display |
| `SettingsPage.test.tsx` | Settings page | Wizard, notifications, API keys, team |
| Design system tests (30+) | UI components | Card, Modal, DataTable, Badge, Button, Input, Tabs, Pagination, etc. |

### Running Tests

```bash
# All backend unit tests
pytest tests/unit/ -v

# Specific test file
pytest tests/unit/test_alert_engine.py -v

# Backend integration tests (requires running databases)
NEOGUARD_DB_PORT=5433 pytest tests/integration/ -v

# Frontend tests
cd frontend && npx vitest run

# Frontend tests in watch mode
cd frontend && npx vitest

# Type checking
python -m mypy src/neoguard/
cd frontend && npx tsc --noEmit

# Lint
python -m ruff check src/ tests/
```

### Test Conventions

- **Backend**: pytest with `asyncio_mode=auto`. Unit tests use `AsyncMock` for database calls -- no actual DB needed. Integration tests require `NEOGUARD_DB_PORT=5433`.
- **Frontend**: vitest with React Testing Library (RTL) and jsdom environment.
- **No E2E tests yet** -- Playwright tests are deferred to Phase 8.

### Coverage Gaps (Known)

- Overview, Metrics, Logs, Dashboards, and Alerts pages have no frontend tests
- No load/performance tests (deferred to Phase 8 with Locust)
- No E2E browser tests
- No database-level RLS adversarial tests (integration test environment)

---

## 11. Changelog (Phase 1)

### Phase 1: Auth + Multi-Tenancy (Completed 2026-05-01)

#### Infrastructure

- **Redis Integration**: Added Redis 7.x to Docker Compose, connection singleton in `db/redis/connection.py`
- **Alembic Setup**: Migration framework configured (tables currently in `init.sql`, migration files pending)

#### Database Schema (7 New Tables)

| Table | PK Type | Purpose |
|-------|---------|---------|
| `users` | UUIDv7 | User accounts (email, Argon2id password hash, super admin flag) |
| `tenants` | UUIDv7 | Tenant registry (name, slug, tier, status, quotas) |
| `tenant_memberships` | Composite | User-to-tenant mapping with roles (owner/admin/member/viewer) |
| `user_invites` | UUIDv7 | Pending team invitations |
| `audit_log` | UUIDv7 | Tenant-scoped action audit trail |
| `platform_audit_log` | UUIDv7 | Platform-level admin action audit trail |
| `security_log` | UUIDv7 | Authentication events (login/logout/password changes) |
| `password_reset_tokens` | UUIDv7 | Token-based password reset flow |

#### Row-Level Security

- RLS policies added to **all 13 tenant-scoped tables** (metrics, resources, alert_rules, alert_events, alert_rule_states, alert_silences, dashboards, notification_channels, aws_accounts, azure_subscriptions, collection_jobs, api_keys, audit_log)
- Enforcement via PostgreSQL GUC variable `app.current_tenant_id`

#### Authentication

- **Password Auth**: Argon2id hashing with OWASP-recommended parameters
- **Redis Sessions**: HttpOnly cookie (`neoguard_session`), 30-day sliding TTL
- **Dual Auth Middleware**: Supports both session cookies and API keys
- **Auth Routes**: POST /auth/signup, POST /auth/login, POST /auth/logout, GET /auth/me
- **CSRF Middleware**: Double-submit cookie pattern (`neoguard_csrf`)
- **Password Reset**: Token-based flow (POST /auth/password-reset/request, POST /auth/password-reset/confirm), console email for demo
- **Bootstrap CLI**: `python -m neoguard.cli.bootstrap_admin` -- creates/promotes super admin

#### API Key v2

- **Argon2id hashing** with `obl_live_` prefix (hash_version=2)
- **Backward compatible** with v1 SHA-256 keys (hash_version=1)
- **12-month sunset** plan for v1 keys (ADR-0006)

#### Multi-Tenancy

- **Tenant CRUD**: POST/GET/PATCH /api/v1/tenants
- **Membership Management**: Invite, list members, change roles, remove members
- **Tenant Switching**: POST /api/v1/tenants/{id}/switch (updates session in-place)
- **Role System**: owner > admin > member > viewer

#### Admin Panel

- **Platform Stats**: Total users, tenants, resources, metrics
- **Tenant Management**: List all, suspend/activate
- **User Management**: List all, grant/revoke super admin, activate/deactivate
- **User Impersonation**: Read-only, time-limited, audit-logged, reason required
- **Platform Audit Log**: All admin actions logged with actor, target, IP, timestamp

#### Auth Telemetry

- **9 Metric Counters**: signup, login_success, login_failure, logout, session_created, session_expired, api_key_created, api_key_validated, api_key_rejected
- **Structured JSON Logging**: 7 emit functions for all auth/tenant events

#### Frontend

- **Login Page**: Email + password form with error handling
- **Signup Page**: Registration with tenant name
- **Forgot Password Page**: Password reset request
- **Reset Password Page**: Token-based password reset confirmation
- **AuthContext Provider**: React context for auth state management
- **Protected Routes**: Redirect unauthenticated users to /login
- **Tenant Switcher**: Sidebar dropdown for multi-tenant users
- **User Info + Logout**: Sidebar display of current user with logout button
- **Team Tab (Settings)**: Invite members, change roles, remove members
- **Admin Page**: 4-tab panel (Overview, Tenants, Users, Audit Log) -- super admin only
- **Role-Based UI**: Viewer = read-only, Member = create+edit, Admin/Owner = full management
- **Impersonation Banner**: Visible indicator when viewing as another user

#### Bug Fix: Tenant ID Mismatch

- Migrated 1.18M+ metric rows + 350 rows across 11 tables from text `'default'` to UUID tenant IDs
- Fixed collector/orchestrator to derive `tenant_id` from account objects instead of hardcoded `'default'`
- Fixed CloudWatch and Azure Monitor writers to use `account.tenant_id`
- Added dynamic tenant resolution in telemetry collector

#### Tests Added

- **+76 new backend tests**: sessions, users, admin service, admin routes, models, telemetry, CSRF, password reset, impersonation, bootstrap CLI, config, tenant context
- **Total**: 637 backend unit + 72 frontend = **709 tests passing**

---

## 12. SOP (Standard Operating Procedures)

### SOP-01: Bootstrap a Super Admin

**When**: First-time setup or when a new super admin is needed.

```bash
# Set the database port
export NEOGUARD_DB_PORT=5433

# Create a new super admin
python -m neoguard.cli.bootstrap_admin \
    --email admin@yourcompany.com \
    --password "SecurePassword123!" \
    --name "Platform Admin"

# If the user already exists, they are promoted to super admin.
# A "Platform Admin" tenant is auto-created if the user has no tenants.
```

**Verification**: Log in at http://localhost:5173/login and confirm the Admin nav item appears in the sidebar.

---

### SOP-02: Add an AWS Account for Monitoring

**When**: Connecting a new AWS account to NeoGuard.

1. **Deploy IAM Role** (in the target AWS account):
   - Use the CloudFormation template at `cft/neoguard-role.yml`
   - Note the Role ARN and External ID from the outputs

2. **Add via Settings Page**:
   - Navigate to Settings > Onboarding
   - Click "Add AWS Account"
   - Fill in: Account Name, AWS Account ID (12 digits), Role ARN, External ID
   - Select regions to monitor
   - Click Save

3. **Verify**:
   - Wait 5 minutes for the first discovery cycle
   - Check Infrastructure page for discovered resources
   - Check Metrics page for incoming CloudWatch data

**Alternative (API)**:
```bash
curl -X POST http://localhost:8000/api/v1/aws-accounts \
  -H "Cookie: neoguard_session=<session>" \
  -H "X-CSRF-Token: <csrf>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Account",
    "account_id": "123456789012",
    "role_arn": "arn:aws:iam::123456789012:role/NeoGuardMonitorRole",
    "external_id": "ng-xxxxxxxx",
    "regions": ["us-east-1", "eu-west-1"]
  }'
```

---

### SOP-03: Add an Azure Subscription for Monitoring

**When**: Connecting a new Azure subscription to NeoGuard.

1. **Create Service Principal** (in Azure AD):
   - Register an application in Azure Active Directory
   - Create a client secret
   - Assign Reader role on the target subscription

2. **Add via Settings Page**:
   - Navigate to Settings > Onboarding
   - Click "Add Azure Subscription"
   - Fill in: Name, Subscription ID, Azure Tenant ID, Client ID, Client Secret
   - Select regions to monitor
   - Click Save

3. **Verify**:
   - Wait 5 minutes for Azure discovery
   - Check Infrastructure page for Azure resources

---

### SOP-04: Create an Alert Rule

**When**: Setting up monitoring alerts for a metric.

1. Navigate to **Alerts** page
2. Click **Create Rule**
3. Configure:
   - **Name**: Descriptive name (e.g., "High CPU on Production EC2")
   - **Metric**: Select metric name (e.g., `aws.ec2.CPUUtilization`)
   - **Tags Filter**: Optional (e.g., `instance_type: m5.xlarge`)
   - **Condition**: Select operator (e.g., `gt`) and threshold (e.g., `80`)
   - **Duration**: How long the condition must hold (e.g., `120` seconds)
   - **Aggregation**: How to aggregate the metric (e.g., `avg`)
   - **Severity**: `info`, `warning`, or `critical`
   - **Notification**: Configure channel (Slack webhook URL, PagerDuty routing key, etc.)
   - **No-Data Handling**: What to do if no data arrives (`ok`, `keep`, `alert`)
   - **Cooldown**: Minimum time between re-fires (e.g., `300` seconds)
4. **Preview**: Click "Dry Run" to see how the rule would have behaved over recent data
5. **Save**: Click Create to activate the rule

---

### SOP-05: Impersonate a User (Admin)

**When**: Debugging a user's issue by viewing the platform as them.

**Pre-requisites**: Must be a super admin.

1. Navigate to **Admin** page
2. Go to the **Users** tab
3. Find the target user and click **Impersonate**
4. Enter a **reason** for impersonation (required for audit trail)
5. Set **duration** (default: 60 minutes)
6. Click **Start Impersonation**

**During impersonation**:
- A banner at the top indicates you are impersonating
- All data shown is the target user's data
- All write operations (create, edit, delete) are **blocked** (403 error)
- The impersonation session auto-expires after the set duration

**To end impersonation**:
- Click "End Impersonation" in the banner
- Your original admin session is restored automatically

**Audit**: Both start and end of impersonation are logged to `platform_audit_log`.

---

### SOP-06: Suspend a Tenant (Admin)

**When**: A tenant violates terms or needs to be temporarily disabled.

1. Navigate to **Admin** > **Tenants** tab
2. Find the tenant
3. Click **Suspend**
4. The tenant's status changes to `suspended`
5. All tenant members lose access until reactivated

**To reactivate**: Click **Activate** on the same tenant.

---

### SOP-07: Handle an Alert Incident

**When**: An alert fires and needs investigation.

1. **Acknowledge**: In the Alerts page, find the firing event and click "Acknowledge" to record who is handling it
2. **Investigate**:
   - Click into the alert event to see metric details
   - Navigate to Metrics page with the same metric name and tags
   - Check Infrastructure page for the affected resource
3. **Silence (if needed)**: Create a temporary silence to suppress further notifications while fixing the issue
4. **Resolve**: The alert auto-resolves when the metric returns to normal. Resolution notifications are sent to configured channels.
5. **Post-mortem**: Review the alert event timeline in the Alerts page

---

### SOP-08: Create an API Key

**When**: A machine client needs programmatic access.

1. Navigate to **Settings** > **API Keys** tab
2. Click **Create API Key**
3. Configure:
   - **Name**: Descriptive name (e.g., "CI/CD Pipeline")
   - **Scopes**: Select permissions (`read`, `write`, `admin`)
   - **Rate Limit**: Requests per minute (default: 1000)
   - **Expiry**: Optional expiration date
4. Click **Create**
5. **Copy the raw key immediately** -- it is shown only once and cannot be retrieved later

The key will have the prefix `obl_live_` and use Argon2id hashing (v2).

---

## 13. SOW (Statement of Work)

### Phase Overview

The NeoGuard-to-ObserveLabs evolution follows an 8-phase build plan spanning approximately 70-87 days (75 nominal). The current state is **Phase 1 Complete**.

```
Phase 1 (DONE)  --> Phase 2 --> Phase 3 --> Phase 5 --> Phase 8  [Critical Path]
                      |           |
                  Phase 4     Phase 6, 7  [Parallel tracks]
```

### Phase 1: Auth + Multi-Tenancy Foundation (COMPLETE)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 12-15 days |
| **Status** | COMPLETE (2026-05-01) |
| **Dependencies** | None |

**Deliverables:**
- User auth (email+password, Argon2id, Redis sessions)
- Multi-tenancy (RLS, tenants, memberships, roles, tenant switcher)
- Admin panel (super admin CRUD, impersonation, platform audit log)
- CSRF protection middleware
- Password reset flow
- Bootstrap admin CLI
- Role-based UI constraints
- API key v2 (Argon2id) with v1 compatibility
- Auth telemetry (9 counters + structured logs)
- +76 new backend tests
- Frontend: login, signup, auth context, protected routes, admin page

---

### Phase 2: MQL Query Engine + API Improvements (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 8-10 days |
| **Dependencies** | Phase 1 |

**Deliverables:**
- MQL parser (hand-rolled recursive descent)
- MQL-to-SQL compiler with automatic tenant_id injection
- Support for: avg, min, max, sum, count, last, p95, p99, rate, diff
- Metadata endpoints (metric names, tag values, Redis-cached)
- Batch query endpoint (up to 20 queries)
- Cursor-based pagination (replace offset-based)
- Idempotency key middleware

---

### Phase 3: Dashboards Upgrade (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 10-12 days |
| **Dependencies** | Phase 2 (MQL for widget queries) |

**Deliverables:**
- react-grid-layout (drag, resize)
- 4 widget types: time-series, single-stat, table, top-N bar
- Dashboard variables (dropdown, text, multi-select)
- Auto-refresh controls
- Save/load/clone dashboards

---

### Phase 4: Alerts Enhancement (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 6-8 days |
| **Dependencies** | Phase 2 |

**Deliverables:**
- MQL-based alert conditions
- Alert correlation groups
- Escalation policies
- On-call schedule integration
- Alert analytics (MTTR, frequency reports)

---

### Phase 5: Home + Metrics Explorer (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 8-10 days |
| **Dependencies** | Phase 3 |

**Deliverables:**
- Home page redesign (health banner, firing alerts, favorites, recent dashboards)
- Metrics explorer upgrade (typeahead, multi-query overlay, save-to-dashboard)
- Improved navigation and quick-access features

---

### Phase 6: Onboarding + Settings (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 8-10 days |
| **Dependencies** | Phase 1 |

**Deliverables:**
- Self-service onboarding flow
- CloudFormation wizard (auto-generate IAM role)
- Settings page refactor (split 1,442-line monolith)
- Notification channel testing UI
- Account management improvements

---

### Phase 7: Admin Panel Enhancement (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 8-10 days |
| **Dependencies** | Phase 1 |

**Deliverables:**
- Advanced tenant analytics
- Usage quotas and enforcement
- Billing integration preparation
- Enhanced audit log filtering
- Bulk operations

---

### Phase 8: Real-Time + SSO + Polish (PLANNED)

| Attribute | Detail |
|-----------|--------|
| **Effort** | 10-12 days |
| **Dependencies** | Phase 5 |

**Deliverables:**
- WebSocket/real-time dashboards
- Google/GitHub OAuth
- Azure AD SSO
- Multi-stage production Dockerfile
- HTTPS/TLS with ACM
- CORS production lock-down
- Playwright E2E tests (5 critical paths)
- Locust load testing (100 concurrent users)
- MFA (TOTP with pyotp)
- GDPR export/delete

---

### Timeline Summary

| Phase | Name | Effort | Depends On | Status |
|-------|------|--------|-----------|--------|
| 1 | Auth + Multi-Tenancy | 12-15d | None | **COMPLETE** |
| 2 | MQL Query Engine | 8-10d | Phase 1 | Planned |
| 3 | Dashboards Upgrade | 10-12d | Phase 2 | Planned |
| 4 | Alerts Enhancement | 6-8d | Phase 2 | Planned |
| 5 | Home + Metrics Explorer | 8-10d | Phase 3 | Planned |
| 6 | Onboarding + Settings | 8-10d | Phase 1 | Planned |
| 7 | Admin Panel Enhancement | 8-10d | Phase 1 | Planned |
| 8 | Real-Time + SSO + Polish | 10-12d | Phase 5 | Planned |

**Total**: 70-87 days. Critical path: Phase 1 -> 2 -> 3 -> 5 -> 8.

### Resource Requirements

| Resource | Specification |
|----------|--------------|
| Developer | 1 (solo dev) |
| Infrastructure budget | $500-1000/month AWS |
| AWS account | Single account, 10K metrics/sec peak |
| User target | < 100 users |
| Data retention | 3 months |

---

## 14. Limitations

### Known Limitations

| Category | Limitation | Impact | Workaround |
|----------|-----------|--------|------------|
| **Transport** | No HTTPS/TLS | Data in transit is unencrypted | Use within trusted network; TLS deferred to cloud |
| **CORS** | Wide-open (localhost:5173 + localhost:3000) | Anyone on the network could make API calls | Acceptable for laptop demo; lock down in production |
| **Secrets** | All secrets in environment variables | No rotation, no encryption at rest | Use Secrets Manager in cloud deployment |
| **Email** | Password reset URLs printed to console | Users cannot self-service password reset remotely | Admin manually communicates reset links; SES/SMTP in cloud |
| **Auth** | No MFA | Single factor only | TOTP (pyotp) planned for Phase 8 |
| **Auth** | No OAuth/SSO | Email+password only | Google/GitHub/Azure AD SSO in Phase 8 |
| **Realtime** | No WebSocket | Dashboards poll on interval | WebSocket push in Phase 8 |
| **Query** | No MQL | Metric queries use direct SQL | MQL parser in Phase 2 |
| **Pagination** | Offset-based | Performance degrades on deep pages | Cursor-based migration in Phase 2 |
| **Frontend** | SettingsPage.tsx = 1,442 lines | Difficult to maintain | Component extraction in Phase 6 |
| **Frontend** | AlertsPage.tsx = 1,096 lines | Could benefit from splitting | Phase 6 |
| **Docker** | Single-stage Dockerfile | Larger image, dev dependencies included | Multi-stage in Phase 8 |
| **Logs** | CloudWatch metrics only, no CloudWatch Logs | Missing log collection from AWS | Future enhancement |
| **GCP** | Enum + regions defined, zero implementation | No GCP monitoring | Parked (non-goal) |
| **Testing** | No E2E browser tests | UI regressions not caught | Playwright in Phase 8 |
| **Testing** | No load tests | Unknown performance limits | Locust in Phase 8 |
| **Testing** | 5 pages have no frontend tests | Overview, Metrics, Logs, Dashboards, Alerts untested | Known debt |
| **Data** | 30-day raw data retention | Older data only available in 1m/1h rollups | Configurable via retention policy |
| **Scale** | Single-process architecture | Cannot horizontally scale | Extraction path defined: alert engine first, collector second |
| **Alembic** | New Phase 1 tables in init.sql only | Fresh installs work, but migrations not available for existing databases | Alembic migration files pending |

### Manual Setup Requirements

1. **Bootstrap admin** must be run manually via CLI before first login
2. **AWS IAM role** must be deployed manually in each target account via CloudFormation
3. **Azure service principal** must be created manually in Azure AD
4. **Redis** must be running before the backend starts (Docker Compose handles this)
5. **ClickHouse** must be running for log features to work
6. **Port 5433** must be used for TimescaleDB (5432 is typically occupied)

---

## 15. What's Covered vs Not Covered

### Laptop Demo Scope (NOW) -- What's Covered

| Feature | Status | Details |
|---------|--------|---------|
| User signup (email + password) | DONE | Argon2id hashing, OWASP params |
| User login + session management | DONE | Redis sessions, 30-day sliding TTL |
| CSRF protection | DONE | Double-submit cookie pattern |
| Password reset | DONE | Token-based, console email for demo |
| Multi-tenancy (tenant CRUD) | DONE | Create, list, update tenants |
| Tenant memberships + roles | DONE | owner, admin, member, viewer |
| Tenant switching | DONE | In-place session update |
| Team management (invite, roles, remove) | DONE | Settings > Team tab |
| Row-level security | DONE | RLS on 13 tables |
| API key v1 (SHA-256) | DONE | Legacy, backward compatible |
| API key v2 (Argon2id) | DONE | New standard, `obl_live_` prefix |
| Per-key rate limiting | DONE | Sliding window, 429 + Retry-After |
| Super admin bootstrap CLI | DONE | `python -m neoguard.cli.bootstrap_admin` |
| Admin panel (stats, tenants, users) | DONE | Super admin only |
| User impersonation | DONE | Read-only, time-limited, audit-logged |
| Platform audit log | DONE | All admin actions tracked |
| Security event logging | DONE | Login/logout/password events |
| Auth telemetry (9 counters) | DONE | Structured JSON logs |
| AWS discovery (24 types) | DONE | Live-tested: 43 resources |
| AWS CloudWatch metrics (20 namespaces) | DONE | Live-tested: 88K+ metrics |
| Azure discovery (15 types) | DONE | Live-tested: 9 resources |
| Azure Monitor metrics (10 types) | DONE | Live-tested: 216 metrics |
| Alert rules (CRUD + evaluation) | DONE | 15s eval loop, 8 aggregation types |
| Alert state machine | DONE | OK -> PENDING -> FIRING -> RESOLVED / NODATA |
| Alert state persistence | DONE | Survives restarts |
| Flapping detection | DONE | Configurable threshold + window |
| Alert silences | DONE | One-time, recurring, tag-based |
| Alert preview / dry run | DONE | Test rules before creating |
| Notification channels (6) | DONE | Webhook, Slack, Email, Freshdesk, PagerDuty, MS Teams |
| Notification retry | DONE | Exponential backoff, 3 retries |
| Self-monitoring (32 series) | DONE | neoguard.* metrics |
| Request correlation IDs | DONE | ULID-based X-Request-Id |
| Role-based UI constraints | DONE | Viewer=read-only, member=create+edit |
| Frontend pages (10) | DONE | All with auth, tenant context |
| Design system | DONE | SCSS tokens, 30+ components |
| Unit tests (637) | DONE | All passing |
| Frontend tests (72) | DONE | All passing |

### Cloud Scope (After Boss Approval) -- What's NOT Covered

| Feature | Dependency | Phase |
|---------|-----------|-------|
| Google/GitHub OAuth | Public callback URL + registered OAuth app | 8 |
| Azure AD SSO (SAML/OIDC) | IdP configuration | 8 |
| AWS IAM Identity Center SSO | AWS org setup | 8 |
| Email delivery (SES/SMTP) | Verified domain | 8 |
| HTTPS/TLS | Domain + ACM certificate | 8 |
| CORS lock-down | Production domain | 8 |
| Secrets Manager integration | AWS Secrets Manager | 8 |
| MFA (TOTP) | pyotp + backup codes | 8 |
| GDPR export/delete | S3 for file storage | 8 |
| Multi-stage Dockerfile | Production build optimization | 8 |
| WebSocket/real-time dashboards | Server-Sent Events or WS | 8 |
| MQL query language | Parser + compiler | 2 |
| Dashboard grid upgrade | react-grid-layout | 3 |
| Home page redesign | Spec 01 | 5 |
| Metrics explorer upgrade | Typeahead, multi-query | 5 |
| Load testing | Locust, 100 concurrent users | 8 |
| E2E tests | Playwright, 5 critical paths | 8 |
| CloudFormation onboarding wizard | Customer AWS account | 6 |
| Cursor-based pagination | Replace offset-based | 2 |
| Advanced alert escalation | On-call schedules | 4 |
| Distributed tracing | **Non-goal** | N/A |
| ML/anomaly detection | **Non-goal** | N/A |
| Mobile app | **Non-goal** | N/A |
| Advanced BI | **Non-goal** | N/A |
| GCP monitoring | **Non-goal** (parked) | N/A |

---

## 16. FAQ

### General

**Q1: What is NeoGuard / ObserveLabs?**

NeoGuard is the internal codename for a multi-tenant AWS and Azure infrastructure monitoring platform. The product name for launch is ObserveLabs. It collects metrics from AWS CloudWatch and Azure Monitor, stores them in TimescaleDB, provides alerting with 6 notification channels, and offers a React-based dashboard UI. Think of it as a Datadog alternative for organizations running on AWS and Azure.

---

**Q2: What stage is the project in?**

Phase 1 (Auth + Multi-Tenancy) is complete. The system runs as a laptop demo: all services on a single developer machine using Docker containers for databases. The next step is boss approval to move to AWS cloud infrastructure.

---

**Q3: How many resources can NeoGuard monitor?**

Currently, NeoGuard supports **39 resource types**: 24 AWS services (EC2, EBS, RDS, Aurora, Lambda, ALB, NLB, ELB, DynamoDB, SQS, SNS, ECS, EKS, ElastiCache, S3, CloudFront, API Gateway, Kinesis, Redshift, OpenSearch, Step Functions, NAT Gateway, Route53, EFS, FSx, VPN) and 15 Azure services (VM, Disk, SQL, Function, App Service, AKS, Storage, Load Balancer, App Gateway, CosmosDB, Redis, VNet, NSG, DNS Zone, Key Vault).

---

**Q4: What is the target scale?**

Design target: 10,000 metrics/sec peak ingestion, 100 users, 3-month data retention, $500-1000/month infrastructure budget. Current measured performance: API p99 ~25ms, metric batch (1000 points) ~30ms, discovery cycle (9 AWS regions) ~45s, alert eval loop ~2s.

---

### Technical

**Q5: Why TimescaleDB instead of InfluxDB or Prometheus?**

TimescaleDB was chosen because: (1) it is PostgreSQL-based, meaning standard SQL, existing tooling, and JSONB support work out of the box; (2) continuous aggregates provide automatic rollups without external cron jobs; (3) built-in compression reduces storage costs; (4) RLS for multi-tenancy is native; (5) asyncpg provides excellent async performance.

---

**Q6: Why ClickHouse for logs instead of Elasticsearch?**

ClickHouse provides: (1) columnar storage optimized for log-type queries (filter by time, service, level); (2) extremely fast analytical queries without the index management overhead of Elasticsearch; (3) lower resource footprint; (4) simpler operational model. The current integration uses a thread-pool wrapper for async; native async is available as a prerelease.

---

**Q7: Why not use Tailwind CSS?**

ADR-0005 documents this decision. The project uses SCSS with design tokens to maintain full control over the design system without adding a CSS framework dependency. The token system provides consistent spacing, colors, typography, and component styling. Tailwind/Shadcn adoption is deferred and will be re-evaluated at a future phase gate.

---

**Q8: How does the dual ID system work (ULID vs UUIDv7)?**

ADR-0004 covers this. Pre-Phase-1 tables use ULID (via `python-ulid`), while Phase 1+ tables use UUIDv7 (via `uuid-utils`). Both are time-ordered, so sort order and index performance are equivalent. They coexist: existing tables keep ULID PKs, new tables use UUIDv7. No migration is planned because both formats serve the same purpose.

---

**Q9: Why is port 5433 used instead of 5432?**

The development machine has a local PostgreSQL installation on port 5432. TimescaleDB's Docker container maps its internal 5432 to external 5433 to avoid conflicts. Always set `NEOGUARD_DB_PORT=5433` when running locally.

---

### Authentication & Security

**Q10: How are passwords stored?**

Passwords are hashed with Argon2id using OWASP-recommended parameters (via the `argon2-cffi` library). Raw passwords are never stored or logged. The Argon2id algorithm provides resistance to GPU-based attacks and side-channel attacks.

---

**Q11: How does session expiry work?**

Sessions are stored in Redis with a 30-day TTL. The TTL is **sliding** -- every authenticated request renews the expiry. If a user does not make any request for 30 days, the session expires and they must log in again. Sessions can also be explicitly deleted via logout.

---

**Q12: Is the system secure for production?**

Not yet. The laptop demo is missing several production-grade security features: HTTPS/TLS (traffic is unencrypted), CORS is wide-open (only localhost), secrets are in environment variables (not Secrets Manager), no MFA, no dependency audit (pip-audit/npm audit not run), no PII log scrubbing. These are all planned for Phase 8 (cloud deployment). For the current laptop demo within a trusted network, the security posture is sufficient.

---

**Q13: What happens if Redis goes down?**

If Redis is unavailable: (1) all session-based authentication fails (users cannot log in or stay logged in); (2) rate limiting stops working; (3) the API continues to serve requests authenticated via API keys (which use database lookup, not Redis). Redis should be treated as a critical dependency. In production, Redis will be configured with persistence (RDB or AOF) and optionally replicated.

---

### Operations

**Q14: How do I add a new notification channel type?**

1. Add the new channel type to `ChannelType` enum in `models/notifications.py`
2. Create a new class extending `BaseSender` in `services/notifications/senders.py`
3. Implement `send_firing()` and `send_resolved()` methods
4. Add the sender to the `SENDERS` dict at the bottom of `senders.py`
5. Add tests in `tests/unit/test_notifications.py`
6. No database changes needed -- channel config is stored as JSONB

---

**Q15: How do I add monitoring for a new AWS service?**

1. Add the resource type to `ResourceType` enum in `models/resources.py`
2. Create a discoverer function in `services/discovery/aws_discovery.py` (follow the `_discover_ec2` pattern)
3. Add the discoverer to the `_DISCOVERERS` dict
4. If the service has CloudWatch metrics, add the namespace mapping to `NAMESPACE_FOR_TYPE` in `services/collection/orchestrator.py`
5. Add the resource ID field mapping to `RESOURCE_ID_FIELD`
6. Add unit tests for the new discoverer

---

**Q16: How do I check the health of the system?**

```bash
# Basic health check (no auth required)
curl http://localhost:8000/health

# Detailed system stats (requires auth)
curl -b "neoguard_session=<session>" http://localhost:8000/api/v1/system/stats

# This returns:
# - AlertEngine stats (last run, duration, success/failure counts)
# - Orchestrator stats (discovery and metrics collection)
# - MetricWriter stats (batch sizes, flush counts)
# - LogWriter stats
# - TelemetryCollector stats
```

---

**Q17: What happens during a database migration?**

Currently, all tables are defined in `docker/timescaledb/init.sql` which runs on first container start only. The Alembic migration framework is configured but migration files for Phase 1 tables are pending. For existing installations, schema changes must be applied manually or via Alembic migrations once they are created.

---

**Q18: How do I debug a failing alert rule?**

1. Check `GET /api/v1/system/stats` for AlertEngine stats (consecutive_errors, last_duration_ms)
2. Check backend logs for `Alert evaluation cycle failed` messages
3. Verify the metric exists: query the metric name in the Metrics page
4. Check if the rule is silenced: review active silences in the Alerts page
5. Check the rule state: the alert_rule_states table shows current status, last_value, transition_count
6. Use the Alert Preview / Dry Run feature to test the rule against recent data

---

**Q19: How is tenant data isolated?**

Tenant isolation operates at three levels:
1. **Application level**: AuthMiddleware extracts tenant_id from session/API key and sets it on `request.state`
2. **Context level**: `current_tenant_id` contextvars are set, and all service functions receive tenant_id as a parameter
3. **Database level**: PostgreSQL RLS policies on all 13 tenant-scoped tables enforce `tenant_id = current_setting('app.current_tenant_id')`. Even if application code has a bug, the database prevents cross-tenant data access.

---

**Q20: What monitoring does NeoGuard do on itself?**

NeoGuard collects 32 self-monitoring metrics (prefixed `neoguard.*`):
- Request counts and latencies per endpoint
- Metric ingestion rates and batch sizes
- Alert evaluation timing and state transition counts
- Discovery cycle duration and failure counts
- Session creation/deletion rates
- API key validation rates
- Database connection pool utilization

These are viewable via `GET /api/v1/system/stats` and in the Metrics page by filtering for `neoguard.*`.

---

*End of document.*
