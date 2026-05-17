# NeoGuard Agent - Execution Changelog

This file tracks planning, ticketing, review, and coordination changes for the agent workstream.

Use `CHANGELOG.md` for product/release changes. Use this file for work-management changes that affect how ChatGPT, Claude, and human reviewers coordinate.

---

## 2026-05-17

### SOAK-001: Dry-Run Harness Fixes

- **Date:** 2026-05-17 05:00-05:35 UTC
- **Context:** During Phase B dry-run validation on EC2 i-064daef82f7146cac, two harness defects were discovered and fixed.
- **Fix 1 — scenario_restart.sh (S6):** Grep pattern `"WAL replay.*error\|corrupt\|invalid frame"` caused false-positive on successful replay log line containing `"corrupted_frames":0`. Narrowed to exact error messages: `"WAL replay: corrupt frame\|WAL replay open failed\|invalid frame"`.
- **Fix 2 — scenario_outage.sh (S5):** Internal mock used `MOCK_PORT=19900`, conflicting with the global soak mock on the same port. Changed to `MOCK_PORT=19902`.
- **Shellcheck:** Both scripts pass (SC2317 info-only on trap functions, known false positive).
- **Status:** Fixes committed to repo. Full-duration soak running with corrected scripts.

### SOAK-001: Full-Duration Run

- **Date:** 2026-05-17 05:30 UTC (started)
- **Unit:** neoguard-soak-full.service (systemd-run)
- **Host:** i-064daef82f7146cac, t3.large, 2 vCPU, 7.6 GiB RAM, Amazon Linux 2023
- **Scenarios scheduled:** All 8 (S1-S8) will execute sequentially.
- **S7 expectation:** Will execute but will FAIL (correctly) because release artifacts (.deb, .rpm, Docker image) are not staged on the instance. The corrected harness now treats missing artifacts as hard failures, not skips.
- **S7 prerequisite to pass:** Build release packages via DIST-002 workflow, stage them at `$REPO_ROOT/bin/` on the instance, and ensure Docker image is pullable.
- **Classification:** S1-S6 and S8 evidence is valid if those scenarios pass. S7 evidence will be a correct FAIL until artifacts are staged and S7 is re-run.

### SOAK-001: S7 Harness Fix

- **Date:** 2026-05-17 05:40 UTC
- **Defect:** scenario_install.sh treated missing .deb, .rpm, and install-remote.sh as SKIP (no FAILED=1), allowing a false PASS when required artifacts were absent.
- **Fix:** Missing .deb → FAIL. Missing .rpm → FAIL. Missing install-remote.sh → FAIL. Missing agent binary for serve → FAIL. install-remote.sh test upgraded from `bash -n` syntax check to actual execution inside Docker container with local file server + health 200 verification.
- **Shellcheck:** Pass (SC2317 info + SC2002 style only).
- **Deployed:** Corrected script uploaded to EC2 before the orchestrator reaches S7 (~3 days out).

---

## 2026-05-16

### AGENT-012: Serializer Interface Abstraction - COMPLETE

- **Date:** 2026-05-16 11:00 UTC (started) → 11:30 UTC (initial impl) → 11:45 UTC (test corrections) → 12:00 UTC (verified) → 12:05 UTC (approved)
- **Status:** Done
- **Phase:** 0 - Correctness Foundation (P1)
- **Implementation summary:**
  - Added `Serializer` interface for metrics-ingest transport path only
  - Implemented `JSONSerializer` as the only v1 codec
  - Updated `Client` to use serializer abstraction for `Marshal()` and `ContentType()`
  - Created unexported `newClientWithSerializer()` for test injection
  - `NewClient()` defaults to `JSONSerializer{}` (preserves existing API)
  - Preserved exact JSON wire format and gzip compression behavior
  - Preserved `PermanentError{Message: "marshal: ..."}` format on serialization failures
  - No changes to lifecycle, WAL, or dead-letter JSON paths (verified)
  - **Test correction:** Fixed TestClientUsesSerializerMarshal and TestClientUsesSerializerContentType to use `trackingSerializer` with sentinel payload/content-type, proving serializer indirection actually works
- **Files changed:**
  - Added: `internal/transport/serializer.go` (28 lines)
  - Added: `internal/transport/serializer_test.go` (42 lines)
  - Updated: `internal/transport/client.go` (removed `encoding/json` import, added serializer field, split constructor, updated Send())
  - Updated: `internal/transport/client_test.go` (added `trackingSerializer` test type, 7 acceptance tests with proper injection)
- **Verification results:**
  ```
  go test ./internal/transport → PASS (all 69 tests, 21.065s)
  go test ./internal/agent → PASS (all tests, cached)
  go build ./cmd/neoguard-agent → SUCCESS
  ```
- **Confirmed unchanged:**
  - `internal/transport/lifecycle.go` (0 diff lines)
  - `internal/transport/deadletter.go` (0 diff lines)
  - WAL and buffer changes are from AGENT-015 (previous session)
- **Risk level:** Low (narrow abstraction, preserves existing wire format)

---

### Phase 4 Logs Tickets Third Correction (Final Cleanup)

- **Date:** 2026-05-16 15:00 UTC
- **Action:** Final 3 corrections before approval
- **Corrections applied:**
  1. **LOGS-001**: Removed stray "Separate goroutines for log vs metric transmission" from Pipeline isolation verification (deferred to LOGS-006)
  2. **TICKETS.md LOGS-006**: Synced with Option A decision (removed "BLOCK: Choose serializer/client" language, added "Option A chosen" in summary)
  3. **LOGS-002 testability**: Added explicit injectable intervals requirement (checkpointInterval, pollInterval params for TailerOptions). Updated AT-7 and AT-8 to use 100ms injected intervals instead of multi-second wall-clock sleeps
- **Files updated:**
  - LOGS-001.md (removed goroutine requirement, moved to Out of Scope)
  - TICKETS.md (LOGS-006 summary updated with Option A, status → Ready for LOGS-001)
  - LOGS-002.md (added testability requirement, rewrote AT-7 and AT-8 with injected intervals)
  - PHASE_TRACKER.md (LOGS-001 status → Ready)
  - EXECUTION_CHANGELOG.md (this entry)
- **Status:** LOGS-001 approved and moved to Ready. Can proceed with implementation.

---

### Phase 4 Logs Tickets Second Correction (Tracker Alignment + Test Completeness) — SUPERSEDED

- **Date:** 2026-05-16 14:30 UTC
- **Action:** Aligned TICKETS.md/PHASE_TRACKER.md with corrected standalone specs, fixed test gaps, chose client architecture — INCOMPLETE (3 issues remained)
- **Corrections applied:**
  1. **TICKETS.md sync**: Updated LOGS-001 (config schema, NO log WAL), LOGS-002 (cursor persistence §4.1, NOT logs/state.json), LOGS-005 (credential redaction, NOT PII), LOGS-006 design decision
  2. **PHASE_TRACKER.md**: Changed LOGS-005 description from "PII redaction" to "Credential redaction (bearer, AWS keys, API key fields, password fields)"
  3. **LOGS-002 acceptance tests**: Added 4 missing tests (AT-5 copytruncate, AT-6 start_position=end, AT-7 5-second checkpoints, AT-8 missing-file polling)
  4. **LOGS-005 bearer tokens**: Replaced invalid short samples ("Bearer abc123") with realistic 20+ char tokens ("Bearer eyJhbGci...")
  5. **LOGS-006 acceptance tests**: Fixed AT-1 (raw JSON tenant_id absence check), AT-6 (behavior-based goroutine separation)
  6. **LOGS-006 design decision**: Chose Option A (separate LogClient) - preserves AGENT-012 narrow Serializer, avoids premature generics
  7. **LOGS-001 scope correction**: Removed premature transmission-goroutine language (deferred to LOGS-006)
- **Files updated:**
  - TICKETS.md (LOGS-001, LOGS-002, LOGS-005 inline summaries, LOGS-002 acceptance test list)
  - PHASE_TRACKER.md (LOGS-005 description)
  - LOGS-002.md (rewrote with 8 complete acceptance tests)
  - LOGS-005.md (fixed bearer token samples in AT-1, AT-5, AT-6, AT-7)
  - LOGS-006.md (chose Option A, fixed AT-1 and AT-6 test designs)
  - LOGS-001.md (removed transmission-goroutine scope item)
  - EXECUTION_CHANGELOG.md (this entry)
- **Status:** All Phase 4 tickets now aligned. Awaiting reviewer approval to move LOGS-001 to Ready.

---

### Phase 4 Logs Tickets Corrected for Contract Alignment (SUPERSEDED - incomplete tracker sync)

- **Date:** 2026-05-16 13:45 UTC
- **Action:** Revised Phase 4 tickets to align with `log_pipeline_contract.md` (5 blocking findings corrected) - INCOMPLETE (trackers/tests still had gaps)
- **Blocking findings corrected:**
  1. **LOGS-001**: Removed log WAL (logs use spool only per §2.3), aligned config schema to frozen contract §2.4, removed incorrect log/wal/ directory
  2. **LOGS-002**: Aligned cursor storage to contract §4.1 (per-file checkpoints in `log_cursors/<path-hash>.json`), added checkpoint frequency (5s), start_position defaults, three rotation modes (rename/copytruncate/missing)
  3. **LOGS-005**: Replaced PII redaction (email/CC/SSN) with credential redaction per contract §8.3 (bearer tokens, AWS keys, API key fields, password fields). Credit cards/SSNs explicitly deferred to v2 per §8.5.
  4. **LOGS-006**: Removed tenant_id injection (backend-derived per §3.4), changed from WAL to JSONL spool per §2.3, fixed batch limit to 1000 events OR 1 MB per §4.5 and §7.2, added BLOCK for client/serializer design decision (current Serializer is metrics-only per AGENT-012)
  5. **LOGS-002**: Added explicit scope for start_position, rename/copytruncate/missing-file behavior per §4.2 and §4.3
- **Files updated:**
  - Rewrote: `LOGS-001.md` (config schema per §2.4, spool/dead-letter/cursors dirs, NO log WAL)
  - Rewrote: `LOGS-002.md` (cursor structure per §4.1, checkpoint frequency 5s, three rotation modes)
  - Replaced: `LOGS-005.md` (credential redaction per §8.3, NOT PII)
  - Replaced: `LOGS-006.md` (spool NOT WAL, 1000 events OR 1 MB, NO tenant_id, tags field NOT resource, design decision BLOCK)
  - Updated: `TICKETS.md` (LOGS-001 status → Blocked, LOGS-006 design decision note)
  - Updated: `PHASE_TRACKER.md` (LOGS-001 blocked status)
- **Status:** LOGS-001 through LOGS-006 now blocked pending review approval of corrected specs
- **Next step:** Reviewer approval of corrected ticket set before LOGS-001 can become Ready

---

### Phase 3/4 Logs Workstream Tickets Created (SUPERSEDED - see correction above)

- **Date:** 2026-05-16 13:00 UTC
- **Action:** Analyzed backend log implementation, prepared agent-side tickets (CONTAINED CONTRACT DRIFT)
- **Backend audit findings:**
  - `POST /api/v1/logs/ingest` exists and operational (logs.py:14-24)
  - `LogBatch`, `LogEntry` models defined (models/logs.py)
  - ClickHouse `logs` table schema operational (query.py uses it)
  - Log writer with async batching complete (services/logs/writer.py)
  - **Conclusion:** Backend log support is complete per contract
- **Agent gap analysis:**
  - No file tailing code exists (Linux/Windows)
  - No parser modes (raw/JSON/regex)
  - No multiline support
  - No redaction
  - No log-specific buffering (isolation from metrics pipeline)
  - No agent-side correlation (identity tag injection)
- **Tickets created:**
  - `LOGS-001` (P0, Ready): Log pipeline foundation (config, directories, isolation)
  - `LOGS-002` (P0, Blocked): File tailing with rotation handling
  - `LOGS-003` (P0, Blocked): Parser modes (raw, JSON, regex)
  - `LOGS-004` (P1, Blocked): Multiline support
  - `LOGS-005` (P1, Blocked): PII redaction
  - `LOGS-006` (P0, Blocked): Log buffering and transmission
- **Coordination impact:**
  - Phase 0: Complete except AGENT-007 (parked)
  - Phase 1: Complete (agent registry)
  - Phase 2: Complete (metrics polish)
  - Phase 3: Complete (logs backend)
  - Phase 4: Ready (6 agent tickets)
  - Next executable work: `LOGS-001` (Ready)
- **Files updated:**
  - Added: `LOGS-001.md` through `LOGS-006.md` (ticket specs)
  - Updated: `TICKETS.md` (added 6 log tickets)
  - Updated: `PHASE_TRACKER.md` (phase statuses, active tickets)
  - Updated: `EXECUTION_CHANGELOG.md` (this entry)

---

### AGENT-012 Created - Serializer Interface Abstraction

- **Status:** Done (completed 2026-05-16)
- **Phase:** 0 - Correctness Foundation (P1)
- **Reason selected next:** `AGENT-007` remains intentionally parked awaiting bare-metal Linux validation; `0.12` is the next executable Phase 0 item.
- **Scope frozen:**
  - metrics-ingest transport abstraction only
  - `Serializer` interface for `model.MetricBatch`
  - v1 JSON implementation only
  - no changes to lifecycle JSON, WAL persistence, dead-letter JSONL, compression, or backend contracts
- **Files added:** `AGENT-012.md`
- **Tracker updates:** `TICKETS.md`, `PHASE_TRACKER.md`
- **Hook requirement:** Claude must explicitly follow `CLAUDE_EXECUTION_HOOKS.md` before implementation and before moving to `Review`.

---

### AGENT-015: Internal Pressure Metrics - COMPLETE

- **Date:** 2026-05-16 09:35 UTC (initial) → 10:15 UTC (collision fix) → 10:40 UTC (verified) → 10:45 UTC (approved)
- **Status:** Done
- **Phase:** 0 - Correctness Foundation (Production Hardening, P0-B)
- **Implementation summary:**
  - Added 7 new pressure metrics (5 WAL + 2 dead-letter) using component-owned pattern
  - Documented 10 existing undocumented metrics in docs/metrics.md (transmitter, backpressure, supervisor)
  - Base tags propagation fixed: components accept baseTags parameter to preserve identity tags
  - All 14 acceptance tests passing with explicit tag preservation verification
  - Integration test fixed: HTTP handler now decompresses gzip before decoding JSON batch
  - **Production defect fixed:** Dead-letter filename collision (millisecond timestamp insufficient, added atomic sequence suffix)
- **Files changed:**
  - `internal/buffer/wal.go` lines 578-594: Added Metrics() method accepting baseTags
  - `internal/transport/deadletter.go`: Added seqCounter atomic field, filename format now `{millis}-{retry}-{seq}.jsonl.gz`, Stats() and Metrics() methods
  - `internal/collector/agentself.go` lines 1-10, 28-35, 42-68: Updated constructor, added component dependencies
  - `internal/agent/agent.go` line 352: Updated AgentSelfCollector instantiation
  - `internal/collector/agentself_test.go` lines 9, 25, 91: Updated test calls
  - `internal/buffer/wal_test.go` lines 217-376: Added 5 WAL metric tests with tag preservation
  - `internal/transport/deadletter_test.go`: Added 3 dead-letter metric tests with Write() error assertions, updated filename pattern checks
  - `internal/agent/integration_test.go` lines 3-19, 290-340, 314-334: Fixed gzip handling, config structure
  - `docs/metrics.md` lines 413-479: Documented 17 metrics across 5 new sections
- **Verification command result:**
  ```
  go test ./internal/buffer ./internal/transport ./internal/collector ./internal/agent
  ok internal/buffer 2.099s
  ok internal/transport 21.257s
  ok internal/collector 4.072s
  ok internal/agent 42.368s
  ```
- **Deviations:** None. All 7 new metrics emitted with identity tags. All 10 existing metrics documented. Collision defect fixed.

---

## 2026-05-15

### AGENT-007: Container-Aware Runtime Limits - TICKET REVISED

- **Date:** 2026-05-15 19:00 UTC (initial) → 19:45 UTC (revised)
- **Status:** Ready (Revised, awaiting reviewer approval)
- **Phase:** 0 - Correctness Foundation (Production Hardening, P0-B)
- **Ticket creation rationale:**
  - Raw execution-plan spec (0.8 Container-aware GOMAXPROCS) needed architected ticket before implementation
  - Existing cgroup v1/v2 parser already present in `internal/procfs/cgroup.go` (263 lines)
  - Existing container metrics already present in `internal/collector/container_linux.go` (8 `system.container.*` metrics)
  - Execution-plan spec had incorrect acceptance criterion ("goroutine count stays within container limits" — GOMAXPROCS does NOT cap goroutine count)
  - Current cgroup parser reads fixed paths (`/sys/fs/cgroup/cpu/cpu.cfs_quota_us`) which breaks for nested cgroups (systemd slices, Kubernetes pods)
- **Mandatory plan corrections applied (initial):**
  1. Reuse existing cgroup parser and container collector (do NOT duplicate)
  2. Audit nested cgroup path handling — add `parseCgroupPath()` to extract process-specific paths from `/proc/self/cgroup`
  3. Replace invalid "goroutine count" criterion with correct GOMAXPROCS validation
  4. Reconcile metric contract: keep existing 8 `system.container.*` metrics, add only 2 new metrics
  5. Add `automaxprocs` dependency documentation in new file `docs/dependencies.md`
  6. Add 8 unit tests + 4 integration tests + 3 manual Docker smoke tests
  7. Correct manual smoke test: `--cpus=2` → `GOMAXPROCS=2`

- **Reviewer corrections applied (revision 1, 10 corrections):**
  1. **Removed "well-tested" claim** — cgroup parser has no direct test coverage, this ticket adds first tests
  2. **Fixed runtime/metric wording** — current metric is `system.container.detected`, tag is `container_runtime`, values: `kubernetes`, `docker`, `containerd`, `lxc`, `container`, `baremetal`
  3. **Redesigned cgroup path API** — `CgroupPaths` struct with separate `CPUPath`, `CPUAcctPath`, `MemoryPath` (v1 uses separate hierarchies)
  4. **Removed procfs logging** — return `FallbackUsed` metadata instead of hidden warning logs
  5. **Fixed automaxprocs logging** — capture before/after GOMAXPROCS in our code, emit stable NeoGuard log message (do not rely on upstream format)
  6. **Renamed tests** — "integration tests" → "fixture-based unit tests" (reserve integration for real containers)
  7. **Expanded docs/dependencies.md** — document all 5 direct dependencies from `go.mod`, not just automaxprocs
  8. **Fixed test count** — 12 fixture-based unit tests + 3 manual smoke tests (consistent everywhere)
  9. **Container-relative PIDs** — explicitly deferred to AGENT-008 with rationale (orthogonal to GOMAXPROCS, requires PID namespace detection)
  10. **cgroup_version semantics** — documented 0=unknown, 1=v1, 2=v2 in metrics.md and tests

- **Ticket location:** `AGENT-007-TICKET-REVISED.md` (full spec), `TICKETS.md` (summary entry updated)
- **Tracker updates applied:**
  - Added AGENT-007 to active tickets table in `PHASE_TRACKER.md`
  - EXP-008 status corrected in `FINDINGS.md` (Open → Fixed, Phase 0.4 complete)
- **Reviewer corrections applied (revision 2, 3 final corrections):**
  1. **Fixed automaxprocs API** — use `go.uber.org/automaxprocs/maxprocs` subpackage (callable API), not top-level blank-import package. Import and call: `import "go.uber.org/automaxprocs/maxprocs"`, `_, err := maxprocs.Set(maxprocs.Logger(...))`
  2. **Fixed FallbackUsed semantics** — made unambiguous:
     - `parseCgroupPaths` is non-failing, returns `*CgroupPaths` (no error), malformed content → root paths with `FallbackUsed=true`
     - Read functions set `info.FallbackUsed=true` when nested sysfs path missing and root path used
     - Either parse fallback OR sysfs fallback sets `FallbackUsed=true` (sticky flag)
  3. **Fixed automaxprocs license** — corrected from Apache-2.0 to MIT (official package reports MIT)

- **Next step:** Await reviewer approval of final revised ticket before implementation

### EXP-008 Tracker Correction

- **Date:** 2026-05-15 19:00 UTC
- **Issue:** `FINDINGS.md` listed EXP-008 as "Open (Phase 0.4)" but `PHASE_TRACKER.md` showed 0.4 as complete
- **Root cause:** Health bind address was already made configurable via `health.bind` config field (supports `host:port` format, defaults to `127.0.0.1:8282`, validated in `config.go`)
- **Evidence:**
  - `internal/config/config.go`: `HealthConfig` struct with `Bind` field, validation via `net.SplitHostPort()`
  - `internal/config/config_test.go`: 6 tests for health bind address (`TestHealthBindDefault`, `TestHealthBindOnly`, etc.)
  - `internal/healthz/server.go`: accepts `bind` parameter in `New()`, uses it for `http.Server.Addr`
- **Correction applied:** Updated `FINDINGS.md` EXP-008 status from "Open (Phase 0.4)" to "Fixed (Phase 0.4, 2026-05-15)" with resolution description
- **Impact:** Phase 0.4 is confirmed complete, no blocking work remains

### AGENT-006: Custom CA Bundle Support - DONE

- **Date:** 2026-05-15 14:30 UTC (START) → 18:15 UTC (REVIEW v3 - FINAL) → 18:20 UTC (APPROVED)
- **Status:** Ready → In Progress → Review → Corrections → Review (Final) → Done
- **Phase:** 0 - Correctness Foundation (Production Hardening)
- **Risk Level:** P1 - Breaking changes to client constructors, agent.New signature
- **Implementation summary:**
  - Config schema: Added `ca_bundle_path` field with absolute path validation, file existence check, directory rejection, and PEM certificate parsing validation
  - Documentation: Added Custom CA Bundle section to `docs/configuration.md` with absolute path requirement, additive trust semantics, validation errors, reload behavior, and examples
  - TLS helpers: Created `internal/transport/tls.go` with `buildTLSConfig()` (RootCAs=nil for empty path, additive trust via SystemCertPool+AppendCertsFromPEM for custom CA) and `newHTTPTransport()` with TLS 1.2 enforcement
  - Metrics client: Changed `NewClient()` to error-returning constructor with caBundlePath parameter, uses shared TLS helper
  - Lifecycle client: Changed `NewLifecycleClient()` to error-returning constructor with caBundlePath parameter, uses shared TLS helper
  - Agent constructor: Changed `agent.New()` to (*Agent, error) signature, constructs both clients with error handling
  - Main entry point: Updated `loadAgent()` with error handling and os.Exit(1) on constructor failure
  - Call-site updates: Updated all 63 constructor occurrences (24 NewClient + 18 NewLifecycleClient + 21 agent.New) across 10 files with explicit error handling (zero discarded errors confirmed via rg)
  - Test coverage:
    - Config: 7 new tests in `ca_bundle_test.go` - all pass
    - TLS unit: 7 new tests in `tls_test.go` - all pass (includes SystemCertPool + AppendCertsFromPEM pattern, custom CA loading, fallback behavior)
    - TLS integration: 4 tests in `client_tls_test.go` (metrics client, lifecycle client, wrong CA wrapped as RetryableError, platform default rejects untrusted) using in-process crypto/x509 certificate generation (no OpenSSL dependency)
- **Verification results:**
  - `go test ./internal/config` - PASS (1.125s)
  - `go test ./internal/transport` - PASS (cached)
  - `go test ./internal/agent` - PASS (37.056s, 38 tests)
  - `go build ./cmd/neoguard-agent` - SUCCESS
  - `go vet ./internal/config ./internal/transport ./internal/agent` - clean
  - `gofmt -l` on all 15 AGENT-006 files - clean (no output)
  - `rg 'a, _ := New\(|client, _ := |c, _ := |lc, _ := '` - zero matches (no discarded constructor errors)

---

### UI-001 Approved and Completed

- **Ticket:** UI-001 - Single Resource Pane
- **Date:** 2026-05-15
- **Status change:** In Progress -> Review -> Done
- **Reviewer verdict:** Implementation approved from technical standpoint
- **Final corrections applied (compile-time type safety + direct tone tests):**
  1. Exported `AgentStatus` and `AgentStatusTone` type unions for compile-time exhaustiveness
  2. Changed `AGENT_STATUS_TONE` from `Record<string, ...>` to `Record<AgentStatus, AgentStatusTone>` (TypeScript enforces all 7 statuses present)
  3. Exported `getAgentStatusTone()` for direct testing with runtime fallback to "neutral"
  4. Added 12 direct unit tests for `getAgentStatusTone()` proving exact tone mappings:
     - 7 valid backend statuses (active→success, degraded→warning, stale→warning, stopped→neutral, crashed→danger, replaced→neutral, unknown→neutral)
     - 3 edge cases (null→neutral, undefined→neutral, empty string→neutral)
     - 1 unexpected value test (any unexpected string→neutral)
     - 1 case-insensitive test (ACTIVE/Active/CRASHED normalize correctly)
  5. Updated UI tests (Tests 11-14) to only claim label rendering, not tone correctness
  6. Fixed remaining mojibake in InfrastructurePage.test.tsx (arrow character → ASCII)
- **Test results:**
  - ResourceDetailPage: 26/26 passed (12 helper unit tests + 14 UI tests)
  - InfrastructurePage: 26/26 passed
- **Build status:** 27 pre-existing TypeScript errors in unrelated test files (AdminPage, AlertDetailPage, AlertsPage, LogsPage, MetricsPage, OverviewPage, DashboardSettings, api.test). UI-001 files: 0 errors.
- **Residual risk:** Pre-existing build debt blocks production bundle generation (separate cleanup ticket needed). UI-001 implementation is complete, technically sound, and tested.

### UI-001 Corrections Applied (Second Iteration)

- **Ticket:** UI-001 - Single Resource Pane
- **Date:** 2026-05-15
- **Status change:** Review (rejected) -> In Progress -> Review (rejected again)
- **Reviewer correction requirements applied:**
  1. Backend CloudResource model updated: added `region` and `account_id` top-level fields (were missing despite resources table having them)
  2. Frontend process handling fixed: aggregated process_group rows now render with empty user field ("-" instead of "unknown"), name = process_group, PID/Group column shows group
  3. Copy button removed from resource_id display (unapproved scope)
  4. All 10 ResourceDetailPage tests fixed to use specific queries, correct 404 text matching, proper process_group assertions
  5. InfrastructurePage test added: "Open Detail Page" button verification
- **Files changed (backend):**
  - Modified: `src/neoguard/models/resources.py` (CloudResource: +2 fields)
  - Modified: `src/neoguard/services/resources/correlation.py` (_get_cloud_resource query: +region, +account_id)
- **Files changed (frontend):**
  - Modified: `frontend/src/types/index.ts` (CloudResource: +2 fields)
  - Modified: `frontend/src/pages/ResourceDetailPage.tsx` (removed copy button, fixed process user rendering, fixed cloud metadata display)
  - Modified: `frontend/src/pages/ResourceDetailPage.test.tsx` (all 10 tests now pass, proper within() queries, fixed 404 assertion)
  - Modified: `frontend/src/pages/InfrastructurePage.test.tsx` (+1 test for Open Detail Page button)
- **Test results:**
  - ResourceDetailPage: 10/10 passed
  - InfrastructurePage: 26/26 passed (including new button test)
- **Build status:** TypeScript compilation FAILED with 28 errors in pre-existing test files (AdminPage, AlertDetailPage, AlertsPage, LogsPage, MetricsPage, OverviewPage, DashboardSettings, services/api.test) — all unrelated to UI-001. UI-001 files have 0 TypeScript errors.
- **Residual risk:** Build debt blocks production bundle generation; UI-001 implementation is complete and tested but cannot be deployed until pre-existing test type errors are resolved.

### UI-001 Started

- **Ticket:** UI-001 - Single Resource Pane
- **Date:** 2026-05-15
- **Status change:** Ready -> In Progress
- **Expected files:**
  - New: `frontend/src/pages/ResourceDetailPage.tsx` (~850 lines - reduced from 900, disk/network charts removed per reviewer adjustment)
  - New: `frontend/src/pages/ResourceDetailPage.test.tsx` (~350 lines)
  - Modified: `frontend/src/types/index.ts` (+65 lines)
  - Modified: `frontend/src/services/api.ts` (+3 lines)
  - Modified: `frontend/src/App.tsx` (+2 lines)
  - Modified: `frontend/src/pages/InfrastructurePage.tsx` (+15 lines for "Open Detail Page" button)
- **Scope adjustments from reviewer:**
  - Approved: 2 OS charts only (CPU, memory) — disk/network deferred pending series selector design
  - Approved: All other aspects (correlation endpoint, resource_id canonical, process_pid/process_group handling, logs summary from payload)
- **Risk level:** Medium (new page, metric query patterns, process tag handling)

### UI-001 Promoted to Ready

- **Ticket:** UI-001 - Single Resource Pane
- **Date:** 2026-05-15
- **Status change:** Proposed -> Ready
- **Reason:** Its only declared dependency, `BACKEND-001`, is now Done. The backend correlation read model required by the pane is available.
- **Reviewer direction:** Claude may begin read-only discovery and return a frontend implementation plan for approval before editing code.

---

### BACKEND-001 Reviewer Gate Approved

- **Ticket:** BACKEND-001 - Resource Correlation Read Model
- **Date:** 2026-05-15
- **Final status:** Done
- **Reviewer decision:** Approved after the final correction to enforce `get_query_tenant_id`, independent verification of 24 targeted tests, and review of source-by-source correlation logic.
- **Verified behavior:** Partial responses work across cloud-only, agent-only, metrics-only, and logs-only resources; 404 is returned only when all sources are empty; joins remain on `(tenant_id, resource_id)` with hostname display-only.
- **Finding status:** `EXP-021` advanced to Mostly Fixed. Backend enforcement is complete; `UI-001` remains.
- **Residual risk:** The new route tests call the route function directly rather than exercising full FastAPI dependency injection end to end, but the route binding is correct and existing dependency tests cover `get_query_tenant_id` behavior elsewhere.
- **Next eligible work:** `UI-001` can now be promoted from Proposed to Ready.

---

### BACKEND-001 Final Corrections Applied - Moved to Review

- **Ticket:** BACKEND-001 - Resource Correlation Read Model
- **Date:** 2026-05-15
- **Status:** In Progress -> Review (final corrections applied)
- **Corrections applied (reviewer round 3 - final):**
  1. **P0: Tenant resolution fixed** - Changed endpoint to use `get_query_tenant_id` (returns `str`, never None) to enforce single-tenant correlation always
  2. **P1: Route-level tests corrected** - Replaced fake tests with actual route function calls, removed invalid "accepts None tenant" test, added tests proving tenant_id is always string
  3. **P1: Route-level tests added** - 5 tests proving canonical resource_id usage, single-tenant enforcement, and route never passes None to service
  4. **P1: Log-helper tests added** - 7 tests proving ClickHouse SQL filters on `tenant_id` and `resource['resource_id']`, correct row mapping, tenant isolation
  5. **P2: Tracking corrected** - Reverted EXP-021 from "Mostly Fixed" to "Partially Fixed" pending approval
- **Corrections applied (reviewer round 2):**
  1. Changed endpoint from `get_tenant_id_required(request)` to dependency-based resolution
  2. Added route-level and log-helper test coverage
- **Implementation completed:**
  - Extended logs service with `query_logs_by_resource()` and `query_logs_severity_distribution()`
  - Created correlation service at `src/neoguard/services/resources/correlation.py`
  - Added API route `GET /api/v1/resources/correlation/{resource_id}` using `get_query_tenant_id`
  - Created 6 response models for correlation endpoint
  - Added 24 comprehensive tests (12 service + 5 route + 7 log helpers)
- **Verification evidence:**
  - All 24 tests pass (1.02s total)
  - Tenant isolation enforced at route and service levels
  - Partial responses work (cloud-only, agent-only, metrics-only, logs-only)
  - 404 only when ALL sources empty
  - Canonical resource_id used in all queries, not ULID or hostname

---

### BACKEND-001 Initial Plan Approved

- **Ticket:** BACKEND-001 - Resource Correlation Read Model
- **Date:** 2026-05-14
- **Status:** Ready -> In Progress
- **Plan version:** v2 (after two rounds of reviewer corrections)
- **Key decisions:**
  - Use `get_query_tenant_id()` for single-tenant enforcement (never cross-tenant)
  - Support partial responses (cloud-only, agent-only, metrics-only, logs-only)
  - Return 404 only when ALL sources empty
  - Query by `(tenant_id, resource_id)` consistently
  - Extend logs service with resource-filtered helpers
  - Add comprehensive test coverage (service + route + log helpers)

---

## 2026-05-14

### AGENT-004 Reviewer Gate Approved

- **Ticket:** AGENT-004 - Log Pipeline Design Spec
- **Date:** 2026-05-14
- **Final status:** Done
- **Reviewer decision:** Approved after internal consistency review (3 correction rounds). Design contract is complete, implementation-ready, and architecturally sound.
- **Deliverable:** `docs/log_pipeline_contract.md` (876 physical lines, 633 non-empty lines, 16 sections)
- **Key architectural decisions:**
  1. Logs use disk spool (JSONL), metrics use binary WAL (independent buffers/retry/dead-letter)
  2. Wire format aligns with `execution_plan.md` Section 2.2 envelope
  3. Platform file identity (device+inode on Linux, file ID on Windows)
  4. Three rotation types: rename, copytruncate, missing file
  5. Parser modes: raw, JSON, regex (nginx/apache presets deferred to v2)
  6. Redaction: hardcoded safe defaults before spool write
  7. Backpressure: tailers slow at 80% spool, drop oldest at 95%; metrics always unaffected
  8. Correlation: same identity tags as metrics (`resource_id`, `agent_id`, `cloud_provider`)
- **Abort criteria:** 1000 lines/sec > 120MB memory, single-core < 30K lines/sec, log storm delays metrics >5%
- **Residual risks:** Spool disk usage, copytruncate race condition, parser performance unknowns until real workload
- **Finding status:** `EXP-014` design complete; implementation remains for Phases 3-4

---

### AGENT-003 Reviewer Gate Approved

- **Ticket:** AGENT-003 - Process Cardinality Controls
- **Date:** 2026-05-14
- **Final status:** Done
- **Reviewer decision:** Approved after two correction rounds addressing performance preservation and cmdline privacy.
- **Implementation summary:**
  - Added `ignore_patterns`, `aggregation.enabled`, `aggregation.rules[]` to process config
  - Config validation: regex compile errors fail startup, max 50 aggregation rules, aggregate_as validation (non-empty, max 64 chars, alphanumeric)
  - Two-stage collection: cheap `ListProcesses()` for all processes, selective `EnrichProcess()` only for filtered/aggregated/top-N
  - Filtering order: ignore → deny → allow → aggregate → top-N
  - First-match-wins aggregation (each process matches at most one rule)
  - Aggregated metrics: `process_group` tag only (no pid/name/user/cmdline)
  - Individual top-N metrics: all tags (pid/name/user/cmdline if enabled)
  - `system.processes.total` always reports OS total (not filtered count)
  - Cmdline privacy: `EnrichOptions{IncludeCmdline: bool}` controls fetch at call site; aggregated groups never request cmdline even when enabled
- **Files changed:** 8 files modified (config, collector, agent, tests, docs)
- **Verification evidence:**
  - All config validation tests pass (10 total)
  - All 7 new deterministic process collector tests pass
  - All agent tests pass (13 call sites updated for `buildCollectors()` error handling)
  - `go test ./internal/config ./internal/collector ./internal/agent` - PASS
  - Performance preserved: cheap scan → filter → selective enrichment (expensive fields only for selected processes)
- **Residual risks:** ProcessSource two-stage design adds interface calls but preserves original performance profile; Agent startup now fails early on invalid process config (intentional hardening)

---

### AGENT-002 Reviewer Gate Approved

- **Ticket:** AGENT-002 - Agent Lifecycle Client
- **Date:** 2026-05-14
- **Final status:** Done
- **Reviewer decision:** Approved after reviewer corrections addressing registration precedence, 409 handling, and FastAPI error envelope parsing.
- **Implementation summary:**
  - Created `internal/transport/lifecycle.go` with `LifecycleClient` (Register, Heartbeat, Stopping, RegisterWithRetry)
  - Request/response types match backend schema
  - 401/403 return `PermanentError` (no retry), 409 return `PermanentError` (no retry), 422 return `SchemaNegoError`, 429/5xx return `RetryableError`
  - `RegisterWithRetry` uses exponential backoff (2s, 4s, 8s, 16s, 30s) with server Retry-After override
  - Agent registers after identity resolution, before collectors/transmitter (blocks metric transmission on failure)
  - Heartbeat runs in separate goroutine using server-negotiated interval
  - Stopping sent on graceful shutdown with 5s timeout (best-effort, doesn't block buffer flush)
  - Config hash: SHA-256 of active config file bytes when `cfgPath` available
- **Files changed:** 5 files (new lifecycle.go + test, modified agent.go + 2 test files)
- **Verification evidence:**
  - All 12 lifecycle transport tests pass
  - Reviewer correction tests added: `TestRegister409Permanent`, `TestRegister409NoRetry`, `TestRegister422FastAPIDetailEnvelope`, `TestLifecycleRegisterPrecedesMetricIngest`, `TestLifecycleFailedRegistrationSendsNoMetrics`
  - All agent integration tests pass (TestIntegrationFullPipeline, TestIntegrationServerDown, TestIntegrationWALReplay, TestAgentRunShortLived)
  - Registration blocks metrics: verified by `TestLifecycleFailedRegistrationSendsNoMetrics`
  - 401/403/409 do not hot-loop: verified by no-retry tests
  - 422 schema negotiation returns actionable `SchemaNegoError` with server-supported versions
- **Residual risks:** `TestIntegrationServerDown` now succeeds registration then tests metric send failures; Heartbeat goroutine has no explicit "does not block collection" test (verified structurally); No full Agent.Run() integration test for schema negotiation failure

---

### AGENT-001 Reviewer Gate Approved

- **Ticket:** AGENT-001 - Correlation Contract
- **Date:** 2026-05-14
- **Final status:** Done
- **Reviewer decision:** Approved. Contract is complete, code citations are verified, and mismatches are documented for follow-up.
- **Deliverable:** `docs/correlation_contract.md` (8 sections, ~180 lines)
- **Key contract points:**
  - Defines `tenant_id`, `resource_id`, and `agent_id` as the three canonical join keys
  - Documents all four `resource_id` sources with exact code references (AWS IMDSv2, Azure IMDS, on-prem machine-id, hostname fallback)
  - Documents `agent_id` derivation (UUIDv5 for cloud, UUIDv4 for on-prem, persisted)
  - Lists 6 required tags, 5 optional cloud tags, and forbidden fields
  - States 7 correlation invariants for current and future telemetry
- **Code/contract mismatches identified:**
  1. `cloud_provider` omission for `ProviderUnknown` — fixed by AGENT-005
  2. `agent_version` present on runtime metrics but absent from `TestConnection` path
  3. `resource_id` nullable in backend registration model
  4. Agent lifecycle endpoint wiring — fixed by AGENT-002
- **Verification evidence:**
  - All five acceptance-criteria files read and verified against contract content
  - `DeterministicAgentID()` namespace UUID confirmed
  - `Identity.Tags()` emits required tags (with documented `cloud_provider` gap, fixed by AGENT-005)
  - Backend `get_tenant_id_required(request)` confirmed as sole tenant source
  - No code changes (docs-only ticket)

---

## 2026-05-13

### Phase 0 Initialization Complete

- **Date:** 2026-05-13
- **Reason:** Pre-work hygiene before Phase 0 execution
- **Deliverables created:**
  - `FINDINGS.md` from EXP-001 through EXP-021 (hostile review findings)
  - `PHASE_TRACKER.md` (phase status, active tickets, sub-tasks, blockers, risks, timeline)
  - `TICKETS.md` (executable work queue with scope, files, acceptance tests, non-goals)
  - `EXECUTION_CHANGELOG.md` (this file - chronological execution record)
  - `CLAUDE_EXECUTION_HOOKS.md` (mandatory operating protocol for Claude)
- **Coordination contract established:** 5-file system with clear owner model (ChatGPT writes specs, Claude executes, ChatGPT reviews)

---

### Hostile Review Completed

- **Date:** 2026-05-13
- **Deliverable:** `docs/neo-metrics-exporter-review.md`
- **Findings:** 21 findings across P0 (data integrity/security), P1 (reliability/correctness), P2 (maintainability/scale), P3 (polish), and Design categories
- **Severity distribution:** 3 P0, 8 P1, 7 P2, 3 P3/Design
- **Critical findings:**
  - EXP-001: WAL compaction writes empty file (data loss on crash)
  - EXP-002: transmitBatch drops data on send failure (silent metric loss)
  - EXP-003: No tenant_id in MetricBatch being sent (won't fix - backend uses API key's tenant)
  - EXP-006: Process collector cmdline in tags = cardinality bomb
  - EXP-019: Agent lifecycle endpoints exist but exporter does not call them
  - EXP-021: Correlation contract is implicit, not written
- **Non-goals:** Distributed tracing, agent auto-update, config push from server

---

## 2026-05-15 (Evening)

### AGENT-011: Clock Skew Detection and Strict Time Guard - COMPLETE

- **Date:** 2026-05-15 23:00 UTC
- **Status:** Done (Approved after 2 review rounds)
- **Phase:** 0 - Correctness Foundation (Production Hardening, P0-B, item 0.11)
- **Ticket source:** Execution plan Section 3.1 (clock skew detection)

**Implementation delivered:**
1. Date header capture in registration (lifecycle.go) → computes `clock_skew_seconds = local - server`
2. Warning logging when |skew| > 60s (clockguard.go SetClockSkew)
3. Strict validation mode (exit code 78 if |skew| > 300s and `strict_clock_check: true`)
4. Typed sentinel error `ErrStrictClockSkew` with `errors.Is()` check in main
5. Agent integration (captures skew after registration, enforces strict check before collectors start)

**Test coverage (15 acceptance tests, all passing):**
- Config: 3 tests (default, true, false)
- Lifecycle: 5 tests (Date header capture, missing, malformed, positive/negative skew)
- ClockGuard strict check: 4 tests (pass, fail positive/negative, disabled)
- ClockGuard logging: 2 tests (with real slog.Handler capture, verifies structured fields)
- Agent integration: 1 test (proves typed error after registration)

**Documentation delivered (192 lines):**
- `docs/configuration.md`: clock config table + 98-line Clock Skew Detection section (behavior, remediation, exit codes, impact)
- `docs/sop.md`: 90-line SOP-010 Troubleshooting section (warning/critical scenarios, NTP commands, virtualization tips)

**Review rounds:**
- Round 1 (5 issues): Docs missing, brittle string matching for exit code, fake logging tests, tracker status wrong, no agent-level test
- Round 2 (1 issue): Warning test coverage insufficient (fake tests removed but not replaced)
- Final: All issues resolved, slog capture handler added with proper assertions

**Files modified:**
1. `internal/transport/lifecycle.go` - RegisterResponse fields + Date capture
2. `internal/agent/clockguard.go` - SetClockSkew warning + CheckStrictSkew + ErrStrictClockSkew sentinel
3. `internal/agent/agent.go` - Clock skew capture + strict check enforcement + typed error
4. `cmd/neoguard-agent/main.go` - errors.Is() exit code 78 check
5. `internal/config/config_test.go` - 3 config tests
6. `internal/transport/lifecycle_test.go` - 5 lifecycle tests
7. `internal/agent/clockguard_test.go` - 6 clockguard tests + captureHandler
8. `internal/agent/agent_test.go` - 1 agent integration test
9. `docs/configuration.md` - 102 lines added
10. `docs/sop.md` - 90 lines added
11. `test-agent.yaml` - clock.strict_clock_check example

**Verification:**
- All 15 tests pass
- Zero regressions
- Binary builds successfully
- Exit code 78 behavior uses stable typed error contract
- Warning threshold (60s) properly tested with slog capture
- Strict threshold (300s) properly tested at agent level

**Tracker updates:**
- `PHASE_TRACKER.md`: 0.11 marked complete
- No TICKETS.md entry (tracked in execution plan only)

---

## 2026-05-16

### AGENT-015 Started - Internal Pressure Metrics

**Timestamp:** 2026-05-16 (start of implementation)
**Status:** In Progress
**Risk level:** Low

**Expected files to modify:**
- `internal/buffer/wal.go` - Add Metrics() method
- `internal/transport/deadletter.go` - Add Metrics() and Stats() methods
- `internal/collector/agentself.go` - Add deadLetter parameter, integrate component metrics
- `internal/agent/agent.go` - Pass deadLetter to AgentSelfCollector constructor
- `docs/metrics.md` - Document 17 metrics (7 new + 10 existing)

**Expected test files:**
- `internal/buffer/wal_test.go` - 5 WAL metric tests
- `internal/transport/deadletter_test.go` - 3 dead-letter metric tests
- `internal/agent/supervisor_test.go` - 5 supervisor validation tests
- `internal/agent/integration_test.go` - 1 integration test

**Scope:**
- 7 new metrics (5 WAL + 2 dead-letter)
- Documentation of 10 existing undocumented metrics (5 supervisor + 5 transmitter/backpressure)
- Component-owned metrics pattern with AgentSelfCollector as aggregator

**Hook 1 verification completed (corrected):**
- ✅ AGENT-015 formal ticket created in TICKETS.md (lines 872-958)
- ✅ AGENT-015 status: Ready → In Progress in TICKETS.md
- ✅ AGENT-015 status: In Progress in PHASE_TRACKER.md (item 0.15)
- ✅ AGENT-007 is the only other In Progress ticket, explicitly documented as parked exception awaiting bare-metal validation (implementation complete, 12/12 tests passing)
- ✅ All implementation files read before editing (wal.go, deadletter.go, agentself.go, agent.go)
- ✅ All symbols verified to exist (WALStats, Ring.Stats().Dropped, DeadLetterWriter atomics, AgentSelfCollector, model.NewGauge/NewCounter)
- ✅ Execution plan restated in 6 bullet points
- ✅ Non-goals explicitly listed (no duplicate replay/backpressure metrics)
- ✅ TICKETS.md formal entry added
- ✅ PHASE_TRACKER.md updated to In Progress
- ✅ EXECUTION_CHANGELOG.md entry added

**Workflow gap resolved:** AGENT-015 previously had no TICKETS.md entry (tracked only via PHASE_TRACKER.md + standalone spec). Formal ticket entry added to maintain consistent audit trail per CLAUDE_EXECUTION_HOOKS.md.
