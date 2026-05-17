# Claude Execution Hooks

This is the mandatory operating protocol for Claude when working on `neo-metrics-exporter`.

Claude must follow these hooks for every ticket. Skipping a hook is a process failure and must be recorded in `EXECUTION_CHANGELOG.md`.

---

## Hook 0 - Session Start

Before selecting or touching any ticket, Claude must:

1. Read these files in full:
   - `TICKETS.md`
   - `FINDINGS.md`
   - `PHASE_TRACKER.md`
   - `EXECUTION_CHANGELOG.md`
   - `CLAUDE_EXECUTION_HOOKS.md`
2. State the active ticket ID it intends to work on.
3. Confirm the ticket status is `Ready`.
4. Confirm no other ticket is already `In Progress`.
5. State the exact files it expects to read before editing.
6. State the exact files it expects to modify.
7. State the non-goals from the ticket.

Claude must not edit code during Hook 0.

---

## Hook 1 - Before Implementation

Before writing code or docs, Claude must:

1. Change the selected ticket status from `Ready` to `In Progress` in `TICKETS.md`.
2. Add a short entry to `EXECUTION_CHANGELOG.md`:
   - ticket ID
   - start timestamp/date
   - expected files
   - risk level
3. Read every file listed under the ticket's `Files` section.
4. Read every existing test file relevant to the planned change.
5. Verify every referenced symbol, endpoint, config key, schema field, and file path exists.
6. If anything does not exist, stop and mark the ticket `Blocked`.
7. Restate the implementation plan in 5-10 bullets.

Claude must not invent missing APIs, endpoints, config fields, or database columns.

---

## Hook 2 - Mid-Work Checkpoint

Claude must checkpoint when any of these occur:

- More than 30 minutes of work has passed.
- More than 3 files have been modified.
- A new risk or mismatch is discovered.
- A test fails for a reason not already understood.
- The ticket scope appears insufficient.

At checkpoint, Claude must:

1. Update `EXECUTION_CHANGELOG.md` with:
   - current ticket ID
   - files changed so far
   - tests run so far
   - open risks or blockers
2. If scope changed, stop and mark the ticket `Blocked`.
3. If continuing, state the next concrete step.

Claude must not silently continue through scope drift.

---

## Hook 3 - Before Marking Review

Before changing a ticket to `Review`, Claude must:

1. Run the exact verification commands required by the ticket.
2. If a required verification cannot run, document why in `TICKETS.md` and `EXECUTION_CHANGELOG.md`.
3. Read its own diff line by line.
4. Confirm:
   - no unrelated files were changed
   - no secrets were logged or committed
   - tenant identity is not trusted from agent payloads
   - `resource_id` remains the primary resource join key
   - hostname is not used as a primary join key
   - metrics and logs are not mixed unless the ticket explicitly allows it
5. Update the ticket with:
   - status `Review`
   - summary of changes
   - verification evidence
   - known residual risks
6. Update `PHASE_TRACKER.md` if phase progress changed.
7. Update `FINDINGS.md` if a finding was fixed, deferred, or newly discovered.
8. Add an `EXECUTION_CHANGELOG.md` entry under the current date.

Claude must not mark `Done`. Only the reviewer or human may mark `Done`.

---

## Hook 4 - Reviewer Feedback

When ChatGPT or the human gives feedback, Claude must:

1. Update the ticket status:
   - `In Progress` if continuing changes.
   - `Blocked` if reviewer decision is required.
   - `Done` only if explicitly approved.
2. Address feedback strictly within the ticket scope.
3. If feedback requires new scope, create or request a new ticket.
4. Update `EXECUTION_CHANGELOG.md` with the feedback result.

---

## Hook 5 - Reviewer Gate

Claude cannot mark its own work `Done`.

When Claude believes a ticket is complete, it must mark the ticket `Review` and stop. ChatGPT or the human reviewer performs this gate.

### Plan Review Gate

Before implementation begins, the reviewer may reject Claude's plan unless it proves:

1. The exact ticket was read and understood.
2. All expected files to read and modify are listed.
3. All ticket non-goals are restated.
4. Referenced symbols, endpoints, config keys, schema fields, and file paths were verified in the codebase.
5. The planned tests or verification commands are listed.
6. Scope did not expand beyond the ticket.
7. The work assumes local execution unless the ticket explicitly requires cloud deployment.
8. `hostname` is not used as the primary correlation key.
9. `tenant_id` is not trusted from agent payloads.
10. Logs and metrics are not merged into one buffer, retry path, or transport unless a future approved ticket explicitly changes that architecture.

If the plan fails any item, Claude must update the plan or mark the ticket `Blocked`.

### Work Review Gate

Before approving `Done`, the reviewer checks:

1. Diff is limited to ticket-approved files, or every extra file is justified in the ticket.
2. Acceptance criteria are satisfied exactly.
3. No quick fixes were introduced:
   - no swallowed errors
   - no broad catch-and-continue behavior
   - no hardcoded temporary values
   - no unbounded retry loops
   - no TODO comments without a ticket reference
   - no duplicated logic where a local helper already exists
4. Security invariants hold:
   - API keys are never logged
   - tenant identity is derived by backend auth only
   - config and payload inputs are validated
   - errors do not leak secrets
5. Correlation invariants hold:
   - `resource_id` remains canonical
   - `agent_id` remains stable and included where required
   - hostname remains display metadata or last-resort fallback only
6. Reliability invariants hold:
   - outbound HTTP calls have timeouts
   - retry semantics are bounded
   - graceful shutdown behavior is deterministic
   - metrics and logs remain separate pipelines
7. Local deployment reality is respected:
   - tests use local mock servers or local backend
   - no dependency on public DNS, S3 buckets, production TLS, managed databases, or cloud-hosted infrastructure unless explicitly scoped
8. Required verification commands were run and results were recorded.
9. `TICKETS.md`, `FINDINGS.md`, `PHASE_TRACKER.md`, and `EXECUTION_CHANGELOG.md` were updated where applicable.
10. No new unresolved P0/P1 finding was introduced.

Review outcomes:

- `Done`: all gates pass.
- `In Progress`: implementation is close but needs corrections inside ticket scope.
- `Blocked`: ticket scope, spec, dependency, or architecture decision is insufficient.
- `Rejected`: implementation violates architecture or solves the wrong problem.

---

## Hook 6 - Post-Completion

After a ticket is approved as `Done`, Claude must:

1. Mark the ticket `Done` in `TICKETS.md`.
2. Add final verification evidence to the ticket.
3. Update linked finding statuses in `FINDINGS.md`.
4. Update `PHASE_TRACKER.md`.
5. Add a final entry to `EXECUTION_CHANGELOG.md`.
6. Identify the next eligible `Ready` ticket, but do not start it unless instructed.

---

## Hard Stops

Claude must stop and mark the ticket `Blocked` if:

- A required backend endpoint or schema field is missing.
- The implementation would require trusting `tenant_id` from the agent.
- The implementation would use hostname as the primary join key.
- Logs would share the metrics buffer or retry state.
- A new dependency is required but not approved in the ticket.
- Tests reveal an existing bug outside the ticket scope.
- The ticket acceptance criteria are impossible as written.
- More than one ticket needs to be modified to finish the work.

---

## Required Final Report Shape

Claude's final report for each ticket must include:

- Ticket ID and final status.
- Files changed.
- Behavior changed.
- Tests run and results.
- Findings updated.
- Tracker updated.
- Residual risks.
- Next recommended ticket.
