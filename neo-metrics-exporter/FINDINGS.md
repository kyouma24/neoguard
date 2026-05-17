# NeoGuard Agent — Findings Tracker

**Source:** Hostile review (2026-05-13)
**Review document:** `docs/neo-metrics-exporter-review.md`

---

## Critical

### EXP-001: WAL compaction writes empty file
- **Priority**: P0
- **Status**: Fixed (Phase 0.1)
- **Evidence**: `internal/buffer/wal.go` — full rewrite with binary framing [4B length][4B CRC32][payload], versioned header, proper compaction (writes ring data to tmp, fsync, atomic rename). 8 crash tests in `wal_crash_test.go`.
- **Impact**: Data loss on crash after compaction
- **Date**: 2026-05-13

### EXP-002: transmitBatch drops data on send failure
- **Priority**: P0
- **Status**: Fixed (Phase 0.2)
- **Evidence**: `internal/agent/agent.go:transmitBatch()` — re-enqueues at front with retry_count++. After 3 cycles: dead-letter to `<dir>/<timestamp>-<retry>.jsonl.gz`. Permanent errors (401/403/422) drop without dead-letter. `internal/transport/deadletter.go` + 7 acceptance tests.
- **Impact**: Silent metric loss during network outages >3 retries
- **Date**: 2026-05-13

### EXP-003: No tenant_id in MetricBatch being sent
- **Priority**: P0
- **Status**: Won't Fix — Backend uses API key's tenant (NG-004 fix ensures tenant from auth only). Implicit contract is correct by design.
- **Evidence**: Backend ignores `batch.tenant_id`, always uses authenticated tenant_id
- **Date**: 2026-05-13

---

## High

### EXP-004: No certificate pinning or CA bundle management
- **Priority**: P1
- **Status**: Fixed (AGENT-006, 2026-05-15)
- **Evidence**: Default system CA only. No custom CA config option.
- **Impact**: Silent connection failure on minimal containers
- **Resolution**: Added `ca_bundle_path` config field with absolute path validation, PEM certificate parsing, and additive trust semantics (SystemCertPool + custom CA). Both metrics and lifecycle clients use shared TLS helper. Documented in `docs/configuration.md`. Tests verify custom CA acceptance, wrong CA rejection, and platform default preservation.
- **Date**: 2026-05-13

### EXP-005: SIGHUP reload is partial — undocumented subset
- **Priority**: P2
- **Status**: Deferred (post-v1)
- **Evidence**: `reload_linux.go` applies extra_tags, file_watch, process, disabled collectors, logging — NOT intervals, transport, buffer
- **Impact**: Operational confusion
- **Date**: 2026-05-13

### EXP-006: Process collector cmdline in tags = cardinality bomb
- **Priority**: P0
- **Status**: Fixed (Phase 0.3)
- **Evidence**: `process_cmdline` default off. When enabled: sanitize (hash hex tokens + long digits with H: prefix for idempotency) → UTF-8-safe truncate to 128 bytes. Activity counter emitted. Documented in `docs/cardinality.md`.
- **Impact**: DB bloat, slow queries, potential storage exhaustion
- **Date**: 2026-05-13

### EXP-007: First collection delayed by random jitter
- **Priority**: P1
- **Status**: Fixed (Phase 0.5)
- **Evidence**: `warmUpCollectors()` runs inside `runCollectors` after jitter sleep, immediately before first `collectOnce`. Rate computers and gopsutil CPU state are seeded. First visible collection produces valid `_per_sec` metrics. Jitter preserved for backend load spreading.
- **Impact**: Bad first-run experience
- **Date**: 2026-05-13

### EXP-008: Health server binds only to 127.0.0.1
- **Priority**: P1
- **Status**: Fixed (Phase 0.4, 2026-05-15)
- **Evidence**: `internal/config/config.go` added `health.bind` config field with validation. `internal/healthz/server.go` accepts bind parameter in `New()`. Default: `127.0.0.1:8282`. Configurable to `0.0.0.0:8282` or any valid host:port.
- **Impact**: Broken container/orchestrator health checks (Docker health-cmd, external monitors)
- **Resolution**: Health server bind address is now configurable via `health.bind` config field. Supports `host:port` format with validation. Backward compatible with deprecated `health.port` field (maps to `127.0.0.1:<port>`). Documented in `docs/configuration.md`.
- **Date**: 2026-05-13 (found), 2026-05-15 (fixed)

---

## Medium

### EXP-009: No metric deduplication
- **Priority**: P2
- **Status**: Deferred (backend handles via TimescaleDB upsert)
- **Evidence**: WAL replay can re-send same timestamps
- **Impact**: Wasted bandwidth
- **Date**: 2026-05-13

### EXP-010: cpu.PercentWithContext blocks for 1 second
- **Priority**: P2
- **Status**: Deferred (addressed partially by Phase 0.5 pre-warm)
- **Evidence**: gopsutil's Percent with interval=0 reads /proc/stat twice
- **Impact**: First collection slower
- **Date**: 2026-05-13

### EXP-011: No signal to NeoGuard when agent stops
- **Priority**: P1
- **Status**: Fixed (AGENT-002 - lifecycle client with register/heartbeat/stopping)
- **Evidence**: `internal/agent/agent.go` now calls `sendStopping()` with 5s timeout before shutdown. Backend receives `/api/v1/agents/stopping` with `agent_id_external` and reason (`SIGTERM`).
- **Impact**: Can't distinguish planned vs unplanned downtime
- **Fix**: Agent sends POST /api/v1/agents/stopping on graceful shutdown. Best-effort, does not block buffer flush.
- **Date**: 2026-05-13 (found), 2026-05-14 (fixed)

### EXP-012: Config file permission check only on Linux
- **Priority**: P2
- **Status**: Deferred
- **Evidence**: Windows has no permission enforcement on config (contains api_key)
- **Impact**: API key exposure on Windows multi-user systems
- **Date**: 2026-05-13

### EXP-013: portmap collector iterates ALL connections
- **Priority**: P2
- **Status**: Deferred
- **Evidence**: `net.Connections("all")` expensive on busy servers (10K+ connections)
- **Impact**: High CPU on connection-heavy servers
- **Date**: 2026-05-13

---

## Low / Design

### EXP-014: No log collection
- **Priority**: P1
- **Status**: Open - design contract completed (AGENT-004), implementation pending Phases 3-4
- **Evidence**: `docs/log_pipeline_contract.md` defines complete architecture (file tailing, parsers, redaction, backpressure, correlation). No code implementation yet.
- **Date**: 2026-05-13 (found), 2026-05-15 (design complete)

### EXP-019: Agent lifecycle endpoints exist but exporter does not call them
- **Priority**: P0
- **Status**: Fixed (AGENT-002 - lifecycle client implemented)
- **Evidence**: `internal/transport/lifecycle.go` implements `LifecycleClient` with Register, Heartbeat, Stopping, RegisterWithRetry. `internal/agent/agent.go` calls register before metrics, heartbeat in background goroutine, stopping on shutdown.
- **Impact**: NeoGuard cannot distinguish planned shutdown from agent crash, cannot build reliable fleet state, and cannot safely correlate agent health with resource views.
- **Fix**: Agent now registers after identity resolution, heartbeats at server-negotiated interval, sends stopping event on graceful shutdown. Metrics blocked until registration succeeds.
- **Date**: 2026-05-14 (found), 2026-05-14 (fixed)

### EXP-020: Process PID tags can still create high-cardinality series
- **Priority**: P1
- **Status**: Fixed (AGENT-003 - process aggregation and ignore patterns)
- **Evidence**: `internal/collector/process.go` now supports `ignore_patterns`, first-match-wins aggregation rules, and `process_group` metrics without `process_pid`. Non-aggregated processes remain top-N bounded.
- **Impact**: CI runners, job workers, and busy application hosts can generate excessive process series, increasing storage cost and slowing queries.
- **Fix**: Added config-validated aggregation rules, deterministic collector tests, top-N only for non-aggregated processes, and opt-in cmdline collection that is never requested for aggregated groups.
- **Date**: 2026-05-14 (found), 2026-05-15 (fixed)

### EXP-021: Correlation contract is implicit, not written as an enforced architecture contract
- **Priority**: P0
- **Status**: Fixed (AGENT-001 - contract written; BACKEND-001 done; UI-001 done)
- **Evidence**: `docs/correlation_contract.md` defines join contract. Backend read model implemented at `src/neoguard/services/resources/correlation.py` with API route `GET /api/v1/resources/correlation/{resource_id}` and approved in BACKEND-001. It enforces correlation by `(tenant_id, resource_id)` across cloud inventory, agents, metrics, and logs. UI enforcement completed in UI-001 with ResourceDetailPage using correlation endpoint, proper (tenant_id, resource_id) joins, and compile-time safe agent status handling.
- **Impact**: Backend and UI now enforce the contract across all observability signals.
- **Required Fix**: ~~Write contract~~ Done. ~~Implement backend read model (BACKEND-001)~~ Done. ~~UI pane (UI-001)~~ Done.
- **Date**: 2026-05-14 (found), 2026-05-15 (backend/UI completed)

### EXP-015: No trace collection
- **Priority**: N/A
- **Status**: Non-Goal (execution plan Section 5)
- **Date**: 2026-05-13

### EXP-016: No agent auto-update mechanism
- **Priority**: N/A
- **Status**: Non-Goal (execution plan Section 5)
- **Date**: 2026-05-13

### EXP-017: No config push from server
- **Priority**: N/A
- **Status**: Non-Goal (execution plan Section 5)
- **Date**: 2026-05-13

### EXP-018: saturation full_in_hours returns -1 undocumented
- **Priority**: P3
- **Status**: Deferred
- **Evidence**: Frontend needs to know -1 means "not projecting to fill"
- **Impact**: UI confusion if not handled
- **Date**: 2026-05-13
