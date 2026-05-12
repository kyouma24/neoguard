"""SSRF protection — block requests to private/internal network addresses.

Returns validated (hostname, resolved_ips) tuple so callers can pin the
resolved IP for the actual HTTP connection, preventing DNS rebinding.

Usage:
    url, safe_ips = validate_outbound_url(config["url"])
    async with create_pinned_session(safe_ips) as session:
        await session.post(url, ...)
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Any
from urllib.parse import urlparse

import aiohttp
from aiohttp import TCPConnector


class SSRFError(ValueError):
    pass


class _PinnedResolver(aiohttp.abc.AbstractResolver):
    """DNS resolver that only returns pre-validated IPs, preventing rebinding."""

    def __init__(self, allowed_ips: list[str]) -> None:
        self._ips = allowed_ips

    async def resolve(self, host: str, port: int = 0, family: int = 0) -> list[dict[str, Any]]:
        results = []
        for ip in self._ips:
            addr = ipaddress.ip_address(ip)
            ip_family = socket.AF_INET6 if addr.version == 6 else socket.AF_INET
            if family and family != ip_family:
                continue
            results.append({
                "hostname": host,
                "host": ip,
                "port": port,
                "family": ip_family,
                "proto": 0,
                "flags": socket.AI_NUMERICHOST,
            })
        if not results:
            raise OSError(f"No resolvable addresses for {host}")
        return results

    async def close(self) -> None:
        pass


def create_pinned_session(
    safe_ips: list[str], timeout: aiohttp.ClientTimeout | None = None,
) -> aiohttp.ClientSession:
    """Create an aiohttp session pinned to pre-validated IPs.

    This prevents DNS rebinding attacks by ensuring the HTTP connection
    only uses IPs that were validated at URL check time.
    """
    connector = TCPConnector(resolver=_PinnedResolver(safe_ips))
    return aiohttp.ClientSession(connector=connector, timeout=timeout)


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


def validate_outbound_host(host: str) -> None:
    """Validate a bare hostname/IP against SSRF rules (no URL parsing needed).

    Used for SMTP hosts and similar non-HTTP outbound connections.
    Checks literal hostname against blocklist, then resolves DNS and checks
    all resolved IPs against private/loopback/metadata ranges.
    Raises SSRFError if blocked.
    """
    if not host:
        raise SSRFError("Empty hostname")

    host_lower = host.lower().rstrip(".")
    if host_lower in _BLOCKED_HOSTS:
        raise SSRFError(f"Blocked hostname: {host}")

    normalized = _normalize_ip_hostname(host)
    if normalized and _is_private_ip(normalized):
        raise SSRFError(f"Blocked IP: {host} → {normalized}")

    if normalized:
        return

    try:
        resolved = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise SSRFError(f"Cannot resolve hostname: {host}")

    for _, _, _, _, sockaddr in resolved:
        ip_str = sockaddr[0]
        if _is_private_ip(ip_str):
            raise SSRFError(f"Host resolves to private address: {host} → {ip_str}")


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
