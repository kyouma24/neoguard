---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Scaling

Documented limits and capacity planning for the NeoGuard agent.

---

## Architecture: Direct Push

The agent uses a direct-push model: each agent independently pushes metrics and logs to the ingest endpoint over HTTPS. There is no local aggregator, relay, or proxy layer.

```
[Agent 1] ──┐
[Agent 2] ──┼──→ [Ingest API] ──→ [TimescaleDB / ClickHouse]
[Agent N] ──┘
```

This architecture is designed for 1 to 1000 agents per tenant. Beyond 1000 agents, consider a relay/aggregation tier (not included in v1).

---

## Per-Agent Limits

| Resource | Default | Maximum | Notes |
|----------|---------|---------|-------|
| Memory | 256 MB (soft) | 384 MB (hard) | Systemd `MemoryMax=256M` enforces OS-level cap |
| CPU | 25% | 25% | Systemd `CPUQuota=25%` |
| Metric points per batch | 5,000 | 10,000 | `transport.batch_max_size` |
| Memory buffer | 100,000 points | 1,000,000 | `buffer.memory_max_items` |
| WAL disk | Unbounded | — | Auto-compacts at 50% delivered |
| Log sources | 0 (disabled) | ~20 recommended | Each source adds ~1-5 MB memory |
| Log spool disk | 2,048 MB | 10,000 MB | `logs.spool.max_size_mb` |
| File watches | 50 | 50 | `file_watch.max_files` |
| Process tracking | Top 20 | Unlimited | `process.top_n` |
| Aggregation rules | 0 | 50 | `process.aggregation.rules` |
| Collection interval | 60s | 10s minimum | Lower = more CPU + network |

---

## Series Cardinality

Default configuration emits approximately 150-200 metric series per host. Cardinality increases with:

| Feature | Impact |
|---------|--------|
| `cpu.per_core: true` | +9 series per core (e.g., +576 on 64-core) |
| `process.top_n: 50` | +350 series (7 metrics × 50 processes) |
| `file_watch.paths` | +4 series per watched file |
| Log sources | +9 agent.logs.* series per source |
| Process aggregation | Each rule adds 1 series group instead of N individual processes |

---

## Network Bandwidth

At default settings (60s interval, 5000 batch size):

| Scenario | Approx. Bandwidth |
|----------|-------------------|
| Metrics only (200 series) | ~5-10 KB/min |
| Metrics + 5 log sources (moderate volume) | ~50-200 KB/min |
| Metrics + high-volume logs (1000 lines/sec) | ~1-5 MB/min |

The agent compresses payloads and batches efficiently. Network is rarely the bottleneck.

---

## Fleet Sizing Guidelines

| Fleet Size | Ingest Endpoint | Notes |
|------------|-----------------|-------|
| 1-50 agents | Single API instance | Default deployment |
| 50-200 agents | 2-3 API instances behind LB | Monitor ingest latency |
| 200-1000 agents | Horizontally scaled API + dedicated TimescaleDB | Partition by tenant |
| 1000+ agents | Relay tier recommended | Not supported in v1 agent architecture |

---

## Backpressure Behavior

When the ingest endpoint is slow or unavailable:

1. **Memory buffer fills** — agent continues collecting, oldest points are buffered
2. **WAL persists** — if `wal_dir` is configured, data survives restarts
3. **Replay on recovery** — agent replays buffered data at `transport.replay_rate_bps` (default: 1000 bytes/sec) with adaptive backpressure
4. **Dead-letter** — after retry exhaustion, batches are written to dead-letter files for manual recovery
5. **Memory protection** — at `memory.soft_limit_mb`, collection degrades; at `hard_limit_mb`, data is dropped

This means a 10-minute network outage with default settings (100K buffer) results in zero data loss. Longer outages are bounded by WAL disk space.

---

## Tuning for High-Cardinality Hosts

For hosts with many processes (e.g., container orchestrators):

```yaml
process:
  top_n: 10
  deny_regex:
    - "^kworker/"
    - "^migration/"
    - "^ksoftirqd/"
    - "^rcu_"
  aggregation:
    enabled: true
    rules:
      - pattern: "^python"
        aggregate_as: "python-pool"
      - pattern: "^java"
        aggregate_as: "java-pool"
```

This reduces process cardinality from potentially thousands to a controlled set.

---

## Tuning for Minimal Footprint

For resource-constrained hosts (IoT, small VMs, edge):

```yaml
collection:
  interval_seconds: 120
  process_interval_seconds: 60
  slow_interval_seconds: 300

buffer:
  memory_max_items: 10000

transport:
  batch_max_size: 1000

process:
  top_n: 5

collectors:
  disabled: [saturation, correlation, sensors, entropy, pressure, conntrack]

memory:
  soft_limit_mb: 64
  hard_limit_mb: 96
```

Expected footprint: ~30-50 MB memory, <5% CPU.
