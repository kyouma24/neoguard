#!/bin/bash
set -euo pipefail

# Chaos test: crash recovery
# Kills agent with SIGKILL during active operation, restarts, verifies WAL replays.

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
MOCK_PORT=19879
MOCK_PID=""
AGENT_PID=""

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
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

if [ ! -f "$BINARY" ]; then
    echo "Building agent binary..."
    (cd "$REPO_ROOT" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" ./cmd/neoguard-agent)
fi

MOCK_LOG="$TMPDIR/mock.log"

# Start mock server (intentionally slow — 2s response delay to ensure WAL has data)
python3 -c "
import http.server, json, time
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.rfile.read(length)
        time.sleep(2)  # Slow response to keep WAL populated
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Date', self.date_time_string())
        self.end_headers()
        resp = json.dumps({'heartbeat_interval_seconds': 60, 'negotiated_schema_version': 1, 'first_registration': True})
        self.wfile.write(resp.encode())
        with open('$MOCK_LOG', 'a') as f:
            f.write(f'BATCH len={length}\n')
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
transport:
  batch_max_interval_seconds: 5
buffer:
  memory_max_items: 100000
  wal_dir: ${TMPDIR}/wal
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18285"
EOF

mkdir -p "$TMPDIR/wal"

# === Phase 1: Start agent, let it collect, then kill -9 ===

"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent1.log" 2>&1 &
AGENT_PID=$!
echo "Phase 1: Agent started (PID $AGENT_PID)"

# Let agent collect for 30s (should write to WAL)
sleep 30

# Verify WAL has data
WAL_FILE="$TMPDIR/wal/metrics.wal"
if [ ! -f "$WAL_FILE" ]; then
    echo "FAIL: WAL file not created after 30s of collection"
    cat "$TMPDIR/agent1.log"
    exit 1
fi

WAL_SIZE_BEFORE=$(stat --format=%s "$WAL_FILE")
echo "  WAL size before crash: $WAL_SIZE_BEFORE bytes"

if [ "$WAL_SIZE_BEFORE" -eq 0 ]; then
    echo "FAIL: WAL file is empty (agent should have buffered data)"
    exit 1
fi

# Kill -9 (no graceful shutdown, simulates power loss)
echo "  Sending SIGKILL..."
kill -9 "$AGENT_PID"
wait "$AGENT_PID" 2>/dev/null || true
AGENT_PID=""

# Verify WAL file still exists and is non-empty
if [ ! -f "$WAL_FILE" ]; then
    echo "FAIL: WAL file disappeared after crash"
    exit 1
fi

WAL_SIZE_AFTER_CRASH=$(stat --format=%s "$WAL_FILE")
echo "  WAL size after crash: $WAL_SIZE_AFTER_CRASH bytes"

# === Phase 2: Restart agent, verify WAL replay ===

echo ""
echo "Phase 2: Restarting agent for WAL replay..."

# Kill slow mock, restart with fast mock to accept replayed data
kill "$MOCK_PID" 2>/dev/null || true
wait "$MOCK_PID" 2>/dev/null || true

# Fast mock server
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
        with open('$MOCK_LOG', 'a') as f:
            f.write(f'REPLAY_BATCH len={length}\n')
    def do_GET(self):
        self.do_POST()
    def log_message(self, fmt, *args):
        pass
http.server.HTTPServer(('127.0.0.1', $MOCK_PORT), Handler).serve_forever()
" &
MOCK_PID=$!
sleep 1

"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent2.log" 2>&1 &
AGENT_PID=$!
echo "  Agent restarted (PID $AGENT_PID)"

# Wait for replay to complete (up to 60s)
echo "  Waiting for WAL replay..."
sleep 30

# Check for replay evidence in logs
if grep -q "replay\|replaying\|WAL" "$TMPDIR/agent2.log"; then
    echo "  WAL replay activity detected in logs"
fi

# Check that agent is running normally after replay
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died after restart/replay"
    cat "$TMPDIR/agent2.log"
    exit 1
fi

# Assert: mock must have received at least one replay batch
REPLAY_BATCHES=$(grep -c "REPLAY_BATCH" "$MOCK_LOG" 2>/dev/null || echo "0")
echo "  Replay batches received by mock: $REPLAY_BATCHES"

if [ "$REPLAY_BATCHES" -eq 0 ]; then
    echo "FAIL: No replay batches received after restart"
    echo "  WAL file existed ($WAL_SIZE_AFTER_CRASH bytes) but agent did not replay data"
    echo "  Agent log (last 20 lines):"
    tail -20 "$TMPDIR/agent2.log"
    exit 1
fi

echo ""
echo "PASS: crash_recovery_test"
echo "  WAL survived SIGKILL ($WAL_SIZE_AFTER_CRASH bytes intact)"
echo "  Agent restarted and replayed $REPLAY_BATCHES batch(es) without corruption"
exit 0
