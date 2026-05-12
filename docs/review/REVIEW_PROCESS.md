# Code Review Process

> Proven through Phase A-D (96 findings fixed, 12 deferred, 21 open P3 polish).
> This process caught 3 bugs that would have shipped silently under a less rigorous approach.

---

## Sub-Phase Structure

Each sub-phase addresses **max 4 findings**. This keeps scope manageable and makes rollback clean.

### Naming Convention

```
Phase {letter}{number}{variant}: {Category}
Example: C4b: Collection orchestrator (re-implementation)
```

Variants (`a`, `b`) indicate a retry after a failed first attempt.

---

## 10-Point Hostile Audit (Before Implementation)

Run this checklist mentally before writing any code:

1. **Does the committed code already implement this?** (pre-check catches no-ops)
2. **Is the finding still valid?** (code may have changed since review)
3. **What breaks if I make this change?** (behavioral-change pre-check)
4. **Is this actually a bug, or a design choice?** (Won't Fix is valid)
5. **Can I prove it with a test?** (if not testable, reconsider)
6. **Does the fix introduce new failure modes?** (don't trade one bug for two)
7. **Does the fix touch shared code?** (ripple effects)
8. **Is the fix minimal?** (no scope creep, no cleanup, no refactoring)
9. **Can I red-then-green this?** (if not, the test isn't testing the fix)
10. **What's the rollback plan?** (git stash, revert, or feature flag)

---

## Behavioral-Change Pre-Check

Before touching production code, verify:

```bash
# 1. Run existing tests — they must PASS against committed code
pytest tests/unit/test_relevant_module.py -v

# 2. Read the production code you're about to change
# 3. Identify: what behavior changes? what stays the same?
# 4. Write the test FIRST (red) against current code if the fix is behavioral
```

This catches the case where committed code already matches the finding (no work needed).

---

## Red-Then-Green TDD (via git stash)

For every behavioral fix:

```bash
# 1. Write the test (it should PASS if fix is already in working copy)
pytest tests/unit/test_phase_XX.py -v  # confirm green

# 2. Stash production code changes
git stash push -m "verify red" -- src/path/to/changed_file.py

# 3. Run tests again — they MUST FAIL (red)
pytest tests/unit/test_phase_XX.py -v  # confirm red

# 4. Restore production code
git stash pop

# 5. Run tests again — they MUST PASS (green)
pytest tests/unit/test_phase_XX.py -v  # confirm green
```

If step 3 passes (tests don't fail without the fix), the test is **tautological** — it doesn't actually verify the fix. Rewrite the test.

### When Red-Then-Green Doesn't Apply

- **New functionality** (no prior behavior to regress against)
- **Won't Fix findings** (tests document current behavior, not a fix)
- **Configuration/documentation changes** (no behavioral delta)

---

## Completion Checklist

Every sub-phase must pass ALL of these before closing:

```
[ ] --collect-only count matches passed count (no silent skips)
[ ] All tests in the sub-phase file pass
[ ] No regressions in broader test suite (run full backend suite)
[ ] FINDINGS.md updated (status, evidence, date)
[ ] Bugs Hit table updated (if any bugs encountered)
[ ] No scope creep (only the stated findings were touched)
```

### Test Count Reconciliation

```bash
# Collect count
pytest tests/unit/test_phase_XX.py --collect-only -q 2>&1 | tail -1
# Expected: "N tests collected"

# Run count
pytest tests/unit/test_phase_XX.py -v 2>&1 | tail -1
# Expected: "N passed"

# These numbers MUST match exactly
```

If collected > passed, something is being silently skipped (xfail, skip marker, or import error hiding tests).

---

## Won't Fix Protocol

A finding can be closed as Won't Fix when:

1. **Investigation proves the current code is correct** (document why)
2. **The fix would break something else** (document what)
3. **The cost exceeds the benefit** (P3 polish only — never for P0/P1)

Requirements:
- Write tests that **document the current behavior** (not the proposed fix)
- Include investigation notes in the test file docstring
- Update FINDINGS.md with rationale

Example (FE2-010):
```
Status: Won't Fix (C6b) — subtree:true is load-bearing for grouped panel expansion.
Removing it breaks viewport optimization for nested dashboard groups.
```

---

## FINDINGS.md Format

```markdown
### {ID}: {Title}
- **Priority**: P0/P1/P2/P3
- **Status**: Open | Fixed ({phase}) | Won't Fix ({phase}) | Deferred
- **Evidence**: {what proves it's fixed — test name, line number, or commit}
- **Date**: {YYYY-MM-DD}
```

---

## Standing Rules

1. **No quick fixes.** Every fix gets a test. Every test gets red-then-green verification (where applicable).
2. **No scope creep.** If you discover a new issue during a sub-phase, log it as a new finding — don't fix it in the current sub-phase.
3. **No silent skips.** Collected count = passed count, always.
4. **No tautological tests.** If the test passes without the fix, it's not testing the fix.
5. **Commit nothing mid-phase.** All work stays in working copy until the full phase is approved.
6. **Update FINDINGS.md same sub-phase.** Don't batch updates.
7. **4 findings max per sub-phase.** Split if needed.
8. **Bugs Hit is mandatory.** Every sub-phase documents bugs encountered (even if zero).

---

## Bugs Hit Table

Each sub-phase maintains a bugs table in the completion report:

| # | Description | Root Cause | Resolution |
|---|-------------|-----------|------------|
| 1 | asyncpg pool mock TypeError | AsyncMock.acquire() returns coroutine, not async ctx mgr | Created _FakeAcquireCtx helper class |
| 2 | FINDINGS.md edit collision | Duplicate strings in file | Used replace_all or added context |

This table serves two purposes:
- Tracks implementation friction (process improvement signal)
- Documents patterns for future sub-phases (avoid repeating mistakes)

---

## Phase Progression

```
Phase A: P0 (security critical — fix immediately)
Phase B: P1 (reliability, correctness — fix before ship)
Phase C: P2 + P3 (quality, polish — fix if time allows)
Phase D: Only if Phase C leaves blocking items
```

Findings flow down, never up. A P0 discovered during Phase C gets a new Phase A sub-phase, not a C sub-phase.

---

## Metrics (Phase A-D Final)

| Metric | Value |
|--------|-------|
| Total findings | 129 |
| Fixed | 96 |
| Deferred/Closed | 12 |
| Open (P3 polish) | 21 |
| Sub-phases executed | ~15 |
| Bugs encountered | ~8 |
| Tests added | 172 |
| Tautological tests caught | 2 |
| Won't Fix (with evidence) | 3 |
