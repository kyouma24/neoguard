# NeoGuard Agent — Technical Execution Plan v2.1 (FINAL)

**Document version:** 2.1 — FINAL, FROZEN
**Audience:** Engineering executor (Claude or human)
**Scope:** Metrics + Logs only. Traces explicitly excluded from v1.
**Target outcome:** Production-ready agent + backend correlation UI in 18 weeks.
**Supersedes:** All prior execution plans (v1.0, v2.0). Do not reference.

---

## How to Use This Document

This is an execution plan, not a design exploration. Each phase has:

- **Entry criteria:** what must be true before starting
- **Deliverables:** concrete artifacts/code
- **Acceptance tests:** how we know it's done
- **Exit criteria:** what must be true to move to the next phase

**Rules for the executor:**

1. Do not skip ahead. Phases are ordered by dependency, not preference.
2. Do not add features not listed in this document. If you think something is missing, surface it as a question, do not implement it.
3. Every phase ends with running the full test suite. No phase is "done" with failing tests.
4. When a finding from `FINDINGS.md` is referenced (e.g., EXP-001), treat it as binding. Do not redefine the bug.
5. When this document conflicts with prior execution plans or strategy docs, this document wins.
6. If a deliverable is ambiguous, stop and ask before coding. Do not invent specs.
7. **Boundary conditions in Section 3 are binding spec, not aspirational.** Code that violates them is buggy regardless of test pass/fail.
8. **Section 5 (Non-Goals) is FROZEN.** Adding any non-goal item to v1 scope requires written approval from the project owner AND timeline re-baselining.

---

## Section 1: Architectural Constraints (Binding)

These are not negotiable. If a proposed implementation violates one, the implementation is wrong.

### 1.1 Language and Dependencies

- **Go 1.24+**, single static binary, `CGO_ENABLED=0`
- **Direct dependencies cap:** 6 maximum at end of v1. Currently 2 (`gopsutil/v4`, `yaml.v3`). Each new dep requires written justification in `docs/dependencies.md`.
- Permitted additions during v1:
  - `fsnotify` for file watching (Phase 4) — required, no stdlib equivalent.
  - `automaxprocs` for cgroup-aware GOMAXPROCS (Phase 0) — single-purpose, MIT.
  - One HTTP client lib only if `net/http` proves insufficient (it won't).
  - One regex lib only if stdlib `regexp` is too slow on hot paths (verify with benchmark first).
- **Forbidden:** any GPL, AGPL, or LGPL dependency. MIT, BSD, Apache-2.0 only.

### 1.2 Binary and Runtime Targets

| Constraint | v1 Target | Hard Limit |
|---|---|---|
| Binary size (stripped, static) | <12 MB | 15 MB |
| Memory steady state (200 metrics, no logs) | <40 MB | 60 MB |
| Memory steady state (200 metrics + 1000 log lines/sec) | <80 MB | 120 MB |
| Memory at 10k log lines/sec burst | <150 MB | 250 MB |
| CPU steady state (idle host) | <0.5% | 1.0% |
| CPU during collection cycle | <2% | 5% |
| Startup to first collection | <5 seconds | 10 seconds |
| Goroutines steady state | <20 | 40 |
| Goroutines under full load (logs + metrics) | <50 | 100 |

If a change pushes any metric above the v1 target, surface it. If it pushes above the hard limit, the change is rejected.

### 1.3 Data Integrity Invariants

These are correctness invariants. Code that violates them is buggy regardless of test pass/fail.

1. **WAL durability:** A successful WAL write means the data survives `kill -9` and process restart. Period. If you cannot uphold this, do not write to WAL.
2. **WAL framing:** Every WAL frame uses `[4-byte length][4-byte CRC32][payload]` format. Corrupted frames are detected and skipped, not propagated.
3. **WAL bounded:** WAL size never exceeds configured cap. Drop policy applies before disk fills.
4. **No silent drops:** Every dropped metric point or log line increments a counter that is itself emitted as a metric. The user must be able to alert on data loss.
5. **No partial batches:** A batch is either fully transmitted (HTTP 2xx) or fully retried/persisted. Partial success is not a thing.
6. **Tenant attribution is implicit via API key, never trusted from client input.** The agent never sets `tenant_id` in payloads it sends to the backend. The backend derives it from the API key.
7. **Identity is established before first transmission.** No metrics are sent until IMDS resolution (or fallback chain) completes per Section 3.2.
8. **Monotonic time for intervals.** All rate calculations and timeouts use `time.Since` (monotonic). Wall-clock time is used only for emitted timestamps.
9. **Logs separated from metrics.** Log buffers, transport, retry state, and dead-letter directories are independent of metrics. Backpressure on one MUST NOT block the other.
10. **Live data prioritized over replay.** During WAL replay after recovery, current collection cycle data is transmitted before historical data.
11. **Critical paths exempt from emergency shedding.** Heartbeat, agent self-metrics, and core collectors (CPU/memory/disk) are exempt from emergency mode shedding by policy. Emergency mode does NOT pause heartbeat, does NOT block transmission of agent self-metrics, does NOT halt core collectors.

### 1.4 Why Logs and Metrics Use Separate Pipelines

The architecture decision to separate logs and metrics is binding. Rationale:

1. **Volume profiles differ.** Metrics: predictable ~200/cycle. Logs: bursty, can be 100x larger payloads.
2. **Failure modes differ.** Log parser failures are common (malformed JSON); metric collector failures are rare and structural.
3. **Backpressure must be independent.** A log storm during an incident must not delay metric delivery — that's when metrics are most needed.
4. **Storage backends differ.** Metrics → TimescaleDB. Logs → ClickHouse. Different ingest characteristics.
5. **SLAs differ.** Metric loss during outage = correctness gap. Log loss during outage = forensics gap. Different acceptable tradeoffs.

Do not unify the pipelines. Do not share buffers. Do not retry one on the other's behalf.

### 1.5 Backward Compatibility

- This is v1. There is no backward compatibility burden yet.
- Once v1.0.0 ships, the wire format (JSON schema for metrics + logs) is frozen. Breaking changes require version negotiation per Section 2.5.
- Config file format: additions are non-breaking, removals/renames require deprecation cycle.
- WAL format includes schema version. Downgrade across schema versions is rejected at startup.

### 1.6 Platform Support Matrix

| Platform | v1 Status | Notes |
|---|---|---|
| linux/amd64 | **Full** | Primary dev target. All collectors, full test coverage. |
| linux/arm64 | **Full** | Build + test in CI. Verified on Graviton. |
| windows/amd64 | **Core only** | CPU, memory, disk, network, process, system, agentself. Linux-specific collectors stub out cleanly. |
| darwin/* | **Build only** | Compiles, runs, but not officially supported. For dev machines. |
| Everything else | **Not supported** | FreeBSD, 32-bit ARM, etc. — out of scope. |

### 1.7 Scaling Limits (Documented, Not Engineered Around)

Direct agent → backend architecture works to a point. Document the limit explicitly:

| Scale | Architecture | Status |
|---|---|---|
| 1-1,000 agents per backend | Direct push | v1 supported |
| 1,000-5,000 agents per backend | Direct push, requires backend horizontal scaling | v1 supported with caveats |
| 5,000-10,000 agents per backend | Direct push, requires connection pooling tuning | v1 boundary, expect issues |
| 10,000+ agents | Requires intermediate forwarder tier | **Not v1. Do not build.** |

When customer fleet approaches 5,000 agents, that's the trigger to design v2 forwarder tier. Not before.

---

## Section 2: Wire Protocol Specification

This section freezes the contract between agent and backend. Do not deviate.

### 2.1 Metrics Ingestion

**Endpoint:** `POST /api/v1/metrics/ingest`
**Auth:** `Authorization: Bearer <api_key>`
**Encoding:** `Content-Type: application/json`, `Content-Encoding: gzip` (mandatory for batches >1KB)
**Max payload:** 5 MB compressed, 50 MB uncompressed. Larger payloads must be split.

**Request body:**

```json
{
  "agent_id": "uuid-v4-stable-per-install",
  "agent_version": "1.0.0",
  "schema_version": 1,
  "metrics": [
    {
      "name": "system.cpu.usage_total_pct",
      "value": 42.7,
      "timestamp": "2026-05-15T14:32:15.123Z",
      "tags": {
        "hostname": "ip-10-0-1-23",
        "resource_id": "i-0abc123def",
        "agent_id": "uuid-v4",
        "cloud_provider": "aws",
        "region": "us-east-1",
        "availability_zone": "us-east-1a",
        "account_id": "123456789012",
        "instance_type": "c5.2xlarge",
        "os": "linux",
        "agent_version": "1.0.0"
      }
    }
  ]
}
```

**Constraints:**

- `agent_id` is a UUID generated on first run, persisted to `/agent_id`. Stable across restarts. Deterministic when possible (per Section 3.4).
- **`agent_id` is also included as a tag on every metric and log point.** This disambiguates duplicate `resource_id` cases per Section 3.4.
- `schema_version` is `1` for v1.0.x. See Section 2.5 for negotiation.
- `metrics` array: max 5000 entries per request.
- Metric name: `^[a-z][a-z0-9_.]{0,254}$`. Dots are namespace separators, underscores within segments.
- Tag key: `^[a-z][a-z0-9_]{0,63}$`. Tag value: max 256 chars, no control characters.
- `value` is float64 (numeric). Histograms (Phase 4+) use `{"count": int, "sum": float, "buckets": [...]}`.
- `timestamp` is RFC3339Nano UTC.

**Response:**

```json
// 200 OK
{"accepted": 5000, "rejected": 0}

// 200 OK with partial rejection
{"accepted": 4998, "rejected": 2, "errors": [{"index": 47, "reason": "metric name too long"}]}

// 401 Unauthorized — invalid API key
// 413 Payload Too Large
// 422 Unprocessable Entity — schema_version unsupported
// 429 Too Many Requests — MUST honor Retry-After
// 503 Service Unavailable — MUST retry with backoff
```

### 2.2 Logs Ingestion

**Endpoint:** `POST /api/v1/logs/ingest`
**Auth:** Same as metrics.
**Encoding:** Same as metrics.
**Max payload:** 5 MB compressed, 50 MB uncompressed.

**Request body:**

```json
{
  "agent_id": "uuid-v4-stable-per-install",
  "agent_version": "1.0.0",
  "schema_version": 1,
  "logs": [
    {
      "timestamp": "2026-05-15T14:32:15.123Z",
      "message": "GET /api/users 200 12ms",
      "level": "info",
      "service": "myapp",
      "source": "/var/log/app/access.log",
      "tags": {
        "hostname": "ip-10-0-1-23",
        "resource_id": "i-0abc123def",
        "agent_id": "uuid-v4",
        "cloud_provider": "aws"
      },
      "fields": {
        "method": "GET",
        "path": "/api/users",
        "status": 200,
        "duration_ms": 12
      }
    }
  ]
}
```

**Constraints:**

- `message` is the raw log line. Required. Max 64 KB. Lines longer are truncated; emitted with `truncated: true` in fields.
- `level` is one of: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `unknown`. Default `unknown` if not parsed.
- `service` is set from log source config. Required.
- `source` is the file path or input identifier. Required.
- `fields` is the parsed structured data when parser succeeds. Optional. Max 100 keys, values max 4 KB each.
- Same `tags` as metrics — base agent identity tags including `agent_id`.
- `logs` array: max 1000 entries per request.

**Response:** Same shape as metrics ingest.

### 2.3 Agent Lifecycle Endpoints

**`POST /api/v1/agents/register`** — called on agent start, idempotent.

```json
// Request
{
  "agent_id": "uuid",
  "agent_version": "1.0.0",
  "hostname": "ip-10-0-1-23",
  "cloud_provider": "aws",
  "resource_id": "i-0abc123def",
  "region": "us-east-1",
  "capabilities": {
    "metrics": true,
    "logs": false,
    "max_payload_bytes": 5242880,
    "compression": ["gzip"],
    "schema_versions": [1],
    "collectors": ["cpu", "memory", "disk", "diskio", "network", "system", "process", "netstat", "agentself"],
    "experimental": []
  },
  "config_hash": "sha256-of-active-config",
  "started_at": "2026-05-15T14:30:00Z",
  "supported_schema_versions": [1]
}

// Response 200
{
  "agent_id": "uuid",
  "registered": true,
  "server_schema_version": 1,
  "negotiated_schema_version": 1,
  "heartbeat_interval_seconds": 30
}
```

**`POST /api/v1/agents/heartbeat`** — called every `heartbeat_interval_seconds` (server-negotiated, 30s default).

```json
// Request
{
  "agent_id": "uuid",
  "timestamp": "2026-05-15T14:32:00Z",
  "metrics_sent_since_last": 1247,
  "logs_sent_since_last": 0,
  "buffer_utilization_pct": 12.3,
  "errors_since_last": 0,
  "clock_skew_seconds": 0.4,
  "self_protection_state": "normal",
  "degraded_reasons": []
}

// Response 200
{"ack": true}
```

`self_protection_state` is one of: `"normal"`, `"degraded"`, `"emergency"`.
`degraded_reasons` is a list including any of: `"memory_pressure"`, `"wal_pressure"`, `"backend_pressure"`, `"collector_failures"`.

**`POST /api/v1/agents/stopping`** — called on graceful shutdown, best-effort (5s timeout).

```json
{"agent_id": "uuid", "reason": "sigterm" | "sighup_reload" | "panic", "timestamp": "..."}
```

### 2.4 Retry Semantics and Adaptive Backpressure (Mandatory)

| Response | Action |
|---|---|
| 2xx | Success. Discard from buffer. Reset adaptive rate toward normal. |
| 4xx (except 429) | **Permanent failure.** Log loudly, drop batch, increment `agent.transport.batches_dropped_4xx`. Do not retry. |
| 429 | Honor `Retry-After` header. If absent, backoff per schedule below. Reduce send rate per adaptive backpressure. |
| 5xx | Retry per schedule. Reduce send rate per adaptive backpressure. |
| Network error / timeout | Retry per schedule. Track for adaptive backpressure. |

**Backoff schedule:** 1s, 2s, 4s, 8s, 16s, 30s (cap). Up to 6 attempts. After exhaustion: re-enqueue at front of buffer with `retry_count` incremented. After `retry_count >= 3` cycles of exhaustion: write to dead-letter file `/dead-letter//.jsonl.gz` and increment `agent.transport.batches_dead_lettered`.

**Logs and metrics dead-letter directories are separate:** `/dead-letter/metrics/` and `/dead-letter/logs/`.

**Adaptive backpressure config:**

```yaml
neoguard:
  transport:
    adaptive_backpressure:
      enabled: true
      window_seconds: 60
      reduce_send_rate_on_429_pct: 50    # halve rate on sustained 429
      reduce_send_rate_on_503_pct: 75    # quarter rate on sustained 503
      latency_p99_threshold_ms: 5000     # reduce rate if exceeded
      recovery_increase_pct_per_minute: 25
      min_send_rate_bps: 102400          # never below 100 KB/s
```

**Behavior:**

- Track 429/503/timeout responses in rolling window.
- If 429 ratio > 10%: reduce outbound rate by `reduce_send_rate_on_429_pct`.
- If 503 ratio > 5%: reduce by `reduce_send_rate_on_503_pct`.
- If response latency p99 exceeds threshold: same as 503.
- Every minute of clean responses: increase rate by `recovery_increase_pct_per_minute`.
- Never below `min_send_rate_bps` (preserves heartbeat + critical metrics).
- Emit `agent.transport.adaptive_rate_bps` gauge.

**Replay throttling and recovery:**

```yaml
neoguard:
  transport:
    max_replay_send_rate_bps: 1048576       # 1 MB/s during WAL replay
    max_replay_send_rate_batches_per_sec: 5
    recovery_jitter_seconds: 30
```

After detecting backend recovery (first 2xx after >5 consecutive failures), agent enters "recovery mode":
- Outbound rate capped at `max_replay_send_rate_bps`.
- On startup: jitter first transmission by random `[0, recovery_jitter_seconds]` seconds.
- Recovery mode exits after WAL fully drained AND in-memory buffer < 50% capacity.
- Emit `agent.transport.replay_mode_active` gauge, `agent.transport.replay_mode_duration_seconds` counter.

**Live-data priority:**

Transmission priority order (always enforced):
1. Heartbeats (always send first, never delay).
2. Live data from current collection cycle.
3. WAL replay (older data).
4. Dead-letter retries.

Implementation: two-channel transmitter. Each cycle drains live channel completely before pulling from replay. During recovery, dashboards see current data immediately; historical gap fills over following minutes.

### 2.5 Wire Protocol Version Negotiation

**Mechanism:**

1. Agent sends `supported_schema_versions: [1]` in `/agents/register`.
2. Backend responds with `negotiated_schema_version`: highest version both support.
3. Agent uses negotiated version on all subsequent ingest calls.
4. If no overlap: backend returns 422 with body `{"error": "no_compatible_schema", "agent_supports": [1], "server_supports": [2,3]}`. Agent logs critical error, refuses to start collection, exits with code 78 (config error).
5. **Backend MUST support N-1 for at least 6 months after Nv release.** Release commitment.

In v1 there is only `schema_version: 1`. Negotiation infrastructure exists for forward compatibility.

### 2.6 Future Wire Format Compatibility

JSON is the v1 wire format. Forward-compat plumbing:

1. Agent includes `Accept-Encoding: gzip` (already required).
2. **Agent additionally includes `Accept-Format: application/json` header.**
3. Backend MAY respond with `Content-Format: application/json` (or future formats).
4. v1.x agents MUST ignore unknown `Content-Format` values and treat as JSON.
5. v2+ agents MAY negotiate alternative formats if both support them.

**Internal serializer abstraction (Phase 0.12):** Codebase contains a `Serializer` interface:

```go
type Serializer interface {
    Marshal(batch *Batch) ([]byte, error)
    ContentType() string
}
```

v1 ships only `jsonSerializer`. The interface exists so v1.x can add codecs without rewriting transport.

### 2.7 Capability Negotiation

`capabilities` in registration declares what the agent can do:

```json
"capabilities": {
  "metrics": true,
  "logs": false,
  "max_payload_bytes": 5242880,
  "compression": ["gzip"],
  "schema_versions": [1],
  "collectors": ["cpu", "memory", "..."],
  "experimental": []
}
```

Backend uses this to:
- Know which features can be enabled per agent.
- Feature-gate UI elements (if `logs: false`, don't show logs tab for this agent).
- Plan future feature rollouts via `experimental` array.

In v1: `experimental: []` always empty. Reserved for future use.

---

## Section 3: Boundary Conditions (Binding Spec)

These are not edge cases or chaos test scenarios. They are normal operating conditions the agent must handle correctly.

### 3.1 Clock Skew and NTP Jumps

**Forward jump (clock advances suddenly, e.g., NTP correction +5 min):**
- Rate computers detect impossibly large delta-time. Skip the cycle and reset baseline.
- No metrics emitted for that cycle for rate-based collectors.
- Log: `"clock_jump_forward_detected: skipping rate calculation, delta=Xs"`.
- Emit `agent.clock.forward_jumps_total` counter.

**Backward jump (clock retreats):**
- Rate computers detect negative delta-time. Skip cycle and reset baseline.
- Outgoing batch timestamps floored at `last_emitted_timestamp + 1ms` to prevent ordering violations.
- Log: `"clock_jump_backward_detected: timestamps floored, delta=Xs"`.
- Emit `agent.clock.backward_jumps_total` counter.

**Initial skew detection (startup):**
- During registration, capture `Date` header from backend response.
- Compute `clock_skew_seconds = local_now - server_date`.
- If `|skew| > 60s`: log warning, emit `agent.clock_skew_seconds` gauge on every cycle.
- If `|skew| > 300s` AND config has `strict_clock_check: true`: refuse to start, exit code 78.
- Default `strict_clock_check: false`.

**Implementation:** All interval-based logic uses `time.Since(monotonic_start)`. `time.Now()` is used only for emitted timestamps.

### 3.2 Identity Resolution Fallback Chain

**Resolution order:**

1. **AWS IMDSv2** (`http://169.254.169.254/latest/meta-data/instance-id`) with token, 2s timeout.
   - On success: `resource_id = <instance-id>`, `cloud_provider = "aws"`.
2. **Azure IMDS** (`http://169.254.169.254/metadata/instance?api-version=2021-02-01`) with `Metadata: true` header, 2s timeout.
   - On success: `resource_id = <vmId>`, `cloud_provider = "azure"`.
3. **systemd machine-id** — read `/etc/machine-id` or `/var/lib/dbus/machine-id`. If present: `resource_id = "host-<machine-id>"`, `cloud_provider = "on-prem"`.
4. **Hostname fallback** (last resort) — `resource_id = "host-<hostname>"`, `cloud_provider = "unknown"`. Log warning: `"identity_fallback_to_hostname: instability risk"`.

**Persistence:** After resolution, write `/identity.json`:
```json
{"resource_id": "...", "cloud_provider": "...", "resolved_via": "aws-imds", "resolved_at": "..."}
```

On next start: read persisted identity. Re-run resolution. If matches: use. If differs: log `"identity_changed: was=X now=Y"`, prefer new value, but keep old `agent_id`.

**Boot sequence with identity resolution:**

1. Agent starts.
2. Collectors start collecting into a "pending" buffer (max 500 points, drops oldest if exceeded). Counter: `agent.boot.pending_dropped`.
3. In parallel: identity resolution runs. Hard timeout: 30 seconds (sum of all fallback attempts).
4. When identity resolves: tag pending buffer with identity, register with backend, start normal transmission.
5. If identity fails after 30s: use hostname fallback, register, log warning, continue.

**No metrics are sent until registration succeeds.** Pending buffer is drained on first successful transmission.

### 3.3 Container Awareness

**Required behavior:**

1. At startup, use `automaxprocs` library to set GOMAXPROCS from cgroup limits.
2. Detect container runtime (cgroup v1 or v2). Read CPU and memory limits.
3. Emit `agent.container.detected{runtime="docker|containerd|lxc|none"}` gauge.
4. When reporting CPU and memory metrics: report **container limits** as `system.cpu.limit_cores` and `system.memory.limit_bytes` if running in a container.
5. Process collector uses container-relative PIDs when in a PID namespace.

**Cgroup v1 vs v2:** Detect at startup. Support both paths.

### 3.4 Duplicate `resource_id` Handling

**`agent_id` derivation order:**

1. If `/agent_id` exists: use it.
2. Else if cloud identity resolved: `agent_id = uuidv5(namespace_neoguard, ":")`. Deterministic.
3. Else: random UUIDv4. Log: `"agent_id_random: not deterministic, reinstalls will create new identity"`.

**Backend behavior on duplicate `resource_id`:**

When new agent registers with `(tenant_id, resource_id)` matching existing active agent but different `agent_id`:
- Mark old agent: `status = 'replaced'`, `replaced_at = NOW()`, `replaced_by_agent_id = `.
- Create new agent record normally.
- Both agents visible in UI history; only new one is active for the resource.

**Every metric and log point is tagged with `agent_id`.** Queries can disambiguate. Default UI views filter to active agent only.

### 3.5 File Tailing Edge Cases (Phase 4)

**Rotation scenarios — all must work correctly:**

1. **`move/create` rotation** (default logrotate): old file renamed, new file created at original path.
   - Agent reads to EOF on old file (via held fd), then switches to new file.
2. **`copytruncate` rotation**: file content copied to backup, original truncated to size 0.
   - Agent detects size-decrease. Resets read offset to 0.
   - Some lines may be missed during copy window. Documented limitation.
3. **Symlink rotation**: agent watches symlink that gets re-pointed.
   - Re-resolves symlink on every fsnotify event.
   - If target inode changes: switch to new target, start at offset 0.
4. **Temporary file disappears**: glob match deleted mid-tail.
   - Read remaining buffered data. Close fd. Remove from active tailers.
5. **Filesystem unmounted**: read returns I/O error.
   - Log error, mark source as failed, retry every 60s.

**Inode tracking:** state file `/logs-checkpoint.json` records `(path, inode, offset, size)`.

### 3.6 Memory Pressure and Buffer Behavior

**Metrics buffer:**
- Ring buffer, in-memory, capped at `metrics.buffer.max_lines` (default 100,000).
- When full and transmission failing: drop oldest, increment `agent.metrics.buffer_drops`.
- WAL writes happen on every batch flush attempt, regardless of transmission outcome.

**Logs buffer:**
- In-memory ring + disk spool.
- When in-memory is 80% full: spill to disk.
- When disk cap hit: drop oldest spool files.
- Backpressure to file tailers: when buffer is 95% full, slow read rate (sleep 100ms between reads). Never block indefinitely.

**Composition with self-protection:** Memory self-protection (Phase 0.13) and adaptive backpressure (Section 2.4) compose naturally — sustained backend pressure causes memory to fill, which triggers self-protection. Do not couple them directly; let memory be the signal of truth.

### 3.7 WAL Size Boundaries

**Configuration:**

```yaml
neoguard:
  wal:
    enabled: true
    dir: /var/lib/neoguard/wal
    max_size_mb: 1024              # hard cap, default 1 GB
    drop_policy: "oldest_first"    # oldest_first | logs_first | metrics_first
    high_watermark_pct: 80
    critical_watermark_pct: 95
```

**Behavior:**

- WAL writer checks size before each append.
- At `high_watermark_pct`: emit `agent.wal.pressure_warning` gauge, log warning every 60s.
- At `critical_watermark_pct`: apply drop policy:
  - **`oldest_first`** (default): truncate oldest WAL segments to free 25% of cap.
  - **`logs_first`**: drop log entries from WAL preferentially, keep metrics.
  - **`metrics_first`**: drop metric entries preferentially.
- After drop: emit `agent.wal.dropped_bytes_total{reason}` counter.
- At cap: refuse new writes, emit `agent.wal.write_rejections_total`. Data lost in-memory only (no disk corruption).

Same policy applies to logs spool directory (`max_disk_mb`).

---

## Section 4: Phase Plan

Each phase has hard entry criteria. Do not start a phase if entry criteria are unmet.

---

## PHASE 0 — Correctness Foundation

**Duration:** 3 weeks
**Entry criteria:** Existing v0.2 codebase compiles and tests pass. Section 10 questions answered.
**Goal:** Fix data integrity bugs AND establish boundary condition handling AND build self-protection infrastructure before building anything new.

### Phase 0 Sub-Task Tiers

**P0-A (ship blocker — must complete before Phase 1 begins):**
- 0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.10, 0.13, 0.14

**P0-B (production hardening — must complete before v1.0.0 release):**
- 0.4, 0.8, 0.9, 0.11, 0.15

**P1 (post-beta acceptable — can ship in v1.0.x patch):**
- 0.12

**Sequencing rule:**
- Phase 1 may begin when all P0-A tasks merge.
- v1.0.0 release requires all P0-A + P0-B complete.
- P1 items may slip to v1.0.1 with explicit decision.

### 0.1 Fix WAL Compaction + Add Framing + Size Limits + Versioning [P0-A]

**Problem:** `compactWAL()` opens a temp file and closes it without writing the ring contents. WAL has no frame format or corruption detection. WAL has no size cap.

**Required fix:**

**WAL frame format:**
```
[4-byte length BE] [4-byte CRC32 of payload] [payload bytes]
```

**WAL header (first 16 bytes of file):**
```
[magic "NGWAL\0\0\0"] [4-byte schema_version] [4-byte reserved]
```

**Reader behavior:**
- On length read failure: EOF, normal end.
- On CRC mismatch: log corruption, skip frame, continue. Emit `agent.wal.frames_corrupted` counter.
- On length-but-no-payload: partial write detected, truncate WAL at last good frame.
- On startup: verify magic, verify schema_version. If newer than binary supports: refuse start, exit code 78. If older: legacy reader (none in v1).
- On unreadable header: rename WAL to `.corrupted-`, start fresh, log warning.

**Compaction:**
- During compaction, iterate the in-memory ring buffer and write each pending batch to the temp WAL file before atomic rename.
- Use `fsync` on temp file before rename. Use `fsync` on parent directory after rename.
- On any write or fsync failure: abort rename, log error, do not corrupt original WAL.

**Size limits:** Implement per Section 3.7.

**Acceptance test (mandatory):**

Write `internal/buffer/wal_crash_test.go`:

```go
// Test 1: kill -9 during compaction must not lose data.
// Test 2: corrupted CRC frame is skipped, surrounding frames recovered.
// Test 3: WAL grows past max_size_mb, drop policy applies.
// Test 4: WAL with newer schema_version causes startup failure.
// Test 5: WAL with corrupted header is renamed and replaced.
```

All must run in CI on every PR.

### 0.2 Fix Retry Exhaustion Data Loss [P0-A]

**Required fix:**

1. After retry exhaustion, re-enqueue failed batch at **front** of ring buffer with `retry_count++`.
2. After `retry_count >= 3`, write batch to dead-letter file `/dead-letter/metrics/.jsonl.gz`.
3. Emit `agent.transport.retries_exhausted` counter.
4. Emit `agent.transport.batches_dead_lettered` counter.
5. On startup, scan dead-letter directory and emit `agent.transport.dead_letter_files` gauge.

**Acceptance test:** Mock HTTP server returns 503 for first N requests, then 200. Verify points not lost during outage, batch delivered after recovery, counters correct.

### 0.3 Move `process_cmdline` to Opt-In [P0-A]

**Required fix:**

1. Default config: `process.collect_cmdline: false`.
2. When false: tag omitted from process metrics entirely.
3. When true: truncated to 128 chars and SHA256 hashed if matches `[0-9a-f]{8,}` (UUIDs/hashes) or `\d{10,}` (timestamps).
4. Document in `docs/cardinality.md`.

### 0.4 Configurable Health Bind Address [P0-B]

```yaml
health:
  enabled: true
  bind: "127.0.0.1:8282"  # default. Containerized deployments set "0.0.0.0:8282"
```

Validate bind address at config load.

### 0.5 Pre-warm Rate Computers [P0-A]

At agent startup, after identity resolution but before first user-visible collection cycle:
1. Run hidden "warm-up" pass on all rate-based collectors. Discard results.
2. Warm-up populates rate computer's "previous sample" state.
3. First user-visible collection produces correct rates.

### 0.6 Identity Resolution Fallback Chain [P0-A]

Implement per Section 3.2 in `internal/identity/resolver.go`:

- Each provider as separate function.
- Each provider 2s individual timeout. Total resolution capped at 30s.
- `/identity.json` persistence with re-validation on startup.
- Deterministic `agent_id` derivation when identity is stable.
- Tests using mock HTTP servers for each cloud provider.

### 0.7 Clock Skew Detection and Handling [P0-A]

Implement per Section 3.1:

1. Capture backend `Date` header during registration. Emit `agent.clock_skew_seconds` gauge.
2. Forward/backward jump detection in rate computers.
3. Outgoing timestamp flooring on backward jumps.
4. `strict_clock_check` config option (default false).

**Acceptance test:** Use libfaketime or runtime time injection to simulate clock jumps.

### 0.8 Container-Aware GOMAXPROCS [P0-B]

Per Section 3.3:

1. Add `automaxprocs` dependency. Document in `docs/dependencies.md`.
2. Detect cgroup v1 vs v2 at startup.
3. Emit container limits as metrics.
4. Validate goroutine count stays within container limits during load tests.

### 0.9 Custom CA Bundle Support [P0-B]

```yaml
neoguard:
  tls:
    ca_bundle: /etc/neoguard/ca.pem
    insecure_skip_verify: false
    cert_pinning_sha256: []
```

- If `ca_bundle` set: read file, append to system cert pool.
- If `insecure_skip_verify: true` AND not in dev mode: log warning every 5 minutes.
- If `cert_pinning_sha256` non-empty: verify peer cert SHA256 matches. Fail TLS handshake on mismatch.

### 0.10 Collector Supervision and Isolation [P0-A]

**Required behavior:**

```
Each collector wrapped in panic-recover:
  - Panic → log, mark collector "degraded", skip cycle.
  - 3 consecutive timeouts → mark "degraded" for 5 minutes (skip entirely).
  - 3 consecutive panics → mark "disabled" until restart.

Per-collector watchdog timeout: 30s default, configurable per collector.

Emit agent.collector.state{name, state="healthy|degraded|disabled"} gauge.
Emit agent.collector.degraded_count gauge.
Emit agent.collector.disabled_count gauge.

Health endpoint /healthz reflects aggregate:
  - healthy if ≥80% collectors healthy
  - degraded if 50-80% healthy
  - critical if <50% healthy

Heartbeat goroutine runs in own goroutine separate from collection loop.
A hung collector cannot stall heartbeat or transport.
```

### 0.11 Health Score Hard Caps [P0-B]

**Required behavior:**

```
Health score with hard caps:
  - Compute weighted base score (existing logic).
  - Apply hard caps:
    - disk usage >95% on any mount → score = min(score, 40)
    - memory pressure >90% → score = min(score, 50)
    - load avg > 4× CPU count → score = min(score, 50)
    - swap usage >50% with low free memory → score = min(score, 40)
  - Emit agent.health.cap_applied{reason} counter when cap fires.
  - Publish individual sub-scores alongside composite.
```

Composite is summary; sub-scores are truth.

### 0.12 Serializer Interface Abstraction [P1]

```go
type Serializer interface {
    Marshal(batch *Batch) ([]byte, error)
    ContentType() string
}
```

v1 ships only `jsonSerializer{}`. Interface exists for v1.x to add codecs without rewriting transport.

### 0.13 Memory Self-Protection Mode [P0-A]

```yaml
neoguard:
  self_protection:
    enabled: true
    memory_soft_limit_mb: 100
    memory_hard_limit_mb: 200
    check_interval_seconds: 5
```

**Critical path exemptions (behavioral guarantee, not pre-allocation):**

Emergency mode shedding does NOT affect:
- Heartbeat goroutine (continues transmitting)
- Agent self-metrics (CPU/memory/disk/agent.* collectors)
- Transmission of collected metrics to backend

Protection is by policy (exempt from shedding actions), not by memory pre-allocation.
Pre-allocating unused bytes does not reserve heap capacity in a GC runtime.

**Behavior tiers:**

**Normal mode:** Everything runs as configured.

**Degraded mode** (soft limit hit):
- Stop accepting new log lines (file tailers pause reads).
- Disable derived metrics calculation.
- Force GC.
- Continue: metric collection, transmission, heartbeat.
- Emit `agent.self_protection.degraded{since}` gauge.
- Heartbeat reports `self_protection_state: "degraded"`, `degraded_reasons: ["memory_pressure"]`.

**Emergency mode** (hard limit hit):
- Drop oldest 50% of in-memory log buffer.
- Drop in-memory metric buffer entries that have been WAL-persisted.
- Force GC.
- Emit `agent.self_protection.emergency_drops_total` counter.
- Log critical event.
- Heartbeat reports `self_protection_state: "emergency"`.

**Critical paths never affected.** Heartbeat, core collectors, and transmission continue even in emergency mode. This is a behavioral guarantee enforced by the action handler — emergency shedding only drops buffered data, never pauses active collection or transmission.

**Recovery:** Exit degraded mode when memory < soft_limit × 0.8 for 60 seconds.

### 0.14 Replay Throttling + Recovery Jitter + Live-Data Priority + Adaptive Backpressure [P0-A]

Implement per Section 2.4:

- Two-channel transmitter (live + replay).
- Priority order: heartbeats → live → replay → dead-letter.
- Replay rate-limited per `max_replay_send_rate_bps`.
- Recovery jitter on startup.
- Adaptive backpressure based on 429/503/latency.
- All metrics from Section 2.4 emitted.

### 0.15 Internal Pressure Metrics [P0-B]

Add to existing `agentself` collector:

| Metric | Purpose |
|---|---|
| `agent.wal.size_bytes` | Detect unbounded growth |
| `agent.wal.frames_total` | Total frames in WAL |
| `agent.wal.replay_lag_seconds` | How far behind real-time replay is |
| `agent.transport.retry_backlog_age_seconds` | Oldest item in retry queue |
| `agent.spool.size_bytes` | Logs spool directory size |
| `agent.spool.oldest_file_age_seconds` | Age of oldest spool file |
| `agent.collectors.degraded_count` | Collectors currently degraded |
| `agent.collectors.disabled_count` | Collectors disabled |
| `agent.transport.adaptive_rate_bps` | Current adaptive send rate |
| `agent.transport.replay_mode_active` | 1 if in replay mode |

### 0.16 Exit Criteria for Phase 0

- All P0-A tasks merged. All P0-B tasks merged before release. P1 may slip.
- `make test` passes including new chaos tests (WAL crash, identity fallback, clock jump, memory protection).
- `make bench` shows no regression (>5%) in collection cycle latency.
- Manual smoke test: install on a Linux host, run for 1 hour, verify no data gaps in first cycle, verify counters work.
- Manual smoke test: install in Docker container with `--cpus=2` on host with 16 cores, verify GOMAXPROCS=2.
- Manual smoke test: simulate clock jump with `date -s`, verify recovery.
- Manual smoke test: induce memory pressure with `stress`, verify self-protection activates.

---

## PHASE 1 — Backend Agent Registry

**Duration:** 2 weeks
**Entry criteria:** Phase 0 P0-A complete. P0-B may parallelize with this phase.
**Goal:** Backend understands what agents exist, when they last checked in, what they're capable of.

### 1.1 Database Schema

Create migration `alembic/versions/00X_agent_registry.py`:

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id_external UUID NOT NULL,
    resource_id TEXT NOT NULL,
    hostname TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    cloud_provider TEXT,
    region TEXT,
    capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    config_hash TEXT,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_started_at TIMESTAMPTZ,
    last_stopped_at TIMESTAMPTZ,
    last_stop_reason TEXT,
    replaced_at TIMESTAMPTZ,
    replaced_by_agent_id UUID,
    self_protection_state TEXT NOT NULL DEFAULT 'normal'
        CHECK (self_protection_state IN ('normal', 'degraded', 'emergency')),
    degraded_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'degraded', 'stale', 'stopped', 'crashed', 'replaced')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (tenant_id, agent_id_external)
);

CREATE INDEX idx_agents_tenant_last_seen ON agents (tenant_id, last_seen DESC);
CREATE INDEX idx_agents_tenant_resource ON agents (tenant_id, resource_id) WHERE status IN ('active', 'degraded');
CREATE INDEX idx_agents_status ON agents (status) WHERE status NOT IN ('active', 'degraded');

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
CREATE POLICY agents_tenant_isolation ON agents
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE agent_heartbeats (
    agent_pk UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics_sent_since_last INT,
    logs_sent_since_last INT,
    buffer_utilization_pct REAL,
    errors_since_last INT,
    clock_skew_seconds REAL,
    self_protection_state TEXT,
    degraded_reasons JSONB,
    PRIMARY KEY (agent_pk, received_at)
);

SELECT create_hypertable('agent_heartbeats', 'received_at',
    chunk_time_interval => INTERVAL '1 day');

ALTER TABLE agent_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_heartbeats FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_heartbeats_tenant_isolation ON agent_heartbeats
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

SELECT add_retention_policy('agent_heartbeats', INTERVAL '30 days');
```

### 1.2 Backend Endpoints

Create `api/routes/agents.py`. Follow patterns from `routes/dashboards.py`.

**`POST /api/v1/agents/register`** (no scope requirement; valid API key only):

- Upsert by `(tenant_id, agent_id_external)`.
- On insert: `first_seen = NOW()`, `last_started_at = NOW()`, `status = 'active'`.
- On update: `last_started_at = NOW()`, `last_seen = NOW()`, `status = 'active'`. If previous `status IN ('stopped', 'crashed')`, log "agent restarted" audit event.
- **Duplicate resource_id handling per Section 3.4.**
- Negotiate schema_version per Section 2.5.
- Return 200 with negotiated schema and heartbeat interval.

**`POST /api/v1/agents/heartbeat`**:

- Look up agent by `(tenant_id, agent_id_external)`. Return 404 if not registered.
- Update `last_seen = NOW()`.
- Set `status = 'degraded'` if `self_protection_state IN ('degraded', 'emergency')`, else `status = 'active'`.
- Update `self_protection_state` and `degraded_reasons` from request.
- Insert row into `agent_heartbeats`.
- Return 200.

**`POST /api/v1/agents/stopping`**:

- Update `last_stopped_at = NOW()`, `status = 'stopped'`, `last_stop_reason = `.

**`GET /api/v1/agents`** — list endpoint:

- Query params: `status`, `cloud_provider`, `limit`, `offset` (parameterized per DASH-010).
- Default filter: `status IN ('active', 'degraded', 'stale', 'crashed')`.
- Super admin: requires explicit `?tenant_id=X` per NOTIF-005 pattern.

**`GET /api/v1/agents/{id}`**:

- Returns agent + last 100 heartbeats.

### 1.3 Stale Detection Background Job

Create `services/agents/reaper.py`:

- Runs every 30s.
- For each tenant, find agents where `last_seen < NOW() - 90 seconds AND status IN ('active', 'degraded')`. Set `status = 'stale'`.
- Find agents where `last_seen < NOW() - 5 minutes AND status IN ('active', 'degraded', 'stale') AND last_stopped_at IS NULL`. Set `status = 'crashed'`.
- Emit metric `neoguard.agents.status_transitions{from, to}`.

Wire into existing background task system.

### 1.4 Agent-Side Lifecycle Implementation

1. Generate `agent_id` per Section 3.4.
2. On startup, after identity resolution: call `/api/v1/agents/register`. Retry with backoff if fails. Do not start collection until registration succeeds.
3. Start heartbeat goroutine: every `heartbeat_interval_seconds`, send heartbeat. Track stats since last heartbeat (metrics_sent, logs_sent, errors, clock_skew, self_protection_state).
4. Register signal handlers:
   - `SIGTERM`/`SIGINT`: send `/agents/stopping` with `reason: "sigterm"`, then graceful shutdown.
   - Panic recovery: in main, recover and send `stopping` with `reason: "panic"` before exiting non-zero.

### 1.5 Configurable Heartbeat Interval

```yaml
neoguard:
  heartbeat_interval_seconds: 30  # min 10, max 300, default 30
```

- Agent sends desired interval in registration.
- Server may override (returned in `negotiated heartbeat_interval_seconds`).
- Reaper thresholds: stale = 3 × interval, crashed = 10 × interval.

### 1.6 Minimal UI

Create `frontend/src/pages/AgentsPage.tsx` and route `/agents`:

- Table: hostname, resource_id, agent_version, status (with color), cloud_provider, region, last_seen, capabilities (badges).
- Filter by status, cloud provider.
- Click row → agent detail page with heartbeat history chart.

**Status color coding:**
- `active`: green
- `degraded`: orange (NEW state for self-protection mode)
- `stale`: yellow
- `crashed`: red
- `replaced`: blue
- `none` (no agent installed): gray

On resource detail page, add "Agent" sidebar/badge:

- If agent registered: show status, version, last seen.
- If multiple agents have same `resource_id` (history): show active prominently, list replaced in expandable history.
- If degraded: show `degraded_reasons` array.
- If not registered: show "No agent installed" with link to install docs.

### 1.7 Acceptance Tests

**Backend:**
- `test_agent_registry.py`: register, heartbeat, stopping, list, detail. Tenant isolation. Reaper transitions. Duplicate resource_id triggers replacement. Self-protection state updates correctly.

**Agent (integration):**
- Start agent against mock backend. Verify register call. Verify heartbeats. Send SIGTERM, verify stopping call.
- Reinstall on same host: verify deterministic agent_id, old agent marked replaced.
- Trigger memory pressure: verify heartbeat reports `self_protection_state: "degraded"`.

**End-to-end:**
- Real agent + real backend in docker-compose.
- Killing agent → status = crashed within 5 min.

### 1.8 Exit Criteria

- `/agents` page lists running agents in real time.
- Resource detail page shows agent status badge with degraded state.
- Killing agent results in `status = crashed` within 5 minutes.
- Graceful shutdown results in `status = stopped` within 1 second.
- Tenant isolation verified.
- Duplicate resource_id correctly transitions old agent to `replaced`.
- Degraded state visible in UI within 30s of agent reporting it.

---

## PHASE 2 — Metrics Polish and Operational Tooling

**Duration:** 2 weeks
**Entry criteria:** Phase 1 complete. Phase 0 P0-B complete or in flight.
**Goal:** Operational tooling and remaining metrics fixes.

### 2.1 CLI Operational Modes

**`neoguard-agent run --collect-once --output=stdout`:**
- Run identity resolution.
- Run one collection cycle of all enabled collectors.
- Marshal to JSON, write to stdout.
- Exit 0 on success, 1 on any collector error.
- Do not start transport, do not register with backend.

**`neoguard-agent run --dry-run`:**
- Run normally but never POST to backend.
- Log every batch that would have been sent.

**`neoguard-agent validate --config `:**
- Parse YAML.
- Validate all fields.
- Verify env var expansion succeeds.
- Verify file paths exist.
- Verify regex patterns compile.
- Exit 0 if valid, 1 if any error. Print errors with file:line.

### 2.2 Configuration Reloading

Define in `internal/config/reloadable.go`:

```go
var ReloadableFields = []string{
    "extra_tags",
    "logs.processing",
    "logs.sources",
    "filters.metrics.include",
    "filters.metrics.exclude",
    "filters.tags.drop",
    "filters.tags.rename",
    "process.collect_cmdline",
    "process.top_n",
    "process.aggregation",
    "logging.level",
    "collectors.disabled",
    "neoguard.api_key_file",
}
```

On SIGHUP:
1. Parse new config file.
2. Compute diff against active config.
3. If any diff is in non-reloadable field: log error, keep old values, do not partially apply.
4. If all diffs reloadable: apply atomically.
5. Update `config_hash` sent on next heartbeat.

### 2.3 Secrets Handling

```yaml
neoguard:
  # Mutually exclusive options:
  api_key: "..."                                          # plaintext (discouraged)
  api_key_file: /run/secrets/neoguard_api_key             # file
  api_key_command: ["/usr/local/bin/vault", "read", ...]  # subprocess
  api_key_command_timeout_seconds: 10
  api_key_command_max_output_bytes: 4096
  api_key_command_refresh_interval_seconds: 3600
```

**`api_key_file` rules:**
- File must be 0400 or 0440 on Linux. Reject if more permissive.
- On SIGHUP: re-read.

**`api_key_command` rules (security-critical):**
- MUST be a list (argv form). Strings rejected at parse time.
- First element must be absolute path. No PATH lookup.
- First element must exist, be executable, owned by root, mode <= 0755 on Linux.
- Use `exec.CommandContext(ctx, argv[0], argv[1:]...)`. **Never `sh -c`.**
- Subprocess environment is minimal:
  ```go
  cmd.Env = []string{
      "PATH=/usr/local/bin:/usr/bin:/bin",
      "HOME=" + homedir,
      "LANG=C.UTF-8",
  }
  ```
  Do NOT pass `os.Environ()`.
- Capture stdout up to `max_output_bytes`. Excess truncated with error.
- Capture stderr separately, log on non-zero exit, do not include in key.
- Hard timeout via context.
- On any failure: log clearly, do not start agent (fail closed).
- Refresh on `api_key_command_refresh_interval_seconds` schedule.

### 2.4 Metric Filtering

```yaml
filters:
  metrics:
    include:
      - "system.*"
      - "process.*"
    exclude:
      - "system.cpu.usage_pct"
```

Semantics:
- Empty include: all metrics included.
- Non-empty include: only matching pass.
- Then exclude removes from included set.
- Glob patterns, case-sensitive.
- Filtered before buffering. Counter: `agent.metrics.filtered_total{reason="exclude"|"not_included"}`.

### 2.5 Tag Rewriting

```yaml
filters:
  tags:
    drop: ["process_cmdline", "container_id_full"]
    rename:
      hostname: host
      resource_id: instance_id
```

Drop runs before rename. Applied per metric point.

### 2.6 Process PID Cache + Aggregation

**Cache:**
1. `processCache map[int32]*ProcessInfo` keyed by PID, with last-seen timestamp.
2. Each cycle:
   - List all PIDs (cheap).
   - For cached PIDs: re-fetch only CPU%, memory, IO.
   - For new PIDs: full enrichment.
   - Evict stale.
3. Cache cap: 10,000 entries.
4. Metric: `agent.process_collector.cache_size`.

**Aggregation:**

```yaml
process:
  collect_cmdline: false
  top_n: 20
  aggregation:
    enabled: true
    rules:
      - pattern: "^python.*"
        aggregate_as: "python"
      - pattern: "^node.*"
        aggregate_as: "node"
      - pattern: "^kube-job-.*"
        aggregate_as: "kube-jobs"
  ignore_patterns:
    - "^kworker/"
    - "^$$"
```

**Hard ceiling (not configurable):**
- After applying aggregation rules: if output has >100 process groups, keep top 100 by CPU, collapse rest to `process_group=other`.
- Emit `agent.process.aggregation_overflow_total` counter.

### 2.7 Parallel Disk Collection

1. Collect partitions list (cheap).
2. For each partition, run `disk.Usage(path)` in separate goroutine with 5s timeout (configurable: `collectors.disk.per_mount_timeout`).
3. Goroutines that timeout are cancelled. Counter: `agent.disk_collector.mount_timeout{mount=}`.
4. Failed partitions emit `system.disk.collection_failed{mount=}=1`.

### 2.8 Local /metrics Endpoint (Prometheus Exposition)

```yaml
metrics_endpoint:
  enabled: true
  bind: "127.0.0.1:9100"
  path: "/metrics"
```

- Expose all collected metrics in Prometheus exposition format.
- No authentication (binds localhost by default).
- Updates served from last collection cycle (do not trigger collection on scrape).
- Counter: `agent.metrics_endpoint.scrapes_total`.

### 2.9 Acceptance Tests

- `--collect-once` produces valid JSON to stdout in <2 seconds.
- `--validate-config` rejects malformed configs with file:line errors.
- SIGHUP with reloadable change applies. With non-reloadable change: rejected, no partial apply.
- API key file rotation: write new key, SIGHUP, verify next request uses new key.
- API key command: malicious input (`api_key_command: "bash"`) rejected at parse time.
- API key command: subprocess with restricted env, no `os.Environ()` leakage.
- Filter test: include + exclude works correctly.
- Process cache: 500 process system, second cycle <50% time of first.
- Process aggregation: 200 python processes collapse to 1 group + overflow counter.
- NFS hang simulation: only that mount times out.
- `curl localhost:9100/metrics` returns valid Prometheus exposition.

### 2.10 Exit Criteria

- All operational CLI modes work, documented in `docs/cli.md`.
- Config reload behavior documented in `docs/config-reload.md`.
- Process collector ≥50% faster on 500-process system after first cycle.
- Process aggregation hard ceiling enforced.
- Disk collector unaffected by hung mount.
- Prometheus scrape verified end-to-end.
- API key command fully sandboxed and tested.

---

## PHASE 3 — Logs Backend Hardening

**Duration:** 2 weeks
**Entry criteria:** Phases 0–2 complete. Backend has ClickHouse log store (verify before starting).
**Goal:** Backend log ingest path production-grade BEFORE agent ships logs.

This phase is **all backend work**.

### 3.1 Audit Existing Log Store

Produce written audit at `docs/logs-backend-audit.md` answering:

1. Where does ClickHouse log ingestion live?
2. Current schema?
3. HTTP ingest endpoint? Path, auth, rate limiting?
4. Tenant isolation? How tested?
5. Query API? UI? Linked to what page?
6. Retention policy? Index strategy?
7. Failure modes (CH down, slow, partition)?
8. Integration tests?

Any "no" or "unclear" answer = Phase 3 task.

### 3.2 Required Schema

```sql
CREATE TABLE logs (
    timestamp DateTime64(3, 'UTC') CODEC(Delta, ZSTD(3)),
    tenant_id UUID,
    agent_id UUID,
    resource_id LowCardinality(String),
    hostname LowCardinality(String),
    service LowCardinality(String),
    source String,
    level LowCardinality(String),
    message String CODEC(ZSTD(3)),
    fields String CODEC(ZSTD(3)),
    tags Map(LowCardinality(String), String),
    cloud_provider LowCardinality(String),
    region LowCardinality(String),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY (tenant_id, toYYYYMMDD(timestamp))
ORDER BY (tenant_id, resource_id, service, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY DELETE
SETTINGS index_granularity = 8192;

ALTER TABLE logs ADD INDEX idx_message message TYPE tokenbf_v1(8192, 3, 0) GRANULARITY 4;
ALTER TABLE logs ADD INDEX idx_level level TYPE set(10) GRANULARITY 4;
```

### 3.3 Ingest Endpoint Hardening

Create or harden `POST /api/v1/logs/ingest`:

1. Auth via API key (same middleware as metrics).
2. Rate limit per-tenant: default 10,000 logs/sec. 429 with Retry-After.
3. Body size validation (50 MB uncompressed cap).
4. Schema validation per Section 2.2.
5. Tenant_id derived from API key.
6. Batch insert into ClickHouse using `async_insert = 1`.
7. On ClickHouse unavailable: return 503 immediately. Do not buffer in backend memory.
8. Metrics: ingest rate, p50/p95/p99 latency, validation rejections, CH errors.

### 3.4 Backend Ingest Hardening (Both Endpoints)

Apply to both `/api/v1/metrics/ingest` and `/api/v1/logs/ingest`:

- Per-tenant rate limit (sliding window).
- Concurrent connection limit per agent_id (max 2).
- Body size enforcement at edge before parsing.
- Async DB insert (don't hold connection during write).
- Circuit breaker: if DB write latency p99 > 5s for 30s, return 503 to all ingest.

### 3.5 Query API

`GET /api/v1/logs`:

```
Query params:
  resource_id: filter (required for non-admin queries)
  service: filter
  level: filter (can repeat)
  start: RFC3339 (required)
  end: RFC3339 (required, max 7 day range)
  q: full-text search query
  limit: max 1000, default 100
  cursor: opaque pagination token
```

Returns:
```json
{
  "logs": [...],
  "next_cursor": "...",
  "total_estimate": 12473,
  "took_ms": 47,
  "truncated": false
}
```

Constraints:
- Max 7-day time range.
- Tenant filter ALWAYS injected from auth.
- Query timeout 10s server-side. Return partial with `truncated: true` if exceeded.
- `q` through tokenbf index. No regex from user input.
- Cursor pagination using `(timestamp, agent_id)`.

### 3.6 Log Search UI

Create `frontend/src/pages/LogsPage.tsx`:

- Time range picker (default last 15 min).
- Filters: service (multi-select), level (checkbox), resource_id (autocomplete from agents).
- Search box for `q`.
- Result list: timestamp, level (color-coded), service, message (expandable for fields).
- Live tail mode: auto-refresh every 5s.
- "Show in context" button: jump to ±30s window.

### 3.7 Acceptance Tests

- Ingest 100k logs, query by service: <500 ms p95.
- Malformed `level`: 422 with field error.
- Cross-tenant query: tenant A cannot see tenant B's logs.
- ClickHouse down: ingest returns 503.
- 7-day range: succeeds. 8-day: 400 error.
- 50 simulated agents concurrent: p99 < 1s.

### 3.8 Exit Criteria

- `docs/logs-backend-audit.md` complete.
- Schema migration applied if needed.
- Endpoints live, tested, documented.
- Logs UI renders, can search and filter.
- Load test: 10k logs/sec for 1 hour, no memory growth, query latency stable.

---

## PHASE 4 — Logs Agent Implementation

**Duration:** 2.5 weeks
**Entry criteria:** Phase 3 complete.
**Goal:** Agent tails files, parses, ships logs to backend.

### 4.1 Phase 4 Abort Criteria

**This phase has explicit abort gates.** If any of these fail at the end of acceptance testing:

- Memory under 1000 logs/sec sustained exceeds 120 MB hard limit: STOP.
- Memory under 10k logs/sec burst exceeds 250 MB hard limit: STOP.
- Processing pipeline throughput < 30,000 lines/sec single-core: STOP.

**On STOP:** defer Phase 4 to v1.1, ship metrics-only v1.0. Do not absorb performance failures by relaxing targets. Document the failure mode for future redesign.

### 4.2 v1 Logs Scope (Constrained)

**Included in v1.0:**
- File tail + checkpoint (inode tracking)
- Plaintext parser
- JSON parser
- Multiline aggregation (with safety caps)
- Include/exclude filters (regex)
- Mask rules (regex substitution)
- Tail sampling (level-aware)
- Glob patterns
- Rotation handling
- Buffer + spool

**Excluded from v1.0 (deferred to v1.1):**
- logfmt parser
- PII preset library (users write own masks)
- Log-derived metrics (counter/histogram from log patterns)

This is binding scope reduction. Do not add deferred items.

### 4.3 Configuration Schema

```yaml
logs:
  enabled: true
  endpoint: ${NEOGUARD_LOG_ENDPOINT:-https://ingest.neoguard.io/api/v1/logs/ingest}
  buffer:
    max_memory_lines: 50000
    max_disk_mb: 500
    spool_dir: /var/lib/neoguard/logs-spool
    drop_policy: "oldest_first"   # oldest_first | newest_first
  transport:
    batch_max_lines: 1000
    batch_max_bytes: 1048576
    flush_interval_seconds: 2
    timeout_seconds: 30
  sampling:
    enabled: false
    keep_levels: ["error", "warn", "fatal"]
    sample_rate_above_threshold: 0.1
  rate_limit:
    max_lines_per_second: 10000
    on_exceed: "sample"            # sample | drop_oldest | block
  sources:
    - path: /var/log/syslog
      service: system
      source_name: syslog
      parser: plain                # plain | json (logfmt deferred to v1.1)
      level_field: ""
      message_field: "message"
      timestamp_field: "timestamp"
      timestamp_format: ""
      multiline:
        enabled: false
        start_pattern: '^\d{4}-\d{2}-\d{2}'
        max_lines: 500             # hard cap
        max_bytes: 65536           # 64 KB hard cap per event
        timeout_ms: 1000
        # end_pattern: NOT SUPPORTED in v1
        # nested: NOT SUPPORTED in v1
        # transforms: NOT SUPPORTED in v1
    - path: /var/log/nginx/access.log
      service: nginx
      source_name: access
      parser: plain
    - path: "/var/log/app/*.log"
      service: myapp
      source_name: application
      parser: json
      level_field: level
      message_field: msg
      timestamp_field: ts
  processing:
    - type: include
      pattern: "level=(error|warn)"
      apply_to: "message"
    - type: exclude
      pattern: "GET /healthz"
      apply_to: "message"
    - type: mask
      pattern: '(?i)(password|secret|token|api[_-]?key)["\s:=]+([^\s"]+)'
      replacement: '$1=[REDACTED]'
      apply_to: "message"
```

Reject configs with unsupported keys (e.g., `end_pattern`, `nested`, `derived_metrics`) at parse time with explicit error.

### 4.4 File Tailer

In `internal/logs/tailer/`:

1. Use `fsnotify` for inotify/ReadDirectoryChangesW.
2. Glob patterns. Re-evaluate every 30s.
3. Track `(inode, offset, size)` per file in `/logs-checkpoint.json`. Persist every 5s and on shutdown.
4. Resume from checkpoint per Section 3.5.
5. Handle all rotation scenarios per Section 3.5.
6. Bounded read: max 64 KB per line. Truncated lines emit with `truncated=true`.
7. Per-file goroutine, all funnel into single channel.

### 4.5 Parsers

**`plain`:** entire line is `message`. `level = "unknown"`. Timestamp = file read time.

**`json`:**
- Parse line as JSON.
- Extract `message_field` → `message` (default `"message"`, fallback to entire JSON if missing).
- Extract `level_field` → `level`, normalized.
- Extract `timestamp_field` → parse as RFC3339 or `timestamp_format`. Fallback to file read time on parse failure.
- All other top-level keys → `fields` map.
- Nested objects: serialize as JSON string. Do not flatten.

Parser failures: emit line with `parser_error=true` field, original line as `message`. Counter: `agent.logs.parse_errors{source=...}`.

### 4.6 Multiline Aggregation

In `internal/logs/multiline/`:

1. Line matching `start_pattern` opens new event.
2. Subsequent lines appended until:
   - Another `start_pattern` match.
   - `max_lines` reached (truncate).
   - `max_bytes` reached (truncate).
   - `timeout_ms` since last line elapsed.
   - File EOF.
3. Closed events go through pipeline.
4. Memory cap per source: 256 KB.

### 4.7 Processing Pipeline

In `internal/logs/processing/`:

Order per log event:
1. Apply `include` rules. Drop if any include rules exist and none match.
2. Apply `exclude` rules. Drop on match.
3. Apply `mask` rules in order.
4. Apply tag enrichment.
5. Apply tail sampling per Section 4.8.
6. Hand off to buffer.

Performance: regex patterns compiled at config load. Pipeline throughput must exceed 30,000 lines/sec on single core.

### 4.8 Tail Sampling

When `sampling.enabled: true` AND log rate exceeds `rate_limit.max_lines_per_second`:

1. Logs with level in `keep_levels` are always kept.
2. Other logs sampled at `sample_rate_above_threshold`.
3. Sampling deterministic per-source: `keep = hash(message + timestamp) < threshold`.
4. Counters: `agent.logs.sampled_total{kept|dropped}`.
5. Gauge: `agent.logs.sample_rate_active{source=...}`.

### 4.9 Buffer + Spool

In `internal/logs/buffer/`:

1. In-memory ring: `max_memory_lines` capacity.
2. At 80% full: spill to disk (gzipped JSONL files, 1 MB each).
3. Transport recovery: drain spool first (oldest), then ring.
4. Hard cap: `max_disk_mb`. Drop policy applied per Section 3.7.
5. Recovery on startup: scan spool_dir, queue all files.
6. Backpressure: at 95% full, slow tailer reads (sleep 100ms between reads).

### 4.10 Transport

Reuse metrics transport pattern with:
- Separate endpoint: `/api/v1/logs/ingest`.
- Separate retry state.
- Separate dead-letter directory: `/dead-letter/logs/`.
- Same retry semantics as metrics (Section 2.4).
- Same adaptive backpressure.

### 4.11 Acceptance Tests

- Tail file, write 1000 lines, verify all delivered.
- Move/create rotation: no lines lost.
- Copytruncate rotation: no duplicates beyond documented copy window.
- Glob picks up new files within 60s.
- JSON parser: malformed line emits parser_error=true.
- Multiline: 3-line stack trace coalesces, 600-line stack trace truncated at max_lines.
- Multiline: end_pattern in config rejected at parse time.
- Mask rule: `password=hunter2` → `password=[REDACTED]`.
- Backpressure: backend down 5 min, agent spools, no loss after recovery.
- Disk cap: spool_dir limited to 100MB, sustained outage drops oldest.
- Restart mid-flight: kill -9, restart, verify all checkpointed lines delivered.
- Sampling: 50k logs/sec mixed levels, all errors kept, info ~10%.
- High burst: 100k lines/sec for 60s, memory stays under 250 MB hard limit.
- **Performance gate:** processing pipeline ≥ 30,000 lines/sec single-core.

### 4.12 Exit Criteria

- All Phase 4.1 abort criteria passed (no STOP triggered).
- Agent tails 5 files concurrently, ships reliably.
- Backend received logs match what was written (within documented duplicate window).
- Memory: <80 MB at 1000 lines/sec, <150 MB at 10k/sec burst.
- Capability flag in registration: `capabilities.logs = true`.

---

## PHASE 5 — Correlation UI

**Duration:** 2 weeks
**Entry criteria:** Phases 0–4 complete.
**Goal:** Single pane of glass for cloud + OS + logs per resource.

### 5.1 Resource Detail Page Restructure

Locate existing resource detail page. Restructure to three-tab layout:

```
[Resource: i-0abc123def] (c5.2xlarge, us-east-1a) [Agent: Active v1.0.0, 8s ago]
─────────────────────────────────────────────────────────────────────────────
Tabs:
  [Cloud Metrics]  [OS Metrics]  [Logs]
─────────────────────────────────────────────────────────────────────────────
```

Each tab independently functional. Shared time range picker at top.

### 5.2 Cloud Metrics Tab

Existing functionality. Adjustments:
- Use shared time range picker.
- Agent status badge in header.
- "View OS metrics for same range" button → switches tab, preserves time range.

### 5.3 OS Metrics Tab

Predefined dashboard layout:

- Row 1: CPU (total + per-mode), Load avg
- Row 2: Memory (used/available), Swap
- Row 3: Disk usage per mount, Disk IO per device
- Row 4: Network per interface, TCP states
- Row 5: Top processes by CPU, Top by memory
- Row 6: Health score (composite + sub-scores), Saturation projections

All panels filtered by `resource_id = ` AND `agent_id = `.

If no agent registered: empty state with install instructions.

### 5.4 Logs Tab

Embedded log viewer:
- Filters: level (multi), service (multi from this resource's logs).
- Search box.
- Result list with virtualized scrolling.
- "Live tail" toggle.
- Time range from shared picker.

Backed by `/api/v1/logs?resource_id=&start=...&end=...`.

### 5.5 Crosshair Synchronization

When user hovers chart in OS Metrics tab:
1. Existing crosshair shows on all charts in tab.
2. Crosshair time published to shared store.
3. "View logs at this time" button on each chart. Click → switches to Logs tab pre-filtered to ±30s window.
4. If Cloud Metrics tab showing alongside (split view): same crosshair across all tabs.

For v1: simple "View logs at this time" button. Multi-pane synchronized crosshair deferred.

### 5.6 Alert Event → Logs Link

On alert event detail pages, add "View logs around this time":
- Pre-filters by `resource_id` from alert tags.
- Time range: ±5 min from `fired_at`.
- Service filter: any service that emitted logs with that resource_id in window.

### 5.7 Agent Status Integration

Wherever a resource is shown, augment with agent status indicator:
- Active: green dot
- Degraded: orange dot, tooltip with `degraded_reasons`
- Stale: yellow dot, tooltip with last_seen
- Crashed: red dot, "Last heartbeat X min ago"
- Replaced: blue dot, "Replaced by agent X at "
- None: gray dot, "No agent installed"

### 5.8 Acceptance Tests

- Resource detail page loads <1s with all three tabs.
- Click between tabs preserves time range.
- "View logs at this time" jumps to correct window.
- Alert event → logs link shows correct resource and time.
- Agent status badge updates within 30s of state change.
- Degraded agent shown with reasons.
- Resource with replaced agent shows history.

### 5.9 Exit Criteria

- Resource detail page is canonical "everything about one server" view.
- User can answer "what was happening on i-0abc at 14:32" in <30 seconds.
- No regressions in existing dashboard / alert pages.

---

## PHASE 6 — Distribution and Hardening

**Duration:** 2 weeks
**Entry criteria:** Phases 0–5 complete.
**Goal:** Make agent installable and updatable in real environments.

### 6.1 CI/CD Pipeline

`.github/workflows/release.yml`:

```yaml
on:
  push:
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - go test -race ./...
      - go test -bench=. ./...
      - golangci-lint run
      - gosec ./...

  build:
    needs: test
    strategy:
      matrix:
        include:
          - { os: linux, arch: amd64 }
          - { os: linux, arch: arm64 }
          - { os: windows, arch: amd64 }
    steps:
      - go build with version metadata
      - sha256sum

  package:
    needs: build
    steps:
      - nfpm pack .deb (linux/amd64, linux/arm64)
      - nfpm pack .rpm (linux/amd64, linux/arm64)
      - msi build (windows/amd64) using wix
      - docker buildx build --platform linux/amd64,linux/arm64
      - cosign sign all artifacts

  release:
    needs: package
    steps:
      - GitHub release with all artifacts + checksums.txt + checksums.txt.sig
      - Push to Docker registry (ghcr.io)
      - Update curl install script
```

### 6.2 Installation Script

Create `install.sh` at `https://get.neoguard.io/install.sh`:

```bash
#!/bin/sh
# Usage: curl -fsSL https://get.neoguard.io/install.sh | sh -s -- --api-key=KEY --endpoint=URL
```

Script:
1. Detect OS (linux/darwin) and arch (amd64/arm64).
2. Detect init system (systemd/openrc/none).
3. Download matching .deb/.rpm/.tgz.
4. Verify checksum.
5. Verify cosign signature (if cosign present).
6. Install.
7. Write minimal config to `/etc/neoguard/agent.yaml` from flags.
8. Enable + start service.
9. Wait 30s for first metric, print success/failure.

Refuses to install if:
- Agent already installed.
- Required dependencies missing.
- API key flag missing.

### 6.3 [REMOVED — K8s descoped from v1]

Kubernetes DaemonSet, Helm chart, downward API, pod metadata enrichment are all v1 non-goals.
Distribution targets: .deb, .rpm, .msi, Docker image (for containerized servers, not K8s orchestration).

### 6.4 Documentation

Required in `docs/`:

| File | Content |
|---|---|
| `getting-started.md` | 5-min path: install → see metrics in UI |
| `configuration.md` | Every config field, default, example |
| `metrics-catalog.md` | Every metric emitted, units, tags, platform |
| `log-collection.md` | Sources, parsers, masking |
| `troubleshooting.md` | Common issues |
| `architecture.md` | How agent works internally |
| `security.md` | Threat model, what agent can/can't access |
| `compliance.md` | Compliance posture per Section 6.7 |
| `cli.md` | All CLI commands and flags |
| `containers.md` | Running agent in Docker on servers (not K8s orchestration) |
| `upgrading.md` | Version upgrade procedures |
| `dependencies.md` | Direct deps, justification, license |
| `scaling.md` | Documented scaling limits per Section 1.7 |
| `cardinality.md` | Cardinality control patterns |

Each doc has "Last updated" date and "Verified on version" header.

### 6.5 Chaos Tests

`test/chaos/`:

- `network_partition_test.sh`: drop egress 5 min, verify no loss after recovery.
- `disk_full_test.sh`: fill /var, verify no crash, backpressure metrics emitted.
- `oom_test.sh`: limit cgroup memory to 50 MB, verify self-protection activates.
- `crash_recovery_test.sh`: kill -9 during heavy load, <1s recovery, data integrity.
- `clock_skew_test.sh`: jump backward 5 min, verify recovery.
- `clock_jump_forward_test.sh`: jump forward 1 hour, rate computers reset.
- `nfs_hang_test.sh`: hang NFS mount, only that mount times out.
- `log_burst_test.sh`: 100k logs/sec for 60s, memory stays under hard limit.
- `wal_corruption_test.sh`: corrupt WAL frames, verify skip + recovery.
- `wal_size_limit_test.sh`: fill WAL past cap, verify drop policy.
- `replay_storm_test.sh`: 100 agents reconnecting after outage, no backend collapse.

Run nightly in CI.

### 6.6 Performance Regression Suite

`test/perf/`:

Track across releases. Fail CI on >10% regression:

- Collection cycle latency (p50, p99) on 100/500/1000 process system.
- Memory steady state (200 metrics, no logs).
- Memory steady state (200 metrics + 1000 logs/sec).
- Memory under burst (200 metrics + 10k logs/sec).
- CPU steady state.
- Startup time.
- Binary size.
- Goroutine count.
- Log processing throughput (lines/sec/core).

Baselines in `test/perf/baselines.json`, updated only by explicit commit.

### 6.7 Compliance Posture Documentation

`docs/compliance.md`:

Document explicitly:

1. Data agent can read: `/proc`, `/sys`, configured log files.
2. Data agent transmits: OS metrics, configured log files, agent self-metrics.
3. Data NOT transmitted: file contents outside configured paths, env vars, command-line args (unless `process.collect_cmdline: true`).
4. Data at rest: WAL files in `` may contain PII. Disk encryption is customer responsibility.
5. PII handling: masking is opt-in. Defaults documented. Customer responsible for mask configuration.
6. Audit log: agent-side audit log of "what was sent" not provided. Log at backend.
7. Data residency: agent ships to configured endpoint. Customer chooses backend region.
8. Retention: agent buffers up to `max_disk_mb` locally. Default 500 MB.
9. Encryption in transit: TLS 1.2+ enforced. Custom CA bundle supported. Cert pinning available.

Descriptive, not prescriptive.

### 6.8 Acceptance Tests

- `curl ... | sh` install on Ubuntu 22.04, Debian 12, Amazon Linux 2023, RHEL 9, Windows Server 2022 → all succeed, metrics in <60s.
- Docker container on bare server produces metrics (agent treats container like a tiny server).
- Cosign verification works for binary, .deb, .rpm, Docker image.
- All chaos tests pass.
- Performance regression suite clean.

### 6.9 Exit Criteria

- Tagged release `v1.0.0-rc1` installable via every distribution channel.
- Documentation site complete and accurate.
- Performance baselines locked.
- Internal demo: install on fresh server, see metrics + logs in UI in <60s.

---

## PHASE 6.5 — Soak Testing and Stability

**Duration:** 1 week
**Entry criteria:** Phase 6 complete. v1.0.0-rc1 tagged.
**Goal:** Validate long-running correctness before declaring v1.0.0 stable.

### 6.5.1 24-Hour Soak Test (Mandatory, CI Nightly)

Setup:
- 1 agent, default config + logs enabled.
- Sustained load: 200 metrics/cycle, 1000 logs/sec.
- Capture pprof heap, goroutine, CPU profiles every hour.

Pass criteria:
- Memory at hour 24 within 10% of memory at hour 1.
- Goroutine count at hour 24 ≤ goroutine count at hour 1 + 5.
- No panics, no fatal errors.
- Backend received metrics: continuous, no gaps >2 minutes.
- Backend received logs: 0% loss accounting for documented sampling.

### 6.5.2 7-Day Soak Test (Pre-Release Gate)

Setup:
- 5 agents on different hosts (mix cloud providers, container/baremetal).
- Realistic workload: idle most of time, simulated incident bursts every 6 hours.
- Run 7 consecutive days.

Pass criteria:
- All instances running at end.
- No memory leak (heap stable across days).
- Backend agent registry shows all 5 active throughout.
- WAL replay tested: kill -9 one instance every 24h, verify recovery.
- Custom CA rotation tested mid-test.
- API key rotation tested mid-test.

Run before tagging v1.0.0 (not v1.0.0-rc).

### 6.5.3 Resource Leak Audit

Manual review with pprof comparison:

- Heap diff hour 0 vs hour 24. Investigate >5% growth.
- Goroutine inventory: every goroutine traceable.
- File descriptor count stable.
- Audit:
  - Rate computer eviction
  - Process cache eviction
  - File tailer fd cleanup
  - Retry queue draining
  - Multiline aggregator (events closed on timeout)
  - HTTP client connection pooling

### 6.5.4 Throughput Stress Test

Validate documented throughput targets:

- **Small server profile:** 100 metrics/cycle, 50 logs/sec sustained. Memory <40 MB, CPU <0.5%.
- **Medium server profile:** 300 metrics/cycle, 500 logs/sec sustained. Memory <60 MB, CPU <1%.
- **Large server profile:** 500 metrics/cycle, 5000 logs/sec sustained. Memory <120 MB, CPU <2%.
- **Burst:** 10k logs/sec for 60s. Memory <250 MB peak, recovers within 5 min.
- **Extreme burst:** 100k logs/sec for 10s. Sampling activates, no OOM, no crash.

Document results in `docs/performance.md`. These are published claims, not internal numbers.

### 6.5.5 Exit Criteria

- 24-hour soak passes in CI.
- 7-day soak passes (run once, results documented).
- Resource leak audit clean.
- Throughput targets validated and documented.
- v1.0.0 (no -rc) tag created.

---

## Section 5: v1 Non-Goals (FROZEN)

This list is FROZEN until v1.0.0 ships. Adding any item to v1 scope requires written approval from the project owner AND a re-baselining of the timeline. Do not silently absorb scope.

Items on this list may move to v1.x post-launch based on customer signal, not internal opinion. Do not implement preemptively.

**The following are explicitly out of scope for v1.0.0:**

### Receivers and Ingestion (Out)
- StatsD receiver
- OTLP receiver (metrics, logs, traces — all of it)
- Prometheus remote_write receiver
- Syslog receiver (UDP/TCP)
- HTTP push endpoint (other agents pushing to this agent)

### Pipeline Features (Out)
- Custom pipelines / transforms / processors
- Embedded scripting (Lua, Starlark, JavaScript)
- Plugin SDKs (Go plugin, WASM, dlopen)
- Enrichment pipelines (GeoIP, DNS lookup, regex extract beyond derived metrics)
- Multiple output destinations
- Conditional routing
- logfmt parser (deferred to v1.1)
- PII preset library (deferred to v1.1)
- Log-derived metrics (deferred to v1.1)

### Application Integrations (Out)
- nginx integration
- PostgreSQL integration
- Redis integration
- Docker integration
- MySQL/MariaDB integration
- Any other application integration

### Distributed Telemetry (Out)
- Distributed tracing (OTLP traces, Jaeger, Zipkin — never)
- Profiling (continuous CPU/memory profiling)
- Application performance monitoring (APM)
- Real user monitoring (RUM)

### Smart Features (Out)
- Anomaly detection
- Adaptive collection intervals
- Delta-only transmission
- Auto-baseline establishment
- Fleet fingerprinting
- Predictive alerting
- Dependency mapping (service graph from netstat)
- Auto-discovery of services (port → integration suggestion)

### Operations and Management (Out)
- Auto-update mechanism (binary self-update)
- Remote configuration push (server → agent config)
- Per-agent enrollment tokens (shared API key per fleet is v1; document the limit)
- Forwarder/aggregator tier (direct push only in v1; document scaling limit)
- Helm chart
- Agent-to-agent mesh / leader election
- Kubernetes DaemonSet
- K8s downward API identity resolution (`NEOGUARD_K8S_POD_UID` env var)
- K8s pod metadata enrichment
- Any K8s-aware collector behavior

### Platform Features (Out)
- macOS as supported platform (build only, no SLA)
- FreeBSD support
- 32-bit ARM support
- Windows Performance Counters (.NET CLR, IIS, SQL Server, Hyper-V)
- GPU metrics (NVIDIA NVML, AMD ROCm)
- eBPF network visibility
- GCP cloud identity resolution
- GCE collectors
- Any GCP-specific behavior

### Security and Compliance (Out)
- mTLS transport (one-way TLS with optional cert pinning is in v1)
- Hardware security module (HSM) integration
- SOC2/HIPAA/PCI compliance certification (compliance posture documented in v1, certification deferred)
- Native Vault/AWS Secrets Manager/Azure Key Vault integration (api_key_command escape hatch covers this)
- Agent-side audit log of transmitted data

### Wire Format (Out)
- MessagePack/Protobuf wire format (negotiation infrastructure exists, payloads are JSON in v1)
- Binary frame protocol
- gRPC transport

If any of these become customer-blocking, that's a v1.x discussion. In v1, they don't exist.

---

## Section 6: Definition of Done for v1.0.0

A release is `v1.0.0` when:

1. **All 7 phases (0 through 6.5) are complete and merged.**
2. **All acceptance tests pass in CI.**
3. **Performance metrics meet v1 targets** (Section 1.2).
4. **No P0 or P1 findings** open against the agent codebase.
5. **Documentation is complete** (Section 6.4 of Phase 6).
6. **Internal demo passes:** fresh Ubuntu server → curl install → metrics + logs visible in UI within 60 seconds.
7. **Internal pilot:** at least 3 pilot customers running v1 for ≥7 days with no critical incidents.
8. **Release artifacts signed:** binaries, packages, container images all cosign-signed.
9. **Changelog written:** `CHANGELOG.md` with every user-visible change.
10. **Soak tests passed:** 24-hour and 7-day soak both green.
11. **Phase 4 abort criteria not triggered:** logs feature ships at v1 quality, OR explicitly deferred to v1.1 with documented reason.

---

## Section 7: How to Work Within This Plan

For the executor:

1. **Always read the entry criteria before starting a phase.** If unmet, stop and report.
2. **Always verify the exit criteria before marking a phase complete.** Self-check, then ask for review.
3. **Implement in the order specified within a phase.** Sub-tasks have implicit dependencies.
4. **Respect the P0-A / P0-B / P1 tiering in Phase 0.** P0-A blocks Phase 1. P0-B blocks v1.0.0 release. P1 may slip.
5. **Write tests first, or at least concurrently.** No code merges without tests for new behavior.
6. **Reference the FINDINGS.md severity discipline.** P0/P1 in the codebase = block release.
7. **When in doubt, surface the question.** Do not silently invent specs.
8. **Match existing codebase patterns.** If the backend uses asyncpg with explicit columns (per SEC-011), new agent endpoints do too. If frontend uses Zustand stores reset on tenant switch (per FE-009), agent UI does too.
9. **Every commit message references the phase and section.** `Phase 2.6: implement process PID cache and aggregation`.
10. **At end of each phase, update `CHANGELOG.md` and `PHASE_TRACKER.md`.**
11. **Do not mark a phase complete with TODO comments in shipped code.** TODOs get resolved or filed as issues before merge.
12. **Boundary conditions in Section 3 are spec, not aspirational.** If you can't make them work, the implementation is wrong, not the spec.
13. **Memory and CPU targets in Section 1.2 are gates.** Failing performance regression CI blocks merge.
14. **Section 5 (Non-Goals) is FROZEN.** Do not add features from the non-goals list, even if they seem easy.

---

## Section 8: Quick Reference — Phase Summary

| Phase | Duration | Focus | Critical Outputs |
|---|---|---|---|
| 0 | 3 wk | Correctness foundation | WAL framing+sizing, retry safety, identity, clock, container, CA bundle, collector isolation, memory protection, replay throttling, adaptive backpressure |
| 1 | 2 wk | Backend agent registry | `/agents` endpoint + UI, lifecycle events, duplicate handling, degraded state |
| 2 | 2 wk | Metrics polish | CLI tools, config reload, filtering, /metrics endpoint, process aggregation, api_key_command sandboxing |
| 3 | 2 wk | Backend logs hardening | Schema, ingest, query API, search UI, ingest hardening |
| 4 | 2.5 wk | Agent log shipping | Tailer, parsers (plain+json), multiline (capped), masking, sampling |
| 5 | 2 wk | Correlation UI | Three-tab resource view, crosshair sync, agent status integration |
| 6 | 2 wk | Distribution | CI/CD, installer, Docker, docs, compliance posture |
| 6.5 | 1 wk | Soak testing | 24h + 7-day stability validation |
| **Total** | **18 wk** | | **v1.0.0 release** |

---

## Section 9: Failure Modes and Escalation

This document is binding, but it is not omniscient. The executor will encounter situations the plan did not anticipate. Handle them as follows:

### 9.1 Spec Conflicts

If two sections conflict (e.g., Section 1.2 memory limit vs Phase 4 acceptance test):

1. Stop work.
2. Document the conflict in writing: which sections, what they say, what the implementer believes is correct.
3. Surface to the human reviewer.
4. Do not pick a side and continue.

### 9.2 Spec Gaps

If the document does not specify behavior for a real situation (e.g., what happens if WAL directory is on read-only filesystem):

1. Document the gap.
2. Propose three options with tradeoffs.
3. Surface to reviewer.
4. Do not invent a spec and ship it.

### 9.3 Spec Errors

If the document specifies something technically wrong (e.g., a regex that doesn't compile, a Go API that doesn't exist):

1. Document the error.
2. Propose a correction.
3. Surface to reviewer.
4. Do not silently work around it.

### 9.4 Schedule Slippage

If a phase is going to take significantly longer than estimated:

1. Stop and assess at 50% mark of estimated duration.
2. If on track: continue.
3. If 25%+ behind: report immediately, do not absorb the slip silently.
4. Phases may be re-estimated, never silently extended.

### 9.5 Test Failures After Merge

If a test passes locally but fails in CI, or fails intermittently:

1. Do not retry-merge.
2. Investigate root cause.
3. Flaky tests are bugs. Fix or skip with explicit `t.Skip("documented reason")`.
4. Never disable a test to make CI green.

### 9.6 Phase 4 Abort

If Phase 4 acceptance tests fail performance gates:

1. Do not relax the targets.
2. Document the failure mode in detail.
3. Propose v1.1 architectural change.
4. Ship v1.0 metrics-only.
5. Surface to reviewer for go/no-go on metrics-only release.

---

## Section 10: Open Questions for the Executor

Before starting Phase 0, the executor MUST answer the following questions in writing. If any answer is unclear, stop and ask before coding.

1. **Where is the v0.2 codebase?** Path on disk or repository URL.
2. **What is the current state of `<state_dir>`?** Default path on Linux, Windows. Permissions. Created by installer or by agent on first run?
3. **Where does the backend currently run in dev?** localhost:8000? docker-compose? Both?
4. **Are there existing FINDINGS.md entries for the agent specifically?** EXP-001 through EXP-018 are referenced — confirm they exist in the canonical findings doc.
5. **What is the current `/api/v1/metrics/ingest` schema on the backend?** Confirm Section 2.1 matches reality. If backend currently expects different fields, that's a Phase 0 task: align them.
6. **Does the backend currently accept `agent_id` in metric tags?** If not, Phase 0 includes a backend migration to allow it.
7. **What ClickHouse instance is available?** Required for Phase 3. If none, Phase 3 cannot start.
8. **What is the existing resource detail page route?** Phase 5 modifies it. Locate before Phase 5.
9. **Are there pilot customers identified for the v1 release gate?** Definition of Done item 7 requires 3 pilots. Surface before Phase 6.
10. **Who reviews phase exits?** Self-review allowed for sub-tasks; phase exits require human review. Confirm reviewer.
11. **Is there an existing health score implementation?** Phase 0.11 modifies it. Locate before Phase 0.
12. **What's the current WAL implementation?** Phase 0.1 substantially rewrites it. Confirm location, current format, current consumers.
13. **What's the existing alert engine pattern for background tasks?** Phase 1.3 (reaper) follows that pattern.

---

## Section 11: Phase Tracker

Maintain `PHASE_TRACKER.md` at the root of the agent repo. Update on every PR merge.

```markdown
# NeoGuard Agent — Phase Tracker

**Plan version:** 2.1
**Current phase:** Phase 0
**Started:** YYYY-MM-DD
**Target completion:** YYYY-MM-DD

## Phase Status

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 0 — Correctness Foundation | In Progress | 2026-MM-DD | — | P0-A: 4/9 complete, P0-B: 0/5, P1: 0/1 |
| 1 — Agent Registry | Not Started | — | — | Blocked on Phase 0 P0-A |
| 2 — Metrics Polish | Not Started | — | — | — |
| 3 — Logs Backend | Not Started | — | — | — |
| 4 — Logs Agent | Not Started | — | — | — |
| 5 — Correlation UI | Not Started | — | — | — |
| 6 — Distribution | Not Started | — | — | — |
| 6.5 — Soak Testing | Not Started | — | — | — |

## Active Sub-Tasks (Phase 0)

### P0-A (ship blockers)
- [x] 0.1 WAL fix + framing + CRC + size limits + version (PR #42)
- [x] 0.2 Retry exhaustion fix (PR #43)
- [x] 0.3 process_cmdline opt-in (PR #44)
- [ ] 0.5 Pre-warm rate computers
- [ ] 0.6 Identity fallback chain
- [ ] 0.7 Clock skew handling
- [ ] 0.10 Collector supervision
- [ ] 0.13 Memory self-protection
- [ ] 0.14 Replay throttling + adaptive backpressure

### P0-B (production hardening)
- [x] 0.4 Configurable health bind (PR #45)
- [ ] 0.8 Container-aware GOMAXPROCS
- [ ] 0.9 Custom CA bundle
- [ ] 0.11 Health score hard caps
- [ ] 0.15 Internal pressure metrics

### P1
- [ ] 0.12 Serializer interface

## Blockers

(none) |

## Open Questions Awaiting Reviewer

(none) |

## Risks

(none identified) |
```

---

## Section 12: Glossary

- **Agent:** the `neoguard-agent` binary running on a customer host.
- **Backend:** the NeoGuard SaaS application that receives data from agents.
- **Resource:** a cloud-discovered or agent-reported entity (EC2 instance, Azure VM, on-prem host).
- **`resource_id`:** stable identifier of a resource. From IMDS for cloud resources, machine-id for on-prem, hostname as last-resort fallback.
- **`agent_id`:** UUID identifying a specific agent installation. Stable across restarts. Deterministic from `resource_id` when possible.
- **Tenant:** customer account boundary. All data scoped by tenant.
- **WAL:** Write-Ahead Log. Disk-backed buffer for crash resilience. Frame-based with CRC, size-bounded with drop policy.
- **WAL frame:** `[length][CRC32][payload]` unit of WAL storage.
- **Dead letter:** batch that exhausted retries and was written to disk for manual inspection.
- **IMDS:** Instance Metadata Service (AWS, Azure cloud-internal HTTP endpoint).
- **PII:** Personally Identifiable Information. Logs may contain PII; masking is opt-in.
- **Tail sampling:** sampling decision made after a log line is parsed, allowing level-aware retention.
- **Forwarder tier:** hypothetical intermediate aggregation layer between agents and backend. Not in v1.
- **Schema version:** integer version of the wire protocol. Negotiated at registration.
- **Soak test:** long-duration test (24h, 7d) to detect leaks and slow degradation.
- **Boundary condition:** normal operating condition (clock skew, container limits, file rotation) that must be handled correctly. Not an edge case.
- **Self-protection:** agent's response to memory pressure. Tiers: normal, degraded, emergency.
- **Critical path exemption:** behavioral guarantee that heartbeat, core collectors, and transmission are never paused by self-protection. Protection by policy, not by memory pre-allocation.
- **Adaptive backpressure:** rolling-window response to 429/503/timeout/latency signals, reducing send rate.
- **Replay:** transmission of WAL-stored data after backend recovery.
- **Live data:** metrics/logs from the current collection cycle, prioritized over replay.
- **Capability negotiation:** agent declares what it can do at registration; backend uses for feature gating.
- **Process aggregation:** collapsing similar processes (e.g., 200 python workers) into a single metric group.
- **Hard ceiling:** non-configurable internal limit (e.g., 100 process groups, 64 KB log lines).

---

## Section 13: Sign-Off

This document, version 2.1, supersedes all prior execution plans for the NeoGuard Agent v1.0.0 release.

The executor begins Phase 0 only after:

1. Section 10 questions are answered in writing.
2. Section 11 PHASE_TRACKER.md is created.
3. Reviewer has acknowledged the plan and confirmed scope.

**Estimated total duration:** 18 weeks.
**Estimated total effort:** 1 senior engineer full-time, or equivalent.
**Definition of done:** Section 6.

This plan reflects four rounds of adversarial review and is considered final. Further changes during execution follow the Section 9 escalation process. Strategic additions are deferred to v1.x post-launch based on real customer signal, not internal opinion.

---

**End of document. Begin with Section 10 questions, then Phase 0 P0-A tasks.**


Save the document as AGENT_EXECUTION_PLAN.md in your repo root (or wherever Claude will read from).

Answer Section 10's 13 questions yourself first. Several require knowledge only you have:

Repo URL / codebase location
Current backend ingest schema
ClickHouse availability for Phase 3
Existing health score / WAL / alert engine patterns
Pilot customer identification
Without these answers, Claude will stall or guess.

Create PHASE_TRACKER.md stub from the Section 11 template. This is the single artifact you'll check to see progress without reading code.

Decide your review cadence. The plan says "phase exits require human review." Determine: weekly check-in? End-of-phase only? Async PR review per sub-task? Tell Claude explicitly.

Set the start date in PHASE_TRACKER.md and calculate target dates per the 18-week estimate.
