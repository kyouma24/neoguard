#!/bin/sh
set -e
systemctl stop neoguard-agent.service 2>/dev/null || true
systemctl disable neoguard-agent.service 2>/dev/null || true
