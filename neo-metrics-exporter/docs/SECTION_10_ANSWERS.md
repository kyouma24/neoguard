# Section 10 Answers — Open Questions for the Executor

**Plan version:** 2.1
**Answered by:** Executor (Claude)
**Date:** 2026-05-13
**Status:** COMPLETE — all 13 questions answered. Phase 0 unblocked.

---

## 1. Where is the v0.2 codebase?

**Path on disk:** `C:\Users\user\Desktop\POC\NewClaudeNeoGuard\neo-metrics-exporter\`

**Repository:** Same repo as the NeoGuard backend — monorepo at `NewClaudeNeoGuard/`. The exporter lives at `neo-metrics-exporter/` root directory.

**Key directories:**
- `cmd/neoguard-agent/main.go` — CLI entry point
- `internal/agent/` — core agent loop
- `internal/buffer/` — ring buffer + WAL
- `internal/collector/` — 23 collectors
- `internal/config/` — YAML config + validation
- `internal/transport/` — HTTP client + retry
- `internal/identity/` — AWS/Azure IMDS resolution
- `internal/svchost/` — Windows SCM integration
- `internal/healthz/` — health server + Prometheus exposition
- `deploy/` — installer + systemd unit

---

## 2. What is the current state of `<state_dir>`?

**Default paths:**
- Linux: `/var/lib/neoguard/wal` (configured via `buffer.wal_dir` in agent.yaml)
- Windows: No default — must be explicitly configured (e.g., `C:\ProgramData\NeoGuard\wal`)

**Permissions:** Directory is created with `0750` by the agent at runtime via `os.MkdirAll`. WAL file opened with `0640`. The installer (`deploy/install.sh`) does NOT create the WAL directory — only `/etc/neoguard` (config) and `/var/log/neoguard` (logs) are created at install time.

**Created by:** Agent on first run (not installer). If `wal_dir` is empty string (default), WAL is disabled entirely (memory-only mode).

**Gap identified:** Installer should create `/var/lib/neoguard` with correct ownership (`neoguard:neoguard`). Currently the agent process needs write access to create it. This is a Phase 0 fix candidate.

---

## 3. Where does the backend currently run in dev?

**Both.** The backend runs as:
- `localhost:8000` via uvicorn (`python -m uvicorn neoguard.main:app --host 0.0.0.0 --port 8000 --reload`)
- OR inside Docker Compose (container `neoguard-api` on port 8000, connected to TimescaleDB, ClickHouse, Redis)

**For agent development:** Use `localhost:8000` with uvicorn directly. Docker Compose is for integration/full-stack testing.

**Required env:**
```bash
NEOGUARD_DB_PORT=5433
NEOGUARD_DEBUG=true
```

---

## 4. Are there existing FINDINGS.md entries for the agent specifically?

**Yes.** EXP-001 through EXP-018 are documented in `docs/neo-metrics-exporter-review.md` (the hostile review document).

**However:** They are NOT in the main backend `FINDINGS.md`. They exist only in the review document specific to the exporter. No separate `neo-metrics-exporter/FINDINGS.md` exists.

**Action for Phase 0:** Create `neo-metrics-exporter/FINDINGS.md` from EXP-001 through EXP-018 with proper status tracking format (per REVIEW_PROCESS.md). This is a pre-Phase 0 hygiene task.

---

## 5. What is the current `/api/v1/metrics/ingest` schema on the backend?

**Route:** `POST /api/v1/metrics/ingest` (status 202, requires `write` scope)

**Request body (Pydantic v2 model):**
```python
class MetricPoint(BaseModel):
    name: str  # regex: ^[a-zA-Z_][a-zA-Z0-9_.]*$, max 512 chars
    value: float
    timestamp: datetime | None = None  # server fills if absent
    tags: dict[str, str] = {}
    metric_type: MetricType = MetricType.GAUGE  # enum: gauge, counter, histogram

class MetricBatch(BaseModel):
    metrics: list[MetricPoint]  # min=1, max=10000
    tenant_id: str | None = None  # IGNORED — overridden by auth
```

**Response:** `{"accepted": <count>}`

**Auth:** Bearer token (API key). `tenant_id` is extracted from the authenticated key, NOT from the request body (NG-004 security fix). The `tenant_id` field in MetricBatch is ignored.

**Alignment with execution plan Section 2.1:**
- Plan expects `agent_id` in tags — ✅ tags are `dict[str, str]`, agent can put anything
- Plan expects metric names like `system.cpu.*` — ✅ regex allows dots
- Plan expects gzip encoding — ✅ FastAPI handles Content-Encoding transparently
- Plan expects `metric_type` — ✅ exists in schema
- Plan expects batch size 5000 — ✅ backend accepts up to 10000 (well within limit)

**No schema alignment work needed for Phase 0 metrics ingest.**

---

## 6. Does the backend currently accept `agent_id` in metric tags?

**Yes, implicitly.** The `tags` field is `dict[str, str]` with no schema validation on key names. The agent can include `agent_id` as a tag and it will be stored and queryable.

**However:** There is no backend concept of "agent registry" — no `agents` table, no heartbeat tracking, no "agent online/offline" UI. Tags containing `agent_id` are just another tag key.

**For Phase 1 (Agent Registry):** Backend will need:
- New `agents` table (agent_id, resource_id, tenant_id, last_heartbeat, capabilities, version, status)
- New routes: `POST /api/v1/agents/register`, `POST /api/v1/agents/heartbeat`, `POST /api/v1/agents/stopping`
- Frontend: agent status in resource detail view

**No Phase 0 backend migration needed.** Agent can start including `agent_id` in metric tags immediately.

---

## 7. What ClickHouse instance is available?

**Available in docker-compose:** ClickHouse 24.8 on ports 8123 (HTTP) and 9000 (native).

```yaml
clickhouse:
  image: clickhouse/clickhouse-server:24.8
  ports:
    - "8123:8123"
    - "9000:9000"
  environment:
    CLICKHOUSE_DB: neoguard
    CLICKHOUSE_USER: default
    CLICKHOUSE_PASSWORD: ""
```

**Current usage:** Log storage (the backend's ClickHouse log store already exists).

**For Phase 3 (Logs Backend):** The same ClickHouse instance is the target. The agent will ship logs to a new endpoint (e.g., `/api/v1/logs/ingest`) which writes to ClickHouse. The log table schema may need extension for agent-sourced logs vs application logs, but the infrastructure is ready.

**Phase 3 is NOT blocked by ClickHouse availability.**

---

## 8. What is the existing resource detail page route?

**Frontend route:** `/infrastructure` — single page with drill-down views.

**Component:** `frontend/src/pages/InfrastructurePage.tsx`

**Drill-down pattern:** The page has 3 views:
1. Account list (cards per cloud account)
2. Account resources (service tabs + resource table)
3. `ResourceDrillDown` component (line 2113) — shows resource details, metrics, info fields

**For Phase 5 (Correlation UI):** Modify `ResourceDrillDown` to show:
- Agent status (online/offline/degraded)
- Combined metrics view (CloudWatch/Azure Monitor + agent OS metrics)
- Toggle between cloud metrics and agent metrics
- Health score from agent's composite collector

**The route stays the same (`/infrastructure`). The modification target is the `ResourceDrillDown` function component within InfrastructurePage.tsx (starts at line 2113).**

---

## 9. Are there pilot customers identified for the v1 release gate?

**No.** This is a solo-dev project currently in laptop demo phase. No external customers are using NeoGuard yet.

**Definition of Done item 7 ("3 pilots running 7+ days") cannot be satisfied in the current phase.** This gate applies post-cloud-deployment when actual users exist.

**Recommendation:** Replace "3 pilot customers" with "3 simulated environments" for the v1.0.0 gate:
1. Linux VM (EC2) — full agent with all collectors
2. Windows Server — agent as Windows service
3. Container (Docker/ECS) — container-aware collectors

These can be set up on the single EC2 instance (Linux host + Windows Docker container + ECS task) after cloud deployment. The soak test in Phase 6.5 serves the reliability validation purpose.

**Decision needed from reviewer:** Accept simulated environments as pilot equivalent for v1.0.0?

---

## 10. Who reviews phase exits?

**Reviewer:** The user (project owner / senior architect).

**Review cadence:**
- Sub-task PRs: self-review allowed (executor verifies via tests + completion checklist)
- Phase exits: require human review (user confirms before next phase begins)
- Escalations (Section 9): immediate user notification

**Proposed flow:**
1. Executor completes all sub-tasks in a phase
2. Executor reports: summary of changes, test results, acceptance criteria status, PHASE_TRACKER.md update
3. User reviews and confirms "Phase N complete, proceed to Phase N+1"

---

## 11. Is there an existing health score implementation?

**Yes.** `neo-metrics-exporter/internal/collector/healthscore.go`

**Current implementation:**
```go
type HealthScoreCollector struct{}

func (c *HealthScoreCollector) CollectComposite(ctx, baseTags, currentPoints) ([]MetricPoint, error)
```

**Weighting (current):**
- CPU: 30% — score = 100 - cpu_usage_pct
- Memory: 30% — score = 100 - memory_used_pct
- Disk: 25% — worst partition's (100 - used_pct)
- Network: 15% — based on error rate

**Outputs:** `system.health.score` (0-100 float)

**Phase 0.11 modification:** Add hard ceilings — if any single subsystem exceeds a critical threshold (e.g., disk >95%, memory >95%), cap the overall score regardless of weighted calculation. This prevents "score 72" when disk is 99% full.

---

## 12. What's the current WAL implementation?

**Location:** `neo-metrics-exporter/internal/buffer/wal.go`

**Struct:** `DiskBuffer` — wraps `Ring` (in-memory) with disk persistence.

**Current format:** Line-delimited JSON. Each `MetricPoint` marshaled to JSON via `encoding/json` and written as one line. No framing. No CRC. No version header.

```go
type DiskBuffer struct {
    ring        *Ring
    walPath     string          // e.g., /var/lib/neoguard/wal/metrics.wal
    walFile     *os.File
    walWriter   *bufio.Writer   // 64KB buffered writer
    walEntries  int64
    drained     int64
    diskEnabled bool
}
```

**Current consumers:**
- `NewDiskBuffer()` calls `replayWAL()` on startup — reads line-by-line, JSON-unmarshals, adds to ring
- `agent.go` line 43: `buffer.NewDiskBuffer(cfg.Buffer.MemoryMaxItems, cfg.Buffer.WALDir)` — sole consumer

**Critical bug (EXP-001):** `compactWAL()` opens a temp file, gets ring stats, then closes without writing remaining ring data. After compaction, WAL is empty. Crash after compact = data loss.

**Phase 0.1 rewrite scope:**
- Add binary framing: `[4-byte length][4-byte CRC32][payload]`
- Add WAL version header (first 8 bytes of file)
- Add size limit + drop-oldest policy
- Fix compaction (write remaining ring data before swap)
- Add CRC validation on replay (skip corrupt frames)

---

## 13. What's the existing alert engine pattern for background tasks?

**Location:** `src/neoguard/services/alerts/engine.py`

**Pattern:** `asyncio.create_task` with graceful shutdown.

```python
class AlertEngine:
    async def start(self) -> None:
        if settings.alert_state_persistence:
            await self._restore_states()
        self._running = True
        self._task = asyncio.create_task(self._eval_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _eval_loop(self) -> None:
        while self._running:
            start = _time.monotonic()
            try:
                await self._evaluate_all()
                self._eval_success_count += 1
                self._eval_consecutive_errors = 0
            except Exception as e:
                self._eval_failure_count += 1
                ...
            # sleep until next interval
```

**Key characteristics:**
- Single `asyncio.Task` running a while-loop
- `_running` flag for graceful stop
- `task.cancel()` + suppress `CancelledError` for cleanup
- Counter-based success/failure tracking
- Interval sleep at end of loop (respects elapsed time)
- State restoration on start (persistence across restarts)

**For Phase 1.3 (Agent Reaper):** Follow this exact pattern:
```python
class AgentReaper:
    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._reap_loop())

    async def _reap_loop(self) -> None:
        while self._running:
            # Mark agents as offline if last_heartbeat > threshold
            # Clean up stale agent registrations
            await asyncio.sleep(interval)
```

---

## Summary

| # | Question | Blocking Phase | Status |
|---|----------|---------------|--------|
| 1 | Codebase location | 0 | ✅ Answered |
| 2 | state_dir | 0 | ✅ Answered (gap: installer should create it) |
| 3 | Backend dev location | 0 | ✅ Answered |
| 4 | FINDINGS.md | 0 | ✅ Answered (action: create agent-specific FINDINGS.md) |
| 5 | Ingest schema | 0 | ✅ Answered (no alignment needed) |
| 6 | agent_id in tags | 0 | ✅ Answered (works today, registry in Phase 1) |
| 7 | ClickHouse | 3 | ✅ Answered (available, not blocked) |
| 8 | Resource detail page | 5 | ✅ Answered (ResourceDrillDown @ line 2113) |
| 9 | Pilot customers | 6 | ⚠️ None exist — propose simulated environments |
| 10 | Reviewer | All | ✅ User is reviewer |
| 11 | Health score | 0 | ✅ Located + documented |
| 12 | WAL implementation | 0 | ✅ Located + format + bug documented |
| 13 | Alert engine pattern | 1 | ✅ Pattern documented |

**All questions answered. Phase 0 is unblocked pending reviewer acknowledgment (Question 9 decision + plan scope confirmation).**
