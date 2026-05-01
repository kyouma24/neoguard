# Security

## Overview

The NeoGuard agent runs as a privileged daemon that reads host metrics and transmits them to a remote API. This document covers the threat model, data handling, hardening measures, and operational security guidance.

---

## Threat Model

### What the agent accesses

| Resource | Why | Permission needed |
|----------|-----|-------------------|
| `/proc/*` | CPU, memory, processes, network, vmstat, cgroups | Read (DAC_READ_SEARCH) |
| `/sys/fs/cgroup/*` | Container CPU/memory limits, throttling | Read |
| `/sys/class/thermal/*` | Temperature sensors | Read |
| Process table (all users) | Top-N process monitoring, port mapping | `CAP_SYS_PTRACE` or root |
| Network socket table | Listening port discovery | `CAP_NET_ADMIN` or root |
| Cloud IMDS (169.254.169.254) | Instance identity (AWS/Azure) | Outbound HTTP |
| NeoGuard ingest API | Metric delivery | Outbound HTTPS (port 443) |
| Config file | API key, endpoint, settings | Read (group neoguard) |
| WAL directory | Crash-resilient buffer | Read/write |

### What the agent does NOT access

- Filesystem contents (no file reads beyond `/proc`, `/sys`, and config)
- User data, databases, application logs
- Inbound network connections (health server binds to 127.0.0.1 only)
- Other processes' memory
- Kernel modules or tunables (ProtectKernelTunables=true, ProtectKernelModules=true)

### Trust boundaries

```
+------------------+     TLS 1.2+     +------------------+
|  NeoGuard Agent  | --------------> |  NeoGuard Ingest  |
|  (trusted host)  |   Bearer auth   |  (trusted server) |
+------------------+                  +------------------+
        |
        | reads /proc, /sys (local only)
        |
+------------------+
|   Host kernel    |
+------------------+
```

**Assumption**: The host OS is trusted. If an attacker has root on the host, the agent is already compromised — this is not a threat the agent can defend against.

---

## Data in Transit

| Property | Implementation |
|----------|---------------|
| **Encryption** | TLS 1.2 minimum enforced by the HTTP client (`tls.Config.MinVersion`) |
| **Authentication** | Bearer token (`Authorization: Bearer <api_key>`) on every request |
| **Compression** | gzip (`Content-Encoding: gzip`) — reduces payload ~10x |
| **Integrity** | TLS provides integrity; no additional HMAC layer |
| **Endpoint validation** | Standard Go TLS certificate verification (system CA store) |

The agent does not support self-signed certificates or TLS skip-verify. If you need a custom CA (e.g., corporate proxy), add it to the system CA store.

---

## Data at Rest

### Config file (`/etc/neoguard/agent.yaml`)

Contains the API key in plaintext (or env var reference).

| Control | Implementation |
|---------|---------------|
| Ownership | `root:neoguard` |
| Permissions | `0640` (owner read/write, group read, no world access) |
| World-readable warning | Agent logs a warning on startup if config is world-readable |
| World-writable refusal | Agent refuses to start if config is world-writable |
| Env var support | `${NEOGUARD_API_KEY}` — avoids plaintext key in file |

**Recommendation**: Use `${NEOGUARD_API_KEY}` in config and inject via systemd `EnvironmentFile` or secret manager.

### WAL file (`/var/lib/neoguard/wal/metrics.wal`)

Contains buffered metric points as JSON-per-line. No secrets, but contains hostnames, process names, and resource utilization data.

| Control | Implementation |
|---------|---------------|
| Ownership | `neoguard:neoguard` |
| Permissions | `0750` on directory |
| Content | Metric points only (names, values, tags, timestamps) |
| Lifecycle | Auto-compacted when 50%+ entries drained |
| Failure mode | Falls back to memory-only on disk error — never blocks |

### Log output

Logs go to systemd journal (stdout/stderr). Log entries include metric counts, error messages, and collection timing — never API keys or raw metric values at `info` level. At `debug` level, individual metric names may appear but not values.

---

## systemd Hardening

The systemd unit (`deploy/neoguard-agent.service`) applies 17 security directives:

| Directive | Effect |
|-----------|--------|
| `NoNewPrivileges=true` | Cannot gain privileges via setuid/setgid |
| `ProtectSystem=strict` | Entire filesystem is read-only except explicit ReadWritePaths |
| `ProtectHome=true` | /home, /root, /run/user are inaccessible |
| `ProtectKernelTunables=true` | /proc/sys, /sys are read-only |
| `ProtectKernelModules=true` | Cannot load kernel modules |
| `ProtectControlGroups=true` | /sys/fs/cgroup is read-only |
| `PrivateTmp=true` | Isolated /tmp namespace |
| `PrivateDevices=true` | No access to physical devices |
| `RestrictSUIDSGID=true` | Cannot create setuid/setgid files |
| `RestrictRealtime=true` | Cannot acquire realtime scheduling |
| `RestrictNamespaces=true` | Cannot create new namespaces |
| `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK` | Only IPv4, IPv6, Unix, and Netlink sockets |
| `SystemCallArchitectures=native` | Only native syscall ABI |
| `SystemCallFilter=@system-service` | Allowlist of syscalls for typical services |
| `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_DAC_READ_SEARCH` | Minimal capabilities |
| `MemoryMax=256M` | OOM-killed if exceeds 256MB |
| `CPUQuota=25%` | Cannot consume more than 25% of one CPU |

### Read/write paths

- **Read-only**: Entire filesystem (via ProtectSystem=strict)
- **Read-write**: `/var/log/neoguard` (logs), `/var/lib/neoguard` (WAL)
- **Proc access**: `ProtectProc=invisible`, `ProcSubset=all` — sees all processes but other users can't see the agent's /proc entries

---

## API Key Security

| Property | Detail |
|----------|--------|
| Format | `obl_live_v2_<random>` (identifiable prefix for scanning/rotation) |
| Storage | Server side: Argon2id hash. Agent side: plaintext in config or env var |
| Transmission | Bearer token over TLS. Never logged at info level |
| Scope | Write-only (ingest metrics). Cannot read data, manage config, or access other tenants |
| Rotation | Generate new key in NeoGuard dashboard, update config, reload/restart agent |
| Revocation | Delete key in dashboard — agent receives 401, stops retrying (permanent error) |

### Key leak response

1. Revoke the compromised key immediately in NeoGuard dashboard
2. Generate a new key
3. Update agent config across fleet (`systemctl reload` for key changes requires restart)
4. Audit ingest logs for unauthorized submissions during exposure window

---

## Network Security

### Outbound connections

| Destination | Port | Protocol | Purpose |
|-------------|------|----------|---------|
| NeoGuard ingest API | 443 | HTTPS | Metric delivery |
| 169.254.169.254 | 80 | HTTP | Cloud IMDS (AWS/Azure identity) |

No other outbound connections. Cloud IMDS can be skipped with `cloud_detection: skip`.

### Inbound connections

| Listener | Interface | Port | Purpose |
|----------|-----------|------|---------|
| Health server | 127.0.0.1 only | 8282 (configurable) | Health checks, Prometheus scraping |

The health server is **disabled by default**. When enabled, it binds to localhost only — not accessible from the network. If you need network access (e.g., K8s liveness probes with hostNetwork), use a sidecar proxy or modify the bind address.

### Firewall rules

Minimal required rules:

```
# Outbound
ALLOW TCP dst=<ingest-endpoint> dport=443    # Metric delivery
ALLOW TCP dst=169.254.169.254 dport=80       # Cloud IMDS (optional)

# Inbound
DENY ALL                                      # No inbound required
```

---

## Resource Limits

The agent is designed to be a good citizen on the host:

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Memory | 256 MB | systemd MemoryMax (OOM-killed if exceeded) |
| CPU | 25% of one core | systemd CPUQuota |
| Open files | 65,536 | systemd LimitNOFILE |
| Processes/threads | 4,096 | systemd LimitNPROC |
| Disk (WAL) | Self-limiting | Ring buffer caps in-memory items; WAL auto-compacts |
| Network | Minimal | One HTTPS connection, batched every 10s |

### Collector safeguards

- **Process collector**: Two-pass design — only enriches top-N processes (default 20), not all 1000+
- **Per-core metrics**: Disabled by default (`cpu.per_core: false`). On 64-core hosts, enabling adds ~576 series
- **File watch**: Capped at `max_files: 50` after glob expansion
- **Rate computation**: Keys evicted after 5 minutes of inactivity (prevents memory leaks from transient interfaces)

---

## Container Security

When running inside a container:

- The agent auto-detects cgroup v1/v2 and reports resource limits relative to the container (not the host)
- Runtime detection: Docker (`.dockerenv`), Kubernetes (`KUBERNETES_SERVICE_HOST`), containerd, LXC
- For K8s DaemonSet: requires `hostPID: true` and `hostNetwork: true` for full host visibility
- Mount `/proc` and `/sys` from the host as read-only volumes

---

## Vulnerability Reporting

If you discover a security vulnerability in the NeoGuard agent, report it to the security team. Do not open a public issue.

---

## Audit Checklist

Periodic security review:

- [ ] Config file permissions are `0640` (not world-readable)
- [ ] API key uses env var injection (not plaintext in config)
- [ ] Agent runs as `neoguard` user (not root)
- [ ] systemd unit has all hardening directives
- [ ] Outbound firewall allows only port 443 to ingest endpoint
- [ ] Health server is disabled or bound to localhost only
- [ ] Agent version is current (check `neoguard-agent version`)
- [ ] WAL directory permissions are `0750`
- [ ] No world-writable files in `/etc/neoguard/`
- [ ] Cloud IMDS access is `skip` if not on cloud (reduces attack surface)
