#!/bin/bash
set -euo pipefail

# Collects all evidence into a timestamped tar.gz bundle.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EVIDENCE_ROOT="${SCRIPT_DIR}/evidence"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BUNDLE_NAME="soak_evidence_${TIMESTAMP}.tar.gz"
BUNDLE_PATH="${SCRIPT_DIR}/${BUNDLE_NAME}"

if [ ! -d "$EVIDENCE_ROOT" ]; then
    echo "FAIL: No evidence directory found at $EVIDENCE_ROOT"
    echo "  Run scenarios first via run_all.sh"
    exit 1
fi

# Record host metadata
echo "Bundle created: $TIMESTAMP" > "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "Hostname: $(hostname)" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "Kernel: $(uname -r)" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 || echo 'unknown')" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "CPUs: $(nproc)" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "RAM: $(free -h | awk '/^Mem:/{print $2}')" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "Disk: $(df -h / | awk 'NR==2{print $2}')" >> "$EVIDENCE_ROOT/bundle_metadata.txt"
echo "Docker: $(docker --version 2>/dev/null || echo 'not installed')" >> "$EVIDENCE_ROOT/bundle_metadata.txt"

tar -czf "$BUNDLE_PATH" -C "$SCRIPT_DIR" evidence/

echo "Evidence bundle created: $BUNDLE_PATH"
echo "Size: $(du -h "$BUNDLE_PATH" | awk '{print $1}')"
echo "Contents:"
tar -tzf "$BUNDLE_PATH" | head -30
TOTAL=$(tar -tzf "$BUNDLE_PATH" | wc -l)
if [ "$TOTAL" -gt 30 ]; then
    echo "  ... and $((TOTAL - 30)) more files"
fi
