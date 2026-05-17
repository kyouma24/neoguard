---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Compliance and Data Handling

How the NeoGuard agent handles data access, transmission, storage, and personally identifiable information (PII).

---

## 1. Data Access

The agent accesses the following system resources:

| Resource | Purpose | Scope |
|----------|---------|-------|
| `/proc` (Linux) | CPU, memory, process, network stats | Read-only, filtered by PID visibility |
| `/sys` (Linux) | Disk, sensor, cgroup information | Read-only |
| WMI/PDH (Windows) | Performance counters | Read-only |
| Log files | Tailing configured paths | Read-only, explicit opt-in via config |
| Network (outbound) | HTTPS to ingest endpoint | Single destination, TLS 1.2+ |

The agent does **not**:
- Read file contents (except configured log paths)
- Access databases or application memory
- Intercept network traffic
- Modify any system state
- Require inbound network access (except optional health endpoint on loopback)

---

## 2. Data in Transit

All data is transmitted over HTTPS (TLS 1.2 minimum) to the configured ingest endpoint.

| Property | Detail |
|----------|--------|
| Protocol | HTTPS with TLS 1.2+ |
| Authentication | API key in request header |
| Destination | Single endpoint (configured `endpoint` value) |
| Proxy support | `HTTPS_PROXY` / `HTTP_PROXY` environment variables |
| Custom CA | `ca_bundle_path` for internal PKI (additive trust) |
| Retry | Exponential backoff with jitter on transient failures |
| Timeout | Configurable (`transport.request_timeout_seconds`, default 30s) |

No data is sent to any destination other than the configured endpoint. The agent does not phone home, report telemetry to the vendor, or contact third-party services.

---

## 3. Data at Rest

Local data persistence is limited to operational state:

| Location | Content | Retention | Encryption |
|----------|---------|-----------|------------|
| `/var/lib/neoguard/wal/` | Undelivered metric batches | Until delivered (auto-compacted) | None (plaintext on local disk) |
| `/var/lib/neoguard/logs-spool/` | Undelivered log batches | Until delivered or evicted by watermark | None |
| `/var/lib/neoguard/logs-dead-letter/` | Failed log batches (retry exhausted) | Until manual deletion or file count limit | None |
| `/var/lib/neoguard/log_cursors/` | File read positions (byte offsets) | Overwritten each checkpoint | None |
| `/etc/neoguard/agent.yaml` | Config including API key | Persistent | File permissions (0640) |

**Important:** WAL and spool files may contain metric values and log lines. If log files contain sensitive data, enable redaction (`logs.redaction.enabled: true`) to scrub credentials before persistence.

State directories are owned by the `neoguard` system user (mode 0750). The systemd unit enforces `ProtectSystem=strict` with explicit `ReadWritePaths` limited to these directories.

---

## 4. PII Handling

### What the agent collects that may contain PII

| Data Type | PII Risk | Mitigation |
|-----------|----------|------------|
| Hostnames | Low — may encode owner names | Part of identity resolution; required for correlation |
| Process names | Low — typically binary names | Top-N only; kernel threads filtered by default |
| Process command lines | **Medium** — may contain usernames, paths, tokens | **Opt-in only** (`process.collect_cmdline: false` by default), sanitized and truncated |
| Log file content | **High** — application logs may contain anything | Credential redaction enabled by default; users control which files are tailed |
| Username (process owner) | Low — system-level username | Emitted as `process_user` tag |

### Built-in protections

1. **Command-line collection is off by default.** Must explicitly set `process.collect_cmdline: true`.
2. **Credential redaction** scrubs bearer tokens, AWS access keys, API key fields, and password fields from log lines before they leave the host.
3. **No file content scanning.** The agent only reads files explicitly configured in `logs.sources[]`.
4. **Process filtering** (`deny_regex`, `allow_regex`) lets operators exclude processes that might expose sensitive names.

---

## 5. Network Exposure

The agent has minimal network surface:

| Direction | Port | Purpose | Binding |
|-----------|------|---------|---------|
| Outbound | 443 (configurable) | HTTPS to ingest endpoint | N/A |
| Inbound (optional) | 8282 (configurable) | Health/status endpoint | `127.0.0.1` only (loopback) |

The health endpoint binds to loopback by default and is not accessible from other hosts. To expose it (e.g., for load balancer health checks), set `health.bind: "0.0.0.0:8282"` explicitly.

---

## 6. Privilege Model

| Platform | Runtime User | Capabilities |
|----------|--------------|--------------|
| Linux (systemd) | `neoguard` (non-root) | `CAP_DAC_READ_SEARCH` (read /proc), `CAP_NET_BIND_SERVICE` |
| Linux (manual) | Configurable | Recommend: dedicated non-root user |
| Windows | `LocalSystem` (service) | Standard performance counter access |

The agent does **not** require:
- Root access (runs as unprivileged user)
- Write access to system directories
- Network bind below port 1024 (except via capability)
- ptrace or debugging capabilities

---

## 7. Systemd Hardening

The systemd unit applies 17 security directives:

- `NoNewPrivileges=true`
- `ProtectSystem=strict` (filesystem read-only except explicit paths)
- `ProtectHome=true` (no access to /home, /root, /run/user)
- `PrivateTmp=true` (isolated /tmp)
- `PrivateDevices=true` (no device access)
- `ProtectKernelTunables=true`
- `ProtectKernelModules=true`
- `ProtectControlGroups=true`
- `RestrictNamespaces=true`
- `RestrictSUIDSGID=true`
- `RestrictRealtime=true`
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK`
- `SystemCallFilter=@system-service` (allowlist of safe syscalls)
- `SystemCallArchitectures=native`
- `MemoryMax=256M` (hard memory limit)
- `CPUQuota=25%` (CPU cap)
- `ReadWritePaths=/var/log/neoguard /var/lib/neoguard` (only writable paths)

---

## 8. Audit Trail

The agent produces structured JSON logs (to journald on Linux, Event Log on Windows) for all significant operations:

| Event | Log Level | Fields |
|-------|-----------|--------|
| Agent start/stop | INFO | version, platform, config_path |
| Registration | INFO | heartbeat_interval, schema_version, first_registration |
| Batch sent | DEBUG | points_count, duration_ms |
| Send failure | WARN | error, retry_count |
| Config reload | INFO | changed_keys |
| Clock skew detected | WARN | skew_seconds, threshold |
| Memory pressure | WARN | heap_bytes, state (normal/degraded/critical) |
| Dead-letter write | WARN | batch_size, reason |
| Credential redaction | DEBUG | pattern, source |

Logs are retained by the host's journal/syslog configuration. The agent does not manage its own log rotation.
