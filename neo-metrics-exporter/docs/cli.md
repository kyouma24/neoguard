---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# CLI Reference

All subcommands and flags for the `neoguard-agent` binary.

---

## Usage

```
neoguard-agent <command> [options]
```

---

## Commands

### run

Start the agent and begin collecting/shipping metrics and logs.

```bash
neoguard-agent run --config /etc/neoguard/agent.yaml
```

| Flag | Required | Description |
|------|----------|-------------|
| `--config <path>` | Yes | Path to YAML config file |

The agent runs in the foreground until interrupted (SIGINT/SIGTERM). On Linux with systemd, the service unit invokes this command.

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Clean shutdown (SIGINT/SIGTERM received) |
| 1 | General error (config load failure, fatal runtime error) |
| 78 | EX_CONFIG — clock skew too large with `strict_clock_check: true` |

---

### version

Print version, build time, git commit, Go version, and platform.

```bash
neoguard-agent version
```

**Example output:**
```
neoguard-agent 0.3.0
  build:    2026-05-17T10:00:00Z
  commit:   abc1234def5678
  go:       go1.24.0
  platform: linux/amd64
```

No flags required.

---

### diagnose

Print diagnostic information about the agent's configuration, identity, and collector state.

```bash
neoguard-agent diagnose --config /etc/neoguard/agent.yaml
```

| Flag | Required | Description |
|------|----------|-------------|
| `--config <path>` | Yes | Path to YAML config file |

**Example output:**
```
=== NeoGuard Agent Diagnostics ===
Version:    0.3.0
Platform:   linux/amd64
Endpoint:   https://ingest.yourdomain.com
API Key:    obl_live_v2_***
Cloud:      auto
Interval:   60s
Slow Int:   120s
Provider:   aws
Instance:   i-0abc123def456
Region:     us-east-1
Hostname:   ip-10-0-1-42
Buffer:     0 items, 0 batches, 0 dropped
Collectors: 18 normal, 3 composite, 3 slow
  [normal]    cpu
  [normal]    memory
  ...
```

This command loads the config, resolves cloud identity (contacts IMDS if `cloud_detection: auto`), and prints the result. It does **not** start collection or transmit data.

---

### test-connection

Test connectivity to the ingest endpoint without starting the agent.

```bash
neoguard-agent test-connection --config /etc/neoguard/agent.yaml
```

| Flag | Required | Description |
|------|----------|-------------|
| `--config <path>` | Yes | Path to YAML config file |

**Success:**
```
Connection test passed.
```

**Failure:**
```
connection test failed: <error details>
```
Exit code 1 on failure.

This performs a real HTTPS request to the configured endpoint, validating DNS, TLS, and authentication (API key). Use this to verify firewall rules, proxy configuration, and custom CA bundles before starting the agent.

---

### service install

Register the agent as a Windows service (Windows only).

```powershell
neoguard-agent.exe service install --config C:\neoguard\agent.yaml
```

| Flag | Required | Description |
|------|----------|-------------|
| `--config <path>` | Yes | Path to YAML config file |

Registers as `NeoGuardAgent` in the Windows Service Control Manager with:
- Start type: Automatic
- Recovery: Restart on failure
- Log name: Application

After installation, start with:
```powershell
Start-Service NeoGuardAgent
```

---

### service uninstall

Remove the agent Windows service registration.

```powershell
neoguard-agent.exe service uninstall
```

No flags required. The service must be stopped before uninstalling:
```powershell
Stop-Service NeoGuardAgent
neoguard-agent.exe service uninstall
```

---

## Signals (Linux)

| Signal | Behavior |
|--------|----------|
| `SIGINT` / `SIGTERM` | Graceful shutdown (flush buffers, deregister) |
| `SIGHUP` | Reload config (hot-reloadable settings only) |

```bash
# Reload config
sudo systemctl reload neoguard-agent

# Graceful stop
sudo systemctl stop neoguard-agent
```

---

## Environment Variables

The config file supports `${VAR}` and `${VAR:-default}` expansion. Common variables:

| Variable | Usage |
|----------|-------|
| `NEOGUARD_API_KEY` | API key (avoid hardcoding in config) |
| `NEOGUARD_ENDPOINT` | Ingest endpoint URL |
| `HTTPS_PROXY` | HTTP proxy for outbound connections |
| `HTTP_PROXY` | HTTP proxy fallback |
| `NO_PROXY` | Hosts to bypass proxy |
