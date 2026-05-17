#!/bin/bash
set -euo pipefail

# S3: 24h Logs-Enabled Steady State
# Agent tailing 3 log files at ~1000 lines/sec total (sustained by Python writers).
# Fails if RSS growth >= 20 MB, drops > 100, spool >= 100 MB, or pipeline errors in log.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:?Set NEOGUARD_SOAK_ENDPOINT}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_logs}"
DURATION_MINUTES="${NEOGUARD_SOAK_LOGS_MINUTES:-1440}"
STATE_DIR="$(mktemp -d)"
AGENT_PID=""
WRITER_PIDS=()

RELEASE_BLOCKING_RSS_GROWTH_KB=$((20 * 1024))
WARNING_RSS_GROWTH_KB=$((8 * 1024))
MAX_DROPS=100
MAX_SPOOL_BYTES=$((100 * 1024 * 1024))

cleanup() {
    for pid in "${WRITER_PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

LOG_DIR="$STATE_DIR/app_logs"
mkdir -p "$LOG_DIR"

# Start 3 log writers (~333 lines/sec each = ~1000 total)
for idx in 1 2 3; do
    LOG_FILE="$LOG_DIR/app${idx}.log"
    touch "$LOG_FILE"
    python3 -c "
import time
count = 0
with open('$LOG_FILE', 'a', buffering=4096) as f:
    while True:
        f.write('{\"ts\":\"%s\",\"level\":\"info\",\"svc\":\"app${idx}\",\"msg\":\"request %d\"}\n' % (time.strftime('%Y-%m-%dT%H:%M:%S'), count))
        count += 1
        if count % 333 == 0:
            f.flush()
            time.sleep(1)
" &
    WRITER_PIDS+=($!)
done

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_logs_0000
endpoint: ${ENDPOINT}
cloud_detection: skip
collection:
  interval_seconds: 10
transport:
  batch_max_interval_seconds: 15
buffer:
  memory_max_items: 50000
  wal_dir: ${STATE_DIR}/wal
logs:
  enabled: true
  sources:
    - path: ${LOG_DIR}/app1.log
      service: app1
      start_position: end
      parser:
        mode: json
    - path: ${LOG_DIR}/app2.log
      service: app2
      start_position: end
      parser:
        mode: json
    - path: ${LOG_DIR}/app3.log
      service: app3
      start_position: end
      parser:
        mode: json
  spool:
    max_size_mb: 128
    high_watermark_pct: 80
    critical_watermark_pct: 95
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18292"
EOF

mkdir -p "$STATE_DIR/wal"

"$BINARY" run --config "$STATE_DIR/agent.yaml" > "$EVIDENCE_DIR/agent.log" 2>&1 &
AGENT_PID=$!
sleep 5

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent did not start"
    exit 1
fi

echo "timestamp_utc,rss_kb" > "$EVIDENCE_DIR/rss_samples.csv"
echo "timestamp_utc,lines_read,lines_shipped,drops,spool_bytes" > "$EVIDENCE_DIR/log_pipeline.csv"

INITIAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
echo "S3: Agent started (PID $AGENT_PID), initial RSS: ${INITIAL_RSS} KB"
echo "S3: 3 log writers (~1000 lines/sec total), sampling for ${DURATION_MINUTES} minutes..."

for i in $(seq 1 "$DURATION_MINUTES"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died at minute $i"
        exit 1
    fi

    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")

    # Extract log pipeline stats from agent log (last occurrence)
    LINES_READ=$(grep -c "lines_read\|log.*read" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")
    DROPS=$(grep -c "drop\|critical.*watermark" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")
    SPOOL_SIZE=$(du -sb "$STATE_DIR/wal/" 2>/dev/null | awk '{print $1}' || echo "0")

    echo "${TS},${RSS}" >> "$EVIDENCE_DIR/rss_samples.csv"
    echo "${TS},${LINES_READ},0,${DROPS},${SPOOL_SIZE}" >> "$EVIDENCE_DIR/log_pipeline.csv"

    sleep 60
done

FINAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
RSS_GROWTH=$((FINAL_RSS - INITIAL_RSS))

TOTAL_DROPS=$(grep -c "drop\|critical.*watermark" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")
FINAL_SPOOL=$(du -sb "$STATE_DIR/wal/" 2>/dev/null | awk '{print $1}' || echo "0")

# Check for pipeline errors
PIPELINE_ERRORS=$(grep -c "log.*error\|pipeline.*error\|spool.*error" "$EVIDENCE_DIR/agent.log" 2>/dev/null || echo "0")

echo ""
echo "S3 Results:"
echo "  RSS growth: ${RSS_GROWTH} KB"
echo "  Total drops: ${TOTAL_DROPS}"
echo "  Final spool size: ${FINAL_SPOOL} bytes"
echo "  Pipeline errors: ${PIPELINE_ERRORS}"

FAILED=0

if [ "$RSS_GROWTH" -ge "$RELEASE_BLOCKING_RSS_GROWTH_KB" ]; then
    echo "FAIL: RSS growth ${RSS_GROWTH} KB >= ${RELEASE_BLOCKING_RSS_GROWTH_KB} KB"
    FAILED=1
elif [ "$RSS_GROWTH" -ge "$WARNING_RSS_GROWTH_KB" ]; then
    echo "WARNING: RSS growth ${RSS_GROWTH} KB >= ${WARNING_RSS_GROWTH_KB} KB"
fi

if [ "$TOTAL_DROPS" -gt "$MAX_DROPS" ]; then
    echo "FAIL: Drops ${TOTAL_DROPS} > ${MAX_DROPS}"
    FAILED=1
fi

if [ "$FINAL_SPOOL" -ge "$MAX_SPOOL_BYTES" ]; then
    echo "FAIL: Spool ${FINAL_SPOOL} >= ${MAX_SPOOL_BYTES}"
    FAILED=1
fi

if [ "$PIPELINE_ERRORS" -gt 0 ]; then
    echo "FAIL: Log pipeline errors detected (${PIPELINE_ERRORS})"
    FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
    exit 1
fi

echo "PASS: scenario_logs"
exit 0
