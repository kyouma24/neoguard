---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Configuration Reference

The agent is configured via a YAML file passed with `--config <path>`.

All string values support environment variable expansion: `${VAR}` and `${VAR:-default}`.

## Minimal Config

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: https://ingest.yourdomain.com
```

Everything else has sensible defaults.

---

## Full Reference

### Top-Level

| Key | Type | Default | Required | Description |
|---|---|---|---|---|
| `api_key` | string | — | **Yes** | NeoGuard API key (format: `obl_live_v2_*`) |
| `endpoint` | string | — | **Yes** | NeoGuard ingest API base URL (must start with `http://` or `https://`) |
| `ca_bundle_path` | string | `""` | No | Absolute path to PEM-encoded CA certificate bundle for custom TLS trust. See [Custom CA Bundle](#custom-ca-bundle). |
| `cloud_detection` | string | `auto` | No | `auto` (probe AWS/Azure IMDS) or `skip` (bare metal / on-prem) |
| `extra_tags` | map | `{}` | No | Tags added to every metric point |

### collection

| Key | Type | Default | Range | Description |
|---|---|---|---|---|
| `collection.interval_seconds` | int | `60` | 10-300 | Main collection interval |
| `collection.process_interval_seconds` | int | `30` | 10-300 | Process collector interval |
| `collection.slow_interval_seconds` | int | `120` | 30-600 | Slow collectors interval (sensors, entropy, pressure, conntrack) |

### cpu

| Key | Type | Default | Description |
|---|---|---|---|
| `cpu.per_core` | bool | `false` | Emit per-core CPU breakdown. Warning: on 64-core hosts, adds ~576 series |
| `cpu.per_core_frequency` | bool | `false` | Emit per-core frequency. Only meaningful with per_core enabled |

### transport

| Key | Type | Default | Range | Description |
|---|---|---|---|---|
| `transport.batch_max_size` | int | `5000` | 100-10000 | Max metric points per batch |
| `transport.batch_max_interval_seconds` | int | `10` | — | Max seconds between transmissions |
| `transport.request_timeout_seconds` | int | `30` | 5-120 | HTTP request timeout |

### buffer

| Key | Type | Default | Range | Description |
|---|---|---|---|---|
| `buffer.memory_max_items` | int | `100000` | 1000-1000000 | Max metric points in memory ring buffer |
| `buffer.wal_dir` | string | `""` (disabled) | — | Directory for WAL file. Empty = memory-only. Recommended: `/var/lib/neoguard/wal` |

When `wal_dir` is set:
- Metrics are persisted to disk as they're collected
- On agent restart, undelivered metrics are replayed from the WAL
- If disk write fails, falls back to memory-only (never blocks collection)
- WAL auto-compacts when 50%+ of entries have been transmitted

### collectors

| Key | Type | Default | Description |
|---|---|---|---|
| `collectors.disabled` | []string | `[]` | Collector names to disable |

Available collector names: `cpu`, `memory`, `disk`, `diskio`, `network`, `system`, `netstat`, `process`, `portmap`, `container`, `filewatch`, `sensors`, `healthscore`, `saturation`, `correlation`, `vmstat`, `sockstat`, `filefd`, `cpustat`, `entropy`, `pressure`, `conntrack`

### disk

| Key | Type | Default | Description |
|---|---|---|---|
| `disk.exclude_mounts` | []string | `/proc`, `/sys`, `/dev`, `/run`, `/snap` | Mount paths to exclude |
| `disk.exclude_fstypes` | []string | `tmpfs`, `devtmpfs`, `squashfs`, `overlay` | Filesystem types to exclude |

### network

| Key | Type | Default | Description |
|---|---|---|---|
| `network.exclude_interfaces` | []string | `lo`, `docker*`, `veth*`, `br-*` | Interface names to exclude (supports glob patterns) |

### process

| Key | Type | Default | Description |
|---|---|---|---|
| `process.top_n` | int | `20` | Number of top non-aggregated processes to report (by CPU%, then memory) |
| `process.ignore_patterns` | []string | `[]` | Regex patterns for processes to ignore before deny/allow filtering (e.g., kernel threads) |
| `process.allow_regex` | []string | `[]` | If set, only matching process names are reported (applied after ignore_patterns and deny_regex) |
| `process.deny_regex` | []string | `[]` | Matching process names are always excluded (applied after ignore_patterns, before allow_regex) |
| `process.collect_cmdline` | bool | `false` | Collect and sanitize process command-line arguments (see cardinality.md) |
| `process.aggregation.enabled` | bool | `false` | Enable process aggregation to reduce cardinality |
| `process.aggregation.rules` | []object | `[]` | Aggregation rules (max 50) |
| `process.aggregation.rules[].pattern` | string | required | Regex pattern to match process names |
| `process.aggregation.rules[].aggregate_as` | string | required | Group name for aggregated metrics (max 64 chars, alphanumeric + `_.-`) |

**Filtering order**: `ignore_patterns` → `deny_regex` → `allow_regex` → aggregation (first-match-wins) → top-N

**Aggregated metrics**: Emit `process_group` tag only. No `process_pid`, `process_name`, `process_user`, or `process_cmdline` tags. Top-N applies only to individual (non-aggregated) processes.

**Pattern validation**: All regex patterns are compiled at config load time. Invalid patterns cause startup failure. See `docs/cardinality.md` for detailed aggregation behavior.

### saturation

| Key | Type | Default | Description |
|---|---|---|---|
| `saturation.window_size` | int | `30` | Samples to keep for linear regression. At 60s interval, 30 = 30 minutes of history |

### file_watch

| Key | Type | Default | Description |
|---|---|---|---|
| `file_watch.paths` | []string | `[]` | File paths or glob patterns to monitor |
| `file_watch.max_files` | int | `50` | Cap on total files after glob expansion |

Example:
```yaml
file_watch:
  paths:
    - /var/log/syslog
    - /var/log/nginx/error.log
    - /tmp/*.pid
  max_files: 20
```

### logging

| Key | Type | Default | Description |
|---|---|---|---|
| `logging.level` | string | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `logging.format` | string | `json` | Log format: `json` (structured) or `text` (human-readable) |

### health

| Key | Type | Default | Description |
|---|---|---|---|
| `health.enabled` | bool | `false` | Enable HTTP health/metrics server |
| `health.bind` | string | `127.0.0.1:8282` | Listen address in `host:port` format |
| `health.port` | int | _(deprecated)_ | **Deprecated.** Use `health.bind` instead. If set, binds to `127.0.0.1:<port>`. Mutually exclusive with `health.bind`. |

Endpoints when enabled:
- `GET /health` — Liveness probe (always 200)
- `GET /ready` — Readiness probe (200 after first collection, 503 during startup/shutdown)
- `GET /status` — JSON stats (uptime, buffer, errors, goroutines, heap)
- `GET /metrics` — Prometheus exposition format (latest collected metrics)

### clock

| Key | Type | Default | Description |
|---|---|---|---|
| `clock.strict_clock_check` | bool | `false` | If true, agent refuses to start when clock skew exceeds ±300 seconds. See [Clock Skew Detection](#clock-skew-detection). |

**Warning threshold:** Clock skew > 60 seconds triggers a warning log but does not prevent startup (regardless of `strict_clock_check` setting).

**Strict threshold:** Clock skew > 300 seconds with `strict_clock_check: true` causes immediate startup failure with exit code 78 (EX_CONFIG).

### logs

| Key | Type | Default | Description |
|---|---|---|---|
| `logs.enabled` | bool | `false` | Enable log collection pipeline |
| `logs.sources` | []object | `[]` | Log source definitions (required when enabled) |
| `logs.sources[].path` | string | — | **Required.** Absolute path to log file |
| `logs.sources[].service` | string | — | **Required.** Service name tag for this source |
| `logs.sources[].start_position` | string | `end` | Where to start reading: `start` (beginning of file) or `end` (tail only new lines) |
| `logs.sources[].parser.mode` | string | `raw` | Parser mode: `raw` (whole line), `json` (structured), `regex` (named captures) |
| `logs.sources[].parser.pattern` | string | `""` | Regex pattern with named captures (required when mode is `regex`) |
| `logs.sources[].multiline.enabled` | bool | `false` | Enable multiline aggregation |
| `logs.sources[].multiline.mode` | string | — | Multiline mode: `start` (pattern marks new message start) or `continue` (pattern marks continuation) |
| `logs.sources[].multiline.pattern` | string | — | Regex pattern for multiline detection (required when multiline.enabled=true) |
| `logs.sources[].multiline.max_bytes` | int | `32768` | Maximum bytes per multiline message before truncation |
| `logs.sources[].multiline.flush_timeout` | duration | `5s` | Time to wait for continuation lines before flushing |
| `logs.redaction.enabled` | *bool | `true` (when sources exist) | Enable credential redaction (bearer tokens, AWS keys, API keys, password fields) |
| `logs.spool.max_size_mb` | int | `2048` | Maximum spool directory size in MB (range: 100-10000) |
| `logs.spool.high_watermark_pct` | int | `80` | Percentage at which backpressure begins (range: 50-95) |
| `logs.spool.critical_watermark_pct` | int | `95` | Percentage at which oldest batches are dropped (must be > high_watermark_pct, max 99) |

Example:
```yaml
logs:
  enabled: true
  sources:
    - path: /var/log/nginx/access.log
      service: nginx
      start_position: end
      parser:
        mode: json
    - path: /var/log/app/server.log
      service: myapp
      start_position: end
      parser:
        mode: regex
        pattern: '^(?P<timestamp>\S+) (?P<level>\w+) (?P<message>.*)$'
      multiline:
        enabled: true
        mode: start
        pattern: '^\d{4}-\d{2}-\d{2}'
        max_bytes: 65536
        flush_timeout: 3s
  redaction:
    enabled: true
  spool:
    max_size_mb: 2048
    high_watermark_pct: 80
    critical_watermark_pct: 95
```

See `docs/log-collection.md` for detailed log pipeline documentation.

---

## Environment Variable Expansion

Any string value supports `${VAR}` and `${VAR:-default}`:

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: ${NEOGUARD_ENDPOINT:-https://ingest.neoguard.io}
extra_tags:
  environment: ${DEPLOY_ENV:-production}
  cluster: ${K8S_CLUSTER:-default}
```

If `NEOGUARD_API_KEY` is not set, the value is empty (which will fail validation).
If `NEOGUARD_ENDPOINT` is not set, the default `https://ingest.neoguard.io` is used.

---

## Config Hot-Reload (Linux)

Send SIGHUP to reload config without restarting:

```bash
sudo systemctl reload neoguard-agent
# or
sudo kill -HUP $(pidof neoguard-agent)
```

**Reloadable settings** (applied immediately):
- `logging.level`, `logging.format`
- `extra_tags`
- `file_watch.paths`, `file_watch.max_files`
- Note: `process.*` settings are stored in-memory on reload, but running collectors are not rebuilt. Process filter/aggregation changes require agent restart
- `collectors.disabled`

**Non-reloadable settings** (logged as warning, requires restart):
- `api_key`
- `endpoint`
- `collection.*` intervals
- `transport.*`
- `buffer.*`

---

## Full Example

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: https://ingest.neoguard.io
cloud_detection: auto

extra_tags:
  environment: production
  team: platform
  datacenter: us-east-1

cpu:
  per_core: false
  per_core_frequency: false

collection:
  interval_seconds: 60
  process_interval_seconds: 30
  slow_interval_seconds: 120

transport:
  batch_max_size: 5000
  batch_max_interval_seconds: 10
  request_timeout_seconds: 30

buffer:
  memory_max_items: 100000
  wal_dir: /var/lib/neoguard/wal

collectors:
  disabled: []

disk:
  exclude_mounts: [/proc, /sys, /dev, /run, /snap]
  exclude_fstypes: [tmpfs, devtmpfs, squashfs, overlay]

network:
  exclude_interfaces: [lo, "docker*", "veth*", "br-*"]

process:
  top_n: 20
  ignore_patterns:
    - "^kworker/"
    - "^\\[.*\\]$"  # Kernel threads in brackets
  allow_regex: []
  deny_regex:
    - "^migration/"
  collect_cmdline: false
  aggregation:
    enabled: false
    rules: []
    # Example rules:
    # - pattern: "^python"
    #   aggregate_as: "python-pool"
    # - pattern: "^nginx: worker"
    #   aggregate_as: "nginx-workers"

saturation:
  window_size: 30

file_watch:
  paths:
    - /var/log/syslog
    - /var/log/nginx/error.log
  max_files: 50

logging:
  level: info
  format: json

health:
  enabled: true
  bind: "127.0.0.1:8282"
```

---

## Custom CA Bundle

The agent supports custom CA certificates for TLS connections to enterprise backends using internal PKI infrastructure.

### Configuration

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: https://backend.internal.example.com
ca_bundle_path: /etc/ssl/certs/internal-ca.pem
```

### Requirements

- **Absolute path required**: Must be an absolute path (e.g., `/etc/ssl/certs/ca.pem`). Relative paths are rejected at startup.
- **File must exist**: Agent validates file existence at startup. Missing file causes immediate exit.
- **Valid PEM format**: File must contain at least one valid PEM-encoded certificate block (`-----BEGIN CERTIFICATE-----`).
- **Multiple certificates supported**: Intermediate + root CA chains are fully supported (all certificates in the file are loaded).

### Trust Semantics

Custom CA certificates are **additive**, not replacement:

- When `ca_bundle_path` is **empty**: Agent uses the platform's default CA bundle (system trust store).
- When `ca_bundle_path` is **set**: Agent trusts **both** system CAs and the custom CA bundle.

This means setting a custom CA for internal endpoints does **not** break connections to public endpoints (e.g., AWS, Azure, public APIs).

### Validation Errors

Agent startup fails with actionable error messages:

```
ca_bundle_path: file not found: /path/to/cert.pem
ca_bundle_path: permission denied: /path/to/cert.pem
ca_bundle_path: file contains no valid PEM certificates
ca_bundle_path: must be absolute, got: ./ca.pem
ca_bundle_path: must be a file, got directory: /etc/ssl/certs
```

### Reload Behavior

`ca_bundle_path` is **not reloadable** via SIGHUP. Changes require agent restart.

### Example: Internal PKI

```yaml
api_key: obl_live_v2_abc123
endpoint: https://neoguard.internal.corp
ca_bundle_path: /etc/pki/tls/certs/corporate-ca-bundle.pem
```

### Example: TLS Inspection Proxy

```yaml
api_key: obl_live_v2_xyz789
endpoint: https://neoguard.io
ca_bundle_path: /usr/local/share/ca-certificates/proxy-ca.pem
```

The proxy's CA certificate is appended to system trust, allowing both proxied and direct HTTPS connections.

---

## Clock Skew Detection

The agent detects clock skew during registration by comparing the local system time with the backend server's `Date` HTTP header.

### Behavior

**Warning threshold (60 seconds):**
- If `|clock_skew| > 60s`, agent logs a structured warning and continues startup
- Warning log format:
  ```json
  {"level":"WARN","msg":"clock_skew_detected","skew_seconds":75.3,"threshold":60,"recommendation":"synchronize system clock with NTP"}
  ```
- Metric `agent.clock_skew_seconds` is emitted every collection cycle

**Strict threshold (300 seconds):**
- If `clock.strict_clock_check: true` AND `|clock_skew| > 300s`, agent refuses to start
- Exit code: **78** (EX_CONFIG from BSD sysexits.h, indicates configuration error)
- Error log format:
  ```json
  {"level":"ERROR","msg":"strict_clock_check_failed","error":"clock skew too large: 350.0s (threshold: 300s)"}
  ```
- Process terminates immediately after registration, before collectors start

**Default mode (strict_clock_check: false):**
- Agent starts regardless of clock skew magnitude
- Warnings are logged if |skew| > 60s, but no startup blocking occurs

### Configuration

```yaml
clock:
  strict_clock_check: false  # Default: allow startup with any clock skew
```

Enable strict mode in production environments with reliable NTP:

```yaml
clock:
  strict_clock_check: true   # Block startup if |skew| > 300s
```

### Remediation

When clock skew is detected:

1. **Check NTP status:**
   ```bash
   # systemd-timesyncd (Ubuntu/Debian)
   timedatectl status

   # ntpd (RHEL/CentOS)
   ntpq -p

   # chronyd (modern RHEL/Rocky)
   chronyc tracking
   ```

2. **Enable NTP if disabled:**
   ```bash
   sudo timedatectl set-ntp true
   ```

3. **Force immediate sync:**
   ```bash
   # systemd-timesyncd
   sudo systemctl restart systemd-timesyncd

   # ntpd
   sudo ntpd -gq

   # chronyd
   sudo chronyc makestep
   ```

4. **Restart agent after clock correction:**
   ```bash
   sudo systemctl restart neoguard-agent
   ```

### Exit Code Reference

| Code | Name | Meaning | Resolution |
|------|------|---------|------------|
| 78 | EX_CONFIG | Configuration error | Clock skew > 300s with strict mode enabled. Synchronize system clock and restart agent. |

### Impact of Clock Skew

Incorrect system time causes:
- **Metric timestamp corruption**: Charts show data at wrong times
- **Rate calculation errors**: Derivatives and rate() functions produce incorrect values
- **Alert timing issues**: Alerts may fire at wrong times or miss events
- **Log correlation failures**: Timestamps don't align with other systems

**Recommendation:** Enable NTP on all monitored hosts. Use `strict_clock_check: true` in production to catch clock misconfigurations at agent startup rather than discovering data corruption later.
