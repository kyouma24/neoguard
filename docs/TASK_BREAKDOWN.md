# NeoGuard — Task Breakdown & Implementation Tracker

> **Created**: 2026-05-05
> **Source**: GAP_ANALYSIS.md competitive audit
> **Total Items**: 97 gaps identified, 83 actionable tasks

---

## Sprint A: "Make It Premium" — Logs & Metrics Uplift

**Goal**: Transform Logs from barely functional (2/10) to competitive (6/10) and Metrics from basic (4/10) to strong (7/10).
**Estimated Duration**: 5-7 days
**Impact**: Highest ROI sprint — these are the weakest pages and most visible during demo.

---

### A1. Logs Page Overhaul

#### A1.1 Time Range Selector [S] [L-02]
- [ ] Add time range preset buttons (15m, 1h, 6h, 24h, 7d) matching Metrics page pattern
- [ ] Wire `start`/`end` params to existing API endpoint (already supported)
- [ ] Persist time range in URL state
- [ ] Default to "Last 1h"

#### A1.2 Relative Time Display [S] [L-19]
- [ ] Add "X min ago" relative time alongside absolute timestamp
- [ ] Use `formatDistanceToNow` from date-fns
- [ ] Show absolute on hover (title attribute)

#### A1.3 Log Detail Drawer [M] [L-03]
- [ ] Click log row → slide-in drawer from right
- [ ] Display all fields: timestamp, severity, service, message (full), trace_id, span_id
- [ ] Parse and display `attributes` as key-value table
- [ ] Parse and display `resource` as key-value table
- [ ] JSON pretty-print if message is valid JSON
- [ ] Copy button for full log entry (JSON format)
- [ ] "Show Context" button (fetch ±20 logs around same timestamp)
- [ ] Close with Esc or X button

#### A1.4 Structured Field Extraction [M] [L-07]
- [ ] Detect JSON messages → auto-parse and display structured fields
- [ ] Show parsed fields as columns in table view
- [ ] Allow clicking field values to add as filter
- [ ] Syntax highlighting for JSON content (keys = blue, strings = green, numbers = orange)

#### A1.5 Infinite Scroll / Virtualization [M] [L-15]
- [ ] Replace pagination with infinite scroll using react-window or @tanstack/virtual
- [ ] Load next batch (100 logs) when scrolling near bottom
- [ ] Show "Loading more..." indicator at bottom
- [ ] Maintain scroll position on filter change (reset to top)
- [ ] Virtual window renders only visible rows (performance for 10K+ logs)

#### A1.6 Live Tail / Streaming [L] [L-01]
- [ ] Backend: Add SSE endpoint `GET /api/v1/logs/stream` with query filters
- [ ] Frontend: "Live" toggle button in header
- [ ] When active: auto-scroll to newest, green pulse indicator
- [ ] Pause on manual scroll up, resume on "Jump to latest" button
- [ ] Rate limit: buffer and batch render (max 50 lines/sec)
- [ ] Show connection status (connected/reconnecting/disconnected)

#### A1.7 Faceted Search / Field Sidebar [L] [L-04]
- [ ] Backend: Add `GET /api/v1/logs/facets` endpoint returning field value distributions
- [ ] Left sidebar showing: severity (with counts), service (top 20 with counts), custom fields
- [ ] Click value to add as filter, click again to exclude
- [ ] Show percentage bar for each value
- [ ] Collapsible sections per field
- [ ] "More values..." link for fields with 20+ unique values

#### A1.8 Full-Text Search Syntax [L] [L-05]
- [ ] Support `AND`, `OR`, `NOT` operators in search box
- [ ] Support `field:value` syntax (e.g., `service:api-gateway`)
- [ ] Support wildcards (`error*`) and regex (`/pattern/`)
- [ ] Syntax help popover on focus (show available operators)
- [ ] Backend: Parse query syntax and translate to ClickHouse WHERE clauses

#### A1.9 Log Analytics Charts [L] [L-12]
- [ ] Toggle between "List" and "Analytics" view modes
- [ ] Analytics mode: bar chart showing log count over time (bucketed by minute/hour)
- [ ] Color-coded by severity level
- [ ] Clickable bars to zoom into time range
- [ ] Group by field selector (service, severity, custom)

#### A1.10 Column Customization [M] [L-08]
- [ ] Gear icon to open column picker
- [ ] Toggle visibility of: timestamp, severity, service, message, trace_id, any extracted field
- [ ] Drag to reorder columns
- [ ] Persist column config in localStorage
- [ ] Reset to default button

#### A1.11 Syntax Highlighting [M] [L-13]
- [ ] Detect message format (JSON, key=value, plain text)
- [ ] Apply appropriate colorization:
  - JSON: keys blue, strings green, numbers orange, booleans purple
  - key=value: keys dim, values bright
  - Stack traces: file paths underlined, line numbers highlighted
- [ ] Lightweight (no Monaco — use simple regex-based highlighter)

#### A1.12 Copy & Export [S] [L-14]
- [ ] Copy single log to clipboard (formatted JSON)
- [ ] Export current filtered results as CSV
- [ ] Export as JSON (newline-delimited)
- [ ] Download button in header with format selector

#### A1.13 Exclusion Filters [S] [L-18]
- [ ] Right-click or "..." menu on log entry fields
- [ ] "Exclude this value" option → adds NOT filter
- [ ] "Filter to this value" option → adds positive filter
- [ ] Show active filters as removable chips above log list

#### A1.14 Multi-line Log Collapsing [M] [L-16]
- [ ] Detect multi-line messages (stack traces, JSON blocks)
- [ ] Show first line only, with expand chevron
- [ ] Expand inline or in drawer
- [ ] Collapse all / Expand all toggle

#### A1.15 Context View [M] [L-09]
- [ ] "Show surrounding" button in log detail drawer
- [ ] Fetch N logs before and N logs after (same service, ±5 seconds)
- [ ] Display in separate panel with current log highlighted
- [ ] Adjustable window size (±10, ±20, ±50)

---

### A2. Metrics Page Enhancement

#### A2.1 Metric Catalog / Browser [L] [M-02]
- [ ] Backend: `GET /api/v1/metadata/metrics` returning all metric names + descriptions + tag keys + sample rate
- [ ] Sidebar panel (togglable) showing metric tree organized by prefix (aws., neoguard., app.)
- [ ] Search/filter within catalog
- [ ] Click metric → auto-add to query
- [ ] Show cardinality and last seen timestamp per metric
- [ ] Group by provider prefix with collapsible sections

#### A2.2 Tag Autocomplete [M] [M-03]
- [ ] When building filters: typeahead for tag keys (from metric metadata)
- [ ] After selecting tag key: typeahead for tag values (from `GET /api/v1/metadata/tag-values`)
- [ ] Async search with debounce (300ms)
- [ ] Show value count next to each suggestion
- [ ] Support multi-select for IN() filters

#### A2.3 Chart Type Switcher [M] [M-04]
- [ ] Toggle buttons above chart: Line | Area | Bar | Top List | Table
- [ ] Persist selection in URL state
- [ ] Each type renders same data differently:
  - Line: current default
  - Area: filled area chart (stacked optional)
  - Bar: vertical bars per time bucket
  - Top List: horizontal bars ranked by value (latest or avg)
  - Table: tabular view with latest/min/max/avg columns

#### A2.4 Split By / Group By UI [M] [M-07]
- [ ] "Group by" dropdown showing available tag keys for selected metric
- [ ] Selecting a tag → splits single metric into N series (one per unique tag value)
- [ ] Color each series differently
- [ ] Legend shows tag values
- [ ] "Top N" limiter (show top 10, group rest as "other")
- [ ] Wire to backend `group_by` parameter

#### A2.5 Custom Time Range Picker [M] [M-15]
- [ ] Calendar-based picker with date and time inputs
- [ ] Start date/time + End date/time
- [ ] Quick selection shortcuts (Today, Yesterday, This week, Last 7 days)
- [ ] "Apply" button to confirm
- [ ] Display selected range in header text
- [ ] URL persistence

#### A2.6 Formula / Expression Support [L] [M-06]
- [ ] Add "Formula" row type alongside metric queries
- [ ] Reference queries by letter (a, b, c, d, e)
- [ ] Support operators: +, -, *, /, abs(), log(), 100*
- [ ] Example: `a / b * 100` (error rate percentage)
- [ ] Validate formula references exist
- [ ] Render formula result as additional series on chart

#### A2.7 Compare to Past [M] [M-09]
- [ ] "Compare" toggle button
- [ ] Options: vs 1 hour ago, vs 1 day ago, vs 1 week ago
- [ ] Overlay comparison series as dashed line with reduced opacity
- [ ] Time-shift the same query to previous period
- [ ] Legend shows "current" vs "1 day ago" labels

#### A2.8 Export & Share [S] [M-10]
- [ ] "Share" button → generate URL with time range and queries locked
- [ ] "Export" dropdown: CSV (raw data), PNG (chart image)
- [ ] Copy URL to clipboard with confirmation toast
- [ ] PNG export using canvas.toDataURL()

#### A2.9 Query History & Saved Queries [M] [M-05]
- [ ] Auto-save last 20 queries to localStorage
- [ ] "History" dropdown showing recent queries with timestamp
- [ ] Click to restore query params
- [ ] "Save as..." to name a query
- [ ] Saved queries list (localStorage or API-backed)
- [ ] Delete saved queries

#### A2.10 Live Values Table [M] [M-12]
- [ ] Toggle "Show table" below chart
- [ ] Table showing one row per series: name, last value, min, max, avg
- [ ] Auto-update on refresh
- [ ] Sortable by any column
- [ ] Click row to highlight series on chart

#### A2.11 Full-Screen Mode [S] [M-13]
- [ ] Expand chart to fullscreen with keyboard shortcut (F)
- [ ] Show time controls and legend in fullscreen
- [ ] Esc to exit
- [ ] Preserve all current state

#### A2.12 Annotation Overlay [M] [M-14]
- [ ] Fetch annotations for current time range
- [ ] Render as vertical markers on chart (dashed line + label)
- [ ] Hover to see annotation text
- [ ] Toggle annotations visibility
- [ ] Different colors by annotation type

---

## Sprint B: "Intelligence & Navigation"

**Goal**: Add premium navigation features and intelligent home page.
**Estimated Duration**: 4-5 days

---

### B1. Global Command Palette [M] [X-01]
- [ ] Cmd+K / Ctrl+K opens modal overlay
- [ ] Fuzzy search across: dashboards, alert rules, metrics, resources, pages
- [ ] Keyboard navigation (arrow keys, Enter to select, Esc to close)
- [ ] Recent items section (last 5 visited)
- [ ] Quick actions: "Create Dashboard", "New Alert", "Go to Metrics"
- [ ] Backend: `GET /api/v1/search?q=...&types=dashboard,alert,resource`
- [ ] Show entity type badge next to each result
- [ ] Instant navigation on select

### B2. Overview — Favorite Dashboards Grid [M] [O-03]
- [ ] Section showing pinned/favorite dashboards (up to 6)
- [ ] Card format: name, description snippet, last updated, panel count
- [ ] Sparkline preview (tiny chart from first timeseries panel data)
- [ ] Click to navigate to dashboard
- [ ] "Manage favorites" link to dashboards page
- [ ] Empty state: "Pin dashboards from the Dashboards page"

### B3. Overview — Quick Action Buttons [S] [O-04]
- [ ] Row of action buttons below stats: "+ Dashboard", "+ Alert Rule", "Explore Metrics", "View Logs"
- [ ] Each navigates to respective page/action
- [ ] Respect role permissions (hide buttons user can't act on)
- [ ] Keyboard shortcut hints on hover

### B4. Alert Search & Sort [S] [A-16]
- [ ] Search input in Rules tab header (filters by name, metric)
- [ ] Sort dropdown: Name (A-Z), Severity (P1 first), Status, Created date
- [ ] Persist sort preference
- [ ] Show result count

### B5. Dashboard Folders [M] [D-01]
- [ ] Backend: `folders` table (id, tenant_id, name, parent_id, created_at)
- [ ] Backend: CRUD routes for folders + move dashboard to folder
- [ ] Frontend: tree view in dashboard list sidebar
- [ ] Drag dashboard into folder
- [ ] Create/rename/delete folders
- [ ] Breadcrumb navigation within folders
- [ ] "All Dashboards" view shows flat list
- [ ] URL reflects current folder path

### B6. Overview — Service Health Map [L] [O-01]
- [ ] Visual diagram of services (API, Database, Cache, Queue, etc.)
- [ ] Each service node: name, status indicator (green/yellow/red), metric preview
- [ ] Status derived from: active alerts, health checks, resource state
- [ ] Connections between services showing request flow
- [ ] Click service → navigate to infrastructure/dashboard
- [ ] Animated pulse on healthy nodes, flash on degraded
- [ ] Configurable layout (user can position nodes)

### B7. Visual Query Builder [XL] [M-01]
- [ ] Multi-step form: 1) Select Metric, 2) Add Filters, 3) Choose Aggregation, 4) Add Functions
- [ ] Step 1: Metric dropdown with search and categorization
- [ ] Step 2: Tag filter builder with add/remove rows, operator selection (=, !=, IN, NOT IN, wildcard)
- [ ] Step 3: Aggregation selector with preview of what it does
- [ ] Step 4: Function chain (add rate(), derivative(), moving_average(N), etc.) with drag-reorder
- [ ] Generate MQL string from form state (visible in "MQL" view toggle)
- [ ] Bidirectional: edit MQL → form updates, edit form → MQL updates
- [ ] Inline documentation/help for each function
- [ ] Preview chart updates live as builder changes

---

## Sprint C: "Operational Excellence" — Alerts & SLOs

**Goal**: Bring alerting from 6/10 to 8/10 with intelligent features.
**Estimated Duration**: 4-5 days

---

### C1. Composite / Multi-Condition Alerts [L] [A-01]
- [ ] New alert type: "Composite"
- [ ] Combine 2-5 sub-conditions with AND/OR logic
- [ ] Each sub-condition: metric + condition + threshold (reuses existing rule builder)
- [ ] Alert fires only when composite expression evaluates true
- [ ] Backend: Evaluate all sub-conditions, apply boolean logic
- [ ] UI: Visual logic tree with add/remove/reorder

### C2. Anomaly-Based Alerts [L] [A-02]
- [ ] New condition type: "anomaly" (deviation from rolling baseline)
- [ ] Parameters: sensitivity (1-5), baseline window (1h, 6h, 24h, 7d)
- [ ] Backend: Calculate rolling mean + stddev, alert when value exceeds N stddev
- [ ] UI: Show baseline band on preview chart
- [ ] Display "Expected range" in alert event details

### C3. Alert Grouping & Deduplication [L] [A-04]
- [ ] Group alerts by: metric, service, region (configurable)
- [ ] Show group header with count of child alerts
- [ ] Suppress duplicate notifications within group
- [ ] "View all in group" expander
- [ ] Badge showing group size

### C4. Escalation Policies [M] [A-05]
- [ ] Backend: `escalation_policies` table (steps with delay and target)
- [ ] Define multi-step escalation: Step 1 (immediate → team channel), Step 2 (5min → PagerDuty), Step 3 (15min → manager email)
- [ ] If acknowledged, stop escalation
- [ ] UI: Escalation policy builder in Settings
- [ ] Assign policy to alert rules

### C5. Bulk Operations [S] [A-10]
- [ ] Checkbox column in rules table
- [ ] "Select all" header checkbox
- [ ] Bulk action bar: Enable, Disable, Delete, Change severity
- [ ] Confirmation dialog showing count and action
- [ ] Same for events: bulk acknowledge

### C6. Alert Rule Templates [M] [A-11]
- [ ] Pre-built templates library: High CPU, Low Disk, High Error Rate, High Latency, Pod Restart, etc.
- [ ] "Create from Template" button in rules tab
- [ ] Template picker modal with categories (Compute, Database, Network, Application)
- [ ] Auto-fill metric, condition, threshold, description
- [ ] User can customize before saving

### C7. Event Detail Actions [S] [A-15]
- [ ] Inline action buttons on each event row (visible on hover):
  - Acknowledge (existing)
  - Resolve manually
  - Snooze (1h, 4h, 24h, custom)
  - Add note
  - Create silence from this event
- [ ] Snooze: temporarily suppress notifications for this event
- [ ] Note: free-text annotation attached to event

### C8. SLO Management Page [L] [X-05]
- [ ] New page: `/slos`
- [ ] Define SLOs: name, description, metric, target (e.g., 99.9%), window (7d, 30d, 90d)
- [ ] SLO calculation: (good events / total events) * 100
- [ ] Display: current SLI value, error budget remaining, burn rate
- [ ] Visual: budget burn chart over time
- [ ] Alert when budget consumed (configurable threshold: 50%, 75%, 90%)
- [ ] SLO list view with status indicators (Met / At Risk / Breached)

### C9. Alert Correlation Timeline [M] [A-07]
- [ ] Unified timeline view across all alert rules
- [ ] Time-based visualization (horizontal timeline, last 24h/7d)
- [ ] Color bands showing firing periods per rule
- [ ] Overlap detection (multiple rules firing simultaneously highlighted)
- [ ] Click segment to view event details
- [ ] Filter by severity, service, status

### C10. Downtime Scheduling [M] [A-08]
- [ ] Scheduled maintenance window (extends existing silences)
- [ ] Calendar view showing upcoming downtimes
- [ ] Auto-create silence with notification: "Starting maintenance on X"
- [ ] Auto-end: send "Maintenance complete" notification
- [ ] Recurring support (every Sunday 2-4 AM)

---

## Sprint D: "Infrastructure & Insights"

**Goal**: Enhance infrastructure monitoring and add platform preferences.
**Estimated Duration**: 4-5 days

---

### D1. Tag-Based Filtering Sidebar [M] [I-08]
- [ ] Left sidebar on Infrastructure page
- [ ] Facets: Region, Status, Type, Provider, Environment tag, Team tag
- [ ] Each facet shows value count
- [ ] Multi-select within facet (OR logic within, AND across facets)
- [ ] Active filters shown as chips above resource list
- [ ] Clear all button

### D2. Resource Comparison [M] [I-06]
- [ ] "Compare" button (enabled when 2-3 same-type resources selected)
- [ ] Side-by-side view: metrics charts aligned, metadata diff
- [ ] Highlight differences in configuration
- [ ] Useful for: why is server A slow but B is fast?

### D3. Host Map / Hexagonal View [L] [I-02]
- [ ] Toggle between "Table" and "Map" view for compute resources
- [ ] Hexagonal grid where each hex = one resource
- [ ] Color based on selected metric (CPU = green→red gradient)
- [ ] Size based on instance type or another metric
- [ ] Hover shows resource name and metric value
- [ ] Click to drill down
- [ ] Group hexes by tag (region, environment)

### D4. Multi-Cloud Unified View [M] [I-14]
- [ ] Single table mixing AWS + Azure resources
- [ ] Group by function (Compute, Database, Storage, Network, Serverless)
- [ ] Provider badge column
- [ ] Unified metric comparison across clouds
- [ ] Useful for hybrid workloads

### D5. Auto-Discovery Status Dashboard [M] [I-12]
- [ ] New section in Infrastructure page: "Collection Status"
- [ ] Per-account: last discovery time, duration, resources found, errors
- [ ] Per-region: coverage percentage, enabled services
- [ ] Error log for failed discoveries with retry button
- [ ] Progress bar during active discovery

### D6. Timezone & Locale Settings [S] [S-03]
- [ ] User preferences: timezone dropdown (IANA timezone list)
- [ ] Date format preference: ISO, US (MM/DD), EU (DD/MM)
- [ ] Store in user profile (backend)
- [ ] Apply globally to all timestamp displays
- [ ] Default: browser timezone

### D7. Theme Selection (Dark Mode) [M] [S-04] [X-09]
- [ ] Theme toggle: Light / Dark / System (auto-detect)
- [ ] CSS custom properties swap (all pages already use CSS variables)
- [ ] Dark palette: dark backgrounds, light text, adjusted chart colors
- [ ] Persist preference in localStorage + user profile
- [ ] Smooth transition animation on switch
- [ ] Preview in settings before applying

### D8. Inventory Export [S] [I-07]
- [ ] "Export" button in infrastructure page header
- [ ] Export formats: CSV, JSON
- [ ] Include: resource ID, name, type, region, status, tags, last seen
- [ ] Apply current filters to export
- [ ] Download as file with timestamp in filename

### D9. Usage & Billing Dashboard [L] [S-01]
- [ ] Admin section: current usage statistics
- [ ] Metrics: ingestion rate (points/sec), storage used, log volume
- [ ] Trend charts: daily/weekly ingestion history
- [ ] Quota display: current usage vs. plan limits
- [ ] Projection: estimated monthly usage at current rate

### D10. Data Retention Policies UI [M] [S-11]
- [ ] Settings tab: configure retention per data type
- [ ] Metrics: 30d, 60d, 90d, 180d, 1y (default 90d)
- [ ] Logs: 7d, 14d, 30d, 60d, 90d (default 30d)
- [ ] Alerts/Events: 30d, 90d, 180d, 1y (default 90d)
- [ ] Show current storage impact
- [ ] Backend: configure ClickHouse TTL and TimescaleDB retention policies

---

## Sprint E: "Analytics & Collaboration"

**Goal**: Add advanced analytics and collaboration features.
**Estimated Duration**: 5-6 days

---

### E1. Query History & Saved Queries [M] [M-05]
*(Detailed in A2.9)*

### E2. Formula/Expression Support [L] [M-06]
*(Detailed in A2.6)*

### E3. Compare to Past [M] [M-09]
*(Detailed in A2.7)*

### E4. Full-Text Search Syntax [L] [L-05]
*(Detailed in A1.8)*

### E5. Log Analytics Charts [L] [L-12]
*(Detailed in A1.9)*

### E6. Dashboard Playlist [M] [D-02]
- [ ] "Playlist" feature in dashboard list
- [ ] Create playlist: select dashboards + order + interval per slide (10s-5m)
- [ ] Play playlist: auto-rotate in kiosk mode
- [ ] Controls: play/pause, next/previous, speed
- [ ] Full-screen mode for TV displays
- [ ] Shareable playlist URL

### E7. Drill-Down Links [M] [D-05]
- [ ] Panel display option: "Data links"
- [ ] Configure URL template with variables: ${__value}, ${__time}, ${__series.name}, ${varName}
- [ ] Click data point → navigate to linked dashboard/page with context
- [ ] Support internal navigation (other dashboards) and external URLs
- [ ] Visual indicator on panels with drill-down configured

### E8. Repeat Panels [L] [D-06]
- [ ] Panel option: "Repeat for variable"
- [ ] Select a multi-value variable
- [ ] Panel auto-repeats for each variable value
- [ ] Layout: horizontal (row) or vertical (column)
- [ ] Each clone gets the variable value injected into queries
- [ ] Auto-adjusts grid layout

### E9. Activity Timeline (Overview) [M] [O-05]
- [ ] Backend: `GET /api/v1/activity/feed` (last 24h actions)
- [ ] Events: dashboard created/edited, alert rule changed, resource discovered, user joined
- [ ] Timeline display with icons per event type
- [ ] Relative timestamps
- [ ] Click to navigate to related entity
- [ ] Filter by type

### E10. Notebook / Investigation Mode [XL] [X-02]
- [ ] New page: `/notebooks`
- [ ] Create investigation documents combining:
  - Text blocks (markdown)
  - Metric chart blocks (embed queries)
  - Log query blocks (embed filtered logs)
  - Image/screenshot uploads
- [ ] Real-time collaboration (live updates)
- [ ] Share with team members
- [ ] Attach to incidents
- [ ] Export as markdown/PDF
- [ ] Template notebooks for common investigations

---

## Future Sprints (P2/P3 — Post-Demo)

### Sprint F: "APM & Tracing"
- Distributed trace collection and storage
- Flame graph visualization
- Span waterfall view
- Service performance overview
- Trace-to-log correlation
- Auto-instrumentation guides

### Sprint G: "AI & ML"
- Natural language query assistant
- Automated root cause analysis
- Anomaly detection with ML models
- Intelligent alert noise reduction
- Suggested dashboard content
- Metric correlation recommendations

### Sprint H: "Enterprise Features"
- SSO (SAML/OIDC) implementation
- Advanced RBAC (resource-type permissions)
- Compliance reporting (SOC2, HIPAA)
- Multi-region deployment
- Customer-managed encryption keys
- Scheduled report delivery (email PDF)

---

## Progress Tracking

| Sprint | Total Tasks | Completed | In Progress | Blocked |
|--------|-------------|-----------|-------------|---------|
| A | 27 | 0 | 0 | 0 |
| B | 7 | 0 | 0 | 0 |
| C | 10 | 0 | 0 | 0 |
| D | 10 | 0 | 0 | 0 |
| E | 10 | 0 | 0 | 0 |
| **Total** | **64** | **0** | **0** | **0** |

---

## Definition of Done (per task)

1. Feature implemented (backend + frontend)
2. TypeScript compiles (0 errors)
3. Unit tests pass (existing + new)
4. Visual verification in browser
5. No console errors/warnings
6. Responsive to container width
7. Permission-aware (respects user role)
8. URL state persisted where applicable
9. Loading/empty/error states handled
10. Keyboard accessible (focus, Enter/Esc)
