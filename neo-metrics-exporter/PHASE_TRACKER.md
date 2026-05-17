# NeoGuard Agent - Phase Tracker

**Plan version:** 2.1
**Current phase:** Phase 6 - Distribution
**Started:** 2026-05-13
**Target completion:** 2026-09-15

---

## Coordination Contract

| File | Owner | Purpose |
|---|---|---|
| `TICKETS.md` | ChatGPT architect writes, Claude executes | Exact executable work queue with scope, files, acceptance tests, and non-goals |
| `FINDINGS.md` | ChatGPT and Claude both update | Defects, risks, evidence, impact, and required fixes |
| `PHASE_TRACKER.md` | Claude updates after work, ChatGPT audits | Phase-level progress, blockers, open questions, and risks |
| `EXECUTION_CHANGELOG.md` | Claude updates, ChatGPT audits | Chronological record of ticket starts, checkpoints, reviews, approvals, and coordination changes |
| `CLAUDE_EXECUTION_HOOKS.md` | ChatGPT owns, Claude follows | Mandatory before-start, mid-work, review, reviewer, feedback, and post-completion gates |

Execution rule: Claude may implement only `Ready` tickets from `TICKETS.md` unless the human explicitly overrides scope. Any discovered scope expansion must become a new ticket or blocker before code is written.
Hook rule: Claude must follow `CLAUDE_EXECUTION_HOOKS.md` for every ticket. Claude may not mark a ticket `Done`; only ChatGPT reviewer gate or human approval may do that.

---

## Phase Status

| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 0 - Correctness Foundation | Complete (1 parked) | 2026-05-13 | 2026-05-16 | P0-A: 9/9, P0-B: 4/5 (AGENT-007 parked), P1: 1/1 |
| 1 - Agent Registry | Complete | 2026-05-13 | 2026-05-16 | Agent lifecycle, correlation contract, backend/UI complete |
| 2 - Metrics Polish | Complete | 2026-05-15 | 2026-05-16 | Process cardinality controls complete |
| 3 - Logs Backend | Complete | - | 2026-05-16 | POST /api/v1/logs/ingest exists, ClickHouse table operational |
| 4 - Logs Agent | Complete | 2026-05-16 | 2026-05-16 | All 6 tickets done (LOGS-001 through LOGS-006) |
| 5 - Correlation UI | Complete | 2026-05-16 | 2026-05-16 | BACKEND-001 and UI-001 both done |
| 6 - Distribution | Complete | 2026-05-16 | 2026-05-17 | All 8 tickets Done (DIST-001 through DIST-008) |
| 6.5 - Soak Testing | Blocked | 2026-05-17 | - | Full-duration run active (all 8 scenarios scheduled). S7 will execute but cannot pass until release artifacts (.deb, .rpm, Docker image) are staged on instance. SOAK-001 cannot pass until all 8 scenarios produce valid evidence. |

---

## Active Tickets

| Ticket | Priority | Status | Phase | Summary |
|---|---|---|---|---|
| AGENT-001 | P0 | Done | 1 | Write correlation contract for `tenant_id`, `resource_id`, and `agent_id` |
| AGENT-005 | P0 | Done | 1 | Enforce correlation contract in Identity.Tags() (cloud_provider always present) |
| AGENT-002 | P0 | Done | 1 | Implement register, heartbeat, and stopping lifecycle calls |
| AGENT-003 | P1 | Done | 2 | Add process cardinality controls and aggregation |
| AGENT-004 | P0 | Done | 3/4 | Write log pipeline design before implementation |
| AGENT-006 | P1 | Done | 0 | Custom CA bundle support for enterprise PKI |
| AGENT-007 | P0 | Parked | 0 | Container-aware runtime limits (awaits bare-metal validation) |
| AGENT-012 | P1 | Done | 0 | Add serializer abstraction for future metrics-ingest codecs |
| AGENT-015 | P0 | Done | 0 | Internal pressure metrics (WAL, dead-letter, backpressure) |
| BACKEND-001 | P0 | Done | 5 | Build resource correlation backend read model |
| UI-001 | P1 | Done | 5 | Build single resource observability pane |
| LOGS-001 | P0 | Done | 4 | Log pipeline foundation (config, directories, isolation) |
| LOGS-002 | P0 | Done | 4 | File tailing with rotation handling (Linux/Windows) |
| LOGS-003 | P0 | Done | 4 | Parser modes (raw, JSON, regex) |
| LOGS-004 | P1 | Done | 4 | Multiline support (stack traces, wrapped messages) |
| LOGS-005 | P1 | Done | 4 | Credential redaction (bearer, AWS keys, API key fields, password fields) |
| LOGS-006 | P0 | Done | 4 | Log buffering and transmission (LogRing, LogSpool, LogDeadLetterWriter) |
| DIST-001 | P0 | Done | 6 | Fix systemd ReadWritePaths, nfpm log dirs, binary path alignment |
| DIST-002 | P0 | Done | 6 | Tag-triggered release workflow with checksums |
| DIST-003 | P1 | Done | 6 | Smart remote install script (detect, download, verify, start) |
| DIST-004 | P1 | Done | 6 | Production Docker image (multi-arch, scratch-based) |
| DIST-005 | P2 | Done | 6 | Cosign keyless artifact signing |
| DIST-006 | P1 | Done | 6 | Chaos tests (network, disk, OOM, crash, log burst) |
| DIST-007 | P1 | Done | 6 | Performance regression suite with baselines |
| DIST-008 | P1 | Done | 6 | Documentation completion (7 new + 3 updated) |

---

## Active Sub-Tasks - Phase 0

### P0-A ship blockers

- [x] 0.1 WAL fix with framing, CRC, size limits, and version header
- [x] 0.2 Retry exhaustion fix with re-enqueue and dead-letter after retry cycles
- [x] 0.3 `process_cmdline` opt-in, sanitization, truncation, and config wiring
- [x] 0.5 Pre-warm rate computers before first visible collection
- [x] 0.6 Identity fallback chain: AWS, Azure, machine-id, hostname; persistence; deterministic `agent_id`
- [x] 0.7 Clock skew handling with forward jump detection and backward timestamp flooring
- [x] 0.10 Collector supervision with panic recovery, timeout, and circuit breaker
- [x] 0.13 Memory self-protection states
- [x] 0.14 Replay throttling and adaptive backpressure

### P0-B production hardening

- [x] 0.4 Configurable health bind address
- [ ] 0.8 Container-aware GOMAXPROCS (AGENT-007 - In Progress, awaiting bare metal test)
- [x] 0.9 Custom CA bundle (AGENT-006 - Done)
- [x] 0.11 Clock skew detection and strict time guard (AGENT-011 - Done)
- [x] 0.15 Internal pressure metrics (AGENT-015 - Done)

### P1

- [x] 0.12 Serializer interface for future protocol formats (AGENT-012 - Done)

---

## Pre-Phase 0 Hygiene

- [x] Create `FINDINGS.md` from EXP-001 through EXP-018
- [x] Answer Section 10 questions in `docs/SECTION_10_ANSWERS.md`
- [x] Create `PHASE_TRACKER.md`
- [x] Create `TICKETS.md`
- [x] Create `EXECUTION_CHANGELOG.md`
- [x] Create `CLAUDE_EXECUTION_HOOKS.md`

---

## Scope Changes

| Date | Change | Impact |
|---|---|---|
| 2026-05-13 | Kubernetes orchestration awareness descoped from v1 | DaemonSet, pod metadata, Helm, and K8s-aware collectors out of v1. Container detection remains in scope. |
| 2026-05-13 | GCP descoped from v1 | No GCP identity resolution or GCE collectors in v1. Architecture may add provider later. |
| 2026-05-14 | Correlation contract elevated to P0 | All signals must join on `tenant_id`, `resource_id`, and `agent_id`; hostname is display-only. |

---

## Blockers

| Blocker | Affects | Status |
|---|---|---|
| No pilot customers identified | Phase 6 Definition of Done | Proposed substitute: Linux VM, Windows host, and container simulation |
| Human review cadence not finalized | Phase exits | Proposed: ChatGPT reviews ticket specs before Claude implementation, human reviews phase exits |
| S7 (install smoke) missing release packages | SOAK-001 completion | .deb and .rpm artifacts must be built via DIST-002 release workflow and placed on the EC2 instance before S7 can execute. Docker image also required. |

---

## Open Questions Awaiting Reviewer

1. Accept three simulated environments as pilot equivalent for v1.0.0 gate?
2. Should Claude execute tickets strictly in listed order, or may it pick any `Ready` ticket in the current phase?
3. Should `docs/specs/12-agent.md` be updated to reference `TICKETS.md` as execution source of truth?

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Lifecycle registration needs backend/UI consumption | Fleet dashboard and graceful shutdown state remain incomplete without read model and UI | Execute BACKEND-001 and UI-001 after agent registry foundation |
| Correlation remains implicit | UI/backend may drift into hostname-based joins | Execute AGENT-001 first |
| Process aggregation still needs real-host tuning | Bad default grouping can under-report or over-fragment process views | Validate AGENT-003 defaults during soak testing |
| Logs add volume and complexity | Metric delivery can be harmed by log storms | Execute AGENT-004 before any log code |
| Memory self-protection tuning too aggressive | Data loss under pressure | Soak testing and explicit drop counters |

---

## Timeline

| Phase | Estimated Duration | Target Start | Target End |
|---|---|---|---|
| 0 | 3 weeks | 2026-05-13 | 2026-06-03 |
| 1 | 2 weeks | 2026-06-03 | 2026-06-17 |
| 2 | 2 weeks | 2026-06-17 | 2026-07-01 |
| 3 | 3 weeks | 2026-07-01 | 2026-07-22 |
| 4 | 3 weeks | 2026-07-22 | 2026-08-12 |
| 5 | 2 weeks | 2026-08-12 | 2026-08-26 |
| 6 | 2 weeks | 2026-08-26 | 2026-09-09 |
| 6.5 | 1 week | 2026-09-09 | 2026-09-15 |
