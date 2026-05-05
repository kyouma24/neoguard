# NeoGuard — Implementation Tasks (Structured per Max.md Protocol)

> **Created**: 2026-05-05
> **Protocol**: Each task follows UNDERSTAND → INVESTIGATE → DESIGN → IMPLEMENT → VERIFY
> **Scope**: LOCAL development only. Cloud-dependent features deferred.
> **Conventions**: Per CLAUDE.md §4 — TypeScript strict, SCSS tokens, Pydantic v2, parameterized SQL, conventional commits

---

## Phase 1: Foundation UX

**Objective**: Establish premium feel before adding features. Every interaction should feel polished.
**Prerequisite**: None (standalone)
**Exit Criteria**: Dark mode working, Cmd+K working, all spinners replaced, toast system active, shortcuts documented.

---

### TASK 1.1: Dark Mode System

**Spec Reference**: VISION_FEATURES.md §1.1
**Blast Radius**: All pages (CSS variables are used everywhere)
**Security**: None
**Tenant Isolation**: Theme is per-user, stored in localStorage + profile API

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 1.1.1 | Define dark palette CSS variables (all --color-* tokens) | `frontend/src/index.css` | All tokens have dark-mode values |
| 1.1.2 | Create ThemeContext provider (light/dark/system) | `frontend/src/contexts/ThemeContext.tsx` | Reads system preference via matchMedia |
| 1.1.3 | Apply `data-theme="dark"` attribute to document root | ThemeContext | CSS selects on `[data-theme="dark"]` |
| 1.1.4 | Theme toggle component in Settings > Profile | `frontend/src/pages/settings/ProfileTab.tsx` | 3 options: Light/Dark/System |
| 1.1.5 | Persist preference to localStorage (immediate) + user profile API (async) | ThemeContext + `api.ts` | Survives refresh, syncs across tabs |
| 1.1.6 | Chart color adjustments for dark mode (axis, grid, tooltip) | Chart components | Charts readable in both themes |
| 1.1.7 | Verify all pages render correctly in dark mode | Manual verification | No illegible text, no invisible borders |

**DRY Check**: Single source of truth for theme tokens. No inline color overrides.
**Test Plan**: Visual verification + ThemeContext unit tests (provider renders, persists, responds to system change).

---

### TASK 1.2: Global Command Palette (Cmd+K)

**Spec Reference**: VISION_FEATURES.md §1.2, Grafana/Datadog command palette
**Blast Radius**: New global component, touches App.tsx (provider mount)
**Security**: Search results must be tenant-scoped. Super admin sees all.
**Tenant Isolation**: Backend search endpoint filters by tenant_id.

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 1.2.1 | Backend: `GET /api/v1/search` endpoint (query, types filter, limit) | `src/neoguard/api/routes/search.py` | Returns results from dashboards, alerts, resources |
| 1.2.2 | Backend: Search across tables (ILIKE on name/description fields) | `src/neoguard/services/search.py` | Respects tenant_id, max 20 results |
| 1.2.3 | Frontend: CommandPalette component (modal overlay) | `frontend/src/components/CommandPalette.tsx` | Opens on Cmd+K / Ctrl+K |
| 1.2.4 | Fuzzy matching (client-side filter on API results) | CommandPalette | Tolerant of typos (simple character matching) |
| 1.2.5 | Keyboard navigation (↑↓ arrows, Enter select, Esc close) | CommandPalette | Fully keyboard accessible |
| 1.2.6 | Result categories: Dashboards, Alerts, Resources, Pages, Actions | CommandPalette | Grouped with headers |
| 1.2.7 | Recent items section (last 5 navigated from palette) | localStorage | Persists across sessions |
| 1.2.8 | Quick actions: "Create Dashboard", "New Alert", time range shortcuts | CommandPalette | Actions execute immediately |
| 1.2.9 | Mount in App.tsx, register global keydown listener | `frontend/src/App.tsx` | Works from any page |
| 1.2.10 | Unit tests: open/close, keyboard nav, search filtering | `CommandPalette.test.tsx` | ≥8 tests |

**DRY Check**: Reuse existing `api.dashboards.list`, `api.alerts.listRules` for data.
**Test Plan**: Unit tests for component behavior + backend route tests.

---

### TASK 1.3: Loading Skeletons

**Spec Reference**: VISION_FEATURES.md §1.3
**Blast Radius**: All pages (replace existing loading states)
**Security**: None
**Tenant Isolation**: N/A (purely visual)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 1.3.1 | Create Skeleton base component (pulse animation, configurable width/height) | `frontend/src/components/Skeleton.tsx` | CSS @keyframes shimmer |
| 1.3.2 | SkeletonCard variant (card outline with shimmer lines) | Skeleton.tsx | Matches Card component dimensions |
| 1.3.3 | SkeletonTable variant (header + N rows of shimmer) | Skeleton.tsx | Configurable row count |
| 1.3.4 | SkeletonChart variant (rectangular area with axis placeholder) | Skeleton.tsx | Matches chart container aspect ratio |
| 1.3.5 | Replace OverviewPage "Loading..." with skeletons | OverviewPage.tsx | Skeleton matches final layout |
| 1.3.6 | Replace AlertsPage loading with skeletons | AlertsPage.tsx | Table skeleton for rules/events |
| 1.3.7 | Replace LogsPage loading with skeletons | LogsPage.tsx | Table skeleton |
| 1.3.8 | Replace MetricsPage loading with skeletons | MetricsPage.tsx | Chart + sidebar skeleton |
| 1.3.9 | Replace InfrastructurePage loading with skeletons | InfrastructurePage.tsx | Card grid skeleton |
| 1.3.10 | Replace DashboardsPage loading with skeletons | DashboardsPage.tsx | Grid cards skeleton |

**DRY Check**: Single Skeleton component with variants, not per-page implementations.
**Test Plan**: Snapshot tests for skeleton renders.

---

### TASK 1.4: Toast Notification System

**Spec Reference**: VISION_FEATURES.md §1.4
**Blast Radius**: Global (new component + store), all pages use for feedback
**Security**: Sanitize toast message content (no HTML injection)
**Tenant Isolation**: N/A (client-side only)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 1.4.1 | Create Zustand toast store (add, remove, queue) | `frontend/src/stores/toastStore.ts` | Max 5 visible, FIFO queue |
| 1.4.2 | Toast component (types: success/error/info/warning) | `frontend/src/components/Toast.tsx` | Color-coded, icon per type |
| 1.4.3 | ToastContainer (renders active toasts, positioned bottom-right) | Toast.tsx | Stacked with gap, animated enter/exit |
| 1.4.4 | Auto-dismiss timer (3s success, 5s error, configurable) | Toast store | Timer resets on hover |
| 1.4.5 | Manual close button on each toast | Toast.tsx | X icon, accessible |
| 1.4.6 | `useToast()` hook (convenience: toast.success("msg"), toast.error("msg")) | `frontend/src/hooks/useToast.ts` | Importable from any component |
| 1.4.7 | Mount ToastContainer in App.tsx | App.tsx | Always rendered |
| 1.4.8 | Replace alert() calls and inline success messages with toasts | Various pages | grep for alert( and "Saved!" patterns |
| 1.4.9 | Unit tests: add/remove, auto-dismiss, queue behavior | `Toast.test.tsx` | ≥6 tests |

**DRY Check**: Single store, single component. No per-page toast implementations.
**Test Plan**: Store unit tests + component render tests.

---

### TASK 1.5: Keyboard Shortcuts Framework

**Spec Reference**: VISION_FEATURES.md §1.5
**Blast Radius**: Global system + per-page registrations
**Security**: None
**Tenant Isolation**: N/A

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 1.5.1 | Shortcut registry store (register/unregister per-page shortcuts) | `frontend/src/stores/shortcutStore.ts` | Page shortcuts cleaned up on unmount |
| 1.5.2 | Global keydown handler (respects input focus — no fire when typing) | `frontend/src/hooks/useShortcuts.ts` | Ignores events from input/textarea |
| 1.5.3 | Global shortcuts: Cmd+K (palette), ? (help overlay) | App.tsx | Always active |
| 1.5.4 | ShortcutsHelp modal (shows all active shortcuts in current context) | `frontend/src/components/ShortcutsHelp.tsx` | Groups: Global, Page-specific |
| 1.5.5 | Per-page registrations (Alerts: N=new, Metrics: F=fullscreen, etc.) | Individual pages | Registered in useEffect, cleaned up on return |
| 1.5.6 | Visual hint system (show shortcut key next to relevant buttons) | Button components | Small badge like "[K]" next to search |
| 1.5.7 | Unit tests: registry, handler, help modal | Tests | ≥5 tests |

**DRY Check**: Central registry, no per-page keydown listeners scattered around.
**Test Plan**: Hook unit tests + registry behavior tests.

---

## Phase 2: Logs Overhaul

**Objective**: Transform Logs from 2/10 to 7/10. This is our biggest weakness.
**Prerequisite**: Phase 1 (Toast system for action feedback, Skeletons for loading)
**Exit Criteria**: Live tail working, JSON expansion, faceted search, infinite scroll, analytics mode.

---

### TASK 2.1: Logs Time Range & Relative Time

**Spec Reference**: VISION_FEATURES.md §2.1, §2.2
**Blast Radius**: LogsPage.tsx only
**Security**: Time range bounds validated server-side (max 7d lookback)
**Tenant Isolation**: Existing (log queries already filter by tenant_id)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.1.1 | Time range preset buttons (5m, 15m, 1h, 6h, 24h, 7d) | LogsPage.tsx | Active state on selected |
| 2.1.2 | Custom time range picker (calendar with date+time) | New: `TimeRangePicker.tsx` | Reusable component |
| 2.1.3 | Wire start/end to log query API call | LogsPage.tsx | Existing API params supported |
| 2.1.4 | URL state persistence for time range | LogsPage.tsx | Shareable URLs |
| 2.1.5 | Relative time on each log row ("2 min ago") | LogsPage.tsx | Absolute on hover title |
| 2.1.6 | Auto-refresh option (10s/30s/1m/off) | LogsPage.tsx | Respects current time range |
| 2.1.7 | Unit tests | LogsPage.test.tsx updates | ≥4 new tests |

---

### TASK 2.2: Log Detail Drawer

**Spec Reference**: VISION_FEATURES.md §2.3
**Blast Radius**: New component + LogsPage row click handler
**Security**: Sanitize log content display (XSS prevention in rendered JSON)
**Tenant Isolation**: Existing (detail fetched from same tenant-scoped query)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.2.1 | LogDetailDrawer component (slide-in from right, 400px width) | `frontend/src/components/LogDetailDrawer.tsx` | Animated transition |
| 2.2.2 | Display all fields: timestamp, severity, service, full message | LogDetailDrawer | Formatted with labels |
| 2.2.3 | trace_id + span_id display (monospace, copy button) | LogDetailDrawer | Click to copy |
| 2.2.4 | Attributes table (key-value from log.attributes) | LogDetailDrawer | Scrollable if many |
| 2.2.5 | Resource metadata table (from log.resource) | LogDetailDrawer | Scrollable if many |
| 2.2.6 | JSON detection + pretty-print for message field | LogDetailDrawer | Syntax highlighted |
| 2.2.7 | Copy full log as JSON button | LogDetailDrawer | Copies to clipboard |
| 2.2.8 | "Show Context" button (fetch ±20 logs around timestamp) | LogDetailDrawer + API | Shows in sub-section |
| 2.2.9 | Close on Esc, click outside, or X button | LogDetailDrawer | Focus trap |
| 2.2.10 | Wire: click log row → open drawer with that log | LogsPage.tsx | Row becomes clickable |
| 2.2.11 | Unit tests | LogDetailDrawer.test.tsx | ≥6 tests |

---

### TASK 2.3: Infinite Scroll (Virtualization)

**Spec Reference**: VISION_FEATURES.md §2.4
**Blast Radius**: LogsPage.tsx (replaces pagination)
**Security**: N/A
**Tenant Isolation**: N/A

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.3.1 | Install @tanstack/react-virtual | package.json | Dependency added |
| 2.3.2 | Replace log table with virtualized list | LogsPage.tsx | Only visible rows in DOM |
| 2.3.3 | Load next batch on scroll near bottom (IntersectionObserver) | LogsPage.tsx | Triggers at 80% scroll |
| 2.3.4 | "Loading more..." indicator at bottom | LogsPage.tsx | Shows during fetch |
| 2.3.5 | Handle end of results (no more infinite trigger) | LogsPage.tsx | Shows "End of results" |
| 2.3.6 | Reset scroll position on filter/search change | LogsPage.tsx | Scrolls to top |
| 2.3.7 | Performance: verify 10K logs renders without jank | Manual test | Smooth 60fps scroll |

---

### TASK 2.4: Live Tail (SSE Streaming)

**Spec Reference**: VISION_FEATURES.md §2.5
**Blast Radius**: New backend endpoint + frontend streaming component
**Security**: SSE endpoint must validate auth (session cookie), tenant isolation
**Tenant Isolation**: Stream filters by tenant_id from authenticated session

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.4.1 | Backend: SSE endpoint `GET /api/v1/logs/stream` | `src/neoguard/api/routes/logs.py` | text/event-stream content type |
| 2.4.2 | Backend: Accept query params (service, severity, query) | logs.py | Filters applied to stream |
| 2.4.3 | Backend: Poll ClickHouse every 1s for new logs (since last timestamp) | logs.py | Efficient incremental query |
| 2.4.4 | Backend: Heartbeat every 15s (keep connection alive) | logs.py | `: heartbeat\n\n` comment |
| 2.4.5 | Frontend: "Live" toggle button with pulse indicator | LogsPage.tsx | Green dot when active |
| 2.4.6 | Frontend: EventSource connection management | LogsPage.tsx | Connect/disconnect on toggle |
| 2.4.7 | Frontend: Auto-scroll to newest log | LogsPage.tsx | Smooth scroll animation |
| 2.4.8 | Frontend: Pause on manual scroll up | LogsPage.tsx | "Jump to latest" button appears |
| 2.4.9 | Frontend: Rate limiting (buffer, batch render max 50/sec) | LogsPage.tsx | No DOM thrashing |
| 2.4.10 | Frontend: Connection status (connected/reconnecting/error) | LogsPage.tsx | Visual indicator |
| 2.4.11 | Reconnection logic (exponential backoff) | LogsPage.tsx | Auto-reconnect on drop |
| 2.4.12 | Unit tests (backend: SSE format; frontend: toggle/scroll behavior) | Tests | ≥6 tests |

---

### TASK 2.5: Faceted Search Sidebar

**Spec Reference**: VISION_FEATURES.md §2.6
**Blast Radius**: New backend endpoint + LogsPage layout change (add sidebar)
**Security**: Facet values are tenant-scoped
**Tenant Isolation**: Facet query filters by tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.5.1 | Backend: `GET /api/v1/logs/facets` endpoint | logs.py | Returns field distributions |
| 2.5.2 | Backend: Query ClickHouse for top N values per field + count | `src/neoguard/services/logs.py` | Fields: severity, service + auto-detected |
| 2.5.3 | Frontend: LogFacetSidebar component (left panel, 250px) | `frontend/src/components/LogFacetSidebar.tsx` | Collapsible sections |
| 2.5.4 | Facet display: value name + count + percentage bar | LogFacetSidebar | Visual bar fills |
| 2.5.5 | Click value → add as positive filter | LogFacetSidebar + LogsPage | Filter chips appear |
| 2.5.6 | Click again (or right-click) → exclude filter | LogFacetSidebar | Shows as negation |
| 2.5.7 | Active filters shown as removable chips above log list | LogsPage.tsx | X to remove each |
| 2.5.8 | Refetch facets when time range or search changes | LogsPage.tsx | Facets reflect current query |
| 2.5.9 | "Show more..." for fields with >10 values | LogFacetSidebar | Expandable |
| 2.5.10 | Unit tests | LogFacetSidebar.test.tsx | ≥5 tests |

---

### TASK 2.6: Query Syntax Enhancement

**Spec Reference**: VISION_FEATURES.md §2.7
**Blast Radius**: LogsPage search + backend query parsing
**Security**: Query parser must prevent SQL injection (never pass raw user input to ClickHouse)
**Tenant Isolation**: Existing

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.6.1 | Backend: Query parser for structured syntax | `src/neoguard/services/log_query_parser.py` | Tokenizes user input |
| 2.6.2 | Supported operators: AND, OR, NOT, field:value, wildcards | log_query_parser.py | Returns AST |
| 2.6.3 | AST → ClickHouse WHERE clause compiler (parameterized) | log_query_parser.py | Never f-strings |
| 2.6.4 | Frontend: Syntax help popover on search input focus | LogsPage.tsx | Shows available operators |
| 2.6.5 | Frontend: Syntax highlighting in search input (optional) | LogsPage.tsx | Color operators differently |
| 2.6.6 | Backend unit tests for parser (valid/invalid queries) | `tests/unit/test_log_query_parser.py` | ≥15 tests (edge cases) |
| 2.6.7 | Security test: SQL injection attempts through query syntax | test_log_query_parser.py | All blocked |

---

### TASK 2.7: Log Analytics Mode

**Spec Reference**: VISION_FEATURES.md §2.8
**Blast Radius**: LogsPage.tsx (new view mode)
**Security**: N/A
**Tenant Isolation**: Existing (same query, different visualization)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.7.1 | View toggle: "List" ↔ "Analytics" | LogsPage.tsx | URL state persisted |
| 2.7.2 | Backend: `GET /api/v1/logs/histogram` (count per time bucket) | logs.py | Bucketed by minute/hour based on range |
| 2.7.3 | Frontend: Bar chart (Recharts) of log count over time | LogsPage.tsx | Color-coded by severity |
| 2.7.4 | Click bar → zoom into that time bucket | LogsPage.tsx | Updates time range |
| 2.7.5 | Group-by selector (service, severity, custom field) | LogsPage.tsx | Changes chart grouping |
| 2.7.6 | Stats summary: total count, error %, top service | LogsPage.tsx | Cards above chart |
| 2.7.7 | Unit tests | LogsPage.test.tsx updates | ≥3 new tests |

---

### TASK 2.8: Syntax Highlighting & Column Customization

**Spec Reference**: VISION_FEATURES.md §2.9, §2.10
**Blast Radius**: Log row rendering
**Security**: HTML entity escaping in highlighted output
**Tenant Isolation**: N/A

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.8.1 | Message format detector (JSON, key=value, plain) | `frontend/src/utils/logHighlighter.ts` | Returns format type |
| 2.8.2 | JSON highlighter (keys blue, strings green, numbers orange) | logHighlighter.ts | React elements with classNames |
| 2.8.3 | key=value highlighter (keys dim, values bright) | logHighlighter.ts | Regex-based |
| 2.8.4 | Apply highlighting to log message column | LogsPage.tsx | Configurable on/off |
| 2.8.5 | Column customization gear icon + picker modal | LogsPage.tsx | Checkboxes per column |
| 2.8.6 | Drag-to-reorder columns | Column picker | DnD within modal |
| 2.8.7 | Persist column config in localStorage | LogsPage.tsx | Key: neoguard_log_columns |
| 2.8.8 | Reset to default button | Column picker | Restores original layout |

---

### TASK 2.9: Log Patterns & Export

**Spec Reference**: VISION_FEATURES.md §2.11, §2.12
**Blast Radius**: New backend endpoint + LogsPage UI
**Security**: Pattern clustering must not expose cross-tenant data
**Tenant Isolation**: Pattern query scoped to tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 2.9.1 | Backend: `GET /api/v1/logs/patterns` endpoint | logs.py | Returns top patterns |
| 2.9.2 | Backend: Token-based similarity clustering algorithm | `src/neoguard/services/log_patterns.py` | Replace variables with * |
| 2.9.3 | Frontend: "Patterns" tab/toggle alongside List/Analytics | LogsPage.tsx | Shows pattern list |
| 2.9.4 | Pattern display: template + count + first/last occurrence | LogsPage.tsx | Sorted by count |
| 2.9.5 | Click pattern → filter logs matching that pattern | LogsPage.tsx | Switches to List view |
| 2.9.6 | Export button (CSV/JSON) for current filtered results | LogsPage.tsx | Downloads file |
| 2.9.7 | Saved views: save current filter config with a name | LogsPage.tsx | Stored in localStorage |
| 2.9.8 | Load saved view: dropdown showing named views | LogsPage.tsx | Restores all filters |
| 2.9.9 | Backend unit tests for pattern clustering | test_log_patterns.py | ≥8 tests |

---

## Phase 3: Metrics Explorer

**Objective**: From basic (4/10) to competitive (7/10).
**Prerequisite**: Phase 1 (Command palette, toasts)
**Exit Criteria**: Metric catalog browsable, tags autocomplete, chart type switching, formulas work.

---

### TASK 3.1: Metric Catalog Sidebar

**Spec Reference**: VISION_FEATURES.md §3.1
**Blast Radius**: New backend endpoint + MetricsPage layout (add sidebar)
**Security**: Metric names are tenant-scoped (user only sees metrics they've ingested)
**Tenant Isolation**: Metadata endpoint filters by tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 3.1.1 | Backend: `GET /api/v1/metadata/metrics` (names, tag_keys, cardinality, last_seen) | `src/neoguard/api/routes/metadata.py` | Tenant-scoped |
| 3.1.2 | Backend: Query TimescaleDB for distinct metric names + metadata | `src/neoguard/services/metadata.py` | Efficient (materialized or cached) |
| 3.1.3 | Frontend: MetricCatalog sidebar component (togglable, 280px) | `frontend/src/components/MetricCatalog.tsx` | Collapsible tree |
| 3.1.4 | Tree organized by prefix (aws., neoguard., app.) | MetricCatalog | Auto-grouped |
| 3.1.5 | Search/filter within catalog | MetricCatalog | Instant filter as you type |
| 3.1.6 | Click metric → add to current query | MetricCatalog + MetricsPage | Metric selected in dropdown |
| 3.1.7 | Show cardinality + last seen + tag keys per metric | MetricCatalog | Expandable detail row |
| 3.1.8 | Unit tests | MetricCatalog.test.tsx | ≥5 tests |

---

### TASK 3.2: Tag Autocomplete

**Spec Reference**: VISION_FEATURES.md §3.2
**Blast Radius**: MetricsPage filter section
**Security**: Tag values are tenant-scoped
**Tenant Isolation**: Endpoint filters by tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 3.2.1 | Backend: `GET /api/v1/metadata/tag-values?metric=X&key=Y` | metadata.py | Returns top 100 values |
| 3.2.2 | Frontend: TagFilter component with key autocomplete | `frontend/src/components/TagFilter.tsx` | Combobox UX |
| 3.2.3 | After key selected: value autocomplete (async, debounced 300ms) | TagFilter | Shows value count |
| 3.2.4 | Multi-select support for IN() filters | TagFilter | Tags as chips |
| 3.2.5 | Wire to MetricsPage query (add tags_filter to API call) | MetricsPage.tsx | Filters applied to query |
| 3.2.6 | Unit tests | TagFilter.test.tsx | ≥4 tests |

---

### TASK 3.3: Chart Type Switcher

**Spec Reference**: VISION_FEATURES.md §3.3
**Blast Radius**: MetricsPage chart rendering
**Security**: N/A
**Tenant Isolation**: N/A

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 3.3.1 | Toggle buttons above chart: Line, Area, Bar, Top List, Table | MetricsPage.tsx | Active state styling |
| 3.3.2 | Line: current default (TimeSeriesChart) | MetricsPage.tsx | No change needed |
| 3.3.3 | Area: filled area with optional stacking | MetricsPage.tsx | AreaChart from Recharts |
| 3.3.4 | Bar: vertical bars per time bucket | MetricsPage.tsx | BarChart from Recharts |
| 3.3.5 | Top List: horizontal bars ranked by latest/avg value | MetricsPage.tsx | Sorted descending |
| 3.3.6 | Table: tabular view with latest/min/max/avg columns | MetricsPage.tsx | Sortable columns |
| 3.3.7 | Persist chart type in URL state | MetricsPage.tsx | ?chartType=bar |
| 3.3.8 | Unit tests | MetricsPage.test.tsx updates | ≥3 new tests |

---

### TASK 3.4: Group By / Split By + Formulas

**Spec Reference**: VISION_FEATURES.md §3.4, §3.5
**Blast Radius**: MetricsPage + backend query enhancement
**Security**: Tag keys validated (existing regex validation)
**Tenant Isolation**: Existing

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 3.4.1 | Backend: Add `group_by` param to metrics query | `src/neoguard/api/routes/metrics.py` | GROUP BY tag_key in SQL |
| 3.4.2 | Frontend: "Group by" dropdown (available tag keys for selected metric) | MetricsPage.tsx | Splits into N series |
| 3.4.3 | "Top N" limiter (top 5/10/20, rest as "other") | MetricsPage.tsx | Dropdown |
| 3.4.4 | Color each series uniquely in chart | MetricsPage.tsx | 10-color palette cycling |
| 3.4.5 | Formula row type: input field with reference letters | MetricsPage.tsx | e.g., "a / b * 100" |
| 3.4.6 | Formula parser (simple math: +, -, *, /, parens, abs, log) | `frontend/src/utils/formulaParser.ts` | Returns computed series |
| 3.4.7 | Validate formula references (a-e must exist) | formulaParser.ts | Error message if invalid |
| 3.4.8 | Render formula result as additional series on chart | MetricsPage.tsx | Different line style |
| 3.4.9 | Unit tests for formula parser | formulaParser.test.ts | ≥8 tests (math, errors) |

---

### TASK 3.5: Compare to Past + Custom Time Picker + Export

**Spec Reference**: VISION_FEATURES.md §3.6, §3.7, §3.10
**Blast Radius**: MetricsPage
**Security**: N/A
**Tenant Isolation**: N/A

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 3.5.1 | "Compare" toggle: vs 1h/1d/1w ago | MetricsPage.tsx | Dropdown options |
| 3.5.2 | Overlay comparison as dashed line (opacity 0.4) | MetricsPage.tsx | Legend shows "current" vs "1d ago" |
| 3.5.3 | Time-shift same query to previous period | MetricsPage.tsx | Separate API call |
| 3.5.4 | Custom time range picker (reuse from Task 2.1) | MetricsPage.tsx | Calendar-based |
| 3.5.5 | Export CSV button (raw datapoints) | MetricsPage.tsx | Downloads .csv file |
| 3.5.6 | Export PNG button (chart as image) | MetricsPage.tsx | Canvas toDataURL |
| 3.5.7 | Share URL button (copy with locked time + queries) | MetricsPage.tsx | Clipboard with toast |
| 3.5.8 | Live values table toggle (last/min/max/avg per series) | MetricsPage.tsx | Table below chart |
| 3.5.9 | Query history (last 20 in localStorage) | MetricsPage.tsx | Dropdown with restore |

---

## Phase 4: Intelligence Layer

**Objective**: THIS IS WHERE WE SURPASS ALL COMPETITORS.
**Prerequisite**: Phases 1-3 (foundation in place)
**Exit Criteria**: Deployment markers visible on charts, forecast alerts working, causal chains displayed, revenue impact on alerts.

---

### TASK 4.1: Deployment Event System (Git-Aware Observability)

**Spec Reference**: VISION_FEATURES.md §4.1
**Blast Radius**: New backend routes + all metric charts (deployment markers)
**Security**: Deploy events are tenant-scoped. Validate webhook payloads.
**Tenant Isolation**: deploy_events table has tenant_id column

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.1.1 | Model: DeployEvent (id, tenant_id, service, commit_sha, author, message, timestamp, branch, pr_url, tags) | `src/neoguard/models/deploy.py` | Pydantic v2 |
| 4.1.2 | DB: deploy_events table (TimescaleDB) | migration file | With tenant_id, indexed by timestamp |
| 4.1.3 | API: `POST /api/v1/events/deploy` (create deploy event) | `src/neoguard/api/routes/events.py` | Validates required fields |
| 4.1.4 | API: `GET /api/v1/events/deploy?service=X&start=T1&end=T2` | events.py | Filtered + paginated |
| 4.1.5 | API: GitHub-compatible webhook format acceptance | events.py | Parses GitHub push payload |
| 4.1.6 | Frontend: DeploymentMarker component (vertical dashed line on charts) | `frontend/src/components/DeploymentMarker.tsx` | Hover card with details |
| 4.1.7 | Frontend: Fetch deploy events for current time range | MetricsPage, DashboardViewer | Overlay on all timeseries |
| 4.1.8 | Frontend: Deploy hover card (commit SHA, author, message, time) | DeploymentMarker | Click → link to PR if available |
| 4.1.9 | Anomaly-to-deploy correlator (match anomalies to nearby deploys) | `src/neoguard/services/deploy_correlation.py` | Time proximity + service match |
| 4.1.10 | Alert enrichment: "Likely caused by deploy X" on alert events | AlertDetailPage | Shows if deploy within 15min |
| 4.1.11 | Deploy history page: `/deploys` listing all with metric impact | `frontend/src/pages/DeploysPage.tsx` | Table with service, time, impact |
| 4.1.12 | Backend unit tests | `tests/unit/test_deploy_events.py` | ≥10 tests |
| 4.1.13 | Frontend unit tests | DeploymentMarker.test.tsx | ≥4 tests |

---

### TASK 4.2: Predictive Degradation Engine

**Spec Reference**: VISION_FEATURES.md §4.2
**Blast Radius**: New alert condition type + chart enhancement + new widget
**Security**: N/A (reads existing metrics)
**Tenant Isolation**: Existing (queries use tenant_id)

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.2.1 | Backend: Linear regression utility (slope, intercept from datapoints) | `src/neoguard/services/forecast.py` | Pure math, no dependencies |
| 4.2.2 | Backend: Capacity limits model per resource type | `src/neoguard/models/capacity.py` | Configurable max values |
| 4.2.3 | Backend: Forecast condition in AlertEngine ("forecast_breach") | `src/neoguard/services/alerts/engine.py` | Evaluates: time_to_breach < threshold |
| 4.2.4 | Backend: time_to_breach calculator (extrapolate trend to limit) | forecast.py | Returns hours/minutes |
| 4.2.5 | API: Alert rule creation with condition="forecast_breach" | alerts routes | New condition type |
| 4.2.6 | Frontend: Dashed forecast line on metric charts | TimeSeriesChart enhancements | Extends trend forward |
| 4.2.7 | Frontend: "Predicted" badge on forecast-triggered alerts | AlertsPage, AlertDetailPage | Distinct from "Firing" |
| 4.2.8 | Frontend: AlertRuleModal support for forecast condition | AlertRuleModal | Threshold = minutes until breach |
| 4.2.9 | Dashboard widget: "Time to Exhaustion" (key resources) | New widget type or stat variant | Shows hours remaining |
| 4.2.10 | Backend unit tests (regression, forecast, breach calc) | test_forecast.py | ≥12 tests |
| 4.2.11 | Frontend tests | Tests | ≥4 tests |

---

### TASK 4.3: Causal Intelligence Engine

**Spec Reference**: VISION_FEATURES.md §4.3
**Blast Radius**: New backend service + AlertDetailPage enhancement
**Security**: Causal analysis scoped to tenant's resources/metrics only
**Tenant Isolation**: All queries filter by tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.3.1 | Backend: Metric correlation calculator (Pearson r over time window) | `src/neoguard/services/causal.py` | Returns correlation matrix |
| 4.3.2 | Backend: Dependency graph from resource relationships + metric correlations | causal.py | Graph data structure |
| 4.3.3 | Backend: Causal chain walker (BFS backward from alert metric) | causal.py | Returns ordered chain |
| 4.3.4 | Backend: Confidence scoring (correlation strength * temporal proximity) | causal.py | 0-100 score |
| 4.3.5 | API: `GET /api/v1/alerts/events/{id}/root-cause` | alerts routes | Returns causal chain |
| 4.3.6 | Frontend: CausalChain component (horizontal flow diagram) | `frontend/src/components/CausalChain.tsx` | A → B → C with metrics |
| 4.3.7 | Frontend: "Root Cause Analysis" section on AlertDetailPage | AlertDetailPage.tsx | Shows chain + confidence |
| 4.3.8 | Frontend: Each node shows: metric name, value, change % | CausalChain | Clickable → navigate |
| 4.3.9 | Backend unit tests (correlation, graph, chain walker) | test_causal.py | ≥15 tests |
| 4.3.10 | Frontend tests | CausalChain.test.tsx | ≥4 tests |

---

### TASK 4.4: Revenue Impact Calculator

**Spec Reference**: VISION_FEATURES.md §4.4
**Blast Radius**: New settings + alert event enrichment + overview widget
**Security**: Revenue data is sensitive — admin-only configuration
**Tenant Isolation**: Revenue config per tenant

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.4.1 | Model: ServiceRevenue (id, tenant_id, service_name, revenue_per_hour, currency) | `src/neoguard/models/business.py` | Pydantic v2 |
| 4.4.2 | DB: service_revenue table | migration | tenant_id + service unique |
| 4.4.3 | API: CRUD for service revenue mappings | `src/neoguard/api/routes/business.py` | Admin-only |
| 4.4.4 | Impact calculator: degradation_pct * revenue_rate * duration | `src/neoguard/services/business.py` | Returns dollar amount |
| 4.4.5 | Alert event enrichment: add estimated_impact field | alert engine | Calculated on fire |
| 4.4.6 | Frontend: Revenue impact badge on alert events ("$847/hr at risk") | AlertsPage events tab | Red dollar badge |
| 4.4.7 | Frontend: Running cost accumulator on alert detail | AlertDetailPage | "Cost so far: $X" |
| 4.4.8 | Frontend: "Business Impact" settings tab | SettingsPage | Map services → revenue |
| 4.4.9 | Frontend: Sort events by "Highest Impact" | AlertsPage | Sort option |
| 4.4.10 | Overview widget: "Estimated Impact Today" | OverviewPage | Sum of active alert impacts |
| 4.4.11 | Backend unit tests | test_business.py | ≥8 tests |
| 4.4.12 | Frontend tests | Tests | ≥3 tests |

---

### TASK 4.5: Business SLO Page

**Spec Reference**: VISION_FEATURES.md §4.5
**Blast Radius**: New page + backend service + alert integration
**Security**: SLO definitions are tenant-scoped
**Tenant Isolation**: slo table has tenant_id

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.5.1 | Model: SLO (id, tenant_id, name, description, metric_query, target_pct, window_days, service) | `src/neoguard/models/slo.py` | Pydantic v2 |
| 4.5.2 | DB: slos table + slo_measurements table (periodic snapshots) | migration | Indexed by tenant |
| 4.5.3 | Backend: SLO calculation service (good/total events over window) | `src/neoguard/services/slo.py` | Returns current SLI, budget |
| 4.5.4 | Backend: Error budget calculation (1-target) * total, consumed so far | slo.py | Percentage remaining |
| 4.5.5 | Backend: Burn rate calculation (consumption rate vs budget) | slo.py | Multiplier (1x = normal) |
| 4.5.6 | API: CRUD for SLOs + `GET /api/v1/slos/{id}/status` | `src/neoguard/api/routes/slos.py` | Full lifecycle |
| 4.5.7 | Frontend: /slos page with SLO cards | `frontend/src/pages/SLOsPage.tsx` | Status: Met/At Risk/Breached |
| 4.5.8 | Frontend: SLO detail view (error budget burn chart) | SLOsPage | Recharts area chart |
| 4.5.9 | Frontend: Create/Edit SLO modal | SLOsPage | Name, metric, target, window |
| 4.5.10 | Alert integration: "Alert on budget burn" checkbox | SLO modal | Creates alert rule |
| 4.5.11 | Overview: SLO summary strip on home page | OverviewPage | Budget bars |
| 4.5.12 | Backend unit tests | test_slo.py | ≥10 tests |
| 4.5.13 | Frontend tests | SLOsPage.test.tsx | ≥6 tests |

---

### TASK 4.6: Unified Timeline

**Spec Reference**: VISION_FEATURES.md §4.6
**Blast Radius**: New page + aggregation of existing event sources
**Security**: All events filtered by tenant
**Tenant Isolation**: Timeline API composes tenant-scoped queries

#### Sub-tasks:

| # | Sub-task | File(s) | Acceptance |
|---|----------|---------|------------|
| 4.6.1 | API: `GET /api/v1/timeline` (types, start, end, service, limit) | `src/neoguard/api/routes/timeline.py` | Merges multiple sources |
| 4.6.2 | Backend: Aggregate from alert_events, deploy_events, audit_log, security_log | `src/neoguard/services/timeline.py` | Sorted by timestamp |
| 4.6.3 | Frontend: /timeline page with chronological event list | `frontend/src/pages/TimelinePage.tsx` | Color-coded by type |
| 4.6.4 | Frontend: Filter buttons by event type (alert, deploy, security, change) | TimelinePage | Multi-select |
| 4.6.5 | Frontend: Time range selector | TimelinePage | Reuse TimeRangePicker |
| 4.6.6 | Frontend: Event cards with icon, type badge, summary, timestamp | TimelinePage | Clickable → navigate |
| 4.6.7 | Pattern detection: flag concurrent security + performance events | timeline.py | "Correlated" badge |
| 4.6.8 | Unit tests | Tests | ≥6 tests (backend + frontend) |

---

## Phase 5: Operational Excellence

**Objective**: Make alerting and investigation world-class (6/10 → 8/10).
**Prerequisite**: Phase 4 (intelligence layer provides data for enrichment)
**Exit Criteria**: Composite alerts, anomaly detection, investigations, runbooks working.

*(Tasks 5.1-5.8 detailed in VISION_FEATURES.md — follow same sub-task structure)*

---

## Phase 6: Home Page & Navigation

**Objective**: Tie everything together. Home = operations command center.
**Prerequisite**: Phases 4-5 (intelligence data feeds home page)
**Exit Criteria**: Home page shows health map, predictions, SLOs, activity, investigations.

*(Tasks 6.1-6.4 detailed in VISION_FEATURES.md — follow same sub-task structure)*

---

## Phase 7: Dashboard + Infrastructure Polish

**Objective**: Final polish for demo completeness.
**Prerequisite**: Phases 1-6
**Exit Criteria**: Folders, playlists, host map, resource comparison all working.

*(Tasks 7.1-7.7 detailed in VISION_FEATURES.md — follow same sub-task structure)*

---

## Verification Protocol (per Max.md)

After EVERY task completion:
```bash
# TypeScript
cd frontend && npx tsc --noEmit

# Frontend tests
cd frontend && NODE_OPTIONS="--max-old-space-size=4096" npx vitest run

# Backend tests
NEOGUARD_DB_PORT=5433 NEOGUARD_DEBUG=true python -m pytest tests/unit/ -v

# Production build
cd frontend && npx vite build
```

**All must pass before moving to next task.**

---

## Task Summary

| Phase | Tasks | Sub-tasks | New Backend Files | New Frontend Files | New Tests |
|-------|-------|-----------|-------------------|--------------------|-----------|
| 1: Foundation UX | 5 | 44 | 1 | 8 | ~30 |
| 2: Logs Overhaul | 9 | 79 | 4 | 5 | ~50 |
| 3: Metrics Explorer | 5 | 45 | 2 | 3 | ~30 |
| 4: Intelligence Layer | 6 | 71 | 10 | 8 | ~70 |
| 5: Operational Excellence | 8 | ~60 | 6 | 6 | ~50 |
| 6: Home & Navigation | 4 | ~30 | 2 | 3 | ~20 |
| 7: Dashboard + Infra | 7 | ~40 | 2 | 4 | ~20 |
| **TOTAL** | **44** | **~369** | **27** | **37** | **~270** |

---

## Definition of Done (per task, per Max.md Seven Laws)

1. **Understood** — blast radius mapped, specs referenced
2. **Investigated** — existing code read, dependencies traced
3. **Designed** — approach articulated before coding
4. **Implemented** — with full TypeScript strict, Pydantic v2, parameterized SQL
5. **Verified** — tests pass, types clean, build succeeds, manual verification
6. **Reported** — honest assessment of what works and what's left
7. **No hallucination** — every symbol verified to exist before referencing
8. **Security first** — tenant isolation maintained, inputs validated
9. **DRY** — no duplication, extracted utilities where pattern repeats ≥3x
10. **Boy Scout Rule** — surrounding code improved if touched
