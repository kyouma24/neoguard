#!/bin/bash
set -euo pipefail

# Chaos test: disk full
# Mounts a tiny tmpfs for WAL, fills it, verifies agent doesn't crash
# and falls back to memory-only buffering.

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
MOCK_PORT=19877
MOCK_PID=""
AGENT_PID=""
WAL_MOUNT="$TMPDIR/wal"

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
    umount "$WAL_MOUNT" 2>/dev/null || true
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

if [ ! -f "$BINARY" ]; then
    echo "Building agent binary..."
    (cd "$REPO_ROOT" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" ./cmd/neoguard-agent)
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

# Create a tiny tmpfs for the WAL (1 MB — will fill quickly)
mkdir -p "$WAL_MOUNT"
mount -t tmpfs -o size=1m tmpfs "$WAL_MOUNT"

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
  wal_dir: ${WAL_MOUNT}
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18283"
EOF

# Start agent
"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "Agent started (PID $AGENT_PID)"

# Wait for agent to start collecting
sleep 15

# Fill the tmpfs to trigger disk full
echo "Filling WAL tmpfs to capacity..."
dd if=/dev/zero of="$WAL_MOUNT/filler" bs=1024 count=1024 2>/dev/null || true

# Let agent run under disk pressure for 60s
echo "Running under disk full conditions for 60s..."
sleep 60

# Verify agent is still alive
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent crashed under disk full condition"
    cat "$TMPDIR/agent.log"
    exit 1
fi

# Assert: agent must have logged WAL write failure and switched to memory-only mode.
# This is the deterministic backpressure evidence: wal.go:309 emits this on disk I/O failure.
if ! grep -q "WAL write failed, continuing memory-only" "$TMPDIR/agent.log"; then
    echo "FAIL: Agent did not emit WAL write failure message under disk full"
    echo "  Expected: 'WAL write failed, continuing memory-only' in agent log"
    echo "  This means the agent either never tried to write WAL or the disk was not actually full"
    tail -20 "$TMPDIR/agent.log"
    exit 1
fi
echo "  WAL write failure detected (agent switched to memory-only mode)"

# Check agent is still sending metrics (health endpoint)
if curl -sf http://127.0.0.1:18283/health > /dev/null 2>&1; then
    echo "  Health endpoint responsive"
else
    echo "  WARNING: Health endpoint not responding (agent may be degraded but alive)"
fi

echo ""
echo "PASS: disk_full_test"
echo "  Agent survived 60s with WAL filesystem full"
echo "  Agent detected disk failure and fell back to memory-only buffering"
echo "  Process still running (PID $AGENT_PID)"
exit 0
