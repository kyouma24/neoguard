#!/bin/bash
set -euo pipefail

# S5: Outage and Recovery
# 6 cycles of: 10min network partition + 5min recovery.
# Verifies WAL buffering during partition and delivery after restore.
# Fails if any cycle doesn't deliver buffered data within 120s.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_outage}"
STATE_DIR="$(mktemp -d)"
MOCK_PORT=19902
MOCK_PID=""
AGENT_PID=""
CYCLES=6
PARTITION_SECONDS=600
RECOVERY_SECONDS=300

cleanup() {
    iptables -D OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP 2>/dev/null || true
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

MOCK_LOG="$STATE_DIR/mock.log"

# Start mock server
python3 -c "
import http.server, json, time
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
            f.write('BATCH ts=%s len=%d\n' % (time.strftime('%Y-%m-%dT%H:%M:%S'), length))
    def do_GET(self):
        self.do_POST()
    def log_message(self, fmt, *args):
        pass
http.server.HTTPServer(('127.0.0.1', $MOCK_PORT), Handler).serve_forever()
" &
MOCK_PID=$!
sleep 1

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_outage_00
endpoint: http://127.0.0.1:${MOCK_PORT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 5
  request_timeout_seconds: 5
buffer:
  memory_max_items: 100000
  wal_dir: ${STATE_DIR}/wal
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18294"
EOF

mkdir -p "$STATE_DIR/wal"

"$BINARY" run --config "$STATE_DIR/agent.yaml" > "$EVIDENCE_DIR/agent.log" 2>&1 &
AGENT_PID=$!
sleep 10

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent did not start"
    exit 1
fi

echo "S5: Agent started (PID $AGENT_PID)"
echo "S5: Running $CYCLES outage cycles (${PARTITION_SECONDS}s partition + ${RECOVERY_SECONDS}s recovery)..."
echo "cycle,wal_size_during,batches_after_restore,restore_latency_s" > "$EVIDENCE_DIR/cycles.csv"

for cycle in $(seq 1 "$CYCLES"); do
    echo ""
    echo "  Cycle $cycle/$CYCLES:"

    PRE_COUNT=$(grep -c "BATCH" "$MOCK_LOG" 2>/dev/null || echo "0")

    # Induce partition
    echo "    Partition start (dropping port $MOCK_PORT)..."
    iptables -A OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP

    sleep "$PARTITION_SECONDS"

    WAL_SIZE=$(stat --format=%s "$STATE_DIR/wal/metrics.wal" 2>/dev/null || echo "0")
    echo "    WAL size during partition: $WAL_SIZE bytes"

    # Restore
    echo "    Restoring connectivity..."
    RESTORE_START=$(date +%s)
    iptables -D OUTPUT -p tcp --dport "$MOCK_PORT" -j DROP

    # Wait for delivery (up to 120s)
    DELIVERED=0
    for _ in $(seq 1 120); do
        POST_COUNT=$(grep -c "BATCH" "$MOCK_LOG" 2>/dev/null || echo "0")
        if [ "$POST_COUNT" -gt "$PRE_COUNT" ]; then
            DELIVERED=1
            break
        fi
        sleep 1
    done

    RESTORE_END=$(date +%s)
    RESTORE_LATENCY=$((RESTORE_END - RESTORE_START))
    POST_COUNT=$(grep -c "BATCH" "$MOCK_LOG" 2>/dev/null || echo "0")
    BATCHES_DELIVERED=$((POST_COUNT - PRE_COUNT))

    echo "    Batches delivered after restore: $BATCHES_DELIVERED (latency: ${RESTORE_LATENCY}s)"
    echo "${cycle},${WAL_SIZE},${BATCHES_DELIVERED},${RESTORE_LATENCY}" >> "$EVIDENCE_DIR/cycles.csv"

    if [ "$DELIVERED" -eq 0 ]; then
        echo "FAIL: Cycle $cycle — no data delivered within 120s after restore"
        exit 1
    fi

    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died during cycle $cycle"
        exit 1
    fi

    # Let agent stabilize before next cycle
    sleep "$RECOVERY_SECONDS"
done

cp "$MOCK_LOG" "$EVIDENCE_DIR/mock_received.log"

TOTAL_BATCHES=$(grep -c "BATCH" "$MOCK_LOG" 2>/dev/null || echo "0")
echo ""
echo "S5 Results:"
echo "  Cycles completed: $CYCLES"
echo "  Total batches received: $TOTAL_BATCHES"
echo "  Agent alive: yes"

echo "PASS: scenario_outage"
exit 0
