---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Troubleshooting

Common issues, symptoms, and resolutions for the NeoGuard agent.

---

## No Metrics Arriving

**Symptom:** Host does not appear in the NeoGuard dashboard.

1. **Is the agent running?**
   ```bash
   sudo systemctl status neoguard-agent
   ```
   If `inactive (dead)`: check `journalctl -u neoguard-agent -e` for startup errors.

2. **Check for send errors:**
   ```bash
   journalctl -u neoguard-agent --since "10 minutes ago" | grep -i "error\|failed"
   ```

3. **Test backend connectivity:**
   ```bash
   neoguard-agent test-connection --config /etc/neoguard/agent.yaml
   ```

4. **Common error messages:**

   | Log Message | Cause | Fix |
   |-------------|-------|-----|
   | `unauthorized` | Invalid or expired API key | Verify `api_key` in config matches an active key |
   | `connection refused` | Endpoint unreachable | Check endpoint URL, firewall, DNS |
   | `rate limited` | Too many requests | Increase `transport.batch_max_interval_seconds` |
   | `certificate verify failed` | TLS trust issue | Set `ca_bundle_path` for internal PKI |

---

## Agent Offline (Was Running, Stopped)

**Symptom:** Agent was collecting but stopped.

1. **Check if OOM-killed:**
   ```bash
   journalctl -u neoguard-agent | grep -i "killed\|oom"
   dmesg | grep neoguard
   ```
   Systemd enforces `MemoryMax=256M`. If the agent consistently hits this limit, check for excessive process scanning or file watches.

2. **Check systemd restart behavior:**
   ```bash
   systemctl show neoguard-agent --property=NRestarts
   ```
   The agent auto-restarts on crash (RestartSec=5). Multiple restarts indicate a persistent error.

3. **Check disk space (WAL writes):**
   ```bash
   df -h /var/lib/neoguard
   ```
   If disk is full, WAL writes fail (agent falls back to memory-only, logged as warning).

---

## Parse Errors (Log Collection)

**Symptom:** `agent.logs.parser_errors` metric increasing.

1. **JSON mode:** The log file contains non-JSON lines (e.g., startup banners, empty lines). These are shipped as raw but increment the counter. This is informational, not a failure.

2. **Regex mode:** The pattern does not match all line formats. Test with:
   ```bash
   # Sample a line and test
   head -1 /var/log/app/server.log
   echo "your line" | grep -P 'your_pattern'
   ```

3. **Mixed formats:** If a file contains both structured and unstructured lines, use `raw` mode and let the backend parse.

---

## Clock Skew

**Symptom:** Log message `clock_skew_detected` at startup, or exit code 78.

**Warning (|skew| > 60s):** Agent starts but timestamps are inaccurate.

**Fatal (|skew| > 300s with `strict_clock_check: true`):** Agent refuses to start.

**Fix:**
```bash
# Check NTP
timedatectl status

# Enable if disabled
sudo timedatectl set-ntp true

# Force sync
sudo systemctl restart systemd-timesyncd

# Restart agent
sudo systemctl restart neoguard-agent
```

See `docs/sop.md` SOP-010 for detailed resolution steps.

---

## WAL Corruption

**Symptom:** Log message `WAL replay: corrupt entry, skipping` at startup.

**Cause:** Agent was killed mid-write (power loss, OOM kill, `kill -9`).

**Impact:** Only the corrupt entry is lost. All other WAL entries replay normally. This is expected behavior after unclean shutdown.

**No action required.** The agent logs the corruption count and continues. If corruption is frequent, investigate why the agent is being killed (OOM? signal?).

To force a fresh WAL:
```bash
sudo systemctl stop neoguard-agent
sudo rm /var/lib/neoguard/wal/metrics.wal
sudo systemctl start neoguard-agent
```

---

## High CPU Usage

**Symptom:** Agent using >25% CPU (hits systemd CPUQuota limit).

**Common causes:**

1. **Too many processes:** Reduce `process.top_n` or add `deny_regex` patterns:
   ```yaml
   process:
     top_n: 10
     deny_regex: ["^kworker/", "^migration/", "^ksoftirqd/"]
   ```

2. **Per-core metrics on large hosts:** Disable if not needed:
   ```yaml
   cpu:
     per_core: false
   ```

3. **Too many file watches:** Reduce `file_watch.max_files`.

---

## High Memory Usage

**Symptom:** Agent approaching 256M limit or getting OOM-killed.

1. **Check buffer size:**
   ```bash
   curl -s http://127.0.0.1:8282/status | python3 -m json.tool | grep buffer
   ```

2. **Reduce buffer if needed:**
   ```yaml
   buffer:
     memory_max_items: 50000  # Default: 100000
   ```

3. **Check memory self-protection:**
   The agent has built-in memory protection. At `soft_limit_mb` (default 256), it enters degraded mode. At `hard_limit_mb` (default 384), it drops data aggressively.

4. **Log pipeline impact:** Each log source adds memory overhead. Limit total sources or reduce `spool.max_size_mb`.

---

## Config Validation Errors

**Symptom:** Agent fails to start with `error: config:` message.

Run diagnostics to see the full error:
```bash
neoguard-agent diagnose --config /etc/neoguard/agent.yaml
```

Common validation errors:

| Error | Fix |
|-------|-----|
| `api_key is required` | Set `api_key` in config |
| `endpoint must start with http:// or https://` | Fix endpoint URL |
| `process.aggregation.rules[N].pattern is invalid regex` | Fix regex syntax |
| `logs.sources[N].path must be absolute` | Use full path (e.g., `/var/log/app.log`) |
| `health.bind is not a valid address` | Use `host:port` format (e.g., `127.0.0.1:8282`) |

---

## Permissions Issues

**Symptom:** Agent starts but cannot read proc/net files or write to state directory.

1. **Verify state directory ownership:**
   ```bash
   ls -la /var/lib/neoguard/
   # Should be owned by neoguard:neoguard, mode 750
   ```

2. **Fix ownership:**
   ```bash
   sudo chown -R neoguard:neoguard /var/lib/neoguard /var/log/neoguard
   ```

3. **Verify systemd unit has ReadWritePaths:**
   ```bash
   systemctl cat neoguard-agent | grep ReadWritePaths
   # Should show: ReadWritePaths=/var/log/neoguard /var/lib/neoguard
   ```

4. **Process visibility:** The agent needs `CAP_DAC_READ_SEARCH` to read `/proc/[pid]` for processes owned by other users. The systemd unit grants this capability.

---

## Network Diagnostics

```bash
# DNS resolution
dig ingest.yourdomain.com

# TCP connectivity
curl -v https://ingest.yourdomain.com/api/v1/metrics/ingest

# Agent-level test
neoguard-agent test-connection --config /etc/neoguard/agent.yaml

# Firewall check
iptables -L -n | grep 443

# If behind proxy, set in systemd override:
sudo systemctl edit neoguard-agent
# Add: Environment=HTTPS_PROXY=http://proxy:3128
```

---

## Debug Logging

Enable temporarily for detailed diagnostics:

```yaml
logging:
  level: debug
  format: text  # Human-readable for manual inspection
```

Apply without restart (log level is hot-reloadable):
```bash
sudo systemctl reload neoguard-agent
journalctl -u neoguard-agent -f
```

Remember to set back to `info` after debugging — debug logging is verbose and increases CPU usage.
