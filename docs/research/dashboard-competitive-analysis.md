# Dashboard Competitive Analysis: Deep UX Feature Research

**Date**: 2026-05-02
**Purpose**: Actionable feature-level analysis for NeoGuard/ObserveLabs dashboard evolution
**Platforms**: Grafana 11, Datadog, New Relic, Dynatrace, Chronosphere

---

## TABLE OF CONTENTS

1. [Chart Interactions](#1-chart-interactions)
2. [Cross-Chart Coordination](#2-cross-chart-coordination)
3. [Time Controls](#3-time-controls)
4. [Annotations & Events](#4-annotations--events)
5. [Dashboard Organization](#5-dashboard-organization)
6. [Templating / Variables](#6-templating--variables)
7. [Visual Polish](#7-visual-polish)
8. [Power Features](#8-power-features)
9. [Collaboration](#9-collaboration)
10. [Unique / Innovative Features](#10-unique--innovative-features)
11. [Next-Gen: Community Pain Points & Requests](#11-next-gen-community-pain-points--requests)
12. [NeoGuard Gap Analysis](#12-neoguard-gap-analysis)
13. [Implementation Priority Matrix](#13-implementation-priority-matrix)

---

## 1. CHART INTERACTIONS

### Hover Behavior

| Platform | Tooltip Style | Crosshair | Value Snap | Multi-Series Behavior |
|----------|--------------|-----------|------------|----------------------|
| **Grafana** | Floating tooltip follows cursor. Shows all series values at that timestamp. Sorted by value (configurable: none/ascending/descending). Tooltip mode: "All" (every series) or "Single" (nearest). Shared crosshair option across panels. | Vertical line + horizontal at hovered value. Configurable opacity. | Snaps to nearest data point. Shows interpolated value if between points. | All series values listed with color swatch, series name, value. Hidden series excluded. |
| **Datadog** | Compact floating card. Shows metric name, value, tags. Timestamp in header. Color-coded dots per series. | Vertical dashed line, synchronized across all graphs in the dashboard by default. | Exact snap to data point. No interpolation shown. | Stacked tooltip when multiple series. Shows each metric:tag combo. |
| **New Relic** | Gray card tooltip. Shows entity name, metric, value, timestamp. Supports multiple metrics in one tooltip. | Vertical line only. Light gray. | Snaps to nearest point. Shows "null" gaps explicitly. | Groups by entity. Collapsible if >5 series. |
| **Dynatrace** | Rich tooltip with mini context. Shows host/process/service icon. Value with trend arrow (up/down vs previous period). Unit auto-detected. | Vertical + optional horizontal. Dashed style. | Exact snap. Shows data resolution (1m, 5m, etc.) in tooltip. | Priority ordering: problem entities first, then by value. |
| **Chronosphere** | Clean minimal tooltip. Metric name, labels, value. PromQL label matchers shown. | Vertical line, thin. | Snap to nearest. | All visible series, sorted by value descending. |

### Click Behavior

| Platform | Single Click | Double Click | Drag | Right-Click |
|----------|-------------|-------------|------|------------|
| **Grafana** | Legend click: toggle series visibility. On chart: no default action (configurable via data links). | Nothing by default. Can be configured to open drilldown URL. | Horizontal drag: zoom to time range (brush select). The zoomed range becomes the new dashboard time range. | No native right-click menu. Browser default. |
| **Datadog** | On graph: opens overlay with expanded view and related metrics. Legend click: isolate series (hide all others). | On graph: zooms to a tighter time window around the click point. | Horizontal drag: zooms to selected time range. Works on any timeseries. | Context menu: "View related logs", "View related traces", "View related processes", "Copy link to this graph". |
| **New Relic** | On data point: opens slide-out with entity details. Legend click: toggles series. | Nothing. | Horizontal drag: time zoom. | No custom context menu. |
| **Dynatrace** | On chart: opens "Analyze" view with that metric in the Data Explorer. Legend click: toggle series. | Nothing. | Horizontal drag: time zoom. Also supports vertical drag for value-range filtering in certain chart types. | Context menu: "Pin to dashboard", "Open in Data Explorer", "Create metric event". |
| **Chronosphere** | Legend click: toggle series. On chart: no default. | Nothing. | Horizontal drag: time zoom. | No custom context menu. |

### Scroll Behavior

| Platform | Scroll on Chart | Scroll + Modifier |
|----------|----------------|-------------------|
| **Grafana** | Nothing by default. Optional: Ctrl+Scroll to zoom time range in/out centered on cursor position. | Ctrl+Scroll: time zoom. Shift+Scroll: horizontal pan (when zoomed in). |
| **Datadog** | Pinch-to-zoom on trackpad zooms time range. Mouse scroll scrolls the page (passes through). | Cmd/Ctrl+Scroll: time zoom. |
| **New Relic** | Pass-through to page scroll. | No modifier-based chart zoom. |
| **Dynatrace** | Pass-through to page scroll. | Ctrl+Scroll: zoom in Data Explorer only (not on dashboards). |
| **Chronosphere** | Pass-through to page scroll. | No modifier zoom. |

### Keyboard Shortcuts

| Platform | Key Shortcuts |
|----------|--------------|
| **Grafana** | `d` then `s`: save dashboard. `d` then `r`: refresh. `d` then `k`: toggle kiosk mode. `d` then `v`: view mode. `d` then `e`: edit mode. `t` then `z`: zoom out time. `t` then `←/→`: shift time backward/forward. `Ctrl+k` / `Cmd+k`: command palette (search anything). `Ctrl+s`: save. `Esc`: exit panel edit / go back. `e`: open panel editor (when panel focused). `v`: view panel fullscreen. `r`: remove panel. `p` then `s`: toggle panel sharing. Arrow keys: navigate between panels (Grafana 11+). |
| **Datadog** | `Cmd+k` / `Ctrl+k`: quick search. `r`: refresh dashboard. `f`: fullscreen. No per-panel keyboard navigation. Most interactions are mouse-driven. |
| **New Relic** | `Cmd+k`: global search. No dashboard-specific shortcuts. |
| **Dynatrace** | `Ctrl+k`: command/search palette. No dashboard-specific shortcuts. |
| **Chronosphere** | None documented. All mouse-driven. |

---

## 2. CROSS-CHART COORDINATION

### Shared Crosshair / Tooltip

| Platform | Mechanism | Scope | Configuration |
|----------|-----------|-------|--------------|
| **Grafana** | **Shared crosshair mode**: vertical crosshair line appears on ALL panels in the dashboard at the same timestamp when hovering any one panel. **Shared tooltip mode**: both crosshair AND tooltip appear on all panels. Configurable at dashboard level (Settings > General > Graph tooltip). Three modes: Default (per-panel), Shared crosshair, Shared tooltip. | Dashboard-wide. Cannot scope to a subset of panels. | Dashboard settings toggle. Default is "Default" (no sharing). |
| **Datadog** | **Always-on shared crosshair**: All timeseries graphs on a dashboard automatically share a synchronized vertical crosshair. No configuration needed. This is the default behavior. | Dashboard-wide, automatic. | No toggle — always active. |
| **New Relic** | **Linked hover**: When hovering a chart, other charts on the same page show a faint vertical line at the same timestamp. Less prominent than Grafana/Datadog. | Page-wide. | Always on, no configuration. |
| **Dynatrace** | **Synchronized crosshair**: Active within the same "section" of a dashboard. Charts in different sections do not sync. | Section-scoped. | Automatic within sections. |
| **Chronosphere** | **Shared crosshair**: Dashboards have synchronized crosshair across all panels. Similar to Grafana's shared crosshair mode. | Dashboard-wide. | On by default. |

### Linked Zoom / Brush Selection

| Platform | Behavior |
|----------|----------|
| **Grafana** | Drag-to-zoom on ANY panel updates the **dashboard-level** time range, which causes ALL panels to re-query. This is the linked zoom behavior — zoom one, zoom all. There is NO per-panel zoom. To revert, use the time picker's "Zoom out" or the browser back button (Grafana pushes time range to URL). |
| **Datadog** | Drag-to-zoom updates the dashboard time range. All graphs re-render. "Zoom out" button appears in the time controls to revert. Also: when zooming on the global time selector (the overview bar), all graphs respond. |
| **New Relic** | Drag-to-zoom on one chart updates dashboard time for all charts. URL updated. Back button reverts. |
| **Dynatrace** | Drag-to-zoom changes dashboard time range. All tiles update. "Reset zoom" button appears. |
| **Chronosphere** | Drag-to-zoom propagates to dashboard time range. Standard behavior. |

### Click-to-Filter (Cross-Filtering)

| Platform | Capability |
|----------|-----------|
| **Grafana** | No native cross-filtering between panels. Workaround: data links with variable interpolation — clicking a value in one panel can set a dashboard variable that filters other panels. Requires manual setup. Grafana 11 introduced "Scenes" framework which may eventually support this. |
| **Datadog** | **Template variable click-to-filter**: Clicking a host/tag in a top list or table widget can update a template variable, causing all other widgets that use that variable to re-filter. This is configured per-widget in the edit view ("Use as filter" option). Also: The "Group" widget creates scoped sections where clicking a group value filters all widgets in that group. |
| **New Relic** | **Facet filtering**: Clicking a facet value in a bar chart or table adds it as a filter to all other widgets on the dashboard that share the same attribute. Native behavior, no configuration. Called "Linked facets". |
| **Dynatrace** | **Tile filtering**: Clicking an entity in any tile can filter the entire dashboard to that entity. Deep linking between tiles through "Management Zones" and "entity selectors". |
| **Chronosphere** | No native cross-filtering. Variables can be manually linked. |

---

## 3. TIME CONTROLS

### Time Range Presets

| Platform | Relative Presets | Custom Range Input | URL Persistence |
|----------|-----------------|-------------------|----------------|
| **Grafana** | Last 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 2d, 7d, 30d, 90d, 6mo, 1y, 2y, 5y. Also: "Today", "Yesterday", "Today so far", "This week", "This week so far", "This month", "This month so far", "This year", "This year so far". | Two datetime-local inputs (from/to) + a free-text box accepting expressions like `now-6h` to `now`, `now-1d/d` (start of day), `2024-01-01T00:00:00`. The expression language is extensive: `now-Xm/h/d/w/M/y`, rounding with `/d` (start of day), etc. | `?from=now-6h&to=now` or `?from=1704067200000&to=1704153600000`. All time state in URL. Shareable. |
| **Datadog** | Past 5m, 15m, 1h, 4h, 1d, 2d, 1w, 1mo, 3mo. "The Past" section + "Fixed" section (today, yesterday, this week, last week, this month, last month). | Calendar picker for start/end dates. Time input for hours/minutes. Also supports typing like "4 hours ago" in the search-style input. | `?from_ts=EPOCH&to_ts=EPOCH&live=true`. URL-persisted. |
| **New Relic** | 30m, 60m, 3h, 6h, 12h, 24h, 3d, 7d, Custom. | Calendar picker with time inputs. | URL query params. |
| **Dynatrace** | Last 2h, 6h, 24h, 72h, 7d, 14d, 31d. "Custom" with calendar. | Calendar + time picker. Relative expressions supported in API but not in UI picker. | `?gtf=-2h` (relative) or `?gf=EPOCH&gt=EPOCH` (absolute). |
| **Chronosphere** | Last 15m, 1h, 3h, 6h, 12h, 1d, 3d, 7d, 14d, 30d. Custom. | Datetime inputs. | URL params. |

### Compare With Previous Period

| Platform | Feature |
|----------|---------|
| **Grafana** | **Time shift**: Per-query transform. In the query editor, you can add a "Time shift" of e.g., `1d` to overlay yesterday's data on today's chart. The shifted series appears as a separate line (usually dashed). Not a global toggle — configured per panel. |
| **Datadog** | **Compare to**: Global toggle in time picker. Options: "Previous period", "Week before", "Month before". Renders the comparison data as a light dashed overlay on every timeseries widget. One-click activation. Also available per-widget. |
| **New Relic** | **Compare with**: Toggle in time picker. "Compare with 1 week ago" / "1 day ago". Overlay on charts. |
| **Dynatrace** | **Comparison**: Toggle in timeframe selector. "Compare with previous timeframe" (matches the current range length). Overlay rendering with lighter color. |
| **Chronosphere** | No native compare-with-previous. Must create separate queries with offset. |

### Auto-Refresh

| Platform | Options | Behavior |
|----------|---------|----------|
| **Grafana** | Off, 5s, 10s, 30s, 1m, 5m, 15m, 30m, 1h, 2h, 1d. Custom interval configurable. Pauses when tab is not visible (Grafana 10+). Shows spinning icon during refresh. | Shifts the "now" anchor of relative time ranges. Re-queries all panels. |
| **Datadog** | "Live" mode (continuous streaming for last 1h and shorter), "Paused", or interval: 1m, 5m, 15m, 30m, 1h. | Live mode uses server-push for near-real-time updates without full refresh. |
| **New Relic** | Auto-refresh every 60s for live dashboards. No granular control. Toggle: "Live" on/off. | Simple polling. |
| **Dynatrace** | Auto-refresh when time range is relative. No explicit interval picker — refreshes every 60s automatically. Manual refresh button available. | Background refresh, no loading indicator. |
| **Chronosphere** | 15s, 30s, 1m, 5m, Off. | Simple polling refresh. |

### Time Shift / Navigation

| Platform | Forward/Back Buttons | Zoom Out | Behavior |
|----------|---------------------|----------|----------|
| **Grafana** | `<` and `>` arrows shift the window by half its duration. `<<` and `>>` (or keyboard `t` then `←/→`) shift by full duration. | `Ctrl+Z` or dedicated zoom-out button. Maintains history stack. | Shifts the absolute from/to while keeping the window size constant. |
| **Datadog** | Left/right arrows in time bar shift by half window. | "Reset" button appears after zoom. | Same shift behavior. |
| **New Relic** | Left/right arrows on time picker. | "Reset" to original range. | Half-window shift. |
| **Dynatrace** | Left/right arrows on timeframe bar. | "Reset timeframe" button. | Quarter-window shift. |
| **Chronosphere** | No dedicated shift buttons. Must manually adjust range. | No zoom-out button. Re-select a range. | N/A |

### Timezone Handling

| Platform | Feature |
|----------|---------|
| **Grafana** | **Per-dashboard timezone override**: Dashboard settings > Time options > Timezone. Options: Default (browser), UTC, or any IANA timezone. Affects all panels. Per-user default timezone in profile settings. The active timezone is shown in the time picker display. |
| **Datadog** | **Account-level timezone** in org settings. Dashboard time picker shows UTC offset. No per-dashboard override — uses org timezone. |
| **New Relic** | **Account timezone** in settings. UTC timestamps in tooltips + local time in axis labels. |
| **Dynatrace** | **Per-user timezone** in preferences. Dashboards respect user's setting. Management zone can enforce timezone for a group. |
| **Chronosphere** | **UTC by default**. User preference to switch to local. No per-dashboard setting. |

---

## 4. ANNOTATIONS & EVENTS

### Deployment Markers / Events on Charts

| Platform | Feature | Visual Rendering | Interaction |
|----------|---------|-----------------|-------------|
| **Grafana** | **Annotations**: First-class feature. Multiple annotation sources per dashboard: manual, from data sources (Prometheus alertmanager, Elasticsearch, etc.), from alerts. Each source gets a color-coded marker. Vertical dashed lines on all time-series panels. | Small colored triangles at the bottom of charts. Hovering reveals annotation text, tags, user, timestamp. Lines can span a time range (region annotation: shaded area between two timestamps). | Click to view details. Ctrl+Click on chart to add manual annotation at that timestamp. Annotations can have tags for filtering. Dashboard settings control which annotation queries are active. |
| **Datadog** | **Event Overlay**: Toggle event stream overlay on any timeseries graph. Events from monitors, integrations, API posts shown as colored bars/diamonds on the timeline. Also: "Markers" API for custom deployment events. | Colored diamonds (point events) or bars (duration events) on the top edge of graphs. Hover shows event title, source, tags. | Click event marker to open event details. Events are filterable by source and tag in the overlay configuration. |
| **New Relic** | **Event markers**: Deployment markers from APM. Custom events via NerdGraph API. "Marker" entities on charts. | Vertical dashed lines on relevant charts. Hover for details. | Click opens deployment diff view (for APM deployments). |
| **Dynatrace** | **Problem cards**: Automatically overlays detected problems on affected charts. Also: custom deployment events via API. "Event" tiles on dashboards. | Red shaded regions for problem timeframes. Blue triangles for deployments/config changes. | Click opens problem analysis or deployment details. Davis AI provides root cause correlation. |
| **Chronosphere** | **Annotations**: Manual annotations with tags. Alert state changes shown as colored regions. | Colored vertical lines. Shaded regions for alert durations. | Click for details. |

### User-Created Annotations

| Platform | Mechanism |
|----------|-----------|
| **Grafana** | Ctrl+Click on any time-series panel (when annotation permissions allow). Opens a dialog: text, tags, optional end time (for range annotation). Stored in Grafana's built-in annotation store or external data source. |
| **Datadog** | Not directly on charts. Must post events via API or use the Event Stream. Notebooks support inline comments/annotations. |
| **New Relic** | Custom events via NerdGraph API only. No in-chart annotation creation. |
| **Dynatrace** | Custom events via Settings > Events API. No click-to-annotate on charts. |
| **Chronosphere** | Annotation API. No click-to-annotate on charts. |

---

## 5. DASHBOARD ORGANIZATION

### Folder / Hierarchy / Navigation

| Platform | Structure | Search | Favorites/Starred | Recently Viewed | Tags/Labels |
|----------|-----------|--------|-------------------|----------------|-------------|
| **Grafana** | **Nested folders** with RBAC permissions per folder. Root > Folder > Sub-folder > Dashboard. Folder sidebar in dashboard browser. "General" folder for uncategorized. | **Full-text search** across dashboard names, descriptions, panel titles. Folder scoping. Sort by: name, date modified, most viewed. Filter by: starred, tag, folder. | **Star toggle** on each dashboard. Starred dashboards appear in a dedicated section on the home page and in the side navigation. | **Recently viewed** section on home page. Tracks last 10-20 dashboards per user. | **Tags**: Free-form string tags on dashboards. Tag cloud in the search sidebar. Filter by multiple tags (AND logic). |
| **Datadog** | **Dashboard Lists** (flat grouping, like playlists). No folder hierarchy. Lists can be shared. "Preset" lists: Created by Me, Frequently Viewed, All Custom, All Integration. | **Search** by name, creator, tag, type (screenboard/timeboard). Faceted search sidebar. | **Favorite** toggle (star). Favorited dashboards at top of sidebar. | **Recently Viewed** section in the dashboard list sidebar. | **Tags**: Same as infrastructure tags. Search by tag facet. |
| **New Relic** | **Flat list** with search/filter. No folders. Organization by account/entity type. | Search by name. Filter by account. | **Favorite** toggle. Favorites section in left nav. | **Recent dashboards** in left nav. | No tag system for dashboards. |
| **Dynatrace** | **Dashboard groups** (flat grouping). "My dashboards", "Shared dashboards", "Preset dashboards". Also: **Management Zones** scope what a dashboard can see. | Search by name. Filter by owner, shared/private. | **Pin** to home screen. | **Recent** section on home screen. | No tags on dashboards. |
| **Chronosphere** | **Collections** (folders). Dashboards within collections. Shared collections for teams. | Search by name within collections. | No explicit favorites. | Recently viewed in navigation. | **Labels** on dashboards for filtering. |

### Playlists / Rotation

| Platform | Feature |
|----------|---------|
| **Grafana** | **Playlists**: Create ordered list of dashboards, set rotation interval (e.g., 30s per dashboard). Start playlist in kiosk mode for TV displays. Can include dashboards by tag. |
| **Datadog** | **Dashboard Lists** can be presented in "TV Mode" with auto-rotation. |
| **New Relic** | **TV Mode**: Fullscreen with auto-rotation across dashboards in a list. |
| **Dynatrace** | No native playlist. Kiosk mode for single dashboard only. |
| **Chronosphere** | No playlist feature. |

---

## 6. TEMPLATING / VARIABLES

### Variable Types

| Platform | Types Available |
|----------|---------------|
| **Grafana** | **Query**: Fetches values from a data source query (e.g., `label_values(up, instance)`). **Custom**: Static comma-separated list. **Text box**: Free-text input. **Constant**: Hidden fixed value (for provisioning). **Data source**: Switches the data source for all panels using `$datasource`. **Interval**: Custom time interval values (e.g., `1m,5m,15m,30m,1h`). **Ad-hoc filters**: Auto-discovers tag keys from the data source; user adds key-value pairs dynamically. No predefined options needed. |
| **Datadog** | **Tag values**: Pulls from tag facets (host, service, env, etc.). **Custom**: Static list. **Text**: Free-text input. Also: **Saved Views** which are predefined combinations of variable values. |
| **New Relic** | **NRQL**: Variable populated by a NRQL query (e.g., `FROM Transaction SELECT uniques(host)`). **List**: Static list. **Text**: Free-text input. |
| **Dynatrace** | **Entity selector**: Queries entities by type and tag. **Management Zone**: Special variable that scopes everything. **Custom**: Static list. |
| **Chronosphere** | **Label values**: Pulled from metric labels. **Custom**: Static list. **Regex filter**: Applies regex to label values. |

### Variable Behavior Details

| Behavior | Grafana | Datadog | New Relic | Dynatrace | Chronosphere |
|----------|---------|---------|-----------|-----------|-------------|
| **Multi-select** | Yes. Renders as `(a\|b\|c)` regex in PromQL, `IN` clause in SQL. Checkbox multi-select in dropdown. | Yes. Comma-separated in query. | Yes. Multi-select checkbox. `IN` clause generation. | No (single select only). | Yes. Multi-select. |
| **"All" option** | Yes. Configurable "All" text. Can use custom "All" value (e.g., `.*` for regex, `*` for glob). When "All" is selected, the variable resolves to the regex matching all values. | Yes. "All" option. Resolves to `*` wildcard. | Yes. "All" option. | No explicit "All". | Yes. |
| **Cascading / Chained** | Yes. Variable B can reference Variable A in its query: `label_values(up{env="$env"}, instance)`. When A changes, B's options re-fetch. Multiple levels of chaining supported. | Yes. Variable values can depend on other variables. | Yes. NRQL variable can reference other variables in WHERE clause. | Limited. Entity selector can reference management zone variable. | Yes. Label value queries can reference other variables. |
| **Regex filter** | Yes. Applied after fetching values. Regex field to include/exclude patterns from the option list. E.g., `/.*(prod).*$/` to show only prod values. | No. Must use tag search syntax instead. | No built-in regex filter. | No. | Yes. Regex filter on label values. |
| **Default value** | First value, or explicitly set. Can be "All" by default. Configurable per variable. | First value or explicit default. | First value or explicit. | First entity matched. | First value. |
| **URL sync** | `?var-env=prod&var-region=us-east-1`. All variables in URL. Shareable links preserve variable state. | `?tpl_var_env=prod`. Variables in URL with `tpl_var_` prefix. | `?variable=value`. In URL. | Not in URL. Stored in dashboard state. | In URL. |
| **Hide options** | Three modes: "Variable" (show label + dropdown), "Label" (show dropdown only, hide label), "" (hide completely, use as internal constant). | Cannot hide. Always visible when defined. | Cannot hide. | N/A. | Cannot hide. |
| **Refresh timing** | "On dashboard load", "On time range change", or "Never" (manual only). Configurable per variable. | On dashboard load. Re-fetches when dependent variable changes. | On dashboard load + on time change. | On dashboard load. | On dashboard load. |

### Ad-Hoc Filters (Grafana-Specific)

Grafana's **ad-hoc filter** variable type deserves special attention: it presents a row of `key operator value` filters. The user picks a key from auto-discovered tag/label keys, selects an operator (`=`, `!=`, `=~`, `!~`), and picks/types a value. Multiple filters can be added. These are automatically injected into ALL queries on the dashboard that use the same data source. No per-panel configuration needed. This is Grafana's most powerful variable feature and is not replicated by any competitor.

---

## 7. VISUAL POLISH

### Threshold Visualization

| Platform | Implementation |
|----------|---------------|
| **Grafana** | Per-panel thresholds. Modes: "Absolute" or "Percentage". Visual: colored regions (bands), colored lines, colored gradient fill below line, color the series itself when it crosses threshold. Stat panels: background color changes based on threshold. Gauge: colored arc segments. Table: cell background color, text color, or color-coded bar. |
| **Datadog** | "Markers" on graphs: horizontal lines at threshold values with shaded regions above/below. Colors: green/yellow/red zones. Conditional formatting on widgets: change widget background or value color based on thresholds. |
| **New Relic** | "Alert thresholds" toggle on charts: shows warning (yellow) and critical (red) lines from configured alert conditions. Static lines only. |
| **Dynatrace** | Auto-thresholds from Davis AI baseline. Shows "normal range" as a shaded band. Custom thresholds as colored lines. |
| **Chronosphere** | Threshold lines with colored regions. Basic — similar to Grafana's absolute mode. |

### Color Schemes

| Platform | Palette System |
|----------|---------------|
| **Grafana** | **Classic palette** (default 16 colors), **Green-Yellow-Red** (continuous), **Blue-Yellow-Red**, **Blues**, **Reds**, **Greens**, **Purple** (monochrome ranges), **Temperature**, **Single color** (pick one), **Fixed by field** (assign specific colors to specific series). Per-series color override available. Dark and light theme support. |
| **Datadog** | **Classic** (default), **Cool**, **Warm**, **Purple**, **Orange**, **Gray**, **Semantic** (green for OK, red for errors). Per-metric color customization. Global dark mode toggle. |
| **New Relic** | Limited palette control. Default palette. No per-series color override. Dark theme only. |
| **Dynatrace** | Automatic coloring based on entity type. Problem entities always red. Limited manual color control. Light theme only (dark mode added late 2024). |
| **Chronosphere** | Standard palette. Per-series color override. Dark/light toggle. |

### Gradient Fills, Sparklines, Legend Polish

| Platform | Details |
|----------|---------|
| **Grafana** | **Fill opacity**: 0-100% on area/line charts. **Gradient mode**: "None", "Opacity" (gradient fill from line to baseline), "Hue" (color shifts), "Scheme" (threshold-based color gradient). **Point size**: configurable. **Line width**: 1-10px. **Line interpolation**: linear, smooth, step-before, step-after. **Connect null values**: never, always, threshold (connect if gap < N). **Legend**: Table mode with sortable columns (min, max, avg, last, total, count, range). Clicking column header sorts. Sparklines are NOT in the legend — sparklines are the Stat panel's inline chart. **Bar alignment**: before, center, after (for bar charts showing periods). |
| **Datadog** | **Fill**: Solid fill, no gradient option. **Line style**: Solid, dashed, dotted per series. **Line weight**: thin, normal, bold. **Legend**: Compact (inline) or "Table" layout with avg/min/max/sum. "Automatic" legend mode shows top N series. **Sparklines**: Available in Table widget cells and in the Service Map widget. |
| **New Relic** | Minimal customization. Fill on area charts. No gradient control. Legend shows series names. |
| **Dynatrace** | Minimal chart styling options. Automatic formatting. Legend shows metric names with current values. |
| **Chronosphere** | Basic fill/line options. Legend with current value. No gradient fills. |

### Responsive Behavior

| Platform | Mobile / Resize Behavior |
|----------|------------------------|
| **Grafana** | Grid layout collapses to single column on narrow screens. Panel minimum width enforced. Responsive but not mobile-optimized. Touch support for basic interactions. |
| **Datadog** | Screenboards: fixed layout, scroll on mobile. Timeboards: responsive stacking. Mobile app provides dedicated dashboard view with optimized layout. |
| **New Relic** | Responsive grid. Panels stack on mobile. |
| **Dynatrace** | Tiles re-flow responsively. Mobile app provides separate dashboard rendering. |
| **Chronosphere** | Basic responsive. Panels stack on narrow screens. |

---

## 8. POWER FEATURES

### Dashboard Links & Drilldown

| Platform | Feature Details |
|----------|---------------|
| **Grafana** | **Dashboard links**: List of links shown at the top of the dashboard. Types: "Dashboard" (link to another dashboard, can pass variables), "URL" (any URL with variable interpolation). **Panel links**: Per-panel. Shown in panel header dropdown. **Data links**: Per-field. Clicking a data point value opens a URL. Supports variable interpolation: `${__data.fields.name}`, `${__value.raw}`, `${__time}`, `${__series.name}`, `${__field.name}`. Can link to other dashboards, external tools, or Explore view. Multiple data links per series. |
| **Datadog** | **Custom links**: Per-widget. URL templates with `{{variable}}` interpolation. Can link to logs, traces, other dashboards, external URLs. Also: "Related" sidebar automatically suggests related dashboards, logs, traces, processes. |
| **New Relic** | **Facet linking**: Clicking a facet value navigates to a filtered view. **Custom chart actions**: "View query", "Create alert", "Get as image". Limited link customization. |
| **Dynatrace** | **Tile links**: Each tile can link to a built-in analysis view (Data Explorer, Problems, Logs, etc.). **Markdown tiles** with custom URLs. Entity-aware linking: clicking a host tile drills to the host overview automatically. |
| **Chronosphere** | **Panel links**: URL links with variable substitution. Basic implementation. |

### Value Mappings

| Platform | Feature |
|----------|---------|
| **Grafana** | **Value mappings**: Map numeric values to text/emoji/color. Types: "Value" (exact match), "Range" (min-max), "Regex" (pattern match), "Special" (null, NaN, true, false, empty). Each mapping can specify: display text, color. Used in Stat, Gauge, Table, Status history panels. Example: Map `1` to "Healthy" (green), `0` to "Down" (red). |
| **Datadog** | **Conditional formatting** rules on certain widgets. Less flexible than Grafana's value mappings — limited to color changes based on value ranges. |
| **New Relic** | No value mappings. |
| **Dynatrace** | No value mappings. Automatic unit formatting only. |
| **Chronosphere** | No value mappings. |

### Field Overrides

| Platform | Feature |
|----------|---------|
| **Grafana** | **Field overrides**: Apply different display settings to specific series. Match by: field name (exact or regex), field type, query letter (A, B, C). Override: unit, decimals, color, min/max, display name, thresholds, data links, axis placement (left/right). Extremely powerful for multi-metric panels. Example: "Override fields matching /error.*/: color=red, axis=right". |
| **Datadog** | **Per-query style**: Each query in a widget can have different display type (line, bar, area), color, and Y-axis assignment (left/right). Less granular than Grafana. |
| **New Relic** | No field overrides. |
| **Dynatrace** | No field overrides. |
| **Chronosphere** | No field overrides. Per-series color only. |

### Transformations (Data Pipeline)

| Platform | Feature |
|----------|---------|
| **Grafana** | **Transformations**: Post-query data pipeline. 25+ built-in transforms: Reduce (aggregate to single value), Merge (combine queries), Filter by name, Filter by value, Organize fields (rename, reorder, hide), Join by field, Group by, Sort by, Calculate field (binary math between series), Config from query results (dynamic thresholds/links), Series to rows, Rows to fields, Concatenate frames, Histogram, Heatmap, Regression, Limit, Spatial operations. Transforms chain in order (pipeline). Enables complex data mashups without changing queries. |
| **Datadog** | **Functions**: Applied in the query editor (not post-query). Extensive: `abs()`, `log2()`, `cumsum()`, `derivative()`, `integral()`, `moving_avg()`, `top()`, `forecast()`, `anomaly()`, `outlier()`, `clamp()`. Formula queries allow math between metrics: `a / b * 100`. |
| **New Relic** | **NRQL functions** handle transforms in-query. No post-query transform pipeline. |
| **Dynatrace** | **Metric expressions** in DQL. No post-query pipeline. |
| **Chronosphere** | PromQL handles transforms. No post-query pipeline. |

---

## 9. COLLABORATION

### Sharing & Embedding

| Platform | Share Dashboard | Share Panel | Embed | Public Access |
|----------|---------------|------------|-------|--------------|
| **Grafana** | **Share modal**: Copy link (with current time range + variables), Export to JSON file, **Snapshot** (point-in-time static copy with optional expiration — data is baked in, no live queries). Public snapshot option. | **Share panel**: Direct link to panel in fullscreen, Embed HTML `<iframe>` code (requires authentication or anonymous access), "Library panel" (reusable panel shared across dashboards). | Iframe embed with `?orgId=1&panelId=2&fullscreen&kiosk` params. **Public dashboards** (Grafana 10+): authenticated viewers without Grafana account via public URL, configurable per-dashboard. | Public dashboards with toggle. Snapshots with delete key for cleanup. |
| **Datadog** | **Share** button: Copy link. Generate public URL (requires org setting). **Invite** specific users. **Embed**: Generate shareable URL with optional password protection and time range lock. | Per-widget "Share" generates an embed code or public URL for that single widget. | Iframe embeds. "Embeddable Graphs" with API-generated URLs. | Public sharing with configurable password. Embeddable graphs. |
| **New Relic** | Share link. Export to PDF. "Get as JSON". | Per-chart share: link, PNG export, "Get as image". | Limited embed via iframe (requires auth). | Public chart links with limited duration. |
| **Dynatrace** | Share link. Export to JSON. | Per-tile link. | No native embed. | No public sharing. |
| **Chronosphere** | Share link. JSON export. | Panel link. | No embed. | No public sharing. |

### Export & Reports

| Platform | PDF/Image Export | Scheduled Reports |
|----------|-----------------|-------------------|
| **Grafana** | **Panel**: "Inspect" > "Data" > CSV export. "Share" > "Direct link rendered image" (PNG via rendering service, requires Grafana Image Renderer plugin). **Dashboard**: PDF via reporting plugin (Enterprise). | **Grafana Enterprise**: Scheduled PDF reports via email. Set schedule (daily/weekly/monthly), recipients, time range. Branded with custom logo. |
| **Datadog** | **CSV export** per widget. **Dashboard snapshot** as PNG. PDF export not native. | **Scheduled dashboard snapshots** emailed to users. API-based scheduled report generation. |
| **New Relic** | **Export to PDF** (one-click in UI). **Export chart as CSV**. **Export as image** (PNG). | No native scheduled reports. |
| **Dynatrace** | **Report generation** (PDF) per dashboard. | **Automated reports** in "Reports" section. Schedule, recipients, dashboard selection. |
| **Chronosphere** | CSV export per panel. No PDF. | No scheduled reports. |

---

## 10. UNIQUE / INNOVATIVE FEATURES

### Grafana Only

1. **Explore view**: Separate from dashboards. Free-form query editor with instant results. Split view (two queries side by side). Directly linked from panel context menu "Explore". Perfect for ad-hoc investigation without leaving the tool.
2. **Library panels**: Reusable panels shared across multiple dashboards. Update the library panel once, all dashboards using it update. Version history.
3. **Alerting integrated in panel**: Define alert rules directly in the panel editor. Alert conditions visible on the chart as threshold lines.
4. **Transformations pipeline**: No competitor has a post-query data pipeline of this depth (25+ transforms, chainable).
5. **Ad-hoc filter variable type**: Auto-discovers all available tag keys and lets users build arbitrary filter expressions without predefined dropdowns.
6. **Mixed data source panels**: A single panel can query multiple different data sources (Prometheus + MySQL + CloudWatch) and overlay the results.
7. **Dashboard versioning**: Full version history with diff view. Restore any previous version. Track who changed what and when.

### Datadog Only

1. **Live mode / streaming**: Sub-second metric updates on dashboards using server-push. Not polling — actual streaming. Makes dashboards feel "alive".
2. **Notebook integration**: Notebooks combine markdown, graphs, and log queries in a sequential document. Shareable investigation reports that mix narrative with live data.
3. **Service Map widget**: Interactive topology map showing service dependencies and traffic flow, rendered directly on a dashboard.
4. **Change widget**: Shows deployment changes, config changes alongside metrics to correlate causes.
5. **SLO widget**: Dedicated widget showing SLO burn rate, error budget remaining, compliance status.
6. **Forecast visualization**: `forecast()` function draws a confidence-interval cone extending into the future based on historical patterns. Native, no ML setup needed.
7. **Anomaly overlay**: `anomaly()` function draws a gray "expected range" band on charts. Deviations from the band are highlighted. Based on seasonal decomposition.
8. **Powerpack**: Reusable widget groups (like Grafana library panels, but for groups of widgets as a unit). Design once, deploy to many dashboards.
9. **Group widget**: Logical grouping widget that scopes its children to a specific tag value. Like a repeating row but as a nested container.
10. **Context links in right-click menu**: Right-click any graph point to jump to related logs/traces/processes at that exact timestamp + tag context.

### New Relic Only

1. **Linked facets (auto-cross-filtering)**: Zero-configuration cross-chart filtering. Click a facet in any chart, and all other charts with the same attribute filter automatically. No variable setup needed.
2. **NRQL**: Full SQL-like query language accessible directly in the chart editor. Extremely flexible — not limited to predefined metric selectors.
3. **As Code (NerdGraph API + Terraform)**: Every dashboard aspect is programmatically manageable via a GraphQL API. Terraform provider for dashboard-as-code.

### Dynatrace Only

1. **Davis AI auto-baselines**: No manual threshold configuration needed. Davis AI learns normal patterns per metric per entity and auto-detects anomalies. Charts show the learned baseline band automatically.
2. **Smartscape topology**: 3D-rendered infrastructure topology showing all dependencies from application to infrastructure. Can be embedded in dashboards.
3. **Problem correlation cards**: When multiple metrics degrade simultaneously, Dynatrace auto-groups them into a single "problem" card that overlays all relevant charts, showing the root cause chain.
4. **Data Explorer integration**: Any chart tile can be "opened in Data Explorer" for deep interactive analysis without leaving context.
5. **Grail (log analytics on dashboards)**: DQL-powered log analysis tiles alongside metric tiles, querying the same underlying Grail lakehouse.

### Chronosphere Only

1. **Query Federation**: Transparently routes PromQL queries across multiple underlying storage backends (local, remote, archival). Dashboard queries can span retention tiers without user awareness.
2. **Mapping rules visualization**: Shows how raw metrics are transformed by mapping rules before storage, helping understand data pipelines.
3. **Control plane cost attribution**: Dashboard widgets can show per-team metric cardinality costs alongside operational metrics.

---

## 11. NEXT-GEN: COMMUNITY PAIN POINTS & REQUESTS

### Most Requested Features (from GitHub issues, forums, community Slack)

#### Grafana Community (GitHub issues, discourse.grafana.com)

| Request | Votes/Mentions | Status |
|---------|---------------|--------|
| **Cross-filtering between panels** (click a value in panel A to filter panel B) | 500+ thumbs-up across multiple issues | Partially addressed in Grafana 11 "Scenes" framework, but not generally available. #8961, #15040. |
| **Dashboard variables: multi-level cascading improvements** | High | Ongoing. Cascading works but is fragile with complex queries. Race conditions on rapid changes. |
| **Undo/redo in dashboard editing** | 300+ votes | Not implemented. Users frequently lose work when editing. Version history is the workaround but it's post-save only. |
| **Per-panel time range override** (without dashboard global time changing) | 200+ votes | Partially available via "relative time" override per panel, but no independent time picker per panel. |
| **Conditional panel visibility** (show/hide panels based on variable value or data) | 200+ | Not implemented. Workaround: panel with "no data" message. |
| **Better mobile experience** | 150+ | Minimal progress. No dedicated mobile layout editor. |
| **Real-time collaboration** (Google Docs style — see other editors' cursors) | 100+ | Not implemented. Last-save-wins causes conflicts. |
| **Dashboard-as-code improvements** (preview diffs, plan/apply workflow) | High in enterprise community | Terraform provider exists but lacks diff preview. No "plan" mode. |
| **Nested/sub-dashboards** (embed a dashboard inside another dashboard's panel) | 100+ | Not supported. "Dashboard links" are the workaround. |
| **Canvas/freeform layout** (in addition to grid) | 100+ | **Grafana Canvas panel** (added 10.x) partially addresses this — a single panel with freeform elements inside it, but not a freeform dashboard layout. |

#### Datadog Community (community.datadoghq.com, ideas.datadoghq.com)

| Request | Impact |
|---------|--------|
| **Dashboard version history / undo** | High demand. Currently no undo for dashboard edits. One wrong drag-and-save can destroy layout. |
| **Per-widget time range override** | Requested frequently. Currently all widgets share the dashboard time range. |
| **Better variable UX** — search within variable dropdowns, type-ahead, recent selections | Medium-high. Large variable lists (1000+ hosts) make dropdowns unusable. |
| **Cross-widget filtering** improvements — more widget types supporting filter propagation | Medium. Currently limited to specific widget types. |
| **Custom color palettes** — organization-level color themes for brand consistency | Medium. Limited to per-widget currently. |
| **Dashboard templates** — create new dashboards from organizational templates (not just integration presets) | Medium-high in enterprise segment. |
| **Conditional widgets** — show/hide based on variable or data condition | High demand, same as Grafana. |

#### General Industry Trends (observability forums, KubeCon talks, blog posts)

1. **AI-assisted dashboard creation**: "Describe what you want to monitor, AI builds the dashboard." Natural language to dashboard. Multiple startups exploring this. Grafana announced "Grafana AI" assistant in preview.
2. **Correlation/causal analysis on dashboards**: Move beyond "side-by-side charts" to actual statistical correlation between metrics. Show Pearson correlation coefficients, lag analysis, causal graphs.
3. **Dashboard SLOs/SLIs as first-class citizens**: Not just a metric chart with an SLO line — a purpose-built SLO widget that shows error budget burn rate, compliance windows, remaining budget.
4. **Composite dashboards / dashboard composition**: Embed one dashboard inside another. Team dashboard pulls in panels from service-specific dashboards. Like iframes but with shared context (time, variables).
5. **Event-driven dashboards**: Instead of polling, dashboards that react to events. When an alert fires, the dashboard auto-navigates to the relevant time window and highlights the affected panel.
6. **Mobile-first dashboards**: Purpose-built mobile layouts, not responsive desktop layouts. Swipe between panels, optimized touch interactions, native push notifications when data changes.
7. **Collaborative investigation mode**: Multiple users view the same dashboard simultaneously with shared cursor/annotations. Chat sidebar. Like Google Docs for dashboards.
8. **No-code data transformations**: Visual transformation builder (drag-and-drop pipeline) instead of query language for non-engineers.
9. **Smart defaults / auto-layout**: ML-powered layout suggestions based on metric relationships. "These 3 metrics usually spike together, so we put them in a row."
10. **Version-controlled dashboards with PR workflow**: Dashboard changes go through a review process. Preview the change, approve, merge. Full GitOps for dashboards.

### Top Power-User Frustrations

1. **"50-panel dashboards are unusable"** — Performance degrades with many panels. Each panel fires independent queries. No query deduplication or batch loading.
2. **"Variables with 10k+ values are slow"** — Dropdown rendering chokes. No virtualized list. Search/filter is needed.
3. **"I keep breaking dashboards by accident"** — No undo, no "are you sure?" on panel deletion, no soft-delete/trash.
4. **"Cross-team dashboard standardization is impossible"** — No template enforcement. Each team builds dashboards differently. No "dashboard schema" validation.
5. **"I can't tell WHEN a metric started misbehaving"** — Need better integration of change events (deploys, configs) overlaid on metric charts by default, not as an opt-in.
6. **"Mobile dashboards are an afterthought"** — Responsive layouts are not mobile layouts. Need dedicated mobile panel arrangements.
7. **"Dashboard load time is terrible"** — 30-40 panel dashboards take 5-10 seconds. Need progressive loading (visible panels first), query caching, streaming results.
8. **"I want to compare environments side by side"** — Two identical panel layouts, one filtered to prod, one to staging. Currently requires duplicating every panel.
9. **"Legend is useless with 50+ series"** — Need search/filter in legend, show only top N, pagination. Grafana's table legend helps but is still not enough for high-cardinality data.
10. **"Alerting and dashboards are separate mental models"** — Want to see alert state directly on the chart (not just threshold lines, but actual firing/resolved state history as a colored timeline at the bottom of each chart).

---

## 12. NEOGUARD GAP ANALYSIS

### Current NeoGuard Dashboard Capabilities (Baseline)

Based on the codebase review, here is what NeoGuard currently has:

**What We Have:**
- 12-column grid layout with drag/drop/resize (react-grid-layout)
- 12 panel types: timeseries, area, stat, top_list, pie, gauge, table, scatter, histogram, change, status, text
- Time range picker with 10 presets (5m to 90d) + custom datetime range
- Auto-refresh (off/5s/10s/30s/1m/5m/15m/30m/1h)
- Dashboard variables (query, custom, textbox) with cascading, multi-select, "All" option, URL sync
- Variable bar with dependent variable re-fetching
- MQL query mode on panels (alternative to simple metric selector)
- Fullscreen panel view (Escape to close)
- Kiosk mode (F key toggle)
- Collapsible panel groups with assign/unassign
- Panel editor drawer (side panel, not overlay)
- Display options: units (20 types), thresholds (lines + bands), legend (table/list mode with sortable columns), Y-axis (linear/log scale, min/max, right axis), color palettes + per-series overrides
- Skeleton shimmer loading states
- CrosshairContext (exists but not wired to charts)
- Timezone display (shows browser timezone)

**Critical Gaps vs. Competition (Priority Order):**

### P0 — "Feels broken without it"

| Gap | Grafana | Datadog | Impact |
|-----|---------|---------|--------|
| **Shared crosshair not wired up** | Full shared crosshair/tooltip | Always-on | CrosshairContext exists but is unused. Charts don't publish/subscribe to it. Most obvious missing "professional" feel. |
| **Drag-to-zoom on charts** | Standard. Updates dashboard time. | Standard. | Cannot zoom into time ranges on any chart. Must use time picker manually. Feels primitive. |
| **No time shift buttons (back/forward)** | `<` `>` arrows, keyboard shortcuts | Arrows on time bar | Cannot navigate time without opening the picker. Makes investigation tedious. |
| **No annotations/event markers** | First-class feature with multiple sources | Event overlay | No way to mark deployments, incidents, or correlate changes with metric movements. |
| **Legend click does not toggle series** | Standard. Click to toggle, Ctrl+Click to isolate. | Click to isolate. | Legend is display-only. Cannot hide noisy series. |

### P1 — "Every competitor has this"

| Gap | Details |
|-----|---------|
| **No dashboard versioning** | Any edit is permanent. No undo, no history, no restore. |
| **No compare-with-previous** | Cannot overlay yesterday's data on today. Must manually query. |
| **No dashboard search** | Can only browse a flat list. No search by name/tag. |
| **No favorites/starred** | No way to mark frequently used dashboards. |
| **No recently viewed** | No tracking of last-visited dashboards. |
| **No dashboard tags** | No categorization beyond name. |
| **No dashboard links / drilldown URLs** | Cannot link from one dashboard to another with variable passthrough. |
| **No data links (click data point to open URL)** | No interaction model on data points. |
| **No value mappings** | Cannot translate numeric values to text labels. |
| **No panel duplication** | Must recreate panels from scratch. |
| **No dashboard JSON import/export** | Cannot backup, share, or template dashboards. |
| **No scheduled refresh pause on hidden tab** | Wastes resources when tab is in background. |

### P2 — "Nice to have, shows polish"

| Gap | Details |
|-----|---------|
| **No field overrides** | Cannot customize display for individual series within a panel. |
| **No transformation pipeline** | No post-query data manipulation. |
| **No per-panel time range override** | All panels must share the dashboard time range. |
| **No playlists/rotation** | Cannot auto-cycle through dashboards on a TV. |
| **No dashboard cloning** | Cannot duplicate an entire dashboard. |
| **No panel inspect/debug** | Cannot see raw query, response, timing for a panel. |
| **No keyboard navigation between panels** | Tab/arrow key navigation. |
| **No Ctrl+Scroll zoom** | Mouse zoom on charts. |
| **No tooltip mode configuration** (single vs all series) | Always shows all series in tooltip. |
| **No connect-null-values option** | Gaps in data show as breaks with no option to bridge them. |
| **No line interpolation options** | Only "monotone" (smooth). No step, linear options. |
| **No gradient fill mode** | Area charts have solid fill only. |
| **No conditional panel visibility** | Cannot show/hide panels based on variable values. |

---

## 13. IMPLEMENTATION PRIORITY MATRIX

### Sprint Recommendation — "Make Dashboards Feel Professional"

The following items would close the largest perception gap between NeoGuard and production-grade tools. Ordered by impact-per-effort ratio.

#### Wave 1: Chart Interactivity (3-4 days, highest impact)

| Feature | Effort | Impact | Details |
|---------|--------|--------|---------|
| **Wire up shared crosshair** | 4h | Very High | CrosshairContext already exists. Need: (1) Each TimeSeriesChart/AreaChart publishes cursor position to context on mouse move. (2) Each chart subscribes and renders a vertical ReferenceLine at the shared timestamp. (3) Dashboard viewer wraps panels in CrosshairProvider. |
| **Drag-to-zoom (brush select)** | 6h | Very High | Recharts supports `<ReferenceArea>` for brush rendering. On mousedown+drag, capture x-range. On mouseup, call `setTimeRangeKey("custom")` with the selected from/to. Update URL. All panels re-render with new range. |
| **Legend click to toggle/isolate** | 3h | High | TimeSeriesChart already has `hiddenSeries` state and `toggleSeries`. Need to wire the `ChartLegend` click handler. Add Ctrl+Click to isolate (hide all except clicked). |
| **Time shift back/forward buttons** | 3h | High | Add `<` and `>` buttons in dashboard header. Shift by half the current range duration. Update URL params. |
| **Tooltip mode: single vs all** | 2h | Medium | Add toggle in dashboard settings or panel options. Recharts `Tooltip` supports `trigger="hover"` and filtering to nearest series. |

#### Wave 2: Dashboard Chrome (2-3 days)

| Feature | Effort | Impact | Details |
|---------|--------|--------|---------|
| **Dashboard search** | 4h | High | Add search input on DashboardList page. Filter by name (client-side for now). Add server-side `?search=` param to API. |
| **Favorites/starred** | 3h | High | Add `starred_dashboards` table (user_id, dashboard_id). Star icon on each dashboard card. "Starred" filter tab on list page. |
| **Recently viewed** | 2h | Medium | Client-side: localStorage array of last 10 dashboard IDs + names + timestamps. Show as "Recent" section at top of dashboard list. |
| **Dashboard clone** | 2h | Medium | "Duplicate" button on dashboard card. API: POST /dashboards/{id}/clone. Deep-copy panels, variables, groups. New name = "Copy of {name}". |
| **Panel duplicate** | 1h | Medium | "Duplicate" button in panel header (editor mode). Copy panel definition, generate new ID, offset position_y. |
| **Dashboard JSON export/import** | 4h | Medium | Export: download dashboard JSON. Import: upload JSON, validate schema, create dashboard. |

#### Wave 3: Annotations & Events (2 days)

| Feature | Effort | Impact | Details |
|---------|--------|--------|---------|
| **Annotation data model** | 3h | High | Table: `annotations` (id, tenant_id, dashboard_id nullable, title, text, tags JSONB, starts_at, ends_at nullable, created_by, created_at). API: CRUD endpoints. |
| **Annotation rendering on charts** | 4h | High | Render as Recharts `<ReferenceLine>` (point annotation) or `<ReferenceArea>` (range annotation) on all timeseries/area panels. Color-coded triangles at bottom. Hover for tooltip. |
| **Click-to-annotate** | 3h | Medium | In viewer mode: Ctrl+Click on chart opens annotation creation dialog at that timestamp. Save via API. |
| **Alert state overlay** | 4h | High | Query alert events for the visible time range. Render as colored band (green/yellow/red) at the very bottom of each relevant chart, showing ok/pending/firing state transitions. |

#### Wave 4: Power Features (3-4 days)

| Feature | Effort | Impact | Details |
|---------|--------|--------|---------|
| **Dashboard versioning** | 6h | High | Table: `dashboard_versions` (dashboard_id, version, data JSONB, created_by, created_at, change_summary). Save creates new version. "History" panel shows versions with diff. "Restore" reverts to selected version. |
| **Compare-with-previous toggle** | 4h | High | In time picker: "Compare with previous period" toggle. When on, each panel fires a second query with time range shifted by the range duration. Render comparison series as dashed lines with reduced opacity. |
| **Dashboard links** | 3h | Medium | Array of `{label, url, icon, tooltip, include_vars, include_time}` in dashboard model. Rendered as clickable pills below the dashboard header. URL supports `$variable` interpolation. |
| **Data links on charts** | 4h | Medium | Per-panel `data_links: [{label, url}]` in PanelDefinition. On data point click, show a small menu of configured links. URL interpolation: `${__value}`, `${__time}`, `${__series.name}`, `${__field.name}`, any `${var_name}`. |
| **Value mappings** | 3h | Medium | Per-panel `value_mappings: [{type: "value"|"range"|"regex", match, display_text, color}]`. Applied in StatWidget, GaugeWidget, TableWidget, StatusWidget. |
| **Dashboard tags** | 2h | Low-Medium | Add `tags: string[]` to dashboard model. Tag input in dashboard settings. Filter by tag on list page. |

#### Wave 5: Visual Polish (2 days)

| Feature | Effort | Impact | Details |
|---------|--------|--------|---------|
| **Line interpolation options** | 2h | Medium | Panel display option: `lineInterpolation: "linear" | "smooth" | "stepBefore" | "stepAfter"`. Map to Recharts `<Line type={...}>`. |
| **Connect null values option** | 2h | Medium | Panel display option: `connectNullValues: "never" | "always" | "threshold"`. When "always", Recharts `connectNulls={true}`. |
| **Gradient fill mode** | 3h | Medium | For area/timeseries fill: use SVG `<linearGradient>` definition. Fill from line color at top to transparent at baseline. Configurable fill opacity (0-100%). |
| **Per-series line width** | 1h | Low | Panel display option: `lineWidth: 1-5`. Map to Recharts `strokeWidth`. |
| **Pause refresh on hidden tab** | 1h | Medium | Use `document.visibilityState` API. Clear refresh interval when hidden, restart when visible. |
| **Improved tooltip styling** | 2h | Medium | Redesign tooltip: compact layout, series color dot, right-aligned values, sorted by value, dimmed hidden series. Max height with scroll for many series. |

---

## SUMMARY: TOP 10 HIGHEST-IMPACT ITEMS

1. **Shared crosshair across panels** — The single most impactful UX improvement. Makes dashboards feel coordinated and professional. 4 hours.
2. **Drag-to-zoom on charts** — Every competitor has this. Without it, investigation workflow is broken. 6 hours.
3. **Legend click to toggle series** — Already half-implemented. Wire it up. 3 hours.
4. **Time shift back/forward buttons** — Tiny effort, huge workflow improvement. 3 hours.
5. **Annotations + event markers** — Key differentiator between "charts on a page" and "monitoring dashboard". 10 hours.
6. **Dashboard versioning** — Prevents data loss from accidental edits. Shows enterprise maturity. 6 hours.
7. **Compare-with-previous overlay** — Datadog's killer feature for trend analysis. 4 hours.
8. **Dashboard search + favorites + recent** — Basic navigation that every app needs at scale. 9 hours.
9. **Drag-to-zoom propagation to all panels** — Connected to item 2, but specifically the "zoom one, zoom all" behavior. 2 hours (included in item 2).
10. **Alert state overlay on charts** — Bridge the gap between alerting and dashboards. Shows firing state as colored band. 4 hours.

**Total estimated effort for all 5 waves: ~15-18 days solo dev.**
**Wave 1 alone (chart interactivity) transforms the dashboard perception in 3-4 days.**
