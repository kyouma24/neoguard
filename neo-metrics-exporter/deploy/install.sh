#!/bin/bash
set -euo pipefail

BINARY_NAME="neoguard-agent"
INSTALL_DIR="/usr/bin"
CONFIG_DIR="/etc/neoguard"
LOG_DIR="/var/log/neoguard"
SERVICE_USER="neoguard"

echo "=== NeoGuard Agent Installer ==="

# Check root
if [ "$(id -u)" -ne 0 ]; then
    echo "Error: must run as root (sudo)"
    exit 1
fi

# Check binary exists
if [ ! -f "./${BINARY_NAME}" ]; then
    echo "Error: ${BINARY_NAME} binary not found in current directory"
    exit 1
fi

# Create service user
if ! id -u "${SERVICE_USER}" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
    echo "Created user: ${SERVICE_USER}"
fi

# Install binary
install -m 0755 "./${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
echo "Installed binary: ${INSTALL_DIR}/${BINARY_NAME}"

# Create config directory
mkdir -p "${CONFIG_DIR}"
if [ ! -f "${CONFIG_DIR}/agent.yaml" ]; then
    if [ -f "./agent.yaml" ]; then
        install -m 0640 -o root -g "${SERVICE_USER}" "./agent.yaml" "${CONFIG_DIR}/agent.yaml"
        echo "Installed config: ${CONFIG_DIR}/agent.yaml"
    else
        echo "Warning: no agent.yaml found, create ${CONFIG_DIR}/agent.yaml manually"
    fi
else
    echo "Config exists: ${CONFIG_DIR}/agent.yaml (not overwritten)"
fi

# Create log directory
mkdir -p "${LOG_DIR}"
chown "${SERVICE_USER}:${SERVICE_USER}" "${LOG_DIR}"
echo "Created log dir: ${LOG_DIR}"

# Install systemd unit
if [ -f "./neoguard-agent.service" ]; then
    install -m 0644 "./neoguard-agent.service" "/etc/systemd/system/neoguard-agent.service"
elif [ -f "../deploy/neoguard-agent.service" ]; then
    install -m 0644 "../deploy/neoguard-agent.service" "/etc/systemd/system/neoguard-agent.service"
fi
systemctl daemon-reload
echo "Installed systemd unit"

echo ""
echo "=== Next steps ==="
echo "1. Edit ${CONFIG_DIR}/agent.yaml (set api_key and endpoint)"
echo "2. sudo systemctl enable neoguard-agent"
echo "3. sudo systemctl start neoguard-agent"
echo "4. sudo journalctl -u neoguard-agent -f"
