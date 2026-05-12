"""Phase B2 — Notification System Hardening regression tests.

NOTIF-003: SMTP host must be validated against SSRF (private/loopback/metadata IPs)
NOTIF-004: Webhook custom headers must block hop-by-hop and dangerous headers
NOTIF-005: list_all channels must scope to tenant (not leak cross-tenant)
NOTIF-006: PagerDuty + Freshdesk test_connection() must work without firing alerts
"""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.notifications import (
    AlertPayload,
    ChannelType,
    NotificationChannelCreate,
)
from neoguard.services.notifications.url_validator import SSRFError


# ---------------------------------------------------------------------------
# NOTIF-003: SMTP host SSRF validation
# ---------------------------------------------------------------------------


class TestSMTPHostValidation:
    """Email channel must validate smtp_host against SSRF — block private/loopback/metadata."""

    def test_smtp_host_localhost_blocked_at_creation(self):
        """Creating an email channel with smtp_host=localhost must fail."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|private|loopback"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "localhost",
                    "to": "admin@example.com",
                },
            )

    def test_smtp_host_127_0_0_1_blocked_at_creation(self):
        """Creating an email channel with smtp_host=127.0.0.1 must fail."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|private|loopback"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "127.0.0.1",
                    "to": "admin@example.com",
                },
            )

    def test_smtp_host_metadata_ip_blocked_at_creation(self):
        """Creating an email channel with smtp_host=169.254.169.254 must fail."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|private|metadata"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "169.254.169.254",
                    "to": "admin@example.com",
                },
            )

    def test_smtp_host_private_10_network_blocked(self):
        """Creating an email channel with smtp_host=10.0.0.1 must fail."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|private"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "10.0.0.1",
                    "to": "admin@example.com",
                },
            )

    def test_smtp_host_ipv6_loopback_blocked(self):
        """Creating an email channel with smtp_host=::1 must fail."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|private|loopback"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "::1",
                    "to": "admin@example.com",
                },
            )

    def test_smtp_host_metadata_google_blocked(self):
        """metadata.google.internal must be blocked."""
        with pytest.raises(ValueError, match="[Bb]locked|SSRF|metadata"):
            NotificationChannelCreate(
                name="Bad Email",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "metadata.google.internal",
                    "to": "admin@example.com",
                },
            )

    @patch("neoguard.services.notifications.url_validator.socket.getaddrinfo")
    def test_smtp_host_dns_resolving_to_private_ip_blocked(self, mock_getaddrinfo):
        """A hostname that DNS-resolves to a private IP must be blocked."""
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("10.0.0.5", 25)),
        ]
        with pytest.raises(ValueError, match="[Bb]locked|private|resolves"):
            NotificationChannelCreate(
                name="Evil DNS",
                channel_type=ChannelType.EMAIL,
                config={
                    "smtp_host": "evil.attacker.com",
                    "to": "admin@example.com",
                },
            )

    @patch("neoguard.services.notifications.url_validator.socket.getaddrinfo")
    def test_smtp_host_dns_resolving_to_public_ip_accepted(self, mock_getaddrinfo):
        """A hostname resolving to a public IP should pass."""
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("74.125.24.108", 25)),
        ]
        ch = NotificationChannelCreate(
            name="Gmail Relay",
            channel_type=ChannelType.EMAIL,
            config={
                "smtp_host": "smtp.gmail.com",
                "to": "admin@example.com",
            },
        )
        assert ch.config["smtp_host"] == "smtp.gmail.com"

    @patch("neoguard.services.notifications.url_validator.socket.getaddrinfo")
    def test_smtp_host_valid_public_hostname_accepted(self, mock_getaddrinfo):
        """smtp.gmail.com should pass validation."""
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("74.125.24.108", 25)),
        ]
        ch = NotificationChannelCreate(
            name="Gmail Relay",
            channel_type=ChannelType.EMAIL,
            config={
                "smtp_host": "smtp.gmail.com",
                "to": "admin@example.com",
            },
        )
        assert ch.config["smtp_host"] == "smtp.gmail.com"

    def test_smtp_host_valid_public_ip_accepted(self):
        """A public IP like 8.8.8.8 should pass (even if it's not a real SMTP server)."""
        ch = NotificationChannelCreate(
            name="Direct IP",
            channel_type=ChannelType.EMAIL,
            config={
                "smtp_host": "8.8.8.8",
                "to": "admin@example.com",
            },
        )
        assert ch.config["smtp_host"] == "8.8.8.8"

    async def test_send_email_validates_host_at_send_time(self):
        """Defense-in-depth: _send_email must also validate smtp_host before connecting."""
        from neoguard.services.notifications.senders import _send_email

        config = {
            "smtp_host": "127.0.0.1",
            "smtp_port": 25,
            "to": "admin@example.com",
        }
        with pytest.raises(SSRFError):
            await _send_email(config, "Test Subject", "Test Body")


# ---------------------------------------------------------------------------
# NOTIF-004: Webhook custom header blocking
# ---------------------------------------------------------------------------


_BLOCKED_HEADERS = [
    "Host", "Transfer-Encoding", "Content-Length",
    "Connection", "Upgrade", "Proxy-Authorization",
    "Authorization",
]


class TestWebhookHeaderBlocking:
    """Webhook custom headers must not include hop-by-hop or security-sensitive headers."""

    @pytest.mark.parametrize("header_name", _BLOCKED_HEADERS)
    def test_blocked_header_rejected_at_creation(self, header_name):
        """Creating a webhook channel with blocked headers must fail with 400."""
        with pytest.raises(ValueError, match="[Bb]locked header|[Ff]orbidden header"):
            NotificationChannelCreate(
                name="Bad Webhook",
                channel_type=ChannelType.WEBHOOK,
                config={
                    "url": "https://example.com/hook",
                    "headers": {header_name: "evil-value"},
                },
            )

    @pytest.mark.parametrize("header_name", _BLOCKED_HEADERS)
    def test_blocked_header_case_insensitive(self, header_name):
        """Header blocking must be case-insensitive."""
        with pytest.raises(ValueError, match="[Bb]locked header|[Ff]orbidden header"):
            NotificationChannelCreate(
                name="Bad Webhook",
                channel_type=ChannelType.WEBHOOK,
                config={
                    "url": "https://example.com/hook",
                    "headers": {header_name.upper(): "evil-value"},
                },
            )

    def test_allowed_headers_pass(self):
        """Safe custom headers like X-Custom, X-Correlation-ID should pass."""
        ch = NotificationChannelCreate(
            name="Good Webhook",
            channel_type=ChannelType.WEBHOOK,
            config={
                "url": "https://example.com/hook",
                "headers": {
                    "X-Custom": "value",
                    "X-Correlation-ID": "abc-123",
                    "Accept": "application/json",
                },
            },
        )
        assert ch.config["headers"]["X-Custom"] == "value"

    def test_webhook_without_headers_passes(self):
        """Webhook with no custom headers should validate fine."""
        ch = NotificationChannelCreate(
            name="Minimal Webhook",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://example.com/hook"},
        )
        assert "headers" not in ch.config or ch.config.get("headers") is None

    async def test_send_time_strips_blocked_headers(self):
        """Defense-in-depth: at send time, blocked headers are silently stripped."""
        from neoguard.services.notifications.senders import _sanitize_headers

        raw = {"Host": "evil.com", "X-Safe": "ok", "Transfer-Encoding": "chunked"}
        cleaned = _sanitize_headers(raw)
        assert "Host" not in cleaned
        assert "Transfer-Encoding" not in cleaned
        assert cleaned["X-Safe"] == "ok"


# ---------------------------------------------------------------------------
# NOTIF-005: Channel list tenant isolation
# ---------------------------------------------------------------------------


class TestChannelListTenantIsolation:
    """GET /channels must scope to the caller's tenant, never return all tenants."""

    def _mock_pool(self):
        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])

        mock_ctx = MagicMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_pool = MagicMock()
        mock_pool.acquire.return_value = mock_ctx

        return mock_pool, mock_conn

    async def test_list_channels_with_tenant_id_filters(self):
        """When tenant_id is provided, list_channels must include WHERE tenant_id."""
        from neoguard.services.notifications.crud import list_channels

        mock_pool, mock_conn = self._mock_pool()

        async def fake_get_pool():
            return mock_pool

        with patch("neoguard.services.notifications.crud.get_pool", side_effect=fake_get_pool):
            await list_channels("tenant-A", limit=50, offset=0)

        mock_conn.fetch.assert_called_once()
        query = mock_conn.fetch.call_args[0][0]
        assert "tenant_id" in query

    async def test_list_channels_without_tenant_id_no_filter(self):
        """When tenant_id is None (super admin legacy path), no tenant_id filter in query."""
        from neoguard.services.notifications.crud import list_channels

        mock_pool, mock_conn = self._mock_pool()

        async def fake_get_pool():
            return mock_pool

        with patch("neoguard.services.notifications.crud.get_pool", side_effect=fake_get_pool):
            await list_channels(None, limit=50, offset=0)

        mock_conn.fetch.assert_called_once()
        query = mock_conn.fetch.call_args[0][0]
        assert "tenant_id" not in query


# ---------------------------------------------------------------------------
# NOTIF-006: PagerDuty test_connection via /v2/change/enqueue
# ---------------------------------------------------------------------------


class TestPagerDutyTestConnection:
    """PagerDuty test_connection must use Change Events API (non-paging)."""

    async def test_pagerduty_test_connection_returns_result(self):
        """test_connection must POST to /v2/change/enqueue with routing_key."""
        from aioresponses import aioresponses as AioResponses
        from neoguard.services.notifications.senders import PagerDutySender

        sender = PagerDutySender()
        config = {"routing_key": "test-key-123"}

        with AioResponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/change/enqueue",
                status=202,
                payload={"status": "success", "message": "Event processed"},
            )
            result = await sender.test_connection(config)

        assert result is not None
        assert result["connected"] is True

    async def test_pagerduty_test_connection_uses_change_endpoint(self):
        """Must NOT post to /v2/enqueue (which would page someone)."""
        from aioresponses import aioresponses as AioResponses
        from neoguard.services.notifications.senders import PagerDutySender

        sender = PagerDutySender()
        config = {"routing_key": "test-key-123"}

        with AioResponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/change/enqueue",
                status=202,
                payload={"status": "success"},
            )
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=202,
                payload={"status": "success"},
            )
            await sender.test_connection(config)

            # Check which URLs were actually called
            called_urls = [str(key[1]) for key in m.requests.keys()]
            assert any("/v2/change/enqueue" in u for u in called_urls), (
                f"Expected /v2/change/enqueue to be called, got: {called_urls}"
            )
            enqueue_called = any(
                "/v2/enqueue" in str(key[1]) and "/change/" not in str(key[1])
                for key in m.requests.keys()
                if m.requests[key]  # has actual calls
            )
            assert not enqueue_called, "test_connection must NOT call /v2/enqueue"

    async def test_pagerduty_test_connection_raises_on_bad_key(self):
        """Invalid routing key should raise NotificationSendError."""
        from aioresponses import aioresponses as AioResponses
        from neoguard.services.notifications.senders import (
            NotificationSendError,
            PagerDutySender,
        )

        sender = PagerDutySender()
        config = {"routing_key": "bad-key"}

        with AioResponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/change/enqueue",
                status=400,
                body="Invalid routing key",
            )
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.test_connection(config)
            assert exc_info.value.status == 400


# ---------------------------------------------------------------------------
# Tenant isolation integration test for notification routes
# ---------------------------------------------------------------------------


class TestNotificationRouteTenantIsolation:
    """Route-level tenant isolation: verify get_query_tenant_id behavior on list_all."""

    def _make_request(self, *, tenant_id, scopes, is_super_admin, query_params=None):
        request = MagicMock()
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes
        request.state.is_super_admin = is_super_admin
        qp = query_params or {}

        class FakeQueryParams:
            def get(self, key, default=None):
                return qp.get(key, default)

            def __contains__(self, item):
                return item in qp

        request.query_params = FakeQueryParams()
        return request

    def test_get_query_tenant_id_regular_user_ignores_override(self):
        """Regular user with ?tenant_id=other gets their own session tenant, not the override."""
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(
            tenant_id="tenant-A", scopes=["read", "write"],
            is_super_admin=False, query_params={"tenant_id": "tenant-B"},
        )
        result = get_query_tenant_id(request)
        assert result == "tenant-A"

    def test_get_query_tenant_id_super_admin_with_override(self):
        """Super admin with ?tenant_id=other gets that specific tenant."""
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(
            tenant_id="admin-tenant", scopes=["platform_admin"],
            is_super_admin=True, query_params={"tenant_id": "tenant-B"},
        )
        result = get_query_tenant_id(request)
        assert result == "tenant-B"

    def test_get_query_tenant_id_super_admin_no_override_uses_session(self):
        """Super admin without ?tenant_id falls back to their session tenant."""
        from neoguard.api.deps import get_query_tenant_id

        request = self._make_request(
            tenant_id="admin-tenant", scopes=["platform_admin"],
            is_super_admin=True, query_params={},
        )
        result = get_query_tenant_id(request)
        assert result == "admin-tenant"

    def test_validate_outbound_host_applies_to_super_admin(self):
        """SMTP host validation must apply regardless of caller role (no bypass)."""
        from neoguard.services.notifications.url_validator import validate_outbound_host

        with pytest.raises(SSRFError):
            validate_outbound_host("169.254.169.254")

        with pytest.raises(SSRFError):
            validate_outbound_host("localhost")

    @patch("neoguard.api.routes.notifications.log")
    @patch("neoguard.api.routes.notifications.get_channel")
    async def test_get_one_audit_logs_cross_tenant_access(self, mock_get_channel, mock_log):
        """Super admin fetching another tenant's channel must be audit-logged."""
        from datetime import datetime, UTC
        from neoguard.api.routes.notifications import get_one
        from neoguard.models.notifications import NotificationChannel

        mock_log.awarn = AsyncMock()
        mock_get_channel.return_value = NotificationChannel(
            id="ch-99", tenant_id="tenant-B", name="Other Tenant Channel",
            channel_type="webhook", config={"url": "https://x.com"},
            enabled=True, created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        request = MagicMock()
        request.state.tenant_id = "admin-tenant"

        await get_one(
            request=request,
            channel_id="ch-99",
            tenant_id=None,
            user_id="admin-user-1",
        )

        mock_log.awarn.assert_called_once()
        call_kwargs = mock_log.awarn.call_args.kwargs
        assert call_kwargs["user_id"] == "admin-user-1"
        assert call_kwargs["channel_id"] == "ch-99"
        assert call_kwargs["target_tenant_id"] == "tenant-B"
        assert call_kwargs["session_tenant_id"] == "admin-tenant"
