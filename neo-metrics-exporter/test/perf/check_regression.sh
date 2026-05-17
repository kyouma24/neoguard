#!/bin/bash
set -euo pipefail

BASELINES_FILE="${1:-test/perf/baselines.json}"
BENCH_OUTPUT="${2:-}"
THRESHOLD_PCT=10
BENCH_COUNT=5

die() { echo "FAIL: $1" >&2; exit 1; }

if [ ! -f "$BASELINES_FILE" ]; then
    die "Baselines file not found: $BASELINES_FILE"
fi

if [ -z "$BENCH_OUTPUT" ]; then
    echo "Running benchmarks (count=$BENCH_COUNT)..."
    BENCH_OUTPUT="$(mktemp)"
    trap 'rm -f "$BENCH_OUTPUT"' EXIT
    go test -bench=. -benchmem -count="$BENCH_COUNT" -timeout 300s ./test/perf/ > "$BENCH_OUTPUT" 2>&1
    echo "Benchmark output captured."
fi

echo ""
echo "=== Performance Regression Check ==="
echo "  Threshold: ${THRESHOLD_PCT}%"
echo "  Baselines: ${BASELINES_FILE}"
echo ""

# Use Python for JSON parsing and comparison (available on ubuntu-latest)
python3 - "$BASELINES_FILE" "$BENCH_OUTPUT" "$THRESHOLD_PCT" <<'PYTHON'
import json
import re
import sys
import os

baselines_path = sys.argv[1]
bench_output_path = sys.argv[2]
threshold_pct = float(sys.argv[3])

with open(baselines_path) as f:
    data = json.load(f)

with open(bench_output_path) as f:
    output = f.read()

benchmarks = data.get("benchmarks", {})
has_failure = False
has_baselines = False

for name, baseline_ns in benchmarks.items():
    if baseline_ns is None:
        continue
    has_baselines = True

    pattern = re.compile(r'^' + re.escape(name) + r'-\d+\s+\d+\s+([\d.]+)\s+ns/op', re.MULTILINE)
    matches = pattern.findall(output)
    if not matches:
        print(f"  SKIP  {name} (not found in output)")
        continue

    measured_ns = float(matches[-1])
    if baseline_ns <= 0:
        print(f"  SKIP  {name} (baseline is zero)")
        continue

    regression_pct = ((measured_ns - baseline_ns) / baseline_ns) * 100

    if regression_pct > threshold_pct:
        print(f"  FAIL  {name}: {measured_ns:.0f} ns/op (baseline: {baseline_ns:.0f}, regression: +{regression_pct:.1f}%)")
        has_failure = True
    else:
        print(f"  PASS  {name}: {measured_ns:.0f} ns/op (baseline: {baseline_ns:.0f}, delta: {regression_pct:+.1f}%)")

# Binary size check
print()
binary_path = "bin/neoguard-agent-linux-amd64"
size_limit = data.get("binary_size_limit_bytes", 15728640)
if os.path.isfile(binary_path):
    binary_size = os.path.getsize(binary_path)
    if binary_size > size_limit:
        print(f"  FAIL  binary_size: {binary_size} bytes (limit: {size_limit})")
        has_failure = True
    else:
        print(f"  PASS  binary_size: {binary_size} bytes (limit: {size_limit})")
else:
    print(f"  SKIP  binary_size ({binary_path} not found)")

print()
if not has_baselines:
    print("=== NO BASELINES SET ===")
    print("Baselines are null. Run 'make bench-update' to populate from this run.")
    sys.exit(0)

if has_failure:
    print("=== REGRESSION DETECTED ===")
    print(f"One or more benchmarks regressed >{threshold_pct:.0f}% from baseline.")
    print("If expected, update baselines with: make bench-update")
    sys.exit(1)

print("=== ALL CHECKS PASSED ===")
sys.exit(0)
PYTHON
