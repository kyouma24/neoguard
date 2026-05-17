# NeoGuard Agent - Execution Tickets

**Owner model:** ChatGPT is the hostile reviewer / technical architect. Claude is the implementation engineer.
**Rule:** Claude executes only tickets in this file unless the human explicitly overrides scope.
**Status values:** `Proposed`, `Ready`, `In Progress`, `Blocked`, `Review`, `Done`, `Rejected`.
**Priority values:** `P0` security/data integrity, `P1` reliability/correctness, `P2` maintainability/scale, `P3` polish.

---

## Operating Protocol

1. ChatGPT writes or updates tickets with exact scope, files, acceptance tests, and non-goals.
2. Claude picks one `Ready` ticket at a time and marks it `In Progress` before editing code.
3. Claude must follow `CLAUDE_EXECUTION_HOOKS.md` before starting, during work, before review, reviewer gate, and after completion.
4. Claude updates this file, `PHASE_TRACKER.md`, `FINDINGS.md`, and `EXECUTION_CHANGELOG.md` when a ticket changes status.
5. Claude must not silently expand scope. If a required change is outside the ticket, mark ticket `Blocked` and write the question.
6. Claude must include verification evidence before marking a ticket `Review`.
7. Only ChatGPT reviewer gate or human approval may approve `Done`.
8. `FINDINGS.md` tracks defects and risks. `TICKETS.md` tracks executable work. `PHASE_TRACKER.md` tracks phase progress. `EXECUTION_CHANGELOG.md` tracks coordination and ticket execution history.

---

## Current Architectural Directive

NeoGuard must correlate cloud metrics, OS metrics, process metrics, logs, and future traces for the same machine through stable identity.

Canonical join keys:

- `tenant_id`: derived only from backend API key/session. The agent must never send trusted tenant identity.
- `resource_id`: immutable resource identity. AWS EC2 instance ID, Azure VM ID, on-prem machine ID prefixed with `host-`, hostname only as last resort.
- `agent_id`: stable agent installation identity. Persisted locally and included in every metric/log tag.

`hostname` is display metadata only. It is never a primary correlation key.

---

## Ticket AGENT-001: Correlation Contract

- **Status:** Done
- **Priority:** P0
- **Phase:** 1 - Agent Registry / Correlation Foundation
- **Depends on:** Existing identity code in `internal/identity/*`
- **Related findings:** EXP-011, EXP-014, EXP-019, EXP-021

### Goal

Create a written contract that freezes how agent data maps to NeoGuard resources before adding more telemetry types.

### Files

- Add `docs/correlation_contract.md`
- Update `docs/configuration.md` only if needed to reference required identity tags.

### Requirements

The contract must define:

- `resource_id` sources:
  - AWS: EC2 instance ID from IMDSv2.
  - Azure: VM ID from Azure IMDS.
  - On-prem: machine ID prefixed with `host-`.
  - Unknown: hostname prefixed with `host-`, explicitly unstable.
- `agent_id` derivation and persistence.
- Required tags on every metric and future log:
  - `resource_id`
  - `agent_id`
  - `cloud_provider`
  - `hostname`
  - `os`
  - `agent_version`
- Optional cloud tags:
  - `region`
  - `availability_zone`
  - `account_id`
  - `instance_type`
  - `os_version`
- Forbidden trusted payload fields:
  - `tenant_id`
- Forbidden default tags:
  - raw command line
  - full process args
  - request IDs
  - session IDs
  - trace/span IDs as enumerable dimensions
  - secrets or credentials

### Acceptance Criteria

- Contract cites current implementation points:
  - `internal/identity/identity.go`
  - `internal/identity/resolver.go`
  - `internal/identity/persistence.go`
  - backend `src/neoguard/api/routes/agents.py`
  - backend `src/neoguard/models/agents.py`
- Any mismatch between contract and code is listed as a follow-up ticket.
- No code implementation is included in this ticket.

### Non-Goals

- Do not implement lifecycle registration.

---

## Ticket LOGS-001: Log Pipeline Foundation

- **Status:** In Review
- **Priority:** P0
- **Phase:** 4 - Logs Agent
- **Depends on:** None (backend complete)
- **Related findings:** None (new feature)
- **Estimated Time:** 4 hours

### Goal

Create log-specific pipeline infrastructure separate from metrics pipeline per `docs/log_pipeline_contract.md` §1.2 and §2.4. Includes config schema (frozen per contract §2.4), log-specific spool/dead-letter directories (NO log WAL per §2.3), and pipeline isolation foundation. No file tailing yet.

### Scope

**In Scope:**
1. **Log collection config schema in `internal/config/config.go` (MUST match contract §2.4 exactly)**:
   ```go
   type LogsConfig struct {
       Enabled bool
       Sources []LogSource
       Redaction RedactionConfig
       Spool SpoolConfig
   }

   type LogSource struct {
       Path          string
       Service       string         // Required per contract §7.3
       StartPosition string         // "start" or "end" (default: "end")
       Parser        ParserConfig
       Multiline     MultilineConfig
   }

   type ParserConfig struct {
       Mode    string // "raw", "json", "regex"
       Pattern string // For regex mode only
   }

   type MultilineConfig struct {
       Enabled      bool
       Mode         string        // "start" or "continue"
       Pattern      string
       MaxBytes     int           // Default: 32768
       FlushTimeout time.Duration // Default: 5s
   }

   type RedactionConfig struct {
       Enabled bool // Default: true
   }

   type SpoolConfig struct {
       MaxSizeMB           int // Default: 2048
       HighWatermarkPct    int // Default: 80
       CriticalWatermarkPct int // Default: 95
   }
   ```
   - Validation: file paths must be absolute, parser mode enum ("raw"/"json"/"regex"), service field required

2. **Log-specific directories under agent data dir (per contract §2.3 - NO log WAL)**:
   - `logs-spool/` — JSONL spool files (separate from metrics WAL)
   - `logs-dead-letter/` — separate from `metrics-dead-letter/`
   - `log_cursors/` — per-file cursor checkpoints (contract §4.1.3)
   - **NOT CREATED**: `logs/wal/` (logs use spool, not WAL per contract §2.3)

**Out of Scope:**
- File tailing implementation (LOGS-002)
- Parser modes (LOGS-003)
- Multiline support (LOGS-004)
- Redaction (LOGS-005)
- HTTP client/serialization (LOGS-006)
- In-memory buffer.Ring creation (LOGS-006)
- Transmitter goroutine separation (LOGS-006)

### Files to Modify

1. `internal/config/config.go` (add LogsConfig struct per contract §2.4, validate paths)
2. `internal/agent/agent.go` (create spool/dead-letter/cursors directories on startup)

### Files to Create

None yet (directories created at runtime)

### Acceptance Tests

1. **AT-1: Config validation rejects relative paths**
   ```go
   cfg := &config.Config{
       Logs: config.LogsConfig{
           Enabled: true,
           Sources: []config.LogSource{
               {Path: "relative/path/app.log", Service: "web-api"},
           },
       },
   }
   err := cfg.Validate()
   // err must mention "absolute path required"
   ```

2. **AT-2: Config validation requires service field**
   ```go
   cfg := &config.Config{
       Logs: config.LogsConfig{
           Enabled: true,
           Sources: []config.LogSource{
               {Path: "/var/log/app.log", Service: ""},
           },
       },
   }
   err := cfg.Validate()
   // err must mention "service is required"
   ```

3. **AT-3: Agent creates log-specific directories (spool and dead-letter only)**
   ```go
   tmpDir := t.TempDir()
   cfg := validConfigWithLogCollection(tmpDir)
   agent, _ := agent.New(cfg, ...)
   agent.Start()
   defer agent.Stop()

   // Assert directories exist:
   assert.DirExists(t, filepath.Join(tmpDir, "logs-spool"))
   assert.DirExists(t, filepath.Join(tmpDir, "logs-dead-letter"))
   assert.DirExists(t, filepath.Join(tmpDir, "log_cursors"))

   // Assert log WAL does NOT exist:
   assert.NoDirExists(t, filepath.Join(tmpDir, "logs/wal"))
   ```

4. **AT-4: Log and metric directories are separate**
   ```go
   tmpDir := t.TempDir()
   cfg := validConfigWithBothCollections(tmpDir)
   agent, _ := agent.New(cfg, ...)
   agent.Start()
   defer agent.Stop()

   // Assert metrics use WAL:
   assert.DirExists(t, filepath.Join(tmpDir, "metrics/wal"))

   // Assert logs use spool (NOT WAL):
   assert.DirExists(t, filepath.Join(tmpDir, "logs-spool"))
   assert.NoDirExists(t, filepath.Join(tmpDir, "logs/wal"))
   ```

### Non-Goals

- Do NOT create log WAL (logs use spool per contract §2.3)
- Do NOT implement file discovery/tailing (next ticket)
- Do NOT implement parsers (separate ticket)
- Do NOT add log HTTP client yet (LOGS-006)
- Do NOT modify existing metrics pipeline code

### References

- Contract: `docs/log_pipeline_contract.md`
  - §1.2 (Pipeline Isolation)
  - §2.3 (Terminology: WAL vs Spool)
  - §2.4 (Configuration Namespace)
  - §4.1.3 (Cursor Storage Location)
- Existing metrics pipeline: `internal/buffer/`, `internal/transport/`

---

## Ticket LOGS-002: File Tailing Implementation

- **Status:** Done
- **Priority:** P0
- **Phase:** 4 - Logs Agent
- **Depends on:** LOGS-001
- **Related findings:** None (new feature)
- **Estimated Time:** 8 hours

### Goal

Implement cross-platform file tailing with rotation handling per `docs/log_pipeline_contract.md` §4. Uses a single common polling tailer with platform-specific file identity helpers. Handles three rotation modes (rename, copytruncate, missing file). Emits raw lines to parser (LOGS-003).

### Design Decisions (deviations from original ticket, approved during implementation)

1. **Common polling tailer** instead of separate inotify/polling implementations:
   - Contract §4.1.2 requires periodic checkpoint (5s) — polling already required
   - Contract §4.3.3 requires 30s missing-file poll — polling already required
   - Rotation detection (§4.3, §4.4) uses file identity comparison, not filesystem events
   - inotify adds fsnotify dependency and event-ordering complexity with marginal benefit
   - If soak testing shows rotation detection >10s (§12), inotify can be added without interface change

2. **Bounded channel (100,000 entries)** instead of unbounded:
   - Unbounded risks OOM with no backpressure signal
   - 100K entries × ~200 bytes = ~20MB, well under 120MB abort criterion (§11.1)
   - Exceeds 3x throughput target (30K lines/sec)
   - Backpressure handling comes in LOGS-006

3. **Platform behavior differences for live rotation/deletion:**
   - Linux: `os.Rename` and `os.Remove` succeed on open files → live detection during tailing
   - Windows: open files cannot be renamed/deleted → detection on next startup via identity mismatch
   - Implementation handles both paths; tests are platform-specific where behavior diverges

### Scope

**In Scope:**
1. Common polling tailer with platform-specific file identity:
   - `internal/collector/logtail/tailer.go` — tailer, options, line reader
   - `internal/collector/logtail/identity_unix.go` — stat(2) device+inode
   - `internal/collector/logtail/identity_windows.go` — GetFileInformationByHandle volume+fileindex

2. **Cursor persistence per contract §4.1**:
   - **Location**: `<stateDir>/log_cursors/<path-hash>.json` where `<path-hash>` is first 16 hex chars of SHA-256(configured_path)
   - **Checkpoint structure** per contract §4.1.1:
     ```json
     {
       "configured_path": "/var/log/app.log",
       "platform_file_identity": {"device": 2049, "inode": 12345678},
       "offset": 987654,
       "file_size": 1048576,
       "last_checkpoint": "2026-05-15T10:23:45.123456Z"
     }
     ```
   - **Checkpoint frequency** per contract §4.1.2:
     - Every 5 seconds during normal operation (injectable for testing)
     - On shutdown (SIGHUP, SIGTERM, SIGINT)
     - Independent of backend POST success
   - **Permissions**: 0640 (owner read/write, group read)
   - **Testability**: Tailer accepts injectable `CheckpointInterval` and `PollInterval`

3. **Start position** per contract §4.2:
   - Default: `end` - start reading new lines only (skip historical logs)
   - Opt-in: `start` - read from beginning on first watch
   - Per-file config: `sources[0].start_position: "start"` or `"end"`

4. **Rotation handling** per contract §4.3 (three modes):
   - **Rename rotation** (logrotate default):
     - Detect platform file identity change (live on Linux, startup on Windows)
     - Finish reading old file handle to EOF (drain remaining)
     - Open new file at offset 0 (NOT start_position — new files always start at 0)
     - Counter: `agent.logs.rotations{rotation_type: "rename"}`
   - **Copytruncate rotation**:
     - Detect `current_size < cursor_offset`
     - Log warning: "truncation detected, resetting to offset 0"
     - Reset cursor to offset 0
     - Counter: `agent.logs.truncations`
   - **Missing file**:
     - Poll every 30 seconds (injectable for testing)
     - When file appears, open at configured `start_position`
     - Counter: `agent.logs.missing_files` on each poll cycle
     - Does not block other sources

5. **Inode tracking** per contract §4.4:
   - Track platform file identity (`device`, `inode`) on every checkpoint
   - On startup: Compare stored identity with current file
   - If identity changed: Treat as rotation (finish old, open new)

6. Line reading:
   - Buffered reader with 64KB read size
   - Newline-delimited (\n or \r\n)
   - Emit raw lines to bounded channel (100,000 entries)

7. Error handling:
   - Permission denied → log warning, skip file
   - File deleted mid-tail → log info, deactivate (Linux: live; Windows: next startup)
   - Read errors → log error, retry after backoff

8. Agent integration:
   - `startLogTailers()` creates and starts one Tailer per configured source
   - `stopLogTailers()` stops all tailers (saves final checkpoints)

**Out of Scope:**
- Parser modes (LOGS-003)
- Multiline support (LOGS-004)
- Redaction (LOGS-005)
- Rate limiting (future ticket)
- Backpressure (future ticket)

### Files to Create

1. `internal/collector/logtail/tailer.go` — common polling tailer (cross-platform)
2. `internal/collector/logtail/cursor.go` — cursor persistence (JSON in log_cursors/)
3. `internal/collector/logtail/identity_unix.go` — stat(2) device+inode (`//go:build !windows`)
4. `internal/collector/logtail/identity_windows.go` — GetFileInformationByHandle (`//go:build windows`)
5. `internal/collector/logtail/tailer_test.go` — cross-platform tests (AT-1,2,5,6,7,8)
6. `internal/collector/logtail/tailer_unix_test.go` — live rotation/deletion tests (`//go:build !windows`)

### Files to Modify

1. `internal/agent/agent.go` — start/stop log tailer goroutines, add `tailers` field

### Acceptance Tests

1. **AT-1: Tailer reads existing file from start**
2. **AT-2: Tailer resumes from saved offset (no re-read after checkpoint)**
3. **AT-3: Tailer detects rename rotation (live on Linux, startup on Windows)**
4. **AT-4: Tailer handles file deletion (live on Linux, startup on Windows)**
5. **AT-5: Tailer detects copytruncate and resets to offset 0**
6. **AT-6: First watch with start_position=end skips existing content**
7. **AT-7: Periodic checkpoint persistence (deterministic with injected interval)**
8. **AT-8: Missing file polling and resume on appearance (deterministic with injected interval)**

(See LOGS-002.md for full test details)

### Non-Goals

- Do NOT implement parsers (next ticket)
- Do NOT implement backpressure or rate limiting yet
- Do NOT implement glob pattern expansion (future enhancement)
- Do NOT implement symlink following (future enhancement)

### References

- Contract: `docs/log_pipeline_contract.md` §4 (File Tailing Semantics)
- Similar Go libraries: hpcloud/tail, nxadm/tail (for reference, not direct dependency)

---

## Ticket LOGS-003: Log Parser Modes

- **Status:** Done
- **Priority:** P0
- **Phase:** 4 - Logs Agent
- **Depends on:** LOGS-002 (Complete)
- **Related findings:** None (new feature)
- **Estimated Time:** 6 hours

### Goal

Implement three parser modes per `docs/log_pipeline_contract.md` §2.2: raw (passthrough), JSON (structured extraction), and regex (pattern matching with named groups). Parsers consume raw lines from tailer and emit structured LogEntry.

### Scope

**In Scope:**
1. Parser interface and implementations (RawParser, JSONParser, RegexParser)
2. JSON parser field extraction (timestamp, level, message, Fields with nested object flattening)
3. Regex parser named group extraction (timestamp, level, message, Fields)
4. Error handling (fallback to raw with severity UNKNOWN, Fields["parse_error"]=true)
5. Parser is stateless (no source context, no metric emission) - LOGS-006 collector handles parser_errors counter

**Out of Scope:**
- Multiline support (LOGS-004)
- Redaction (LOGS-005)

### Files to Create

1. `internal/model/log.go` — LogEntry and LogSeverity types
2. `internal/collector/logtail/parser.go` — Parser interface + factory
3. `internal/collector/logtail/parser_raw.go` — RawParser implementation (severity UNKNOWN per contract §5.1)
4. `internal/collector/logtail/parser_json.go` — JSONParser implementation (fallback severity UNKNOWN per contract §5.2)
5. `internal/collector/logtail/parser_regex.go` — RegexParser implementation (fallback severity UNKNOWN per contract §5.3)
6. `internal/collector/logtail/parser_test.go` — parser tests

### Files to Modify

None. Existing `ParserConfig` in `internal/config/config.go` (from LOGS-001) already has `Mode` and `Pattern` fields. Tailer remains unchanged - parser wiring happens in LOGS-006 (log collector stage).

### Acceptance Tests

1. AT-1: RawParser wraps line with severity UNKNOWN
2. AT-2: JSONParser extracts fields
3. AT-3: JSONParser flattens nested objects with dot notation
4. AT-4: RegexParser extracts named groups
5. AT-5: JSONParser fallback sets parse_error=true
6. AT-6: RegexParser fallback sets parse_error=true

(See LOGS-003.md for full test code. Parser error counter tests moved to LOGS-006 where collector has source context.)

### References

- Contract: `docs/log_pipeline_contract.md` §2.2 (Parser Modes)

---

## Ticket LOGS-004: Multiline Support

- **Status:** Done
- **Priority:** P1
- **Phase:** 4 - Logs Agent
- **Depends on:** LOGS-003 (Complete)
- **Related findings:** None (new feature)
- **Estimated Time:** 4 hours

### Goal

Implement multiline log support per `docs/log_pipeline_contract.md` §2.2.4. Aggregates continuation lines into single LogEntry using start pattern detection.

(See LOGS-004.md for full details)

---

## Ticket LOGS-005: Credential Redaction (Hardcoded Safe Defaults)

- **Status:** Done
- **Priority:** P1
- **Phase:** 4 - Logs Agent
- **Depends on:** LOGS-003 (Complete)
- **Related findings:** None (new feature)
- **Estimated Time:** 4 hours

### Goal

Implement hardcoded credential redaction per `docs/log_pipeline_contract.md` §8. Scans log message and fields for sensitive patterns (bearer tokens, AWS keys, API key fields, password fields) and replaces with `[REDACTED]` **before writing to local spool**. Credit cards and SSNs are explicitly out-of-scope for v1.

(See LOGS-005.md for full details)

---

## Ticket LOGS-006: Log Buffering and Transmission

- **Status:** Done
- **Priority:** P0
- **Phase:** 4 - Logs Agent
- **Depends on:** LOGS-003 (Complete)
- **Related findings:** None (new feature)
- **Estimated Time:** 8 hours

### Goal

Implement log-specific buffering, spooling, and HTTP transmission per `docs/log_pipeline_contract.md` §1.2, §2.2, §7, and §9. Uses JSONL spool files (NOT WAL). Batch size 1000 events OR 1 MB (aggregate across all sources). Identity tags injected into LogEntry `tags` field (NO tenant_id in agent payload). Reuses model.LogEntry from LOGS-003 as wire format (no separate LogEvent type). Creates LogEnvelope wrapper. Uses separate `LogClient` with direct `LogEnvelope` marshal (Option A chosen - preserves AGENT-012 narrow Serializer decision).

**Architectural Decision (Option A1)**: Create log-specific buffer structures (LogRing, LogSpool, LogDeadLetterWriter) rather than generalizing existing metric-specific abstractions. This preserves pipeline isolation per contract §1.2 and §2.2.

(See LOGS-006.md for full details including JSONL spool specification, buffer component design, backpressure requirements, and 7 acceptance tests)

### Verification

```bash
go test ./internal/buffer -run TestLog
go test ./internal/collector -run TestLog
go test ./internal/transport -run TestLog
go test ./internal/agent -run TestLog
go build ./cmd/neoguard-agent
```

---

## Ticket AGENT-002: Agent Lifecycle Client

- **Status:** Done
- **Priority:** P0
- **Phase:** 1 - Agent Registry
- **Depends on:** AGENT-001, AGENT-005
- **Related findings:** EXP-011, EXP-019

### Goal

Make the exporter a first-class NeoGuard agent by calling the existing backend lifecycle endpoints.

### Backend Contract To Use

Use existing endpoints exactly:

- `POST /api/v1/agents/register`
- `POST /api/v1/agents/heartbeat`
- `POST /api/v1/agents/stopping`

Use existing backend request fields:

- Register:
  - `agent_id_external`
  - `hostname`
  - `resource_id`
  - `os`
  - `arch`
  - `agent_version`
  - `capabilities`
  - `config_hash`
  - `supported_schema_versions`
  - `heartbeat_interval_seconds`
- Heartbeat:
  - `agent_id_external`
  - `status`
  - `heap_inuse_bytes`
  - `goroutines`
  - `points_collected`
  - `points_sent`
  - `send_errors`
  - `buffer_size`
  - `collector_healthy_pct`
- Stopping:
  - `agent_id_external`
  - `reason`

### Files

- Add `internal/transport/lifecycle.go`
- Add `internal/transport/lifecycle_test.go`
- Update `internal/transport/client.go` only for shared URL/auth helpers if needed.
- Update `internal/agent/agent.go`
- Update `docs/configuration.md`
- Update `PHASE_TRACKER.md`
- Update `FINDINGS.md`

### Requirements

- Agent must register after identity resolution and before starting transmitter.
- Agent must not transmit metrics until registration succeeds.
- Registration must use the resolved `agent_id` as `agent_id_external`.
- Registration must use `Identity.InstanceID` as `resource_id`.
- Capabilities must include at minimum:
  - `metrics: true`
  - `logs: false`
  - `schema_versions: [1]`
  - `compression: ["gzip"]`
  - `max_payload_bytes: 5242880`
  - `collectors: [...]`
- Heartbeat must run in a separate goroutine and must not block collection or transmission.
- Heartbeat interval must use the server response value when registration succeeds.
- Graceful shutdown must send `/stopping` with a 5 second timeout.
- `/stopping` is best effort and must not prevent buffer flush.
- No API key or full config may be logged.
- 401/403 from lifecycle endpoints are permanent errors.
- 429/5xx/network errors are retryable with bounded backoff.
- 422 schema negotiation failure must stop startup with an actionable error.

### Acceptance Tests

Use `httptest`.

- Register request is sent before first metrics ingest.
- Register payload contains `agent_id_external`, `resource_id`, `hostname`, `os`, `arch`, `agent_version`, capabilities, and supported schema versions.
- Heartbeat payload contains stats and collector health.
- Stopping request is sent on controlled shutdown.
- 401/403 lifecycle failures do not hot-loop.
- 422 no-compatible-schema stops startup.
- Metrics are not sent when registration fails.

### Non-Goals

- Do not implement backend registry endpoints; they already exist.
- Do not implement log forwarding.
- Do not add fleet UI.
- Do not add remote config.

### Verification

- `go test ./internal/transport ./internal/agent`
- If agent package tests are expensive or flaky, document exact failure and run narrower tests.

### Summary of Changes

- Created `internal/transport/lifecycle.go` (~234 lines):
  - `LifecycleClient` with `Register`, `Heartbeat`, `Stopping`, and `RegisterWithRetry` methods.
  - Request/response types matching backend schema: `RegisterRequest`, `RegisterResponse`, `HeartbeatRequest`, `StoppingRequest`.
  - `SchemaNegoError` for 422 schema negotiation failures.
  - 401/403 return `PermanentError` (no retry). 429/5xx return `RetryableError`. Network errors are retryable.
  - `RegisterWithRetry` uses exponential backoff (2s, 4s, 8s, 16s, 30s) with server Retry-After override.
- Created `internal/transport/lifecycle_test.go` (~403 lines):
  - 12 tests: RegisterSuccess, RegisterBeforeMetrics, Register401Permanent, Register403Permanent, Register422SchemaNegoFailure, Register401NoHotLoop, MetricsNotSentWhenRegistrationFails, HeartbeatSuccess, StoppingSuccess, StoppingBestEffort, RegisterWithRetryRecovers, RegisterPayloadContainsAllFields.
- Modified `internal/agent/agent.go`:
  - Added `lifecycle *transport.LifecycleClient` field, initialized in `New()`.
  - Added `register()` call in `Run()` after identity resolution, before collectors/transmitter.
  - Agent returns error if registration fails (blocks metric transmission).
  - Added `runHeartbeat()` goroutine using server-negotiated interval.
  - Added `sendStopping()` in shutdown path with 5s timeout, before health server stop.
  - Added `configHash()` helper (full SHA-256 of the active config file bytes when `cfgPath` is available).
- Modified `internal/agent/integration_test.go` and `internal/agent/agent_test.go`:
  - Updated mock HTTP servers to handle `/api/v1/agents/register`, `/heartbeat`, `/stopping`.

### Verification Evidence

- Reviewer verified `gofmt -l internal\transport\lifecycle.go internal\transport\lifecycle_test.go internal\agent\agent.go internal\agent\agent_test.go internal\agent\integration_test.go` - no output.
- Reviewer verified `go test ./internal/transport ./internal/agent` - PASS (`internal/transport` 19.947s, `internal/agent` 33.424s).
- All 12 lifecycle transport tests pass.
- Reviewer correction tests added: `TestRegister409Permanent`, `TestRegister409NoRetry`, `TestRegister422FastAPIDetailEnvelope`, `TestLifecycleRegisterPrecedesMetricIngest`, `TestLifecycleFailedRegistrationSendsNoMetrics`.
- All agent integration tests pass (TestIntegrationFullPipeline, TestIntegrationServerDown, TestIntegrationWALReplay, TestAgentRunShortLived).
- Registration blocks metrics: agent returns error if register fails and sends no `/api/v1/metrics/ingest` request (verified by `TestLifecycleFailedRegistrationSendsNoMetrics`).
- 401/403 do not hot-loop: verified by TestRegister401NoHotLoop (1 attempt only).
- 409 does not retry: verified by `TestRegister409NoRetry` (1 attempt only).
- 422 schema negotiation returns actionable `SchemaNegoError` with server-supported versions, including the real FastAPI `{"detail": {...}}` envelope.
- Heartbeat runs in separate goroutine, does not block collection/transmission.
- Stopping is best-effort with 5s context timeout.

### Residual Risks

1. `TestIntegrationServerDown` now succeeds registration (mock returns success) then tests metric send failures. If real-world registration fails with 503, the agent will retry up to 5 times with backoff before returning an error. This matches the ticket requirement.
2. Heartbeat goroutine has no explicit test for "does not block collection" — verified structurally by the `go a.runHeartbeat(...)` pattern in agent.go.
3. No full `Agent.Run()` integration test for schema negotiation failure stopping startup - covered by transport tests including FastAPI error-envelope parsing.

---

## Ticket AGENT-003: Process Cardinality Controls

- **Status:** Done
- **Priority:** P1
- **Phase:** 2 - Metrics Polish
- **Depends on:** AGENT-001
- **Related findings:** EXP-006, EXP-020

### Goal

Make process metrics useful without turning TimescaleDB into a high-cardinality graveyard.

### Files

- Update `internal/config/config.go`
- Update `internal/config/config_test.go`
- Update `internal/collector/process.go`
- Add or update process collector tests.
- Update `docs/cardinality.md`
- Update `docs/configuration.md`

### Requirements

Add config:

```yaml
process:
  top_n: 20
  collect_cmdline: false
  aggregation:
    enabled: true
    rules:
      - pattern: "^python.*"
        aggregate_as: "python"
      - pattern: "^node.*"
        aggregate_as: "node"
  ignore_patterns:
    - "^kworker/"
    - "^migration/"
```

Strict behavior:

- Regex compile errors must fail config load.
- Deny/ignore rules apply before allow rules and aggregation.
- Aggregated metrics use `process_group`, not `process_pid`.
- Raw top-N process metrics may keep `process_pid`.
- `process_cmdline` remains default false.
- No command line, environment, cwd, or args are emitted by default.

### Acceptance Tests

- Invalid aggregation regex fails config load.
- Multiple PIDs matching one rule emit one grouped metric series.
- Grouped CPU/memory values equal sum of matched processes.
- Kernel thread ignore patterns suppress matching processes.
- Existing top-N behavior still works when aggregation is disabled.

### Non-Goals

- Do not add container/Kubernetes pod metadata.
- Do not add eBPF.
- Do not add per-process command line by default.

### Verification

- `go test ./internal/config ./internal/collector ./internal/agent` - all PASS

### Summary of Changes

- Modified `internal/config/config.go` (+3 structs, +44 lines validation):
  - Added `ProcessConfig.IgnorePatterns []string` and `ProcessConfig.Aggregation ProcessAggregationConfig`.
  - Added `ProcessAggregationConfig` struct with `Enabled bool` and `Rules []ProcessAggregationRule`.
  - Added `ProcessAggregationRule` struct with `Pattern string` and `AggregateAs string`.
  - Extended `validate()` to compile all regex patterns (ignore/allow/deny/aggregation) and fail on any invalid pattern.
  - Enforced max 50 aggregation rules, `aggregate_as` non-empty/max-64-chars/alphanumeric validation.
- Modified `internal/config/config_test.go` (+9 new tests):
  - `TestProcessIgnorePatternInvalidRegex`, `TestProcessAllowRegexInvalidRegex`, `TestProcessDenyRegexInvalidRegex`.
  - `TestProcessAggregationInvalidPattern`, `TestProcessAggregationEmptyAggregateAs`, `TestProcessAggregationAggregateAsTooLong`, `TestProcessAggregationAggregateAsInvalidChars`.
  - `TestProcessAggregationTooManyRules`, `TestProcessAggregationEnabledWithoutRules`, `TestProcessAggregationValidConfig`.
- Modified `internal/collector/process.go` (+175 lines):
  - Added `ProcessSource` interface with `ListProcesses(ctx) ([]ProcessInfo, error)` method.
  - Added `ProcessInfo` struct holding process snapshot data (PID, Name, User, Cmdline, CPU%, MemRSS, MemPct, Threads, FDs, IO).
  - Added `gopsutilSource` type implementing `ProcessSource` (production).
  - Added `aggregationRule` struct with compiled `*regexp.Regexp` and `aggregateAs string`.
  - Added `ProcessCollector.source ProcessSource`, `ignoreRegex []*regexp.Regexp`, `aggRules []aggregationRule` fields.
  - Extended `ProcessConfig` struct with `IgnorePatterns []string` and nested `Aggregation` struct.
  - Created `NewProcessCollectorValidated(cfg) (*ProcessCollector, error)` compiling all regexes and returning errors.
  - Updated `NewProcessCollector(cfg)` to call `NewProcessCollectorValidated()` and panic on error (backward compat).
  - Rewrote `Collect()` method:
    1. Use `source.ListProcesses()` for deterministic testing.
    2. Filter via ignore → deny → allow order.
    3. Aggregate first-match-wins (each process matches at most one rule).
    4. Sort non-aggregated processes by CPU% desc, then memRSS desc.
    5. Apply top-N only to non-aggregated processes.
    6. Emit aggregated groups with `process_group` tag only (no pid/name/user/cmdline).
    7. Emit individual top-N processes with all tags (pid/name/user/cmdline if enabled).
    8. `system.processes.total` always reports OS total (not filtered count).
  - Added `shouldIgnore(name)` helper checking `ignoreRegex`.
- Modified `internal/collector/process_test.go` (+7 new deterministic tests using `fakeProcessSource`):
  - `TestProcessIgnorePatternsFiltersBeforeDenyAllow` - verifies ignore runs before deny/allow.
  - `TestProcessAggregationFirstMatchWins` - verifies first rule match wins, second rule for same process ignored.
  - `TestProcessAggregatedMetricsHaveOnlyProcessGroupTag` - verifies no pid/name/user/cmdline on aggregated metrics.
  - `TestProcessTopNAppliesOnlyToNonAggregated` - verifies aggregated groups always appear, top-N applies to individuals only.
  - `TestProcessSystemProcessesTotalUnchanged` - verifies total is OS count, not filtered count.
  - `TestProcessCollectorInvalidRegexReturnsError` - verifies all 4 pattern types (ignore/allow/deny/aggregation) fail validation.
  - `TestProcessAggregationSumsAllMetrics` - verifies CPU/mem/threads/fds/io are summed correctly.
- Modified `internal/agent/agent.go`:
  - Changed `buildCollectors()` signature from `[]collector.Collector` to `([]collector.Collector, error)`.
  - Updated process collector instantiation to map `config.ProcessAggregationRule` to `collector.ProcessConfig` anonymous struct.
  - Called `collector.NewProcessCollectorValidated()` and returned error on failure.
  - Reordered `Run()`: build collectors first → extract names → register → wrap with supervisor → start goroutines.
  - Updated `register()` signature to accept `enabledCollectors []string` parameter (no longer calls `buildCollectors()` internally).
  - Updated `Diagnose()` to print error and return early if `buildCollectors()` fails.
- Modified `internal/agent/agent_test.go`:
  - Updated all 9 test call sites to handle `buildCollectors()` error: `collectors, err := a.buildCollectors(); if err != nil { t.Fatal(err) }`.
- Updated `docs/cardinality.md`:
  - Added "Process Aggregation (AGENT-003)" section documenting ignore patterns, aggregation rules, filtering order, first-match-wins, aggregate_as validation, top-N independence, system.processes.total behavior.
  - Replaced Phase 2.6 future-work note with "delivered in AGENT-003" migration note.
- Updated `docs/configuration.md`:
  - Added `process.ignore_patterns`, `process.collect_cmdline`, `process.aggregation.*` fields to process table.
  - Updated `process.top_n` description to clarify "non-aggregated processes".
  - Added filtering order, aggregated metric tag restrictions, and pattern validation notes.
  - Updated example config with ignore_patterns and aggregation example.
  - Updated reloadable settings list to include new process fields.

### Verification Evidence

- All config validation tests pass (10 total: 9 new + 1 existing valid config test).
- All 7 new deterministic process collector tests pass using `fakeProcessSource`.
- All existing process collector tests pass (backward compatibility maintained).
- All agent tests pass (13 call sites updated for `buildCollectors()` error handling).
- `go test ./internal/config ./internal/collector ./internal/agent` - PASS (1.567s + 49.809s + cached).
- No regression: collector construction failure now causes `Agent.Run()` to return error at startup (before starting collection goroutines).
- Filtering order verified: ignore → deny → allow → aggregate → top-N.
- First-match-wins verified: `python3.11` matches first `^python` rule, not second `^python3.11` rule.
- Aggregated metric tags verified: `process_group` only, no pid/name/user/cmdline.
- system.processes.total verified: reports OS total (4 processes), not filtered count (2 after ignore/deny).
- Config validation verified: invalid regex in any field (ignore/allow/deny/aggregation) causes startup failure with clear error message.

### Verification Evidence (Reviewer Corrections #1 and #2)

- **Performance preservation**: Two-stage collection verified. On 1000-process host with 50 filtered, 5 aggregated, topN=20:
  - Stage 1 (cheap): 1000 `ListProcesses()` calls fetch only PID/name/CPU%/memRSS
  - Filtering: 950 processes dropped by ignore/deny/allow (cheap name-based checks)
  - Stage 2 (expensive): Only 25 `EnrichProcess()` calls (5 aggregation members + 20 top-N individuals)
  - Expensive fields (username/threads/FDs/IO) never fetched for filtered-out processes
  - **Cmdline never fetched for**: filtered processes, aggregated processes, or when collect_cmdline=false
- **Cmdline privacy/performance** (Correction #2):
  - `EnrichOptions{IncludeCmdline: bool}` controls cmdline fetching at call site
  - Aggregation enrichment: always `IncludeCmdline: false` (aggregated metrics forbidden from using cmdline)
  - Individual enrichment: `IncludeCmdline: c.collectCmdline` (respects user config)
  - `TestCmdlineNotRequestedWhenDisabled` proves 0 cmdline requests when disabled
  - `TestAggregatedGroupsNeverRequestCmdline` proves aggregated PIDs never request cmdline, even when enabled
- **Collector validation**: All 5 collector-level tests pass, enforcing invariants even when config validation is bypassed
- **Hot-reload accuracy**: docs/configuration.md now correctly states process settings require restart
- **Code hygiene**: `gofmt -l` returns no files
- **Test quality**: `TestProcessAggregationAggregateAsTooLong` uses printable 65-char string and asserts specific error

### Residual Risks

1. ProcessSource two-stage design adds interface calls, but preserves original performance profile (cheap scan → filter → selective enrichment).
2. Agent startup now fails early on invalid process config (previously silently skipped invalid patterns). This is intentional hardening per user constraint.
3. Collector construction now happens before registration (order changed from: register → build collectors → start, to: build collectors → register → start). This ensures registration capabilities reflect actual buildable collectors.
4. Process settings hot-reload copies new values to `a.cfg.Process` but running collectors are never rebuilt. Live reload would require separate ticket with atomic collector swap.

---

## Ticket AGENT-004: Log Pipeline Design Spec

- **Status:** Done
- **Priority:** P0
- **Phase:** 3/4 - Logs Backend and Logs Agent
- **Depends on:** AGENT-001, AGENT-002
- **Related findings:** EXP-014, EXP-021

### Goal

Design logs correctly before implementation. Logs must not be bolted onto the metric pipeline.

### Files

- Add `docs/log_pipeline_contract.md`
- Update `PHASE_TRACKER.md`
- Update `FINDINGS.md` if new risks are identified.

### Requirements

The design must specify:

- Separate log buffer from metric buffer.
- Separate log dead-letter directory from metric dead-letter directory.
- Separate log transport retry state from metric transport retry state.
- File tailing semantics:
  - start at end by default
  - optional start at beginning
  - inode/rotation handling
  - truncation handling
  - missing file behavior
- Parser modes:
  - raw
  - JSON
  - regex
  - nginx/apache preset later, not required in first implementation
- Multiline rules:
  - start pattern
  - continuation pattern
  - max event bytes
  - flush timeout
- Required log fields:
  - timestamp
  - message
  - level
  - service
  - source
  - tags
  - fields
- Required identity tags match AGENT-001.
- Redaction before buffering:
  - bearer tokens
  - AWS access keys
  - password-like key/value pairs
  - API keys
- Backpressure behavior when log volume exceeds limits.
- Abort criteria:
  - sustained 1000 lines/sec exceeds 120 MB memory
  - single-core throughput below 30000 lines/sec
  - log storm delays metric send cadence

### Acceptance Criteria

- Design explicitly states logs and metrics do not share buffers.
- Design defines failure behavior for backend outage, file rotation, malformed JSON, and multiline overflow.
- No code implementation is included in this ticket.

### Non-Goals

- Do not implement log tailing.
- Do not implement journald.
- Do not implement Windows Event Log.
- Do not add Vector/Fluent Bit/OpenTelemetry Collector.

### Verification

- Documentation review only.

### Summary (Review Complete)

Created `docs/log_pipeline_contract.md` (876 physical lines, 633 non-empty lines, 16 sections) defining complete log collection architecture before implementation.

**Key architectural decisions:**
1. **Pipeline separation**: Logs use disk spool (JSONL files), metrics use binary WAL. Independent buffers, retry state, dead-letter directories, and transmission goroutines.
2. **Wire format**: Aligns with `execution_plan.md` Section 2.2 envelope (`agent_id`, `schema_version`, `logs` array). Required fields: `service`, `level` (default `unknown`).
3. **File tailing**: Cursor persistence every 5s (independent of backend POST). Platform file identity (device+inode on Linux, file ID on Windows). Three rotation types: rename, copytruncate, missing file.
4. **Parser modes**: raw, JSON, regex (all v1). nginx/apache presets deferred to v2.
5. **Multiline**: Per-source configuration with start/continue patterns, 32KB max bytes, 5s flush timeout.
6. **Redaction**: Hardcoded safe defaults (bearer tokens, AWS keys, API keys, password fields). Applied before spool write. Custom patterns deferred to v2.
7. **Backpressure**: Tailers slow at 80% spool, drop oldest at 95%. Metrics always unaffected.
8. **Correlation**: Same identity tags as metrics (`resource_id`, `agent_id`, `cloud_provider`). Backend joins on `(tenant_id, resource_id)`, not hostname.

**Abort criteria** (formal from ticket):
- Sustained 1000 lines/sec exceeds 120 MB memory
- Single-core throughput below 30,000 lines/sec
- Log storm delays metric send cadence by more than 5%

**Verification evidence:**
- Contract passes internal consistency review (3 correction rounds)
- Wire format reconciled with `execution_plan.md`
- Terminology consistent: metrics=WAL, logs=spool
- All non-ASCII characters removed (grep scan: 0 matches)
- 13 acceptance tests defined for future implementation (Phases 3-4)

**Residual risks:**
1. Spool disk usage under sustained backend outage (mitigated by 95% drop policy + dead-letter after 3 retry cycles)
2. Copytruncate rotation can lose up to 5s of logs if truncation occurs between checkpoints (inherently racy, documented as known risk)
3. Parser performance unknowns (regex complexity, JSON malformed rate) until real workload testing (abort criteria protect against catastrophic failure)

---

## Ticket AGENT-005: Identity Tag Contract Enforcement

- **Status:** Done
- **Priority:** P0
- **Phase:** 1 - Agent Registry / Correlation Foundation
- **Depends on:** AGENT-001
- **Related findings:** EXP-021

### Goal

Make runtime metric tags conform to `docs/correlation_contract.md`.

### Files

- `internal/identity/identity.go`
- `internal/identity/resolver_test.go` or identity-specific test file
- `internal/agent/agent.go` only if TestConnection is changed
- `docs/correlation_contract.md` only if exemption language changes
- `TICKETS.md`
- `FINDINGS.md`
- `PHASE_TRACKER.md`
- `EXECUTION_CHANGELOG.md`

### Requirements

- Update `Identity.Tags()` so `cloud_provider` is always emitted, including value `"unknown"` when `CloudProvider == ProviderUnknown`.
- Add or update tests proving `cloud_provider` is present for all provider values including `ProviderUnknown`.
- Decide whether `TestConnection` should remain exempt from full identity tags or should use resolved identity tags. If exempt, document why in acceptance criteria below.

### Acceptance Criteria

- `ProviderUnknown` emits `cloud_provider="unknown"` in `Identity.Tags()`.
- Existing AWS/Azure/on-prem values still emit correctly.
- No `tenant_id` is added to agent payloads.
- `go test ./internal/identity` passes.
- If `TestConnection` remains incomplete (missing `resource_id`, `agent_id`, `cloud_provider`), this ticket explicitly states: TestConnection is exempt from the telemetry contract because it is a connectivity probe, not production telemetry. Its purpose is to verify HTTP transport to the ingest endpoint, not to produce correlatable metric data.

### Non-Goals

- Do not implement lifecycle registration (AGENT-002).
- Do not change backend schema.
- Do not add new tags beyond the contract.

### Verification

- `go test ./internal/identity`
- Confirm `Tags()` output includes `cloud_provider` for all four provider cases.

### TestConnection Exemption

`TestConnection` (`internal/agent/agent.go:506-518`) is exempt from the telemetry contract. It is a connectivity probe that sends a single synthetic gauge with only `hostname` and `agent_version` tags to verify HTTP transport to the ingest endpoint. It is not production telemetry and does not produce correlatable metric data. No change required.

### Summary of Changes

- Removed `if id.CloudProvider != ProviderUnknown` guard in `Identity.Tags()`.
- `cloud_provider` now always emitted, including value `"unknown"`.
- Updated `TestIdentityTagsMinimal` to assert `cloud_provider="unknown"` instead of absence.
- Added `TestIdentityTagsCloudProviderAlwaysPresent` with subtests for all four providers.
- TestConnection remains exempt (connectivity probe, not production telemetry).

### Verification Evidence

- `go test ./internal/identity` - all tests pass (PASS, 5.597s).
- `TestIdentityTagsCloudProviderAlwaysPresent/aws` - PASS
- `TestIdentityTagsCloudProviderAlwaysPresent/azure` - PASS
- `TestIdentityTagsCloudProviderAlwaysPresent/on-prem` - PASS
- `TestIdentityTagsCloudProviderAlwaysPresent/unknown` - PASS
- `TestIdentityTagsMinimal` - PASS (now asserts `cloud_provider="unknown"`)
- No tenant_id added to any payload.
- No backend schema changes.

### Residual Risks

1. TestConnection tag set remains incomplete (no `resource_id`, `agent_id`, `cloud_provider`) - documented as exempt.
2. No runtime verification that `baseTags` merge in `Agent.Run()` preserves the new `cloud_provider="unknown"` - covered implicitly by existing integration tests that check base tags.

---

## Ticket AGENT-006: Custom CA Bundle Support

- **Status:** Done
- **Priority:** P1
- **Phase:** 0 - Correctness Foundation (Production Hardening)
- **Depends on:** None
- **Related findings:** EXP-004
- **PHASE_TRACKER.md reference:** 0.9 - Custom CA bundle

### Goal

Enable TLS connections to custom backend endpoints using enterprise/internal CA certificates.

### Context

Enterprise environments often use:
- Internal PKI infrastructure with private certificate authorities
- Outbound TLS inspection proxies with custom CA certificates
- Private cloud endpoints requiring non-public CA trust

Without custom CA bundle support, the exporter cannot connect to these backends even when network connectivity and API keys are valid. This is a deployment blocker in many enterprise and minimal-container environments.

### Files

- Update `internal/config/config.go`
- Update `internal/transport/client.go`
- Add `internal/transport/client_tls_test.go` or update existing test file
- Update `docs/configuration.md`
- Update `PHASE_TRACKER.md`
- Update `FINDINGS.md`

### Requirements

#### Configuration

Add config field:

```yaml
transport:
  api_url: "https://backend.internal.example.com"
  ca_bundle_path: "/etc/ssl/certs/internal-ca.pem"  # Optional
```

- `ca_bundle_path` is optional. If absent, use system default CA bundle.
- If present, must be an absolute path to a PEM-encoded certificate file.
- Path must be readable by the agent process.
- File must contain at least one valid PEM certificate block.
- If multiple certificates are present (intermediate + root CA), all are loaded.

#### Validation

- Config validation must fail at startup if:
  - `ca_bundle_path` is set but file does not exist
  - File exists but contains no valid PEM certificate blocks
  - File is not readable (permission denied)
- Validation error messages must be actionable:
  - "ca_bundle_path: file not found: /path/to/cert.pem"
  - "ca_bundle_path: file contains no valid PEM certificates: /path/to/cert.pem"
  - "ca_bundle_path: permission denied: /path/to/cert.pem"

#### TLS Client Behavior

- When `ca_bundle_path` is not set:
  - Use `http.DefaultTransport` TLS config (system CA bundle)
  - Existing behavior unchanged
- When `ca_bundle_path` is set:
  - Create custom `tls.Config` with `RootCAs` from the specified file
  - System CA bundle is NOT used (explicit override)
  - Custom CA applies to all HTTPS requests (metrics ingest, lifecycle, test connection)

#### Certificate Loading

- Use `crypto/x509.CertPool` with `AppendCertsFromPEM`
- Handle multi-certificate PEM files correctly (loop all PEM blocks)
- Certificate parsing errors must fail validation at startup, not at first request

#### Test Connection Compatibility

- `TestConnection()` must use the same TLS config as production transport
- If custom CA is configured, test connection must succeed against the custom-CA backend

#### Reloadability

- Custom CA bundle is NOT hot-reloadable (requires restart)
- Document this explicitly in `docs/configuration.md`

### Acceptance Tests

Use `httptest` with custom TLS server and self-signed certificate.

1. **Valid custom CA**: Agent connects successfully to TLS server using custom CA bundle.
2. **System CA fallback**: Agent connects successfully when `ca_bundle_path` is not set (default behavior).
3. **File not found**: Config validation fails with clear error message.
4. **Invalid PEM content**: Config validation fails when file contains no valid certificates.
5. **Permission denied**: Config validation fails when file is not readable.
6. **Multi-certificate bundle**: Agent loads intermediate + root CA correctly.
7. **Test connection uses custom CA**: `TestConnection()` respects custom CA bundle.

### Non-Goals

- Do not implement certificate pinning (out of scope for v1).
- Do not implement client certificate authentication (mutual TLS).
- Do not implement certificate rotation detection (hot reload).
- Do not implement certificate expiration warnings.
- Do not add support for PKCS12/DER formats (PEM only).

### Verification

- `go test ./internal/config ./internal/transport`
- All existing tests must pass (backward compatibility).
- New TLS tests must verify both positive (custom CA works) and negative (validation failures) cases.

---

## Ticket AGENT-007: Container-Aware Runtime Limits

- **Status:** In Progress
- **Priority:** P0
- **Phase:** 0 - Correctness Foundation (Production Hardening, P0-B)
- **Depends on:** None (reuses existing cgroup parser and container collector)
- **Related findings:** None (proactive hardening)
- **PHASE_TRACKER.md reference:** 0.8 - Container-aware GOMAXPROCS

### Goal

Prevent CPU oversubscription in containerized deployments by setting `runtime.GOMAXPROCS` to match the container's CPU quota.

### Context

Go's default `GOMAXPROCS` is set to the number of CPUs visible in `/proc/cpuinfo`. In a container with `--cpus=2` on a 16-core host, this defaults to `GOMAXPROCS=16`, causing 8× CPU oversubscription.

**Solution:** Use Uber's `automaxprocs` library to set `GOMAXPROCS` from the container's cgroup CPU quota at startup (supports cgroup v1 and v2).

**Existing Code to Reuse:**
- `internal/procfs/cgroup.go`: cgroup v1/v2 parser (263 lines), **currently has no direct test coverage** — this ticket adds first direct parser tests
- `internal/collector/container_linux.go`: container collector emitting 8 `system.container.*` metrics with `container_runtime` tag (values: `kubernetes`, `docker`, `containerd`, `lxc`, `container`, `baremetal`)

**Known Issue:** Current parser reads fixed paths like `/sys/fs/cgroup/cpu/cpu.cfs_quota_us`, which breaks for nested cgroups (systemd slices, Kubernetes pods).

### Files

- Update `cmd/neoguard-agent/main.go`
- Update `internal/procfs/cgroup.go`
- Add `internal/procfs/cgroup_test.go` (**NEW FILE** — first direct parser tests)
- Update `internal/collector/container_linux.go`
- Update `internal/collector/container_linux_test.go`
- Add `docs/dependencies.md` (**NEW FILE** — all 5 direct dependencies)
- Update `docs/metrics.md`
- Update `go.mod`

### Requirements

1. **Add `automaxprocs` dependency** (`go.uber.org/automaxprocs v1.6.0`)

2. **Integrate at startup with NeoGuard logging** (use `maxprocs` subpackage, not top-level):
   ```go
   import "go.uber.org/automaxprocs/maxprocs"

   before := runtime.GOMAXPROCS(0)
   _, err := maxprocs.Set(maxprocs.Logger(...))
   after := runtime.GOMAXPROCS(0)
   if after != before {
       slog.Info("container CPU quota detected, adjusted GOMAXPROCS", "from", before, "to", after)
   }
   ```

3. **Audit cgroup parser** — add `CgroupPaths` struct, non-failing parser, sysfs fallback:
   ```go
   type CgroupPaths struct {
       Version      CgroupVersion
       CPUPath      string
       CPUAcctPath  string  // v1 separate hierarchy
       MemoryPath   string
       FallbackUsed bool    // true if parse failed
   }
   func parseCgroupPaths(content string, version CgroupVersion) *CgroupPaths  // Non-failing
   ```
   - **Parse fallback**: malformed `/proc/self/cgroup` → return root paths, `FallbackUsed=true`
   - **Sysfs fallback**: nested path missing → try root sysfs, set `info.FallbackUsed=true` in read functions
   - Either condition makes `FallbackUsed=true` (sticky)

4. **Metric contract**:
   - Keep existing 8 `system.container.*` metrics unchanged
   - Add 3 new metrics:
     - `system.container.cgroup_version` (gauge: 0=unknown, 1=v1, 2=v2)
     - `system.container.gomaxprocs` (gauge: runtime.GOMAXPROCS value)
     - `system.container.cgroup_fallback` (gauge: 0=nested path resolved, 1=root fallback used)

5. **Documentation**:
   - Create `docs/dependencies.md` documenting ALL 5 direct dependencies from `go.mod` (not just automaxprocs)
   - Update `docs/metrics.md` with 3 new metrics and value semantics

### Acceptance Tests

**Fixture-Based Unit Tests (12 new tests in `internal/procfs/cgroup_test.go`):**
1. Parse v1 unified cpu,cpuacct: `3:cpu,cpuacct:/kubepods/pod123` → `CPUPath="/kubepods/pod123"`, `CPUAcctPath=""`
2. Parse v1 separate cpuacct: `3:cpu:/path\n4:cpuacct:/path` → `CPUPath`, `CPUAcctPath` both set
3. Parse v2 unified: `0::/system.slice/svc` → all paths use unified path
4. Parse root cgroup: `0::/` → paths="/", `FallbackUsed=false`
5. Parse failure → paths="/", `FallbackUsed=true`
6. Read v1 nested path with quota → `CPULimitCores=2.0`, `FallbackUsed=false`
7. Read v2 nested path with quota → `CPULimitCores=2.0`
8. Read v1 fallback to root → `FallbackUsed=true`
9. Read v1 cpuacct separate path → verify `readCPUUsageV1` uses cpuacct path
10. Read no quota → `CPULimitCores=-1`
11. Container runtime metrics → verify `cgroup_version`, `gomaxprocs`, `cgroup_fallback=0`
12. Fallback metric → verify `cgroup_fallback=1` when `FallbackUsed=true`

**Manual Validation (3 smoke tests with real containers):**
13. Docker `--cpus=2` on 16-core host → log: `"from": 16, "to": 2`, metrics: `gomaxprocs=2.0`, `cgroup_fallback=0`
14. Docker unlimited → log: `"GOMAXPROCS unchanged"`, metrics: `detected=1`, no `cpu_limit_cores`
15. Bare metal → metrics: `detected=0`, `container_runtime=baremetal`

### Non-Goals

- Do NOT implement Kubernetes pod metadata, cgroup v2 memory.high, eBPF, Windows containers
- Do NOT emit competing metric contracts
- Do NOT claim "goroutine count stays within container limits" (invalid)
- **Container-relative PIDs: Explicitly deferred to AGENT-008** — current process collector emits host PIDs (correct from agent's perspective), container-relative PID remapping requires PID namespace detection and is orthogonal to GOMAXPROCS

### Verification

```bash
go test ./internal/procfs -v  # 10 new unit tests
go test ./internal/collector -v  # 2 new tests
docker run --cpus=2 --rm neoguard-agent  # manual smoke
```

See `AGENT-007-TICKET-REVISED.md` for full specification with all 10 mandatory corrections applied.

---

## Ticket AGENT-015: Internal Pressure Metrics

- **Status:** Done
- **Priority:** P0
- **Phase:** 0 - Correctness Foundation (Production Hardening, P0-B)
- **Depends on:** None
- **Related findings:** None (proactive observability)
- **PHASE_TRACKER.md reference:** 0.15 - Internal pressure metrics

### Goal

Expose internal agent pressure metrics from WAL and dead-letter subsystems to enable operators to observe buffer health, backpressure activation, and data loss risk in production deployments. Additionally document existing but undocumented metrics from transmitter, backpressure, and supervisor subsystems.

### Files

- Update `internal/buffer/wal.go` - Add Metrics() method
- Update `internal/transport/deadletter.go` - Add Metrics() and Stats() methods
- Update `internal/collector/agentself.go` - Add deadLetter parameter, integrate component metrics
- Update `internal/agent/agent.go` - Pass deadLetter to AgentSelfCollector constructor
- Update `docs/metrics.md` - Document 17 metrics (7 new + 10 existing)
- Add tests in `internal/buffer/wal_test.go` - 5 WAL metric tests
- Add tests in `internal/transport/deadletter_test.go` - 3 dead-letter metric tests
- Add tests in `internal/agent/supervisor_test.go` - 5 supervisor validation tests
- Add tests in `internal/agent/integration_test.go` - 1 integration test

### Requirements

1. **Add DiskBuffer.Metrics() method** returning 5 metrics:
   - `agent.wal.size_bytes` (gauge) - Current WAL file size
   - `agent.wal.frames_total` (counter) - Total frames written
   - `agent.wal.corrupted_frames_total` (counter) - Corrupted frames detected
   - `agent.wal.write_rejections_total` (counter) - Write attempts rejected due to capacity
   - `agent.wal.dropped_points_total` (counter) - Points dropped from buffer (NOT bytes - Ring.DropOldest() returns point count)

2. **Add DeadLetterWriter.Metrics() and Stats() methods** returning 2 metrics:
   - `agent.dead_letter.files_written_total` (counter) - Files successfully written
   - `agent.dead_letter.files_evicted_total` (counter) - Files evicted due to retention limits (NOT write failure - filesDropped increments on max_files/max_total_mb eviction)

3. **Update AgentSelfCollector** to integrate component metrics:
   - Add `buf *buffer.DiskBuffer` and `deadLetter *transport.DeadLetterWriter` parameters to constructor
   - Call component Metrics() methods in Collect(), append to batch
   - AgentSelfCollector is emitter/aggregator, not semantic owner

4. **Document 10 existing undocumented metrics** in docs/metrics.md:
   - 5 supervisor metrics (agent.collector.state, agent.collectors.healthy/degraded/disabled/healthy_pct)
   - 5 transmitter/backpressure metrics (agent.transmitter.replay_mode/replay_count, agent.backpressure.current_rate_bps/signals_success_total/signals_fail_total)

### Acceptance Tests

**Total: 14 tests**

1. TestDiskBufferMetrics_AllPresent - 5 metrics returned
2. TestDiskBufferMetrics_SizeBytes - value matches WALStats().SizeBytes
3. TestDiskBufferMetrics_FramesWritten - value == N frames
4. TestDiskBufferMetrics_WriteRejections - value > 0 after capacity rejection
5. TestDiskBufferMetrics_Types - correct MetricType (gauge vs counter)
6. TestDeadLetterMetrics_AllPresent - 2 metrics returned
7. TestDeadLetterMetrics_FilesWritten - value == N files
8. TestDeadLetterMetrics_FilesEvicted - value > 0 after eviction
9-13. TestSupervisorMetrics_* - 5 tests validating existing supervisor metrics
14. TestAgentEmitsPressureMetrics - integration test proving all 7 new metrics present

### Non-Goals

- Do NOT add new replay metrics (agent.transmitter.replay_mode already exists)
- Do NOT add new backpressure rate metrics (agent.backpressure.current_rate_bps already exists)
- Do NOT implement replay lag tracking (requires timestamp tracking not implemented)
- Do NOT implement retry backlog age tracking (requires per-batch timestamps)
- Do NOT implement logs spool metrics (component does not exist)

### Verification

```bash
go test ./internal/buffer -v  # 5 WAL tests
go test ./internal/transport -v  # 3 dead-letter tests
go test ./internal/agent -v  # 5 supervisor + 1 integration tests
go build ./cmd/neoguard-agent  # binary builds
```

See `AGENT-015.md` for full specification with architectural decisions and detailed implementation plan.

---

## Ticket AGENT-012: Serializer Interface Abstraction

- **Status:** Done
- **Priority:** P1
- **Phase:** 0 - Correctness Foundation
- **Depends on:** None
- **Related findings:** None (forward-compatibility hardening)
- **PHASE_TRACKER.md reference:** 0.12 - Serializer interface for future protocol formats

### Goal

Introduce a narrow internal serializer abstraction for the metrics ingest path so future codecs can be added without rewriting the transport client.

### Requirements

- Add `Serializer` interface for `model.MetricBatch`.
- Add `JSONSerializer` as the only v1 implementation.
- Add serializer field to metrics `Client`.
- Keep public `NewClient(...)` behavior unchanged; it must default to JSON.
- `Client.Send()` must obtain both payload bytes and `Content-Type` from the serializer.
- Preserve existing gzip compression and JSON wire behavior.
- Keep lifecycle payloads, WAL persistence, and dead-letter JSONL out of scope.

### Acceptance Tests

1. `TestJSONSerializerMarshal`
2. `TestJSONSerializerContentType`
3. `TestClientUsesSerializerMarshal`
4. `TestClientUsesSerializerContentType`
5. `TestClientSerializerMarshalErrorIsPermanent`
6. `TestNewClientDefaultsToJSONSerializer`
7. `TestMetricsClientWireFormatUnchanged`

### Non-Goals

- Do not add Protobuf or any second codec.
- Do not add user-facing serializer config.
- Do not change lifecycle request serialization.
- Do not change WAL or dead-letter persistence formats.
- Do not change compression or backend contracts.

### Verification

```bash
go test ./internal/transport
go test ./internal/agent
go build ./cmd/neoguard-agent
```

See `AGENT-012.md` for full implementation guidance and hook requirements.

---

## Ticket BACKEND-001: Resource Correlation Read Model

- **Status:** Done
- **Priority:** P0
- **Phase:** 5 - Correlation UI backend prerequisite
- **Depends on:** AGENT-001, AGENT-002
- **Related findings:** EXP-019, EXP-021

### Goal

Provide one backend read model that returns all observability data for a resource keyed by `resource_id`.

### Requirements

- Query resource inventory by `(tenant_id, external_id/resource_id)`.
- Query agents by `(tenant_id, resource_id)`.
- Query host/process metrics by tag `resource_id`.
- Query logs by tag/resource field `resource_id` once log ingestion exists.
- Return partial data if one source is missing:
  - cloud-only resource
  - agent-only on-prem resource
  - metrics without logs
  - logs without process metrics
- Never trust tenant from client input.

### Non-Goals

- Do not build frontend in this ticket.
- Do not change agent.

### Verification

- Backend unit tests for tenant isolation and missing-source partial responses.

---

## Ticket UI-001: Single Resource Pane

- **Status:** Done
- **Priority:** P1
- **Phase:** 5 - Correlation UI
- **Depends on:** BACKEND-001
- **Related findings:** EXP-021

### Goal

Show cloud metadata, agent health, OS metrics, process consumption, and logs in one resource panel.

### Requirements

- Display `resource_id` as the canonical identity.
- Display hostname as mutable metadata only.
- Show cloud provider/account/region metadata.
- Show latest agent heartbeat and health state.
- Show OS charts and process summary from metric queries filtered by `resource_id`.
- Show logs filtered by `resource_id` after log backend exists.

### Non-Goals

- Do not add topology view.
- Do not add APM traces.

### Verification

- Frontend tests for resource with cloud+agent, cloud-only, and agent-only data.

---

# Phase 6 — Distribution and Hardening

## Ticket DIST-001: Systemd Unit and nfpm Fixes

- **Status:** Done
- **Priority:** P0
- **Phase:** 6 - Distribution
- **Depends on:** None (existing artifacts need correction)
- **Related findings:** None
- **Estimated Time:** 2 hours

### Goal

Fix three defects in the existing deployment artifacts that would prevent the agent from running correctly under systemd with `ProtectSystem=strict`:

1. `deploy/neoguard-agent.service` has `ReadWritePaths=/var/log/neoguard` but is missing `/var/lib/neoguard`. Under `ProtectSystem=strict`, the agent cannot write WAL, log spool, or dead-letter files — it fails silently at runtime.
2. `nfpm.yaml` creates `/var/lib/neoguard/wal` but does not create the log pipeline directories. The agent creates these at runtime (agent.go:741-748): `logs-spool`, `logs-dead-letter`, `log_cursors` — all under `StateDir` (`/var/lib/neoguard`). The package should pre-create them with correct ownership.
3. Binary path inconsistency: `nfpm.yaml` installs to `/usr/bin/neoguard-agent`, but both `deploy/install.sh` (`INSTALL_DIR="/usr/local/bin"`) and `deploy/neoguard-agent.service` (`ExecStart=/usr/local/bin/neoguard-agent`) use `/usr/local/bin`. Standardize all three on `/usr/bin` to match `nfpm.yaml` and `docs/deployment.md`.

### Files Modified

1. `deploy/neoguard-agent.service` — add `/var/lib/neoguard` to `ReadWritePaths`; change `ExecStart` path from `/usr/local/bin/neoguard-agent` to `/usr/bin/neoguard-agent`
2. `nfpm.yaml` — add directory entries for `logs-spool`, `logs-dead-letter`, `log_cursors`
3. `deploy/install.sh` — change `INSTALL_DIR` from `/usr/local/bin` to `/usr/bin`

### Acceptance Tests

1. `ReadWritePaths` in the service file contains both `/var/log/neoguard` and `/var/lib/neoguard`
2. `ExecStart` in the service file uses `/usr/bin/neoguard-agent`
3. `nfpm.yaml` declares all directories the agent uses: `/var/lib/neoguard` (root), `wal`, `logs-spool`, `logs-dead-letter`, `log_cursors`
4. `deploy/install.sh` `INSTALL_DIR` is `/usr/bin`
5. All three artifacts (`nfpm.yaml`, `install.sh`, `neoguard-agent.service`) reference the same binary path `/usr/bin/neoguard-agent`
6. `go build ./...` still passes (no Go changes, but sanity check)
7. `VERSION=0.0.0-test GOARCH=amd64 nfpm package --packager deb --target /tmp/` produces a valid deb (if nfpm is available)

### Non-Goals

- Do not change the binary name or config path
- Do not add new systemd directives beyond fixing ReadWritePaths and ExecStart
- Do not restructure deploy/ directory layout

---

## Ticket DIST-002: Release Workflow

- **Status:** Done
- **Priority:** P0
- **Phase:** 6 - Distribution
- **Depends on:** DIST-001 (Done)
- **Related findings:** None
- **Estimated Time:** 4 hours

### Goal

Create `.github/workflows/release.yml` — a tag-triggered workflow that builds all platform binaries, produces deb/rpm packages, generates SHA256 checksums, and creates a GitHub Release with all artifacts attached.

Per strategy §6.1: triggered by `v*` tags. Includes test, build matrix (linux/amd64, linux/arm64, windows/amd64), package (deb for amd64+arm64, rpm for amd64+arm64), and release job.

### Files Created

1. `.github/workflows/release.yml`

### Files Modified

None.

### Acceptance Tests

1. Workflow triggers on `push: tags: ['v*']`
2. Test job runs `go test -race ./...` before build
3. Build matrix produces 3 binaries: `neoguard-agent-linux-amd64`, `neoguard-agent-linux-arm64`, `neoguard-agent-windows-amd64.exe`
4. Package job produces deb and rpm for both amd64 and arm64
5. Release job creates GitHub Release with: all binaries, all packages, `checksums.txt` (SHA256 of every artifact), and attaches all as release assets
6. Version metadata injected via ldflags (`-X main.version=${TAG}`)
7. Workflow uses `CGO_ENABLED=0` and `-trimpath` for all builds
8. `actionlint` passes on the workflow file (if available)

### Non-Goals

- Do not implement cosign signing yet (DIST-005)
- Do not implement Docker image build yet (DIST-004)
- Do not implement MSI build yet (deferred post-v1 — WiX toolchain is heavy)
- Do not implement auto-update or curl-pipe-sh installer in this ticket

---

## Ticket DIST-003: Smart Install Script

- **Status:** Done
- **Priority:** P1
- **Phase:** 6 - Distribution
- **Depends on:** DIST-002 (Done)
- **Related findings:** None
- **Estimated Time:** 4 hours

### Goal

Create a self-contained `deploy/install-remote.sh` script per strategy §6.2. The script detects OS/arch, downloads the matching binary from a GitHub Release, verifies SHA256 checksum, installs, writes minimal config from CLI flags, and starts the service. Refuses to install if agent already present (suggests upgrade).

This replaces the existing `deploy/install.sh` (which requires files in CWD) for remote/cloud deployments.

### Files Created

1. `deploy/install-remote.sh` — smart remote installer

### Files Modified

None (existing `deploy/install.sh` remains for local/manual installs).

### Acceptance Tests

1. Script detects `linux/amd64`, `linux/arm64` from `uname -s` + `uname -m`
2. Script requires `--api-key` and `--endpoint` flags (exits 1 with usage if missing)
3. Script downloads binary + `checksums.txt` from GitHub Release URL
4. Script verifies SHA256 of downloaded binary against checksums.txt (exits 1 on mismatch)
5. Script refuses to install if `/usr/bin/neoguard-agent` already exists (prints upgrade suggestion)
6. Script creates user, dirs, config, service unit, enables+starts service
7. Script waits up to 30s for `/health` to return 200 (prints success/failure)
8. Script is shellcheck-clean (`shellcheck deploy/install-remote.sh` passes)
9. Script works with `set -euo pipefail`

### Non-Goals

- Do not implement signature verification (cosign) in v1 installer
- Do not implement Darwin/macOS support
- Do not implement uninstall command
- Do not implement upgrade-in-place (user stops service, runs install again)

---

## Ticket DIST-004: Production Docker Image

- **Status:** Done
- **Priority:** P1
- **Phase:** 6 - Distribution
- **Depends on:** DIST-001 (Done)
- **Related findings:** None
- **Estimated Time:** 3 hours

### Goal

Create a minimal production Dockerfile and integrate it into the release workflow. Per strategy §6.3: Docker image for containerized servers (not K8s orchestration). Multi-arch (amd64 + arm64) via `docker buildx`.

### Files Created

1. `Dockerfile` — multi-stage (build + scratch) production image
2. `.dockerignore` — exclude dev artifacts

### Files Modified

1. `.github/workflows/release.yml` — add Docker build+push job (pushes to `ghcr.io`)

### Acceptance Tests

1. `Dockerfile` uses multi-stage: Go builder stage + `FROM scratch` final stage
2. Final image contains only: binary, `/etc/neoguard/agent.yaml` (sample), CA certificates
3. Image size < 15 MB (binary is ~11 MB + CA bundle). If Docker is unavailable locally, mark as unverified.
4. `ENTRYPOINT ["/neoguard-agent"]` with `CMD ["run", "--config", "/etc/neoguard/agent.yaml"]` — allows argument override
5. No HEALTHCHECK in Dockerfile. The agent serves `/health` on port 8282 when configured; external orchestrators (Docker Compose, K8s) use that. Embedding HEALTHCHECK with `test-connection` conflates backend reachability with process liveness.
6. Release workflow builds `linux/amd64` and `linux/arm64` images
7. Release workflow pushes to `ghcr.io/neoguard/neoguard-agent:<tag>`
8. Image runs successfully: `docker run --rm ghcr.io/neoguard/neoguard-agent:latest version` (overrides CMD)

### Non-Goals

- Do not create Helm chart or Kubernetes manifests
- Do not implement env var expansion in config (already exists)
- Do not add Docker Compose for production use
- Do not implement multi-platform build in CI for CI job itself (only for release)

---

## Ticket DIST-005: Artifact Signing (Cosign)

- **Status:** Done
- **Priority:** P2
- **Phase:** 6 - Distribution
- **Depends on:** DIST-002 (Done), DIST-004 (Done)
- **Related findings:** None
- **Estimated Time:** 3 hours

### Goal

Add cosign keyless signing to all release artifacts (binaries, packages, Docker images) per strategy §6.1. Uses GitHub OIDC for keyless signing (no key management). Produces Sigstore `.bundle` files alongside each artifact. Bundle format chosen over standalone `.sig` because bundles are the current Sigstore recommendation for blob verification — they contain signature, certificate, and Rekor transparency log proof in a single file, verifiable via `cosign verify-blob --bundle`.

### Files Created

None.

### Files Modified

1. `.github/workflows/release.yml` — add cosign sign steps after artifact upload and after Docker push

### Acceptance Tests

1. Release workflow installs cosign via `sigstore/cosign-installer` action
2. Each binary and package gets a `.bundle` file attached to the GitHub Release (verifiable via `cosign verify-blob --bundle <file>.bundle <file>`)
3. Docker images are signed by digest: `cosign verify --certificate-identity-regexp=.* --certificate-oidc-issuer=https://token.actions.githubusercontent.com ghcr.io/neoguard/neoguard-agent:<tag>` succeeds
4. `checksums.txt` itself is signed (`checksums.txt.bundle` in release assets)
5. Workflow uses `id-token: write` permission for keyless OIDC signing

### Non-Goals

- Do not implement signature verification in the install script (noted in DIST-003 non-goals)
- Do not implement SBOM generation
- Do not implement Rekor transparency log verification in agent

---

## Ticket DIST-006: Chaos Tests

- **Status:** Done
- **Priority:** P1
- **Phase:** 6 - Distribution
- **Depends on:** None (tests against existing binary)
- **Related findings:** None
- **Estimated Time:** 6 hours

### Goal

Create `test/chaos/` with shell-based chaos tests per strategy §6.5. These run on Linux only and require root. They are NOT part of per-PR CI — they run nightly or on-demand. Each test starts the agent, induces a failure condition, and asserts correct behavior.

### Files Created

1. `test/chaos/network_partition_test.sh` — drop egress 5 min via iptables, verify WAL grows, restore, verify data delivered
2. `test/chaos/disk_full_test.sh` — fill tmpfs mount, verify agent detects WAL write failure, logs memory-only degradation, and remains alive
3. `test/chaos/oom_test.sh` — cgroup memory limit 80 MB, verify agent stays under or sheds load gracefully
4. `test/chaos/crash_recovery_test.sh` — kill -9 during write, restart, verify WAL replays without corruption
5. `test/chaos/log_burst_test.sh` — write 100k lines/sec to tailed file for 60s, verify memory stays under hard limit
6. `test/chaos/README.md` — prerequisites (root, systemd-run or cgroup v2, iptables)
7. `.github/workflows/chaos.yml` — nightly schedule, self-hosted runner (or skip if no runner)

### Files Modified

None.

### Acceptance Tests

1. Each script is shellcheck-clean
2. Each script exits 0 on pass, non-zero on fail, with clear output
3. `network_partition_test.sh`: after 5-min partition + restore, agent delivers buffered data (check via mock server or log inspection)
4. `crash_recovery_test.sh`: WAL file is intact after kill -9, agent replays on restart
5. `log_burst_test.sh`: peak RSS stays below 250 MB (hard limit from strategy §1.2)
6. Scripts require explicit `NEOGUARD_CHAOS_ENABLED=1` env var to run (safety guard)

### Non-Goals

- Do not implement clock skew chaos (already tested in unit tests via AGENT-011)
- Do not implement NFS hang test (no NFS in v1 scope)
- Do not require Docker or Kubernetes for chaos tests
- Do not implement auto-remediation — these are validation tests, not continuous chaos

---

## Ticket DIST-007: Performance Regression Suite

- **Status:** Done
- **Priority:** P1
- **Phase:** 6 - Distribution
- **Depends on:** None
- **Related findings:** None
- **Estimated Time:** 5 hours

### Goal

Create `test/perf/` with Go benchmarks and a baselines system per strategy §6.6. Track binary size, memory, CPU, startup time, throughput. CI fails if any metric regresses >10% from locked baseline.

### Files Created

1. `test/perf/bench_test.go` — Go benchmarks for: collection cycle latency, log throughput (lines/sec), startup time, memory allocation
2. `test/perf/baselines.json` — locked baselines (initially populated from first run)
3. `test/perf/check_regression.sh` — compares `go test -bench` output against baselines.json, exits non-zero if >10% regression
4. `test/perf/README.md` — how to update baselines

### Files Modified

1. `.github/workflows/ci.yml` — add performance check step (runs benchmarks, compares to baselines)
2. `Makefile` — add `bench` and `bench-check` targets

### Acceptance Tests

1. `go test -bench=. ./test/perf/` produces benchmark output
2. `baselines.json` contains at minimum: `binary_size_bytes`, `startup_ms`, `collection_cycle_p99_ms`, `memory_steady_state_bytes`, `log_throughput_lines_per_sec`
3. `check_regression.sh` exits 0 when within 10%, exits 1 when >10% regression with clear message
4. Binary size check: `ls -la bin/neoguard-agent-linux-amd64` < 15 MB (hard limit from strategy §1.2)
5. CI workflow includes perf check on main branch pushes

### Non-Goals

- Do not implement flamegraph generation in CI
- Do not implement multi-node benchmarks
- Do not block PRs on perf (only main branch)
- Do not implement historical trend storage (just current vs baseline)

---

## Ticket DIST-008: Documentation Completion

- **Status:** Done
- **Priority:** P1
- **Phase:** 6 - Distribution
- **Depends on:** DIST-001 (Done)
- **Related findings:** None
- **Estimated Time:** 6 hours

### Goal

Create the missing docs required by strategy §6.4 and update existing docs to reflect Phase 4 (logs) additions. Each doc has "Last updated" and "Verified on version" headers.

### Files Created

1. `docs/getting-started.md` — 5-min install → see metrics in UI
2. `docs/log-collection.md` — log source config, parsers, multiline, redaction
3. `docs/troubleshooting.md` — common issues: no metrics, agent offline, parse errors, clock skew, WAL corruption
4. `docs/cli.md` — all subcommands (`run`, `version`, `diagnose`, `test-connection`, `service install/uninstall`) with flags and examples
5. `docs/upgrading.md` — version upgrade procedures (deb, rpm, manual, Windows)
6. `docs/scaling.md` — documented limits per strategy §1.7 (1-1000 agents direct push)
7. `docs/compliance.md` — data access, transmission, at-rest, PII handling per strategy §6.7

### Files Modified

1. `docs/configuration.md` — add log source fields (parser, multiline, redaction)
2. `docs/metrics.md` — add agent self-metrics for log pipeline (`agent.logs.*`)
3. `docs/deployment.md` — fix path inconsistency (`/usr/local/bin` → `/usr/bin`), add log directory info

### Acceptance Tests

1. Every doc listed in strategy §6.4 table exists in `docs/`
2. Each doc has `Last updated:` and `Verified on version:` at top
3. `docs/compliance.md` covers all 8 items from strategy §6.7
4. `docs/cli.md` documents all 5 subcommands with flags
5. `docs/configuration.md` includes `logs.sources[]` schema with all fields
6. No broken internal cross-references between docs

### Non-Goals

- Do not create `docs/kubernetes.md` (K8s descoped from v1)
- Do not create a documentation site or static site generator
- Do not add doc staleness checking to CI (strategy mentions it, defer to post-v1)
- Do not document internal package APIs (these docs are user-facing)

---

## Phase 6 Summary

| Ticket | Priority | Status | Summary |
|--------|----------|--------|---------|
| DIST-001 | P0 | Done | Fix systemd ReadWritePaths, nfpm log dirs, binary path alignment |
| DIST-002 | P0 | Done | Tag-triggered release workflow with checksums |
| DIST-003 | P1 | Done | Smart remote install script (detect, download, verify, start) |
| DIST-004 | P1 | Done | Production Docker image (multi-arch, scratch-based) |
| DIST-005 | P2 | Done | Cosign keyless artifact signing |
| DIST-006 | P1 | Done | Chaos tests (network, disk, OOM, crash, log burst) |
| DIST-007 | P1 | Done | Performance regression suite with baselines |
| DIST-008 | P1 | Done | Documentation completion (7 new + 3 updated) |

**Execution order:**
Primary chain: DIST-001 → DIST-002 → DIST-004 → DIST-003 → DIST-005
Parallel after DIST-001: DIST-008
Independent anytime: DIST-006, DIST-007

**Dependency graph:**
```
DIST-001 (Done)
├── DIST-002 (Blocked → Ready when DIST-001 done)
│   ├── DIST-003 (Blocked → Ready when DIST-002 done)
│   └── DIST-005 (Blocked → Ready when DIST-002 + DIST-004 done)
├── DIST-004 (Blocked → Ready when DIST-001 done)
└── DIST-008 (Blocked → Ready when DIST-001 done)

DIST-006 (Ready) — independent
DIST-007 (Ready) — independent
```

**Descoped from v1:** MSI installer (WiX toolchain too heavy for solo dev, Windows .exe + manual install sufficient), Helm chart (K8s descoped), doc staleness CI.

---

# Phase 6.5 — Soak Testing (Release Gate)

## Ticket SOAK-001: v1 Release Soak and Operational Validation

- **Status:** Blocked (awaiting execution evidence)
- **Priority:** P0
- **Phase:** 6.5 - Soak Testing
- **Depends on:** Phase 6 complete (all DIST tickets Done)
- **Prerequisite:** AGENT-007 bare-metal validation (currently parked) must be closed as part of this ticket
- **Estimated Time:** 16 hours (4h preparation + 12h execution/monitoring across multi-day runs)

### Goal

Prove v1 is safe to ship by running the agent under sustained real-world conditions and collecting quantitative evidence of stability. This is a release gate — the outcome is a ship/no-ship decision backed by measured artifacts, not code changes.

### Two-Phase Structure

**Phase A — Preparation (executable on current dev machine):**
1. Write this soak plan (scenario definitions, thresholds, artifacts)
2. Write harness scripts (`test/soak/`) that automate each scenario
3. Define evidence artifacts (what files to capture, where to store)
4. Validate scripts structurally (shellcheck, syntax, dry-run paths)

**Phase B — Execution (requires real Linux host):**
1. Run all scenarios on a dedicated Linux target (bare-metal or VM, not container)
2. Collect evidence artifacts for each scenario
3. Close AGENT-007: validate container-aware GOMAXPROCS on bare-metal Linux
4. Produce final ship/no-ship report with pass/fail per scenario

**Completion rule:** SOAK-001 cannot be marked Done from structural validation alone. Actual Linux-host evidence is required for every scenario. Phase A completion moves status to `Blocked (awaiting execution)`, not `Review` or `Done`.

**Defect rule:** Any defect found during soak becomes a separate bug ticket (e.g., SOAK-BUG-001). The affected scenario must be rerun after the fix lands. SOAK-001 remains open until all scenarios pass.

### Files Created

1. `test/soak/README.md` — soak plan, environment requirements, execution instructions
2. `test/soak/run_all.sh` — orchestrator that runs scenarios sequentially, collects artifacts
3. `test/soak/scenario_idle.sh` — 24h idle host stability
4. `test/soak/scenario_metrics.sh` — 24h metrics-only steady state
5. `test/soak/scenario_logs.sh` — 24h logs-enabled steady state
6. `test/soak/scenario_log_load.sh` — sustained log load (100k lines/sec, 1h)
7. `test/soak/scenario_outage.sh` — outage and recovery (repeated network partitions)
8. `test/soak/scenario_restart.sh` — restart/crash-cycle durability (50 kill-9 cycles)
9. `test/soak/scenario_install.sh` — package/image/install smoke (deb, rpm, Docker, install script)
10. `test/soak/scenario_container.sh` — bare-metal container-detection validation (AGENT-007)
11. `test/soak/collect_evidence.sh` — evidence bundle creation (tar.gz of all artifacts)
12. `test/soak/REPORT_TEMPLATE.md` — final ship/no-ship report template

### Files Modified

None.

### Target Host Specification

| Field | Value |
|-------|-------|
| Instance type | EC2 t3.medium (2 vCPU, 4 GB RAM) or equivalent |
| OS | Ubuntu 24.04 LTS (kernel 6.x, cgroup v2 default) |
| Disk | 30 GB gp3 (enough for WAL + spool + evidence artifacts) |
| Docker | Docker CE 26.x (for S7 container tests) |
| Go | Not required on target (pre-built binary deployed) |
| Python | 3.12+ (for mock servers and log generators) |
| Network | Public IP or NAT gateway (for package download tests) |

Results from a different host spec are acceptable but must record the actual instance type, OS version, kernel version, CPU count, and RAM in the evidence bundle for reproducibility.

### Threshold Tiers

Each numeric threshold has three levels:

| Level | Meaning | Action |
|-------|---------|--------|
| Expected | Normal operating range including Go runtime noise (GC spikes, mmap growth) | No action |
| Warning | Above expected but not release-blocking; investigate in next iteration | Log in report, does not block ship |
| Release-blocking | Hard failure; ship is blocked until resolved | FAIL — spawn bug ticket, rerun after fix |

Go RSS noise floor on a 2-vCPU Linux host is typically 2-4 MB drift over 24h due to GC heap growth/shrink cycles, mmap fragmentation, and goroutine stack allocation. Thresholds account for this.

### Scenario Independence

- **Clean state required between scenarios:** Each scenario must start with a fresh agent state directory (WAL, spool, checkpoints, dead-letter). The harness creates a unique `$EVIDENCE_DIR/<scenario>/state/` per run.
- **Sequential execution:** Scenarios run one at a time on the same host. No concurrent agent instances.
- **Process isolation:** Each scenario starts its own agent process and kills it at the end. No daemon left running between scenarios.
- **Host reboot not required:** OS-level state (cgroups, iptables) is cleaned up by each scenario's trap. A reboot between scenarios is acceptable but not mandatory.
- **Order:** S1-S3 (long-running) first, then S4-S6 (stress), then S7-S8 (functional). This ordering catches memory leaks before they mask stress test results.

### Scenarios

#### S1: 24h Idle Host Stability

| Field | Value |
|-------|-------|
| Environment | Target host, no workload, agent collecting system metrics only |
| Duration | 24 hours |
| Command | `scenario_idle.sh` |
| Artifacts | `rss_samples.csv` (timestamp,rss_kb — 1/min, 1440 samples), `goroutines.csv` (timestamp,count — 1/min), `gc_pauses.csv` (timestamp,pause_ns — from /status endpoint), `agent.log`, `agent_version.txt` |
| Expected | RSS growth < 3 MB |
| Warning | RSS growth 3-8 MB |
| Release-blocking | RSS growth >= 8 MB OR agent died OR panic in log |
| Pass rule | RSS growth < 8 MB AND agent alive at end AND zero panics AND goroutine count stable (final < 2x initial) |

#### S2: 24h Metrics-Only Steady State

| Field | Value |
|-------|-------|
| Environment | Target host, synthetic /proc load (100 processes), 10s collection interval |
| Duration | 24 hours |
| Command | `scenario_metrics.sh` |
| Artifacts | `rss_samples.csv`, `points_collected.csv` (timestamp,total — 1/min), `send_errors.csv`, `wal_size.csv` (timestamp,bytes — 1/min), `agent.log` |
| Expected | RSS growth < 5 MB; send_errors == 0; WAL < 10 MB |
| Warning | RSS growth 5-15 MB; send_errors 1-5; WAL 10-50 MB |
| Release-blocking | RSS growth >= 15 MB OR send_errors >= 5 OR WAL >= 50 MB OR collection gap > 60s |
| Pass rule | All release-blocking thresholds pass AND collection cadence stable (no gap > 60s between consecutive collections) |

#### S3: 24h Logs-Enabled Steady State

| Field | Value |
|-------|-------|
| Environment | Target host, agent tailing 3 log files, ~1000 lines/sec total (sustained by Python writer) |
| Duration | 24 hours |
| Command | `scenario_logs.sh` |
| Artifacts | `rss_samples.csv`, `log_pipeline.csv` (timestamp,lines_read,lines_shipped,drops,spool_bytes — 1/min), `agent.log` |
| Expected | RSS growth < 8 MB; drops == 0; spool < 50 MB |
| Warning | RSS growth 8-20 MB; drops 1-100; spool 50-100 MB |
| Release-blocking | RSS growth >= 20 MB OR drops > 100 OR spool >= 100 MB OR log pipeline error in agent.log |
| Pass rule | All release-blocking thresholds pass AND no log pipeline errors |

#### S4: Sustained Log Load

| Field | Value |
|-------|-------|
| Environment | Target host, single file, 100k lines/sec sustained |
| Duration | 1 hour |
| Command | `scenario_log_load.sh` |
| Artifacts | `rss_peak.txt`, `rss_samples.csv` (1/sec, 3600 samples), `backpressure_events.txt` (grep from log), `drop_count.txt`, `lines_written.txt`, `lines_shipped.txt`, `agent.log` |
| Expected | RSS < 180 MB; backpressure activates; some drops acceptable under this load |
| Warning | RSS 180-250 MB; no backpressure logged (indicates unbounded buffering) |
| Release-blocking | RSS >= 250 MB OR agent died OR WAL corruption |
| Pass rule | RSS < 250 MB AND agent alive AND no corruption AND backpressure evidence in log |

#### S5: Outage and Recovery

| Field | Value |
|-------|-------|
| Environment | Target host, mock server on localhost, iptables partition cycles |
| Duration | ~2 hours (6 cycles of: 10min partition + 5min recovery) |
| Command | `scenario_outage.sh` |
| Artifacts | `cycles.csv` (cycle,wal_size_during,batches_after_restore,restore_latency_s), `mock_received.log`, `agent.log` |
| Expected | All 6 cycles buffer and deliver; restore latency < 30s |
| Warning | Restore latency 30-120s on any cycle |
| Release-blocking | Any cycle fails to deliver OR data loss (mock count < expected) OR agent died |
| Pass rule | All 6 cycles deliver buffered data within 120s AND zero data loss AND agent alive |

#### S6: Restart/Crash-Cycle Durability

| Field | Value |
|-------|-------|
| Environment | Target host, 50 kill-9 cycles with 30s run between each |
| Duration | ~30 minutes |
| Command | `scenario_restart.sh` |
| Artifacts | `cycles.csv` (cycle,start_ok,wal_intact,replay_ok), `wal_checksums.txt` (CRC after each crash), `agent_logs/` (one log per cycle) |
| Expected | All 50 cycles clean |
| Warning | N/A (any failure is release-blocking for a WAL system) |
| Release-blocking | Any WAL corruption OR any start failure OR any replay error |
| Pass rule | All 50 cycles: start succeeds AND WAL intact AND replay completes without error |

#### S7: Package/Image/Install Smoke

| Field | Value |
|-------|-------|
| Environment | Target host (Ubuntu 24.04 for deb, Docker for container; Rocky 9 tested via Docker container with systemd) |
| Duration | ~30 minutes |
| Command | `scenario_install.sh` |
| Artifacts | `deb_install.log`, `rpm_install.log`, `docker_run.log`, `remote_install.log`, `health_responses.json`, `package_file_lists.txt`, `versions.txt` |
| Expected | All methods succeed on first attempt |
| Warning | N/A |
| Release-blocking | Any install method fails OR service doesn't start OR health doesn't return 200 within 30s |
| Pass rule | deb + rpm + Docker + install-remote.sh all succeed with health 200 |

#### S8: Non-Container Linux Host Validation (AGENT-007)

| Field | Value |
|-------|-------|
| Environment | Target EC2 instance (2 vCPU), not inside a container, cgroup v2 |
| Duration | ~5 minutes |
| Command | `scenario_container.sh` |
| Artifacts | `gomaxprocs.txt`, `proc_cgroup.txt`, `nproc.txt`, `container_detection.txt` (parsed from agent.log), `agent.log` |
| Expected | GOMAXPROCS == nproc; no container detection |
| Warning | N/A |
| Release-blocking | GOMAXPROCS != nproc OR container falsely detected OR agent fails to start |
| Pass rule | GOMAXPROCS == nproc AND container_runtime == non-container AND agent starts normally |

### Acceptance Tests

1. All 8 scenario scripts exist in `test/soak/` and are shellcheck-clean
2. Each script produces a structured artifact directory (`test/soak/evidence/<scenario>/`)
3. `run_all.sh` executes scenarios sequentially and produces a summary (pass/fail per scenario)
4. `REPORT_TEMPLATE.md` has sections for each scenario with placeholders for evidence
5. Phase A deliverables validated structurally (shellcheck, file existence)
6. Phase B: all 8 scenarios pass on a real Linux host with evidence captured
7. AGENT-007 bare-metal validation passes (S8) — this unparks AGENT-007
8. Final report produced with ship/no-ship recommendation

### Non-Goals

- Do not add new production features (this is validation only)
- Do not run soak tests in CI (too long, requires dedicated host)
- Do not implement auto-remediation or self-healing
- Do not implement Kubernetes soak (K8s descoped from v1)
- Do not require cloud infrastructure (bare-metal or local VM is sufficient)
- Do not block on pilot customers (simulated environments are the v1 gate substitute)

---

## Phase 6.5 Summary

| Ticket | Priority | Status | Summary |
|--------|----------|--------|---------|
| SOAK-001 | P0 | Blocked (awaiting execution) | v1 release soak and operational validation (8 scenarios) |
