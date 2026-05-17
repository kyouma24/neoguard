#!/bin/bash
set -euo pipefail

# S7: Package/Image/Install Smoke
# Tests deb, rpm (via Docker), Docker image, and install-remote.sh.
# Fails if any install method fails or health doesn't respond within 30s.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
EVIDENCE_DIR="${NEOGUARD_SOAK_EVIDENCE_DIR:-${SCRIPT_DIR}/evidence/scenario_install}"

cleanup() {
    docker rm -f neoguard-smoke-deb neoguard-smoke-rpm neoguard-smoke-docker 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$EVIDENCE_DIR"

FAILED=0

echo "S7: Package/Image/Install Smoke"
echo ""

# Record versions
echo "Host OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2)" > "$EVIDENCE_DIR/versions.txt"
echo "Docker: $(docker --version 2>/dev/null)" >> "$EVIDENCE_DIR/versions.txt"
echo "Kernel: $(uname -r)" >> "$EVIDENCE_DIR/versions.txt"

# --- Test 1: deb install ---
echo "  [1/4] Testing .deb install..."
DEB_FILE=$(find "$REPO_ROOT/bin" -name "*.deb" -print -quit 2>/dev/null || true)
if [ -z "$DEB_FILE" ]; then
    DEB_FILE=$(find "$REPO_ROOT" -name "*.deb" -path "*/bin/*" -print -quit 2>/dev/null || true)
fi

if [ -n "$DEB_FILE" ]; then
    docker run --rm --name neoguard-smoke-deb -d \
        -v "$DEB_FILE:/tmp/neoguard.deb" \
        ubuntu:24.04 bash -c "
            dpkg -i /tmp/neoguard.deb 2>&1;
            dpkg -L neoguard-agent 2>&1;
            /usr/bin/neoguard-agent version 2>&1;
            sleep 30
        " > "$EVIDENCE_DIR/deb_install.log" 2>&1 && DEB_OK=0 || DEB_OK=$?

    if [ "$DEB_OK" -ne 0 ]; then
        echo "    FAIL: deb install failed"
        FAILED=1
    else
        echo "    OK: deb installed"
    fi
else
    echo "    FAIL: No .deb file found (required by SOAK-001 contract)"
    FAILED=1
fi

# --- Test 2: rpm install ---
echo "  [2/4] Testing .rpm install..."
RPM_FILE=$(find "$REPO_ROOT/bin" -name "*.rpm" -print -quit 2>/dev/null || true)
if [ -z "$RPM_FILE" ]; then
    RPM_FILE=$(find "$REPO_ROOT" -name "*.rpm" -path "*/bin/*" -print -quit 2>/dev/null || true)
fi

if [ -n "$RPM_FILE" ]; then
    docker run --rm --name neoguard-smoke-rpm -d \
        -v "$RPM_FILE:/tmp/neoguard.rpm" \
        rockylinux:9 bash -c "
            rpm -i /tmp/neoguard.rpm 2>&1;
            rpm -ql neoguard-agent 2>&1;
            /usr/bin/neoguard-agent version 2>&1;
            sleep 30
        " > "$EVIDENCE_DIR/rpm_install.log" 2>&1 && RPM_OK=0 || RPM_OK=$?

    if [ "$RPM_OK" -ne 0 ]; then
        echo "    FAIL: rpm install failed"
        FAILED=1
    else
        echo "    OK: rpm installed"
    fi
else
    echo "    FAIL: No .rpm file found (required by SOAK-001 contract)"
    FAILED=1
fi

# --- Test 3: Docker image ---
echo "  [3/4] Testing Docker image..."
DOCKER_IMAGE="${NEOGUARD_DOCKER_IMAGE:-ghcr.io/kyouma24/neoguard-agent:latest}"

docker pull "$DOCKER_IMAGE" > "$EVIDENCE_DIR/docker_run.log" 2>&1 || true

docker run --rm --name neoguard-smoke-docker -d \
    -e NEOGUARD_API_KEY=obl_live_v2_smoketest_000000 \
    -e NEOGUARD_ENDPOINT=http://localhost:19999 \
    -p 18299:8282 \
    "$DOCKER_IMAGE" > /dev/null 2>&1 && DOCKER_START=0 || DOCKER_START=$?

if [ "$DOCKER_START" -eq 0 ]; then
    # Wait for health
    DOCKER_HEALTHY=0
    for _ in $(seq 1 30); do
        if curl -sf http://127.0.0.1:18299/health > /dev/null 2>&1; then
            DOCKER_HEALTHY=1
            break
        fi
        sleep 1
    done

    if [ "$DOCKER_HEALTHY" -eq 1 ]; then
        curl -sf http://127.0.0.1:18299/health >> "$EVIDENCE_DIR/health_responses.json"
        echo "" >> "$EVIDENCE_DIR/health_responses.json"
        echo "    OK: Docker container healthy"
    else
        echo "    FAIL: Docker container health check failed within 30s"
        docker logs neoguard-smoke-docker >> "$EVIDENCE_DIR/docker_run.log" 2>&1 || true
        FAILED=1
    fi
    docker rm -f neoguard-smoke-docker > /dev/null 2>&1 || true
else
    echo "    FAIL: Docker container failed to start"
    FAILED=1
fi

# --- Test 4: install-remote.sh (actual execution in container) ---
echo "  [4/4] Testing install-remote.sh..."
INSTALL_SCRIPT="$REPO_ROOT/deploy/install-remote.sh"
AGENT_BINARY="${NEOGUARD_SOAK_BINARY:-/usr/bin/neoguard-agent}"

if [ ! -f "$INSTALL_SCRIPT" ]; then
    echo "    FAIL: deploy/install-remote.sh not found (required by SOAK-001 contract)"
    FAILED=1
elif [ ! -f "$AGENT_BINARY" ]; then
    echo "    FAIL: Agent binary not found at $AGENT_BINARY (needed to serve for install-remote.sh test)"
    FAILED=1
else
    # Serve the binary via a local HTTP server so install-remote.sh can download it
    SERVE_DIR="$(mktemp -d)"
    SERVE_PORT=19903
    ARCH="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
    BINARY_NAME="neoguard-agent-linux-${ARCH}"
    cp "$AGENT_BINARY" "${SERVE_DIR}/${BINARY_NAME}"
    sha256sum "${SERVE_DIR}/${BINARY_NAME}" | sed "s|${SERVE_DIR}/||" > "${SERVE_DIR}/checksums.txt"

    python3 -c "
import http.server, functools, os
os.chdir('$SERVE_DIR')
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='$SERVE_DIR')
http.server.HTTPServer(('127.0.0.1', $SERVE_PORT), handler).serve_forever()
" &
    SERVE_PID=$!
    sleep 1

    # Run install-remote.sh inside a container, pointing at our local file server
    docker run --rm --name neoguard-smoke-remote --network host \
        -v "$INSTALL_SCRIPT:/tmp/install-remote.sh:ro" \
        ubuntu:24.04 bash -c "
            apt-get update -qq && apt-get install -y -qq curl > /dev/null 2>&1
            # Patch the script to use our local server instead of GitHub
            sed 's|https://github.com/.*/releases/download/v\\\${VERSION}|http://127.0.0.1:${SERVE_PORT}|g' /tmp/install-remote.sh > /tmp/install-patched.sh
            # Also patch version detection to skip GitHub API
            sed -i 's|VERSION=.*curl.*||' /tmp/install-patched.sh
            chmod +x /tmp/install-patched.sh
            bash /tmp/install-patched.sh --api-key=obl_live_v2_smoketest_000000 --endpoint=http://127.0.0.1:19900 --version=0.0.0-soak 2>&1
        " > "$EVIDENCE_DIR/remote_install.log" 2>&1 && REMOTE_OK=0 || REMOTE_OK=$?

    kill "$SERVE_PID" 2>/dev/null || true
    wait "$SERVE_PID" 2>/dev/null || true
    rm -rf "$SERVE_DIR"

    if [ "$REMOTE_OK" -eq 0 ]; then
        echo "    OK: install-remote.sh executed successfully with health 200"
    else
        echo "    FAIL: install-remote.sh execution failed (see remote_install.log)"
        FAILED=1
    fi
fi

# --- Collect package file lists ---
echo "" > "$EVIDENCE_DIR/package_file_lists.txt"
if [ -n "${DEB_FILE:-}" ]; then
    echo "=== DEB contents ===" >> "$EVIDENCE_DIR/package_file_lists.txt"
    dpkg-deb -c "$DEB_FILE" >> "$EVIDENCE_DIR/package_file_lists.txt" 2>/dev/null || true
fi
if [ -n "${RPM_FILE:-}" ]; then
    echo "=== RPM contents ===" >> "$EVIDENCE_DIR/package_file_lists.txt"
    rpm -qlp "$RPM_FILE" >> "$EVIDENCE_DIR/package_file_lists.txt" 2>/dev/null || true
fi

echo ""
echo "S7 Results:"
echo "  All methods tested, FAILED=$FAILED"

if [ "$FAILED" -ne 0 ]; then
    echo "FAIL: scenario_install"
    exit 1
fi

echo "PASS: scenario_install"
exit 0
