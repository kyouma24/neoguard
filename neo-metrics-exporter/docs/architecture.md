# Architecture

## Overview

The NeoGuard agent is a single Go binary that collects host metrics at configurable intervals, buffers them in memory (with optional disk WAL), and ships compressed JSON batches to the NeoGuard ingest API.

```
                    +------------------+
                    |   NeoGuard API   |
                    |  /metrics/ingest |
                    +--------^---------+
                             |
                        gzip JSON POST
                     (Bearer auth, TLS 1.2+)
                             |
+----------------------------+----------------------------+
|                     NeoGuard Agent                       |
|                                                          |
|  +-----------+    +------------+    +-----------------+  |
|  | Collectors |--->| Ring Buffer|--->| Transport Client|  |
|  | (23 total) |   | + Disk WAL |   | (retry, backoff)|  |
|  +-----------+    +------------+    +-----------------+  |
|        |                                                 |
|  +-----v--------+    +-----------+    +---------------+  |
|  | Composite     |   | Health    |    | Identity      |  |
|  | Collectors (3)|   | Server    |    | Resolver      |  |
|  +---------------+   | /health   |    | (AWS/Azure)   |  |
|                      | /ready    |    +---------------+  |
|                      | /metrics  |                       |
|                      | /status   |                       |
|                      +-----------+                       |
+----------------------------------------------------------+
```

## Package Structure

```
cmd/neoguard-agent/     Entry point, CLI commands, Windows service detection
internal/
  agent/                Agent lifecycle: Run, collect, transmit, shutdown
    agent.go            Main agent orchestrator
    debug_linux.go      SIGUSR1 goroutine dump
    reload_linux.go     SIGHUP config hot-reload
  buffer/
    ring.go             In-memory ring buffer (drop-oldest overflow)
    wal.go              Disk-backed WAL (crash resilience)
  collector/
    collector.go        Collector + CompositeCollector interfaces
    cpu.go              CPU usage, frequency, load averages
    memory.go           RAM, swap, hugepages
    disk.go             Filesystem usage, inodes
    diskio.go           Disk I/O throughput (rate-based)
    network.go          Network interface throughput (rate-based)
    system.go           Uptime, OS info, users
    netstat.go          TCP/UDP connection states, SNMP counters
    process.go          Top-N processes (2-pass: sort then enrich)
    portmap.go          Listening port -> process mapping
    filewatch.go        File existence, size, growth rate
    container_linux.go  Cgroup v1/v2 CPU/memory limits + throttling
    healthscore.go      Composite: weighted health score (0-100)
    saturation.go       Composite: linear regression time-to-full
    correlation.go      Composite: top CPU/memory/IO process correlation
    agentself.go        Agent self-monitoring (goroutines, heap, GC)
    sensors.go          Hardware temperature sensors
    rate.go             RateComputer utility (delta/sec with eviction)
    platform_linux.go   Linux-specific collectors: vmstat, sockstat, etc.
    platform_other.go   Empty stubs for non-Linux
    [7 Linux-only collectors: vmstat, sockstat, filefd, cpustat,
     entropy, pressure, conntrack]
  config/
    config.go           YAML config loading, env var expansion, validation
    perms_linux.go      File permission checks (world-readable warning)
  healthz/
    server.go           HTTP health/ready/status server
    prometheus.go       Prometheus exposition format /metrics endpoint
  identity/
    resolver.go         Cloud identity detection (AWS IMDS, Azure IMDS)
    aws.go              AWS EC2 instance metadata
    azure.go            Azure VM instance metadata
  model/
    metric.go           MetricPoint, MetricBatch, sanitization
  procfs/
    cgroup.go           Cgroup v1/v2 parser for container metrics
    [meminfo, netsnmp, pressure, reader, sockstat, stat, vmstat parsers]
  svchost/
    service_windows.go  Windows SCM service wrapper
  transport/
    client.go           HTTP client: gzip, retry, backoff, permanent errors
```

## Data Flow

### Collection Cycle

1. **Jitter**: First cycle delayed by random 0-25% of interval (thundering herd prevention)
2. **Regular collectors** run with 30s per-collector timeout
3. **Composite collectors** receive the regular collectors' output and derive additional metrics
4. **All points** pushed to the buffer (memory ring + optional disk WAL)
5. **Metric store** updated for Prometheus `/metrics` endpoint (if health server enabled)

### Transmission Cycle

1. Runs on a separate goroutine at `batch_max_interval_seconds`
2. Drains up to `batch_max_size` points from buffer (capped at 10,000)
3. Marshals to JSON, gzip-compresses, POSTs with Bearer auth
4. On failure: exponential backoff (1s, 2s, 4s, 8s...) up to `max_retries`
5. 401/403/422 → permanent error, no retry
6. 429 → respects `Retry-After` header
7. 5xx/network errors → retryable

### Shutdown Sequence

1. SIGINT/SIGTERM received
2. Health server marks not-ready (K8s stops sending traffic)
3. Health server shuts down (5s grace)
4. Collection goroutines finish current cycle
5. Transmitter goroutine finishes current batch
6. **Flush remaining**: drain buffer in batches, retry each up to 3x with backoff
7. WAL file flushed and closed
8. Exit

## Key Design Decisions

### Two-Pass Process Collection

Problem: Enriching all processes (1000+) with expensive syscalls (IO counters, FDs, username) takes 13+ seconds.

Solution: Pass 1 collects only name + CPU% + RSS (cheap), sorts, truncates to top-N. Pass 2 enriches only those N processes. Result: 13x performance improvement.

### RateComputer with Key Eviction

All rate-based metrics (network, disk I/O, TCP counters) use `RateComputer` — stores previous value + timestamp per key, computes delta/elapsed. Keys are evicted after 5 minutes of inactivity (60-call sweep interval) to prevent memory leaks from transient interfaces/devices.

### SlidingWindow with OLS Regression

Saturation projection uses a sliding window of N samples per metric key. Linear regression (ordinary least squares) computes the slope. `remaining_capacity / slope / 3600 = hours_until_full`. Stable/improving trends emit -1. Capped at 720 hours (30 days).

### Composite Collector Pattern

Health score, saturation, and correlation need output from regular collectors. Rather than re-collecting data, `CompositeCollector.CollectComposite()` receives the current cycle's points as input. Zero coupling, zero duplicate syscalls.

### Disk WAL

Write-ahead log: each `Push()` appends a JSON-per-line entry to `metrics.wal`. On startup, unconsumed entries are replayed into the memory ring. Compaction triggers when 50%+ of entries have been drained. Falls back to memory-only on any disk error — never blocks collection.

## Thread Safety

- `buffer.Ring` and `buffer.DiskBuffer`: mutex-protected
- `RateComputer` and `SlidingWindow`: mutex-protected, with periodic eviction
- `AgentStats`: lock-free atomic counters
- `Identity.Resolver`: RWMutex-protected cache with 1-hour TTL
- `MetricStore` (Prometheus): RWMutex-protected snapshot

## Platform Abstraction

Build tags separate platform-specific code:
- `//go:build linux`: container_linux, conntrack, cpustat, entropy, filefd, pressure, sockstat, vmstat, debug_linux, reload_linux, perms_linux
- `//go:build !linux`: stubs that return empty results or no-ops
- `//go:build windows`: service_windows (SCM integration)

The agent compiles and runs on both platforms — Linux collectors simply return no data on Windows, and vice versa.
