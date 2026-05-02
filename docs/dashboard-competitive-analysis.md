# Dashboard Feature Competitive Analysis

> Platforms: Datadog, Grafana, New Relic, Splunk/SignalFx, Dynatrace, Chronosphere
> Date: 2026-05-02
> Purpose: Plan best-in-class dashboard implementation for ObserveLabs

---

## 1. Panel / Widget Types

### Core Chart Types (Table: who has what)

| Widget Type | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Timeseries (line)** | Yes | Yes | Yes (line + area) | Yes (line + area) | Yes |
| **Bar chart** | Yes | Yes | Yes | Yes (column) | Yes |
| **Stacked area** | Yes | Yes | Yes | Yes | Yes |
| **Pie / Donut** | Yes | Yes | Yes | No | Yes |
| **Gauge** | Query Value | Yes (gauge + bar gauge) | No | No | No |
| **Single value / Stat** | Query Value | Stat panel | Billboard | Single Value | Single Value |
| **Table** | Yes | Yes | Yes | Yes (list chart) | Yes |
| **Heatmap** | Yes | Yes | Yes | Yes | No* |
| **Histogram** | Distribution | Yes | Yes | Yes | No |
| **Top List** | Yes | No (use table) | No (use bar) | Yes (list chart) | No |
| **Scatter / XY** | Scatter Plot | XY Chart | No | No | No |
| **Treemap** | Yes | No | No | No | No |
| **Sunburst** | Yes | No | No | No | No |
| **Funnel** | Yes | No | Yes | No | No |
| **Geomap** | Yes | Yes | No | No | No |
| **Bullet** | No | No | Yes | No | No |
| **Candlestick** | No | Yes | No | No | No |
| **State Timeline** | No | Yes | No | No | No |
| **Status History** | No | Yes | No | No | No |
| **Flame Graph** | No | Yes | No | No | No |

*Dynatrace has "Honeycomb" visualization which is a unique density/status view.*

### Specialized / Unique Widget Types

| Widget Type | Platform | Description |
|---|---|---|
| **Hostmap** | Datadog | Hexagonal grid of hosts colored/sized by metrics. Unique visual for infrastructure density. |
| **Service Map / Topology** | Datadog, Dynatrace | Live dependency graphs showing service-to-service communication. |
| **Node Graph** | Grafana | Directed graph for topology, dependencies, network visualization. 3 layout algorithms. |
| **Canvas** | Grafana | Freeform design surface with shapes, icons, data bindings, connections. Essentially a visual editor for custom HUDs. Most innovative panel in any platform. |
| **State Timeline** | Grafana | Horizontal state bands showing how entities transition between states over time. Unique to Grafana. Ideal for showing host up/down, deployment status. |
| **Honeycomb** | Dynatrace | Hexagonal grid showing entity health at a glance. Similar to Datadog hostmap but for any entity type. |
| **SLO Widget** | Datadog | Dedicated SLO status, error budget remaining, burn rate visualization. |
| **Change Widget** | Datadog | Shows metric value change (delta/percentage) vs a previous period. |
| **Retention** | Datadog | Cohort-style retention analysis (more product analytics than infra). |
| **Powerpacks** | Datadog | Reusable templated widget groups that sync updates across all instances. |
| **Code Tile** | Dynatrace | Execute JavaScript to fetch external API data and render it in a dashboard tile. |
| **Explore Tile** | Dynatrace | No-code point-and-click analysis tile (no DQL needed). |
| **Traces** | Grafana | Native trace/span visualization panel. |
| **Logs Panel** | Grafana, Dynatrace | Dedicated log stream visualization within dashboard context. |
| **News (RSS)** | Grafana | RSS feed display in a panel. |
| **Alert List** | Grafana | Live firing alerts inside a panel. |
| **Annotation List** | Grafana | Panel listing all annotations for review. |

### Key Takeaway

Grafana wins on **breadth** (25 panel types). Datadog wins on **specialized operational widgets** (SLO, change, hostmap, powerpacks). Dynatrace wins on **AI-powered** and **code-extensible** tiles. New Relic is weakest on widget variety.

**Ahead-of-curve targets for ObserveLabs:**
- State timeline (only Grafana has it; extremely useful for showing alert/incident state)
- Canvas / freeform visual editor (only Grafana; differentiated)
- SLO widget (only Datadog; high demand)
- Change widget (only Datadog; quick comparison)
- Topology/service map (Datadog + Dynatrace; high value for microservices users)

---

## 2. Legend & Formatting

### Legend Options

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Show/hide legend** | Yes | Yes | Yes | Yes | Yes |
| **Legend placement: bottom** | Yes (default) | Yes | Yes | Yes | Yes |
| **Legend placement: right** | No | Yes | No | No | No |
| **Legend mode: list** | Yes (compact) | Yes | Yes | Yes | Yes |
| **Legend mode: table** | Yes (expanded) | Yes | No | No | No |
| **Legend values: last** | Yes (expanded mode) | Yes | No | No | No |
| **Legend values: avg/min/max/sum** | Yes (expanded) | Yes (mean/min/max/sum/total/count/range/delta) | No | No | No |
| **Legend sorting** | No | Yes (click column headers in table mode) | No | No | No |
| **Legend click to isolate** | Yes | Yes | Yes | Yes | Yes |
| **Legend series limit** | No | Yes (configurable cap with "show more") | No | No | No |

### Unit Formatting

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Preset units (bytes, %, ms, ops/s)** | Yes (extensive list) | Yes (most extensive: 150+ units) | Limited | Limited | Yes |
| **Auto-scaling (e.g., KB to MB)** | Yes | Yes | Partial | Yes | Yes |
| **Custom unit suffix/prefix** | Yes | Yes (suffix:X, prefix:X, currency:X, si:X, time:X) | No | No | No |
| **Per-series unit override** | No | Yes (field overrides) | No | No | No |

### Color & Conditional Formatting

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Color palettes** | 3 types (categorical, diverging, sequential) | Classic, single color, continuous gradients, threshold-based | Basic | Basic | Basic |
| **Per-series color override** | Yes (per query) | Yes (field overrides, legend click) | No | No | No |
| **Threshold coloring** | Markers only | Yes (background, text, lines, bands across 13+ panel types) | Billboard only (good/warn/crit) | No | Yes (anomaly detection) |
| **Conditional formatting** | Limited (geomap) | Extensive (value mappings + field overrides + thresholds) | Billboard thresholds | No | Davis AI anomaly coloring |
| **Accessibility color modes** | Yes (color vision deficiency support) | No native | No | No | No |

### Y-Axis Options

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Linear scale** | Yes | Yes | Yes | Yes | Yes |
| **Log scale** | Yes | Yes | No | Yes | No |
| **Power / sqrt scale** | Yes (pow2, sqrt) | Yes (log2) | No | No | No |
| **Custom min/max bounds** | Yes | Yes | No | Yes | Yes |
| **Dual Y-axis** | Yes | Yes (field overrides) | No | No | No |
| **Soft min/max** | No | Yes | No | No | No |

### Threshold Lines & Bands

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Horizontal threshold lines** | Yes (markers: solid/bold/dashed, color-coded by severity) | Yes (absolute + percentage modes) | No | No | No |
| **Threshold fill/bands** | No | Yes (filled regions between thresholds) | No | No | No |
| **Threshold on multiple panels** | Markers only on timeseries | Yes (13+ panel types) | Billboard only | No | Via anomaly detection |

### Key Takeaway

Grafana dominates formatting. Its field override system, threshold bands, 150+ units, and legend table mode are the gold standard. Datadog has good marker/threshold line support and the best Y-axis options. New Relic and Splunk are surprisingly weak on formatting.

**Ahead-of-curve targets:**
- Legend table mode with sortable value columns (Grafana-quality)
- Threshold bands (filled regions) not just lines
- Per-series overrides (color, unit, axis) via field override system
- Dual Y-axis support
- 50+ preset unit categories with auto-scaling

---

## 3. Variables / Template Variables

### Variable Types

| Type | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Tag/query-based** | Yes (tag:value) | Yes (query variable, most powerful) | Yes (NRQL uniques/keyset) | Yes (property filter) | Yes (DQL variable) |
| **Custom list** | No (tag values only) | Yes | Yes (comma-separated) | Yes | Yes (list variable) |
| **Free text input** | No | Yes (text box) | Yes | No | Yes |
| **Constant (hidden)** | No | Yes | Yes (hidden variables) | No | No |
| **Data source selector** | No | Yes (switch between Prometheus instances, etc.) | No | No | No |
| **Interval** | No | Yes (1m, 5m, 1h with auto option) | No | No | No |
| **Ad hoc filters** | No | Yes (dynamic key=value pairs auto-injected into queries) | No | No | No |
| **Switch / toggle** | No | Yes (boolean toggle) | No | No | No |
| **Code-based** | No | No | No | No | Yes (JavaScript) |

### Variable Capabilities

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Multi-value selection** | Implicit via wildcard | Yes (explicit, format adapts per datasource) | Yes (IN operator) | Yes | Yes |
| **"All" option** | Yes (* wildcard) | Yes (configurable custom all value) | Yes (include/exclude toggle) | Yes | Yes |
| **Cascading / dependent** | Yes (auto-associated) | Yes (chained query variables, unlimited depth) | Yes (nested variables) | Limited | Yes (interdependencies) |
| **URL state sync** | Yes (`&tpl_var_X=Y`) | Yes (`var-X=Y`, can disable per-var) | No documentation | No | Yes (URL-embedded) |
| **Regex filtering** | No | Yes (on query results, capture groups supported) | No | No | No |
| **Variable syntax formats** | `$var`, `$var.value`, `$var.key` | `$var`, `${var}`, `${var:csv}`, `${var:pipe}`, `${var:regex}`, etc. | `{{var}}` with string/number/identifier types | `$var` | DQL `$var` |
| **Variable in title/description** | No | Yes | Yes | No | No |
| **Refresh control** | Auto | On load / on time range change | Auto | Auto | Auto |

### Key Takeaway

Grafana is the undisputed leader in variables with 9 variable types, regex filtering, format adapters, and ad hoc filters. Datadog's auto-associated variables (cascading without config) is an underrated UX win. New Relic's include/exclude toggle and output format types (string/number/identifier) are clever. Dynatrace's code-based variables are unique.

**Ahead-of-curve targets:**
- Query-based + custom list + free text (minimum viable set)
- Multi-value with "All" option
- Cascading/dependent variables
- URL state sync (essential for shareability)
- Ad hoc filters (Grafana's killer feature -- dynamic key=value injected into all queries)
- Variable format adapters (csv, pipe, regex -- needed for different query backends)

---

## 4. Time Controls

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Relative ranges (last 1h, 24h, 7d)** | Yes | Yes | Yes | Yes | Yes |
| **Custom date range (calendar picker)** | Yes | Yes | Yes | Yes | Yes |
| **Timezone selector** | Yes (UTC toggle) | Yes (full timezone selector) | UTC default | Yes | Yes |
| **Auto-refresh interval** | Yes (with pause) | Yes (configurable: 5s, 10s, 30s, 1m, 5m, etc.) | Yes | Yes | Yes (varies by timeframe) |
| **Per-widget time override** | Yes | Yes | No | No | Yes (per-tile) |
| **Compare with previous period** | Yes (day/week/month/custom) | No native (community plugin) | Yes (COMPARE WITH clause) | No | No |
| **Time sync across widgets** | Yes (linked crosshairs) | Yes (shared crosshair/tooltip) | No | Yes | Yes |
| **Zoom by drag-select** | Yes | Yes | Yes | Yes | Yes |

### Key Takeaway

Datadog's "Compare with previous period" overlay is a powerful feature that Grafana lacks natively. Per-widget time override is important and only Datadog, Grafana, and Dynatrace have it. Shared crosshair/tooltip across panels is table stakes.

**Ahead-of-curve targets:**
- Per-widget time override
- Compare with previous period (Datadog/New Relic feature -- high user demand, Grafana gap)
- Shared crosshair on hover across all panels
- Timezone selector (not just UTC toggle)

---

## 5. Organization & Discovery

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Folders / nesting** | Flat (lists) | Yes (up to 4 levels deep) | Flat | Dashboard Groups | Flat |
| **Tags** | Yes | Yes | Yes (entity tags) | No | Yes |
| **Favorites / starring** | Yes | Yes | Yes | Yes | Yes |
| **Search** | Yes | Yes (by name, tag, folder) | Yes | Yes | Yes |
| **Dashboard templates / presets** | Yes (out-of-box for integrations: 700+ presets) | Yes (community gallery: 1000+ free dashboards) | Yes (pre-built for common use cases) | Yes (built-in templates) | Yes (built-in for Kubernetes, etc.) |
| **Dashboard playlists / rotation** | No native | Yes (configurable interval, 4 display modes) | Yes (TV mode cycles pages every 20s) | No | No |
| **Tabs / pages within dashboard** | Yes (up to 100 tabs) | No (use dashboard links) | Yes (multi-page) | No | No |
| **Widget grouping** | Yes (collapsible groups, bulk edit) | Yes (row grouping, collapsible) | No | No | No |
| **Dashboard lists** | Yes | Yes (dashboard list panel) | No | Yes (dashboard group) | No |
| **Recently deleted / recovery** | No | Yes (12-month retention, up to 1000 items) | No | No | No |

### Key Takeaway

Grafana wins on organization (nested folders, playlists, recovery). Datadog wins on preset dashboards (700+ integration dashboards out of box) and tabs within dashboards. Multi-page dashboards (Datadog tabs, New Relic pages) is highly valued.

**Ahead-of-curve targets:**
- Folders (at least 2 levels)
- Tags + favorites + search
- Tabs within a dashboard (Datadog's 100-tab feature is underrated)
- Dashboard presets for common AWS/Azure services
- Collapsible widget groups

---

## 6. Sharing & Collaboration

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Internal link sharing** | Yes | Yes | Yes (permalink) | Yes | Yes |
| **Public / anonymous link** | Yes (public dashboards) | Yes (external sharing, email-gated or fully public) | Yes (public URLs with expiration) | No | Yes (view-only for all) |
| **Snapshot (frozen-in-time)** | Yes (graph snapshots in notebooks) | Yes (snapshot sharing) | No | No | No |
| **PNG export** | Yes (copy widget as image) | Yes (via image renderer) | Yes | No | No |
| **PDF export** | No native | Yes (Enterprise: scheduled PDF reports) | Yes (with limitations on variables/custom viz) | No | Yes |
| **CSV export** | No native | Yes (table panels) | Yes (table charts, UTC only) | No | Yes (CSV + CSV raw) |
| **JSON import/export** | Yes | Yes | Yes | No documented | Yes |
| **Embed (iframe)** | Yes (embeddable graphs) | Yes (via public dashboards) | No | No | No |
| **Email scheduling** | Yes (scheduled reports) | Yes (Enterprise: hourly/daily/weekly/monthly, PDF + CSV attachments) | No | No | Yes (dashboard reports) |
| **Dashboard cloning** | Yes | Yes (save as) | Yes (duplicate) | No | Yes |
| **Version history** | Yes (preview, restore, clone previous versions) | Yes (diff, restore) | No | No | Yes (50 versions, 30-day retention) |
| **Audit trail** | Yes (events in Events Explorer) | Yes (Enterprise: usage analytics) | No | No | No |
| **Live collaboration** | Notebooks only (real-time cursors) | No | No | No | No |
| **Edit read-only (session fork)** | No | No | No | No | Yes (edit then save-as-new or discard) |

### Key Takeaway

Grafana Enterprise has the best email reporting (flexible scheduling, PDF/CSV, custom layouts). Datadog has the best live collaboration (notebooks with real-time cursors). Dynatrace's "edit read-only dashboard" (session fork) is a clever UX pattern. New Relic's public links with expiration dates are a nice security touch.

**Ahead-of-curve targets:**
- JSON import/export (table stakes)
- Version history with diff and restore
- Public link sharing with optional expiration
- PNG export per widget
- PDF export of full dashboard
- Email scheduling (even basic weekly digest would differentiate)

---

## 7. Advanced Features

### Annotations / Event Markers

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Manual annotations** | No | Yes (click to add, point + region) | No | No | No |
| **Event overlay on timeseries** | Yes (change overlays: deploys, feature flags) | Yes (annotation queries from any datasource) | No | No | Yes (DQL/code-based annotations) |
| **Cross-dashboard annotations** | No | Yes (tag-filtered queries show org-wide) | No | No | No |
| **Deploy markers** | Yes (auto-detected from APM) | Yes (via CI/CD annotation API) | No | No | Yes |
| **Time regions (recurring)** | No | Yes (day/time or cron syntax) | No | No | No |
| **Annotation tags + filtering** | No | Yes | No | No | Yes |

### Cross-Widget Interaction

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Linked hover / shared crosshair** | Yes | Yes (shared crosshair + shared tooltip modes) | No | Yes | Yes |
| **Click-to-filter other widgets** | Template vars only | Template vars only | Yes (facet linking: click bar/pie/table to filter all) | Yes | Variables |
| **Context links / drill-down** | Yes (parameterized links to other DD pages, dashboards, external URLs) | Yes (data links with variables) | Yes (drill to NRQL, entities) | Yes (data links) | Yes |
| **Fullscreen per widget** | Yes | Yes | Yes | Yes | Yes |

### Other Advanced Features

| Feature | Datadog | Grafana | New Relic | Splunk | Dynatrace |
|---|---|---|---|---|---|
| **Widget notes / descriptions** | Yes (note widgets) | Yes (panel description tooltip) | Yes (markdown widget) | Yes (text chart) | Yes (markdown tile) |
| **Dashboard versioning** | Yes | Yes | No | No | Yes |
| **TV / kiosk mode** | Yes (TV mode) | Yes (4 modes: normal, auto-fit, kiosk, kiosk+auto-fit) | Yes (TV mode, 20s page cycle) | No | No |
| **Responsive / mobile** | Responsive grid | Auto-scale to any resolution | 12-column grid | No | Grid with snap |
| **High-density mode** | Yes (side-by-side groups on wide screens) | No | No | No | No |
| **AI-powered features** | Anomaly/forecast/outlier detection overlays | AI-generated titles/descriptions (LLM plugin) | No | No | Davis AI: anomaly detection, predictive forecasting, auto-adaptive thresholds |
| **Analytical overlays** | 12 function types (anomaly, forecast, outlier, regression, smoothing, rollup, timeshift, rate, rank, etc.) | Transformations (reduce, filter, join, calculate, etc.) | NRQL functions | SignalFlow analytics | DQL functions + Davis AI |
| **Notebooks (data + narrative)** | Yes (rich: live collab, graphs + markdown + images, scheduling, templates) | No (dashboard notes only) | No | No | No |
| **Powerpacks (reusable templates)** | Yes (synced updates across all instances) | No (library panels: shared but not templated) | No | No | No |
| **Keyboard shortcuts** | Yes (Ctrl+C widgets) | Yes | No | No | Yes (Shift+D, Shift+C, Shift+M) |

---

## 8. Innovative / Unique Features by Platform

### Datadog -- Standout Innovations
1. **Powerpacks**: Reusable templated widget groups that auto-sync. A team creates a "standard CPU monitoring" powerpack; when they update it, every dashboard using it updates automatically. No other platform has this.
2. **Change Overlays**: Auto-detected deploy markers from APM traces overlaid on all timeseries. No manual annotation needed.
3. **Notebooks**: True live-collaboration data documents (real-time cursors like Google Docs) combining graphs with narrative. The only platform bridging dashboards and documentation.
4. **12 analytical function categories**: Anomaly detection, forecasting, outlier detection, regression -- all as one-click overlays on any timeseries.
5. **700+ preset dashboards**: Plug in an integration, get a production-ready dashboard instantly.
6. **Accessibility color modes**: Dedicated palettes for color vision deficiency.

### Grafana -- Standout Innovations
1. **Canvas panel**: Freeform visual design surface. Users can build custom infrastructure diagrams, floor plans, network topologies with data-bound elements. Nothing else like it in monitoring.
2. **Ad hoc filters variable**: Dynamic key=value filter pairs automatically injected into all panel queries. Zero configuration needed per panel.
3. **State Timeline + Status History**: Unique panels for visualizing state transitions over time. Perfect for incident timelines.
4. **Field override system**: Override any property (color, unit, axis, threshold) for any specific series. Most granular customization in the industry.
5. **9 variable types**: Most flexible templating system by far.
6. **Community ecosystem**: 1000+ free dashboards, 200+ plugins, open-source extensibility.
7. **Threshold bands**: Filled regions between threshold values on charts.
8. **Dashboard playlists**: Automated rotation through dashboards with kiosk mode.

### New Relic -- Standout Innovations
1. **NRQL everywhere**: Every chart is a query. Full SQL-like power for any visualization.
2. **Facet linking**: Click a value in a bar/pie/table chart and it cross-filters all other widgets on the dashboard. The most intuitive cross-widget interaction.
3. **Billboard with COMPARE WITH**: Single-value widget that shows current value AND delta vs previous period in one glance.
4. **Include/Exclude variable toggle**: Variables can be toggled between "include these values" and "exclude these values" -- unique UX.
5. **Mermaid diagram support**: Render Mermaid diagrams inline in dashboard markdown widgets.
6. **Public links with expiration**: Time-bomb sharing links for security.

### Dynatrace -- Standout Innovations
1. **Davis AI integration**: Auto-adaptive anomaly detection thresholds that learn seasonal patterns. Predictive forecasting built into tiles. No manual threshold configuration needed.
2. **Code tiles (JavaScript)**: Execute arbitrary JavaScript to fetch external API data and render it. The most extensible tile type in any platform.
3. **Explore tiles (no-code)**: Point-and-click analysis requiring zero query language knowledge. Lowest barrier to entry.
4. **Segments**: Reusable cross-dashboard filter presets (e.g., "Production K8s cluster" = namespace + cluster + env filters saved once, applied anywhere).
5. **Honeycomb visualization**: Hexagonal density grid for entity health overview. Visually distinctive.
6. **Edit read-only dashboards**: Session-scoped fork of shared dashboards -- explore freely, then save-as-new or discard.

### Splunk/SignalFx -- Standout Innovations
1. **SignalFlow analytics**: Real-time streaming analytics language for metric processing.
2. **Dashboard mirroring**: Same dashboard appears in multiple dashboard groups, single source of truth.
3. **Data links**: Deep linking from chart data points to Splunk search, external URLs, or other dashboards with full context passing.

### Chronosphere
Note: Chronosphere documentation was inaccessible during research (404 errors on all attempted URLs). Based on industry knowledge: Chronosphere dashboards are Grafana-compatible (they use Grafana as their visualization layer), with added value around control plane features (quotas, data shaping) rather than dashboard innovation per se.

---

## 9. Common User Praise & Complaints (Cross-Platform)

### Most Praised Features (Industry-Wide)
- **Grafana**: Flexibility, open-source, plugin ecosystem, variable system, "you can visualize anything"
- **Datadog**: Out-of-box dashboards for integrations, ease of setup, unified platform (metrics+logs+traces in one dashboard)
- **New Relic**: NRQL power, billboard widgets, facet cross-filtering
- **Dynatrace**: AI-powered auto-detection, low manual configuration needed
- **Splunk**: Powerful search/query language, log correlation

### Most Common Complaints (Industry-Wide)
- **Grafana**: Steep learning curve for variables/transformations, no built-in alerting UX on dashboards (separate flow), no native collaboration, Enterprise features paywalled
- **Datadog**: Extremely expensive at scale (per-host + per-metric pricing), vendor lock-in, slow dashboard load with many widgets, limited free-tier
- **New Relic**: Dashboard performance with complex NRQL, limited chart formatting options, PDF export loses formatting
- **Dynatrace**: Complex pricing, classic dashboards outdated (new dashboards still maturing), DQL learning curve
- **Splunk**: Expensive, separate products for infrastructure vs. APM vs. logs, dashboard UX behind competitors

---

## 10. Recommended Priority for ObserveLabs Implementation

### Tier 1: Table Stakes (Must-Have for Demo)
These are expected by anyone evaluating a monitoring platform:
- [x] Timeseries (line, area, stacked)
- [x] Bar chart
- [x] Single value / stat
- [x] Table
- [ ] Pie / donut
- [ ] Gauge (radial + bar)
- [ ] Heatmap
- [ ] Top list
- [ ] Template variables (query-based + custom list + text)
- [ ] Multi-value + "All" option
- [ ] URL state sync for variables
- [ ] Relative time ranges + custom date picker
- [ ] Auto-refresh control
- [ ] Dashboard JSON import/export
- [ ] Favorites, search
- [ ] Fullscreen per widget
- [ ] Shared crosshair across panels

### Tier 2: Competitive Parity (Need Within 3 Months)
These put you on equal footing with mid-tier platforms:
- [ ] Threshold lines AND bands on timeseries
- [ ] Per-series color override
- [ ] Legend table mode with value columns (last, avg, min, max)
- [ ] Dual Y-axis
- [ ] Y-axis scale options (linear, log)
- [ ] 50+ unit presets with auto-scaling
- [ ] Cascading/dependent variables
- [ ] Per-widget time override
- [ ] Folders + tags for organization
- [ ] Widget groups (collapsible rows)
- [ ] Dashboard version history
- [ ] PNG/PDF export
- [ ] Public link sharing
- [ ] Annotations / deploy markers on timeseries
- [ ] Dashboard tabs/pages
- [ ] TV / kiosk mode

### Tier 3: Differentiation (3-6 Months, Ahead of Curve)
These would make ObserveLabs stand out:
- [ ] Compare with previous period overlay (only Datadog + New Relic; Grafana gap)
- [ ] Facet cross-filtering (click widget value to filter all others -- only New Relic)
- [ ] Ad hoc filters (dynamic key=value injection -- only Grafana)
- [ ] State timeline panel (only Grafana; high value for incidents)
- [ ] SLO widget (only Datadog; high enterprise demand)
- [ ] Change widget (delta/% vs previous period)
- [ ] Reusable widget templates / powerpacks (only Datadog)
- [ ] Service topology / dependency map
- [ ] Scheduled email reports
- [ ] Dashboard playlists with kiosk mode
- [ ] Analytical overlays (anomaly detection, forecast, moving average)

### Tier 4: Moonshot (6-12 Months)
These are forward-looking differentiators:
- [ ] Canvas / freeform visual editor (only Grafana; complex but highly differentiated)
- [ ] Live collaboration (only Datadog Notebooks; Google Docs-style cursors)
- [ ] AI-powered anomaly detection in tiles (only Dynatrace Davis)
- [ ] Code-extensible tiles (only Dynatrace; fetch external APIs via JS)
- [ ] Notebook / data document hybrid (only Datadog)
- [ ] Geomap visualization
- [ ] Dashboard-as-code (Terraform/API provisioning)

---

## 11. Biggest Gaps in the Industry (Opportunities)

These are features NO platform does well, where ObserveLabs could leapfrog:

1. **Real-time collaboration on dashboards** -- Datadog only has it in Notebooks, not dashboards. Nobody has Google-Docs-style co-editing on actual dashboards.

2. **Smart dashboard generation** -- Nobody auto-generates an optimized dashboard from your actual data shape. "Here are 5 hosts sending CPU/memory/disk -- here's a suggested dashboard." Dynatrace's Explore tile hints at this.

3. **Cross-tenant dashboard templates** -- In multi-tenant SaaS, nobody lets an admin create a dashboard template that auto-populates per tenant. This is a natural fit for ObserveLabs.

4. **Mobile-first dashboards** -- Every platform has responsive layouts but none have a dedicated mobile experience with push notifications on threshold breach.

5. **Unified search across dashboard content** -- Search for a metric name and find every dashboard/widget that uses it. Grafana has basic search, but deep content search is absent everywhere.

6. **Dashboard performance budgets** -- No platform warns you "this dashboard has 47 widgets and will be slow." Proactive performance guidance is missing.

---

## Appendix: Feature Count Summary

| Platform | Widget Types | Variable Types | Sharing Methods | Unique Features |
|---|---|---|---|---|
| **Grafana** | 25 | 9 | 6 | Canvas, State Timeline, Ad Hoc Filters, Playlists, Field Overrides |
| **Datadog** | 20+ | 1 (tag-based) | 5 | Powerpacks, Notebooks, Change Overlays, 700+ Presets, Analytical Functions |
| **New Relic** | 11 | 3 | 4 | Facet Cross-Filter, Billboard Compare, NRQL Power, Mermaid Diagrams |
| **Dynatrace** | 10+ | 4 | 3 | Davis AI, Code Tiles, Explore Tiles, Honeycomb, Segments |
| **Splunk** | 8 | 2 | 2 | SignalFlow, Dashboard Mirroring, Data Links |
| **Chronosphere** | Grafana-based | Grafana-based | Grafana-based | Control plane (quotas/shaping) |
