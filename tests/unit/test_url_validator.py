"""Unit tests for SSRF URL validator."""

from unittest.mock import patch

import pytest

from neoguard.services.notifications.url_validator import SSRFError, validate_outbound_url


class TestValidateOutboundUrl:
    def test_allows_public_https_url(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("93.184.216.34", 443)),
        ]):
            result = validate_outbound_url("https://example.com/webhook")
            assert result == "https://example.com/webhook"

    def test_allows_public_http_url(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("93.184.216.34", 80)),
        ]):
            result = validate_outbound_url("http://hooks.slack.com/services/T00/B00")
            assert result == "http://hooks.slack.com/services/T00/B00"

    def test_blocks_private_10_network(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("10.0.0.1", 443)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("https://internal.corp/webhook")

    def test_blocks_private_172_network(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("172.16.0.1", 443)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("https://internal.corp/webhook")

    def test_blocks_private_192_network(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("192.168.1.1", 443)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("https://router.local/webhook")

    def test_blocks_loopback(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("127.0.0.1", 443)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("https://loopback.example.com/admin")

    def test_blocks_link_local(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("169.254.169.254", 80)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("http://169.254.169.254/latest/meta-data/")

    def test_blocks_metadata_ip_directly(self):
        with patch("socket.getaddrinfo", return_value=[
            (2, 1, 6, "", ("169.254.169.254", 80)),
        ]):
            with pytest.raises(SSRFError, match="private address"):
                validate_outbound_url("http://metadata.evil.com/")

    def test_blocks_localhost_hostname(self):
        with pytest.raises(SSRFError, match="Blocked hostname"):
            validate_outbound_url("https://localhost/something")

    def test_blocks_metadata_google_hostname(self):
        with pytest.raises(SSRFError, match="Blocked hostname"):
            validate_outbound_url("http://metadata.google.internal/computeMetadata")

    def test_blocks_ftp_scheme(self):
        with pytest.raises(SSRFError, match="Unsupported scheme"):
            validate_outbound_url("ftp://example.com/file")

    def test_blocks_file_scheme(self):
        with pytest.raises(SSRFError, match="Unsupported scheme"):
            validate_outbound_url("file:///etc/passwd")

    def test_blocks_no_hostname(self):
        with pytest.raises(SSRFError, match="no hostname"):
            validate_outbound_url("https://")

    def test_blocks_unresolvable(self):
        import socket as _socket
        with patch("socket.getaddrinfo", side_effect=_socket.gaierror("Name resolution failed")):
            with pytest.raises(SSRFError, match="Cannot resolve"):
                validate_outbound_url("https://nonexistent.invalid/webhook")
