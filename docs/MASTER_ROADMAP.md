# NeoGuard — Master Implementation Roadmap

> **Date**: 2026-05-05
> **Scope**: LOCAL development only. Cloud-dependent features explicitly deferred.
> **Goal**: Build the world's most capable monitoring platform on a laptop.

---

## Phase 1: Foundation UX (3-4 days)
> Make everything feel premium before adding new features.

### 1.1 Dark Mode System
- CSS variable overrides for dark palette
- Theme toggle: Light / Dark / System (auto-detect)
- Persist preference in localStorage + user profile
- All pages already use CSS variables — just swap values
- Smooth transition animation

### 1.2 Global Command Palette (Cmd+K)
- Modal overlay with fuzzy search
- Search across: dashboards, alert rules, metrics, resources, pages, actions
- Keyboard navigation (arrows, Enter, Esc)
- Recent items section
- Quick actions: "Create Dashboard", "New Alert", "Go to Metrics"
- Backend: `GET /api/v1/search?q=...&types=dashboard,alert,resource`

### 1.3 Loading Skeletons
- Replace all "Loading..." text and spinners with animated skeleton placeholders
- Reusable SkeletonCard, SkeletonTable, SkeletonChart components
- Pulse animation via CSS @keyframes

### 1.4 Toast Notification System
- Non-intrusive bottom-right toasts for action feedback
- Types: success, error, info, warning
- Auto-dismiss (3-5s) with manual close
- Queue multiple toasts with stacking
- Zustand store for toast state

### 1.5 Keyboard Shortcuts Framework
- Global shortcut registry
- Per-page shortcuts (documented in ? overlay)
- Common: Cmd+K (palette), ? (help), / (search), G then H (go home), G then D (go dashboards)
- ShortcutsHelp modal showing all active shortcuts

---

## Phase 2: Logs Overhaul (4-5 days)
> Transform from 2/10 to 7/10. Biggest weakness → biggest impact.

### 2.1 Time Range Selector
- Preset buttons: 5m, 15m, 1h, 6h, 24h, 7d
- Custom range: calendar picker with date+time inputs
- URL state persistence
- Wire to existing API start/end params

### 2.2 Relative Time Display
- "2 min ago" alongside absolute timestamp
- Absolute on hover

### 2.3 Log Detail Drawer
- Click row → slide-in drawer
- All fields: timestamp, severity, service, full message, trace_id, span_id
- Attributes table (key-value)
- Resource metadata table
- JSON pretty-print for JSON messages
- Copy button (full JSON)
- "Show Context" button (±20 logs around timestamp)

### 2.4 Infinite Scroll (Virtualization)
- Replace pagination with @tanstack/virtual or react-window
- Load next 100 on scroll near bottom
- Virtual window renders only visible rows
- "Loading more..." indicator

### 2.5 Live Tail (SSE Streaming)
- Backend: `GET /api/v1/logs/stream` SSE endpoint with query filters
- "Live" toggle button with green pulse indicator
- Auto-scroll to newest
- Pause on manual scroll up, "Jump to latest" button
- Connection status indicator

### 2.6 Faceted Search Sidebar
- Backend: `GET /api/v1/logs/facets` (field value distributions)
- Left sidebar: severity (with counts), service (top 20), extracted fields
- Click value → add filter, click again → exclude
- Percentage bars per value
- Collapsible sections

### 2.7 Query Syntax
- AND/OR/NOT operators
- field:value syntax (service:api-gateway)
- Wildcards (error*) and regex (/pattern/)
- Syntax help popover on focus
- Backend: parse and translate to ClickHouse WHERE

### 2.8 Log Analytics Mode
- Toggle: "List" ↔ "Analytics" view
- Analytics: bar chart of log count over time (bucketed)
- Color-coded by severity
- Clickable bars to zoom into time range
- Group by selector (service, severity, custom)

### 2.9 Syntax Highlighting
- JSON: keys blue, strings green, numbers orange, booleans purple
- key=value: keys dim, values bright
- Stack traces: file paths underlined
- Lightweight regex-based (no Monaco)

### 2.10 Column Customization
- Gear icon → column picker
- Toggle: timestamp, severity, service, message, trace_id, any field
- Drag to reorder
- Persist in localStorage

### 2.11 Log Patterns (Auto-Clustering)
- Group similar log messages by template
- Show pattern template + fill count + first/last occurrence
- "20,847 logs match this pattern"
- Click pattern → filter to matching logs
- Backend: simple token-based similarity clustering

### 2.12 Export & Saved Views
- Export: CSV/JSON download of filtered results
- Saved Views: name current filters → restore later
- Stored per-user in localStorage (or API-backed)

---

## Phase 3: Metrics Explorer (3-4 days)
> From basic (4/10) to Datadog-competitive (7/10).

### 3.1 Metric Catalog Sidebar
- Backend: `GET /api/v1/metadata/metrics` (names, descriptions, tag keys, cardinality)
- Togglable sidebar panel
- Tree organized by prefix (aws., neoguard., app.)
- Search/filter within catalog
- Click metric → add to query
- Show cardinality + last seen per metric

### 3.2 Tag Autocomplete
- Typeahead for tag keys (from metric metadata)
- After key selected: typeahead for values (`GET /api/v1/metadata/tag-values`)
- Async search with 300ms debounce
- Multi-select for IN() filters

### 3.3 Chart Type Switcher
- Toggle: Line | Area | Bar | Top List | Table
- URL state persistence
- Same data, different rendering per type

### 3.4 Group By / Split By
- Dropdown: available tag keys for selected metric
- Splits single metric into N series (one per tag value)
- "Top N" limiter with "other" grouping
- Wire to backend group_by parameter

### 3.5 Formula Support
- "Formula" row type alongside metric queries
- Reference by letter (a, b, c, d, e)
- Operators: +, -, *, /, abs(), log(), percentage
- Validate references exist
- Render as additional series

### 3.6 Compare to Past
- "Compare" toggle: vs 1h ago, 1d ago, 1w ago
- Overlay comparison as dashed line (0.4 opacity)
- Legend: "current" vs "1 day ago"

### 3.7 Custom Time Range Picker
- Calendar picker with date + time inputs
- Quick shortcuts: Today, Yesterday, This week, Last 7 days
- Apply button to confirm
- URL persistence

### 3.8 Live Values Table
- Toggle "Show table" below chart
- Columns: series name, last, min, max, avg
- Auto-update on refresh
- Sortable, clickable (highlights series)

### 3.9 Query History
- Auto-save last 20 queries to localStorage
- "History" dropdown with timestamp
- "Save as..." named queries
- Delete saved queries

### 3.10 Export & Share
- Share: generate URL with locked time range + queries
- Export: CSV (raw data), PNG (chart image)
- Copy URL with toast confirmation

---

## Phase 4: Intelligence Layer (5-6 days)
> THIS IS WHERE WE SURPASS ALL COMPETITORS.

### 4.1 Deployment Event System (Git-Aware)
- Model: DeployEvent (id, tenant_id, service, commit_sha, author, message, timestamp, branch, pr_url)
- API: `POST /api/v1/events/deploy` (GitHub webhook compatible)
- API: `GET /api/v1/events/deploy?service=X&start=T1&end=T2`
- Chart integration: vertical deployment markers on ALL metric charts
- Hover card: commit SHA, author, message, time
- Anomaly correlation: "Latency ↑ likely caused by deploy abc123 (8 min before)"
- Deploy history page: list all deploys with metric impact summary per service

### 4.2 Predictive Degradation Engine
- Trajectory calculator: linear regression over sliding window per metric
- Capacity limits model: max_connections, max_disk_gb, max_memory — per resource type
- Forecast alert condition: "forecast_breach" fires when predicted time to breach < threshold
- Chart: dashed forecast line extending current trend
- Widget: "Time to Exhaustion" showing hours remaining for key resources
- Alert badge: "Predicted" (distinct from "Firing")

### 4.3 Causal Intelligence Engine
- State recorder: snapshot metrics + resource state every 15s (lightweight — just key metrics)
- Dependency graph: built from resource relationships + metric correlation (Pearson r > 0.7)
- When alert fires: BFS backward through dependency graph
- Output: causal chain array [{metric, value, change_pct, caused_by: next_node}]
- UI: "Root Cause Analysis" section on AlertDetailPage
- Chain visualization: horizontal flow diagram A → B → C with metrics at each node
- Confidence score: based on correlation strength + temporal proximity

### 4.4 Revenue Impact Calculator
- Model: ServiceRevenue (service_name, revenue_per_hour, currency, updated_at)
- Settings: "Business Impact" configuration tab
- Impact formula: degradation_pct * service_revenue_rate * duration_hours
- Alert enrichment: every event shows "$X/hr at risk"
- Incident accumulator: running cost since alert fired
- Sort by: "Highest Impact" option in events list
- Overview widget: "Estimated Business Impact: $X today"

### 4.5 Business SLO Page
- Model: SLO (name, description, metric_query, target_pct, window_days, service)
- Calculation: (good events / total events) * 100 over window
- Error budget: (1 - target) * window_total
- Burn rate: current consumption rate vs. budget
- UI: /slos page with SLO cards (status: Met/At Risk/Breached)
- Chart: error budget burn over time
- Alert: when budget consumption exceeds threshold (50%, 75%, 90%)

### 4.6 Unified Security + Performance Timeline
- Unified event model (type: alert|security|deploy|change|business)
- API: `GET /api/v1/timeline?types=...&start=...&end=...`
- UI: /timeline page showing all event types on single chronological view
- Filter by type, service, severity
- Pattern detection: concurrent security + performance anomalies flagged
- Color-coded event types with icons

---

## Phase 5: Operational Excellence (4-5 days)
> Make alerting and investigation world-class.

### 5.1 Composite Alerts (Multi-Condition)
- New alert type: "composite"
- 2-5 sub-conditions with AND/OR logic
- Visual logic tree builder
- Fires when composite expression evaluates true

### 5.2 Anomaly-Based Alerts
- Condition type: "anomaly" (deviation from baseline)
- Parameters: sensitivity (1-5), baseline window (1h/6h/24h/7d)
- Backend: rolling mean + stddev, alert on N sigma deviation
- Preview: show baseline band on chart

### 5.3 Alert Grouping & Incidents
- Group by: metric, service, region
- Collapsed group header with child count
- Auto-create "incident" when group exceeds threshold
- Incident status: active → mitigated → resolved

### 5.4 Escalation Policies
- Model: EscalationPolicy (steps: [{delay_sec, target_channel_id}])
- If not ack'd within delay, escalate to next step
- Stop on acknowledgment
- Settings: policy builder UI

### 5.5 Investigation Rooms
- Model: Investigation (id, title, status, blocks[], created_by)
- Block types: metric_chart, log_query, text_note, hypothesis, action_taken
- API: CRUD investigations, add/update/remove blocks
- UI: /investigations page and /investigations/:id editor
- Link investigations to alerts (create from event)
- Status: Open → Investigating → RCA Found → Resolved → Postmortem
- Export as markdown

### 5.6 Progressive Automation (Runbooks)
- Model: Runbook (id, name, trigger_alert_rule_id, steps[], trust_level)
- Step types: api_call, wait, verify_metric, notify
- Trust levels: suggest (0) → confirm (5 successes) → auto (20 successes)
- Execution with rollback on step failure
- "Suggested Action" card on alert events
- Automation history page

### 5.7 Alert Templates & Bulk Ops
- Template library: High CPU, Disk Full, High Error Rate, Memory Leak, etc.
- "Create from Template" picker
- Bulk: multi-select checkbox + action bar (enable/disable/delete)

### 5.8 Alert Correlation Timeline
- Unified horizontal timeline of all alert events (24h/7d)
- Color bands showing firing periods per rule
- Overlap detection highlighted
- Click segment → event detail

---

## Phase 6: Home Page & Navigation (3-4 days)
> Tie everything together into a command center.

### 6.1 Intelligent Home Page Redesign
- Service Health Map (top section)
- Active Incidents row (from investigation rooms)
- Predicted Issues (from forecast engine)
- Favorite Dashboards grid (sparkline previews)
- Activity Feed (deploys, changes, user actions)
- SLO Overview strip (error budget bars)
- Quick Actions row with keyboard hints
- Cost Ticker (simulated spend rate)

### 6.2 Getting Started Checklist
- Progressive onboarding for new tenants
- Steps: Connect Account → Create Dashboard → Set Alert → Invite Team
- Persisted per-tenant, dismissible
- Links to relevant pages/wizards

### 6.3 Activity Feed
- Backend: `GET /api/v1/activity/feed` (last 24h)
- Events: dashboard CRUD, alert rule changes, deployments, resource discoveries, user joins
- Timeline with icons per type
- Click to navigate to entity

### 6.4 Notification Preferences
- Per-user notification settings
- Choose: which alert severities, email digest frequency, mute hours
- In-app notification bell with unread count

---

## Phase 7: Dashboard + Infrastructure Polish (3-4 days)

### 7.1 Dashboard Folders
- Backend: folders table + CRUD + move-to-folder
- Frontend: sidebar tree, drag-to-move, breadcrumbs
- Create/rename/delete folders

### 7.2 Playlist Mode
- Create: select dashboards + order + interval (10s-5m)
- Play: auto-rotate in kiosk mode
- Controls: play/pause/next/prev/speed
- Shareable playlist URL

### 7.3 Repeat Panels
- Option: "Repeat for variable"
- Auto-clone for each multi-value variable option
- Layout: horizontal or vertical
- Each clone gets variable value injected

### 7.4 Host Map Visualization
- Toggle: Table ↔ Map view for compute resources
- Hexagonal grid, color = metric value (CPU gradient)
- Hover: resource name + value
- Click: drill-down
- Group by tag

### 7.5 Resource Comparison
- Select 2-3 same-type resources → "Compare" button
- Side-by-side: metrics aligned, config diff highlighted
- Answer: "why is A slow but B fast?"

### 7.6 Multi-Cloud Unified View
- Single table mixing AWS + Azure resources
- Group by function: Compute, Database, Storage, Network, Serverless
- Provider badge column
- Useful for hybrid workloads

### 7.7 Tag-Based Filtering Sidebar
- Facets: Region, Status, Type, Provider, env tag, team tag
- Multi-select within facet
- Active filters as chips
- Clear all button

---

## Deferred to Cloud (NOT implemented locally)

| Feature | Cloud Dependency |
|---------|-----------------|
| Real-time multi-user sync | Persistent WebSocket server |
| AI Copilot (LLM-powered) | Claude/GPT API access |
| GitHub webhook registration | Public callback URL |
| SSO (SAML/OIDC) | IdP configuration |
| Email delivery | SMTP/SES |
| Mobile app | App store deployment |
| Scheduled PDF reports | Cron + email |
| Stripe integration | Payment processor |
| K8s actual monitoring | Running cluster |
| Load testing (distributed) | Distributed infra |
| APM (full distributed tracing) | Instrumented apps + collector fleet |
| Custom ML models (ONNX) | GPU compute |
| Edge agent deployment | Physical edge devices |
| Multi-region replication | Cloud infrastructure |
| Community marketplace | Hosting + payment |
| PR Impact Predictor (ML) | Training infrastructure |

---

## Total Estimated Duration

| Phase | Days | Items |
|-------|------|-------|
| Phase 1: Foundation UX | 3-4 | 5 systems |
| Phase 2: Logs Overhaul | 4-5 | 12 features |
| Phase 3: Metrics Explorer | 3-4 | 10 features |
| Phase 4: Intelligence Layer | 5-6 | 6 systems |
| Phase 5: Operational Excellence | 4-5 | 8 systems |
| Phase 6: Home & Navigation | 3-4 | 4 systems |
| Phase 7: Dashboard + Infra | 3-4 | 7 features |
| **TOTAL** | **25-32 days** | **52 major features** |

---

## The NeoGuard Difference

> "Other platforms show you what happened. NeoGuard tells you WHY it happened, WHAT it'll cost your business, and HOW to prevent it next time — then learns to fix it automatically."

**5 things only NeoGuard does (no competitor):**
1. **Causal Chains** — shows WHY behind every alert, not just WHAT
2. **Revenue Impact** — every incident shows $/minute business cost
3. **Predictive Alerts** — warns before failure, not after
4. **Git Attribution** — links metric changes to exact commits
5. **Trust Automation** — self-healing that earns autonomy progressively
