#!/bin/bash
set -euo pipefail

# Chaos test: network partition
# Drops all egress traffic for 5 minutes via iptables, then restores.
# Verifies agent buffers data in WAL and delivers after connectivity returns.

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
MOCK_PORT=19876
MOCK_PID=""
AGENT_PID=""
PARTITION_SECONDS="${NEOGUARD_CHAOS_PARTITION_SECS:-300}"

cleanup() {
    echo "Cleaning up..."
    # Remove iptables rule (idempotent)
    iptables -D OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP 2>/dev/null || true
    # Kill agent
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    # Kill mock server
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    rm -rf "$TMPDIR"
}
trap cleanup EXIT

# Build binary if not present
if [ ! -f "$BINARY" ]; then
    echo "Building agent binary..."
    (cd "$REPO_ROOT" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -o "$BINARY" ./cmd/neoguard-agent)
fi

# Start a minimal HTTP mock server that logs received batches
MOCK_LOG="$TMPDIR/mock.log"
python3 -c "
import http.server, json, sys, os
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        with open('$MOCK_LOG', 'a') as f:
            f.write(f'BATCH len={length} path={self.path}\n')
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

# Create config pointing to mock server
cat > "$TMPDIR/agent.yaml" <<EOF
api_key: obl_live_v2_chaostest1234567890
endpoint: http://127.0.0.1:${MOCK_PORT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 5
  request_timeout_seconds: 5
buffer:
  memory_max_items: 100000
  wal_dir: ${TMPDIR}/wal
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18282"
EOF

mkdir -p "$TMPDIR/wal"

# Start agent
"$BINARY" run --config "$TMPDIR/agent.yaml" > "$TMPDIR/agent.log" 2>&1 &
AGENT_PID=$!
echo "Agent started (PID $AGENT_PID)"

# Wait for first successful batch
echo "Waiting for agent to send first batch..."
for _ in $(seq 1 30); do
    if [ -f "$MOCK_LOG" ] && grep -q "BATCH" "$MOCK_LOG"; then
        break
    fi
    sleep 1
done

if ! grep -q "BATCH" "$MOCK_LOG" 2>/dev/null; then
    echo "FAIL: Agent did not send any batch within 30s"
    cat "$TMPDIR/agent.log"
    exit 1
fi

PRE_PARTITION_COUNT=$(grep -c "BATCH" "$MOCK_LOG")
echo "Pre-partition batches: $PRE_PARTITION_COUNT"

# Induce network partition
echo "Inducing network partition (dropping port $MOCK_PORT for ${PARTITION_SECONDS}s)..."
iptables -A OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP

sleep "$PARTITION_SECONDS"

# Check WAL grew during partition
WAL_SIZE=$(stat --format=%s "$TMPDIR/wal/metrics.wal" 2>/dev/null || echo "0")
echo "WAL size during partition: $WAL_SIZE bytes"

if [ "$WAL_SIZE" -eq 0 ]; then
    echo "FAIL: WAL did not grow during partition (expected buffered data)"
    exit 1
fi

# Restore connectivity
echo "Restoring connectivity..."
iptables -D OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP

# Wait for agent to deliver buffered data
echo "Waiting for post-partition delivery (up to 120s)..."
for _ in $(seq 1 120); do
    POST_COUNT=$(grep -c "BATCH" "$MOCK_LOG")
    if [ "$POST_COUNT" -gt "$PRE_PARTITION_COUNT" ]; then
        break
    fi
    sleep 1
done

POST_COUNT=$(grep -c "BATCH" "$MOCK_LOG")
echo "Post-partition batches: $POST_COUNT (was: $PRE_PARTITION_COUNT)"

if [ "$POST_COUNT" -le "$PRE_PARTITION_COUNT" ]; then
    echo "FAIL: Agent did not deliver buffered data after partition restored"
    tail -20 "$TMPDIR/agent.log"
    exit 1
fi

# Verify agent is still running
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died during test"
    exit 1
fi

echo ""
echo "PASS: network_partition_test"
echo "  Pre-partition batches: $PRE_PARTITION_COUNT"
echo "  Post-partition batches: $POST_COUNT"
echo "  WAL buffered: $WAL_SIZE bytes during ${PARTITION_SECONDS}s partition"
exit 0
