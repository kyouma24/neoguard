# NeoGuard v1 Soak Test Report

**Date:** YYYY-MM-DD
**Host:** [instance type, OS, kernel, CPUs, RAM]
**Agent version:** [output of `neoguard-agent version`]
**Binary SHA256:** [sha256sum of binary]

## Ship Decision

**[ ] SHIP** / **[ ] NO-SHIP**

Reason: [one sentence]

---

## Scenario Results

| # | Scenario | Duration | Result | Notes |
|---|----------|----------|--------|-------|
| S1 | Idle stability | 24h | PASS/FAIL/WARNING | |
| S2 | Metrics steady state | 24h | PASS/FAIL/WARNING | |
| S3 | Logs steady state | 24h | PASS/FAIL/WARNING | |
| S4 | Sustained log load | 1h | PASS/FAIL/WARNING | |
| S5 | Outage and recovery | ~2h | PASS/FAIL/WARNING | |
| S6 | Restart durability | ~30min | PASS/FAIL/WARNING | |
| S7 | Install smoke | ~30min | PASS/FAIL/WARNING | |
| S8 | Container detection | ~5min | PASS/FAIL/WARNING | |

---

## S1: 24h Idle Host Stability

- Initial RSS: _____ KB
- Final RSS: _____ KB
- RSS growth: _____ KB (threshold: <8 MB release-blocking, <3 MB expected)
- Goroutines (initial → final): _____ → _____
- Panics: 0
- Agent alive at end: yes/no

Evidence: `evidence/scenario_idle/rss_samples.csv` (1440 samples)

---

## S2: 24h Metrics-Only Steady State

- RSS growth: _____ KB (threshold: <15 MB)
- Send errors: _____ (threshold: <5)
- WAL size (final): _____ bytes (threshold: <50 MB)
- Collection gaps >60s: _____
- Points collected: _____

Evidence: `evidence/scenario_metrics/`

---

## S3: 24h Logs-Enabled Steady State

- RSS growth: _____ KB (threshold: <20 MB)
- Total drops: _____ (threshold: <100)
- Spool size (final): _____ bytes (threshold: <100 MB)
- Pipeline errors: _____

Evidence: `evidence/scenario_logs/`

---

## S4: Sustained Log Load

- Peak RSS: _____ KB (_____ MB) (threshold: <250 MB)
- Lines written: _____
- Backpressure events: _____
- Drops: _____
- Agent alive at end: yes/no

Evidence: `evidence/scenario_log_load/`

---

## S5: Outage and Recovery

- Cycles completed: _____ / 6
- All cycles delivered within 120s: yes/no
- Total batches received: _____
- Max restore latency: _____ s

| Cycle | WAL size during | Batches after | Latency |
|-------|----------------|---------------|---------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |

Evidence: `evidence/scenario_outage/cycles.csv`

---

## S6: Restart/Crash-Cycle Durability

- Cycles completed: _____ / 50
- WAL corruptions: _____
- Start failures: _____
- Replay errors: _____

Evidence: `evidence/scenario_restart/cycles.csv`, `wal_checksums.txt`

---

## S7: Package/Image/Install Smoke

| Method | Result | Health 200 within 30s |
|--------|--------|----------------------|
| .deb | PASS/FAIL/SKIP | yes/no |
| .rpm | PASS/FAIL/SKIP | yes/no |
| Docker | PASS/FAIL/SKIP | yes/no |
| install-remote.sh | PASS/FAIL/SKIP | N/A (syntax only) |

Evidence: `evidence/scenario_install/`

---

## S8: Non-Container Host Validation (AGENT-007)

- Host CPUs (nproc): _____
- GOMAXPROCS detected: _____
- container_runtime tag: _____
- system.container.detected: _____
- Agent started normally: yes/no

Evidence: `evidence/scenario_container/`

---

## Defects Found

| ID | Scenario | Description | Ticket | Status |
|----|----------|-------------|--------|--------|
| (none) | | | | |

---

## Reviewer Sign-off

- [ ] All release-blocking thresholds pass
- [ ] Evidence bundle attached
- [ ] No open defect tickets blocking ship
- [ ] AGENT-007 validated and closed

Reviewer: _____________________
Date: _____________________
