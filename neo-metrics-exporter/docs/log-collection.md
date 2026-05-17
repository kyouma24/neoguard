---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Log Collection

The NeoGuard agent can tail log files and ship structured log entries alongside metrics. Logs and metrics correlate on the same `resource_id` and `agent_id`; `tenant_id` is derived by the backend from API-key authentication, not sent by the agent.

---

## Enabling Logs

Add a `logs` section to your `agent.yaml`:

```yaml
logs:
  enabled: true
  sources:
    - path: /var/log/nginx/access.log
      service: nginx
```

Restart the agent (log config is not hot-reloadable):

```bash
sudo systemctl restart neoguard-agent
```

---

## Source Configuration

Each source defines one file to tail:

```yaml
logs:
  enabled: true
  sources:
    - path: /var/log/app/server.log
      service: myapp
      start_position: end
      parser:
        mode: json
      multiline:
        enabled: false
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | Yes | — | Absolute path to the log file |
| `service` | Yes | — | Service name tag attached to every log entry |
| `start_position` | No | `end` | `end` = tail new lines only; `start` = read from beginning |
| `parser.mode` | No | `raw` | Parser mode (see below) |
| `parser.pattern` | Conditional | — | Required when `parser.mode` is `regex` |
| `multiline.enabled` | No | `false` | Enable multiline aggregation |
| `multiline.mode` | Conditional | — | Required when multiline enabled |
| `multiline.pattern` | Conditional | — | Required when multiline enabled |
| `multiline.max_bytes` | No | `32768` | Max bytes per multiline message |
| `multiline.flush_timeout` | No | `5s` | Time to wait for continuation lines |

---

## Parser Modes

### raw (default)

Treats each line as a single message with no field extraction.

```yaml
parser:
  mode: raw
```

### json

Parses each line as JSON. Extracted fields become searchable attributes.

```yaml
parser:
  mode: json
```

If a line is not valid JSON, it is still shipped as a raw message and `agent.logs.parser_errors` is incremented.

### regex

Extracts named capture groups as fields:

```yaml
parser:
  mode: regex
  pattern: '^(?P<timestamp>\S+)\s+(?P<level>\w+)\s+\[(?P<thread>[^\]]+)\]\s+(?P<message>.*)$'
```

Named groups (`?P<name>`) become log entry fields. The full line is always preserved as the message body. Non-matching lines are shipped as raw.

---

## Multiline Support

Stack traces and wrapped messages span multiple lines. Multiline mode aggregates them into a single entry.

### start mode

A line matching the pattern marks the **start** of a new message. All subsequent non-matching lines are appended to the current message.

```yaml
multiline:
  enabled: true
  mode: start
  pattern: '^\d{4}-\d{2}-\d{2}'
  max_bytes: 65536
  flush_timeout: 3s
```

### continue mode

A line matching the pattern is a **continuation** of the previous message. Non-matching lines start a new message.

```yaml
multiline:
  enabled: true
  mode: continue
  pattern: '^\s+'
  max_bytes: 32768
  flush_timeout: 5s
```

### Truncation

Messages exceeding `max_bytes` are truncated and `agent.logs.multiline_truncations` is incremented.

---

## Credential Redaction

Enabled by default when sources are configured. Redacts sensitive patterns before transmission:

| Pattern | Example Match |
|---------|---------------|
| Bearer tokens | `Authorization: Bearer eyJ...` |
| AWS access keys | `AKIA...` (20-char key IDs) |
| API key fields | `"api_key": "sk-..."` |
| Password fields | `"password": "secret123"` |

Replacement values by pattern:
- Bearer tokens → `Bearer [REDACTED:TOKEN]`
- AWS access keys → `[REDACTED:AWS_KEY]`
- Sensitive field values (api_key, password, secret, etc.) → `[REDACTED]`

The metric `agent.logs.redaction_applied` tracks redactions by pattern type.

To disable redaction:

```yaml
logs:
  redaction:
    enabled: false
```

---

## Buffering and Delivery

Log entries flow through a dedicated pipeline separate from metrics:

```
File Tailer → Parser → Multiline → Redactor → LogRing (memory) → LogSpool (disk) → Shipper → Backend
```

### Backpressure

| Threshold | Behavior |
|-----------|----------|
| Normal (< high_watermark_pct) | Entries buffered and shipped normally |
| High watermark (default 80%) | `agent.logs.buffer_high_watermark` incremented; tailers slow reads while spool remains above threshold |
| Critical watermark (default 95%) | Oldest batches dropped, `agent.logs.buffer_dropped_batches` incremented |

### Dead-letter

When all retries are exhausted (network outage, persistent 5xx), entries are written to dead-letter files at `/var/lib/neoguard/logs-dead-letter/` for manual recovery.

### Spool directory

Persisted log batches awaiting transmission live in `/var/lib/neoguard/logs-spool/`. The agent survives restarts without data loss for buffered entries.

### Cursor persistence

File read positions (offsets) are checkpointed to `/var/lib/neoguard/log_cursors/`. On restart, tailing resumes from the last checkpoint rather than re-reading the entire file.

---

## Log Rotation Handling

The tailer detects two rotation strategies:

1. **Rename rotation** (logrotate default): Original file is renamed, new file created at the same path. The tailer detects the inode change and opens the new file.

2. **Truncation rotation**: File is truncated to zero bytes. The tailer detects the size decrease and resets to the beginning.

Both are handled automatically. The metric `agent.logs.rotations` tracks rename rotations; `agent.logs.truncations` tracks truncation events.

---

## Self-Monitoring Metrics

| Metric | Description |
|--------|-------------|
| `agent.logs.rotations` | File rotations detected |
| `agent.logs.truncations` | File truncations detected |
| `agent.logs.missing_files` | Poll cycles where file was not found |
| `agent.logs.parser_errors` | Lines that failed to parse |
| `agent.logs.multiline_truncations` | Multiline messages truncated at max_bytes |
| `agent.logs.redaction_applied` | Credentials redacted (by pattern type) |
| `agent.logs.buffer_dropped_batches` | Batches dropped at critical watermark |
| `agent.logs.buffer_high_watermark` | High watermark events |
| `agent.logs.dead_lettered` | Entries written to dead-letter |

---

## Full Example

```yaml
logs:
  enabled: true
  sources:
    - path: /var/log/nginx/access.log
      service: nginx
      start_position: end
      parser:
        mode: json

    - path: /var/log/app/application.log
      service: myapp
      start_position: end
      parser:
        mode: regex
        pattern: '^(?P<timestamp>\S+ \S+) (?P<level>\w+) (?P<logger>\S+) - (?P<message>.*)$'
      multiline:
        enabled: true
        mode: start
        pattern: '^\d{4}-\d{2}-\d{2}'
        max_bytes: 65536
        flush_timeout: 3s

    - path: /var/log/syslog
      service: system
      start_position: end
      parser:
        mode: raw

  redaction:
    enabled: true

  spool:
    max_size_mb: 2048
    high_watermark_pct: 80
    critical_watermark_pct: 95
```

---

## Troubleshooting

**No log entries arriving:**
1. Verify `logs.enabled: true` in config
2. Check file exists and is readable by the `neoguard` user
3. Look for `agent.logs.missing_files` or `agent.logs.parser_errors` in agent self-metrics
4. Enable debug logging: `logging.level: debug`, reload, check for tailer messages

**Parser errors on every line:**
- JSON mode: ensure the file actually contains JSON (not mixed formats)
- Regex mode: test your pattern against sample lines; non-matching lines increment `parser_errors`

**High memory with many sources:**
- Each source maintains a read buffer. Limit total sources to ~20 per agent.
- Reduce `multiline.max_bytes` if stack traces are extremely large.
