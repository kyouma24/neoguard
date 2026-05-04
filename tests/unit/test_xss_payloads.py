"""XSS payload tests for DashboardLink URL validation.

Tests cover OWASP-style XSS payloads that attempt to bypass scheme
validation via case tricks, control character injection, HTML entities,
whitespace obfuscation, and mixed-case schemes.
"""

import pytest
from pydantic import ValidationError

from neoguard.models.dashboards import DashboardLink


XSS_PAYLOADS = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",  # case variant
    "java\tscript:alert(1)",  # tab injection
    "data:text/html,<script>alert(1)</script>",
    "vbscript:alert(1)",
    "javas\ncript:alert(1)",  # newline injection
    " javascript:alert(1)",  # leading space
    "javascript:alert(String.fromCharCode(88,83,83))",
    "JaVaScRiPt:alert(1)",  # mixed case
    "\x00javascript:alert(1)",  # null byte prefix
    "\x0djavascript:alert(1)",  # carriage return prefix
    "\x0ajavascript:alert(1)",  # newline prefix
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:MsgBox('XSS')",
    "VBSCRIPT:alert(1)",
    "DATA:text/html,<h1>XSS</h1>",
]


class TestXSSPayloadsRejected:
    """Every XSS payload MUST be rejected by DashboardLink validation."""

    @pytest.mark.parametrize("payload", XSS_PAYLOADS)
    def test_xss_payload_rejected(self, payload: str):
        with pytest.raises(ValidationError):
            DashboardLink(label="xss", url=payload)


class TestSafeURLsAccepted:
    """Valid URLs MUST be accepted."""

    SAFE_URLS = [
        "https://example.com",
        "https://example.com/path?q=1&r=2#anchor",
        "http://localhost:8080",
        "http://192.168.1.1:3000/api",
        "mailto:admin@example.com",
        "mailto:admin@example.com?subject=Hello",
        "/dashboards/abc",
        "/",
        "/api/v1/health",
    ]

    @pytest.mark.parametrize("url", SAFE_URLS)
    def test_safe_url_accepted(self, url: str):
        link = DashboardLink(label="safe", url=url)
        assert link.url == url


class TestEdgeCaseURLs:
    """Edge cases that should be handled correctly."""

    def test_empty_url_rejected(self):
        with pytest.raises(ValidationError):
            DashboardLink(label="empty", url="")

    def test_only_whitespace_rejected(self):
        with pytest.raises(ValidationError):
            DashboardLink(label="space", url="   ")

    def test_ftp_rejected(self):
        """ftp: is not in the allowlist."""
        with pytest.raises(ValidationError):
            DashboardLink(label="ftp", url="ftp://files.example.com/data.csv")

    def test_file_rejected(self):
        """file: is not in the allowlist."""
        with pytest.raises(ValidationError):
            DashboardLink(label="file", url="file:///etc/passwd")

    def test_url_max_length(self):
        """URLs longer than 2048 chars are rejected."""
        with pytest.raises(ValidationError):
            DashboardLink(label="long", url="https://example.com/" + "a" * 2048)

    def test_url_at_max_length(self):
        """URL exactly at 2048 chars is accepted."""
        long_url = "https://example.com/" + "a" * (2048 - len("https://example.com/"))
        assert len(long_url) == 2048
        link = DashboardLink(label="max", url=long_url)
        assert len(link.url) == 2048

    def test_original_value_preserved(self):
        """The validator should preserve the original URL value (not the
        cleaned version) so display is accurate."""
        link = DashboardLink(label="test", url="https://Example.COM/Path")
        assert link.url == "https://Example.COM/Path"
