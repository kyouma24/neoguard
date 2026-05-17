#!/bin/bash
set -euo pipefail

# Chaos test: memory pressure via cgroup
# Limits agent to 80 MB via cgroup v2, verifies it stays under or sheds load.

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
MOCK_PORT=19878
MOCK_PID=""
AGENT_PID=""
MEMORY_LIMIT_MB=80
MEMORY_LIMIT_BYTES=$((MEMORY_LIMIT_MB * 1024 * 1024))
CGROUP_PATH="/sys/fs/cgroup/neoguard-chaos-oom"
DURATION_SECONDS=60

cleanup() {
    echo "Cleaning up..."
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    # Remove cgroup
    if [ -d "$CGROUP_PATH" ]; then
        rmdir "$CGROUP_PATH" 2>/dev/null || true
    fi
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

if [ ! -f "$BINARY" ]; then
    echo "Building agent binary..."
    (cd "$REPO_ROOT" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" ./cmd/neoguard-agent)
fi

# Verify cgroup v2 is available
if [ ! -f /sys/fs/cgroup/cgroup.controllers ]; then
    echo "SKIP: cgroup v2 not available (required for memory limit)"
    exit 0
fi

# Start mock server
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

cat > "$TMPDIR/agent.yaml" <<EOF
api_key: obl_live_v2_chaostest1234567890
endpoint: http://127.0.0.1:${MOCK_PORT}
cloud_detection: skip
collection:
  interval_seconds: 10
buffer:
  memory_max_items: 100000
  wal_dir: ${TMPDIR}/wal
memory:
  soft_limit_mb: 64
  hard_limit_mb: 80
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18284"
EOF

mkdir -p "$TMPDIR/wal"

# Create cgroup with memory limit
mkdir -p "$CGROUP_PATH"
echo "$MEMORY_LIMIT_BYTES" > "$CGROUP_PATH/memory.max"

# Start agent inside the cgroup
echo $$ > "$CGROUP_PATH/cgroup.procs"
"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent.log" 2>&1 &
AGENT_PID=$!
# Move self back out of cgroup
echo $$ > /sys/fs/cgroup/cgroup.procs 2>/dev/null || true

echo "Agent started (PID $AGENT_PID) with ${MEMORY_LIMIT_MB}MB cgroup limit"
echo "Running for ${DURATION_SECONDS}s under memory pressure..."

# Monitor RSS over the duration
peak_rss=0
for _ in $(seq 1 "$DURATION_SECONDS"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent was OOM-killed during test"
        if [ -f "$CGROUP_PATH/memory.events" ]; then
            echo "  cgroup memory.events:"
            cat "$CGROUP_PATH/memory.events"
        fi
        cat "$TMPDIR/agent.log" | tail -20
        exit 1
    fi

    rss=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")
    rss_bytes=$((rss * 1024))
    if [ "$rss_bytes" -gt "$peak_rss" ]; then
        peak_rss=$rss_bytes
    fi
    sleep 1
done

# Verify agent survived
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died during memory pressure test"
    exit 1
fi

peak_rss_mb=$((peak_rss / 1024 / 1024))
echo ""
echo "PASS: oom_test"
echo "  Agent survived ${DURATION_SECONDS}s under ${MEMORY_LIMIT_MB}MB cgroup limit"
echo "  Peak RSS: ${peak_rss_mb} MB"
echo "  Process still running (PID $AGENT_PID)"
exit 0
