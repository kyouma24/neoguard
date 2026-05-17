#!/bin/bash
set -euo pipefail

# Soak test orchestrator — runs all scenarios sequentially, collects evidence.
# Usage: sudo NEOGUARD_SOAK_ENDPOINT=http://... bash test/soak/run_all.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVIDENCE_ROOT="${SCRIPT_DIR}/evidence"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SUMMARY_FILE="${EVIDENCE_ROOT}/summary_${TIMESTAMP}.txt"

# Source release-specific env if present (e.g. NEOGUARD_DOCKER_IMAGE for S7)
if [ -f "${SCRIPT_DIR}/.release-env" ]; then
    # shellcheck source=/dev/null
    source "${SCRIPT_DIR}/.release-env"
fi

if [ "$(id -u)" -ne 0 ]; then
    echo "FAIL: Must run as root"
    exit 1
fi

BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"
if [ ! -f "$BINARY" ]; then
    echo "FAIL: Agent binary not found at $BINARY"
    echo "  Set NEOGUARD_SOAK_BINARY to override"
    exit 1
fi

ENDPOINT="${NEOGUARD_SOAK_ENDPOINT:-}"
if [ -z "$ENDPOINT" ]; then
    echo "FAIL: Set NEOGUARD_SOAK_ENDPOINT to the mock/real ingest endpoint"
    exit 1
fi

mkdir -p "$EVIDENCE_ROOT"

echo "=== NeoGuard v1 Soak Test Run ===" | tee "$SUMMARY_FILE"
echo "Timestamp: $TIMESTAMP" | tee -a "$SUMMARY_FILE"
echo "Binary: $BINARY" | tee -a "$SUMMARY_FILE"
echo "Endpoint: $ENDPOINT" | tee -a "$SUMMARY_FILE"
echo "Host: $(hostname) $(uname -r) $(nproc) vCPU $(free -h | awk '/^Mem:/{print $2}') RAM" | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

SCENARIOS=(
    "scenario_idle.sh"
    "scenario_metrics.sh"
    "scenario_logs.sh"
    "scenario_log_load.sh"
    "scenario_outage.sh"
    "scenario_restart.sh"
    "scenario_install.sh"
    "scenario_container.sh"
)

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

for scenario in "${SCENARIOS[@]}"; do
    scenario_path="${SCRIPT_DIR}/${scenario}"
    scenario_name="${scenario%.sh}"

    if [ ! -f "$scenario_path" ]; then
        echo "[SKIP] $scenario_name — script not found" | tee -a "$SUMMARY_FILE"
        SKIP_COUNT=$((SKIP_COUNT + 1))
        continue
    fi

    echo "" | tee -a "$SUMMARY_FILE"
    echo "[RUN] $scenario_name" | tee -a "$SUMMARY_FILE"
    echo "  Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$SUMMARY_FILE"

    set +e
    NEOGUARD_SOAK_BINARY="$BINARY" \
    NEOGUARD_SOAK_ENDPOINT="$ENDPOINT" \
    NEOGUARD_SOAK_EVIDENCE_DIR="${EVIDENCE_ROOT}/${scenario_name}" \
        bash "$scenario_path" 2>&1 | tee "${EVIDENCE_ROOT}/${scenario_name}_output.log"
    EXIT_CODE=${PIPESTATUS[0]}
    set -e

    echo "  Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$SUMMARY_FILE"

    if [ "$EXIT_CODE" -eq 0 ]; then
        echo "  Result: PASS" | tee -a "$SUMMARY_FILE"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  Result: FAIL (exit $EXIT_CODE)" | tee -a "$SUMMARY_FILE"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo "" | tee -a "$SUMMARY_FILE"
echo "=== Summary ===" | tee -a "$SUMMARY_FILE"
echo "  PASS: $PASS_COUNT" | tee -a "$SUMMARY_FILE"
echo "  FAIL: $FAIL_COUNT" | tee -a "$SUMMARY_FILE"
echo "  SKIP: $SKIP_COUNT" | tee -a "$SUMMARY_FILE"
echo "" | tee -a "$SUMMARY_FILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "SHIP DECISION: NO (${FAIL_COUNT} scenario(s) failed)" | tee -a "$SUMMARY_FILE"
    exit 1
else
    echo "SHIP DECISION: PASS (all scenarios passed)" | tee -a "$SUMMARY_FILE"
    exit 0
fi
