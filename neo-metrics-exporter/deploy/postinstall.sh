#!/bin/sh
set -e
systemctl daemon-reload
systemctl enable neoguard-agent.service
echo "NeoGuard agent installed. Edit /etc/neoguard/agent.yaml then run:"
echo "  systemctl start neoguard-agent"
