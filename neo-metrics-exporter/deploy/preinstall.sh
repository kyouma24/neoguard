#!/bin/sh
set -e
if ! getent group neoguard >/dev/null 2>&1; then
    groupadd --system neoguard
fi
if ! getent passwd neoguard >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin --gid neoguard neoguard
fi
