#!/bin/bash
set -euo pipefail

BINARY_PATH="/usr/bin/neoguard-agent"
CONFIG_DIR="/etc/neoguard"
STATE_DIR="/var/lib/neoguard"
LOG_DIR="/var/log/neoguard"
SERVICE_USER="neoguard"
REPO="neoguard/neo-metrics-exporter"
HEALTH_URL="http://127.0.0.1:8282/health"

usage() {
    cat <<EOF
Usage: $0 --api-key=KEY --endpoint=URL [--version=VERSION]

Required:
  --api-key=KEY       NeoGuard API key
  --endpoint=URL      NeoGuard ingest endpoint URL

Optional:
  --version=VERSION   Release version to install (e.g., 1.2.3). Defaults to latest.

Example:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/master/deploy/install-remote.sh | bash -s -- \\
    --api-key=obl_live_v2_your_key --endpoint=https://ingest.yourdomain.com
EOF
    exit 1
}

die() { echo "ERROR: $1" >&2; exit 1; }

API_KEY=""
ENDPOINT=""
VERSION=""

for arg in "$@"; do
    case "$arg" in
        --api-key=*)   API_KEY="${arg#*=}" ;;
        --endpoint=*)  ENDPOINT="${arg#*=}" ;;
        --version=*)   VERSION="${arg#*=}" ;;
        --help|-h)     usage ;;
        *)             die "Unknown argument: $arg" ;;
    esac
done

if [ -z "$API_KEY" ]; then
    echo "ERROR: --api-key is required" >&2
    usage
fi
if [ -z "$ENDPOINT" ]; then
    echo "ERROR: --endpoint is required" >&2
    usage
fi

if [ "$(id -u)" -ne 0 ]; then
    die "Must run as root (use sudo)"
fi

if [ -f "$BINARY_PATH" ]; then
    die "NeoGuard agent already installed at ${BINARY_PATH}. To upgrade: stop the service, replace the binary, restart."
fi

detect_arch() {
    local machine
    machine="$(uname -m)"
    case "$machine" in
        x86_64)  echo "amd64" ;;
        aarch64) echo "arm64" ;;
        *)       die "Unsupported architecture: $machine (supported: x86_64, aarch64)" ;;
    esac
}

detect_os() {
    local os
    os="$(uname -s)"
    case "$os" in
        Linux) echo "linux" ;;
        *)     die "Unsupported OS: $os (only Linux is supported)" ;;
    esac
}

OS="$(detect_os)"
ARCH="$(detect_arch)"
BINARY_NAME="neoguard-agent-${OS}-${ARCH}"

echo "=== NeoGuard Agent Remote Installer ==="
echo "  OS:   ${OS}"
echo "  Arch: ${ARCH}"

if [ -z "$VERSION" ]; then
    echo "  Version: latest (resolving...)"
    VERSION="$(curl -fsSL -o /dev/null -w '%{redirect_url}' "https://github.com/${REPO}/releases/latest" | grep -oP 'v\K[^/]+$')" || true
    if [ -z "$VERSION" ]; then
        die "Could not determine latest release version. Specify --version explicitly."
    fi
fi
echo "  Version: ${VERSION}"

RELEASE_URL="https://github.com/${REPO}/releases/download/v${VERSION}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo ""
echo "Downloading binary and checksums..."
curl -fsSL -o "${TMPDIR}/${BINARY_NAME}" "${RELEASE_URL}/${BINARY_NAME}" || die "Failed to download binary from ${RELEASE_URL}/${BINARY_NAME}"
curl -fsSL -o "${TMPDIR}/checksums.txt" "${RELEASE_URL}/checksums.txt" || die "Failed to download checksums.txt"

echo "Verifying checksum..."
EXPECTED="$(grep "  ${BINARY_NAME}$" "${TMPDIR}/checksums.txt" | awk '{print $1}')"
if [ -z "$EXPECTED" ]; then
    EXPECTED="$(grep " ${BINARY_NAME}$" "${TMPDIR}/checksums.txt" | awk '{print $1}')"
fi
if [ -z "$EXPECTED" ]; then
    die "Binary ${BINARY_NAME} not found in checksums.txt"
fi
ACTUAL="$(sha256sum "${TMPDIR}/${BINARY_NAME}" | awk '{print $1}')"
if [ "$EXPECTED" != "$ACTUAL" ]; then
    die "Checksum mismatch! Expected: ${EXPECTED} Got: ${ACTUAL}"
fi
echo "  Checksum OK"

echo ""
echo "Installing..."

if ! getent group "$SERVICE_USER" >/dev/null 2>&1; then
    groupadd --system "$SERVICE_USER"
fi
if ! getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin --gid "$SERVICE_USER" "$SERVICE_USER"
fi
echo "  User: ${SERVICE_USER}"

install -m 0755 "${TMPDIR}/${BINARY_NAME}" "$BINARY_PATH"
echo "  Binary: ${BINARY_PATH}"

mkdir -p "$CONFIG_DIR"
cat > "${CONFIG_DIR}/agent.yaml" <<EOF
api_key: ${API_KEY}
endpoint: ${ENDPOINT}
cloud_detection: auto
health:
  enabled: true
  bind: "127.0.0.1:8282"
buffer:
  wal_dir: ${STATE_DIR}/wal
extra_tags:
  environment: production
EOF
chown root:"$SERVICE_USER" "${CONFIG_DIR}/agent.yaml"
chmod 640 "${CONFIG_DIR}/agent.yaml"
echo "  Config: ${CONFIG_DIR}/agent.yaml"

for dir in "$STATE_DIR" "${STATE_DIR}/wal" "${STATE_DIR}/logs-spool" "${STATE_DIR}/logs-dead-letter" "${STATE_DIR}/log_cursors" "$LOG_DIR"; do
    mkdir -p "$dir"
    chown "$SERVICE_USER":"$SERVICE_USER" "$dir"
    chmod 750 "$dir"
done
echo "  Directories: ${STATE_DIR}/, ${LOG_DIR}/"

cat > /etc/systemd/system/neoguard-agent.service <<'UNIT'
[Unit]
Description=NeoGuard Metrics Agent
Documentation=https://github.com/neoguard/neo-metrics-exporter
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=neoguard
Group=neoguard
ExecStart=/usr/bin/neoguard-agent run --config /etc/neoguard/agent.yaml
Restart=always
RestartSec=5
TimeoutStopSec=30

LimitNOFILE=65536
LimitNPROC=4096
MemoryMax=256M
CPUQuota=25%

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadOnlyPaths=/
ReadWritePaths=/var/log/neoguard /var/lib/neoguard
PrivateTmp=true
PrivateDevices=true
RestrictSUIDSGID=true
RestrictRealtime=true
RestrictNamespaces=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
SystemCallArchitectures=native
SystemCallFilter=@system-service
CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_DAC_READ_SEARCH

ProtectProc=invisible
ProcSubset=all

StandardOutput=journal
StandardError=journal
SyslogIdentifier=neoguard-agent

[Install]
WantedBy=multi-user.target
UNIT
echo "  Service unit: /etc/systemd/system/neoguard-agent.service"

systemctl daemon-reload
systemctl enable neoguard-agent
systemctl start neoguard-agent
echo "  Service started"

echo ""
echo "Waiting for health (up to 30s)..."
healthy=false
for _ in $(seq 1 30); do
    if curl -fsSL -o /dev/null -w '' "$HEALTH_URL" 2>/dev/null; then
        healthy=true
        break
    fi
    sleep 1
done

echo ""
if [ "$healthy" = true ]; then
    echo "=== SUCCESS ==="
    echo "NeoGuard agent is running and healthy."
    echo "  Version:  $($BINARY_PATH version 2>/dev/null | head -1 || echo 'unknown')"
    echo "  Health:   ${HEALTH_URL}"
    echo "  Logs:     journalctl -u neoguard-agent -f"
else
    echo "=== WARNING ==="
    echo "Agent started but local health endpoint did not respond within 30s."
    echo "The agent may have failed to start. Check for config or permission errors."
    echo "  Check status: systemctl status neoguard-agent"
    echo "  Check logs:   journalctl -u neoguard-agent -f"
fi
