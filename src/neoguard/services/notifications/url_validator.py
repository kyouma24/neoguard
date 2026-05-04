"""SSRF protection — block requests to private/internal network addresses.

Returns validated (hostname, resolved_ips) tuple so callers can pin the
resolved IP for the actual HTTP connection, preventing DNS rebinding.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


class SSRFError(ValueError):
    pass


_BLOCKED_HOSTS = frozenset({
    "localhost",
    "metadata.google.internal",
    "instance-data",
    "169.254.169.254",
    "[::1]",
    "0.0.0.0",
    "metadata.google.internal.",
})

_BLOCKED_METADATA_IPS = frozenset({
    "169.254.169.254",
    "fd00:ec2::254",
    "169.254.170.2",
    "::1",
    "0:0:0:0:0:0:0:1",
    "127.0.0.1",
    "0.0.0.0",
})


def _is_private_ip(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False

    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return True

    if str(addr) in _BLOCKED_METADATA_IPS:
        return True

    return False


def _normalize_ip_hostname(hostname: str) -> str | None:
    """Detect numeric IP hostnames (decimal, octal, hex) and normalize."""
    try:
        return str(ipaddress.ip_address(hostname))
    except ValueError:
        pass
    try:
        as_int = int(hostname, 0)
        return str(ipaddress.ip_address(as_int))
    except (ValueError, OverflowError):
        pass
    return None


def validate_outbound_url(url: str) -> tuple[str, list[str]]:
    """Validate URL for outbound requests.

    Returns (url, resolved_ips). Callers MUST connect to one of the
    returned IPs to prevent DNS rebinding.
    """
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise SSRFError(f"Unsupported scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname")

    hostname_lower = hostname.lower().rstrip(".")
    if hostname_lower in _BLOCKED_HOSTS:
        raise SSRFError(f"Blocked hostname: {hostname}")

    normalized = _normalize_ip_hostname(hostname)
    if normalized and _is_private_ip(normalized):
        raise SSRFError(f"Blocked IP hostname: {hostname} → {normalized}")

    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise SSRFError(f"Cannot resolve hostname: {hostname}")

    safe_ips: list[str] = []
    for _, _, _, _, sockaddr in resolved:
        ip_str = sockaddr[0]
        if _is_private_ip(ip_str):
            raise SSRFError(f"URL resolves to private address: {ip_str}")
        safe_ips.append(ip_str)

    if not safe_ips:
        raise SSRFError(f"No resolvable addresses for hostname: {hostname}")

    return url, safe_ips
