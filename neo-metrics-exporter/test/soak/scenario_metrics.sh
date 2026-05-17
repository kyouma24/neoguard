#!/bin/bash
set -euo pipefail

# S2: 24h Metrics-Only Steady State
# Agent collecting system metrics with synthetic process load (100 sleep processes).
# Fails if RSS growth >= 15 MB, send_errors >= 5, WAL >= 50 MB, or collection gap > 60s.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:?Set NEOGUARD_SOAK_ENDPOINT}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_metrics}"
DURATION_MINUTES="${NEOGUARD_SOAK_METRICS_MINUTES:-1440}"
STATE_DIR="$(mktemp -d)"
AGENT_PID=""
LOAD_PIDS=()

RELEASE_BLOCKING_RSS_GROWTH_KB=$((15 * 1024))
WARNING_RSS_GROWTH_KB=$((5 * 1024))
MAX_SEND_ERRORS=5
MAX_WAL_BYTES=$((50 * 1024 * 1024))

cleanup() {
    for pid in "${LOAD_PIDS[@]}"; do
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

# Spawn 100 sleep processes as synthetic load
for _ in $(seq 1 100); do
    sleep 86400 &
    LOAD_PIDS+=($!)
done

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_metrics_00
endpoint: ${ENDPOINT}
cloud_detection: skip
collection:
  interval_seconds: 10
process:
  enabled: true
  cmdline: false
transport:
  batch_max_interval_seconds: 15
buffer:
  memory_max_items: 50000
  wal_dir: ${STATE_DIR}/wal
logging:
  level: info
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18291"
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
echo "timestamp_utc,points_collected" > "$EVIDENCE_DIR/points_collected.csv"
echo "timestamp_utc,send_errors" > "$EVIDENCE_DIR/send_errors.csv"
echo "timestamp_utc,wal_bytes" > "$EVIDENCE_DIR/wal_size.csv"

INITIAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
echo "S2: Agent started (PID $AGENT_PID), initial RSS: ${INITIAL_RSS} KB"
echo "S2: 100 synthetic processes running, sampling for ${DURATION_MINUTES} minutes..."

LAST_COLLECTION_TS=$(date +%s)

for i in $(seq 1 "$DURATION_MINUTES"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died at minute $i"
        exit 1
    fi

    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")

    # Query /status endpoint for counters
    STATUS_JSON=$(curl -sf http://127.0.0.1:18291/status 2>/dev/null || echo "{}")
    POINTS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('points_collected',0))" 2>/dev/null || echo "0")
    ERRORS=$(echo "$STATUS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('send_errors',0))" 2>/dev/null || echo "0")

    WAL_SIZE=$(stat --format=%s "$STATE_DIR/wal/metrics.wal" 2>/dev/null || echo "0")

    echo "${TS},${RSS}" >> "$EVIDENCE_DIR/rss_samples.csv"
    echo "${TS},${POINTS}" >> "$EVIDENCE_DIR/points_collected.csv"
    echo "${TS},${ERRORS}" >> "$EVIDENCE_DIR/send_errors.csv"
    echo "${TS},${WAL_SIZE}" >> "$EVIDENCE_DIR/wal_size.csv"

    # Check collection cadence (points should increase each minute)
    if [ "$i" -gt 5 ] && [ "$POINTS" = "0" ]; then
        NOW=$(date +%s)
        GAP=$((NOW - LAST_COLLECTION_TS))
        if [ "$GAP" -gt 60 ]; then
            echo "FAIL: Collection gap > 60s detected at minute $i"
            exit 1
        fi
    fi
    if [ "$POINTS" != "0" ]; then
        LAST_COLLECTION_TS=$(date +%s)
    fi

    sleep 60
done

FINAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
RSS_GROWTH=$((FINAL_RSS - INITIAL_RSS))

FINAL_ERRORS=$(curl -sf http://127.0.0.1:18291/status 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('send_errors',0))" 2>/dev/null || echo "0")
FINAL_WAL=$(stat --format=%s "$STATE_DIR/wal/metrics.wal" 2>/dev/null || echo "0")

echo ""
echo "S2 Results:"
echo "  RSS growth: ${RSS_GROWTH} KB"
echo "  Send errors: ${FINAL_ERRORS}"
echo "  Final WAL size: ${FINAL_WAL} bytes"

FAILED=0

if [ "$RSS_GROWTH" -ge "$RELEASE_BLOCKING_RSS_GROWTH_KB" ]; then
    echo "FAIL: RSS growth ${RSS_GROWTH} KB >= ${RELEASE_BLOCKING_RSS_GROWTH_KB} KB"
    FAILED=1
elif [ "$RSS_GROWTH" -ge "$WARNING_RSS_GROWTH_KB" ]; then
    echo "WARNING: RSS growth ${RSS_GROWTH} KB >= ${WARNING_RSS_GROWTH_KB} KB"
fi

if [ "$FINAL_ERRORS" -ge "$MAX_SEND_ERRORS" ]; then
    echo "FAIL: Send errors ${FINAL_ERRORS} >= ${MAX_SEND_ERRORS}"
    FAILED=1
fi

if [ "$FINAL_WAL" -ge "$MAX_WAL_BYTES" ]; then
    echo "FAIL: WAL size ${FINAL_WAL} >= ${MAX_WAL_BYTES}"
    FAILED=1
fi

if [ "$FAILED" -eq 1 ]; then
    exit 1
fi

echo "PASS: scenario_metrics"
exit 0
