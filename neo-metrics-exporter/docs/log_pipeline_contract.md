# Log Pipeline Contract

> **Version:** 1.0
> **Date:** 2026-05-15
> **Status:** Active
> **Ticket:** AGENT-004
> **Purpose:** Architectural freeze for log collection implementation

This document defines the NeoGuard log collection architecture before any implementation. All design choices are finalized in this contract. Implementation must follow this specification exactly.

---

## 1. Introduction & Scope

### 1.1 Purpose

This contract defines how the NeoGuard agent collects, parses, buffers, and ships log events from monitored hosts. It establishes the pipeline separation from metrics, correlation requirements, parser modes, redaction rules, backpressure behavior, and acceptance criteria.

**Architecture freeze**: This document resolves all design choices before code is written. Implementation in Phases 3-4 must conform to this contract.

### 1.2 First-Release Scope (v1)

- **File tailing** on Linux and Windows (bare-metal and VM hosts)
- **Parser modes**: raw, JSON, regex (with named capture groups)
- **Multiline support**: Configurable per-source with pattern matching
- **Redaction**: Hardcoded safe defaults (bearer tokens, AWS keys, API keys, password fields)
- **Correlation**: Same identity tags as metrics (`resource_id`, `agent_id`, `cloud_provider`)
- **Pipeline separation**: Independent buffers, disk spool, dead-letter, and retry state from metrics

### 1.3 Explicitly Out-of-Scope for v1

The following are **not** part of the first release and must not appear in implementation:

- journald integration (Linux)
- Windows Event Log integration
- Container stdout/stderr collection
- Kubernetes pod log collection (`/var/log/pods/`)
- Syslog listeners (TCP/UDP ports, RFC 5424)
- CloudWatch Logs ingestion (AWS)
- Azure Monitor Logs ingestion (Azure)
- nginx/apache format presets (e.g., `parser.mode: nginx_combined`)
- Custom user-defined redaction patterns (security and performance risk)

These may be considered for v2+ after v1 soak testing and customer validation.

---

## 2. Pipeline Separation (Metrics vs. Logs)

### 2.1 Rationale

Log storms must not starve metric delivery. The correlation contract depends on metrics remaining unblocked. A single high-volume log file (10 MB/sec) must not delay metric collection or transmission.

### 2.2 Required Separation

Logs and metrics are fully independent pipelines:

| Component | Metrics | Logs | Shared? |
|---|---|---|---|
| In-memory buffer | buffer.Ring | Separate buffer.Ring | No |
| Disk persistence | WAL (metrics.wal) | Spool (logs-spool/) | No |
| Disk size limit | 1 GB | 2 GB | No |
| Dead-letter directory | metrics-dead-letter/ | logs-dead-letter/ | No |
| Retry state | retry_count per metric batch | retry_count per log batch | No |
| Transmission goroutine | transmitBatch() | transmitLogs() | No |
| HTTP endpoint | /api/v1/metrics/ingest | /api/v1/logs/ingest | No |
| HTTP timeout | 30s | 60s | No |
| Identity tags | Identity.Tags() | Identity.Tags() | Yes |
| HTTP transport client | transport.Client | transport.Client | Yes |
| Signal handlers | SIGHUP, SIGTERM, SIGINT | SIGHUP, SIGTERM, SIGINT | Yes |

### 2.3 Terminology: WAL vs Spool

- **Metrics**: Use write-ahead log (WAL) with binary framing, CRC32, versioned header (`metrics.wal`)
- **Logs**: Use disk spool directory with newline-delimited JSON files (`logs-spool/*.jsonl`)
- **Rationale**: Metrics are fixed-schema binary data; logs are variable-length text. Separate persistence formats optimize for each data type.
- **Common behavior**: Both provide crash durability and replay on restart.

This contract uses "spool" for logs and "WAL" for metrics to align with `execution_plan.md`.

### 2.4 Configuration Namespace

Log configuration lives under a top-level `logs:` key, parallel to `metrics:`, `buffer:`, and `transport:`:

```yaml
logs:
  enabled: true
  sources:
    - path: /var/log/app.log
      service: web-api
      parser:
        mode: json
      multiline:
        enabled: false
  redaction:
    enabled: true
  spool:
    max_size_mb: 2048
    high_watermark_pct: 80
    critical_watermark_pct: 95
```

---

## 3. Required Identity Tags and Correlation Contract

### 3.1 Correlation Contract Enforcement

Logs must join on `(tenant_id, resource_id, agent_id)` - the same triple used for metrics. This contract is defined in `correlation_contract.md` Section 2.

**Every log event carries the following identity tags**:

| Tag Key | Source | Required | Mutability |
|---|---|---|---|
| `resource_id` | `Identity.InstanceID` | Yes (Always) | Immutable per machine lifecycle |
| `agent_id` | `Identity.AgentID` | Yes (Always) | Stable per agent installation |
| `cloud_provider` | `Identity.Provider` | Yes (Always) | Immutable (includes `"unknown"`) |
| `hostname` | `Identity.Hostname` | Yes (Always) | May change on hostname change |
| `os` | `runtime.GOOS` | Yes (Always) | Immutable per OS |
| `agent_version` | `Agent.version` | Yes (Always) | Changes on upgrade |

### 3.2 Tag Injection Mechanism

Log events inherit identity tags from the same source as metrics:

1. `Identity.Tags()` provides `resource_id`, `agent_id`, `cloud_provider`, `hostname`, `os`
2. `Agent.Run()` injects `agent_version` from build-time constant
3. All log events in a batch carry the same identity tags (no per-event identity variation)

### 3.3 Correlation Rules

- **Primary join keys**: `resource_id` and `agent_id` are used for backend queries across metrics, logs, and agent registry
- **Display metadata**: `hostname` is shown in UI but never used as a join key or filter predicate in correlation queries
- **Tenant isolation**: `tenant_id` is backend-derived from API key authentication (see Section 3.4)
- **Backend read model**: Queries must use `WHERE tenant_id = ? AND resource_id = ?`, not `WHERE hostname = ?`

### 3.4 Tenant Identity (Backend-Derived Only)

- **Never trusted from agent payload**: The agent must not send a `tenant_id` field in log events
- **Backend derives tenant**: `tenant_id` is extracted from the authenticated API key session in `POST /api/v1/logs/ingest`
- **Explicit in schema**: The `LogEvent` wire format (Section 7) does not include `tenant_id` - it is added by the backend on ingest

---

## 4. File Tailing Semantics

### 4.1 Cursor Persistence

#### 4.1.1 Checkpoint Structure

Each tailed file has a cursor checkpointed to disk:

```json
{
  "configured_path": "/var/log/app.log",
  "platform_file_identity": {
    "device": 2049,
    "inode": 12345678
  },
  "offset": 987654,
  "file_size": 1048576,
  "last_checkpoint": "2026-05-15T10:23:45.123456Z"
}
```

- **`configured_path`**: The file path from agent configuration (e.g., `logs.sources[0].path`)
- **`platform_file_identity`**: Platform-specific file identity (see Section 10)
  - Linux/Unix: `(device, inode)` from `stat(2)`
  - Windows: `(device, inode)` aliases for volume serial + file index from `GetFileInformationByHandle`
- **`offset`**: Byte offset of the last successfully read line
- **`file_size`**: File size at last checkpoint (used for truncation detection)

#### 4.1.2 Checkpoint Frequency

Cursors are saved:

- **Every 5 seconds** during normal operation (periodic checkpoint)
- **On shutdown** (SIGHUP, SIGTERM, SIGINT) before agent exit
- **Not tied to backend POST success**: Cursor saves on read progress, independent of whether the backend acknowledges delivery

#### 4.1.3 Checkpoint Storage

- **Location**: `<stateDir>/log_cursors/<path-hash>.json`
  - `<path-hash>`: SHA-256 hash of `configured_path` (first 16 hex chars)
  - Example: `<stateDir>/log_cursors/a1b2c3d4e5f60718.json`
- **Permissions**: 0640 (owner read/write, group read)

#### 4.1.4 Durability Semantics

- **Checkpoint protects reader progress**: Prevents re-reading already-processed lines on agent restart
- **Spool protects delivery durability**: Ensures read events reach the backend even after crash
- **Duplicate window on crash**: Up to 5 seconds of log events (between last checkpoint and crash) may be re-read and re-sent on restart
  - Backend deduplication is not guaranteed
  - Duplicate events are acceptable in observability systems (idempotency is a best-effort goal, not a hard requirement)

### 4.2 Start Position

- **Default**: `end` - Start reading new lines only, skip historical logs
- **Opt-in**: `start` - Read from beginning on first watch (per-file config: `sources[0].start_position: start`)
- **Rationale**: Prevents agent startup from emitting 10 GB backlog on first run (common in production log directories)

### 4.3 Rotation Handling

The agent must handle three rotation types without data loss or duplication:

#### 4.3.1 Rename Rotation (logrotate default)

- **Behavior**: Old file renamed (e.g., `app.log` to `app.log.1`), new `app.log` created
- **Agent behavior**:
  1. Detect platform file identity of configured path has changed
  2. Finish reading old file handle to EOF (do not abandon mid-file)
  3. Open new file at configured path, start from offset 0 (newly created files always start at offset 0, not `start_position`)
- **Counter**: `agent.logs.rotations` with tags `source`, `rotation_type: "rename"`
- **Note**: `start_position` config applies only to the first watch of a file (before any rotation). After rotation, new files start at offset 0 to avoid skipping newly written lines.

#### 4.3.2 Copytruncate Rotation

- **Behavior**: File contents copied elsewhere, then truncated to 0 bytes (same inode)
- **Agent behavior**:
  1. Detect `current_size < cursor_offset` on next read attempt
  2. Log warning: `"truncation detected, resetting to offset 0"`
  3. Reset cursor to offset 0, re-read from beginning
- **Counter**: `agent.logs.truncations` with tag `source`
- **Risk**: If truncation happens between checkpoint intervals, up to 5 seconds of logs before truncation may be lost (copytruncate is inherently racy)

#### 4.3.3 Missing File

- **Behavior**: Configured path does not exist (file deleted, not yet created, or network mount unavailable)
- **Agent behavior**:
  1. Poll every 30 seconds
  2. When file appears, open and start from configured `start_position` (default: `end`)
  3. Emit counter on each poll cycle: `agent.logs.missing_files` with tag `source`
- **Does not block**: Missing file does not prevent other sources from tailing

### 4.4 Inode Tracking

- Track platform file identity on every cursor checkpoint
- On startup: Compare stored `platform_file_identity` with current file at `configured_path`
- If identity changed: Treat as rotation (old file was moved/deleted, new file created at same path)

### 4.5 Flush Triggers

Log batches are flushed to the buffer when:

1. **Batch size reached**: 1000 events OR 1 MB payload (whichever comes first)
2. **Time window elapsed**: 5 seconds since last flush
3. **Shutdown**: Immediate flush of partial batch (before agent exit)

---

## 5. Parser Modes (First Release)

All three parser modes are **first-release scope (v1)**. nginx/apache presets are future scope.

### 5.1 raw

- **Behavior**: Single-line text, no parsing
- Each line becomes one log event with `message` field
- No timestamp extraction (use collection time)
- No structured fields

**Example**:
```
Input:  2026-05-15 10:23:45 ERROR Request failed
Output: {"timestamp": "2026-05-15T14:32:01.987Z", "message": "2026-05-15 10:23:45 ERROR Request failed", "level": "unknown"}
```
(Note: `timestamp` is collection time, not extracted from input. `level` defaults to `unknown` when not parsed.)

### 5.2 json

- **Behavior**: Parse each line as a JSON object
- Extract known fields: `timestamp`, `level`, `message`
- Remaining key-value pairs go into `fields`
- **Malformed JSON**: Emit as raw text with `parse_error: true` field
- **Counter**: `agent.logs.parser_errors` with tags `source`, `parser_mode: "json"`

**Example**:
```json
Input:  {"timestamp": "2026-05-15T10:23:45.123Z", "level": "error", "message": "Request failed", "user_id": 12345}
Output: {"timestamp": "2026-05-15T10:23:45.123Z", "level": "error", "message": "Request failed", "fields": {"user_id": 12345}}
```

### 5.3 regex

- **Behavior**: Named capture groups for custom formats
- Per-source configuration:
  ```yaml
  sources:
    - path: /var/log/app.log
      parser:
        mode: regex
        pattern: '^(?P<timestamp>\S+) (?P<level>\S+) (?P<message>.*)$'
  ```
- **Malformed line**: If pattern does not match, emit as raw text with `parse_error: true`
- **Counter**: `agent.logs.parser_errors` with tags `source`, `parser_mode: "regex"`

**Example**:
```
Pattern: ^(?P<timestamp>\S+) (?P<level>\S+) (?P<message>.*)$
Input:   2026-05-15T10:23:45Z ERROR Request failed with status 500
Output:  {"timestamp": "2026-05-15T10:23:45Z", "level": "error", "message": "Request failed with status 500"}
```

### 5.4 Future Scope (v2)

- nginx/apache format presets (e.g., `parser.mode: nginx_combined`)
- Grok patterns for common log formats
- These require field testing and validation on real logs before inclusion

---

## 6. Multiline Semantics (Per-Source Configuration)

### 6.1 Configuration Scope

**Per-source** (not global). This allows:
- Java stack traces on `app.log` (multiline enabled with pattern `^\d{4}-\d{2}-\d{2}`)
- Raw single-line on `access.log` (multiline disabled)

### 6.2 Pattern Matching

```yaml
sources:
  - path: /var/log/app.log
    multiline:
      enabled: true
      mode: start  # or "continue"
      pattern: '^\d{4}-\d{2}-\d{2}'  # Timestamp start
      max_bytes: 32768
      flush_timeout: 5s
```

### 6.3 Grouping Modes

#### 6.3.1 start

- **Pattern marks the start of a new event**
- Buffer lines until the next line matches the pattern
- Example: Java exception with timestamp on first line

```
2026-05-15 10:23:45 ERROR NullPointerException
    at com.example.Handler.process(Handler.java:42)
    at com.example.Main.run(Main.java:10)
2026-05-15 10:23:46 INFO Request completed
```

Events:
1. `"2026-05-15 10:23:45 ERROR NullPointerException\n    at com.example.Handler.process(Handler.java:42)\n    at com.example.Main.run(Main.java:10)"`
2. `"2026-05-15 10:23:46 INFO Request completed"`

#### 6.3.2 continue

- **Pattern marks a continuation line**
- Buffer until a line does NOT match the pattern
- Example: Python traceback with leading whitespace on continuation lines

```
Traceback (most recent call last):
  File "main.py", line 10, in <module>
    raise ValueError("bad input")
ValueError: bad input
Next log line
```

Events:
1. `"Traceback (most recent call last):\n  File \"main.py\", line 10, in <module>\n    raise ValueError(\"bad input\")\nValueError: bad input"`
2. `"Next log line"`

### 6.4 Max Bytes

- **Default**: 32 KB per multiline event
- **Configurable**: `multiline.max_bytes`
- **Overflow handling**: If accumulated lines exceed `max_bytes`:
  1. Emit partial event with `truncated: true` field
  2. Start new event with remaining lines
  3. Counter: `agent.logs.multiline_truncations` with tag `source`

### 6.5 Flush Timeout

- **Default**: 5 seconds
- **Configurable**: `multiline.flush_timeout`
- **Behavior**: If no new lines arrive within timeout, emit incomplete event (prevents indefinite buffering on EOF)

---

## 7. Required Event Schema

### 7.1 Wire Format Envelope

Log events are sent to `POST /api/v1/logs/ingest` in an envelope structure defined in `execution_plan.md` Section 2.2:

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_version": "1.0.0",
  "schema_version": 1,
  "logs": [
    {
      "timestamp": "2026-05-15T10:23:45.123456Z",
      "message": "Request failed with status 500",
      "level": "error",
      "service": "web-api",
      "source": "/var/log/app.log",
      "tags": {
        "resource_id": "i-0abc123",
        "agent_id": "550e8400-e29b-41d4-a716-446655440000",
        "cloud_provider": "aws",
        "hostname": "web-01",
        "os": "linux",
        "agent_version": "1.0.0"
      },
      "fields": {
        "user_id": "12345",
        "duration_ms": 234,
        "status_code": 500
      }
    }
  ]
}
```

### 7.2 Envelope Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `agent_id` | string (UUID) | Yes | Agent installation identity (from `Identity.AgentID`). |
| `agent_version` | string | Yes | Agent version (e.g., `1.0.0`). |
| `schema_version` | integer | Yes | Wire format version (currently `1`). |
| `logs` | array | Yes | Array of log events (max 1000 entries per request). |

### 7.3 Log Event Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `timestamp` | ISO8601 UTC | Yes | Log event timestamp. If not present in log line, use collection time. |
| `message` | string | Yes | Raw or parsed log message text (after redaction). Max 64 KB. Truncated lines emit `truncated: true` in `fields`. |
| `level` | string | Yes | Severity: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `unknown`. Default: `unknown` (not `info`) if not parsed. |
| `service` | string | Yes | Service name (per-file config: `sources[0].service: "web-api"`). Required by execution plan. |
| `source` | string | Yes | File path where event was read (e.g., `/var/log/app.log`). |
| `tags` | object | Yes | Identity tags (see Section 3). Same structure as metric tags. |
| `fields` | object | Optional | Arbitrary key-value pairs extracted from JSON/regex. Max 100 keys, values max 4 KB each. |

### 7.4 Backend Endpoint

- **Path**: `POST /api/v1/logs/ingest`
- **Auth**: API key in `Authorization: Bearer <key>` header
- **Content-Type**: `application/json`
- **Body**: Envelope with `agent_id`, `agent_version`, `schema_version`, and `logs` array (see Section 7.1)
- **Max payload**: 5 MB compressed, 50 MB uncompressed
- **tenant_id derivation**: Backend extracts `tenant_id` from API key session (not trusted from payload)

### 7.5 Timestamp Handling

- **If log line contains timestamp**: Parse and use it
  - JSON parser: Look for `timestamp`, `ts`, `time`, `@timestamp` fields
  - Regex parser: Extract from named group `(?P<timestamp>...)`
- **If no timestamp**: Use collection time (`time.Now().UTC()`)
- **Format**: Always send as ISO8601 UTC (e.g., `2026-05-15T10:23:45.123456Z`)

---

## 8. Redaction Before Buffering (Hardcoded Safe Defaults for v1)

### 8.1 Goal

Strip sensitive data **before writing to local spool**. If the agent crashes, the spool must not contain secrets.

### 8.2 Redaction Timing

Applied to `message` and `fields` **before buffer write**:

1. Read line from file
2. Parse (raw/JSON/regex)
3. **Apply redaction** (this step)
4. Write to in-memory buffer
5. Flush to spool

### 8.3 Required Patterns for v1 (Hardcoded)

These patterns are **not user-configurable** in v1. Custom regex is out of scope (security and performance risk).

#### 8.3.1 Bearer Tokens

- **Pattern**: `Bearer [A-Za-z0-9._-]{20,}`
- **Replacement**: `Bearer [REDACTED:TOKEN]`
- **Counter tag**: `pattern: "bearer"`

**Example**:
```
Before: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0
After:  Authorization: Bearer [REDACTED:TOKEN]
```

#### 8.3.2 AWS Access Keys

- **Pattern**: `AKIA[A-Z0-9]{16}`
- **Replacement**: `[REDACTED:AWS_KEY]`
- **Counter tag**: `pattern: "aws_key"`

**Example**:
```
Before: AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
After:  AWS_ACCESS_KEY_ID=[REDACTED:AWS_KEY]
```

#### 8.3.3 API Key Fields

- **Pattern**: Field names matching `api_key`, `apikey`, `token`, `access_token` (case-insensitive)
- **Replacement**: Value replaced with `"[REDACTED]"`
- **Counter tag**: `pattern: "api_key_field"`

**Example**:
```json
Before: {"api_key": "sk_live_abc123xyz", "user_id": 12345}
After:  {"api_key": "[REDACTED]", "user_id": 12345}
```

#### 8.3.4 Password Fields

- **Pattern**: Field names matching `password`, `passwd`, `pwd`, `secret` (case-insensitive)
- **Replacement**: Value replaced with `"[REDACTED]"`
- **Counter tag**: `pattern: "password_field"`

**Example**:
```json
Before: {"username": "alice", "password": "hunter2"}
After:  {"username": "alice", "password": "[REDACTED]"}
```

### 8.4 Configuration

- **Enable/disable**: `logs.redaction.enabled` (default: `true`)
- **Patterns**: Hardcoded in v1, not user-configurable
- **Counter**: `agent.logs.redaction_applied` with tag `pattern`

### 8.5 Future Scope (v2)

- Credit card numbers (`\b\d{13,19}\b`)
- Social security numbers
- Custom user-defined patterns (requires sandboxing and performance testing)

### 8.6 Performance Impact

Redaction is applied to every message and field before buffering. Expected overhead: <5% CPU increase on 10K lines/sec with all patterns enabled.

---

## 9. Backpressure and Outage Behavior

### 9.1 Tiered Response to Buffer Pressure

Log buffer pressure is managed in three stages to prevent data loss while protecting metric delivery:

#### 9.1.1 Normal Operation

- Tailers read files at maximum sustainable rate
- Buffer writes to in-memory ring
- Shipper drains buffer and POSTs to backend

#### 9.1.2 High Watermark (80% of log spool size)

- **Trigger**: Spool directory reaches 80% of `logs.spool.max_size_mb` (default: 2 GB x 0.8 = 1.6 GB)
- **Action**: Tailers slow down (sleep 100ms between reads)
- **Counter**: `agent.logs.buffer_high_watermark`
- **Metric impact**: None (separate goroutine, separate buffer)

#### 9.1.3 Critical Watermark (95% of log spool size)

- **Trigger**: Spool directory reaches 95% of `logs.spool.max_size_mb` (default: 2 GB x 0.95 = 1.9 GB)
- **Action**: Drop oldest log batch from buffer
- **Counter**: `agent.logs.buffer_dropped_batches` with `reason: "critical_watermark"`
- **Tailer behavior**: Continue reading (do not block indefinitely)
- **Metric impact**: None

**Rationale**: Dropping oldest logs is preferable to blocking indefinitely (which would create unbounded memory growth or disk fill). Observability data is time-sensitive; old logs are less valuable than recent ones.

### 9.2 Backend Unreachable

Logs follow a bounded retry cycle with re-enqueue and eventual dead-lettering:

#### 9.2.1 Retry Cycle

1. **Bounded send attempts**: Try to POST batch to backend with exponential backoff (1s, 2s, 4s)
2. **Re-enqueue on failure**: If all attempts within one cycle fail, increment `retry_count` and push batch back to front of buffer
3. **Dead-letter threshold**: When `retry_count >= 3` exhausted cycles, stop retrying and write batch to dead-letter file

#### 9.2.2 Dead-Letter Path

- **Directory**: `<dead-letter-dir>/logs/<timestamp>-<retry>.jsonl.gz`
- **Format**: JSONL (newline-delimited JSON), gzip-compressed
- **Naming**: `20260515_102345_3.jsonl.gz` (timestamp + retry count)
- **Counter**: `agent.logs.dead_lettered` with tag `reason: "retry_exhausted"`

#### 9.2.3 Retry State Separation

Log retry state is **independent from metric retry state**:
- Log batch with `retry_count=2` does not affect metric batches
- Metric transmission failure does not increment log `retry_count`

#### 9.2.4 Adaptive Throttling

If backend returns `429 Too Many Requests` for logs:
- Exponential backoff: 1s, 2s, 4s, 8s, max 30s
- Does not affect metric transmission (separate endpoint, separate rate limit)

### 9.3 Metric Priority Enforcement

The critical constraint: **log storms must never delay metric send cadence**.

#### 9.3.1 Separate Transmission Goroutines

- Log shipper: `transmitLogs()` goroutine
- Metric shipper: `transmitBatch()` goroutine
- No shared locks or mutexes between log and metric paths

#### 9.3.2 Separate HTTP Timeouts

- Logs: 60-second timeout per POST
- Metrics: 30-second timeout per POST
- Slow log POSTs do not block metric POSTs

#### 9.3.3 No Shared Buffers

- Log buffer full does not consume metric buffer space
- Log spool at 95% does not trigger metric buffer drop

#### 9.3.4 Verification

The abort criterion in Section 11.3 enforces this: "log storm delays metric send cadence by >5%" triggers implementation redesign.

---

## 10. Cross-Platform File Identity

### 10.1 Platform-Specific Identity

File identity must detect rotation reliably on both Linux and Windows.

#### 10.1.1 Linux/Unix

- **Source**: `stat(2)` system call
- **Identity tuple**: `(st_dev, st_ino)`
  - `st_dev`: Device ID (e.g., 2049 for `/dev/sda1`)
  - `st_ino`: Inode number (e.g., 12345678)

#### 10.1.2 Windows

- **Source**: `GetFileInformationByHandle` Win32 API
- **Identity tuple**: `(dwVolumeSerialNumber, nFileIndexHigh << 32 | nFileIndexLow)`
- **JSON fields**: Stored as `device` and `inode` for cross-platform compatibility

### 10.2 Cursor Storage Format

Cursors are stored as JSON with platform-agnostic field names:

```json
{
  "configured_path": "/var/log/app.log",
  "platform_file_identity": {
    "device": 2049,
    "inode": 12345678
  },
  "offset": 987654,
  "file_size": 1048576
}
```

On Windows, `device` holds volume serial and `inode` holds file index.

### 10.3 Rationale

Using platform file identity (not just path) ensures rotation detection:
- If `app.log` is renamed to `app.log.1` and a new `app.log` is created, the identity changes
- Agent finishes reading old file handle, then opens new file

---

## 11. Abort Criteria (Formal Requirements from Ticket)

Implementation must be **abandoned or redesigned** if any condition is met:

### 11.1 Memory Footprint

**Sustained 1000 lines/sec exceeds 120 MB memory footprint**

- **Measurement**: RSS memory increase attributable to log collection subsystem
- **Duration**: "Sustained" = 60 seconds continuous load
- **Baseline**: Measured with raw parser, no backend I/O (pure collection + buffering)

### 11.2 Throughput

**Single-core throughput below 30,000 lines/sec**

- **Measurement**: Lines parsed per second on a single CPU core
- **Test setup**: Raw parser, no I/O, no redaction (pure parsing throughput)
- **Environment**: Standard 2023+ x86_64 CPU (e.g., AWS m5.xlarge)

### 11.3 Metric Impact

**Log storm delays metric send cadence**

- **Measurement**: p99 metric batch send interval increases by more than 5% during log collection
- **Test setup**: 10 MB/sec log file tailing (simulated high-volume application)
- **Baseline**: Metric send cadence measured with log collection disabled
- **Threshold**: p99 metric interval must not exceed baseline times 1.05

If any abort criterion is met, stop implementation and report to reviewer. The architecture must be redesigned before proceeding.

---

## 12. Additional Quality Targets

These are **not abort criteria** but should be monitored during soak testing:

| Target | Value | Notes |
|---|---|---|
| Rotation detection latency | less than 10s | Time to switch to new file after rename |
| Duplicate window on crash | less than 5s | Lines re-read on restart (one checkpoint interval) |
| Redaction overhead | less than 5% CPU | Increase on 10K lines/sec with all patterns enabled |
| Missing file poll interval | 30s | Balance between responsiveness and CPU waste |
| Multiline flush timeout | 5s | Balance between completeness and latency |

---

## 13. Acceptance Tests (For Future Implementation)

These tests define acceptance criteria for future log collection implementation (Phases 3-4). AGENT-004 is a design-only ticket and does not require these tests to pass before marking Done. Implementation tickets must pass these tests before completion.

### 13.1 Isolation Tests

1. **Metric delivery unaffected by log collection**
   - Start agent with `logs.enabled: false`
   - Measure p99 metric send interval
   - Enable `logs.enabled: true` with 10 MB/sec log file
   - Verify p99 metric send interval changes by less than 5%

2. **Log buffer full does not block metrics**
   - Fill log spool to 95% (critical watermark)
   - Verify oldest log batch dropped with counter
   - Verify metric transmission continues without delay

### 13.2 Rotation Tests

3. **Rename rotation**
   - Tail `/var/log/app.log` (1000 lines)
   - Rotate: `mv app.log app.log.1 && touch app.log`
   - Write 1000 more lines to new `app.log`
   - Verify: All 2000 lines delivered to backend, no duplicates

4. **Copytruncate rotation**
   - Tail `/var/log/app.log` (1000 lines)
   - Rotate: `cp app.log app.log.1 && truncate -s 0 app.log`
   - Write 1000 more lines to truncated `app.log`
   - Verify: Truncation detected (counter incremented), new lines delivered

5. **Missing file**
   - Configure source: `/var/log/missing.log`
   - Start agent (file does not exist)
   - Verify: Counter `agent.logs.missing_files` increments every 30s
   - Create file, write 1000 lines
   - Verify: Lines delivered to backend

### 13.3 Crash Recovery Tests

6. **Cursor persistence**
   - Tail `/var/log/app.log` (1000 lines)
   - Kill agent with `SIGKILL` (mid-line)
   - Restart agent
   - Verify: Cursor restores to last checkpoint (less than 5s duplicate window)

7. **Spool replay**
   - Tail `/var/log/app.log` (1000 lines)
   - Backend unreachable (return 503)
   - Kill agent, restart
   - Backend reachable
   - Verify: All 1000 lines delivered (spool replayed)

### 13.4 Redaction Tests

8. **Bearer token redaction**
   - Log line: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0`
   - Verify backend receives: `Authorization: Bearer [REDACTED:TOKEN]`
   - Verify counter: `agent.logs.redaction_applied{pattern="bearer"}` incremented

9. **Password field redaction**
   - JSON log: `{"username": "alice", "password": "hunter2"}`
   - Verify backend receives: `{"username": "alice", "password": "[REDACTED]"}`
   - Verify counter: `agent.logs.redaction_applied{pattern="password_field"}` incremented

### 13.5 Backpressure Tests

10. **Backend unreachable for 60s**
    - Backend returns 503 for 60 seconds
    - Verify: Logs accumulate in spool (no data loss)
    - Verify: Metrics deliver normally (separate path)

11. **Backend rate limit (429)**
    - Backend returns 429 on log ingest
    - Verify: Exponential backoff (1s, 2s, 4s, 8s)
    - Verify: Metrics unaffected (separate rate limit)

### 13.6 Performance Tests

12. **Throughput benchmark**
    - Feed 100,000 lines to raw parser (no I/O)
    - Measure lines/sec on single core
    - Verify: greater than 30,000 lines/sec

13. **Memory footprint**
    - Tail 60,000 lines (1000 lines/sec for 60s)
    - Measure RSS memory increase
    - Verify: less than 120 MB

---

## 14. Implementation Phases

Log collection is split across two phases:

### Phase 3: Logs Backend (3 weeks)

- Backend route: `POST /api/v1/logs/ingest`
- Database schema: `logs` table (ClickHouse)
- Query API: `GET /api/v1/logs/query`
- Timeline: 2026-07-01 to 2026-07-22

### Phase 4: Logs Agent (3 weeks)

- File tailer implementation
- Parser modes (raw, JSON, regex)
- Multiline support
- Redaction engine
- Cursor persistence
- Rotation handling
- Timeline: 2026-07-22 to 2026-08-12

**This contract (AGENT-004) must be approved before Phase 3 backend work begins.**

---

## 15. Future Extensions (v2+)

The following are explicitly deferred to v2+ and must not appear in v1 implementation:

- journald integration (`sd_journal_*` API)
- Windows Event Log integration (`EvtQuery` API)
- Container stdout/stderr collection (Docker API)
- Kubernetes pod logs (`/var/log/pods/`)
- Syslog listeners (TCP/UDP ports, RFC 5424)
- CloudWatch Logs ingestion (AWS API)
- Azure Monitor Logs ingestion (Azure API)
- nginx/apache format presets
- Custom user-defined redaction patterns
- Log sampling (e.g., keep 1 in 10 DEBUG lines)
- Log aggregation (e.g., collapse repeated "connection refused" messages)

These require customer validation and soak testing on v1 before design.

---

## 16. References

| Document | Purpose |
|---|---|
| `correlation_contract.md` | Identity tag requirements (Section 2) |
| `execution_plan.md` | Log wire format envelope (Section 2.2) |
| `TICKETS.md` | AGENT-004 ticket definition (lines 451-528) |
| `PHASE_TRACKER.md` | Phase 3-4 timeline and dependencies |
| `internal/buffer/wal.go` | Metric WAL implementation (reference for persistence patterns) |
| `internal/identity/identity.go` | Identity.Tags() implementation |
| `internal/agent/agent.go` | Agent lifecycle and goroutine structure |

---

**End of Contract. Ready for implementation after approval.**
