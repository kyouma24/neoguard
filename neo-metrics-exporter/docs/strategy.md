# NeoGuard Agent — Technical Execution Plan v2.0

**Document version:** 2.0
**Audience:** Engineering executor (Claude or human)
**Scope:** Metrics + Logs only. Traces explicitly excluded from v1.
**Target outcome:** Production-ready agent + backend correlation UI in 15-16 weeks.
**Supersedes:** Technical Execution Plan v1.0 (do not reference)

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
5. When this document conflicts with `neo-metrics-exporter-strategy.md`, this document wins.
6. If a deliverable is ambiguous, stop and ask before coding. Do not invent specs.
7. **Boundary conditions in Section 4 are binding spec, not aspirational.** Code that violates them is buggy regardless of test pass/fail.

---

## Section 1: Architectural Constraints (Binding)

These are not negotiable. If a proposed implementation violates one, the implementation is wrong.

### 1.1 Language and Dependencies

- **Go 1.24+**, single static binary, `CGO_ENABLED=0`
- **Direct dependencies cap:** 6 maximum at end of v1. Currently 2 (`gopsutil/v4`, `yaml.v3`). Each new dep requires written justification in `docs/dependencies.md`.
- Permitted additions during v1:
  - `fsnotify` for file watching (Phase 4) — required, no stdlib equivalent.
  - `automaxprocs` for cgroup-aware GOMAXPROCS (Phase 0) — single-purpose, well-maintained, MIT.
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
2. **No silent drops:** Every dropped metric point or log line increments a counter that is itself emitted as a metric. The user must be able to alert on data loss.
3. **No partial batches:** A batch is either fully transmitted (HTTP 2xx) or fully retried/persisted. Partial success is not a thing.
4. **Tenant attribution is implicit via API key, never trusted from client input.** The agent never sets `tenant_id` in payloads it sends to the backend. The backend derives it from the API key.
5. **Identity is established before first transmission.** No metrics are sent until IMDS resolution (or fallback chain) completes per Section 4.2.
6. **Monotonic time for intervals.** All rate calculations and timeouts use `time.Since` (monotonic). Wall-clock time is used only for emitted timestamps.
7. **Logs separated from metrics.** Log buffers, transport, retry state, and dead-letter directories are independent of metrics. Backpressure on one MUST NOT block the other.

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

- `agent_id` is a UUID generated on first run, persisted to `/agent_id`. Stable across restarts.
- **`agent_id` is also included as a tag on every metric and log point.** This disambiguates duplicate `resource_id` cases per Section 4.6.
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

// 200 OK with partial rejection (validation failure on subset)
{"accepted": 4998, "rejected": 2, "errors": [{"index": 47, "reason": "metric name too long"}]}

// 401 Unauthorized — invalid API key
// 413 Payload Too Large — exceeds 5MB compressed
// 422 Unprocessable Entity — schema_version unsupported
// 429 Too Many Requests — rate limited, MUST honor Retry-After
// 503 Service Unavailable — backend overloaded, MUST retry with backoff
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
    "logs": false
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
  "clock_skew_seconds": 0.4
}

// Response 200
{"ack": true}
```

**`POST /api/v1/agents/stopping`** — called on graceful shutdown, best-effort (5s timeout).

```json
{"agent_id": "uuid", "reason": "sigterm" | "sighup_reload" | "panic", "timestamp": "..."}
```

### 2.4 Retry Semantics (Mandatory)

| Response | Action |
|---|---|
| 2xx | Success. Discard from buffer. |
| 4xx (except 429) | **Permanent failure.** Log loudly, drop batch, increment `agent.transport.batches_dropped_4xx`. Do not retry. |
| 429 | Honor `Retry-After` header. If absent, backoff per schedule below. |
| 5xx | Retry per schedule. |
| Network error / timeout | Retry per schedule. |

**Backoff schedule:** 1s, 2s, 4s, 8s, 16s, 30s (cap). Up to 6 attempts. After exhaustion: re-enqueue at front of buffer with `retry_count` incremented. After `retry_count >= 3` cycles of exhaustion: write to dead-letter file `/dead-letter/.jsonl.gz` and increment `agent.transport.batches_dead_lettered`.

**Logs and metrics dead-letter directories are separate:** `/dead-letter/metrics/` and `/dead-letter/logs/`.

### 2.5 Wire Protocol Version Negotiation

**Why:** A v1 agent must continue working when a v2 backend ships. A v1 backend must reject v2 agents cleanly with actionable errors.

**Mechanism:**

1. Agent sends `supported_schema_versions: [1]` in `/agents/register`.
2. Backend responds with `negotiated_schema_version`: the highest version both support.
3. Agent uses negotiated version on all subsequent ingest calls.
4. If no overlap exists: backend returns 422 with body `{"error": "no_compatible_schema", "agent_supports": [1], "server_supports": [2,3]}`. Agent logs critical error, refuses to start collection, exits with code 78 (config error).
5. **Backend MUST support N-1 for at least 6 months after Nv release.** This is a release commitment.

In v1 there is only `schema_version: 1`. Negotiation infrastructure exists for forward compatibility.

### 2.6 Future Wire Format Compatibility

JSON is the v1 wire format. To enable future migration without breaking changes:

1. Agent includes `Accept-Encoding: gzip` (already required).
2. **Agent additionally includes `Accept-Format: application/json` header** in all ingest calls.
3. Backend MAY respond with `Content-Format: application/json` (or future `application/x-protobuf`).
4. v1.x agents MUST ignore unknown `Content-Format` values and treat as JSON.
5. v2+ agents MAY negotiate `application/x-protobuf` if both support it.

This is forward-compat plumbing. v1 always uses JSON. Do not implement Protobuf in v1.

---

## Section 3: Boundary Conditions (Binding Spec)

These are not edge cases or chaos test scenarios. They are normal operating conditions the agent must handle correctly.

### 3.1 Clock Skew and NTP Jumps

**Forward jump (clock advances suddenly, e.g., NTP correction +5 min):**
- Rate computers detect impossibly large delta-time. They skip the affected cycle and reset baseline.
- No metrics emitted for that cycle for rate-based collectors.
- Log: `"clock_jump_forward_detected: skipping rate calculation, delta=Xs"`.
- Emit `agent.clock.forward_jumps_total` counter.

**Backward jump (clock retreats, e.g., NTP correction -2 min):**
- Rate computers detect negative delta-time. They skip the cycle and reset baseline.
- Outgoing batch timestamps are floored at `last_emitted_timestamp + 1ms` to prevent ordering violations.
- Log: `"clock_jump_backward_detected: timestamps floored, delta=Xs"`.
- Emit `agent.clock.backward_jumps_total` counter.

**Initial skew detection (startup):**
- During registration, capture `Date` header from backend response.
- Compute `clock_skew_seconds = local_now - server_date`.
- If `|skew| > 60s`: log warning, emit `agent.clock_skew_seconds` gauge on every cycle.
- If `|skew| > 300s` AND config has `strict_clock_check: true`: refuse to start, exit code 78.
- Default `strict_clock_check: false`.

**Implementation detail:** All interval-based logic uses `time.Since(monotonic_start)`. `time.Now()` is used only for emitted timestamps. Go's standard library does this correctly by default; verify nothing in the codebase calls `time.Now().Sub(time.Now())` patterns.

### 3.2 Identity Resolution Fallback Chain

**Why:** Hostname is not a stable identity. The agent must establish stable identity before sending data.

**Resolution order:**

1. **AWS IMDSv2** (`http://169.254.169.254/latest/meta-data/instance-id`) with token, 2s timeout.
   - On success: `resource_id = <instance-id>`, `cloud_provider = "aws"`. Done.
2. **Azure IMDS** (`http://169.254.169.254/metadata/instance?api-version=2021-02-01`) with `Metadata: true` header, 2s timeout.
   - On success: `resource_id = <vmId>`, `cloud_provider = "azure"`. Done.
3. **systemd machine-id** — read `/etc/machine-id` or `/var/lib/dbus/machine-id`. If present: `resource_id = "host-<machine-id>"`, `cloud_provider = "on-prem"`.
4. **Hostname fallback** (last resort) — `resource_id = "host-<hostname>"`, `cloud_provider = "unknown"`. Log warning: `"identity_fallback_to_hostname: instability risk, document agent_id for tracking"`.
   - Note: K8s Downward API and GCP metadata removed from v1 scope. Post-v1 targets.

**Persistence:**

- After resolution, write `/identity.json`:
  ```json
  {"resource_id": "...", "cloud_provider": "...", "resolved_via": "aws-imds", "resolved_at": "..."}
  ```
- On next start: read persisted identity. Re-run resolution. If resolved value matches persisted: use it. If differs: log `"identity_changed: was=X now=Y"`, prefer new value, but keep old `agent_id`.
- This means: **`agent_id` is stable across reinstalls on the same host**, even if cloud identity is briefly unavailable at startup.

**Boot sequence with identity resolution:**

1. Agent starts.
2. Collectors start collecting into a "pending" buffer (max 500 points, drops oldest if exceeded). Counter: `agent.boot.pending_dropped`.
3. In parallel: identity resolution runs. Hard timeout: 30 seconds (sum of all fallback attempts).
4. When identity resolves: tag the pending buffer with identity, register with backend, start normal transmission.
5. If identity fails after 30s: use hostname fallback, register, log warning, continue.

**No metrics are sent until registration succeeds.** Pending buffer is drained on first successful transmission.

### 3.3 Container Awareness

**Problem:** Inside a container with cgroup CPU limits, `runtime.NumCPU()` returns host count, not pod limit. This causes goroutine pool oversubscription and incorrect metric reporting.

**Required behavior:**

1. At startup, use `automaxprocs` library to set GOMAXPROCS from cgroup limits.
2. Detect container runtime (cgroup v1 or v2). Read CPU and memory limits.
3. Emit `agent.container.detected{runtime="docker|k8s|lxc|none"}` gauge.
4. When reporting CPU and memory metrics: report **container limits** as `system.cpu.limit_cores` and `system.memory.limit_bytes` if running in a container. This lets the user distinguish "host has 64 cores" from "this container can use 2."
5. Process collector uses container-relative PIDs when in a PID namespace.

**Cgroup v1 vs v2:** Detect at startup. Support both paths. Do not assume v2.

### 3.4 Duplicate `resource_id` Handling

**Scenario:** Agent reinstalled on same EC2 instance. Old agent_id UUID lost (state_dir wiped). New agent generates new UUID. Backend now has two agent records with same `resource_id`.

**Resolution:**

1. **`agent_id` derivation is deterministic where possible.** Order:
   a. If `/agent_id` exists: use it.
   b. Else if cloud identity resolved: `agent_id = uuidv5(namespace_neoguard, ":")`. Deterministic.
   c. Else: random UUIDv4. Log: `"agent_id_random: not deterministic, reinstalls will create new identity"`.
2. **Backend behavior on duplicate `resource_id`:**
   - When new agent registers with `(tenant_id, resource_id)` matching an existing active agent but different `agent_id`:
     - Mark old agent: `status = 'replaced'`, `replaced_at = NOW()`, `replaced_by_agent_id = `.
     - Create new agent record normally.
     - Both agents visible in UI history; only new one is active for the resource.
3. **Every metric and log point is tagged with `agent_id`.** Queries can disambiguate when needed. Default UI views filter to active agent only.

### 3.5 File Tailing Edge Cases (Phase 4)

**Rotation scenarios — all must work correctly:**

1. **`move/create` rotation** (default logrotate): old file renamed (e.g., `app.log` → `app.log.1`), new file created at original path.
   - Agent reads to EOF on old file (via held fd), then switches to new file (re-opens by path).
2. **`copytruncate` rotation**: file content copied to backup, original truncated to size 0.
   - Agent detects size-decrease. Resets read offset to 0 on next read.
   - Some lines may be missed during copy window. Document as known limitation: "use move/create for guaranteed delivery."
3. **Symlink rotation**: agent watches a symlink that gets re-pointed.
   - Agent re-resolves symlink on every fsnotify event.
   - If target inode changes: switch to new target, start at offset 0.
4. **Temporary file disappears**: glob pattern matches a file that gets deleted mid-tail.
   - Read remaining buffered data. Close fd. Remove from active tailers. Log: `"tail_target_removed: "`.
5. **Filesystem unmounted**: read returns I/O error.
   - Log error, mark source as failed, retry every 60s.

**Inode tracking:** state file `/logs-checkpoint.json` records `(path, inode, offset, size)`. On restart:
- If inode matches: resume from offset.
- If inode differs but path exists: new file, start from offset 0.
- If neither: source unavailable, log warning.

### 3.6 Memory Pressure and Buffer Behavior

**Metrics buffer:**
- Ring buffer, in-memory, capped at `metrics.buffer.max_lines` (default 100,000).
- When full and transmission is failing: drop oldest, increment `agent.metrics.buffer_drops`.
- WAL writes happen on every batch flush attempt, regardless of transmission outcome.

**Logs buffer:**
- In-memory ring + disk spool (Section in Phase 4).
- When in-memory is 80% full: spill to disk.
- When disk cap hit: drop oldest spool files.
- Backpressure to file tailers: when buffer is 95% full, slow read rate (sleep 100ms between reads). Never block indefinitely.

**Why these aren't symmetric:** Metrics are small and uniform; ring buffer is sufficient. Logs are large and bursty; disk spool prevents memory blowouts during incidents (which is exactly when logs are most important).

---

## Section 4: Phase Plan

Each phase has hard entry criteria. Do not start a phase if entry criteria are unmet.

---

## PHASE 0 — Correctness Foundation

**Duration:** 2 weeks
**Entry criteria:** Existing v0.2 codebase compiles and tests pass.
**Goal:** Fix data integrity bugs AND establish boundary condition handling before building anything new.

This phase was previously "1 week of bug fixes." It's now 2 weeks because correctness foundations include identity, clock, and container awareness — not just the original review findings.

### 0.1 Fix WAL Compaction Data Loss (EXP-001)

**Problem:** `compactWAL()` opens a temp file and closes it without writing the ring contents. Crash after compaction loses all in-memory data.

**Required fix:**

1. During compaction, iterate the in-memory ring buffer and write each pending batch to the temp WAL file before atomic rename.
2. Use `fsync` on the temp file before rename. Use `fsync` on the parent directory after rename.
3. If any write or fsync fails, abort the rename and log the error. Do not corrupt the original WAL.

**Acceptance test (mandatory):**

Write `internal/buffer/wal_crash_test.go`:

```go
// Test: kill -9 during compaction must not lose data.
// Procedure:
// 1. Start agent subprocess with WAL enabled.
// 2. Push 10000 points. Verify WAL contains them.
// 3. Trigger compaction (via signal or test hook).
// 4. SIGKILL the process during compaction (use a sleep injection point).
// 5. Restart agent.
// 6. Verify all 10000 points are recovered (either via WAL replay or in-memory state).
```

The test must run in CI on every PR.

### 0.2 Fix Retry Exhaustion Data Loss (EXP-002)

**Problem:** After 3 retries fail, points are silently dropped.

**Required fix:**

1. After retry exhaustion, re-enqueue the failed batch at the **front** of the ring buffer with `retry_count++` in batch metadata.
2. After `retry_count >= 3`, write the batch to dead-letter file (`/dead-letter/metrics/.jsonl.gz`).
3. Emit `agent.transport.retries_exhausted` counter on every exhaustion event.
4. Emit `agent.transport.batches_dead_lettered` counter on every dead-letter write.
5. On startup, scan dead-letter directory and emit `agent.transport.dead_letter_files` gauge.

**Acceptance test:**

Mock HTTP server that returns 503 for the first N requests, then 200. Verify:
- Points are not lost during outage.
- Batch is delivered after server recovers.
- Counters reflect the retry/dead-letter activity correctly.

### 0.3 Move `process_cmdline` to Opt-In (EXP-006)

**Problem:** `process_cmdline` as a tag value contains UUIDs/timestamps/paths, blowing up cardinality.

**Required fix:**

1. Default config: `process.collect_cmdline: false`.
2. When false: `process_cmdline` tag is omitted from process metrics entirely.
3. When true: tag is present but value is truncated to 128 chars and SHA256 hashed if it contains characters matching `[0-9a-f]{8,}` (likely UUIDs/hashes) or `\d{10,}` (timestamps).
4. Document in `docs/cardinality.md` why this is opt-in and what the hash means.

**Acceptance test:**

Unit test: process collector with `collect_cmdline: false` emits no `process_cmdline` tag. With `true`, long random strings are hashed.

### 0.4 Configurable Health Bind Address (EXP-008)

**Problem:** Health server binds 127.0.0.1, breaking K8s liveness probes.

**Required fix:**

```yaml
health:
  enabled: true
  bind: "127.0.0.1:8282"  # default. K8s users set "0.0.0.0:8282"
```

Validate bind address at config load. Reject malformed addresses.

### 0.5 Pre-warm Rate Computers

**Problem:** First collection cycle reports 0 for rate-based metrics (network, diskio).

**Required fix:**

1. At agent startup, after identity resolution but before first user-visible collection cycle, run a hidden "warm-up" pass on all rate-based collectors. Discard the results.
2. The warm-up pass populates the rate computer's "previous sample" state.
3. First user-visible collection produces correct rates.

### 0.6 Identity Resolution Fallback Chain

**Per Section 4.2.** Implement the full chain: AWS → Azure → machine-id → hostname. (GCP and K8s descoped from v1.)

**Required deliverables:**

- `internal/identity/resolver.go` with each provider as a separate function.
- Each provider has a 2s individual timeout. Total resolution capped at 30s.
- `/identity.json` persistence with re-validation on startup.
- Deterministic `agent_id` derivation when identity is stable.
- Tests using mock HTTP servers for each cloud provider.

### 0.7 Clock Skew Detection and Handling

**Per Section 4.1.** Implement:

1. Capture backend `Date` header during registration. Emit `agent.clock_skew_seconds` gauge.
2. Forward/backward jump detection in rate computers.
3. Outgoing timestamp flooring on backward jumps.
4. `strict_clock_check` config option (default false).

**Acceptance test:**

Use libfaketime or runtime time injection to simulate clock jumps. Verify rate computer skips affected cycles, timestamps are floored on backward jumps, gauge reports skew correctly.

### 0.8 Container-Aware GOMAXPROCS

**Per Section 4.3.** Implement:

1. Add `automaxprocs` dependency. Document in `docs/dependencies.md`.
2. Detect cgroup v1 vs v2 at startup.
3. Emit container limits as metrics.
4. Validate goroutine count stays within container limits during load tests.

### 0.9 Custom CA Bundle Support

**Per Section 1.6 of v0.2 review (EXP-004).**

```yaml
neoguard:
  tls:
    ca_bundle: /etc/neoguard/ca.pem  # optional, additional CAs appended to system pool
    insecure_skip_verify: false       # explicit opt-in for dev only
    cert_pinning_sha256: []           # optional list of cert hashes to pin
```

- If `ca_bundle` set: read file, append to system cert pool, use combined pool.
- If `insecure_skip_verify: true` AND not in dev mode: log warning every 5 minutes about insecure config.
- If `cert_pinning_sha256` non-empty: verify peer cert SHA256 matches at least one pinned hash. Fail TLS handshake if no match.

### 0.10 Exit Criteria for Phase 0

- All 9 fixes merged with tests.
- `make test` passes including new chaos tests (WAL crash, identity fallback, clock jump).
- `make bench` shows no regression (>5%) in collection cycle latency.
- Manual smoke test: install on a Linux host, run for 1 hour, verify no data gaps in first cycle, verify counters work.
- Manual smoke test: install in a Docker container with `--cpus=2` on a host with 16 cores, verify GOMAXPROCS=2.
- Manual smoke test: simulate clock jump with `date -s`, verify recovery.

---

## PHASE 1 — Backend Agent Registry

**Duration:** 2 weeks
**Entry criteria:** Phase 0 complete and merged.
**Goal:** Backend understands what agents exist, when they last checked in, what they're capable of.

This phase is mostly **backend** work with minimal agent changes. Do not skip it. Every subsequent phase depends on the backend knowing about agents.

### 1.1 Database Schema

Create migration file `alembic/versions/00X_agent_registry.py` (use next available number).

```sql
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id_external UUID NOT NULL,  -- the UUID generated by the agent
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
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'stale', 'stopped', 'crashed', 'replaced')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (tenant_id, agent_id_external)
);

CREATE INDEX idx_agents_tenant_last_seen ON agents (tenant_id, last_seen DESC);
CREATE INDEX idx_agents_tenant_resource ON agents (tenant_id, resource_id) WHERE status = 'active';
CREATE INDEX idx_agents_status ON agents (status) WHERE status != 'active';

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
CREATE POLICY agents_tenant_isolation ON agents
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Heartbeat events for forensics. Append-only.
CREATE TABLE agent_heartbeats (
    agent_pk UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics_sent_since_last INT,
    logs_sent_since_last INT,
    buffer_utilization_pct REAL,
    errors_since_last INT,
    clock_skew_seconds REAL,
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

Create `api/routes/agents.py`. Follow existing patterns from `routes/dashboards.py` for tenant context, auth, error envelope.

**`POST /api/v1/agents/register`** (no scope requirement; just valid API key)

- Upsert by `(tenant_id, agent_id_external)`.
- On insert: set `first_seen = NOW()`, `last_started_at = NOW()`, `status = 'active'`.
- On update: set `last_started_at = NOW()`, `last_seen = NOW()`, `status = 'active'`. If previous `status = 'stopped'` or `'crashed'`, log a "agent restarted" audit event.
- **Duplicate resource_id handling per Section 4.4:**
  - Query for existing active agent with same `(tenant_id, resource_id)` but different `agent_id_external`.
  - If found: update old agent `status = 'replaced'`, `replaced_at = NOW()`, `replaced_by_agent_id = `.
  - Insert new agent normally.
- Negotiate schema_version per Section 2.5.
- Return 200 with negotiated schema and heartbeat interval.

**`POST /api/v1/agents/heartbeat`**

- Look up agent by `(tenant_id, agent_id_external)`. Return 404 if not registered.
- Update `last_seen = NOW()`, `status = 'active'`.
- Insert row into `agent_heartbeats`.
- Return 200.

**`POST /api/v1/agents/stopping`**

- Look up agent. Update `last_stopped_at = NOW()`, `status = 'stopped'`, `last_stop_reason = `.
- Return 200.

**`GET /api/v1/agents`** — list endpoint for UI

- Query params: `status`, `cloud_provider`, `limit`, `offset` (parameterized, per DASH-010).
- Default filter: `status IN ('active', 'stale', 'crashed')` (excludes replaced/stopped unless explicit).
- Returns paginated list scoped to tenant.
- Super admin: requires explicit `?tenant_id=X` per NOTIF-005 pattern.

**`GET /api/v1/agents/{id}`** — single agent detail

- Returns agent + last 100 heartbeats.

### 1.3 Stale Detection Background Job

Create `services/agents/reaper.py`:

- Runs every 30s.
- For each tenant, find agents where `last_seen < NOW() - 90 seconds AND status = 'active'`. Set `status = 'stale'`.
- For agents where `last_seen < NOW() - 5 minutes AND status IN ('active', 'stale') AND last_stopped_at IS NULL`. Set `status = 'crashed'`.
- Emit metric `neoguard.agents.status_transitions{from, to}` per transition.

Wire into the existing background task system (read `services/alerts/engine.py` to match the pattern).

### 1.4 Agent-Side Lifecycle Implementation

In the agent codebase:

1. Generate `agent_id` per Section 4.4 (deterministic when possible). Persist to `/agent_id`.
2. On startup, after identity resolution: call `/api/v1/agents/register`. If this fails, retry with backoff. Do not start collection until registration succeeds.
3. Start a heartbeat goroutine: every `heartbeat_interval_seconds` (server-negotiated), send `/api/v1/agents/heartbeat`. Track stats since last heartbeat (metrics_sent, logs_sent, errors, clock_skew).
4. Register signal handlers:
   - `SIGTERM` / `SIGINT`: send `/api/v1/agents/stopping` with `reason: "sigterm"`, then graceful shutdown (flush buffers, close WAL).
   - Panic recovery: in main, recover and send `stopping` with `reason: "panic"` before exiting non-zero.

### 1.5 Configurable Heartbeat Interval

```yaml
neoguard:
  heartbeat_interval_seconds: 30  # min 10, max 300, default 30
```

- Agent sends desired interval in registration.
- Server may override (returned in `negotiated heartbeat_interval_seconds`).
- Reaper thresholds adjust accordingly: stale = 3 × interval, crashed = 10 × interval.

### 1.6 Minimal UI

Create `frontend/src/pages/AgentsPage.tsx` and route `/agents`:

- Table: hostname, resource_id, agent_version, status (with color), cloud_provider, region, last_seen (relative time), capabilities (badges).
- Filter by status, cloud provider.
- Click row → agent detail page with heartbeat history chart.

On the existing **resource detail page** (find it in the frontend routes), add an "Agent" sidebar/badge:

- If agent registered for this `resource_id`: show status, version, last seen.
- If multiple agents have same `resource_id` (history): show active one prominently, list replaced ones in expandable history.
- If not registered: show "No agent installed" with link to install docs.

### 1.7 Acceptance Tests

**Backend:**

- `test_agent_registry.py`: register, heartbeat, stopping, list, detail. Tenant isolation (agent in tenant A invisible to tenant B). Reaper transitions (mock time forward). Duplicate resource_id triggers replacement.

**Agent (integration):**

- Start agent against mock backend. Verify register call. Verify heartbeats every 30s. Send SIGTERM, verify stopping call.
- Reinstall on same host: verify deterministic agent_id, old agent marked replaced.

**End-to-end:**

- Real agent + real backend in docker-compose. Agent registers, heartbeats appear in DB, killing agent transitions status to crashed within 5 min.

### 1.8 Exit Criteria

- `/agents` page lists running agents in real time.
- Resource detail page shows agent status badge.
- Killing an agent (`kill -9`) results in `status = crashed` within 5 minutes.
- Graceful shutdown results in `status = stopped` within 1 second of receipt.
- Tenant isolation verified: agent in tenant A invisible to tenant B.
- Duplicate resource_id correctly transitions old agent to `replaced`.

---

## PHASE 2 — Metrics Polish and Operational Tooling

**Duration:** 2 weeks
**Entry criteria:** Phase 1 complete. Agents register and heartbeat reliably.
**Goal:** Operational tooling and remaining metrics fixes that make the agent debuggable and tunable in production.

### 2.1 CLI Operational Modes

Add the following to `cmd/neoguard-agent/main.go`:

**`neoguard-agent run --collect-once --output=stdout`**

- Run identity resolution.
- Run one collection cycle of all enabled collectors.
- Marshal to JSON, write to stdout.
- Exit 0 on success, 1 on any collector error.
- Do not start transport, do not register with backend.

**`neoguard-agent run --dry-run`**

- Run normally but never POST to backend.
- Log every batch that would have been sent (counts only by default, with `--dry-run-verbose` log full payloads).
- Useful for testing collector config without registering an agent.

**`neoguard-agent validate --config `**

- Parse YAML.
- Validate all fields, including platform-specific (warn if Linux config used on Windows).
- Verify env var expansion succeeds.
- Verify file paths exist (logs sources, WAL dir, etc.).
- Verify regex patterns compile.
- Exit 0 if valid, 1 if any error. Print errors with file:line.

### 2.2 Configuration Reloading

**Problem:** SIGHUP applies a partial config silently.

**Required fix:**

Define explicitly in `internal/config/reloadable.go`:

```go
// ReloadableFields are fields that can be hot-reloaded via SIGHUP.
// All other fields require a process restart.
var ReloadableFields = []string{
    "extra_tags",
    "logs.processing",         // include/exclude/mask rules
    "logs.sources",            // can add/remove sources, paths re-tailed
    "filters.metrics.include",
    "filters.metrics.exclude",
    "filters.tags.drop",
    "filters.tags.rename",
    "process.collect_cmdline",
    "process.top_n",
    "logging.level",
    "collectors.disabled",     // toggle collectors on/off
    "neoguard.api_key_file",   // re-read file (for rotation)
}

// Fields NOT in this list require restart. On SIGHUP, if any non-reloadable
// field changed, log an error and KEEP THE OLD VALUE. Do not partially apply.
```

On SIGHUP:

1. Parse new config file.
2. Compute diff against active config.
3. If any diff is in a non-reloadable field, log:
   `"SIGHUP reload rejected: field  changed but is not reloadable. Restart required. No changes applied."`
   Do not apply any changes.
4. If all diffs are reloadable, apply atomically and log applied changes.
5. Update `config_hash` sent on next heartbeat.

### 2.3 Secrets Handling

Add `api_key_file` config option:

```yaml
neoguard:
  api_key_file: /run/secrets/neoguard_api_key  # mutually exclusive with api_key
```

- If both `api_key` and `api_key_file` are set, error at startup.
- If `api_key_file` is set: read at startup. File must be 0400 or 0440 on Linux. Reject with clear error if more permissive.
- On SIGHUP: re-read the file. This is the supported API key rotation path.

### 2.4 Metric Filtering

```yaml
filters:
  metrics:
    include:
      - "system.*"
      - "process.*"
      - "agent.*"
    exclude:
      - "system.cpu.usage_pct"
      - "process.io.*"
```

Semantics:

- If `include` is empty: all metrics included by default.
- If `include` is non-empty: only metrics matching at least one include pattern pass.
- Then exclude patterns remove from the included set.
- Patterns: glob (`*` matches any segment, `**` matches multiple), case-sensitive.
- Filtering happens after collection, before buffering. Filtered metrics are never sent.
- Emit counter `agent.metrics.filtered_total{reason="exclude"|"not_included"}`.

### 2.5 Tag Rewriting

```yaml
filters:
  tags:
    drop: ["process_cmdline", "container_id_full"]
    rename:
      hostname: host
      resource_id: instance_id
```

Apply to every metric point after collection, before buffering. Drop runs before rename.

### 2.6 Process PID Cache

**Problem:** Process collector scans all PIDs every cycle. On servers with 500+ processes, this is 200+ ms per cycle.

**Required fix:**

1. Maintain `processCache map[int32]*ProcessInfo` keyed by PID, with last-seen timestamp.
2. Each cycle:
   a. List all PIDs (cheap, just `/proc` directory listing).
   b. For PIDs in cache: re-fetch only CPU%, memory, IO (the changing fields).
   c. For new PIDs: full enrichment (name, cmdline, user, exe path).
   d. For PIDs no longer present: evict from cache.
3. Cache size cap: 10,000 entries. If exceeded, evict oldest by last-seen.
4. Add metric `agent.process_collector.cache_size`.

### 2.7 Parallel Disk Collection

**Problem:** A hung NFS mount blocks the entire disk collector cycle.

**Required fix:**

1. Collect partitions list (cheap).
2. For each partition, run `disk.Usage(path)` in a separate goroutine with a 5-second timeout (configurable via `collectors.disk.per_mount_timeout`).
3. Goroutines that timeout are cancelled. Emit `agent.disk_collector.mount_timeout{mount=}` counter.
4. Successful partitions still emit metrics. Failed partitions emit `system.disk.collection_failed{mount=}=1`.

### 2.8 Local /metrics Endpoint (Prometheus Exposition)

**Why:** Customers using Prometheus + NeoGuard simultaneously can scrape the same agent. Universal debugging via `curl localhost:9100/metrics`.

```yaml
metrics_endpoint:
  enabled: true  # default
  bind: "127.0.0.1:9100"
  path: "/metrics"
```

- Expose all collected metrics in Prometheus exposition format.
- No authentication (binds localhost by default).
- Updates served from last collection cycle (do not trigger collection on scrape).
- Emit `agent.metrics_endpoint.scrapes_total` counter.

### 2.9 Acceptance Tests

- `--collect-once` produces valid JSON to stdout in <2 seconds.
- `--validate-config` rejects malformed configs with file:line errors.
- SIGHUP with reloadable change applies it. SIGHUP with non-reloadable change is rejected, no partial apply.
- API key file rotation: write new key, SIGHUP, verify next request uses new key.
- Filter test: `system.*` include + `system.cpu.*` exclude → no system.cpu metrics, all other system metrics present.
- Process cache benchmark: 500 process system, second cycle is <50% the time of first cycle.
- NFS hang simulation (use FUSE mount that hangs reads): only that mount times out, others report.
- `curl localhost:9100/metrics` returns valid Prometheus exposition format.

### 2.10 Exit Criteria

- All operational CLI modes work and are documented in `docs/cli.md`.
- Config reload behavior documented in `docs/config-reload.md` with the exact reloadable fields list.
- Benchmarks: process collector ≥50% faster on 500-process system after first cycle. Disk collector unaffected by hung mount.
- Prometheus scrape verified end-to-end.
- No regression in existing metrics tests.

---

## PHASE 3 — Logs Backend Hardening

**Duration:** 2 weeks
**Entry criteria:** Phases 0–2 complete. Backend has ClickHouse log store (verify before starting).
**Goal:** Backend log ingest path is production-grade BEFORE the agent starts shipping logs.

This phase is **all backend work**. No agent changes.

### 3.1 Audit Existing Log Store

Before any new code, the executor MUST produce a written audit at `docs/logs-backend-audit.md` answering:

1. Where does ClickHouse log ingestion live in the codebase?
2. What is the current schema?
3. Is there an HTTP ingest endpoint? Path, auth, rate limiting?
4. Is there tenant isolation? Tested how?
5. Is there a query API? Is there a UI? Linked to what page?
6. What's the retention policy? Index strategy?
7. What are the failure modes? (CH down, slow, network partition)
8. Are there integration tests?

If any answer is "no" or "unclear," that's a Phase 3 task.

### 3.2 Required Schema (or Migration)

Target schema in ClickHouse:

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
    fields String CODEC(ZSTD(3)),  -- JSON-encoded
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

-- Skip indexes for common search patterns
ALTER TABLE logs ADD INDEX idx_message message TYPE tokenbf_v1(8192, 3, 0) GRANULARITY 4;
ALTER TABLE logs ADD INDEX idx_level level TYPE set(10) GRANULARITY 4;
```

If the existing schema differs significantly, write a migration. Do not skip — bad schema kills query performance forever.

### 3.3 Ingest Endpoint Hardening

Create or harden `POST /api/v1/logs/ingest`:

1. Auth via API key (same middleware as metrics).
2. Rate limit: per-tenant, per-second. Default 10,000 logs/sec. 429 with Retry-After when exceeded.
3. Body size validation (50 MB uncompressed cap).
4. Schema validation per Section 2.2.
5. Tenant_id derived from API key, never trusted from body.
6. Batch insert into ClickHouse using `async_insert = 1`.
7. On ClickHouse unavailable: return 503 immediately, do not buffer in backend memory (let agent retry).
8. Metrics emitted: ingest rate, p50/p95/p99 ingest latency, validation rejections, CH errors.

### 3.4 Query API

Create `GET /api/v1/logs`:

```
Query params:
  resource_id: filter (required for non-admin queries)
  service: filter (optional)
  level: filter (optional, can repeat)
  start: RFC3339 (required)
  end: RFC3339 (required, max 7 day range)
  q: full-text search query (optional)
  limit: max 1000, default 100
  cursor: opaque pagination token
```

Returns:

```json
{
  "logs": [...],
  "next_cursor": "...",
  "total_estimate": 12473,
  "took_ms": 47
}
```

Constraints:

- Max 7-day time range to prevent runaway queries.
- Tenant filter ALWAYS injected from auth context.
- Query timeout: 10s server-side. Return partial results with `truncated: true` if exceeded.
- `q` parameter goes through tokenbf index. No regex from user input (tokenbf handles full-text).
- Cursor-based pagination using `(timestamp, agent_id)` for stability.

### 3.5 Log Search UI

Create `frontend/src/pages/LogsPage.tsx`:

- Time range picker (default last 15 min).
- Filters: service (multi-select), level (checkbox), resource_id (autocomplete from agents).
- Search box for `q`.
- Result list: timestamp, level (color-coded), service, message (expandable for fields).
- Live tail mode: auto-refresh every 5s, append new logs.
- "Show in context" button: jump to ±30s window.

This is intentionally minimal. v2 adds saved searches, advanced query language.

### 3.6 Acceptance Tests

- Ingest 100k logs, query by service: <500 ms p95.
- Ingest with malformed `level`: 422 with field error.
- Cross-tenant query: tenant A cannot see tenant B's logs (verified via auth bypass attempt).
- ClickHouse down: ingest returns 503, agent (in next phase) handles correctly.
- 7-day time range query: succeeds. 8-day query: 400 with clear error.
- Concurrent ingest from 50 simulated agents: no errors, p99 < 1s.

### 3.7 Exit Criteria

- `docs/logs-backend-audit.md` complete and reviewed.
- Schema migration applied (if needed).
- `/api/v1/logs/ingest` and `/api/v1/logs` endpoints live, tested, documented.
- Logs UI renders, can search and filter.
- Load test: 10k logs/sec sustained for 1 hour, no memory growth, query latency stable.

---

## PHASE 4 — Logs Agent Implementation

**Duration:** 3 weeks (was 2 — added log-derived metrics and sampling)
**Entry criteria:** Phase 3 complete. Backend log endpoints work.
**Goal:** Agent tails files, parses, ships logs to backend, supports log-derived metrics and tail sampling.

### 4.1 Configuration Schema

```yaml
logs:
  enabled: true
  endpoint: ${NEOGUARD_LOG_ENDPOINT:-https://ingest.neoguard.io/api/v1/logs/ingest}
  buffer:
    max_memory_lines: 50000
    max_disk_mb: 500
    spool_dir: /var/lib/neoguard/logs-spool
  transport:
    batch_max_lines: 1000
    batch_max_bytes: 1048576
    flush_interval_seconds: 2
    timeout_seconds: 30
  sampling:
    enabled: false  # off by default
    keep_levels: ["error", "warn", "fatal"]  # always keep
    sample_rate_above_threshold: 0.1  # keep 10% of info/debug when over rate limit
  rate_limit:
    max_lines_per_second: 10000  # 0 = unlimited
    on_exceed: "sample"  # "sample" | "drop_oldest" | "block"
  sources:
    - path: /var/log/syslog
      service: system
      source_name: syslog
      parser: plain
      level_field: ""
      message_field: "message"
      timestamp_field: "timestamp"
      timestamp_format: ""
      multiline:
        enabled: false
        start_pattern: '^\d{4}-\d{2}-\d{2}'
        max_lines: 500
        timeout_ms: 1000
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
  derived_metrics:
    - name: app.errors_per_minute
      source: "/var/log/app/*.log"
      match: 'level=error'
      type: counter
      tags_from_fields: ["service", "host"]
    - name: app.request_latency_ms
      source: "/var/log/nginx/access.log"
      match: 'duration_ms=(\d+)'
      type: histogram
      value_from_capture: 1
      buckets: [10, 50, 100, 500, 1000, 5000]
```

### 4.2 File Tailer

Implement in `internal/logs/tailer/`:

1. Use `fsnotify` for inotify/ReadDirectoryChangesW.
2. Support glob patterns. Re-evaluate globs every 30s for new files.
3. Track `(inode, offset, size)` per file in `/logs-checkpoint.json`. Persist every 5s and on shutdown.
4. On startup: resume from last checkpoint per Section 4.5.
5. Handle all rotation scenarios per Section 4.5.
6. Bounded read: max 64 KB per line. Lines longer are truncated with `truncated=true` field.
7. Per-file goroutine, but all funnel into a single channel into the processing pipeline.

### 4.3 Parsers

Implement in `internal/logs/parsers/`:

**`plain` parser:** entire line is `message`. `level = "unknown"`. Timestamp = file read time.

**`json` parser:** parse line as JSON. Extract:
- `message_field` → `message` (default `"message"`, fallback to entire JSON if missing)
- `level_field` → `level`, normalized to one of the canonical levels
- `timestamp_field` → parse as RFC3339 or `timestamp_format` string. Fallback to file read time on parse failure.
- All other top-level keys → `fields` map.
- Nested objects: serialize as JSON string in `fields`. Do not flatten.

**`logfmt` parser:** parse `key=value` pairs (with quote support). Extract same fields.

Parser failures are not errors — emit the line with `parser_error=true` field, original line as `message`, and emit counter `agent.logs.parse_errors{source=...}`.

### 4.4 Multiline Aggregation

Implement in `internal/logs/multiline/`:

1. When multiline enabled: a line matching `start_pattern` opens a new event.
2. Subsequent lines are appended to the current event's message until:
   - Another `start_pattern` match (close current, open new).
   - `max_lines` reached (close current as truncated).
   - `timeout_ms` elapsed since last line (close current).
   - File EOF.
3. Closed events go through the rest of the pipeline.
4. Memory cap per source: 256 KB. Truncate if exceeded.

### 4.5 Processing Pipeline

Implement in `internal/logs/processing/`:

Order of operations per log event:

1. Apply `include` rules. If any include rules exist and none match: drop, increment `agent.logs.filtered{reason="not_included"}`.
2. Apply `exclude` rules. If any match: drop, increment `agent.logs.filtered{reason="excluded"}`.
3. Apply `mask` rules in order. Each is a regex substitution.
4. Apply tag enrichment: add base agent tags (hostname, resource_id, agent_id, etc.).
5. **Apply tail sampling** per Section 4.7.
6. **Evaluate derived metric matchers** per Section 4.8 (parallel to log shipping, not blocking).
7. Hand off to buffer.

**Performance constraint:** All regex patterns compiled at config load. Reject malformed patterns with file:line at validation time. Pipeline throughput must exceed 50,000 lines/sec on a single core.

### 4.6 Buffer + Spool

Implement in `internal/logs/buffer/`:

1. In-memory ring: `max_memory_lines` capacity.
2. When ring is 80% full: start spilling to disk in `spool_dir` as gzipped JSONL files (1 MB each).
3. When transport recovers: drain spool files first (oldest first), then ring.
4. Hard cap: `max_disk_mb`. When exceeded: drop oldest spool files, increment `agent.logs.spool_dropped_files`.
5. Recovery on startup: scan spool_dir, queue all files for transmission.
6. Backpressure: when ring is 95% full, slow file tailer reads (sleep 100ms between reads).

### 4.7 Tail Sampling

**Per Section 4.7 of audit:**

When `sampling.enabled: true` AND log rate exceeds `rate_limit.max_lines_per_second`:

1. Logs with level in `keep_levels` are always kept (default: error, warn, fatal).
2. Other logs are sampled at `sample_rate_above_threshold` (default 10%).
3. Sampling is deterministic per-source: `keep = hash(message + timestamp) < threshold`.
4. Emit `agent.logs.sampled_total{kept|dropped}` counters.
5. Emit `agent.logs.sample_rate_active{source=...}` gauge.

When `on_exceed: "drop_oldest"`: classic ring buffer drop, no sampling.
When `on_exceed: "block"`: backpressure to file tailers; useful for ensuring no loss but may delay collection.

### 4.8 Log-Derived Metrics

**Per Section 4.8 of audit:**

Implement in `internal/logs/derived/`:

1. At config load: compile regex patterns for each derived metric.
2. In processing pipeline (after tag enrichment): for each log event, evaluate against all derived metric matchers.
3. **Counter type:** increment by 1 on match. Emit metric every collection cycle.
4. **Histogram type:** extract value from regex capture group, observe in histogram. Emit p50/p95/p99 + count + sum every cycle.
5. **Gauge type:** extract value from capture group, set as gauge value.
6. Tags: configurable `tags_from_fields` extracts values from parsed log fields.

Derived metrics are emitted via the normal metrics pipeline. They share `agent_id` and base tags with the log source.

**Performance:** Derived metric evaluation must add <10% overhead to log processing. If a regex is too expensive, reject at validation time.

### 4.9 Transport

Reuse the metrics transport pattern but with:
- Separate endpoint: `/api/v1/logs/ingest`.
- Separate retry state.
- Separate dead-letter directory: `/dead-letter/logs/`.
- Same retry semantics as metrics (Section 2.4).

### 4.10 PII Masking — Default Patterns

Ship default mask patterns that users can opt into via config:

```yaml
logs:
  processing_presets:
    enable_default_masks: ["password", "credit_card", "ssn_us", "email", "ipv4_private", "aws_access_key", "jwt"]
```

Document each default pattern in `docs/log-masking.md` with examples. Users who enable a preset get the patterns prepended to their own rules.

### 4.11 Acceptance Tests

- Tail a file, write 1000 lines, verify all delivered.
- Rotate file (move/create): verify no lines lost.
- Rotate file (copytruncate): verify no lines lost during copy window (document expected duplicates).
- Glob pattern picks up new files within 60s.
- JSON parser: malformed line emits parser_error=true.
- Multiline: 3-line stack trace coalesces into one event.
- Mask rule: `password=hunter2` becomes `password=[REDACTED]`.
- Backpressure: backend down for 5 min, agent spools to disk, no data loss after backend recovers.
- Disk cap: spool_dir limited to 100MB. Sustained backend outage drops oldest, never exceeds cap.
- Restart mid-flight: kill -9 during transmission, restart, verify all checkpointed lines delivered.
- **Sampling:** Generate 50k logs/sec with mixed levels. Verify all errors kept, info sampled to ~10%.
- **Derived metrics:** Generate logs matching `level=error`. Verify `app.errors_per_minute` metric appears with correct count.
- **High burst:** 100k log lines/sec for 60 seconds. Verify memory stays under 250 MB hard limit.

### 4.12 Exit Criteria

- Agent tails 5 files concurrently, ships logs reliably.
- Backend received logs match what was written to files (allowing for documented duplicate window).
- Memory usage with logs enabled: <80 MB at 1000 lines/sec sustained, <150 MB at 10k/sec burst.
- All acceptance tests pass.
- Capability flag in registration: `capabilities.logs = true`.
- Derived metrics flow through normal metrics pipeline.
- Sampling demonstrably reduces volume during burst.

---

## PHASE 5 — Correlation UI

**Duration:** 2 weeks
**Entry criteria:** Phases 0–4 complete. Metrics, logs, agent registry all working.
**Goal:** Single pane of glass for cloud + OS + logs per resource.

### 5.1 Resource Detail Page Restructure

Find the existing resource detail page (likely under `frontend/src/pages/ResourceDetailPage.tsx` or similar). Restructure to three-tab layout:

```
[Resource: i-0abc123def] (c5.2xlarge, us-east-1a) [Agent: Active v1.0.0, 8s ago]
─────────────────────────────────────────────────────────────────────────────
Tabs:
  [Cloud Metrics]  [OS Metrics]  [Logs]
─────────────────────────────────────────────────────────────────────────────
```

Each tab is independently functional. Shared time range picker at top.

### 5.2 Cloud Metrics Tab

Existing functionality. Adjustments:

- Use shared time range picker.
- Add agent status badge in header.
- Add "View OS metrics for same range" button → switches tab, preserves time range.

### 5.3 OS Metrics Tab

New tab. Predefined dashboard layout for the resource:

- Row 1: CPU (total + per-mode breakdown), Load avg
- Row 2: Memory (used/available), Swap
- Row 3: Disk usage per mount, Disk IO per device
- Row 4: Network per interface, TCP states
- Row 5: Top processes by CPU, Top by memory
- Row 6: Health score, Saturation projections
- Row 7 (if logs enabled): Log-derived metrics (error rate, request latency)

All panels query metrics filtered by `resource_id = ` AND `agent_id = `. Use the existing dashboard panel infrastructure (per Module 4).

If no agent is registered for this resource: show empty state with install instructions.

### 5.4 Logs Tab

Embedded log viewer:

- Filters: level (multi), service (multi from this resource's logs).
- Search box.
- Result list with virtualized scrolling (handle 10k results).
- "Live tail" toggle.
- Time range from shared picker.

Backed by `/api/v1/logs?resource_id=&start=...&end=...`.

### 5.5 Crosshair Synchronization

This is the kill feature. Make it work.

When user hovers a chart in the OS Metrics tab:

1. Existing crosshair shows on all charts in the tab (you have this).
2. **New:** the crosshair time is published to a shared store (`crosshairStore`).
3. **New:** "View logs at this time" button visible on every chart. Click → switches to Logs tab pre-filtered to ±30s window.
4. **New:** if Cloud Metrics tab is showing alongside (split view): same crosshair across all tabs.

For v1, keep it simple: a button "View logs at this time" on the metrics charts that opens logs tab pre-filtered to ±30s.

### 5.6 Alert Event → Logs Link

On alert event detail pages, add a "View logs around this time" link:

- Pre-filters by `resource_id` from alert tags (if present).
- Time range: ±5 min from `fired_at`.
- Service filter: any service that emitted logs with that resource_id in the window.

This is the "I got paged at 3 AM, what happened" workflow. Make it one click.

### 5.7 Agent Status Integration

Wherever a resource is shown (lists, dashboards, alerts), augment with agent status:

- Agent active: green dot.
- Agent stale (>90s): yellow dot, tooltip with last_seen.
- Agent crashed: red dot, "Last heartbeat 14 min ago".
- Agent replaced: blue dot, "Replaced by agent X at ".
- No agent: gray dot, "No agent installed".

### 5.8 Acceptance Tests

- Resource detail page loads <1s with all three tabs.
- Click between tabs preserves time range.
- "View logs at this time" jumps to correct time window.
- Alert event → logs link shows logs from correct resource and time.
- Agent status badge updates within 30s of state change.
- Resource with replaced agent shows history correctly.

### 5.9 Exit Criteria

- Resource detail page is the canonical "everything about one server" view.
- A user with metrics + logs + agent installed can answer "what was happening on i-0abc at 14:32" in <30 seconds.
- No regressions in existing dashboard / alert pages.

---

## PHASE 6 — Distribution and Hardening

**Duration:** 2 weeks
**Entry criteria:** Phases 0–5 complete.
**Goal:** Make the agent installable and updatable in real environments.

### 6.1 CI/CD Pipeline

Create `.github/workflows/release.yml`:

```yaml
on:
  push:
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - go test -race ./...
      - go test -bench=. ./... (regression check)
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

Create `install.sh` hosted at `https://get.neoguard.io/install.sh`:

```bash
#!/bin/sh
# Usage: curl -fsSL https://get.neoguard.io/install.sh | sh -s -- --api-key=KEY --endpoint=URL
```

The script:

1. Detects OS (linux/darwin) and arch (amd64/arm64).
2. Detects init system (systemd/openrc/none).
3. Downloads matching .deb/.rpm/.tgz.
4. Verifies checksum.
5. Verifies cosign signature (if cosign is present, optional).
6. Installs.
7. Writes minimal config to `/etc/neoguard/agent.yaml` from flags.
8. Enables + starts the service.
9. Waits 30s for first metric, prints success/failure with debug instructions.

Refuses to install if:
- Existing agent is already installed (suggest upgrade command).
- Required dependencies missing (curl, gpg if signature checking).
- API key flag missing.

### 6.3 [REMOVED — K8s descoped from v1]

Kubernetes DaemonSet, Helm chart, downward API, pod metadata enrichment are all post-v1 (Phase 7+).
v1 distribution targets: .deb, .rpm, .msi, Docker image (for containerized servers, not K8s orchestration).

### 6.4 Documentation

Required docs in `docs/`:

| File | Content |
|---|---|
| `getting-started.md` | 5-min path: install → see metrics in UI |
| `configuration.md` | Every config field, default, example |
| `metrics-catalog.md` | Every metric emitted, units, tags, platform |
| `log-collection.md` | Setting up log sources, parsers, masking, derived metrics |
| `troubleshooting.md` | Common issues: no metrics, agent offline, parse errors, clock skew |
| `architecture.md` | How the agent works internally |
| `security.md` | Threat model, what the agent can/can't access |
| `compliance.md` | **NEW.** Compliance posture (per Section 6.7) |
| `cli.md` | All CLI commands and flags |
| `kubernetes.md` | DaemonSet deployment guide |
| `upgrading.md` | Version upgrade procedures |
| `dependencies.md` | Direct dependency list, justification, license |
| `scaling.md` | **NEW.** Documented scaling limits per Section 1.7 |

Each doc has a "Last updated" date and a "Verified on version" header. CI checks docs are not stale (>2 versions behind).

### 6.5 Chaos Tests

Create `test/chaos/`:

- `network_partition_test.sh`: agent runs, drop egress for 5 min via iptables, restore, verify no data loss after recovery.
- `disk_full_test.sh`: fill /var, verify agent doesn't crash, emits backpressure metrics.
- `oom_test.sh`: limit cgroup memory to 50 MB, verify agent stays under limit or fails gracefully.
- `crash_recovery_test.sh`: kill -9 during heavy load, verify <1s recovery, data integrity.
- `clock_skew_test.sh`: jump system clock backward 5 min, verify agent handles gracefully.
- `clock_jump_forward_test.sh`: jump forward 1 hour, verify rate computers reset.
- `nfs_hang_test.sh`: hang an NFS mount, verify only that mount times out.
- `log_burst_test.sh`: 100k logs/sec for 60s, verify memory stays under hard limit.

These run in nightly CI, not per-PR.

### 6.6 Performance Regression Suite

Create `test/perf/`:

Track these metrics across releases. Fail CI if any regress >10% from baseline:

- Collection cycle latency (p50, p99) on 100/500/1000 process system.
- Memory steady state (200 metrics, no logs).
- Memory steady state (200 metrics + 1000 logs/sec).
- Memory under burst (200 metrics + 10k logs/sec).
- CPU steady state.
- Startup time.
- Binary size.
- Goroutine count.
- Log processing throughput (lines/sec/core).

Baselines stored in `test/perf/baselines.json`, updated only by explicit commit (review).

### 6.7 Compliance Posture Documentation

Create `docs/compliance.md`:

Document explicitly (this is not a compliance certification, it's transparency):

1. **Data the agent can read:** `/proc`, `/sys`, configured log files. Lists all paths.
2. **Data the agent transmits:** OS metrics, configured log files, agent self-metrics. Does not transmit: file contents outside configured log paths, environment variables, command-line arguments (unless `process.collect_cmdline: true`).
3. **Data at rest:** WAL files in `` contain potentially-PII metric tags and log lines. Disk encryption is the customer's responsibility.
4. **PII handling:** PII masking is opt-in. Document defaults clearly. Customers responsible for configuring masks for their data.
5. **Audit log:** Agent-side audit log of "what was sent" is not provided. Customers should log at the backend.
6. **Data residency:** Agent ships to configured endpoint. Customer chooses backend region.
7. **Retention:** Agent buffers up to `max_disk_mb` of logs locally during backend outages. Default 500 MB. Document.
8. **Encryption in transit:** TLS 1.2+ enforced. Custom CA bundle supported.

This is descriptive, not prescriptive. Customers in regulated environments use this to assess fit.

### 6.8 Acceptance Tests

- `curl ... | sh` install on Ubuntu 22.04, Debian 12, Amazon Linux 2023, RHEL 9, Windows Server 2022 — all succeed and produce metrics in <60s.
- Kubernetes DaemonSet installs on a 3-node cluster (kind/minikube), all pods running, all nodes producing metrics.
- Cosign verification works for binary, .deb, .rpm, Docker image.
- All chaos tests pass.
- Performance regression suite clean.

### 6.9 Exit Criteria

- Tagged release `v1.0.0-rc1` is installable via every distribution channel.
- Documentation site is complete and accurate.
- Performance baselines locked.
- Internal demo: install on a fresh server, see metrics + logs in UI in <60s.

---

## PHASE 6.5 — Soak Testing and Stability

**Duration:** 1 week
**Entry criteria:** Phase 6 complete. v1.0.0-rc1 tagged.
**Goal:** Validate long-running correctness before declaring v1.0.0 stable.

This phase is dedicated to running the agent under realistic conditions for extended periods. Memory leaks, goroutine leaks, and slow degradation only manifest at day 7-30, not in unit tests.

### 6.5.1 24-Hour Soak Test (Mandatory, CI Nightly)

Setup:
- 1 agent instance, default config + logs enabled.
- Generate sustained load: 200 metrics/cycle, 1000 logs/sec.
- Capture pprof heap, goroutine, cpu profiles every hour.

Pass criteria:
- Memory at hour 24 is within 10% of memory at hour 1.
- Goroutine count at hour 24 ≤ goroutine count at hour 1 + 5.
- No panics, no fatal errors in log.
- Backend received metrics: continuous, no gaps >2 minutes.
- Backend received logs: 0% loss accounting for documented sampling.

### 6.5.2 7-Day Soak Test (Pre-Release Gate)

Setup:
- 5 agent instances on different hosts (mix of cloud providers, container/baremetal).
- Realistic workload: idle most of the time, simulated incident bursts every 6 hours.
- Run for 7 consecutive days.

Pass criteria:
- All instances running at end of test.
- No memory leak detectable (heap stable across days).
- Backend agent registry shows all 5 as active throughout.
- WAL replay tested: kill -9 one instance every 24h, verify recovery.
- Custom CA rotation tested mid-test.
- API key rotation tested mid-test.

This test is run before tagging v1.0.0 (not v1.0.0-rc).

### 6.5.3 Resource Leak Audit

Manual review with pprof comparison:

- Heap diff between hour 0 and hour 24. Investigate any growth >5%.
- Goroutine inventory: every goroutine traceable to a known source.
- File descriptor count stable.
- Specifically audit:
  - Rate computer eviction (no leak in stale entries)
  - Process cache eviction (capped correctly)
  - File tailer fd cleanup (closed on rotation)
  - Retry queue draining (not infinite growth)
  - Multiline aggregator (events closed on timeout)
  - HTTP client connection pooling (no fd leak)

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

## Section 5: Out of Scope for v1

The following are explicitly deferred to v1.x or later. Do not implement them in v1, even if they seem easy.

- StatsD receiver
- OTLP receiver (metrics, logs, traces — all of it)
- Application integrations (nginx, postgres, redis, docker, mysql)
- Distributed tracing
- Anomaly detection
- Adaptive collection intervals
- Delta-only transmission
- Auto-update mechanism
- Remote configuration push
- mTLS transport (one-way TLS with optional cert pinning is in v1)
- Agent-to-agent mesh
- eBPF
- Windows Performance Counters (.NET CLR, IIS, SQL Server)
- GPU metrics (NVIDIA NVML)
- Prometheus remote_write output (local /metrics endpoint exists in v1)
- Multiple output destinations
- MessagePack/Protobuf wire format (negotiation infrastructure exists, payloads are JSON)
- Profiling (continuous)
- Custom binary format
- Helm chart (raw manifests are sufficient for v1)
- Auto-discovery of services (port → integration suggestion)
- Dependency mapping
- Fleet fingerprinting
- Predictive alerting
- macOS as a supported platform (build only, no SLA)
- Per-agent enrollment tokens (shared API key per fleet is v1; document the limit)
- Forwarder/aggregator tier (direct push only in v1; document scaling limit)
- GCP cloud identity resolution, GCE collectors, any GCP-specific behavior

If any of these become customer-blocking, that's a v1.x discussion. In v1, they don't exist.

---

## Section 6: Definition of Done for v1.0.0

A release is `v1.0.0` when:

1. **All 7 phases (0 through 6.5) are complete and merged.**
2. **All acceptance tests pass in CI.**
3. **Performance metrics meet v1 targets** (Section 1.2).
4. **No P0 or P1 findings** open against the agent codebase (use the same severity discipline as `FINDINGS.md`).
5. **Documentation is complete** (Section 6.4).
6. **Internal demo passes:** fresh Ubuntu server → curl install → metrics + logs visible in UI within 60 seconds.
7. **Internal pilot:** at least 3 pilot customers running v1 for ≥7 days with no critical incidents.
8. **Release artifacts signed:** binaries, packages, container images all cosign-signed.
9. **Changelog written:** `CHANGELOG.md` with every user-visible change.
10. **Soak tests passed:** 24-hour and 7-day soak both green.

---

## Section 7: How to Work Within This Plan

For the executor:

1. **Always read the entry criteria before starting a phase.** If unmet, stop and report.
2. **Always verify the exit criteria before marking a phase complete.** Self-check, then ask for review.
3. **Implement in the order specified within a phase.** Sub-tasks have implicit dependencies.
4. **Write tests first, or at least concurrently.** No code merges without tests for new behavior.
5. **Reference the FINDINGS.md severity discipline.** P0/P1 in this codebase = block release.
6. **When in doubt, surface the question.** Do not silently invent specs.
7. **Match existing codebase patterns.** If the backend uses asyncpg with explicit columns (per SEC-011), new agent endpoints do too. If frontend uses Zustand stores reset on tenant switch (per FE-009), agent UI does too.
8. **Every commit message references the phase and section.** `Phase 2.6: implement process PID cache`.
9. **At end of each phase, update `CHANGELOG.md` and the phase tracker.**
10. **Do not mark a phase complete with TODO comments in shipped code.** TODOs get resolved or filed as issues before merge.
11. **Boundary conditions in Section 4 are spec, not aspirational.** If you can't make them work, the implementation is wrong, not the spec.
12. **Memory and CPU targets in Section 1.2 are gates.** Failing performance regression CI blocks merge.

---

## Section 8: Quick Reference — Phase Summary

| Phase | Duration | Focus | Critical Outputs |
|---|---|---|---|
| 0 | 2 wk | Correctness foundation | WAL durability, retry safety, identity, clock, container, CA bundle |
| 1 | 2 wk | Backend agent registry | `/agents` endpoint + UI, lifecycle events, duplicate handling |
| 2 | 2 wk | Metrics polish | CLI tools, config reload, filtering, /metrics endpoint, perf |
| 3 | 2 wk | Backend logs hardening | Schema, ingest, query API, search UI |
| 4 | 3 wk | Agent log shipping | Tailer, parsers, multiline, masking, sampling, derived metrics |
| 5 | 2 wk | Correlation UI | Three-tab resource view, crosshair sync |
| 6 | 2 wk | Distribution | CI/CD, installer, K8s, docs, compliance posture |
| 6.5 | 1 wk | Soak testing | 24h + 7-day stability validation |
| **Total** | **16 wk** | | **v1.0.0 release** |

16 weeks calendar. If any phase slips, the slip is reported, not absorbed silently. Realistic delivery: end of week 16.

---

## Section 9: Changes from v1.0 of This Plan

For reviewer context:

- **Phase 0 expanded from 1 to 2 weeks.** Added identity fallback chain, clock skew handling, container awareness, custom CA bundle. These are correctness foundations, not nice-to-haves.
- **Phase 4 expanded from 2 to 3 weeks.** Added log-derived metrics and tail sampling. Operations teams need both for incident response.
- **Phase 6.5 added (1 week).** Soak testing is now a gating phase, not a checkbox in Phase 6.
- **Section 3 (Boundary Conditions) added.** Clock skew, identity resolution, container awareness, duplicate resource_id, file rotation, and memory pressure are now binding spec rather than implicit assumptions.
- **Section 1.4 added.** Explicit rationale for separated logs and metrics pipelines.
- **Section 1.7 added.** Documented scaling limits (5k agents per backend, forwarder tier deferred to v2).
- **Section 2.5 added.** Wire protocol version negotiation.
- **Section 2.6 added.** Forward compatibility for non-JSON payload formats.
- **Heartbeat interval is now configurable** (Section 2.3 and 1.5 of Phase 1). Default 30s, range 10-300s.
- **`agent_id` is now a tag on every metric and log point** (Section 2.1, 2.2). Required for duplicate `resource_id` disambiguation.
- **Local `/metrics` endpoint added to Phase 2** (Section 2.8). Default-on Prometheus exposition for debuggability.
- **Compliance posture documentation added** (Section 6.7). Transparency, not certification.
- **Hard memory limits added** for burst scenarios (Section 1.2).
- **Forbidden licenses listed explicitly** (Section 1.1).
- **Throughput profiles documented** (Section 6.5.4) — small/medium/large server targets.

The plan is 3 weeks longer than v1.0 (16 vs 13). The added time covers correctness foundations and stability validation that v1.0 deferred or omitted entirely.

---

## Section 10: Open Questions for the Executor

Before starting Phase 0, the executor MUST answer the following questions in writing. If any answer is unclear, stop and ask before coding.

1. **Where is the v0.2 codebase?** Path on disk or repository URL.
2. **What is the current state of `<state_dir>`?** Default path on Linux, Windows. Permissions. Created by installer or by agent on first run?
3. **Where does the backend currently run in dev?** localhost:8000? docker-compose? Both?
4. **Are there existing FINDINGS.md entries for the agent specifically?** EXP-001 through EXP-018 are referenced — confirm they exist in the canonical findings doc.
5. **What is the current `/api/v1/metrics/ingest` schema on the backend?** Confirm Section 2.1 matches reality, not aspirational. If the backend currently expects different fields, that's a Phase 0 task: align them.
6. **Does the backend currently accept `agent_id` in metric tags?** If not, Phase 0 includes a backend migration to allow it.
7. **What ClickHouse instance is available?** Required for Phase 3. If none, Phase 3 cannot start.
8. **What is the existing resource detail page route?** Phase 5 modifies it. The executor must locate it before Phase 5.
9. **Are there pilot customers identified for the v1 release gate?** Definition of Done item 7 requires 3 pilots. Surface this question before Phase 6.
10. **Who reviews phase exits?** Self-review is allowed for sub-tasks; phase exits require human review. Confirm the reviewer.

---

## Section 11: Failure Modes and Escalation

This document is binding, but it is not omniscient. The executor will encounter situations the plan did not anticipate. Handle them as follows:

### 11.1 Spec Conflicts

If two sections of this document conflict (e.g., Section 1.2 memory limit vs Phase 4 acceptance test memory expectation):

1. Stop work.
2. Document the conflict in writing: which sections, what they say, what the implementer believes is correct.
3. Surface to the human reviewer.
4. Do not pick a side and continue.

### 11.2 Spec Gaps

If the document does not specify behavior for a real situation (e.g., what happens if the WAL directory is on a read-only filesystem):

1. Document the gap.
2. Propose three options with tradeoffs.
3. Surface to reviewer.
4. Do not invent a spec and ship it.

### 11.3 Spec Errors

If the document specifies something that is technically wrong (e.g., a regex that doesn't compile, a Go API that doesn't exist):

1. Document the error.
2. Propose a correction.
3. Surface to reviewer.
4. Do not silently work around it.

### 11.4 Schedule Slippage

If a phase is going to take significantly longer than estimated:

1. Stop and assess at the 50% mark of the estimated duration.
2. If on track: continue.
3. If 25%+ behind: report immediately, do not absorb the slip silently.
4. Phases may be re-estimated, but never silently extended.

### 11.5 Test Failures After Merge

If a test passes locally but fails in CI, or fails intermittently:

1. Do not retry-merge.
2. Investigate root cause.
3. Flaky tests are bugs. Fix or skip with explicit `t.Skip("documented reason")`.
4. Never disable a test to make CI green.

---

## Section 12: Phase Tracker (Update on Every Commit)

Maintain a `PHASE_TRACKER.md` file at the root of the agent repo. Update on every PR merge.

```markdown
# NeoGuard Agent — Phase Tracker

**Plan version:** 2.0
**Current phase:** Phase 0
**Started:** YYYY-MM-DD
**Target completion:** YYYY-MM-DD

## Phase Status

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 0 — Correctness Foundation | In Progress | 2026-MM-DD | — | 4/9 sub-tasks complete |
| 1 — Agent Registry | Not Started | — | — | — |
| 2 — Metrics Polish | Not Started | — | — | — |
| 3 — Logs Backend | Not Started | — | — | — |
| 4 — Logs Agent | Not Started | — | — | — |
| 5 — Correlation UI | Not Started | — | — | — |
| 6 — Distribution | Not Started | — | — | — |
| 6.5 — Soak Testing | Not Started | — | — | — |

## Active Sub-Tasks (Phase N)

- [x] 0.1 WAL compaction fix (PR #42)
- [x] 0.2 Retry exhaustion fix (PR #43)
- [x] 0.3 process_cmdline opt-in (PR #44)
- [x] 0.4 Configurable health bind (PR #45)
- [ ] 0.5 Pre-warm rate computers
- [ ] 0.6 Identity fallback chain
- [ ] 0.7 Clock skew handling
- [ ] 0.8 Container-aware GOMAXPROCS
- [ ] 0.9 Custom CA bundle support

## Blockers

(none) |

## Open Questions Awaiting Reviewer

(none) |

## Risks

(none identified) |
```

---

## Section 13: Glossary

Terms used in this document:

- **Agent:** the `neoguard-agent` binary running on a customer host.
- **Backend:** the NeoGuard SaaS application that receives data from agents.
- **Resource:** a cloud-discovered or agent-reported entity (EC2 instance, Azure VM, on-prem host).
- **`resource_id`:** stable identifier of a resource. From IMDS for cloud resources, machine-id for on-prem, hostname as last-resort fallback.
- **`agent_id`:** UUID identifying a specific agent installation. Stable across restarts. Deterministic from `resource_id` when possible.
- **Tenant:** customer account boundary. All data is scoped by tenant.
- **WAL:** Write-Ahead Log. Disk-backed buffer for crash resilience.
- **Dead letter:** batch that exhausted retries and was written to disk for manual inspection.
- **IMDS:** Instance Metadata Service (AWS, Azure cloud-internal HTTP endpoint for instance identity).
- **PII:** Personally Identifiable Information. Logs may contain PII; masking is opt-in.
- **Tail sampling:** sampling decision made after a log line is parsed, allowing level-aware retention.
- **Derived metric:** a metric emitted by the agent based on patterns matched in log lines.
- **Forwarder tier:** a hypothetical intermediate aggregation layer between agents and backend. Not in v1.
- **Schema version:** integer version of the wire protocol. Negotiated at registration.
- **Soak test:** long-duration test (24h, 7d) to detect leaks and slow degradation.
- **Boundary condition:** a normal operating condition (clock skew, container limits, file rotation) that must be handled correctly. Not an edge case.

---

## Section 14: Sign-Off

This document, version 2.0, supersedes all prior execution plans for the NeoGuard Agent v1.0.0 release.

The executor begins Phase 0 only after:

1. Section 10 questions are answered in writing.
2. Section 12 PHASE_TRACKER.md is created.
3. Reviewer has acknowledged the plan and confirmed scope.

**Estimated total duration:** 16 weeks.
**Estimated total effort:** 1 senior engineer full-time, or equivalent.
**Definition of done:** Section 6.

---

**End of document. Begin with Section 10 questions, then Phase 0.**
That's the complete v2.0 plan. It's now 14 major sections covering 16 weeks of execution, with binding boundary conditions, soak testing as a gating phase, wire protocol version negotiation, and explicit failure mode handling.

A few notes on what to do next:

Save this as AGENT_EXECUTION_PLAN.md in your repo root. Claude (or whoever executes) should treat it as the canonical reference.
Answer Section 10 questions before handing off. Several of them require knowledge only you have — codebase paths, backend state, pilot customer identity. Without those answers the executor will either stall or guess.
Create the PHASE_TRACKER.md stub file before Phase 0 begins. This is how you maintain visibility without micromanaging.
The 16-week estimate assumes one focused engineer. If Claude is splitting attention across other tasks, scale accordingly. If you have multiple engineers, Phases 1 and 3 (backend) can parallelize with agent work in Phase 2; the rest is mostly serial.
If you want, I can also produce:

A condensed "executor handoff brief" (1-2 pages) that summarizes the plan for someone reading it cold
A test plan document that consolidates all acceptance tests across phases into one trackable list
A risk register that surfaces the top 10 things most likely to derail the plan, with mitigations
Let me know which would help.


and after reviewing the above document , here's the updated changes that need to be kept in mind and implemented as listed below
Critical Issue 2 — WAL Framing — VALID, ADD TO PHASE 0
This is the single most legitimate critique. My plan says "fix WAL compaction" but doesn't define the WAL frame format. ChatGPT is correct: without [length][crc32][payload] framing, you can't recover from partial writes, power loss, or torn pages.

Action: Add to Phase 0.1 explicitly:

WAL frame format:
  [4-byte length BE] [4-byte CRC32 of payload] [payload bytes]

Reader:
  - On length read failure: EOF, normal end.
  - On CRC mismatch: log corruption, skip frame, continue.
  - On length-but-no-payload: partial write detected, truncate WAL at last good frame.
  - Emit agent.wal.frames_corrupted counter on every skip.

WAL header (first 16 bytes of file):
  [magic "NGWAL\0\0\0"] [4-byte schema_version] [4-byte reserved]

On startup: verify magic, verify version. Mismatch → rename to .corrupted, start fresh.
This is real. Add it.

Critical Issue 8 — Self-Protection / Collector Isolation — VALID, ADD TO PHASE 0
ChatGPT is right and I missed this. My plan has per-collector timeouts but doesn't define what happens when a collector is consistently slow or panics.

Action: Add to Phase 0:

Collector supervision:
  - Each collector wrapped in panic-recover. Panic → log, mark collector "degraded", skip cycle.
  - 3 consecutive timeouts → mark "degraded" for 5 minutes (skip entirely).
  - 3 consecutive panics → mark "disabled" until restart.
  - Emit agent.collector.state{name, state="healthy|degraded|disabled"} gauge.
  - Health endpoint /healthz reflects aggregate: healthy if ≥80% collectors healthy.
  - Log loop has its own goroutine separate from collection. Collector hang cannot stall heartbeat.
This is correct senior-level systems thinking. Add it.

Critical Issue 5 — Secrets Strategy — PARTIALLY VALID
ChatGPT says "weak remediation" but my plan does have api_key_file. The legitimate addition is api_key_command:

neoguard:
  api_key_command: "vault read -field=key secret/neoguard"
  api_key_command_refresh_interval_seconds: 3600
This is 1 day of work and unlocks Vault/aws-cli/azure-cli integration without bespoke backends.

Action: Add api_key_command to Phase 2.3. Don't add Vault/AWS Secrets Manager native integrations — those are dependency bloat. The command pattern is the universal escape hatch.

Critical Issue 7 — Health Score Misleading — VALID, IMPORTANT
ChatGPT is correct. A weighted average that says "78/100" when disk is 99% full is exactly the kind of "executive candy" that gets people paged at 3 AM for an outage they could have prevented.

Action: Add to Phase 0 (it's a correctness issue, not a feature):

Health score with hard caps:
  - Compute weighted base score (existing logic).
  - Apply hard caps:
    - disk usage >95% on any mount → score = min(score, 40)
    - memory pressure >90% → score = min(score, 50)
    - load avg > 4× CPU count → score = min(score, 50)
    - swap usage >50% with low free memory → score = min(score, 40)
  - Emit accompanying agent.health.cap_applied{reason} counter when cap fires.
  - Publish individual sub-scores alongside composite. Composite is summary, sub-scores are truth.
Critical Issue 3 — Process Cardinality Beyond cmdline — VALID
I addressed cmdline but not PID churn from K8s jobs / CI runners / ephemeral workers. ChatGPT is right that on K8s nodes this gets out of hand.

Action: Add to Phase 2.6 (process collector work):

process:
  collect_cmdline: false
  top_n: 20  # only top N by CPU and memory
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
    - "^$$"  # kernel threads
Aggregation collapses N processes matching a pattern into a single metric set with process_group=python.

What ChatGPT Got Half-Right
Critical Issue 1 — JSON Bottleneck — OVERSTATED
My plan already has this in Section 2.6:

> v1 always uses JSON. Do not implement Protobuf in v1. v2+ agents MAY negotiate application/x-protobuf if both support it.

ChatGPT says "still too weak." I disagree. The only thing I'd add: a serializer interface inside the codebase so v1.x adds Protobuf without rewriting transport.

type Serializer interface {
    Marshal(batch *Batch) ([]byte, error)
    ContentType() string
}

// v1: jsonSerializer{} only
// v1.x: protobufSerializer{} added, negotiated
That's an internal abstraction, 2 hours of work, no observable behavior change. Add it to Phase 0 as a one-liner.

But "you'll have a JSON crisis at 10k agents" is fearmongering for v1. By the time you hit 10k agents you'll have Series B funding and a dedicated platform team. Build for the limit you'll hit next quarter, not the limit you might hit in two years.

Critical Issue 4 — Direct Push Ceiling — OVERSTATED
ChatGPT says "1-5k is optimistic" and recommends Kafka/NATS/Redis Streams now.

Disagree. Adding a queue layer in v1 is exactly the kind of premature complexity that will sink the project. Your backend (per FINDINGS.md) is already TimescaleDB + ClickHouse + Redis + a fully-featured FastAPI app. You don't have capacity to operate a Kafka cluster.

What I'd add: ingest endpoint hardening, not architecture change.

Backend protections (add to Phase 1 or Phase 3):
  - Per-tenant ingest rate limit (sliding window).
  - Concurrent connection limit per agent_id (max 2).
  - Body size enforcement at the edge before parsing.
  - Async insert into TimescaleDB/ClickHouse (don't hold connection open during write).
  - Circuit breaker: if DB write latency p99 > 5s for 30s, return 503 to all ingest.
  - Document: "if you exceed 5000 agents, design v2 forwarder tier — do not paper over with config tuning."
This handles the "retry storm amplifier" problem ChatGPT raised without adopting Kafka.

Critical Issue 6 — Logs Will Destroy Simplicity — CORRECT WARNING, WRONG CONCLUSION
ChatGPT says: "Do NOT implement logs in same release cycle. Metrics pipeline maturity first."

Half right. The warning is real — logs add 10x complexity. My plan accounts for this by giving logs a full 3-week phase (4) plus its own backend phase (3). And explicitly excluding traces, OTLP, and integrations.

But "metrics first, logs later" misreads your business case. Per your earlier conversation, the differentiation is cloud + OS + logs in one pane. Without logs, you're "Prometheus + Grafana but SaaS." That's not a business.

What I would add: an explicit "circuit breaker" — if Phase 4 acceptance tests fail or memory targets blow out, defer logs to v1.1 rather than ship broken.

Phase 4 abort criteria (add to phase exit):
  - If memory under 1000 logs/sec sustained exceeds 120 MB hard limit: STOP.
  - If processing pipeline throughput < 30,000 lines/sec single-core: STOP.
  - On STOP: defer Phase 4 to v1.1, ship metrics-only v1.0.
  - Do not absorb performance failures by relaxing targets.
Critical Issue 9 — Capability Negotiation — VALID, MINOR
My plan has static capabilities. ChatGPT is right that this gets brittle. But the fix is small:

Action: Extend Section 2.3 register payload:

"capabilities": {
  "metrics": true,
  "logs": false,
  "max_payload_bytes": 5242880,
  "compression": ["gzip"],
  "schema_versions": [1],
  "collectors": ["cpu", "memory", "disk", "diskio", "network", "..."]
}
Backend uses this to know "this agent can't send logs even if you push config to enable it." Trivial addition.

What ChatGPT Got Wrong
"DO NOT BUILD EVERYTHING YOURSELF" — Integrate Vector/FluentBit/OTel — WRONG FOR YOUR POSITIONING
This is the single biggest mistake in the review. ChatGPT recommends:

> INTEGRATE THESE: > - logs via Vector/FluentBit > - traces via OTel Collector > - app metrics via OTLP > - integrations via exporters

This kills your differentiation.

Your pitch is "one binary, one config, 30 seconds to install." If users have to install NeoGuard Agent + Vector + OTel Collector to get full observability, you're not lightweight anymore — you're "yet another control plane that orchestrates three other agents."

The whole reason customers would pick you over Datadog is not that you have more features — it's that you replace 3-5 agents with 1 binary. ChatGPT's recommendation gives that up.

What's correct in this critique: don't build StatsD, OTLP, traces, or 50 integrations in v1. My plan already excludes those. But the long-term answer is "we build the metrics + logs path well, and much later add OTLP receiver to absorb application telemetry." Not "outsource logs to Vector."

Action: Ignore this recommendation. Stay the course on single-binary metrics + logs.

"P0: backend ingest queue (Kafka/NATS/Redis Streams)" — WRONG TIMING
Already addressed above. v1 doesn't need Kafka. Document the scaling limit, harden the ingest endpoint, design v2 forwarder when you actually approach 5k agents.

Updated Patches to Apply
Here's what I'd actually add to v2.0 of the plan:

Phase 0 additions:
0.1 update: Define WAL frame format ([length][crc32][payload]), magic+version header, corruption skip logic, recovery counter.
0.10 (new): Collector supervision and isolation. Panic recover, degraded/disabled states, watchdog timeouts.
0.11 (new): Health score hard caps. Disk/memory/load thresholds that override weighted score. Sub-score publication.
0.12 (new): Serializer interface abstraction. v1 has only jsonSerializer, but the interface exists for future codecs.
Phase 2 additions:
2.3 update: api_key_command config option for Vault / cloud secret manager integration via shell execution.
2.6 update: Process aggregation rules (collapse python/node/kube-job-* by pattern), ignore_patterns for kernel threads.
Phase 1 / 3 additions:
Backend ingest hardening: per-tenant rate limits, connection caps, async DB insert, circuit breaker on slow DB writes.
Section 2.3 update:
Capability negotiation extended with max_payload_bytes, compression, schema_versions, collectors list.
Phase 4 addition:
Abort criteria: memory or throughput targets missed → defer logs to v1.1, ship metrics-only.
Net Assessment
Total additional work from valid critiques: ~5-7 days.

Patch	Effort	Worth It?
WAL framing + CRC + recovery	2 days	Absolutely yes
Collector supervision	1.5 days	Absolutely yes
Health score hard caps	0.5 day	Absolutely yes
Process aggregation	1 day	Yes
api_key_command	0.5 day	Yes
Serializer interface	0.25 day	Yes (cheap insurance)
Capability negotiation extension	0.5 day	Yes
Phase 4 abort criteria	0 (doc only)	Yes
Backend ingest hardening	2 days (in Phase 1/3)	Yes
Kafka/NATS queue tier	2 weeks	No
Outsource logs to Vector	rewrite	No
JSON → Protobuf rewrite	weeks	No
Total real additions: about a week. Updated plan duration: 17 weeks instead of 16.
