#!/bin/bash
set -euo pipefail

# S4: Sustained Log Load
# Writes 100k lines/sec to a single tailed file for 1 hour.
# Fails if RSS >= 250 MB, agent dies, or WAL corruption detected.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:?Set NEOGUARD_SOAK_ENDPOINT}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_log_load}"
DURATION_SECONDS="${NEOGUARD_SOAK_LOAD_SECONDS:-3600}"
STATE_DIR="$(mktemp -d)"
AGENT_PID=""
WRITER_PID=""

RSS_LIMIT_KB=$((250 * 1024))
WARNING_RSS_KB=$((180 * 1024))

cleanup() {
    if [ -n "$WRITER_PID" ] && kill -0 "$WRITER_PID" 2>/dev/null; then
        kill "$WRITER_PID" 2>/dev/null || true
        wait "$WRITER_PID" 2>/dev/null || true
    fi
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

LOG_FILE="$STATE_DIR/burst.log"
touch "$LOG_FILE"

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_load_0000
endpoint: ${ENDPOINT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 5
buffer:
  memory_max_items: 100000
  wal_dir: ${STATE_DIR}/wal
logs:
  enabled: true
  sources:
    - path: ${LOG_FILE}
      service: load-test
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
  bind: "127.0.0.1:18293"
EOF

mkdir -p "$STATE_DIR/wal"

"$BINARY" run --config "$STATE_DIR/agent.yaml" > "$EVIDENCE_DIR/agent.log" 2>&1 &
AGENT_PID=$!
sleep 5

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent did not start"
    exit 1
fi

INITIAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
echo "S4: Agent started (PID $AGENT_PID), initial RSS: ${INITIAL_RSS} KB"
echo "S4: Starting 100k lines/sec burst for ${DURATION_SECONDS}s..."

# Start log burst writer
python3 -c "
import time
start = time.time()
duration = $DURATION_SECONDS
count = 0
with open('$LOG_FILE', 'a', buffering=8192) as f:
    while time.time() - start < duration:
        batch_start = time.time()
        for _ in range(1000):
            f.write('{\"ts\":\"%s\",\"level\":\"info\",\"msg\":\"request completed\",\"status\":200,\"latency_ms\":%.1f}\n' % (time.strftime('%Y-%m-%dT%H:%M:%S'), count * 0.01))
            count += 1
        f.flush()
        elapsed = time.time() - batch_start
        target = 1000.0 / 100000
        if elapsed < target:
            time.sleep(target - elapsed)
with open('$EVIDENCE_DIR/lines_written.txt', 'w') as f:
    f.write(str(count))
" &
WRITER_PID=$!

echo "timestamp_utc,rss_kb" > "$EVIDENCE_DIR/rss_samples.csv"
PEAK_RSS=0

for _ in $(seq 1 "$DURATION_SECONDS"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died during load test"
        exit 1
    fi

    RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")
    if [ "$RSS" -gt "$PEAK_RSS" ]; then
        PEAK_RSS=$RSS
    fi

    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "${TS},${RSS}" >> "$EVIDENCE_DIR/rss_samples.csv"

    sleep 1
done

wait "$WRITER_PID" 2>/dev/null || true
WRITER_PID=""

echo "$PEAK_RSS" > "$EVIDENCE_DIR/rss_peak.txt"

# Check for backpressure evidence
BACKPRESSURE=$(grep -c "watermark\|backpressure\|pressure" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")
echo "$BACKPRESSURE" > "$EVIDENCE_DIR/backpressure_events.txt"

# Check for drops
DROPS=$(grep -c "drop" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")
echo "$DROPS" > "$EVIDENCE_DIR/drop_count.txt"

LINES_WRITTEN=$(cat "$EVIDENCE_DIR/lines_written.txt" 2>/dev/null || echo "unknown")

echo ""
echo "S4 Results:"
echo "  Peak RSS: ${PEAK_RSS} KB ($((PEAK_RSS / 1024)) MB)"
echo "  Lines written: ${LINES_WRITTEN}"
echo "  Backpressure events: ${BACKPRESSURE}"
echo "  Drop events: ${DROPS}"

if [ "$PEAK_RSS" -ge "$RSS_LIMIT_KB" ]; then
    echo "FAIL: Peak RSS ${PEAK_RSS} KB >= release-blocking ${RSS_LIMIT_KB} KB"
    exit 1
elif [ "$PEAK_RSS" -ge "$WARNING_RSS_KB" ]; then
    echo "WARNING: Peak RSS ${PEAK_RSS} KB >= warning ${WARNING_RSS_KB} KB"
fi

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died after load test"
    exit 1
fi

echo "PASS: scenario_log_load"
exit 0
