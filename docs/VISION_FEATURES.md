# NeoGuard — Category-Leading Features Vision

> **Date**: 2026-05-05
> **Mandate**: Build the world's leading monitoring platform. Not "match Datadog" — make them feel outdated.
> **Constraint**: Everything marked LOCAL is buildable on laptop. CLOUD items deferred to deployment.

---

## Philosophy: Why Existing Platforms Are Stuck

Every monitoring platform today is built on the same paradigm:
1. Collect telemetry
2. Display telemetry
3. Alert on telemetry
4. Human investigates

**NeoGuard's paradigm shift**: Collect → Understand → Predict → Act → Learn

We don't just show data. We **understand causality**, **predict failures**, **suggest actions**, and **learn from outcomes**.

---

## TIER 1: Revolutionary Features (No One Does This Well)

### 1. Causal Intelligence Engine [LOCAL]
**What**: Every anomaly explained with a causal chain, not just "X is high."

**Implementation**:
- Record system state snapshots every 15s (metric values, resource states, alert statuses)
- Build a dependency graph from resource relationships + metric correlations
- When an alert fires: walk the causal graph backward to find the root trigger
- Display: "DB latency ↑ → caused by → connection pool saturated → caused by → pod restart → caused by → memory OOM → caused by → memory leak in commit abc123"
- Show confidence score: "87% confidence (based on 3 prior similar incidents)"

**Why no one has this**: Dynatrace's Davis AI does topology-aware RCA but doesn't show the causal chain transparently. Users get "here's the answer" but can't verify WHY.

**Local scope**:
- [ ] State recorder (snapshot metrics + resource state every 15s → TimescaleDB)
- [ ] Dependency graph builder (from resource relationships + metric correlations)
- [ ] Causal chain walker (BFS through dependency graph when alert fires)
- [ ] Confidence scoring (cosine similarity to past incident patterns)
- [ ] UI: "Root Cause" panel on AlertDetailPage showing chain visualization
- [ ] UI: Incident timeline with causal annotations

---

### 2. Revenue Impact on Every Alert [LOCAL with mock data]
**What**: Every alert shows estimated $/minute business impact. Prioritize by cost, not just severity.

**Implementation**:
- Define business metrics: requests/sec, conversion rate, cart value, active users
- Map services to revenue: "payment-service handles $X/hour"
- When alert fires on a service: calculate impact = (degradation %) * (service revenue rate)
- Display: "$847/hr at risk" on alert events, not just "P1"
- Aggregate: "This incident has cost ~$12,400 so far"

**Local scope**:
- [ ] Business metrics model (service → revenue mapping, configurable per tenant)
- [ ] Impact calculator (degradation % * service revenue rate)
- [ ] Alert event enrichment with estimated_impact_per_hour field
- [ ] UI: Revenue impact badge on alert events (red dollar amount)
- [ ] UI: Incident cost accumulator (running total since fired_at)
- [ ] Settings: "Business Impact Configuration" tab (map services → revenue)
- [ ] Sort events by impact instead of just severity

**Deferred to cloud**: Real Stripe/payment integration, actual revenue data feeds

---

### 3. Git-Aware Observability [LOCAL]
**What**: Every metric change automatically attributed to the exact commit that caused it.

**Implementation**:
- Accept deployment events via API: `POST /api/v1/events/deploy` (commit SHA, service, timestamp, author)
- When metric anomaly detected: correlate with deployments in ±15min window
- Display: "Latency increased 40ms — likely caused by commit abc123 by @dev (merged 8 min before)"
- Link to diff/PR when available
- Track accuracy: did user confirm or dismiss the attribution?

**Local scope**:
- [ ] Deployment event model + API route (`POST /api/v1/events/deploy`)
- [ ] Deployment annotation on all charts (vertical marker with commit info)
- [ ] Anomaly-to-deploy correlator (time proximity + service match)
- [ ] UI: Deployment markers on metric charts with hover card (commit, author, message)
- [ ] UI: "Likely caused by" section on alert detail page
- [ ] Deploy event ingestion from webhook (GitHub webhook compatible format)
- [ ] Deploy history page showing all deployments with metric impact summary

**Deferred to cloud**: GitHub/GitLab webhook auto-registration, CI/CD pipeline integration

---

### 4. Live Investigation Rooms [LOCAL]
**What**: Multiplayer debugging workspace. Like Figma but for incident response.

**Implementation**:
- Investigation document combining: metric charts, log queries, annotations, hypotheses, actions taken
- Real-time sync between users (WebSocket-based on same machine for demo, scalable later)
- Investigation DAG: "I checked X → ruled out → then checked Y → found root cause Z"
- AI copilot suggestions: "Based on your investigation pattern, you might want to check..."
- Persist investigation state for shift handoffs

**Local scope**:
- [ ] Investigation model (id, title, status, created_by, participants, blocks[])
- [ ] Block types: metric_chart, log_query, text_note, hypothesis, action_taken, link
- [ ] API routes: CRUD investigations, add/remove blocks, update status
- [ ] UI: Investigation page with block editor (add chart, add logs, add note)
- [ ] UI: Investigation timeline (chronological view of all blocks)
- [ ] Status workflow: Open → Investigating → Root Cause Found → Resolved → Postmortem
- [ ] Auto-link investigations to alerts (create investigation from alert event)
- [ ] Export investigation as markdown report

**Deferred to cloud**: Real-time multi-user sync (WebSocket), AI copilot suggestions

---

### 5. Predictive Degradation Engine [LOCAL]
**What**: Alert BEFORE failure happens. "At current trajectory, DB connection pool exhausts in 47 minutes."

**Implementation**:
- Linear regression on key resource metrics (connection pools, disk usage, memory, queue depth)
- Extrapolate trajectory to capacity limit
- Alert type: "forecast" — fires when predicted breach time < configured threshold
- Display: "Disk will be full in 6 hours at current write rate"

**Local scope**:
- [ ] Trajectory calculator (linear regression over sliding window)
- [ ] Capacity limits model (max connections, max disk, max memory — per resource type)
- [ ] Forecast alert condition type ("forecast_breach" — threshold = minutes until breach)
- [ ] UI: Forecast line on metric charts (dashed extension of current trend)
- [ ] UI: "Predicted" badge on forecast-triggered alerts
- [ ] Forecast widget type for dashboards (shows time-to-exhaustion for key resources)
- [ ] Configurable: window size, confidence threshold, capacity limits

---

### 6. Progressive Trust Automation (Self-Healing) [LOCAL]
**What**: Automated remediation that earns trust over time. Start with suggestions, graduate to auto-fix.

**Implementation**:
- Define runbooks as structured steps: condition → action → verification
- Trust levels: Suggest (show what would happen) → Confirm (one-click approve) → Auto (execute with 30s undo window)
- Track success rate per runbook
- Trust automatically upgrades after N consecutive successes
- Full audit trail of every automated action

**Local scope**:
- [ ] Runbook model (id, name, trigger_condition, steps[], trust_level, success_count, failure_count)
- [ ] Step types: shell_command, api_call, wait, verify_metric, notify
- [ ] Execution engine (execute steps sequentially with rollback on failure)
- [ ] Trust level progression (suggest=0, confirm=5 successes, auto=20 successes)
- [ ] Undo window (30s buffer before action is committed)
- [ ] UI: Runbook library page (create, edit, view execution history)
- [ ] UI: "Suggested Action" card on alert events (with approve/dismiss buttons)
- [ ] UI: Automation history (what was run, what succeeded, what was rolled back)
- [ ] Audit log for all automated actions

**Deferred to cloud**: Shell command execution on remote hosts, Kubernetes API integration

---

### 7. Unified Security + Observability Timeline [LOCAL]
**What**: Single timeline showing security events interleaved with performance events.

**Implementation**:
- Ingest security events: failed auth, privilege escalation, unusual API patterns, config changes
- Display alongside performance events on same timeline
- Pattern detection: "DDoS manifests as performance degradation BEFORE security team is alerted"
- Blast radius visualization: "This security event affects these 3 services and ~2,400 users"

**Local scope**:
- [ ] Security event model (extends existing security_log with richer event types)
- [ ] Security event API: `POST /api/v1/security/events` (ingest from any source)
- [ ] Unified timeline API: `GET /api/v1/timeline?types=alert,security,deploy,change`
- [ ] UI: Unified Timeline page (filterable by event type, time range)
- [ ] UI: Security events on alert detail page (correlated by time + service)
- [ ] Pattern detector: concurrent security + performance anomalies flagged
- [ ] Severity escalation: auto-upgrade alert severity when security correlation found

---

### 8. Experience-Driven Alerting [LOCAL with synthetic data]
**What**: Alert on business metrics, not just infrastructure. "Conversion rate dropped 3%" triggers investigation.

**Implementation**:
- Business metric ingestion (synthetic for demo: simulated users, conversions, revenue)
- Business SLOs: "checkout availability > 99.9%", "search p99 < 200ms"
- Business alerts: threshold on business metrics, not just infra
- Auto-correlation: when business metric drops, system automatically identifies which infra metric is the cause

**Local scope**:
- [ ] Business metric model (type: counter/gauge, unit: currency/percent/users)
- [ ] Synthetic business data generator (simulates realistic traffic patterns with anomalies)
- [ ] Business SLO definition + tracking (window-based: 7d, 30d)
- [ ] Error budget calculation and burn rate
- [ ] UI: SLO Management page (/slos) with status cards
- [ ] UI: Error budget burn chart
- [ ] Alert on budget burn: "50% budget consumed in first 10% of window"
- [ ] Business metric correlation: link business degradation to infra root cause

---

## TIER 2: Premium Features (Best-in-Class Execution)

### 9. Advanced Logs Explorer [LOCAL]

*Full overhaul making logs competitive with Splunk:*

- [ ] **Live Tail** — SSE streaming with auto-scroll and pause-on-scroll
- [ ] **Log Detail Drawer** — click to expand, JSON parsing, trace context, attributes
- [ ] **Faceted Search** — sidebar with field distributions, click-to-filter
- [ ] **Query Syntax** — AND/OR/NOT, field:value, wildcards, regex
- [ ] **Time Range Picker** — presets + custom calendar picker
- [ ] **Infinite Scroll** — virtualized list (react-window)
- [ ] **Syntax Highlighting** — JSON colorization, key-value parsing
- [ ] **Log Analytics** — toggle to chart view (count over time, group by field)
- [ ] **Context View** — "show surrounding logs" ±N seconds
- [ ] **Column Customization** — add/remove/reorder columns
- [ ] **Saved Views** — named filter presets
- [ ] **Export** — CSV/JSON download
- [ ] **Log Patterns** — auto-cluster similar messages, show templates with fill counts
- [ ] **Multi-line Collapse** — stack traces collapsed, expand on click

---

### 10. Visual Metrics Query Builder [LOCAL]

*Match Datadog's Metrics Explorer UX:*

- [ ] **Metric Catalog Sidebar** — browsable tree of all metrics with descriptions
- [ ] **Tag Autocomplete** — typeahead for keys and values
- [ ] **Chart Type Switcher** — line/area/bar/top-list/table from same query
- [ ] **Group By / Split By** — visual control to split by tag with top-N limiter
- [ ] **Formula Support** — combine queries (a + b, a / b * 100)
- [ ] **Compare to Past** — overlay previous period as dashed line
- [ ] **Custom Time Picker** — calendar-based date/time selection
- [ ] **Live Values Table** — latest/min/max/avg per series below chart
- [ ] **Query History** — recent queries with one-click restore
- [ ] **Share/Export** — URL sharing, CSV/PNG export

---

### 11. Intelligent Home Page [LOCAL]

*Not a status dashboard — an operations command center:*

- [ ] **Service Health Map** — topology with real-time status indicators
- [ ] **Favorite Dashboards** — pinned dashboards with sparkline previews
- [ ] **Quick Actions** — buttons for common operations (keyboard shortcut hints)
- [ ] **Activity Feed** — deployments, config changes, user actions (last 24h)
- [ ] **Incident Summary** — active investigations with owner and time elapsed
- [ ] **SLO Overview** — top SLOs with error budget bars
- [ ] **Predicted Issues** — forecast engine warnings ("disk full in 6h")
- [ ] **Cost Ticker** — current infrastructure spend rate (simulated)
- [ ] **Getting Started Checklist** — progressive onboarding for new tenants
- [ ] **Customizable Layout** — user can rearrange/hide sections

---

### 12. Smart Alerting Upgrades [LOCAL]

- [ ] **Composite Alerts** — multi-condition with AND/OR logic
- [ ] **Anomaly Alerts** — deviation from rolling baseline (configurable sensitivity)
- [ ] **Forecast Alerts** — predict threshold breach in N hours
- [ ] **Alert Grouping** — related alerts collapsed into incidents
- [ ] **Escalation Policies** — time-based escalation tiers
- [ ] **Alert Templates** — pre-built for common scenarios
- [ ] **Event Actions** — resolve, snooze, assign, add note inline
- [ ] **Bulk Operations** — multi-select for enable/disable/delete
- [ ] **Alert Search & Sort** — filter by name/metric/severity
- [ ] **Correlation Timeline** — unified view of all alerts over time
- [ ] **Noise Reduction Score** — per-rule metric: "this rule fires X times/week, Y% acknowledged"

---

### 13. Dashboard Enhancements [LOCAL]

- [ ] **Folder Organization** — hierarchical folders with drag-to-move
- [ ] **Playlist Mode** — auto-rotate through dashboards for TV displays
- [ ] **Repeat Panels** — auto-clone panel for each value of a variable
- [ ] **Drill-Down Links** — click panel value → navigate with context
- [ ] **Panel Alert Shortcut** — create alert directly from panel query
- [ ] **Dashboard Search** — search across all dashboards by panel content
- [ ] **PDF Export** — export dashboard as PDF snapshot
- [ ] **Panel Library** — shared reusable panel definitions
- [ ] **Conditional Visibility** — show/hide panels based on variable value

---

### 14. Infrastructure Advanced [LOCAL]

- [ ] **Host Map Visualization** — hexagonal grid colored by metric
- [ ] **Tag-Based Filtering Sidebar** — faceted filter panel
- [ ] **Resource Comparison** — side-by-side metrics for 2-3 resources
- [ ] **Multi-Cloud Unified View** — single table mixing AWS+Azure by function
- [ ] **Discovery Status Dashboard** — coverage %, errors, timing
- [ ] **Inventory Export** — CSV/JSON download of full resource list
- [ ] **Container/K8s View** — pod/node/namespace hierarchy (mock data for demo)

---

### 15. Platform UX [LOCAL]

- [ ] **Global Command Palette** — Cmd+K with fuzzy search across everything
- [ ] **Dark Mode** — full dark theme via CSS variable swap
- [ ] **Keyboard Shortcuts System** — documented, discoverable, per-page
- [ ] **Timezone/Locale Preferences** — user-level setting applied globally
- [ ] **Toast Notifications** — non-intrusive feedback for actions
- [ ] **Breadcrumb Navigation** — consistent breadcrumbs on all sub-pages
- [ ] **Loading Skeletons** — animated placeholders instead of spinners
- [ ] **Responsive Design** — tablet-friendly layouts (not mobile)
- [ ] **Accessibility Audit** — WCAG 2.1 AA compliance pass

---

### 16. Settings & Admin Enhancements [LOCAL]

- [ ] **Usage Dashboard** — ingestion rates, storage, API call counts
- [ ] **Quota Management** — per-tenant limits (metrics/sec, log volume)
- [ ] **Data Retention UI** — configure retention per data type
- [ ] **Webhook Test with Response** — show actual HTTP response when testing
- [ ] **Audit Log Export** — CSV/JSON download
- [ ] **System Health Admin Page** — DB sizes, queue depths, ingestion lag
- [ ] **Impersonation UI** — improved impersonation with audit trail view

---

## TIER 3: Deferred to Cloud

These require cloud infrastructure and are NOT buildable locally:

| Feature | Reason |
|---------|--------|
| Real-time multi-user sync (WebSocket) | Requires persistent server connections |
| AI Copilot (LLM-powered) | Requires API access to Claude/GPT |
| GitHub/GitLab webhook auto-registration | Requires public callback URL |
| SSO (SAML/OIDC) | Requires IdP configuration |
| Email notifications (actual delivery) | Requires SMTP/SES |
| Mobile app | Requires app store deployment |
| Scheduled PDF reports (email delivery) | Requires cron + email |
| Real Stripe/payment integration | Requires payment processor |
| K8s actual monitoring | Requires running cluster |
| Load testing (Locust at scale) | Requires distributed infra |
| APM/Distributed Tracing (full) | Requires instrumented apps + collector fleet |
| Custom ML models (ONNX inference) | Requires GPU/compute |
| Edge agent deployment | Requires physical edge devices |
| Multi-region replication | Requires cloud infrastructure |

---

## Implementation Priority (Local Development)

### Phase 1: Foundation UX (3-4 days)
> Make everything feel premium before adding new features.

1. Dark Mode (CSS variable overrides)
2. Global Command Palette (Cmd+K)
3. Loading Skeletons (replace all spinners)
4. Toast Notification System
5. Keyboard Shortcuts Framework

### Phase 2: Logs Overhaul (4-5 days)
> Biggest weakness → biggest impact.

1. Time Range Selector + Relative Time
2. Log Detail Drawer + JSON Parsing
3. Infinite Scroll (virtualized)
4. Live Tail (SSE streaming)
5. Faceted Search Sidebar
6. Query Syntax (AND/OR/NOT/field:value)
7. Log Analytics (chart mode)
8. Syntax Highlighting

### Phase 3: Metrics Explorer (3-4 days)
> From basic to Datadog-competitive.

1. Metric Catalog Sidebar
2. Tag Autocomplete
3. Chart Type Switcher
4. Group By / Split By
5. Formula Support
6. Compare to Past
7. Custom Time Picker
8. Live Values Table

### Phase 4: Intelligence Layer (5-6 days)
> This is where we SURPASS competitors.

1. Deployment Event System (Git-Aware Observability)
2. Predictive Degradation Engine (Forecast Alerts)
3. Causal Intelligence (Root Cause Chains)
4. Revenue Impact Calculator
5. Business SLO Page
6. Unified Security+Performance Timeline

### Phase 5: Operational Excellence (4-5 days)
> Make alerting and investigation world-class.

1. Composite + Anomaly Alerts
2. Alert Grouping & Escalation
3. Investigation Rooms
4. Progressive Automation (Runbooks)
5. Alert Templates + Bulk Ops
6. Correlation Timeline

### Phase 6: Navigation & Home (3-4 days)
> Tie everything together.

1. Intelligent Home Page (command center)
2. Service Health Map
3. Activity Feed
4. Favorite Dashboards
5. Getting Started Checklist
6. Predicted Issues Widget

### Phase 7: Dashboard + Infra Polish (3-4 days)
1. Dashboard Folders
2. Playlist Mode
3. Repeat Panels + Drill-Down Links
4. Host Map Visualization
5. Resource Comparison
6. Multi-Cloud Unified View

---

## Success Criteria

After all local phases complete, NeoGuard should:

| Metric | Target |
|--------|--------|
| Competitive score (avg across all areas) | 8.5/10 |
| Features that NO competitor has | 5+ (causal, predictive, revenue, git-aware, trust automation) |
| Page load time (perceived) | < 1.5s |
| Log query response | < 500ms for 100 results |
| Metric query response | < 200ms |
| Dashboard render (10 panels) | < 2s |
| Frontend tests | 900+ |
| Backend tests | 1,500+ |
| TypeScript errors | 0 |

---

## The NeoGuard Difference (Elevator Pitch)

> "Other platforms show you what happened. NeoGuard tells you WHY it happened, WHAT it'll cost your business, and HOW to prevent it next time — then learns to fix it automatically."

**5 things only NeoGuard does:**
1. Shows the causal chain behind every alert (not just "X is high")
2. Displays dollar impact of every incident in real-time
3. Predicts resource exhaustion before it becomes an outage
4. Attributes metric changes to exact git commits automatically
5. Builds self-healing automation that earns trust progressively
