---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Upgrading

Procedures for upgrading the NeoGuard agent across all installation methods.

---

## General Notes

- The agent is a single static binary. Upgrades replace only the binary file.
- Config files are never overwritten during package upgrades (`noreplace` flag).
- WAL data from the previous version is automatically replayed on restart. No data loss during upgrade.
- The agent deregisters on graceful shutdown and re-registers on start. Brief gaps in metrics (seconds) are expected during the stop/start window.

---

## Debian/Ubuntu (deb)

```bash
# Download new package
curl -LO https://github.com/neoguard/neo-metrics-exporter/releases/download/v0.3.0/neoguard-agent_0.3.0_amd64.deb

# Verify checksum
sha256sum neoguard-agent_0.3.0_amd64.deb
# Compare with checksums.txt from the release

# Install (automatically restarts the service)
sudo dpkg -i neoguard-agent_0.3.0_amd64.deb

# Verify
neoguard-agent version
sudo systemctl status neoguard-agent
```

The deb package's postinstall script runs `systemctl restart neoguard-agent` if the service was previously running.

---

## RHEL/CentOS/Amazon Linux (rpm)

```bash
# Download new package
curl -LO https://github.com/neoguard/neo-metrics-exporter/releases/download/v0.3.0/neoguard-agent-0.3.0.x86_64.rpm

# Verify checksum
sha256sum neoguard-agent-0.3.0.x86_64.rpm

# Upgrade (preserves config)
sudo rpm -U neoguard-agent-0.3.0.x86_64.rpm

# Restart
sudo systemctl restart neoguard-agent

# Verify
neoguard-agent version
```

---

## Manual Binary Replacement

```bash
# Check current version
neoguard-agent version

# Download new binary
curl -LO https://github.com/neoguard/neo-metrics-exporter/releases/download/v0.3.0/neoguard-agent-linux-amd64

# Verify checksum
curl -LO https://github.com/neoguard/neo-metrics-exporter/releases/download/v0.3.0/checksums.txt
sha256sum -c checksums.txt --ignore-missing

# Backup current binary
sudo cp /usr/bin/neoguard-agent /usr/bin/neoguard-agent.bak

# Stop, replace, start
sudo systemctl stop neoguard-agent
sudo install -m 0755 neoguard-agent-linux-amd64 /usr/bin/neoguard-agent
sudo systemctl start neoguard-agent

# Verify
neoguard-agent version
journalctl -u neoguard-agent --since "1 minute ago" --no-pager
```

---

## Windows

```powershell
# Check current version
C:\neoguard\neoguard-agent.exe version

# Download new binary
Invoke-WebRequest -Uri "https://github.com/neoguard/neo-metrics-exporter/releases/download/v0.3.0/neoguard-agent-windows-amd64.exe" -OutFile "C:\neoguard\neoguard-agent-new.exe"

# Verify new version
C:\neoguard\neoguard-agent-new.exe version

# Stop service, replace, start
Stop-Service NeoGuardAgent
Rename-Item C:\neoguard\neoguard-agent.exe C:\neoguard\neoguard-agent.bak
Rename-Item C:\neoguard\neoguard-agent-new.exe C:\neoguard\neoguard-agent.exe
Start-Service NeoGuardAgent

# Verify
Get-Service NeoGuardAgent
C:\neoguard\neoguard-agent.exe version
```

---

## Docker

Update the image tag in your deployment:

```bash
docker pull ghcr.io/neoguard/neoguard-agent:0.3.0

# Or use docker-compose
# In docker-compose.yml, update: image: ghcr.io/neoguard/neoguard-agent:0.3.0
docker compose up -d
```

---

## Rollback

If an upgrade causes issues:

### Linux (manual)

```bash
sudo systemctl stop neoguard-agent
sudo cp /usr/bin/neoguard-agent.bak /usr/bin/neoguard-agent
sudo systemctl start neoguard-agent
```

### Linux (deb)

```bash
# Install previous version
sudo dpkg -i neoguard-agent_0.2.0_amd64.deb
```

### Windows

```powershell
Stop-Service NeoGuardAgent
Remove-Item C:\neoguard\neoguard-agent.exe
Rename-Item C:\neoguard\neoguard-agent.bak C:\neoguard\neoguard-agent.exe
Start-Service NeoGuardAgent
```

---

## Version Compatibility

| From | To | Notes |
|------|-----|-------|
| 0.1.x | 0.2.x | WAL format v2 introduced; old WAL is replayed then rewritten |
| 0.2.x | 0.3.x | Log pipeline added; no breaking config changes |

The agent is forward-compatible with older configs. New config sections are optional and use defaults when absent.

---

## Post-Upgrade Verification

After any upgrade:

```bash
# 1. Version confirms new binary
neoguard-agent version

# 2. Service is running
sudo systemctl status neoguard-agent

# 3. No errors in recent logs
journalctl -u neoguard-agent --since "2 minutes ago" | grep -i error

# 4. Metrics flowing (check health endpoint)
curl -s http://127.0.0.1:8282/status | python3 -m json.tool

# 5. Test connection (validates auth + TLS)
neoguard-agent test-connection --config /etc/neoguard/agent.yaml
```
