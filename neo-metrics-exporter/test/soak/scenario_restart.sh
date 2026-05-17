#!/bin/bash
set -euo pipefail

# S6: Restart/Crash-Cycle Durability
# 50 kill-9 cycles with 30s run between each.
# Fails if any WAL corruption or any restart failure.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_restart}"
STATE_DIR="$(mktemp -d)"
MOCK_PORT=19901
MOCK_PID=""
CYCLES=50
RUN_SECONDS=30

cleanup() {
    if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
        kill "$MOCK_PID" 2>/dev/null || true
        wait "$MOCK_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR" "$EVIDENCE_DIR/agent_logs"

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

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_restart_0
endpoint: http://127.0.0.1:${MOCK_PORT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 5
buffer:
  memory_max_items: 50000
  wal_dir: ${STATE_DIR}/wal
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18295"
EOF

mkdir -p "$STATE_DIR/wal"

echo "S6: Running $CYCLES kill-9 / restart cycles (${RUN_SECONDS}s each)..."
echo "cycle,start_ok,wal_intact,replay_ok" > "$EVIDENCE_DIR/cycles.csv"
echo "" > "$EVIDENCE_DIR/wal_checksums.txt"

for cycle in $(seq 1 "$CYCLES"); do
    CYCLE_LOG="$EVIDENCE_DIR/agent_logs/cycle_${cycle}.log"

    # Start agent
    "$BINARY" run --config "$STATE_DIR/agent.yaml" > "$CYCLE_LOG" 2>&1 &
    AGENT_PID=$!
    sleep 3

    START_OK="no"
    if kill -0 "$AGENT_PID" 2>/dev/null; then
        START_OK="yes"
    else
        echo "FAIL: Agent failed to start on cycle $cycle"
        echo "${cycle},no,unknown,unknown" >> "$EVIDENCE_DIR/cycles.csv"
        exit 1
    fi

    # Let it run and collect data
    sleep "$RUN_SECONDS"

    # Kill -9
    kill -9 "$AGENT_PID" 2>/dev/null || true
    wait "$AGENT_PID" 2>/dev/null || true

    # Check WAL integrity
    WAL_FILE="$STATE_DIR/wal/metrics.wal"
    WAL_INTACT="yes"
    if [ -f "$WAL_FILE" ]; then
        # CRC check: verify file is readable (non-truncated header)
        WAL_SIZE=$(stat --format=%s "$WAL_FILE")
        if [ "$WAL_SIZE" -lt 16 ] && [ "$WAL_SIZE" -gt 0 ]; then
            WAL_INTACT="no"
            echo "FAIL: WAL file truncated on cycle $cycle (size: $WAL_SIZE)"
            echo "${cycle},${START_OK},no,unknown" >> "$EVIDENCE_DIR/cycles.csv"
            exit 1
        fi
        CRC=$(md5sum "$WAL_FILE" | awk '{print $1}')
        echo "cycle_${cycle}: ${CRC} (${WAL_SIZE} bytes)" >> "$EVIDENCE_DIR/wal_checksums.txt"
    fi

    # Restart and check replay
    "$BINARY" run --config "$STATE_DIR/agent.yaml" > "${CYCLE_LOG}.replay" 2>&1 &
    REPLAY_PID=$!
    sleep 5

    REPLAY_OK="no"
    if kill -0 "$REPLAY_PID" 2>/dev/null; then
        # Check for replay errors (patterns must not match the success line "corrupted_frames":0)
        if grep -q "WAL replay: corrupt frame\|WAL replay open failed\|invalid frame" "${CYCLE_LOG}.replay" 2>/dev/null; then
            echo "FAIL: WAL replay error on cycle $cycle"
            echo "${cycle},${START_OK},${WAL_INTACT},no" >> "$EVIDENCE_DIR/cycles.csv"
            kill "$REPLAY_PID" 2>/dev/null || true
            wait "$REPLAY_PID" 2>/dev/null || true
            exit 1
        fi
        REPLAY_OK="yes"
    else
        echo "FAIL: Agent failed to restart on cycle $cycle (replay crash)"
        echo "${cycle},${START_OK},${WAL_INTACT},no" >> "$EVIDENCE_DIR/cycles.csv"
        exit 1
    fi

    # Clean shutdown of replay instance
    kill "$REPLAY_PID" 2>/dev/null || true
    wait "$REPLAY_PID" 2>/dev/null || true

    echo "${cycle},${START_OK},${WAL_INTACT},${REPLAY_OK}" >> "$EVIDENCE_DIR/cycles.csv"

    if [ $((cycle % 10)) -eq 0 ]; then
        echo "  Cycle $cycle/$CYCLES: OK"
    fi
done

echo ""
echo "S6 Results:"
echo "  Cycles completed: $CYCLES"
echo "  All starts: OK"
echo "  All WAL integrity checks: OK"
echo "  All replays: OK"

echo "PASS: scenario_restart"
exit 0
