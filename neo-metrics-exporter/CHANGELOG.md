# Changelog

All notable changes to the NeoGuard Metrics Agent are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.2.0] - 2026-05-01

### Added

- **Disk-backed WAL buffer**: Crash-resilient metric buffering with write-ahead log. Metrics survive agent restarts. Auto-compaction when 50%+ entries drained. Memory-only fallback on disk errors.
- **HTTP health server**: `/health` (liveness), `/ready` (readiness), `/status` (JSON stats), `/metrics` (Prometheus exposition format). Binds to 127.0.0.1 only. Configurable via `health.enabled` and `health.port`.
- **Prometheus metrics endpoint**: Latest collected metrics exposed in Prometheus text format at `/metrics`.
- **Config hot-reload (Linux)**: Send SIGHUP to reload logging, extra_tags, file_watch, process config, and disabled collectors without restart.
- **Debug dump (Linux)**: Send SIGUSR1 to dump goroutine stacks to log.
- **Environment variable expansion**: Config YAML supports `${VAR}` and `${VAR:-default}` syntax.
- **Config file permission checks (Linux)**: Warns if config is world-readable, refuses to load if world-writable.
- **Metric sanitization**: NaN/Inf clamping, invalid character replacement, name/tag/value length truncation.
- **Collection jitter**: Random 0-25% delay before first collection cycle (thundering herd prevention).
- **Per-collector timeout**: 30-second context deadline per collector prevents a hung collector from blocking the entire cycle.
- **Bare-metal hostname fallback**: Cloud identity resolution gracefully falls back to OS hostname when no cloud provider detected (fixes crash on non-cloud hosts).
- **TLS 1.2 minimum**: HTTP client enforces TLS 1.2+ for all connections to ingest API.
- **Connection keep-alive tuning**: Custom HTTP transport with 30s keep-alive, 10s dial/TLS timeout, idle connection pooling.
- **systemd hardening**: 17 security directives including ProtectSystem=strict, NoNewPrivileges, MemoryMax=256M, CPUQuota=25%.
- **deb/rpm packaging**: nfpm-based packaging with preinstall/postinstall/preremove scripts.
- **GitHub Actions CI**: Lint (go vet), test with race detector, cross-compilation matrix (linux/amd64, linux/arm64, windows/amd64), package build on main.
- **Install script**: `deploy/install.sh` for automated Linux deployment.
- **Complete documentation suite**: README, architecture, deployment, configuration, SOPs, metrics catalog, security, changelog.

### Changed

- Buffer type changed from `Ring` (memory-only) to `DiskBuffer` (Ring + optional WAL).
- Agent constructor now accepts config file path for reload support.
- Identity resolver returns hostname fallback instead of erroring on bare metal.

---

## [0.1.0] - 2026-04-30

### Added

- **16 regular collectors**: cpu, memory, disk, diskio, network, system, netstat, process, portmap, filewatch, container, sensors, agentself, plus 7 Linux-only (vmstat, sockstat, filefd, cpustat, entropy, pressure, conntrack).
- **3 composite collectors**: healthscore (weighted 0-100), saturation (linear regression time-to-full), correlation (top process per resource).
- **~200 metrics** covering CPU, memory, disk, network, TCP/UDP, processes, ports, files, containers, sensors, and agent self-monitoring.
- **Cross-platform**: Linux (full) + Windows (core collectors + Windows-specific metrics like DPC%, interrupt%).
- **Two-pass process collection**: Cheap sort pass on all processes, expensive enrichment only on top-N. 13x faster than naive approach.
- **RateComputer**: Delta/second computation with 5-minute key eviction for transient interfaces/devices.
- **SlidingWindow + OLS regression**: Linear regression over configurable sample window for saturation projection.
- **In-memory ring buffer**: Drop-oldest overflow with configurable capacity.
- **Transport client**: JSON + gzip POST with Bearer auth, exponential backoff (1s-5min), permanent vs retryable error distinction, Retry-After header support.
- **Cloud identity resolution**: AWS IMDS v2 and Azure IMDS with RWMutex-protected cache (1-hour TTL).
- **Windows SCM service**: Install/uninstall as Windows service (`NeoGuardAgent`), handles Stop/Shutdown control signals.
- **YAML configuration**: Full config file with sensible defaults, validation, range enforcement.
- **CLI commands**: `run`, `version`, `test-connection`, `diagnose`, `service install/uninstall` (Windows).
- **186 unit tests** across all packages.
- **Static binary**: CGO_ENABLED=0, zero runtime dependencies, ~7.4MB.
