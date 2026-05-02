# NeoGuard — Master To-Do List

**Last Updated**: 2026-05-02
**Status**: Phase 1 Complete, Sprint A+B+1 Complete
**Tests**: 796 total (724 backend + 72 frontend)
**Source of Truth**: This document consolidates CLAUDE.md, all 12 specs, platform-audit.md, CHANGELOG.md, and the prioritized task backlog.

---

## Progress Summary

| # | Area | Done | Pending | % Complete |
|---|------|------|---------|------------|
| 1 | Authentication & Authorization | 27 | 27 | 50% |
| 2 | Multi-Tenancy | 19 | 15 | 56% |
| 3 | Admin Panel | 15 | 22 | 41% |
| 4 | MQL Query Language | 0 | 10 | 0% |
| 5 | Dashboards | 4 | 30 | 12% |
| 6 | Alerting | 19 | 19 | 50% |
| 7 | Metrics Explorer | 1 | 12 | 8% |
| 8 | Infrastructure Monitoring | 15 | 7 | 68% |
| 9 | Home Page | 4 | 15 | 21% |
| 10 | Settings | 8 | 8 | 50% |
| 11 | Notifications | 9 | 5 | 64% |
| 12 | Onboarding | 3 | 20 | 13% |
| 13 | API Keys | 7 | 5 | 58% |
| 14 | Self-Monitoring & Observability | 8 | 9 | 47% |
| 15 | Security | 13 | 12 | 52% |
| 16 | Testing & Quality | 5 | 12 | 29% |
| 17 | DevOps & Infrastructure | 5 | 8 | 38% |
| 18 | Documentation | 7 | 14 | 33% |
| 19 | NeoGuard Agent (Go) | 0 | 16 | 0% |
| **Total** | | **169** | **266** | **39%** |

---

## 1. Authentication & Authorization

### Done
- [x] Email+password signup with Argon2id hashing, OWASP params (Phase 1, Spec 10 FR-01..06)
- [x] Redis session store with HttpOnly cookies, 30-day sliding TTL (Phase 1, Spec 10 FR-82..85)
- [x] Auth middleware: dual-path authentication (session cookies + API keys) (Phase 1, Spec 10 FR-87)
- [x] Auth routes: POST /auth/signup, /auth/login, /auth/logout, GET /auth/me (Phase 1, Spec 10)
- [x] CSRF protection: double-submit cookie pattern (Phase 1, Spec 10 FR-94..98)
- [x] CSRF stale session fix: /auth/me sets CSRF cookie when missing (Sprint B)
- [x] Password reset flow: token-based with rate limiting, console email (Phase 1, Spec 10 FR-58..63)
- [x] Password reset frontend pages (Phase 1)
- [x] Auth telemetry: 9 counters + structured JSON logs for all auth/tenant events (Phase 1)
- [x] Frontend: login page (Phase 1, Spec 10)
- [x] Frontend: signup page (Phase 1, Spec 10)
- [x] Frontend: AuthContext provider (Phase 1)
- [x] Frontend: protected routes + public routes (Phase 1)
- [x] Frontend: user info + logout in sidebar (Phase 1)
- [x] Scope-based authorization: read/write/admin/platform_admin (Foundation)
- [x] Backend RBAC enforcement: require_scope on ALL 27 write endpoints across 9 route files (Sprint A)
- [x] Role-based UI constraints: viewer=read-only, usePermissions hook across all pages (Phase 1)
- [x] Super admin bootstrap CLI: `python -m neoguard.cli bootstrap-admin` (Phase 1)
- [x] Super admin 4-hour session expiry (Sprint A, Spec 00 section 4.2)
- [x] Internal metric protection: neoguard.* metrics blocked from non-admin users (Sprint A)
- [x] User impersonation: read-only session, time-limited, audit-logged, yellow banner (Phase 1, Spec 11 FR-52..59)
- [x] Admin create user endpoint: POST /admin/users with optional tenant+role assignment (Sprint B)
- [x] Invite flow fix: signups auto-accept pending invites (Sprint B)
- [x] Admin Users UI: "Create User" inline form in admin panel (Sprint B)
- [x] Password validated min 12 chars (Spec 10 FR-03)
- [x] "Email verification coming soon" info banner on signup (Sprint A)
- [x] Rate limiting on auth endpoints (5/15min login, 10/hr signup) (Sprint 1 2026-05-02, Spec 10 FR-04, FR-15..17)

### Pending
- [ ] Google OAuth (signup + login + account linking) (Spec 10 FR-08..13, P1, 8h, blocked-by: public callback URL)
- [ ] GitHub OAuth (Spec 10 P1, 8h, blocked-by: public callback URL)
- [ ] Azure AD SSO (OIDC) per-tenant config + login flow + JIT provisioning (Spec 10 FR-21..33, P1, 12h, blocked-by: IdP config + public URL)
- [ ] AWS IAM Identity Center SSO (SAML 2.0) per-tenant config + login flow (Spec 10 FR-34..50, P1, 12h, blocked-by: AWS org setup + public URL)
- [ ] SSO identity table + domain mapping + general SSO requirements (Spec 10 FR-51..57, P1, 4h, blocked-by: OAuth/SSO above)
- [ ] MFA/TOTP setup flow: QR code, 6-digit confirm, recovery codes (Spec 10 FR-65..68, P1, 8h, blocked-by: cloud for secure backup)
- [ ] MFA challenge at login (TOTP + recovery code) (Spec 10 FR-70..75, P1, 4h, blocked-by: MFA setup)
- [ ] MFA mandatory for Super Admins (Spec 10 FR-76..77, P1, 2h, blocked-by: MFA setup)
- [ ] MFA-fresh check for sensitive actions (password change, API key create, SSO config) (Spec 10 FR-78..80, P1, 3h, blocked-by: MFA setup)
- [ ] MFA recovery: manual recovery via support + admin reset (Spec 10 FR-81, P2, 2h, blocked-by: MFA)
- [ ] Account linking: password + OAuth + SSO on same email (Spec 10 FR-99..102, P2, 6h, blocked-by: OAuth)
- [ ] Email verification flow (send verification email, verify token, restrict unverified users) (Spec 10 FR-09..14 + 09 FR-09..14, P1, 4h, blocked-by: cloud email SES/SMTP)
- [ ] Active sessions UI: list all sessions with device/IP/last active + revoke button (Spec 10 FR-108..110, P1, 4h, none)
- [ ] "Log out everywhere" — terminate all sessions (Spec 10 FR-106..107, P1, 2h, none)
- [ ] Password change invalidates all other sessions + email notification (Spec 10 FR-117..120, P1, 2h, none)
- [ ] Email change flow: MFA-fresh + verify new address + notify old (Spec 10 FR-111..116, P2, 6h, blocked-by: email delivery)
- [ ] Account lockout: 10 failed attempts in 15min -> 5min lockout (Spec 10 FR-17, P1, 2h, none)
- [ ] HIBP password breach check at signup and password change (Spec 10 FR-03, Spec 00 section 4.5, P2, 2h, external API)
- [ ] Session fixation prevention: regenerate session ID on login/privilege change (Spec 10 section 6.3, P2, 1h, none)
- [ ] Admin-specific login on separate subdomain (Spec 10 FR-121..128, Spec 11 FR-01, Deferred, 6h, blocked-by: cloud domain)
- [ ] Separate admin cookie `__Host-neoguard_admin` (Spec 10 FR-123, Deferred, 2h, blocked-by: separate subdomain)
- [ ] CAPTCHA on signup + password reset (Cloudflare Turnstile) (Spec 10 section 6.3, Deferred, 4h, blocked-by: cloud)
- [ ] HSTS headers with 1-year max-age + preload (Spec 10 section 6.3, Deferred, 1h, blocked-by: HTTPS)
- [ ] SSO-only mode: disable password for SSO tenants (Spec 10 P2, 4h, blocked-by: SSO)
- [ ] WebAuthn / hardware key backup for Super Admins (Spec 10 P2, 12h, blocked-by: cloud)
- [ ] Login notifications on new device (Spec 10 P1, 4h, blocked-by: email delivery)
- [ ] Geo-based anomaly detection for logins (Spec 10 P1, 6h, blocked-by: MaxMind IP geo DB)

---

## 2. Multi-Tenancy

### Done
- [x] DB tables: tenants, users, tenant_memberships, user_invites (UUIDv7) (Phase 1, Spec 00 section 20)
- [x] tenant_id on every data table (Foundation + Phase 1)
- [x] RLS policies on ALL existing data tables (app-level WHERE clauses) (Phase 1, Spec 00 section 3.5)
- [x] Tenant CRUD routes: POST/GET/PATCH /tenants (Phase 1, Spec 00 section 3)
- [x] Tenant invite + member CRUD + role management (owner/admin/member/viewer) (Phase 1, Spec 00 section 3.3)
- [x] Frontend: tenant switcher in sidebar (visible if user has 2+ tenants) (Phase 1, Spec 00 section 4.3)
- [x] Self-service signup: auto-creates tenant (Free tier) with user as Owner (Phase 1, Spec 00 section 3.7)
- [x] Tenant ID migration: 1.18M+ rows from "default" to UUID tenant IDs (Sprint B)
- [x] Fixed 4 source files to derive tenant_id from account objects (Sprint B)
- [x] Super admin platform-wide access: bypass filtering, tenant_id=None (Phase 1, Spec 00 section 3.4)
- [x] Super admin access audit: all 55+ routes and 40+ service functions verified (Sprint B)
- [x] Every list_*/get_* service function handles tenant_id=None (Sprint B)
- [x] Tenant creation limit: 3 tenants per user (Sprint A)
- [x] Per-tenant roles stored in tenant_memberships (Phase 1, Spec 00 section 3.3)
- [x] Tenant context propagation via session current_tenant_id (Phase 1, Spec 00 section 3.6)
- [x] Killed zombie collector agents writing stale default tenant data (Sprint B)
- [x] Super admin can scope to one tenant via ?tenant_id=X query param (Phase 1)
- [x] Writes scoped to session's own tenant for super admin (get_tenant_id_required) (Phase 1)
- [x] Tenant name in global top bar ("ACME Corp · owner" on every page via Layout) (Sprint 1 2026-05-02, Spec 01 FR-04, Spec 02 section 8.5)

### Pending
- [ ] DB-level RLS enforcement: ALTER TABLE ENABLE ROW LEVEL SECURITY + SET LOCAL app.tenant_id (Spec 00 section 3.5, P2, 8h, none — high risk, careful testing needed)
- [ ] Tenant suspension flow: status=suspended, read-only, alerts still evaluate (Spec 00 section 3.7, P2, 6h, none)
- [ ] Tenant deletion with 30-day grace period + daily reminder emails (Spec 00 section 3.7, P2, 8h, blocked-by: email delivery)
- [ ] Suspended tenant banner shown to all tenant users (Spec 01 FR-05, P2, 2h, blocked-by: suspension flow)
- [ ] Pending-deletion tenant banner with countdown + cancel button (Spec 01 FR-06, P2, 2h, blocked-by: deletion flow)
- [ ] Quota enforcement at creation + runtime (all Spec 00 section 3.8 limits) (Spec 00 section 3.8, P2, 12h, none)
- [ ] Noisy neighbor prevention: per-tenant evaluation queue, fair scheduling (Spec 00 section 3.9, P3, 12h, none)
- [ ] Cross-tenant forbidden operations enforcement (Spec 00 section 3.10, P2, 4h, none)
- [ ] Tenant slug (URL-safe, unique) auto-generated and editable (Spec 00 section 20, P3, 2h, none)
- [ ] Tenant tier system (free/pro/enterprise) with enforced differences (Spec 00 section 3.8, P3, 8h, none)
- [ ] Tenant settings JSONB (timezone, retention display, preferences) (Spec 00 section 20, P2, 3h, none)
- [ ] Tenant context does not leak across async boundaries (tested) (Spec 00 section 22, P1, 4h, none)
- [ ] User removed from tenant mid-session: 403, redirect to tenant switcher (Spec 10 FR-92, P1, 3h, none)
- [ ] Session invalidated on membership removal (Spec 10 FR-92, P1, 2h, none)
- [ ] Last owner protection: cannot remove last owner without transferring (Spec 00 section 3.3, P2, 2h, none)

---

## 3. Admin Panel

### Done
- [x] DB tables: audit_log, platform_audit_log, security_log (UUIDv7) (Phase 1, Spec 00 section 20)
- [x] Admin routes under /api/v1/admin/* (super_admin gated) (Phase 1, Spec 11)
- [x] Admin stats endpoint (Phase 1, Spec 11 FR-18..19)
- [x] Tenant management: list, suspend/activate (Phase 1, Spec 11 FR-11..17)
- [x] User management: grant/revoke super_admin, activate/deactivate (Phase 1, Spec 11 FR-60..68)
- [x] Platform audit log (all admin actions logged, append-only) (Phase 1, Spec 00 section 4.7)
- [x] Frontend: Admin page (overview stats, tenants table, users table, audit log) (Phase 1)
- [x] Admin nav item (visible only to super admins) (Phase 1)
- [x] Admin visual distinction: red "SUPER ADMIN MODE" banner (Sprint A, Spec 00 section 5.8)
- [x] Destructive action confirmations: typed confirmation for suspend/delete (Sprint A, Spec 11 FR-43)
- [x] Admin create user with optional tenant assignment and role (Sprint B, Spec 11 FR-35..37)
- [x] User impersonation with reason, time-limited, read-only sessions, audit-logged (Phase 1, Spec 11 FR-52..59)
- [x] Impersonation banner visible in UI (Phase 1, Spec 11 FR-55)
- [x] Bootstrap CLI for first platform_owner (Phase 1, Spec 11)
- [x] Security log table created (Phase 1)

### Pending
- [ ] Platform role tiers: platform_owner, platform_admin, platform_support, platform_billing (Spec 00 section 3.4, Spec 11 FR-09..10, P2, 6h, none)
- [ ] Role-based access matrix enforcement: all 4 roles x all capabilities (Spec 11 section 5.2, P2, 4h, none)
- [ ] Tenant detail page with 5 tabs: overview, users, billing, quotas, audit (Spec 11 section 5.4, P2, 12h, none)
- [ ] Tenant creation from admin (for sales-assisted onboarding) (Spec 11 FR-35..37, P2, 4h, none)
- [ ] Tenant deletion with multi-step confirmation (type name, reason, password, MFA) (Spec 11 FR-42..46, P2, 6h, none)
- [ ] Tenant deletion 30-day grace period + daily reminder emails + hard delete cron (Spec 11 FR-44..45, P2, 6h, blocked-by: email delivery)
- [ ] Quota override per tenant (time-bound, reason required, audited) (Spec 11 FR-47..51, P2, 6h, none)
- [ ] Quota override expiry cron job (nightly) (Spec 11 FR-50, P2, 2h, none)
- [ ] Security log viewer in admin: auth failures, rate limit breaches, suspicious patterns (Spec 11 FR-80..83, P2, 3h, none)
- [ ] System metrics dashboard in admin (platform-wide health) (Spec 11 FR-84..85, P1, 4h, none)
- [ ] Feature flags listing (read-only view in admin) (Spec 11 FR-86..87, P3, 4h, none)
- [ ] Feature flags module: DB-backed, Redis-cached, per-tenant targeting (Spec 00 section 13, P3, 12h, none)
- [ ] GDPR data export: async job, JSON/CSV bundle, pre-signed S3 link (Spec 11 FR-88..93, Deferred, 12h, blocked-by: S3)
- [ ] GDPR data deletion: 7-day cooling + purge, multi-step confirmation (Spec 11 FR-94..97, Deferred, 8h, blocked-by: S3)
- [ ] Platform admins management page: list, add, change role, revoke (Spec 11 FR-69..73, P2, 4h, none)
- [ ] Cross-tenant user search in admin (Spec 11 FR-60..62, P2, 3h, none)
- [ ] User detail page in admin: all tenants, activity, sessions, actions (Spec 11 FR-63..68, P2, 6h, none)
- [ ] Force password reset for any user (admin action) (Spec 11 FR-67, P2, 2h, none)
- [ ] Terminate all sessions for a user (admin action) (Spec 11 FR-67, P2, 1h, none)
- [ ] Admin session countdown warning at 15min, 5min, 1min remaining (Spec 11 FR-04, P2, 2h, none)
- [ ] Impersonation auto-exit on tab close / inactivity (Spec 11 FR-59, P2, 3h, none)
- [ ] Admin panel audit log CSV export (Spec 11 FR-78, P1, 3h, none)

---

## 4. MQL Query Language

### Done
(none -- this is the single biggest gap)

### Pending
- [ ] MQL grammar definition (tokenizer) per Spec 00 section 6.1 (Spec 00 section 6, P0, 8h, none)
- [ ] MQL parser: tokenizer + AST (hand-rolled recursive descent or ANTLR) (Spec 00 section 6.3, P0, 8h, none)
- [ ] MQL compiler: AST -> TimescaleDB SQL with time_bucket() + aggregates (Spec 00 section 6.3, P0, 16h, none)
- [ ] Tenant ID injection at compile time (critical security invariant) (Spec 00 section 6.3, P0, 2h, none)
- [ ] MQL variable substitution ($variable_name) resolved before execution (Spec 00 section 6.2, P1, 4h, none)
- [ ] MQL functions: rate(), derivative(), moving_average(N), as_rate(), as_count(), abs(), log() (Spec 00 section 6.1, P1, 8h, none)
- [ ] MQL execution limits: max 50 series, 500 points, 10s timeout, concurrency limits (Spec 00 section 6.4, P1, 4h, none)
- [ ] MQL typeahead API: metric names + tag keys + tag values (tenant-scoped metadata cache) (Spec 04 FR-03..04, P1, 4h, none)
- [ ] MQL validation + dry-run endpoint (Spec 02 FR-42, P1, 4h, none)
- [ ] Formula support: multi-query arithmetic (q1 / q2 * 100) (Spec 02 FR-41, P2, 8h, none)

---

## 5. Dashboards

### Done
- [x] Dashboard CRUD: create, update, delete, duplicate (Foundation, Spec 02 FR-01..05)
- [x] Dashboard list API with search (Foundation)
- [x] Frontend: DashboardsPage with basic display (Foundation)
- [x] System Monitor tab admin-only; default tab context-aware (Sprint A)

### Pending
- [ ] Widget data model (DB table: widgets with id, dashboard_id, tenant_id, type, layout, queries, display_options) (Spec 02 section 7, P0, 4h, none)
- [ ] Widget CRUD API: create, update, delete, duplicate widgets (Spec 02 FR-15..22, P0, 4h, none)
- [ ] Timeseries widget: line/area chart powered by MQL query (Spec 02 FR-15, P0, 8h, blocked-by: MQL)
- [ ] Single value widget: big number + optional sparkline + delta (Spec 02 FR-15, P0, 4h, blocked-by: MQL)
- [ ] Top list widget: ranked bar chart (Spec 02 FR-15, P1, 4h, blocked-by: MQL)
- [ ] Text widget: markdown block, sanitized server-side (Spec 02 FR-15, P1, 2h, none)
- [ ] 12-column grid layout: drag + resize via react-grid-layout (Spec 02 FR-09..14, P0, 12h, none)
- [ ] Widget editor drawer: type picker, query builder, display options, live preview (Spec 02 section 8.3, P0, 8h, blocked-by: MQL)
- [ ] Dashboard time controls: presets (5m/15m/1h/4h/24h/7d/30d) + custom absolute (Spec 02 FR-23..28, P0, 4h, none)
- [ ] Time range as URL state: ?from=X&to=Y (unix seconds) (Spec 02 FR-24, P1, 4h, none)
- [ ] Dashboard variables system: static_list + metric_tag_values types (Spec 02 FR-29..35, P1, 8h, blocked-by: MQL)
- [ ] Variable dropdowns in dashboard top bar (Spec 02 FR-30, P1, 4h, blocked-by: variables system)
- [ ] Variable values in URL: ?var-env=prod (Spec 02 FR-32, P1, 2h, blocked-by: variables)
- [ ] Auto-refresh: off / 10s / 30s / 1m / 5m selector (Spec 02 FR-27, P1, 2h, none)
- [ ] Query batching: POST /api/v1/query/batch (multiple queries in one request) (Spec 02 FR-48, P1, 4h, blocked-by: MQL)
- [ ] Query caching: Redis, key=hash(tenant_id + query + time_bucket), stale-while-revalidate (Spec 02 FR-50, P1, 4h, blocked-by: MQL)
- [ ] Metric metadata service for typeahead: GET /metadata/metrics, /metadata/tags/:metric (Spec 02 section 9, P1, 4h, blocked-by: MQL)
- [ ] Share button: copies URL with full state (time + variables, tenant from session) (Spec 02 FR-57..60, P1, 2h, none)
- [ ] Pre-built starter dashboards per resource type (AWS EC2, RDS, Lambda, DynamoDB) (Spec 09 FR-29..33, P1, 8h, blocked-by: widget system)
- [ ] Quota enforcement: creation blocked at tier dashboard limit (Spec 02 FR-06, P2, 2h, blocked-by: quota system)
- [ ] Retention-aware time picker: disable presets beyond tenant retention tier (Spec 02 FR-28, P2, 2h, blocked-by: tier system)
- [ ] Dashboard soft-delete with 30-day recovery (Spec 02 FR-04, P2, 2h, none)
- [ ] Dashboard versioning (Spec 02 P1, P2, 6h, none)
- [ ] Widget title variable interpolation: "CPU for $env" (Spec 02 FR-21, P2, 1h, blocked-by: variables)
- [ ] Skeleton shimmer rendering before data arrives (Spec 02 FR-14, P2, 2h, none)
- [ ] Dashboard empty state: "Create your first dashboard" CTA (Spec 02 section 8.1, P2, 1h, none)
- [ ] Viewer role: hide "+ New Dashboard", hide edit actions (Spec 02 FR-07, P2, 1h, none -- partially done via Sprint A)
- [ ] WebSocket live mode: one WS per dashboard, server pushes deltas (Spec 02 FR-53..56, Deferred, 12h, blocked-by: cloud)
- [ ] Markdown widget sanitization with bleach server-side (Spec 02 section 6.3, P2, 2h, none)
- [ ] Dashboard keyboard shortcuts: c (new), e (edit mode), t (time picker), / (focus search) (Spec 02 section 8.4, P3, 3h, none)

---

## 6. Alerting

### Done
- [x] Rule CRUD: create, update, delete, duplicate (Foundation, Spec 03 FR-01..05)
- [x] AlertEngine: 15s eval loop (Foundation, Spec 03 FR-08..09)
- [x] State machine: ok -> pending -> firing -> resolved -> nodata (Foundation, Spec 03 FR-14..20)
- [x] State persistence: survives restarts (Foundation)
- [x] 8 aggregation types: avg/min/max/sum/count/last/p95/p99 (Foundation, Spec 03 FR-37)
- [x] Configurable cooldown (Foundation)
- [x] No-data handling: ok/keep/alert (Foundation, Spec 03 FR-18)
- [x] Flapping detection (Foundation)
- [x] Silences: one-time + recurring + tag matchers (Foundation, Spec 03 FR-29..30)
- [x] Alert preview / dry-run (Foundation, Spec 03 FR-02)
- [x] Event acknowledgment (Foundation)
- [x] Notification dispatch on fire/resolve (Foundation, Spec 03 FR-21..24)
- [x] Deduplication: same rule + same fire -> one notification per channel (Foundation, Spec 03 FR-26)
- [x] Retry with exponential backoff (1s, 4s, 16s) (Foundation, Spec 03 FR-27)
- [x] Frontend: AlertsPage with rules, events, silences tabs (Foundation)
- [x] "Coming soon" placeholder for MQL Query Language (Sprint A)
- [x] Rule tagging (Foundation, Spec 03 FR-01)
- [x] Rule enable/disable (Foundation, Spec 03 FR-20)
- [x] P1-P4 severity levels (AlertSeverity StrEnum in models/alerts.py) (was already done, confirmed Sprint 1 2026-05-02)

### Pending
- [ ] Alert detail page: /alerts/:id with metric chart + threshold line + history timeline (Spec 03 FR-38, P1, 6h, none)
- [ ] Composite alerts: A AND B, A OR B with per-metric conditions (Spec 03 FR-58..60, P1, 8h, blocked-by: MQL)
- [ ] Alert grouping / incident model: auto-group when 3+ alerts fire within 5min on related resources (Spec 03 FR-61..64, P2, 12h, none)
- [ ] Maintenance windows: tenant admin scoped mutes with name, start, end, scope filter (Spec 03 FR-31, P1, 4h, none)
- [ ] Maintenance windows DB table + API (Spec 03 section 9.1, P1, 3h, none)
- [ ] Maintenance window banner on alerts page (Spec 03 FR-31, P1, 1h, blocked-by: maintenance windows)
- [ ] Tag-based bulk operations: "mute all rules tagged service:api for 2 hours" (Spec 03 FR-07, P2, 3h, none)
- [ ] Bulk operations UI: checkboxes + enable/disable/mute/delete (Spec 03 FR-06, P2, 4h, none)
- [ ] Alert history export: CSV/JSON (Spec 03 FR-35, P2, 3h, none)
- [ ] Alert rule name unique per tenant enforcement (Spec 03 section 9.1, P3, 1h, none)
- [ ] Notification per-tenant rate limit: max 100/min (Spec 03 FR-28, P2, 2h, none)
- [ ] Anomaly detection: basic STL decomposition + MAD on residuals (Spec 03 FR-43..48, P2, 20h, blocked-by: MQL)
- [ ] Forecast alerts: predict breach in N hours (linear, Holt-Winters) (Spec 03 FR-49..52, P2, 12h, blocked-by: anomaly detection)
- [ ] Change-point detection (BOCPD/PELT) (Spec 03 FR-53..55, P3, 10h, blocked-by: anomaly detection)
- [ ] Auto-threshold suggestions from historical p95/p99/max + "would have fired N times" preview (Spec 03 FR-56..57, P2, 8h, blocked-by: MQL)
- [ ] ML model per-tenant partitioned training + storage isolation (Spec 03 section 9.2, P3, 16h, blocked-by: S3)
- [ ] User feedback loop on ML alerts: thumbs up/down (Spec 03 FR-66..68, P3, 4h, blocked-by: ML alerts)
- [ ] SLO tracking + error budget alerting (Spec 03 P3, P3, 16h, none)
- [ ] Hysteresis: different fire vs recover thresholds (Spec 03 P1, P3, 4h, none)

---

## 7. Metrics Explorer

### Done
- [x] Basic metrics page with single metric selection (Foundation, Spec 04)

### Pending
- [ ] Multi-query overlay: 2-5 queries on one chart, each with own color (Spec 04 FR-02, P1, 6h, blocked-by: MQL)
- [ ] Metric typeahead: autocomplete metric names from tenant's known metrics (Spec 04 FR-03, P1, 4h, blocked-by: MQL metadata cache)
- [ ] Tag key/value typeahead within {} (Spec 04 FR-04, P1, 3h, blocked-by: MQL metadata cache)
- [ ] Chart type switcher: timeseries, single value, top list, table (Spec 04 FR-06, P1, 6h, none)
- [ ] Legend with stats: series name, last/min/max/avg over range (Spec 04 FR-07, P1, 4h, none)
- [ ] Crosshair hover: all series values at that timestamp (Spec 04 FR-08, P2, 4h, none)
- [ ] "Save as widget" -> select dashboard, widget title, confirm (Spec 04 FR-09, P1, 4h, blocked-by: widget system)
- [ ] URL state: queries[], time_range, chart_type encoded in URL params (Spec 04 FR-10, P1, 4h, none)
- [ ] Recent queries: last 20 in local storage, accessible via dropdown (Spec 04 FR-11, P2, 2h, none)
- [ ] Keyboard shortcuts: Cmd+K for history, Cmd+Enter to run (Spec 04 section 11, P2, 2h, none)
- [ ] Chart renders in <500ms from query submit (Spec 04 FR-05, P1, 0h, performance target)
- [ ] Click legend item -> isolate (solo) or hide series (Spec 04 FR-07, P2, 2h, none)

---

## 8. Infrastructure Monitoring

### Done
- [x] 24 AWS resource discoverers (EC2, EBS, RDS, Aurora, Lambda, S3, DynamoDB, etc.) (Foundation, Spec 05)
- [x] 20 CloudWatch metric namespaces covering all 24 resource types (Foundation)
- [x] Assume-role with external-id for cross-account IAM (Foundation)
- [x] Live-tested AWS: 43 resources discovered, 88,727+ metrics ingested (Foundation)
- [x] 15 Azure resource discoverers (VM, Disk, SQL, Function, AKS, etc.) (Foundation)
- [x] 10 Azure Monitor metric types, ~78 total metrics defined (Foundation)
- [x] Service principal auth with credential cache + client cache (Foundation)
- [x] Live-tested Azure: 9 resources discovered, 216 metrics ingested (Foundation)
- [x] Frontend: Infrastructure page with 24 AWS tabs + drill-down (Foundation, Spec 05)
- [x] Resource search + pagination (Foundation, Spec 05 FR-01..03)
- [x] Resource detail page with canonical metrics per type (Foundation, Spec 05 FR-07)
- [x] Resource soft-delete when no longer discovered (Foundation, Spec 05)
- [x] Discovery refresh cycle (~45s for 9 AWS regions) (Foundation)
- [x] Resource upsert: dedup by external_id (Foundation)
- [x] Azure resource tabs in infrastructure page frontend (was already done; 12 metric name mismatches fixed Sprint 1 2026-05-02, Spec 05)

### Pending
- [ ] Resource -> alert association: detail page shows active alerts for resource (Spec 05 FR-08, P1, 4h, none)
- [ ] "Create alert on this resource" shortcut on detail page (Spec 05 FR-09, P2, 2h, none)
- [ ] Staleness indicator: last seen > 15min (Spec 05 FR-10, P2, 2h, none)
- [ ] Resource health status aggregated from metrics (Spec 05 P1, P2, 6h, none)
- [ ] "AWS integration not connected" empty state + CTA to connect (Spec 05 section 9, P2, 1h, none)
- [ ] Filter sidebar: type (multi), region (multi), state (multi), has-alert (yes/no) (Spec 05 FR-04, P2, 4h, none)
- [ ] CloudWatch Logs collection (currently only metrics collected, not logs) (CLAUDE.md section 8, P3, 16h, none)

---

## 9. Home Page

### Done
- [x] OverviewPage: status, resource count, firing alerts, alert rules, system health (Foundation)
- [x] OverviewPage: stat cards, alert summary, coming soon cards (Sprint A)
- [x] Admin-only CPU/Memory charts on Overview (Sprint A)
- [x] Tenant name + role shown in top nav (Sprint 1 2026-05-02, via Layout.tsx global top bar, Spec 01 FR-04)

### Pending
- [ ] System health banner: OK/Degraded/Critical based on firing alerts by severity (Spec 01 FR-07..10, P1, 4h, none)
- [ ] Firing alerts panel: currently firing grouped by severity (P1/P2/P3) (Spec 01 FR-11..15, P1, 4h, none)
- [ ] Quick stats strip: dashboards count, alert rules (with firing), 24h alerts, ingestion rate (Spec 01 FR-21..22, P1, 3h, none)
- [ ] Quick actions: "+ Dashboard", "+ Alert", "Explore Metrics" CTAs (Spec 01 FR-28..30, P2, 2h, none)
- [ ] Keyboard shortcuts: d (new dashboard), a (new alert), e (explorer) (Spec 01 FR-29, P3, 1h, none)
- [ ] Favorite dashboards: user can pin dashboards to home (per user, per tenant) (Spec 01 FR-16..20, P2, 8h, blocked-by: dashboard widget system)
- [ ] home_pins DB table (user_id, tenant_id, dashboard_id, position) (Spec 01 section 7, P2, 2h, none)
- [ ] Recent activity feed: last 24h of tenant activity (Spec 01 FR-23..27, P2, 6h, none)
- [ ] activity_events DB table (Spec 01 section 7, P2, 2h, none)
- [ ] Quota usage indicators: >80% warning with upgrade CTA (Spec 01 FR-31..33, P3, 4h, blocked-by: quota system)
- [ ] Empty state for new tenant: onboarding welcome + connect AWS CTA (Spec 01 section 8.3, P2, 3h, none)
- [ ] Suspended tenant state: full-page banner explaining suspension (Spec 01 section 8.4, P2, 2h, blocked-by: suspension flow)
- [ ] Real-time banner updates via WebSocket (Spec 01 FR-09, Deferred, 4h, blocked-by: cloud WS)
- [ ] Error boundaries per section: one section failing doesn't break page (Spec 01 section 6.3, P2, 2h, none)
- [ ] Platform admin actions appear in activity feed with transparency label (Spec 01 FR-27, P2, 2h, blocked-by: activity feed)

---

## 10. Settings

### Done
- [x] Settings page with 6+ sub-tabs: Profile, Cloud Accounts, Notifications, API Keys, Team, Audit, Tenant (Phase 1, Spec 06)
- [x] Profile tab: name + password change (Phase 1, Spec 06)
- [x] Cloud Accounts tab: AWS integration wizard with test connection (Foundation, Spec 06)
- [x] Team tab: invite, roles, remove members (Phase 1, Spec 06)
- [x] API Keys tab (Foundation, Spec 06 + 08)
- [x] Notifications tab (Foundation, Spec 06 + 07)
- [x] SettingsPage split from 1,442-line monolith into 6 sub-components (Sprint A)
- [x] Role-based tab visibility (Sprint A, Spec 06)

### Pending
- [ ] Tenant settings tab: tenant name edit, timezone default, retention tier display (Spec 06 section 2, P0, 2h, none)
- [ ] Audit log tab visible to tenant admins (not just super admin) (Spec 06 section 2, P1, 3h, none)
- [ ] Audit log CSV export (Spec 06 section 3, P1, 3h, none)
- [ ] Notification delivery history/stats per channel (Spec 07 section 4, P2, 3h, none)
- [ ] API key usage stats: requests/day over last 30 days (Spec 08 section 2, P2, 4h, none)
- [ ] SSO configuration page: Azure AD + AWS IAM Identity Center setup wizard (Spec 10 FR-21..40, Deferred, 12h, blocked-by: SSO implementation)
- [ ] Billing tab: usage + invoices (Spec 06 section 2, Deferred, 8h, blocked-by: billing system)
- [ ] Timezone preference in profile (Spec 06 section 2, P2, 1h, none)

---

## 11. Notifications

### Done
- [x] 6 channel types: webhook+HMAC, Slack, email, Freshdesk, PagerDuty Events API v2, MS Teams Adaptive Cards (Foundation, Spec 07)
- [x] Pluggable sender architecture (Foundation)
- [x] Dispatch on fire/resolve (Foundation, Spec 03 FR-21..24)
- [x] Freshdesk ticket lifecycle (Foundation)
- [x] Retry with exponential backoff (1s, 4s, 16s) (Foundation, Spec 07 section 3)
- [x] Test notification button (Foundation, Spec 07 section 3)
- [x] Failed delivery logged + surfaced in UI (Foundation, Spec 07 section 3)
- [x] Channel deletion warns if alerts reference it (Foundation, Spec 07 section 6)
- [x] SSRF protection: validate_outbound_url blocks RFC1918, link-local, metadata endpoints; used in all 6 senders, 13 tests (was already done, confirmed Sprint 1 2026-05-02, Spec 07 section 5)

### Pending
- [ ] Webhook URL encryption at rest (pgcrypto or Secrets Manager) (Spec 07 section 5, Deferred, 4h, blocked-by: Secrets Manager)
- [ ] Delivery history UI: per-channel success rate, last N deliveries, last failure (Spec 07 section 4, P2, 3h, none)
- [ ] Rate limit channel-test endpoint (5/min/user) (Spec 07 section 5, P2, 1h, none)
- [ ] Custom message templates per channel type (Spec 07 P1+, P3, 8h, none)
- [ ] Channel-specific routing rules (P1 to Slack+email, P3 to Slack only) -- lives on alert rule (Spec 07 P1+, P3, 4h, none)

---

## 12. Onboarding

### Done
- [x] Basic signup -> auto-create tenant -> login flow (Phase 1, Spec 09)
- [x] "Coming soon" placeholders: SSO, MFA, Real-Time Dashboards, MQL (Sprint A)
- [x] "Email verification coming soon" info banner on signup (Sprint A)

### Pending
- [ ] Use-case selector at signup: web apps, databases, serverless, general, exploring (Spec 09 FR-05, P2, 2h, none)
- [ ] Tenant name field with smart default from email domain (Spec 09 FR-03..04, P2, 1h, none)
- [ ] Auto-generated starter dashboards based on discovered resources + use case (Spec 09 FR-29..33, P1, 4h, blocked-by: widget system)
- [ ] Onboarding progress tracking DB table: user_onboarding (Spec 09 section 7, P2, 4h, none)
- [ ] Progress indicator bar (sticky top): Signup, Verify, AWS, Dashboard (Spec 09 FR-53..55, P2, 3h, none)
- [ ] CloudFormation 1-click AWS setup: pre-filled stack in new tab, auto-detect completion (Spec 09 FR-15..16, Deferred, 8h, blocked-by: public URL + S3)
- [ ] AWS connect page with two options: CloudFormation Quick Deploy vs Manual IAM (Spec 09 FR-15, Deferred, 4h, blocked-by: above)
- [ ] Discovery progress UI: live updates as resources are found (Spec 09 FR-25..28, P2, 3h, none)
- [ ] First-view coach marks on starter dashboard (3-4 dismissible overlays) (Spec 09 FR-34..37, P3, 6h, none)
- [ ] Invited user flow: accept invite, skip tenant setup, welcome banner (Spec 09 FR-43..48, P2, 4h, none)
- [ ] Resume flow: banner on next login if onboarding incomplete (Spec 09 FR-49..52, P2, 3h, none)
- [ ] Post-onboarding nudges: day 1, 3, 7, 14 (Spec 09 FR-38..42, Deferred, 8h, blocked-by: email delivery)
- [ ] Nudge disable option in settings (Spec 09 FR-40, P3, 1h, blocked-by: nudge system)
- [ ] Funnel tracking metrics: onboarding.step.entered, .completed, .abandoned (Spec 09 section 6.5, P2, 4h, none)
- [ ] Email verification flow (send, verify, restrict unverified) (Spec 09 FR-09..14, P1, 4h, blocked-by: email delivery)
- [ ] Signup rate limiting: 10/hour/IP, 5/hour/email (Spec 09 section 6.4, P1, 2h, none)
- [ ] AWS external ID: cryptographically random per tenant (already exists but verify per spec) (Spec 09 section 6.4, P2, 1h, none)
- [ ] Onboarding email_verifications DB table (Spec 09 section 7, P2, 1h, blocked-by: email)
- [ ] aws_onboarding_attempts DB table (Spec 09 section 7, P2, 1h, none)
- [ ] onboarding_nudges_sent DB table (Spec 09 section 7, P3, 1h, blocked-by: nudges)

---

## 13. API Keys

### Done
- [x] API key v2: Argon2id hashing with `obl_live_` prefix (Phase 1, Spec 08, ADR-0006)
- [x] v1 SHA-256 backward compatibility + hash_version column (Phase 1, ADR-0006)
- [x] Key shown once on creation; only prefix visible afterward (Foundation, Spec 08)
- [x] Per-key rate limiting (sliding window, 429 + Retry-After) (Foundation, Spec 08)
- [x] Scope-based authorization: ingest/read/admin (Foundation, Spec 08)
- [x] Key revocation: set revoked_at, immediate invalidation (Foundation, Spec 08)
- [x] last_used_at tracked on key use (Foundation, Spec 08)

### Pending
- [ ] API key usage stats: requests/day per key over last 30 days (Spec 08 section 2, P2, 4h, none)
- [ ] Key expiry: optional expires_at, auto-reject after (Spec 08 section 3, P2, 2h, none)
- [ ] Rate limit key creation (10/day/user) (Spec 08 section 5, P2, 1h, none)
- [ ] Key verify performance: cache hot keys in Redis with short TTL (<10ms) (Spec 08 section 7, P3, 3h, none)
- [ ] API key v1 (SHA-256) sunset tracking: deprecated_version_used metric (CLAUDE.md section 8, P3, 1h, none)

---

## 14. Self-Monitoring & Observability

### Done
- [x] Request correlation IDs (ULID): X-Request-ID on every request (Foundation, Spec 00 section 9)
- [x] Metrics registry: Counter, Gauge, Histogram with MetricsRegistry singleton (Foundation)
- [x] Telemetry collector: 32 neoguard.* metric series dogfooded into own pipeline (Foundation)
- [x] System stats API: /system/stats with real-time pool, writer, background task, process stats (Foundation)
- [x] Enhanced /health endpoint (Foundation, Spec 00 section 9.3)
- [x] Auth telemetry: 9 counters + structured JSON logs (Phase 1)
- [x] /health stripped to DB checks only for non-admin, /stats admin-gated (Sprint A)
- [x] Standardized error envelope: _error_envelope in main.py (was already done, confirmed Sprint 1 2026-05-02, Spec 00 section 8.4)

### Pending
- [ ] Error codes catalog: documented error codes per module (Spec 00 section 8.4, P2, 3h, none)
- [ ] Structured logging with scrubber: regex redaction of PII/tokens before write (Spec 00 section 9.1, P2, 4h, none)
- [ ] Self-monitoring dashboard in admin (pre-built, not just stats endpoint) (Spec 11 FR-84..85, P1, 4h, none)
- [ ] Alerting on own health: evaluator lag, notification failure, high drop rate (Spec 00 section 9.2, P2, 4h, none)
- [ ] Platform metrics: platform.tenants.count, platform.admin.actions.count (Spec 00 section 9.5, P2, 2h, none)
- [ ] service.tenant_context.missing counter (spike = incident) (Spec 00 section 9.2, P2, 1h, none)
- [ ] Prometheus-format /metrics endpoint on separate port (Spec 00 section 9.3, P3, 4h, none)
- [ ] OpenTelemetry instrumentation (correlation_id + tenant_id as span attributes) (Spec 00 section 9.4, P3, 8h, none)
- [ ] Circuit breakers on service-to-service calls (Spec 00 section 11.3, P3, 6h, none)

---

## 15. Security

### Done
- [x] API key auth on all routes (no exempt prefixes) (Foundation)
- [x] SHA-256 key hashing (raw keys never stored) (Foundation)
- [x] Per-key rate limiting (sliding window, 429 + Retry-After) (Foundation)
- [x] Tenant isolation: tenant_id on every table, enforced in service layer (Phase 1)
- [x] Parameterized SQL everywhere (never f-strings in queries) (Foundation)
- [x] Input validation via Pydantic v2 models (Foundation)
- [x] No secrets in code (env vars only) (Foundation)
- [x] External ID for cross-account IAM (128-bit cryptographic, ng-xxxx format) (Foundation)
- [x] CSRF protection (double-submit cookie) (Phase 1)
- [x] Argon2id password hashing with OWASP params (Phase 1)
- [x] Super admin access audit verified (Sprint B)
- [x] SSRF protection on webhook/notification URLs: validate_outbound_url in url_validator.py, used in all 6 senders, 13 tests (was already done, confirmed Sprint 1 2026-05-02, Spec 07 section 5)
- [x] Dependency audit: pip-audit (1 vuln: pip CVE-2026-3219, dev tool not shipped) + npm audit (0 vulnerabilities) (Sprint 1 2026-05-02, Spec 00 section 10.2)

### Pending
- [ ] Log scrubbing for PII/tokens: automated regex scrubber (Spec 00 section 9.1, P2, 4h, none)
- [ ] Multi-tenant adversarial tests: Tenant A cannot see Tenant B data via any path (Spec 00 section 22, P1, 4h, none)
- [ ] Background job without tenant context in payload fails safely (Spec 00 section 22, P2, 2h, none)
- [ ] Content Security Policy (CSP) headers on all HTML responses (Spec 00 section 10.3, P2, 2h, none)
- [ ] Error messages don't leak internals (stack traces, SQL, file paths) (Spec 00 section 10.2, P2, 2h, none)
- [ ] Per-endpoint, per-tenant rate limits (beyond just API keys + auth) (Spec 00 section 8.6, P1, 4h, none)
- [ ] Idempotency keys on mutation endpoints (Spec 00 section 8.8, P3, 6h, none)
- [ ] Tag value length + count limits at ingest (prevent cardinality bomb) (Spec 00 section 10.4, P2, 2h, none)
- [ ] HTTPS/TLS (Spec 00 section 10, Deferred, 4h, blocked-by: domain + ACM cert)
- [ ] CORS production lock-down to production domain (Spec 00 section 10, Deferred, 1h, blocked-by: production domain)
- [ ] Secrets Manager integration: move secrets from env vars to AWS SM (Spec 00 section 10, Deferred, 6h, blocked-by: AWS account)
- [ ] MFA secrets + SSO client secrets encrypted at rest with AES-256 (Spec 10 section 6.3, Deferred, 4h, blocked-by: Secrets Manager)

---

## 16. Testing & Quality

### Done
- [x] 724 backend tests passing (Phase 1 + Sprint A+B+1)
- [x] 72 frontend tests passing (2 test files: InfrastructurePage + SettingsPage) (Phase 1)
- [x] TypeScript strict mode, zero errors (Phase 1)
- [x] CI/CD pipeline: .github/workflows/ci.yml (lint, types, unit, integration, frontend, build) (Foundation)
- [x] ruff for lint, mypy strict mode (Foundation)

### Pending
- [ ] Frontend tests for OverviewPage (CLAUDE.md section 8, P2, 2h, none)
- [ ] Frontend tests for MetricsPage (CLAUDE.md section 8, P2, 2h, none)
- [ ] Frontend tests for LogsPage (CLAUDE.md section 8, P2, 1h, none)
- [ ] Frontend tests for DashboardsPage (CLAUDE.md section 8, P2, 2h, none)
- [ ] Frontend tests for AlertsPage (CLAUDE.md section 8, P2, 2h, none)
- [ ] Frontend tests for AdminPage (P2, 2h, none)
- [ ] Multi-tenant adversarial test suite: every endpoint tested for cross-tenant leakage (Spec 00 section 22, P1, 4h, none)
- [ ] API key from deleted tenant rejected at auth layer test (Spec 00 section 22, P2, 1h, none)
- [ ] Platform audit log immutability test (Spec 00 section 22, P2, 1h, none)
- [ ] Load/stress testing with Locust: 100 concurrent users, 1k metrics/sec (Spec 00, Deferred, 8h, blocked-by: cloud)
- [ ] E2E tests with Playwright: 5 critical paths (login, create dashboard, create alert, tenant switch, admin flow) (Spec 00, Deferred, 12h, blocked-by: CI/CD environment)
- [ ] Axe-core accessibility audit in CI (Spec 00 section 16, P3, 4h, none)

---

## 17. DevOps & Infrastructure

### Done
- [x] Docker Compose: TimescaleDB (pg16:5433) + ClickHouse (24.8:8123) + Redis (7.x:6379) (Foundation)
- [x] Dockerfile (single-stage) (Foundation)
- [x] Alembic migrations: 001 initial schema + 002 password reset tokens (Phase 1)
- [x] CloudFormation template for IAM role (NeoGuardCollectorRole) (Foundation)
- [x] CI/CD pipeline: 5 parallel jobs (lint, types, unit, integration, frontend, build) (Foundation)

### Pending
- [ ] Multi-stage production Dockerfile (Spec 00, Deferred, 4h, blocked-by: cloud deployment)
- [ ] Separate admin subdomain routing (admin.neoguard.io) (Spec 11 FR-01, Deferred, 4h, blocked-by: domain)
- [ ] Separate ingest subdomain routing (ingest.neoguard.io) (Spec 00 section 8.1, Deferred, 2h, blocked-by: domain)
- [ ] Redis HA: primary + replica + failover (Spec 10 section 6.4, Deferred, 4h, blocked-by: cloud)
- [ ] Alembic migration for widgets table (Spec 02 section 7, P0, 1h, none -- needed when building dashboards)
- [ ] Alembic migration for maintenance_windows, home_pins, activity_events tables (P2, 2h, none)
- [ ] Background job pattern: Redis Streams consumer groups (Spec 00 section 14, P3, 8h, none)
- [ ] Cursor-based pagination: migrate all list endpoints from offset to cursor (Spec 00 section 8.5, P3, 6h, none)

---

## 18. Documentation

### Done
- [x] docs/architecture.md (Foundation)
- [x] docs/api-reference.md (Foundation)
- [x] docs/deployment.md (Foundation)
- [x] docs/testing.md (Foundation)
- [x] docs/data-flow.md + database-schema.md + project-structure.md (Foundation)
- [x] docs/project-documentation.md (1,714 lines, 16 sections) (Sprint B)
- [x] 6 ADRs: stack, topology, IDs, SCSS, API key hash, multi-tenancy (Phase 0 + Phase 1)

### Pending
- [ ] ADR-003: CFT over Terraform for AWS onboarding (CLAUDE.md section 5, P3, 2h, none)
- [ ] docs/user-guide/tenants.md: user-facing guide to invite teammates, switch tenants (Spec 00 section 22, P2, 2h, none)
- [ ] docs/user-guide/api-keys.md: user-facing key management guide (Spec 00 section 22, P2, 2h, none)
- [ ] docs/user-guide/getting-started.md: public onboarding guide (Spec 09 section 14, P2, 3h, none)
- [ ] docs/user-guide/aws-connection.md: AWS-specific troubleshooting (Spec 09 section 14, P2, 2h, none)
- [ ] docs/user-guide/dashboards.md: create, edit, share dashboards (Spec 02 section 14, P2, 2h, none)
- [ ] docs/user-guide/login.md + mfa-setup.md (Spec 10 section 14, P2, 2h, blocked-by: MFA)
- [ ] docs/user-guide/sso-setup-azure.md + sso-setup-aws.md (Spec 10 section 14, P2, 3h, blocked-by: SSO)
- [ ] docs/runbooks/tenant-deletion.md: ops runbook for deletion requests (Spec 00 section 22, P2, 1h, none)
- [ ] docs/runbooks/super-admin-compromise.md: incident response for compromised admin (Spec 00 section 22, P2, 2h, none)
- [ ] docs/runbooks/auth-outage.md (Spec 10 section 14, P2, 1h, none)
- [ ] docs/runbooks/break-glass.md: regain access when all platform_owners unavailable (Spec 11 section 12, P2, 1h, none)
- [ ] docs/admin-panel-user-guide.md: for platform team (Spec 11 section 14, P2, 2h, none)
- [ ] OWASP ASVS Level 2 review document (Spec 10 section 14, P3, 4h, none)

---

## 19. NeoGuard Agent (Go)

All items are from Spec 12. This is a separate Go project, not yet started.

### Done
(none -- separate Go codebase, not started)

### Pending
- [ ] Go project scaffolding: cmd/neoguard-agent/main.go, internal packages (Spec 12 section 15, Deferred, 2h, none)
- [ ] AWS IMDSv2 client: get instance identity securely (Spec 12 section 7.1, Deferred, 3h, none)
- [ ] CPU + memory collectors (Linux, via gopsutil) (Spec 12 section 6.1, Deferred, 4h, none)
- [ ] Disk + network collectors (Spec 12 section 6.1, Deferred, 3h, none)
- [ ] In-memory ring buffer (10 MB, channel-based) (Spec 12 section 8.4, Deferred, 3h, none)
- [ ] HTTPS transmitter with gzip + bearer auth + batch_id (Spec 12 section 8.1, Deferred, 4h, none)
- [ ] YAML config loader with strict validation (Spec 12 section 10, Deferred, 3h, none)
- [ ] Retry/backoff logic per spec (Spec 12 section 8.3, Deferred, 2h, none)
- [ ] Systemd unit file with hardening (Spec 12 section 11.5, Deferred, 1h, none)
- [ ] Shell install script: download, verify checksum, create user, install, start (Spec 12 section 11.1, Deferred, 4h, none)
- [ ] Agent self-health metrics: uptime, memory, CPU, sent/dropped counts (Spec 12 section 6.3, Deferred, 2h, none)
- [ ] Cloud identity tag mapping: unified tags across AWS/Azure/on-prem (Spec 12 section 7.4, Deferred, 2h, none)
- [ ] CLI commands: version, diagnose, test-connection, flush, uninstall (Spec 12 section 11.6, Deferred, 3h, none)
- [ ] ADR-AGENT-001 (Go language choice) + ADR-AGENT-004 (cloud trust model) (Spec 12 section 14, Deferred, 2h, none)
- [ ] Unit tests for every collector + buffer + transmitter (Spec 12 section 12, Deferred, 6h, none)
- [ ] Integration test: agent -> mock ingest -> verify payload (Spec 12 section 12.2, Deferred, 4h, none)

---

## 20. Cloud-Blocked (Deferred)

All items below require cloud infrastructure, external services, or production deployment. They cannot be built on the laptop demo.

| # | Feature | Blocker | Spec Ref |
|---|---------|---------|----------|
| D1 | Google/GitHub OAuth | Public callback URL | 10 section 4 |
| D2 | Azure AD SSO (OIDC) | IdP config + public URL | 10 FR-21..33 |
| D3 | AWS IAM Identity Center SSO (SAML) | AWS org setup + public URL | 10 FR-34..50 |
| D4 | Email delivery (verification, invites, resets, nudges) | SES/SMTP + verified domain | 09, 10 |
| D5 | MFA/TOTP | Secure backup storage for recovery codes | 10 FR-65..81 |
| D6 | HTTPS/TLS | Domain + ACM cert | 00 section 10 |
| D7 | CORS production lock-down | Production domain | 00 section 10 |
| D8 | Secrets Manager integration | AWS account | 00 section 10 |
| D9 | GDPR export/delete | S3 for file storage | 11 FR-88..97 |
| D10 | CloudFormation onboarding wizard | Public URL + S3 for template | 09 FR-15..16 |
| D11 | WebSocket live dashboards + home banner | Production deployment | 02 FR-53..56 |
| D12 | Webhook URL encryption at rest | Secrets Manager | 07 section 5 |
| D13 | CAPTCHA on signup | Cloudflare Turnstile | 10 section 6.3 |
| D14 | Post-onboarding email nudges | Email delivery | 09 FR-38..42 |
| D15 | NeoGuard Go Agent distribution | Public download URL + signing | 12 |
| D16 | Multi-stage production Dockerfile | Cloud deployment | -- |
| D17 | Load testing (Locust, 100 concurrent users) | Cloud infrastructure | -- |
| D18 | E2E tests (Playwright, 5 critical paths) | CI/CD environment | -- |
| D19 | HSTS headers + preload | HTTPS | 10 section 6.3 |
| D20 | MFA secrets/SSO secrets encrypted at rest | Secrets Manager | 10 section 6.3 |
| D21 | Redis HA (primary + replica + failover) | Cloud Redis | 10 section 6.4 |
| D22 | Separate admin/ingest subdomains | Domain + DNS | 00 section 8.1 |
| D23 | ML model storage (tenant-scoped S3) | S3 + IAM | 03 section 9.2 |
| D24 | Platform audit log replicated to S3 Object Lock | S3 Object Lock | 00 section 4.7 |
| D25 | GCP support | Parked indefinitely | -- |

---

## Priority Matrix

### P0 -- Demo Blockers (must fix before demo)

| # | Task | Area | Effort | Blocked By | Status |
|---|------|------|--------|------------|--------|
| ~~1~~ | ~~Tenant name in page headers~~ | ~~Multi-Tenancy~~ | ~~1h~~ | ~~None~~ | Done (Sprint 1 — moved to global Layout top bar) |
| ~~2~~ | ~~Tenant name + role shown in top nav~~ | ~~Home~~ | ~~1h~~ | ~~None~~ | Done (Sprint 1 — same as #1) |
| 3 | Tenant settings tab (name edit, timezone, retention display) | Settings | 2h | None | |
| ~~4~~ | ~~Azure resource tabs in infrastructure page~~ | ~~Infrastructure~~ | ~~6h~~ | ~~None~~ | Done (was already done; 12 metric fixes Sprint 1) |
| ~~5~~ | ~~P1-P4 alert severity levels~~ | ~~Alerting~~ | ~~3h~~ | ~~None~~ | Done (was already done — AlertSeverity StrEnum) |
| ~~6~~ | ~~Auth rate limiting (login, signup)~~ | ~~Auth~~ | ~~4h~~ | ~~None~~ | Done (Sprint 1) |
| ~~7~~ | ~~SSRF protection on webhook URLs~~ | ~~Security~~ | ~~2h~~ | ~~None~~ | Done (was already done — url_validator.py) |
| ~~8~~ | ~~Dependency audit (pip-audit, npm audit)~~ | ~~Security~~ | ~~1h~~ | ~~None~~ | Done (Sprint 1) |

**Total P0 remaining**: ~2h (only #3 Tenant settings tab)

### P0+ -- Dashboard Revolution (transforms the product, next after demo blockers)

| # | Task | Area | Effort | Blocked By |
|---|------|------|--------|------------|
| 1 | MQL parser (tokenizer + AST) | MQL | 8h | None |
| 2 | MQL compiler (AST -> SQL/TimescaleDB) | MQL | 16h | None |
| 3 | MQL tenant ID injection at compile time | MQL | 2h | MQL compiler |
| 4 | Widget data model (DB + API) | Dashboards | 4h | None |
| 5 | Widget CRUD API | Dashboards | 4h | None |
| 6 | Timeseries widget (line/area chart) | Dashboards | 8h | MQL |
| 7 | Single value widget (big number + sparkline) | Dashboards | 4h | MQL |
| 8 | 12-column grid layout (drag + resize) | Dashboards | 12h | None |
| 9 | Dashboard time controls (presets + custom) | Dashboards | 4h | None |
| 10 | Widget editor drawer | Dashboards | 8h | MQL |
| 11 | Alembic migration for widgets table | DevOps | 1h | None |

**Total P0+**: ~71h

### P1 -- Demo Polish (should fix, noticeably improves quality)

| # | Task | Area | Effort | Blocked By |
|---|------|------|--------|------------|
| ~~1~~ | ~~P1-P4 alert severity levels~~ | ~~Alerting~~ | ~~3h~~ | Done (was already done) |
| ~~2~~ | ~~Standardized error envelope on all errors~~ | ~~Observability~~ | ~~4h~~ | Done (was already done) |
| 3 | Alert detail page (/alerts/:id) | Alerting | 6h | None |
| 4 | Active sessions UI + revoke | Auth | 4h | None |
| 5 | "Log out everywhere" | Auth | 2h | None |
| 6 | Password change invalidates sessions | Auth | 2h | None |
| ~~7~~ | ~~Auth rate limiting (login, signup)~~ | ~~Auth~~ | ~~4h~~ | Done (Sprint 1) |
| 8 | Account lockout after 10 failures | Auth | 2h | None |
| ~~9~~ | ~~SSRF protection on webhook URLs~~ | ~~Security~~ | ~~2h~~ | Done (was already done) |
| ~~10~~ | ~~Dependency audit (pip-audit, npm audit)~~ | ~~Security~~ | ~~1h~~ | Done (Sprint 1) |
| 11 | Multi-tenant adversarial test suite | Testing | 4h | None |
| 12 | Tenant context async boundary test | Multi-Tenancy | 4h | None |
| 13 | User removed from tenant -> session invalidated | Multi-Tenancy | 3h | None |
| 14 | Session invalidated on membership removal | Multi-Tenancy | 2h | None |
| 15 | Audit log tab visible to tenant admins (not just super) | Settings | 3h | None |
| 16 | Audit log CSV export | Settings | 3h | None |
| 17 | Per-endpoint, per-tenant rate limits | Security | 4h | None |
| 18 | System metrics dashboard in admin | Admin | 4h | None |
| 19 | Admin panel audit log CSV export | Admin | 3h | None |
| 20 | Maintenance windows for alerts | Alerting | 4h+3h | None |
| 21 | MQL variable substitution | MQL | 4h | MQL parser |
| 22 | MQL functions (rate, derivative, etc.) | MQL | 8h | MQL parser |
| 23 | MQL execution limits | MQL | 4h | MQL parser |
| 24 | MQL typeahead API | MQL | 4h | MQL parser |
| 25 | MQL validation + dry-run endpoint | MQL | 4h | MQL parser |
| 26 | Top list widget | Dashboards | 4h | MQL |
| 27 | Text widget (markdown) | Dashboards | 2h | None |
| 28 | Time range as URL state | Dashboards | 4h | None |
| 29 | Dashboard variables system | Dashboards | 8h | MQL |
| 30 | Auto-refresh selector | Dashboards | 2h | None |
| 31 | Query batching endpoint | Dashboards | 4h | MQL |
| 32 | Query caching (Redis) | Dashboards | 4h | MQL |
| 33 | Pre-built starter dashboards | Dashboards | 8h | Widgets |
| 34 | Share button (URL with full state) | Dashboards | 2h | None |
| 35 | Metrics explorer: multi-query overlay | Explorer | 6h | MQL |
| 36 | Metric typeahead + tag typeahead | Explorer | 7h | MQL |
| 37 | Chart type switcher | Explorer | 6h | None |
| 38 | Legend with stats | Explorer | 4h | None |
| 39 | Save-to-dashboard from explorer | Explorer | 4h | Widgets |
| 40 | URL state for explorer | Explorer | 4h | None |
| 41 | Health banner on home page | Home | 4h | None |
| 42 | Firing alerts panel on home | Home | 4h | None |
| 43 | Quick stats strip on home | Home | 3h | None |
| 44 | Auto-generated starter dashboard on first discovery | Onboarding | 4h | Widgets |
| 45 | Signup rate limiting | Onboarding | 2h | None |
| 46 | Resource -> alert association on infra detail | Infrastructure | 4h | None |

**Total P1 remaining**: ~179h (14h completed in Sprint 1)

### P2 -- Important but Not Demo-Critical

| # | Task | Area | Effort |
|---|------|------|--------|
| 1 | DB-level RLS (ENABLE ROW LEVEL SECURITY) | Multi-Tenancy | 8h |
| 2 | Tenant suspension flow | Multi-Tenancy | 6h |
| 3 | Tenant deletion with grace period | Multi-Tenancy | 8h |
| 4 | Quota enforcement (all tier limits) | Multi-Tenancy | 12h |
| 5 | Last owner protection | Multi-Tenancy | 2h |
| 6 | Platform role tiers (4 roles) | Admin | 6h |
| 7 | Role-based access matrix enforcement | Admin | 4h |
| 8 | Tenant detail page (5 tabs) | Admin | 12h |
| 9 | Tenant creation from admin | Admin | 4h |
| 10 | Tenant deletion with multi-step confirm | Admin | 6h |
| 11 | Quota override per tenant | Admin | 6h |
| 12 | Security log viewer in admin | Admin | 3h |
| 13 | Platform admins management page | Admin | 4h |
| 14 | Cross-tenant user search | Admin | 3h |
| 15 | User detail page in admin | Admin | 6h |
| 16 | Force password reset (admin) | Admin | 2h |
| 17 | Terminate all sessions (admin) | Admin | 1h |
| 18 | Admin session countdown warnings | Admin | 2h |
| 19 | Impersonation auto-exit on tab close | Admin | 3h |
| 20 | HIBP password breach check | Auth | 2h |
| 21 | Session fixation prevention | Auth | 1h |
| 22 | Account linking (password + OAuth + SSO) | Auth | 6h |
| 23 | Email change flow | Auth | 6h |
| 24 | MFA recovery via support | Auth | 2h |
| 25 | Formula support (multi-query arithmetic) | MQL | 8h |
| 26 | Dashboard quota enforcement | Dashboards | 2h |
| 27 | Retention-aware time picker | Dashboards | 2h |
| 28 | Dashboard soft-delete + recovery | Dashboards | 2h |
| 29 | Widget title variable interpolation | Dashboards | 1h |
| 30 | Skeleton shimmer rendering | Dashboards | 2h |
| 31 | Dashboard empty state | Dashboards | 1h |
| 32 | Markdown sanitization (bleach) | Dashboards | 2h |
| 33 | Composite alerts (A AND B) | Alerting | 8h |
| 34 | Alert grouping / incident model | Alerting | 12h |
| 35 | Tag-based bulk mute | Alerting | 3h |
| 36 | Bulk operations UI | Alerting | 4h |
| 37 | Alert history export CSV/JSON | Alerting | 3h |
| 38 | Notification per-tenant rate limit | Alerting | 2h |
| 39 | Anomaly detection (STL + MAD) | Alerting | 20h |
| 40 | Forecast alerts | Alerting | 12h |
| 41 | Auto-threshold suggestions | Alerting | 8h |
| 42 | Crosshair hover on explorer chart | Explorer | 4h |
| 43 | Recent queries (local storage) | Explorer | 2h |
| 44 | Click legend -> isolate/hide series | Explorer | 2h |
| 45 | Resource -> alert shortcut | Infrastructure | 2h |
| 46 | Staleness indicator | Infrastructure | 2h |
| 47 | Resource health status | Infrastructure | 6h |
| 48 | Filter sidebar for infrastructure | Infrastructure | 4h |
| 49 | Quick actions on home | Home | 2h |
| 50 | Favorite dashboards on home | Home | 8h |
| 51 | Activity feed on home | Home | 6h |
| 52 | Empty state for new tenant home | Home | 3h |
| 53 | Error boundaries per section | Home | 2h |
| 54 | Notification delivery history UI | Notifications | 3h |
| 55 | Rate limit channel-test | Notifications | 1h |
| 56 | API key usage stats | API Keys | 4h |
| 57 | API key expiry | API Keys | 2h |
| 58 | Tenant settings (timezone, retention) | Multi-Tenancy | 3h |
| 59 | Tenant slug auto-generation | Multi-Tenancy | 2h |
| 60 | Use-case selector at signup | Onboarding | 2h |
| 61 | Onboarding progress tracking DB | Onboarding | 4h |
| 62 | Progress indicator bar | Onboarding | 3h |
| 63 | Discovery progress UI | Onboarding | 3h |
| 64 | Invited user flow (accept + welcome) | Onboarding | 4h |
| 65 | Resume flow (banner if incomplete) | Onboarding | 3h |
| 66 | Funnel tracking metrics | Onboarding | 4h |
| 67 | Log scrubbing for PII/tokens | Security | 4h |
| 68 | CSP headers | Security | 2h |
| 69 | Error messages don't leak internals | Security | 2h |
| 70 | Tag cardinality limits at ingest | Security | 2h |
| 71 | Error codes catalog | Observability | 3h |
| 72 | Alerting on own health | Observability | 4h |
| 73 | Platform metrics (tenant counts, etc.) | Observability | 2h |
| 74 | tenant_context.missing counter | Observability | 1h |
| 75 | Frontend tests (5 untested pages) | Testing | 11h |
| 76 | AdminPage frontend tests | Testing | 2h |
| 77 | API key deleted-tenant rejection test | Testing | 1h |
| 78 | Platform audit log immutability test | Testing | 1h |
| 79 | Alembic migrations for new tables | DevOps | 2h |
| 80 | User guide docs (tenants, API keys, dashboards, getting started, AWS) | Docs | 13h |
| 81 | Runbooks (tenant deletion, compromised admin, auth outage, break-glass) | Docs | 5h |
| 82 | Admin panel user guide | Docs | 2h |
| 83 | Timezone preference in profile | Settings | 1h |

**Total P2**: ~350h

### P3 -- Tech Debt & Long-Term Quality

| # | Task | Area | Effort |
|---|------|------|--------|
| 1 | AlertsPage.tsx split (1,096 lines) | Code Quality | 2h |
| 2 | Noisy neighbor prevention | Multi-Tenancy | 12h |
| 3 | Tenant tier system (free/pro/enterprise) | Multi-Tenancy | 8h |
| 4 | Feature flags module (DB-backed, Redis-cached) | Admin | 12h |
| 5 | Feature flags read-only view in admin | Admin | 4h |
| 6 | Alert rule name unique per tenant | Alerting | 1h |
| 7 | Change-point detection (BOCPD/PELT) | Alerting | 10h |
| 8 | ML model training + storage | Alerting | 16h |
| 9 | User feedback loop on ML alerts | Alerting | 4h |
| 10 | SLO tracking + error budget alerting | Alerting | 16h |
| 11 | Hysteresis (different fire/recover thresholds) | Alerting | 4h |
| 12 | CloudWatch Logs collection | Infrastructure | 16h |
| 13 | Keyboard shortcuts on home | Home | 1h |
| 14 | Quota indicators on home | Home | 4h |
| 15 | Coach marks on first dashboard view | Onboarding | 6h |
| 16 | Nudge disable in settings | Onboarding | 1h |
| 17 | Custom message templates per channel | Notifications | 8h |
| 18 | Channel-specific routing rules | Notifications | 4h |
| 19 | API key hot cache in Redis | API Keys | 3h |
| 20 | API key v1 sunset tracking metric | API Keys | 1h |
| 21 | Rate limit key creation | API Keys | 1h |
| 22 | Idempotency keys on mutations | Security | 6h |
| 23 | Prometheus /metrics endpoint | Observability | 4h |
| 24 | OpenTelemetry instrumentation | Observability | 8h |
| 25 | Circuit breakers | Observability | 6h |
| 26 | Dashboard keyboard shortcuts | Dashboards | 3h |
| 27 | Dashboard versioning | Dashboards | 6h |
| 28 | Viewer role polish (hide all edit buttons) | Dashboards | 1h |
| 29 | Explorer keyboard shortcuts | Explorer | 2h |
| 30 | Axe-core a11y audit in CI | Testing | 4h |
| 31 | Cursor-based pagination migration | DevOps | 6h |
| 32 | Background job pattern (Redis Streams) | DevOps | 8h |
| 33 | ADR-003 (CFT over Terraform) | Docs | 2h |
| 34 | OWASP ASVS Level 2 review | Docs | 4h |
| 35 | Tenant slug | Multi-Tenancy | 2h |
| 36 | "AWS not connected" empty state on infra | Infrastructure | 1h |

**Total P3**: ~196h

### Deferred -- Post-Cloud Approval

Everything in Section 19 (Cloud-Blocked) plus the NeoGuard Go Agent (Section 19 of this doc). Estimated total: ~200+ hours, contingent on cloud infrastructure approval and deployment.

---

## Appendix: Key Dependencies

```
MQL Parser (P0)
  |
  +-- MQL Compiler (P0)
  |     |
  |     +-- Timeseries Widget (P0)
  |     +-- Single Value Widget (P0)
  |     +-- Top List Widget (P1)
  |     +-- Query Batching (P1)
  |     +-- Query Caching (P1)
  |     +-- Dashboard Variables (P1)
  |     +-- Metrics Explorer Multi-Query (P1)
  |     +-- Save-to-Dashboard (P1)
  |     +-- Typeahead API (P1)
  |     +-- Anomaly Detection (P2)
  |     +-- Auto-Threshold Suggestions (P2)
  |     +-- Composite Alerts (P2)
  |
  +-- Widget System (P0)
        |
        +-- Grid Layout (P0)
        +-- Widget Editor (P0)
        +-- Pre-built Starter Dashboards (P1)
        +-- Favorite Dashboards on Home (P2)
        +-- Auto-Generated Starter Dashboard (P1)

Cloud Deployment (Deferred)
  |
  +-- OAuth (Google, GitHub)
  +-- SSO (Azure AD, AWS IAM)
  +-- Email Delivery (SES/SMTP)
  +-- MFA/TOTP
  +-- HTTPS/TLS
  +-- CORS Lock-down
  +-- Secrets Manager
  +-- GDPR Export/Delete
  +-- WebSocket Live Mode
  +-- Load Testing + E2E Tests
  +-- NeoGuard Go Agent Distribution
```

---

**End of Master To-Do List**
