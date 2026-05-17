---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Getting Started

Install the NeoGuard agent and see metrics in 5 minutes.

---

## Prerequisites

- Linux (amd64 or arm64) or Windows (amd64)
- Outbound HTTPS (port 443) to your NeoGuard ingest endpoint
- A NeoGuard API key (format: `obl_live_v2_*`)
- Root/Administrator access (for full process and network visibility)

---

## Quick Install (Linux)

The remote installer handles everything: download, checksum verification, user creation, systemd setup, and health check.

```bash
curl -fsSL https://raw.githubusercontent.com/neoguard/neo-metrics-exporter/master/deploy/install-remote.sh | sudo bash -s -- \
  --api-key=obl_live_v2_your_key \
  --endpoint=https://ingest.yourdomain.com
```

After ~30 seconds you should see:

```
=== SUCCESS ===
NeoGuard agent is running and healthy.
```

---

## Verify Metrics Are Flowing

```bash
# Check agent status
sudo systemctl status neoguard-agent

# View recent logs (look for "batch sent" messages)
journalctl -u neoguard-agent --since "2 minutes ago" --no-pager

# Test backend connectivity
neoguard-agent test-connection --config /etc/neoguard/agent.yaml

# Check health endpoint
curl -s http://127.0.0.1:8282/status | python3 -m json.tool
```

Within 60 seconds of starting, the agent collects and transmits its first batch. Your host should appear in the NeoGuard dashboard.

---

## Package Install (Alternative)

For environments that prefer system packages:

```bash
# Debian/Ubuntu
sudo dpkg -i neoguard-agent_0.3.0_amd64.deb

# RHEL/CentOS/Amazon Linux
sudo rpm -i neoguard-agent-0.3.0.x86_64.rpm

# Edit config (set api_key and endpoint)
sudo vim /etc/neoguard/agent.yaml

# Start
sudo systemctl start neoguard-agent
```

---

## Windows

```powershell
# Create directory and copy files
New-Item -ItemType Directory -Force C:\neoguard
Copy-Item neoguard-agent.exe C:\neoguard\
Copy-Item agent.yaml C:\neoguard\agent.yaml

# Edit config (set api_key and endpoint)
notepad C:\neoguard\agent.yaml

# Install as Windows service
C:\neoguard\neoguard-agent.exe service install --config C:\neoguard\agent.yaml

# Start
Start-Service NeoGuardAgent
```

---

## Minimal Config

```yaml
api_key: obl_live_v2_your_key_here
endpoint: https://ingest.yourdomain.com
```

Everything else uses sensible defaults. See `docs/configuration.md` for the full reference.

---

## What Gets Collected

Out of the box (no config changes needed):

| Category | Examples |
|----------|----------|
| CPU | Total %, per-mode breakdown, load averages |
| Memory | Used/available/swap, page cache, hugepages |
| Disk | Space, inodes, I/O throughput and IOPS |
| Network | Bytes/packets per interface, errors, drops |
| System | Uptime, OS info, logged-in users |
| TCP/UDP | Connection states, retransmits, socket stats |
| Processes | Top 20 by CPU, with memory/threads/FDs |
| Health | Composite score (0-100), saturation projections |

---

## Next Steps

- [Configuration Reference](configuration.md) — tune intervals, filters, and features
- [Log Collection](log-collection.md) — collect application logs alongside metrics
- [CLI Reference](cli.md) — all subcommands and flags
- [Troubleshooting](troubleshooting.md) — common issues and fixes
- [Deployment Guide](deployment.md) — production deployment patterns
