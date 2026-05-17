---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Deployment Guide

## Prerequisites

| Requirement | Details |
|---|---|
| **Binary** | `neoguard-agent-linux-amd64`, `neoguard-agent-linux-arm64`, or `neoguard-agent-windows-amd64.exe` |
| **Config file** | `agent.yaml` with `api_key` and `endpoint` set |
| **Network** | Outbound HTTPS (port 443) to NeoGuard ingest endpoint |
| **Permissions** | Root/Administrator for full process + network socket visibility |
| **Disk** (optional) | 10-50 MB for WAL directory if disk buffering enabled |

No runtime dependencies. No interpreters. No shared libraries. The binary is fully static (CGO_ENABLED=0).

---

## Linux

### Option 1: Install Script (Recommended)

```bash
# Download binary
curl -Lo /tmp/neoguard-agent https://your-s3-bucket.s3.amazonaws.com/neoguard-agent-linux-amd64
chmod +x /tmp/neoguard-agent

# Run the install script
sudo bash deploy/install.sh
```

The install script:
1. Creates `neoguard` system user and group
2. Copies binary to `/usr/bin/neoguard-agent`
3. Copies config to `/etc/neoguard/agent.yaml` (mode 0640)
4. Creates WAL directory at `/var/lib/neoguard/wal`
5. Installs systemd unit to `/lib/systemd/system/neoguard-agent.service`
6. Enables the service (does not start — you need to edit config first)

After install:
```bash
# Edit config
sudo vim /etc/neoguard/agent.yaml

# Start
sudo systemctl start neoguard-agent

# Verify
sudo systemctl status neoguard-agent
journalctl -u neoguard-agent -f
```

### Option 2: deb/rpm Package

```bash
# Build packages (requires nfpm: go install github.com/goreleaser/nfpm/v2/cmd/nfpm@latest)
make package-deb    # creates bin/neoguard-agent_0.2.0_amd64.deb
make package-rpm    # creates bin/neoguard-agent-0.2.0.x86_64.rpm

# Install
sudo dpkg -i bin/neoguard-agent_*.deb     # Debian/Ubuntu
sudo rpm -i bin/neoguard-agent-*.rpm       # RHEL/CentOS/Amazon Linux

# Configure and start
sudo vim /etc/neoguard/agent.yaml
sudo systemctl start neoguard-agent
```

Package includes:
- Binary at `/usr/bin/neoguard-agent`
- Default config at `/etc/neoguard/agent.yaml` (marked noreplace — won't overwrite on upgrade)
- Systemd unit at `/lib/systemd/system/neoguard-agent.service`
- Creates `neoguard` user/group via preinstall script
- Creates state directories: `/var/lib/neoguard/{wal,logs-spool,logs-dead-letter,log_cursors}` and `/var/log/neoguard`

### Option 3: Manual

```bash
# Copy binary
sudo cp neoguard-agent-linux-amd64 /usr/bin/neoguard-agent
sudo chmod 755 /usr/bin/neoguard-agent

# Create user
sudo useradd --system --no-create-home --shell /usr/sbin/nologin neoguard

# Create config
sudo mkdir -p /etc/neoguard
sudo cp agent.yaml /etc/neoguard/agent.yaml
sudo chown root:neoguard /etc/neoguard/agent.yaml
sudo chmod 640 /etc/neoguard/agent.yaml

# Create state directories (WAL + log pipeline)
sudo mkdir -p /var/lib/neoguard/wal /var/lib/neoguard/logs-spool /var/lib/neoguard/logs-dead-letter /var/lib/neoguard/log_cursors /var/log/neoguard
sudo chown -R neoguard:neoguard /var/lib/neoguard /var/log/neoguard

# Copy systemd unit
sudo cp deploy/neoguard-agent.service /lib/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable neoguard-agent
sudo systemctl start neoguard-agent
```

### Option 4: S3 + Script (Cloud Deployments)

For AWS EC2, Azure VM, or any cloud instance:

```bash
#!/bin/bash
# deploy-agent.sh — run via user-data or SSM Run Command
set -euo pipefail

BUCKET="your-neoguard-artifacts"
VERSION="0.2.0"
API_KEY="obl_live_v2_your_key_here"
ENDPOINT="https://ingest.yourdomain.com"

# Download
aws s3 cp s3://${BUCKET}/neoguard-agent-linux-amd64-${VERSION} /usr/bin/neoguard-agent
chmod +x /usr/bin/neoguard-agent

# Create user
useradd --system --no-create-home --shell /usr/sbin/nologin neoguard 2>/dev/null || true

# Config
mkdir -p /etc/neoguard /var/lib/neoguard/wal
cat > /etc/neoguard/agent.yaml << EOF
api_key: ${API_KEY}
endpoint: ${ENDPOINT}
buffer:
  wal_dir: /var/lib/neoguard/wal
health:
  enabled: true
  port: 8282
extra_tags:
  environment: production
  instance_id: $(curl -s http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || hostname)
EOF

chown root:neoguard /etc/neoguard/agent.yaml
chmod 640 /etc/neoguard/agent.yaml
chown neoguard:neoguard /var/lib/neoguard/wal

# Systemd unit (inline)
cat > /lib/systemd/system/neoguard-agent.service << 'EOF'
[Unit]
Description=NeoGuard Metrics Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neoguard
Group=neoguard
ExecStart=/usr/bin/neoguard-agent run --config /etc/neoguard/agent.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now neoguard-agent
```

---

## Windows

### Interactive Mode

```powershell
# Copy files
New-Item -ItemType Directory -Force C:\neoguard
Copy-Item neoguard-agent.exe C:\neoguard\
Copy-Item agent.yaml C:\neoguard\agent.yaml

# Edit config
notepad C:\neoguard\agent.yaml

# Run
C:\neoguard\neoguard-agent.exe run --config C:\neoguard\agent.yaml
```

### Windows Service (SCM)

```powershell
# Install service (runs as LocalSystem)
C:\neoguard\neoguard-agent.exe service install --config C:\neoguard\agent.yaml

# Start
Start-Service NeoGuardAgent

# Verify
Get-Service NeoGuardAgent
Get-EventLog -LogName Application -Source NeoGuardAgent -Newest 10

# Uninstall
Stop-Service NeoGuardAgent
C:\neoguard\neoguard-agent.exe service uninstall
```

The service:
- Registers as `NeoGuardAgent` in the Windows Service Control Manager
- Starts automatically on boot (`StartAutomatic`)
- Handles Stop and Shutdown control signals gracefully
- Logs to Windows Event Log

---

## Docker

### Testing Container

```bash
# Build Linux binary
make build-linux

# Build test image
docker build -f Dockerfile.test -t neoguard-test .

# Run (includes mock ingest server)
docker run --rm -it neoguard-test
```

### Production Container

```dockerfile
FROM scratch
COPY neoguard-agent-linux-amd64 /neoguard-agent
COPY agent.yaml /etc/neoguard/agent.yaml
ENTRYPOINT ["/neoguard-agent", "run", "--config", "/etc/neoguard/agent.yaml"]
```

Best practice: mount config as a volume or use env var expansion:

```yaml
api_key: ${NEOGUARD_API_KEY}
endpoint: ${NEOGUARD_ENDPOINT}
cloud_detection: skip
health:
  enabled: true
  port: 8282
```

```bash
docker run -d \
  -e NEOGUARD_API_KEY=obl_live_v2_your_key \
  -e NEOGUARD_ENDPOINT=https://ingest.yourdomain.com \
  -p 8282:8282 \
  neoguard-agent
```

---

## Kubernetes

### DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: neoguard-agent
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: neoguard-agent
  template:
    metadata:
      labels:
        app: neoguard-agent
    spec:
      hostPID: true
      hostNetwork: true
      containers:
        - name: agent
          image: your-registry/neoguard-agent:0.2.0
          env:
            - name: NEOGUARD_API_KEY
              valueFrom:
                secretKeyRef:
                  name: neoguard-secrets
                  key: api-key
            - name: NEOGUARD_ENDPOINT
              value: https://ingest.yourdomain.com
          ports:
            - containerPort: 8282
              name: health
          livenessProbe:
            httpGet:
              path: /health
              port: 8282
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 8282
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 256Mi
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
            - name: sys
              mountPath: /host/sys
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
        - name: sys
          hostPath:
            path: /sys
```

---

## Upgrade

### Linux (systemd)

```bash
# Stop
sudo systemctl stop neoguard-agent

# Replace binary
sudo cp neoguard-agent-linux-amd64-new /usr/bin/neoguard-agent
sudo chmod 755 /usr/bin/neoguard-agent

# Start
sudo systemctl start neoguard-agent

# Verify
neoguard-agent version
journalctl -u neoguard-agent --since "1 minute ago"
```

### Linux (deb)

```bash
sudo dpkg -i neoguard-agent_0.3.0_amd64.deb
# Config is NOT overwritten (noreplace flag)
sudo systemctl restart neoguard-agent
```

### Rollback

```bash
# Keep the previous binary
sudo cp /usr/bin/neoguard-agent /usr/bin/neoguard-agent.bak

# If upgrade fails
sudo cp /usr/bin/neoguard-agent.bak /usr/bin/neoguard-agent
sudo systemctl restart neoguard-agent
```

---

## Verification

After deployment, verify the agent is working:

```bash
# Check service status
sudo systemctl status neoguard-agent

# View logs
journalctl -u neoguard-agent -f

# Test connection
neoguard-agent test-connection --config /etc/neoguard/agent.yaml

# Run diagnostics
neoguard-agent diagnose --config /etc/neoguard/agent.yaml

# Check health endpoint (if enabled)
curl http://127.0.0.1:8282/health
curl http://127.0.0.1:8282/ready
curl http://127.0.0.1:8282/status

# Check Prometheus metrics (if enabled)
curl http://127.0.0.1:8282/metrics | head -20
```

Expected output from `diagnose`:
```
=== NeoGuard Agent Diagnostics ===
Version:    0.2.0
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

---

## Security Hardening

The systemd unit (`deploy/neoguard-agent.service`) includes 17 hardening directives:

- `NoNewPrivileges=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `PrivateTmp=true`
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX`
- `SystemCallFilter=@system-service`
- `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_DAC_READ_SEARCH`
- `MemoryMax=256M`
- `CPUQuota=25%`
- Read-write only to `/var/log/neoguard` and `/var/lib/neoguard`

Config file should be mode 0640 (owner root, group neoguard). The agent warns on startup if the file is world-readable and refuses to load if world-writable.
