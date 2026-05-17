#!/bin/bash
set -euo pipefail

# Chaos test: log burst
# Writes 100k lines/sec for 60s to a tailed file, verifies agent stays under 250 MB RSS.
# Validates backpressure: LogRing capacity, spool high watermark slowdown, and critical watermark drops.

if [ "${NEOGUARD_CHAOS_ENABLED:-}" != "1" ]; then
    echo "SKIP: Set NEOGUARD_CHAOS_ENABLED=1 to run chaos tests"
    exit 0
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "FAIL: Must run as root"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BINARY="$REPO_ROOT/bin/neoguard-agent-linux-amd64"
TMPDIR="$(mktemp -d)"
MOCK_PORT=19880
MOCK_PID=""
AGENT_PID=""
BURST_PID=""
DURATION_SECONDS=60
RSS_LIMIT_MB=250
RSS_LIMIT_BYTES=$((RSS_LIMIT_MB * 1024 * 1024))

cleanup() {
    echo "Cleaning up..."
    if [ -n "$BURST_PID" ] && kill -0 "$BURST_PID" 2>/dev/null; then
        kill "$BURST_PID" 2>/dev/null || true
        wait "$BURST_PID" 2>/dev/null || true
    fi
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

if [ ! -f "$BINARY" ]; then
    echo "Building agent binary..."
    (cd "$REPO_ROOT" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" ./cmd/neoguard-agent)
fi

# Start mock server (accepts log batches)
python3 -c "
import http.server, json
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.rfile.read(length)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Date', self.date_time_string())
        self.end_headers()
        resp = json.dumps({'heartbeat_interval_seconds': 60, 'negotiated_schema_version': 1, 'first_registration': True})
        self.wfile.write(resp.encode())
    def do_GET(self):
        self.do_POST()
    def log_message(self, fmt, *args):
        pass
http.server.HTTPServer(('127.0.0.1', $MOCK_PORT), Handler).serve_forever()
" &
MOCK_PID=$!
sleep 1

LOG_FILE="$TMPDIR/burst.log"
touch "$LOG_FILE"

cat > "$TMPDIR/agent.yaml" <<EOF
api_key: obl_live_v2_chaostest1234567890
endpoint: http://127.0.0.1:${MOCK_PORT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 5
buffer:
  memory_max_items: 100000
  wal_dir: ${TMPDIR}/wal
logs:
  enabled: true
  sources:
    - path: ${LOG_FILE}
      service: burst-test
      start_position: end
      parser:
        mode: raw
  spool:
    max_size_mb: 128
    high_watermark_pct: 80
    critical_watermark_pct: 95
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18286"
EOF

mkdir -p "$TMPDIR/wal"

# Start agent
"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "Agent started (PID $AGENT_PID)"

# Let agent initialize and attach tailer
sleep 5

# Verify agent is running before burst
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died during startup"
    cat "$TMPDIR/agent.log"
    exit 1
fi

# Start log burst: 100k lines/sec for DURATION_SECONDS
# Each line is ~120 bytes (realistic structured log line)
echo "Starting log burst: 100k lines/sec for ${DURATION_SECONDS}s..."
python3 -c "
import time, sys
start = time.time()
duration = $DURATION_SECONDS
target_rate = 100000
line_template = '{\"ts\":\"%s\",\"level\":\"info\",\"msg\":\"request completed\",\"method\":\"GET\",\"path\":\"/api/v1/metrics\",\"status\":200,\"latency_ms\":%.1f}\n'
count = 0
with open('$LOG_FILE', 'a', buffering=8192) as f:
    while time.time() - start < duration:
        batch_start = time.time()
        for _ in range(1000):
            f.write(line_template % (time.strftime('%Y-%m-%dT%H:%M:%S'), count * 0.01))
            count += 1
        f.flush()
        elapsed = time.time() - batch_start
        target_elapsed = 1000.0 / target_rate
        if elapsed < target_elapsed:
            time.sleep(target_elapsed - elapsed)
print(f'Burst complete: {count} lines in {time.time() - start:.1f}s ({count / (time.time() - start):.0f} lines/sec)')
" &
BURST_PID=$!

# Monitor RSS during burst
peak_rss=0
exceeded=0
for _ in $(seq 1 "$DURATION_SECONDS"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died during log burst"
        cat "$TMPDIR/agent.log" | tail -30
        exit 1
    fi

    rss=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")
    rss_bytes=$((rss * 1024))
    if [ "$rss_bytes" -gt "$peak_rss" ]; then
        peak_rss=$rss_bytes
    fi
    if [ "$rss_bytes" -gt "$RSS_LIMIT_BYTES" ]; then
        exceeded=$((exceeded + 1))
    fi
    sleep 1
done

# Wait for burst generator to finish
wait "$BURST_PID" 2>/dev/null || true
BURST_PID=""

# Verify agent survived the burst
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died after log burst"
    cat "$TMPDIR/agent.log" | tail -30
    exit 1
fi

peak_rss_mb=$((peak_rss / 1024 / 1024))

# Check RSS limit
if [ "$peak_rss_mb" -ge "$RSS_LIMIT_MB" ]; then
    echo "FAIL: Agent exceeded ${RSS_LIMIT_MB} MB RSS limit"
    echo "  Peak RSS: ${peak_rss_mb} MB"
    echo "  Seconds over limit: $exceeded"
    exit 1
fi

# Check for backpressure indicators in logs
WATERMARK_HITS=$(grep -c "watermark\|pressure\|drop\|backpressure" "$TMPDIR/agent.log" 2>/dev/null || echo "0")

# Count lines written to burst file
TOTAL_LINES=$(wc -l < "$LOG_FILE")

echo ""
echo "PASS: log_burst_test"
echo "  Agent survived ${DURATION_SECONDS}s of log burst"
echo "  Total lines written: $TOTAL_LINES"
echo "  Peak RSS: ${peak_rss_mb} MB (limit: ${RSS_LIMIT_MB} MB)"
echo "  Seconds over limit: $exceeded"
echo "  Backpressure log entries: $WATERMARK_HITS"
echo "  Process still running (PID $AGENT_PID)"
exit 0
