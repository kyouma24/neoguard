# Cardinality Control

## `process_cmdline` Tag (Phase 0.3)

### Default Behavior

`process.collect_cmdline` defaults to `false`. When disabled, the `process_cmdline` tag is **not emitted** on process metrics. This prevents unbounded cardinality from unique command-line arguments (UUIDs, timestamps, temp paths, PIDs).

### Enabling Collection

```yaml
process:
  collect_cmdline: true
```

When enabled, the agent applies sanitization before emitting the tag.

### What Sanitization Does

| Input | Output |
|---|---|
| `nginx -g daemon off` | `nginx -g daemon off` (unchanged) |
| `python worker.py --job=550e8400e29b41d4a716446655440000` | `python worker.py --job=H:140F39B05A2D9DE4` |
| `app --started=1715600000000` | `app --started=H:1CA0E5DD3A16DD29` |
| `<200-char-command>` | `<128 bytes max, sanitized, UTF-8 safe>` |

**Rules applied (in order):**

1. **Control character stripping**: Null bytes and all control characters (0x00–0x1F, 0x7F) are replaced with spaces. This handles `/proc/pid/cmdline` null separators and prevents backend tag validation rejection.
2. **Hex token hashing**: Sequences of 8+ lowercase hex characters (`[0-9a-f]{8,}`) are replaced with a deterministic 64-bit SHA-256 hash prefixed with `H:` (uppercase).
3. **Long digit hashing**: Sequences of 10+ digits (`\d{10,}`) are replaced with the same hash format.
4. **UTF-8-safe truncation**: Output is truncated to 128 bytes on a valid UTF-8 rune boundary. If the boundary region contains invalid UTF-8, falls back to byte truncation (preserves observability over silent empty-string return).

### Idempotency

`sanitize(sanitize(x)) == sanitize(x)` — the `H:` prefix uses uppercase hex (e.g., `H:140F39B05A2D9DE4`) which cannot re-match the lowercase-only regex pattern `[0-9a-f]{8,}`. Double-processing produces identical output.

### Hash Properties

- 64-bit hash (16 uppercase hex chars). Collisions are acceptable: they further reduce cardinality, which is the goal.
- Same input produces same output across agent restarts (deterministic SHA-256).
- Different inputs that hash to the same value simply collapse cardinality further.

### Observability

When `collect_cmdline: true`, the agent emits sanitization activity counters:

```
agent.process.cmdline_sanitized_total{reason="hex_token"}   — hex tokens replaced
agent.process.cmdline_sanitized_total{reason="long_digit"}  — digit sequences replaced
agent.process.cmdline_sanitized_total{reason="truncated"}   — output exceeded 128 bytes
```

High values on these counters indicate the environment has high-cardinality command lines. Consider disabling collection or tuning applications to emit shorter arguments.

### When to Enable

- **Enable**: Stable daemon processes (nginx, postgres, redis) where cmdline is predictable.
- **Leave disabled**: Ephemeral jobs, kube-jobs, CI runners, batch processors with unique args per invocation.

## Process Aggregation (AGENT-003)

### Overview

Process aggregation collapses multiple processes matching a pattern into a single metric series with a `process_group` tag. This prevents cardinality explosion from ephemeral processes (kube-jobs, CI runners, python workers with unique IDs).

### Configuration

```yaml
process:
  ignore_patterns:
    - "^kworker"
    - "^\\[.*\\]$"  # Kernel threads
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python-pool"
      - pattern: "^nginx: worker"
        aggregate_as: "nginx-workers"
```

### Filtering Order

Processes are filtered in this order:

1. **Ignore patterns** — matched processes are dropped before deny/allow rules
2. **Deny regex** — remaining processes matching deny patterns are dropped
3. **Allow regex** — if allow list exists, only matching processes are kept

### Aggregation Rules

- **First-match-wins**: A process matches at most one aggregation rule (the first one that matches its name)
- **Max 50 rules**: Config validation enforces this limit
- **Metrics summed**: CPU%, memory, threads, FDs, IO are summed across all processes in the group
- **Tag restrictions**: Aggregated metrics have `process_group` tag ONLY. They never emit `process_pid`, `process_name`, `process_user`, or `process_cmdline`
- **Top-N independent**: Aggregated groups always appear in output. The `top_n` limit applies only to non-aggregated individual processes

### Pattern Validation

All patterns (`ignore_patterns`, `allow_regex`, `deny_regex`, aggregation `pattern`) are validated at config load time:

- Invalid regex causes config load failure
- `aggregate_as` must be non-empty, max 64 chars, match `^[a-zA-Z0-9_.-]+$`

### Example Output

Given config:
```yaml
process:
  top_n: 2
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python-all"
```

If 5 `python3` processes and 10 `nginx` processes exist, output will be:
- 1 aggregated series: `process_group="python-all"` (sum of all 5 python processes)
- 2 individual series: top 2 nginx processes by CPU% (each with `process_pid`, `process_name`, etc.)

### system.processes.total

This metric always reports the total OS process count (from `gopsutil.Processes()`), **not** the filtered/aggregated count. It reflects raw kernel state.

### When to Use

- **Ignore patterns**: Filter kernel threads before any other rules (reduces processing load)
- **Aggregation**: Collapse ephemeral processes (kube-jobs, python workers, java applications) into stable groups
- **Deny/allow**: Fine-grained process selection after aggregation

### Migration from Phase 0.3

Phase 0.3 documented `process_name` cardinality as a future Phase 2.6 feature with mitigations using `top_n` and `deny_regex`. AGENT-003 delivers this capability. Existing `deny_regex` filters still work and are applied after `ignore_patterns` but before aggregation.
