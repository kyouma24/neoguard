# Standard Operating Procedures (SOP)

## SOP-001: Fresh Installation

**When**: New server needs monitoring.

```bash
# 1. Download binary (choose arch)
curl -Lo /usr/bin/neoguard-agent https://artifacts.example.com/neoguard-agent-linux-amd64
chmod +x /usr/bin/neoguard-agent

# 2. Create service user
useradd --system --no-create-home --shell /usr/sbin/nologin neoguard

# 3. Create directories
mkdir -p /etc/neoguard /var/lib/neoguard/wal /var/log/neoguard
chown neoguard:neoguard /var/lib/neoguard/wal /var/log/neoguard

# 4. Deploy config (edit api_key and endpoint)
cp agent.yaml /etc/neoguard/agent.yaml
chown root:neoguard /etc/neoguard/agent.yaml
chmod 640 /etc/neoguard/agent.yaml
vim /etc/neoguard/agent.yaml

# 5. Install systemd unit
cp deploy/neoguard-agent.service /lib/systemd/system/
systemctl daemon-reload
systemctl enable neoguard-agent

# 6. Verify before starting
neoguard-agent test-connection --config /etc/neoguard/agent.yaml
neoguard-agent diagnose --config /etc/neoguard/agent.yaml

# 7. Start
systemctl start neoguard-agent

# 8. Verify running
systemctl status neoguard-agent
journalctl -u neoguard-agent --since "1 minute ago" --no-pager
```

**Success criteria**: Status shows `active (running)`, logs show "agent starting" and "batch sent".

---

## SOP-002: Verify Agent is Working

**When**: After installation, after upgrade, or when investigating missing metrics.

```bash
# Step 1: Service status
systemctl status neoguard-agent
# Expected: active (running)

# Step 2: Recent logs
journalctl -u neoguard-agent --since "5 minutes ago" --no-pager
# Expected: "batch sent" messages with point counts

# Step 3: Diagnostics
neoguard-agent diagnose --config /etc/neoguard/agent.yaml
# Expected: all collectors listed, buffer items >= 0

# Step 4: Health endpoint (if enabled)
curl -s http://127.0.0.1:8282/status | python3 -m json.tool
# Expected: points_sent > 0, send_errors = 0

# Step 5: Test connection
neoguard-agent test-connection --config /etc/neoguard/agent.yaml
# Expected: "Connection test passed."
```

**Escalation**: If `test-connection` fails, see SOP-007 (Network Troubleshooting).

---

## SOP-003: Upgrade Agent

**When**: New version available.

```bash
# 1. Verify current version
neoguard-agent version

# 2. Download new binary
curl -Lo /tmp/neoguard-agent-new https://artifacts.example.com/neoguard-agent-linux-amd64-v0.3.0
chmod +x /tmp/neoguard-agent-new

# 3. Verify new binary
/tmp/neoguard-agent-new version

# 4. Backup current binary
cp /usr/bin/neoguard-agent /usr/bin/neoguard-agent.bak

# 5. Stop, replace, start
systemctl stop neoguard-agent
cp /tmp/neoguard-agent-new /usr/bin/neoguard-agent
systemctl start neoguard-agent

# 6. Verify
systemctl status neoguard-agent
neoguard-agent version
journalctl -u neoguard-agent --since "1 minute ago" --no-pager
```

**Rollback**:
```bash
systemctl stop neoguard-agent
cp /usr/bin/neoguard-agent.bak /usr/bin/neoguard-agent
systemctl start neoguard-agent
```

**Note**: WAL data from the previous version is automatically replayed on restart. No data loss during upgrade.

---

## SOP-004: Change Configuration

**When**: Need to adjust intervals, tags, collectors, or file watches.

### Hot-Reload (No Restart)

Supported changes: log level/format, extra_tags, file_watch, process config, disabled collectors.

```bash
# 1. Edit config
vim /etc/neoguard/agent.yaml

# 2. Send SIGHUP
systemctl reload neoguard-agent

# 3. Verify
journalctl -u neoguard-agent --since "30 seconds ago" --no-pager
# Expected: "config reloaded successfully"
```

### Full Restart

Required for: api_key, endpoint, intervals, transport, buffer settings.

```bash
vim /etc/neoguard/agent.yaml
systemctl restart neoguard-agent
```

---

## SOP-005: Uninstall Agent

**When**: Decommissioning a server or removing monitoring.

```bash
# 1. Stop and disable
systemctl stop neoguard-agent
systemctl disable neoguard-agent

# 2. Remove files
rm /usr/bin/neoguard-agent
rm /lib/systemd/system/neoguard-agent.service
rm -rf /etc/neoguard
rm -rf /var/lib/neoguard
rm -rf /var/log/neoguard

# 3. Remove user (optional)
userdel neoguard

# 4. Reload systemd
systemctl daemon-reload
```

For deb packages: `sudo dpkg --purge neoguard-agent`
For rpm packages: `sudo rpm -e neoguard-agent`

---

## SOP-006: Troubleshooting — No Metrics Arriving

**Symptom**: NeoGuard dashboard shows no data for this host.

```bash
# Step 1: Is the agent running?
systemctl status neoguard-agent
# If inactive: systemctl start neoguard-agent

# Step 2: Check for send errors
journalctl -u neoguard-agent --since "10 minutes ago" | grep -i "error\|failed"

# Step 3: Common errors and fixes

# "unauthorized — check api_key in config"
# Fix: Verify api_key in config matches a valid key in NeoGuard

# "network: dial tcp: connection refused"
# Fix: Check endpoint URL, ensure network access to ingest API

# "rate limited"
# Fix: Increase batch_max_interval_seconds or reduce collection frequency

# "batch rejected — check metric format"
# Fix: Agent version mismatch? Upgrade to latest.

# Step 4: Enable debug logging temporarily
# In agent.yaml, set logging.level to "debug"
systemctl reload neoguard-agent
journalctl -u neoguard-agent -f
# After debugging, set back to "info"
```

---

## SOP-007: Troubleshooting — Network Issues

**Symptom**: Agent running but send errors in logs.

```bash
# 1. Test DNS resolution
dig ingest.yourdomain.com

# 2. Test TCP connectivity
curl -v https://ingest.yourdomain.com/api/v1/metrics/ingest

# 3. Test agent connectivity
neoguard-agent test-connection --config /etc/neoguard/agent.yaml

# 4. Check firewall
iptables -L -n | grep 443
# Or for cloud: check security group rules for outbound HTTPS

# 5. Check proxy
# If behind a proxy, set HTTP_PROXY/HTTPS_PROXY env vars in systemd unit:
# Environment=HTTPS_PROXY=http://proxy:3128
```

---

## SOP-008: Troubleshooting — High Resource Usage

**Symptom**: Agent using too much CPU or memory.

```bash
# 1. Check current usage
systemctl status neoguard-agent | grep Memory
top -p $(pidof neoguard-agent) -bn1

# 2. Check agent self-metrics
curl -s http://127.0.0.1:8282/status | python3 -m json.tool
# Look at: heap_alloc_bytes, goroutines, collection_duration_ms

# 3. Common causes and fixes

# High CPU: process collector scanning too many processes
# Fix: Reduce process.top_n, add deny_regex for kernel threads
# process:
#   top_n: 10
#   deny_regex: ["^kworker/", "^migration/", "^ksoftirqd/"]

# High memory: buffer too large or too many file watches
# Fix: Reduce buffer.memory_max_items or file_watch.max_files

# High CPU: per-core metrics on many-core hosts
# Fix: Ensure cpu.per_core is false (default)

# 4. Systemd limits protect the host
# MemoryMax=256M and CPUQuota=25% are enforced by the systemd unit
```

---

## SOP-009: Troubleshooting — WAL Issues

**Symptom**: WAL-related warnings in logs.

```bash
# "WAL write failed, continuing memory-only"
# Cause: Disk full or permission issue
df -h /var/lib/neoguard/wal
ls -la /var/lib/neoguard/wal/

# Fix permission
chown neoguard:neoguard /var/lib/neoguard/wal
chmod 750 /var/lib/neoguard/wal

# Fix disk full: clear old WAL
rm /var/lib/neoguard/wal/metrics.wal
systemctl restart neoguard-agent

# "WAL replay: corrupt entry, skipping"
# Cause: Agent was killed mid-write (power loss, OOM kill)
# Action: Harmless — corrupt entries are skipped, valid ones are replayed
```

---

## SOP-010: Troubleshooting — Clock Skew

**Symptom**: Log message `"clock_skew_detected"` appears during agent startup, or agent exits with code 78 and message `"strict_clock_check_failed"`.

### Warning: Clock Skew Detected (|skew| > 60s)

**Log format:**
```json
{"level":"WARN","msg":"clock_skew_detected","skew_seconds":75.3,"threshold":60,"recommendation":"synchronize system clock with NTP"}
```

**Impact:**
- Metric timestamps are off by the reported skew
- Rate calculations (e.g., `rate(cpu)`) may be inaccurate
- Alert timing may be incorrect
- Charts show data at wrong times

**Resolution:**

1. **Check NTP status:**
   ```bash
   # systemd-timesyncd (Ubuntu/Debian)
   timedatectl status

   # ntpd (RHEL/CentOS)
   ntpq -p

   # chronyd (modern RHEL/Rocky)
   chronyc tracking
   ```

2. **If NTP is disabled, enable it:**
   ```bash
   sudo timedatectl set-ntp true
   ```

3. **Force immediate clock synchronization:**
   ```bash
   # systemd-timesyncd
   sudo systemctl restart systemd-timesyncd

   # ntpd
   sudo ntpd -gq

   # chronyd
   sudo chronyc makestep
   ```

4. **Verify clock is now synchronized:**
   ```bash
   timedatectl status
   # Look for "System clock synchronized: yes"
   ```

5. **Restart agent to clear warning:**
   ```bash
   sudo systemctl restart neoguard-agent
   ```

**Prevention:** Enable NTP on all monitored hosts before deploying the agent.

### Critical: Strict Clock Check Failed (|skew| > 300s)

**Log format:**
```json
{"level":"ERROR","msg":"strict_clock_check_failed","error":"clock skew too large: 350.0s (threshold: 300s)"}
```

**Exit code:** 78 (EX_CONFIG — configuration error)

**Impact:**
- Agent refuses to start
- No metrics are collected
- System remains unmonitored until clock is corrected

**Resolution:**

This error only appears when `clock.strict_clock_check: true` is set in the config. The agent is protecting data integrity by refusing to emit metrics with severely incorrect timestamps.

1. **Synchronize system clock immediately** (follow steps 1-4 above)

2. **Restart agent after clock correction:**
   ```bash
   sudo systemctl restart neoguard-agent
   ```

3. **Verify agent started successfully:**
   ```bash
   systemctl status neoguard-agent
   # Expected: active (running)

   journalctl -u neoguard-agent --since "1 minute ago" --no-pager
   # Expected: no "strict_clock_check_failed" errors
   ```

### Persistent Clock Skew Issues

If clock skew persists after NTP sync:

1. **Check NTP server reachability:**
   ```bash
   # Test UDP port 123 connectivity
   sudo tcpdump -i any port 123 -c 10
   ```

2. **Check firewall rules:**
   ```bash
   # Allow outbound NTP
   sudo iptables -A OUTPUT -p udp --dport 123 -j ACCEPT
   ```

3. **Verify NTP server configuration:**
   ```bash
   # For systemd-timesyncd
   cat /etc/systemd/timesyncd.conf

   # For ntpd
   cat /etc/ntp.conf

   # For chronyd
   cat /etc/chrony.conf
   ```

4. **Check for virtualization clock issues:**
   ```bash
   # VMware: Ensure VMware Tools is installed
   vmware-toolbox-cmd timesync status

   # AWS: EC2 instances should use Amazon Time Sync Service
   # Add to /etc/chrony.conf:
   # server 169.254.169.123 prefer iburst minpoll 4 maxpoll 4
   ```

### Configuration Reference

To disable strict clock checking (default):
```yaml
clock:
  strict_clock_check: false  # Agent starts with any clock skew
```

To enable strict mode (recommended for production):
```yaml
clock:
  strict_clock_check: true   # Exit code 78 if |skew| > 300s
```

---

## SOP-011: Bulk Fleet Deployment

**When**: Rolling out to many servers at once.

### Via AWS Systems Manager

```bash
# Create SSM document or use Run Command with the S3 deploy script
aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets "Key=tag:Environment,Values=production" \
  --parameters 'commands=["curl -Lo /tmp/deploy.sh https://s3.amazonaws.com/your-bucket/deploy-agent.sh","bash /tmp/deploy.sh"]'
```

### Via Ansible

```yaml
- hosts: all
  become: true
  tasks:
    - name: Download agent
      get_url:
        url: https://s3.amazonaws.com/your-bucket/neoguard-agent-linux-amd64
        dest: /usr/bin/neoguard-agent
        mode: '0755'

    - name: Deploy config
      template:
        src: agent.yaml.j2
        dest: /etc/neoguard/agent.yaml
        owner: root
        group: neoguard
        mode: '0640'

    - name: Ensure running
      systemd:
        name: neoguard-agent
        state: started
        enabled: true
```

### Verification

After fleet deployment, check:
1. NeoGuard dashboard: all hosts reporting
2. `agent.send_errors` metric should be 0 across fleet
3. `agent.uptime_seconds` should show consistent values (all started around same time)
