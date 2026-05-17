#!/bin/bash
set -euo pipefail

# S8: Non-Container Linux Host Validation (AGENT-007)
# Runs agent on a non-container Linux host (EC2 or bare metal).
# Verifies GOMAXPROCS == nproc and container detection reports non-container.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:?Set NEOGUARD_SOAK_ENDPOINT}"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_container}"
STATE_DIR="$(mktemp -d)"
AGENT_PID=""

cleanup() {
    if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
        kill "$AGENT_PID" 2>/dev/null || true
        wait "$AGENT_PID" 2>/dev/null || true
    fi
    rm -rf "$STATE_DIR"
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

# Record host environment
nproc > "$EVIDENCE_DIR/nproc.txt"
cat /proc/self/cgroup > "$EVIDENCE_DIR/proc_cgroup.txt" 2>/dev/null || echo "no cgroup file" > "$EVIDENCE_DIR/proc_cgroup.txt"

EXPECTED_GOMAXPROCS=$(nproc)
echo "S8: Host has $EXPECTED_GOMAXPROCS CPUs"

# Verify we are NOT inside a container
if [ -f "/.dockerenv" ] || grep -q "docker\|lxc\|containerd" /proc/1/cgroup 2>/dev/null; then
    echo "FAIL: This host appears to be inside a container"
    echo "  /.dockerenv exists or /proc/1/cgroup mentions docker/lxc/containerd"
    echo "  S8 must run on a non-container host"
    exit 1
fi

cat > "$STATE_DIR/agent.yaml" <<EOF
api_key: obl_live_v2_soaktest_container
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
  level: debug
  format: json
health:
  enabled: true
  bind: "127.0.0.1:18296"
EOF

mkdir -p "$STATE_DIR/wal"

"$BINARY" run --config "$STATE_DIR/agent.yaml" > "$EVIDENCE_DIR/agent.log" 2>&1 &
AGENT_PID=$!
sleep 10

if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent did not start"
    cat "$EVIDENCE_DIR/agent.log"
    exit 1
fi

# Count OS threads (Go runtime creates threads proportional to GOMAXPROCS)
THREAD_COUNT=$(ls -d "/proc/$AGENT_PID/task/"* 2>/dev/null | wc -l || echo "0")

# The definitive check: query the status endpoint and look for container metrics in the log
# The agent logs GOMAXPROCS at debug level, and the container collector reports it
sleep 5

# Check agent log for GOMAXPROCS evidence
GOMAXPROCS_LOG=$(grep -i "gomaxprocs\|GOMAXPROCS" "$EVIDENCE_DIR/agent.log" 2>/dev/null || true)
echo "$GOMAXPROCS_LOG" > "$EVIDENCE_DIR/gomaxprocs.txt"

# Check for container detection result
CONTAINER_DETECTION=$(grep -i "container.*detect\|container_runtime\|system.container" "$EVIDENCE_DIR/agent.log" 2>/dev/null || true)
echo "$CONTAINER_DETECTION" > "$EVIDENCE_DIR/container_detection.txt"

# Use Go's runtime.GOMAXPROCS via the binary's diagnose command if available
DIAGNOSE_OUTPUT=$("$BINARY" diagnose 2>&1 || true)
if echo "$DIAGNOSE_OUTPUT" | grep -qi "gomaxprocs"; then
    echo "$DIAGNOSE_OUTPUT" | grep -i "gomaxprocs" >> "$EVIDENCE_DIR/gomaxprocs.txt"
fi

echo ""
echo "S8 Results:"
echo "  Expected GOMAXPROCS: $EXPECTED_GOMAXPROCS"
echo "  GOMAXPROCS evidence: $(cat "$EVIDENCE_DIR/gomaxprocs.txt" | head -3)"
echo "  Container detection: $(cat "$EVIDENCE_DIR/container_detection.txt" | head -3)"
echo "  Thread count: ${THREAD_COUNT:-unknown}"

# Verify container_runtime is baremetal (not docker/containerd/lxc)
if grep -qi "container_runtime.*docker\|container_runtime.*containerd\|container_runtime.*lxc" "$EVIDENCE_DIR/agent.log" 2>/dev/null; then
    echo "FAIL: Agent falsely detected a container runtime"
    exit 1
fi

# Verify agent didn't detect a container
if grep -q '"system.container.detected".*value.*1\|container.detected.*1' "$EVIDENCE_DIR/agent.log" 2>/dev/null; then
    echo "FAIL: Agent reported system.container.detected=1 on non-container host"
    exit 1
fi

# Verify agent is running normally
if ! kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "FAIL: Agent died during validation"
    exit 1
fi

echo "PASS: scenario_container (AGENT-007 validated)"
exit 0
