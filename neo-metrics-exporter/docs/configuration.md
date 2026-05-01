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
| `process.top_n` | int | `20` | Number of top processes to report |
| `process.allow_regex` | []string | `[]` | If set, only matching process names are reported |
| `process.deny_regex` | []string | `[]` | Matching process names are always excluded |

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
| `health.port` | int | `8282` | Listen port (binds to 127.0.0.1 only) |

Endpoints when enabled:
- `GET /health` — Liveness probe (always 200)
- `GET /ready` — Readiness probe (200 after first collection, 503 during startup/shutdown)
- `GET /status` — JSON stats (uptime, buffer, errors, goroutines, heap)
- `GET /metrics` — Prometheus exposition format (latest collected metrics)

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
- `process.top_n`, `process.allow_regex`, `process.deny_regex`
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
  allow_regex: []
  deny_regex:
    - "^kworker/"
    - "^migration/"

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
  port: 8282
```
