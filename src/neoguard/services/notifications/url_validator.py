"""SSRF protection — block requests to private/internal network addresses."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class SSRFError(ValueError):
    pass


_BLOCKED_HOSTS = frozenset({
    "localhost",
    "metadata.google.internal",
})

_BLOCKED_METADATA_IPS = frozenset({
    "169.254.169.254",
    "fd00:ec2::254",
})


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return True

    if ip_str in _BLOCKED_METADATA_IPS:
        return True

    return False


def validate_outbound_url(url: str) -> str:
    """Validate a URL is safe for outbound requests. Returns the URL if valid, raises SSRFError otherwise."""
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise SSRFError(f"Unsupported scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname")

    if hostname in _BLOCKED_HOSTS:
        raise SSRFError(f"Blocked hostname: {hostname}")

    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise SSRFError(f"Cannot resolve hostname: {hostname}")

    for _, _, _, _, sockaddr in resolved:
        ip_str = sockaddr[0]
        if _is_private_ip(ip_str):
            raise SSRFError(f"URL resolves to private address: {ip_str}")

    return url
