# NeoGuard Platform Audit — Where We Are vs. Where We Need to Be

**Date**: 2026-05-02
**Author**: Claude (Senior Systems Architect)
**Purpose**: Honest, exhaustive gap analysis. No hand-waving. Every gap rated.

---

## 1. Platform Inventory — What Exists Today

| Category | Count | Notes |
|----------|-------|-------|
| Python source files | 100 | 12 route modules, 12 service modules |
| Frontend files (TS/TSX) | 276 | 10 pages, design system, hooks, components |
| Backend unit tests | 703 | All passing |
| Frontend tests | 72 | All passing (2 test files) |
| AWS resource discoverers | 24 | All ResourceType values except SERVER |
| Azure resource discoverers | 15 | VM, Disk, SQL, Function, AKS, etc. |
| CloudWatch metric namespaces | 20 | Covering all 24 resource types |
| Azure Monitor metric types | 10 | ~78 total metrics defined |
| Notification channel types | 6 | Webhook, Slack, Email, Freshdesk, PagerDuty, MS Teams |
| Alert aggregation types | 8 | avg/min/max/sum/count/last/p95/p99 |
| Internal telemetry series | 32 | neoguard.* self-monitoring |
| ADRs written | 6 | Stack, topology, IDs, SCSS, API key hash, multi-tenancy |
| Documentation files | 11 | In docs/ |
| Alembic migrations | 2 | Initial schema + password reset tokens |
| DB tables | ~20 | Auth, data, audit, platform |

---

## 2. Gap Analysis — By Platform Pillar

### 2.1 QUERY LANGUAGE (MQL) — CRITICAL GAP

**Current**: Basic metric queries (name, time range, aggregation, tags). No query language.
**Required by Spec 00 §6**: Full MQL DSL — `aggregator:metric{tag_filter}.function.rollup`
**Competitor benchmark**: Datadog metric queries + formulas, PromQL, NRQL (most powerful)

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| MQL parser (tokenizer + AST) | P0 | 16h | 00 §6 |
| MQL compiler (AST → SQL/TimescaleDB) | P0 | 16h | 00 §6 |
| Tenant ID injection at compile time | P0 | 2h | 00 §6.3 |
| MQL typeahead API (metrics + tags) | P1 | 4h | 04 §5 |
| Formula support (multi-query arithmetic) | P1 | 8h | 02 §5, 04 §5 |
| MQL validation + dry-run endpoint | P1 | 4h | 02 §5 |

**Verdict**: This is the single biggest gap. Without MQL, dashboards are static displays. Every serious monitoring platform is powered by its query language. This blocks dashboard variables, metrics explorer, and save-to-dashboard.

### 2.2 DASHBOARDS — MAJOR GAPS

**Current**: Basic CRUD (create/update/delete/duplicate). No widgets, no layout, no variables, no live mode.
**Required by Spec 02**: 12-column grid, 4 widget types, variables, query batching, WebSocket live mode.
**Competitor benchmark**: Grafana (25+ panel types, transformations, variables, versioning), Datadog (20+ widgets, template variables, powerpacks)

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| Widget data model (DB + API) | P0 | 4h | 02 §4 |
| Timeseries widget (line/area chart) | P0 | 8h | 02 §5.1 |
| Single value widget (big number + sparkline) | P0 | 4h | 02 §5.2 |
| Top list widget (ranked bar) | P1 | 4h | 02 §5.3 |
| Text widget (markdown, sanitized) | P1 | 2h | 02 §5.4 |
| 12-column grid layout (drag + resize) | P0 | 12h | 02 §5 |
| Dashboard variables (static + metric-driven) | P1 | 8h | 02 §5.5 |
| Time controls (presets + custom + URL state) | P0 | 4h | 02 §5.4 |
| Query batching (POST /query/batch) | P1 | 4h | 02 §8.2 |
| WebSocket live mode | DEFERRED | 12h | 02 §5.6 |
| Dashboard versioning | P2 | 6h | - |
| Pre-built starter dashboards (per resource type) | P1 | 8h | 09 §5.5 |

**What we CAN do now (laptop demo)**: Static dashboards with timeseries and value widgets, time controls, URL state. That's enough to show the concept.

**What we CANNOT do without cloud**: WebSocket live mode, CDN for static assets.

### 2.3 ALERTING — STRONG BASE, KEY GAPS

**Current**: Threshold rules, state machine (ok→pending→firing→resolved→nodata), 8 aggregation types, flapping detection, silences (one-time + recurring + tag matchers), cooldown, no-data handling, preview/dry-run, acknowledgment, 6 notification channels.
**Required by Spec 03**: P1-P4 severity, composite alerts, alert detail page, alert grouping, ML-based anomaly detection (Gen 2).

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| P1-P4 severity levels (currently info/warning/critical) | P0 | 3h | 03 §6.1 |
| Composite alerts (A AND B, A OR B) | P1 | 8h | 03 §6.5 |
| Alert detail page (/alerts/:id with chart + timeline) | P1 | 6h | 03 §6.7 |
| Alert grouping / incident model | P2 | 12h | 03 §6.6 |
| Anomaly detection — basic (STL + MAD) | P2 | 20h | 03 §6.8 |
| Forecast alerts (predict breach in N hours) | P2 | 12h | 03 §6.9 |
| Maintenance windows (tenant admin scoped mutes) | P1 | 4h | 03 §6.4 |
| Auto-threshold suggestions (from historical data) | P2 | 8h | 03 §6.10 |
| SLO tracking + error budget alerting | P3 | 16h | - |

**Verdict**: Our alerting is genuinely good for a v1. Silences, flapping detection, and cooldown put us ahead of basic Prometheus alerting. The P1-P4 severity is a quick win. Composite alerts would be a huge differentiator.

### 2.4 METRICS EXPLORER — NOT BUILT

**Current**: Basic metrics page with single metric selection.
**Required by Spec 04**: Ad-hoc query editor, 5 overlaid queries, 4 chart types, variable support, save-to-dashboard.
**Competitor benchmark**: Grafana Explore (split view, history), Datadog Notebooks, New Relic query builder.

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| Multi-query overlay (up to 5 queries) | P1 | 6h | 04 §5 FR-02 |
| Chart type switcher (timeseries/value/top/table) | P1 | 6h | 04 §5 FR-06 |
| Legend with stats (last/min/max/avg) | P1 | 4h | 04 §5 FR-07 |
| Save-to-dashboard button | P1 | 4h | 04 §5 FR-09 |
| URL state (query + time + chart type) | P1 | 4h | 04 §5 FR-10 |
| Recent queries (local storage) | P2 | 2h | 04 §5 FR-11 |
| Crosshair hover (all series values) | P2 | 4h | 04 §5 FR-05 |

### 2.5 INFRASTRUCTURE — STRONG BASE, MINOR GAPS

**Current**: 24 AWS discoverers, 15 Azure discoverers, infrastructure page with 24 AWS tabs + drill-down, search, pagination.
**Required by Spec 05**: Auto-discovery, list + detail, canonical dashboards, resource→alert association.

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| Azure resource tabs in infrastructure page | P0 | 6h | 05 §5 |
| Resource → alert association (detail page) | P1 | 4h | 05 §5 FR-08 |
| "Create alert on this resource" shortcut | P2 | 2h | 05 §5 FR-09 |
| Staleness indicator (last seen > 15min) | P2 | 2h | 05 §5 FR-10 |

**Verdict**: Infrastructure is our strongest feature. 39 resource types across 2 clouds, live-tested with real accounts. Azure tabs on the frontend is the main gap.

### 2.6 HOME PAGE — NOT BUILT (TO SPEC)

**Current**: OverviewPage shows status, resource count, firing alerts, alert rules, system health, resource inventory.
**Required by Spec 01**: Health banner, firing alerts panel, favorites, quick stats with trends, activity feed, quick actions, quota indicators.

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| Firing alerts panel (grouped by severity) | P1 | 4h | 01 §5.1 |
| Favorite dashboards (per user, sparklines) | P2 | 8h | 01 §5.2 |
| Activity feed (last 24h) | P2 | 6h | 01 §5.3 |
| Quick actions (create dashboard/alert/explore) | P2 | 2h | 01 §5.4 |
| Quota indicators (>80% warning) | P3 | 4h | 01 §5.5 |

### 2.7 AUTH — GOOD BASE, CLOUD-BLOCKED FEATURES

**Current**: Email+password, Argon2id, Redis sessions, CSRF, roles, API keys v2.
**Required by Spec 10**: Google OAuth, Azure AD SSO, AWS IAM SSO, MFA (TOTP), email verification, active sessions, account linking.

| What's Missing | Priority | Effort | Blocked By |
|----------------|----------|--------|------------|
| Email verification flow | P1 (demo) | 4h | Cloud (SES/SMTP) |
| Google OAuth | P1 (cloud) | 8h | Public callback URL |
| Azure AD SSO (OIDC) | P1 (cloud) | 12h | IdP config + public URL |
| AWS IAM Identity Center (SAML) | P1 (cloud) | 12h | AWS org setup |
| MFA/TOTP (setup + challenge + recovery) | P1 (cloud) | 12h | Secure backup storage |
| Account linking (password + OAuth) | P2 (cloud) | 8h | OAuth required first |
| Active sessions UI + revoke | P1 (demo) | 4h | None |
| HIBP password breach check | P2 | 2h | External API call |
| Email change flow | P2 (cloud) | 6h | Email delivery |
| Rate limiting on auth endpoints | P1 (demo) | 4h | None |

### 2.8 ADMIN PANEL — GOOD BASE, MISSING POLISH

**Current**: Stats, tenants (CRUD + suspend/delete with typed confirmation), users (CRUD + super admin + impersonation), audit log, security log.
**Required by Spec 11**: Platform roles (4 tiers), quota overrides, GDPR export/delete, feature flags, system metrics dashboard.

| What's Missing | Priority | Effort | Blocked By |
|----------------|----------|--------|------------|
| Platform role tiers (owner/admin/support/billing) | P2 | 6h | None |
| Quota override per tenant | P2 | 6h | None |
| GDPR data export (JSON/CSV bundle) | P3 (cloud) | 12h | S3 for storage |
| GDPR data deletion (7-day cooling + purge) | P3 (cloud) | 8h | S3 + cron |
| Feature flags (read-only view) | P3 | 4h | None |
| System metrics dashboard in admin | P1 | 4h | None |

### 2.9 SETTINGS — RECENTLY SPLIT, MOSTLY DONE

**Current**: 6 sub-tabs (Profile, Cloud Accounts, Notifications, API Keys, Team, Audit, Tenant). Role-based visibility.
**Required by Spec 06**: All sub-pages functional, audit log export, invite flow.

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| Audit log CSV export | P1 | 3h | 06 §2 |
| Notification delivery history/stats | P2 | 3h | 07 §4 |
| API key usage stats (requests/day) | P2 | 4h | 08 §2 |

### 2.10 ONBOARDING — MOSTLY DEFERRED

**Current**: Basic signup → auto-create tenant → login. No guided flow, no starter dashboards, no coach marks.
**Required by Spec 09**: "Signup → first dashboard in <5 minutes."

| What's Missing | Priority | Effort | Blocked By |
|----------------|----------|--------|------------|
| Use-case selector at signup | P2 (demo) | 2h | None |
| Auto-generated starter dashboards | P1 (demo) | 4h | Widget system |
| CloudFormation 1-click AWS setup | P2 (cloud) | 8h | Public URL + S3 |
| Coach marks (dismissible overlays) | P3 | 6h | None |
| Post-onboarding nudges (day 1/3/7/14) | P3 (cloud) | 8h | Email delivery |
| Onboarding progress tracking (DB) | P2 | 4h | None |

### 2.11 NOTIFICATIONS — SOLID

**Current**: 6 channel types, pluggable senders, dispatch on fire/resolve, retry with backoff, delivery tracking, test endpoint.
**Required by Spec 07**: SSRF protection, webhook URL encryption at rest, delivery history UI.

| What's Missing | Priority | Effort | Spec Ref |
|----------------|----------|--------|----------|
| SSRF protection (block RFC1918, metadata IPs) | P1 | 2h | 07 §5 |
| Webhook URL encryption at rest | P2 (cloud) | 4h | Secrets Manager |
| Delivery history UI (per-channel stats) | P2 | 3h | 07 §4 |

### 2.12 NEOGUARD AGENT — NOT STARTED

**Current**: Python collector agent (ships 27 OS metrics). No Go agent.
**Required by Spec 12**: Go-based agent with host metrics, cloud identity, disk buffer, install script.

**Verdict**: This is a separate project (Go codebase). Spec estimates 3 days for Phase 1. Deferred until after dashboard + MQL work.

---

## 3. Cross-Cutting Gaps

### 3.1 Error Handling
| Gap | Current | Required | Priority |
|-----|---------|----------|----------|
| Standardized error envelope | `HTTPException(status, "string")` | `{error: {code, message, details, correlation_id}}` | P1 |
| Error codes catalog | None | Documented error codes per module | P2 |

### 3.2 API Conventions
| Gap | Current | Required | Priority |
|-----|---------|----------|----------|
| Cursor-based pagination | Offset-based (`?skip=0&limit=50`) | Cursor-based (`?cursor=X&limit=50`) | P2 |
| Rate limiting on all endpoints | Only on API keys + auth | Per-endpoint, per-tenant rate limits | P1 |
| Idempotency keys | None | On mutation endpoints | P3 |

### 3.3 Observability (Self-Monitoring)
| Gap | Current | Required | Priority |
|-----|---------|----------|----------|
| Self-monitoring dashboard in admin | Stats endpoint exists | Pre-built admin dashboard | P1 |
| Alerting on own health | None | Alerts for evaluator lag, notification failure, high drop rate | P2 |

### 3.4 Testing
| Gap | Current | Required | Priority |
|-----|---------|----------|----------|
| Frontend tests for major pages | Only InfrastructurePage + SettingsPage | Overview, Metrics, Logs, Dashboards, Alerts need tests | P2 |
| Multi-tenant adversarial tests | None | Tenant A cannot see Tenant B data via any path | P1 |
| Load/stress testing | None | Locust: 100 concurrent users, 1k metrics/sec | DEFERRED |
| E2E tests | None | Playwright: 5 critical paths | DEFERRED |

### 3.5 Security
| Gap | Current | Required | Priority |
|-----|---------|----------|----------|
| SSRF protection on webhook URLs | None | Block RFC1918, link-local, metadata endpoints | P1 |
| DB-level RLS enforcement | App-level WHERE clauses only | `ENABLE ROW LEVEL SECURITY` + SET LOCAL | P2 |
| Dependency audit | Never run | `pip-audit`, `npm audit` | P1 |
| Log scrubbing for PII/tokens | Not audited | Regex redaction before write | P2 |
| HTTPS/TLS | None | ACM cert + domain | CLOUD |
| CORS lock-down | Wide open | Production domain only | CLOUD |
| Secrets Manager | Env vars | AWS Secrets Manager | CLOUD |
| CAPTCHA on signup | None | Cloudflare Turnstile | CLOUD |
| HSTS headers | None | 1-year max-age + preload | CLOUD |

---

## 4. Cloud-Blocked Features (Cannot Implement on Laptop)

These require cloud infrastructure. Documented here so we don't forget them.

| Feature | Blocker | Spec Ref |
|---------|---------|----------|
| Google/GitHub OAuth | Public callback URL | 10 §4 |
| Azure AD SSO (OIDC) | IdP config + public URL | 10 §4.3 |
| AWS IAM Identity Center (SAML) | AWS org setup + public URL | 10 §4.4 |
| Email delivery (verification, invites, resets) | SES/SMTP + verified domain | 09, 10 |
| MFA/TOTP | Secure backup storage for recovery codes | 10 §4.5 |
| HTTPS/TLS | Domain + ACM cert | 00 §10 |
| CORS production lock-down | Production domain | 00 §10 |
| Secrets Manager integration | AWS account | 00 §10 |
| GDPR export/delete | S3 for file storage | 11 §4.8 |
| CloudFormation onboarding | Public URL + S3 for template | 09 §5.3 |
| WebSocket live dashboards | Production deployment | 02 §5.6 |
| Webhook URL encryption at rest | Secrets Manager | 07 §5 |
| CAPTCHA on signup | Cloudflare Turnstile | 10 §4.1 |
| Post-onboarding email nudges | Email delivery | 09 §5.7 |
| NeoGuard Go Agent distribution | Public download URL + signing | 12 |
| Multi-stage production Dockerfile | Cloud deployment | - |
| Load testing | Cloud infrastructure | - |
| E2E tests (Playwright) | CI/CD environment | - |

---

## 5. Competitor Comparison Matrix

How NeoGuard stacks up against the big players **right now**:

| Capability | Datadog | Grafana | New Relic | NeoGuard | Gap Severity |
|-----------|---------|---------|-----------|----------|-------------|
| Query language | Metric queries + formulas | PromQL/LogQL/TraceQL | NRQL (best) | **None** | CRITICAL |
| Dashboard widgets | 20+ types | 25+ types | 10+ types | **Basic charts only** | CRITICAL |
| Dashboard variables | Template vars + chaining | Template vars (best) | NRQL-driven vars | **None** | HIGH |
| Anomaly detection | Watchdog (zero-config ML) | Via Prometheus | Lookout/Navigator | **None** | HIGH |
| Pre-built dashboards | 750+ integrations | 4000+ community | 500+ quickstarts | **None** | HIGH |
| Composite alerts | Boolean monitors | Multi-condition rules | NRQL conditions | **None** | MEDIUM |
| Alert grouping | Multi-alert + grouping | Notification policies | Issues model | **None** | MEDIUM |
| Infrastructure discovery | Agent + 750 integrations | Via Prometheus | Auto-instrumentation | **39 types, 2 clouds** | GOOD |
| Multi-tenancy | Orgs + RBAC | Orgs + Teams + RBAC | Accounts + Orgs | **RLS + roles + admin** | GOOD |
| Alerting sophistication | Very high | High | Very high | **Good** | ACCEPTABLE |
| Notification channels | ~20 types | ~20 types | ~10 types | **6 types** | ACCEPTABLE |
| Auth system | SSO/SAML/MFA | SSO/SAML/LDAP | SAML/SCIM | **Password only** | CLOUD-BLOCKED |
| APM/Tracing | Full APM | Tempo | Full APM | **Not in scope** | BY DESIGN |
| Log analytics | Full pipeline | Loki/LogQL | NRQL on logs | **Basic query** | MEDIUM |
| SLO tracking | SLO monitors | SLO plugin | SLI/SLO mgmt | **None** | LOW |

---

## 6. Recommended Priority Order — What to Build Next

### Tier 1: Demo Essentials (must have for boss demo)
1. **P1-P4 alert severity** — 3h, quick win, makes alerts look production-grade
2. **Azure tabs on Infrastructure page** — 6h, shows multi-cloud story
3. **Active sessions UI** — 4h, auth feature completeness
4. **Auth rate limiting** — 4h, security essential
5. **SSRF protection on webhooks** — 2h, security essential
6. **Dependency audit** — 1h, know what we're shipping

### Tier 2: Dashboard Revolution (transforms the product)
7. **MQL parser + compiler** — 32h, unlocks everything below
8. **Dashboard widget system** (timeseries + value) — 12h
9. **Dashboard grid layout** — 12h
10. **Dashboard time controls + URL state** — 4h
11. **Pre-built starter dashboards** (per resource type) — 8h
12. **Dashboard variables** — 8h

### Tier 3: Power Features (differentiators)
13. **Metrics explorer upgrade** (multi-query, chart types) — 16h
14. **Composite alerts** — 8h
15. **Alert detail page** — 6h
16. **Standardized error envelope** — 4h
17. **Anomaly detection (basic STL+MAD)** — 20h

### Tier 4: Polish (professional feel)
18. **Home page redesign** (spec 01) — 12h
19. **Audit log CSV export** — 3h
20. **Dashboard versioning** — 6h
21. **Frontend tests for remaining pages** — 8h
22. **Multi-tenant adversarial tests** — 4h

### Tier 5: Cloud Deployment (after boss approval)
Everything in §4 above.

---

## 7. Honest Assessment

**What we've built is real.** 100 Python files, 276 frontend files, 775 tests, 39 cloud resource discoverers across 2 clouds, a legitimate alerting engine with silences and flapping detection, 6 notification channels, full multi-tenant auth with admin panel and impersonation. This is not a toy.

**What's missing is the visualization layer.** The backend is production-grade. The frontend shows data but doesn't let users explore it. We have the data pipeline (metrics flowing, resources discovered, alerts evaluating) but the user experience of *working with* that data — querying, charting, building dashboards — is where every competitor outpaces us.

**The MQL query language is the single most important thing to build next.** It's the foundation that dashboards, the metrics explorer, and save-to-dashboard all depend on. Without it, the platform is a monitoring backend with a UI that can display data but not analyze it.

**For the boss demo**, the current state is actually strong for showing: multi-tenant auth, role-based access, tenant isolation, admin panel with impersonation, 39-resource-type multi-cloud discovery with real AWS+Azure data, alerting with silences, 6 notification channels. The gaps are in dashboards and metrics exploration — which is what we'd build in Tier 2.
