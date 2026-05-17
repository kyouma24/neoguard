#!/bin/bash
set -euo pipefail

# S1: 24h Idle Host Stability
# Runs agent collecting system metrics only (no log pipeline).
# Samples RSS every minute for 24h. Fails if RSS growth >= 8 MB.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:?Set NEOGUARD_SOAK_ENDPOINT}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_idle}"
DURATION_MINUTES="${NEOGUARD_SOAK_IDLE_MINUTES:-1440}"
STATE_DIR="$(mktemp -d)"
AGENT_PID=""

RELEASE_BLOCKING_RSS_GROWTH_KB=$((8 * 1024))
WARNING_RSS_GROWTH_KB=$((3 * 1024))

cleanup() {
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_idle_00000
endpoint: ${ENDPOINT}
cloud_detection: skip
collection:
  interval_seconds: 10
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
  bind: "127.0.0.1:18290"
EOF

mkdir -p "$STATE_DIR/wal"

"$BINARY" run --config "$STATE_DIR/agent.yaml" > "$EVIDENCE_DIR/agent.log" 2>&1 &
AGENT_PID=$!
sleep 5

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent did not start"
    exit 1
fi

"$BINARY" version > "$EVIDENCE_DIR/agent_version.txt" 2>&1 || true

echo "timestamp_utc,rss_kb" > "$EVIDENCE_DIR/rss_samples.csv"
echo "timestamp_utc,goroutines" > "$EVIDENCE_DIR/goroutines.csv"

INITIAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
echo "S1: Agent started (PID $AGENT_PID), initial RSS: ${INITIAL_RSS} KB"
echo "S1: Sampling every 60s for ${DURATION_MINUTES} minutes..."

for i in $(seq 1 "$DURATION_MINUTES"); do
    if ! kill -0 "$AGENT_PID" 2>/dev/null; then
        echo "FAIL: Agent died at minute $i"
        exit 1
    fi

    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status" 2>/dev/null || echo "0")
    GOROUTINES=$(ls -d "/proc/$AGENT_PID/task/"* 2>/dev/null | wc -l || echo "0")

    echo "${TS},${RSS}" >> "$EVIDENCE_DIR/rss_samples.csv"
    echo "${TS},${GOROUTINES}" >> "$EVIDENCE_DIR/goroutines.csv"

    sleep 60
done

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died before final check"
    exit 1
fi

FINAL_RSS=$(awk '/VmRSS/{print $2}' "/proc/$AGENT_PID/status")
RSS_GROWTH=$((FINAL_RSS - INITIAL_RSS))

if grep -q "panic" "$EVIDENCE_DIR/agent.log"; then
    echo "FAIL: Panic detected in agent log"
    exit 1
fi

FINAL_GOROUTINES=$(ls -d "/proc/$AGENT_PID/task/"* 2>/dev/null | wc -l || echo "0")
INITIAL_GOROUTINES_SAMPLE=$(sed -n '2p' "$EVIDENCE_DIR/goroutines.csv" | cut -d, -f2)

echo ""
echo "S1 Results:"
echo "  Initial RSS: ${INITIAL_RSS} KB"
echo "  Final RSS: ${FINAL_RSS} KB"
echo "  RSS growth: ${RSS_GROWTH} KB"
echo "  Goroutines: ${INITIAL_GOROUTINES_SAMPLE} -> ${FINAL_GOROUTINES}"

if [ "$RSS_GROWTH" -ge "$RELEASE_BLOCKING_RSS_GROWTH_KB" ]; then
    echo "FAIL: RSS growth ${RSS_GROWTH} KB >= release-blocking threshold ${RELEASE_BLOCKING_RSS_GROWTH_KB} KB"
    exit 1
elif [ "$RSS_GROWTH" -ge "$WARNING_RSS_GROWTH_KB" ]; then
    echo "WARNING: RSS growth ${RSS_GROWTH} KB >= warning threshold ${WARNING_RSS_GROWTH_KB} KB"
fi

echo "PASS: scenario_idle"
exit 0
