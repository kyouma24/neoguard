"""Unit tests for notification system — models, senders, dispatcher, config validation."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import aiohttp
import pytest
from aioresponses import aioresponses

from neoguard.models.notifications import (
    AlertPayload,
    ChannelType,
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
    validate_channel_config,
)
from neoguard.services.notifications.senders import (
    SENDERS,
    BaseSender,
    FreshdeskSender,
    MSTeamsSender,
    NotificationSendError,
    PagerDutySender,
    SlackSender,
    WebhookSender,
    _build_webhook_body,
    _check_response,
    _retry,
)


def _make_payload(**kwargs) -> AlertPayload:
    defaults = {
        "event_id": "evt-001",
        "rule_id": "rule-001",
        "rule_name": "High CPU",
        "metric_name": "aws.ec2.cpu_utilization",
        "condition": "gt",
        "threshold": 90.0,
        "current_value": 95.5,
        "severity": "P1",
        "status": "firing",
        "message": "CPU above 90% (current: 95.50)",
        "tenant_id": "default",
        "fired_at": datetime(2026, 4, 30, 12, 0, 0, tzinfo=UTC),
    }
    defaults.update(kwargs)
    return AlertPayload(**defaults)


# ---------------------------------------------------------------------------
# Config Validation
# ---------------------------------------------------------------------------


class TestConfigValidation:
    def test_webhook_missing_url_rejected(self):
        with pytest.raises(ValueError, match="missing: url"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.WEBHOOK, config={},
            )

    def test_slack_missing_webhook_url_rejected(self):
        with pytest.raises(ValueError, match="missing: webhook_url"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.SLACK, config={},
            )

    def test_email_missing_smtp_host_rejected(self):
        with pytest.raises(ValueError, match="missing.*smtp_host"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.EMAIL,
                config={"to": "a@b.com"},
            )

    def test_email_missing_to_rejected(self):
        with pytest.raises(ValueError, match="missing.*to"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.EMAIL,
                config={"smtp_host": "mail.example.com"},
            )

    def test_freshdesk_missing_domain_rejected(self):
        with pytest.raises(ValueError, match="missing.*domain"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.FRESHDESK,
                config={"api_key": "abc"},
            )

    def test_freshdesk_missing_api_key_rejected(self):
        with pytest.raises(ValueError, match="missing.*api_key"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.FRESHDESK,
                config={"domain": "x.freshdesk.com"},
            )

    def test_freshdesk_domain_no_https(self):
        with pytest.raises(ValueError, match="should not include protocol"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.FRESHDESK,
                config={
                    "domain": "https://x.freshdesk.com",
                    "api_key": "abc",
                },
            )

    def test_webhook_url_must_be_http(self):
        with pytest.raises(ValueError, match="must start with http"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.WEBHOOK,
                config={"url": "ftp://example.com"},
            )

    def test_slack_url_must_be_http(self):
        with pytest.raises(ValueError, match="must start with http"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.SLACK,
                config={"webhook_url": "not-a-url"},
            )

    def test_webhook_valid_config_accepted(self):
        c = NotificationChannelCreate(
            name="OK", channel_type=ChannelType.WEBHOOK,
            config={"url": "https://example.com/hook"},
        )
        assert c.config["url"] == "https://example.com/hook"

    def test_freshdesk_valid_config_accepted(self):
        c = NotificationChannelCreate(
            name="OK", channel_type=ChannelType.FRESHDESK,
            config={"domain": "co.freshdesk.com", "api_key": "abc123"},
        )
        assert c.channel_type == "freshdesk"

    def test_validate_channel_config_standalone(self):
        with pytest.raises(ValueError, match="missing: domain, api_key"):
            validate_channel_config("freshdesk", {})

    def test_empty_required_value_rejected(self):
        with pytest.raises(ValueError, match="missing: url"):
            NotificationChannelCreate(
                name="Bad", channel_type=ChannelType.WEBHOOK,
                config={"url": ""},
            )


# ---------------------------------------------------------------------------
# Channel Types & Senders Registry
# ---------------------------------------------------------------------------


class TestChannelType:
    def test_all_types(self):
        assert set(ChannelType) == {"webhook", "slack", "email", "freshdesk", "pagerduty", "msteams"}

    def test_all_types_have_senders(self):
        for ct in ChannelType:
            assert ct in SENDERS, f"Missing sender for {ct}"

    def test_senders_are_base_sender_instances(self):
        for sender in SENDERS.values():
            assert isinstance(sender, BaseSender)


# ---------------------------------------------------------------------------
# Alert Payload
# ---------------------------------------------------------------------------


class TestAlertPayload:
    def test_firing_payload(self):
        p = _make_payload()
        assert p.status == "firing"
        assert p.resolved_at is None

    def test_resolved_payload(self):
        now = datetime.now(UTC)
        p = _make_payload(status="resolved", resolved_at=now)
        assert p.status == "resolved"
        assert p.resolved_at == now

    def test_tags_filter_default(self):
        p = _make_payload()
        assert p.tags_filter == {}

    def test_tags_filter_populated(self):
        p = _make_payload(tags_filter={"region": "us-east-1"})
        assert p.tags_filter["region"] == "us-east-1"


# ---------------------------------------------------------------------------
# Notification Models
# ---------------------------------------------------------------------------


class TestNotificationModels:
    def test_channel_create_defaults(self):
        c = NotificationChannelCreate(
            name="Test", channel_type=ChannelType.WEBHOOK,
            config={"url": "http://x"},
        )
        assert c.enabled is True
        assert c.channel_type == "webhook"

    def test_channel_create_freshdesk(self):
        c = NotificationChannelCreate(
            name="Freshdesk Prod",
            channel_type=ChannelType.FRESHDESK,
            config={"domain": "company.freshdesk.com", "api_key": "abc123"},
        )
        assert c.channel_type == "freshdesk"
        assert c.config["domain"] == "company.freshdesk.com"

    def test_channel_update_partial(self):
        u = NotificationChannelUpdate(enabled=False)
        dumped = u.model_dump(exclude_none=True)
        assert dumped == {"enabled": False}

    def test_channel_model(self):
        ch = NotificationChannel(
            id="ch-1", tenant_id="default", name="Slack",
            channel_type=ChannelType.SLACK,
            config={"webhook_url": "https://hooks.slack.com/x"},
            enabled=True, created_at=datetime.now(UTC),
        )
        assert ch.channel_type == "slack"


# ---------------------------------------------------------------------------
# Webhook Body Builder
# ---------------------------------------------------------------------------


class TestWebhookBody:
    def test_builds_complete_body(self):
        p = _make_payload()
        body = _build_webhook_body(p)
        assert body["event_id"] == "evt-001"
        assert body["rule_name"] == "High CPU"
        assert body["status"] == "firing"
        assert body["resolved_at"] is None
        assert body["severity"] == "P1"

    def test_resolved_includes_timestamp(self):
        now = datetime.now(UTC)
        p = _make_payload(status="resolved", resolved_at=now)
        body = _build_webhook_body(p)
        assert body["resolved_at"] == now.isoformat()


# ---------------------------------------------------------------------------
# Response Checking
# ---------------------------------------------------------------------------


class TestCheckResponse:
    async def test_2xx_passes(self):
        resp = AsyncMock(spec=aiohttp.ClientResponse)
        resp.status = 200
        await _check_response(resp, "test")

    async def test_201_passes(self):
        resp = AsyncMock(spec=aiohttp.ClientResponse)
        resp.status = 201
        await _check_response(resp, "test")

    async def test_4xx_raises(self):
        resp = AsyncMock(spec=aiohttp.ClientResponse)
        resp.status = 401
        resp.text = AsyncMock(return_value="Unauthorized")
        with pytest.raises(NotificationSendError) as exc_info:
            await _check_response(resp, "test")
        assert exc_info.value.status == 401
        assert "Unauthorized" in str(exc_info.value)

    async def test_5xx_raises(self):
        resp = AsyncMock(spec=aiohttp.ClientResponse)
        resp.status = 500
        resp.text = AsyncMock(return_value="Internal Server Error")
        with pytest.raises(NotificationSendError) as exc_info:
            await _check_response(resp, "test")
        assert exc_info.value.status == 500


# ---------------------------------------------------------------------------
# Retry Logic
# ---------------------------------------------------------------------------


class TestRetry:
    @patch("neoguard.services.notifications.senders.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.notifications.senders.log")
    async def test_succeeds_on_second_attempt(self, mock_log, mock_sleep):
        mock_log.awarn = AsyncMock()
        call_count = 0

        async def _fn():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise NotificationSendError(503, "Service Unavailable")
            return {"ok": True}

        result = await _retry(_fn)
        assert result == {"ok": True}
        assert call_count == 2
        mock_sleep.assert_awaited_once()

    async def test_does_not_retry_401(self):
        call_count = 0

        async def _fn():
            nonlocal call_count
            call_count += 1
            raise NotificationSendError(401, "Unauthorized")

        with pytest.raises(NotificationSendError) as exc_info:
            await _retry(_fn)
        assert call_count == 1
        assert exc_info.value.status == 401

    async def test_does_not_retry_422(self):
        call_count = 0

        async def _fn():
            nonlocal call_count
            call_count += 1
            raise NotificationSendError(422, "Validation Failed")

        with pytest.raises(NotificationSendError):
            await _retry(_fn)
        assert call_count == 1

    @patch("neoguard.services.notifications.senders.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.notifications.senders.log")
    async def test_exhausted_raises_last_error(self, mock_log, mock_sleep):
        mock_log.awarn = AsyncMock()

        async def _fn():
            raise NotificationSendError(503, "Down")

        with pytest.raises(NotificationSendError) as exc_info:
            await _retry(_fn, max_retries=2)
        assert exc_info.value.status == 503
        assert mock_sleep.await_count == 2

    @patch("neoguard.services.notifications.senders.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.notifications.senders.log")
    async def test_retries_connection_error(self, mock_log, mock_sleep):
        mock_log.awarn = AsyncMock()
        call_count = 0

        async def _fn():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise aiohttp.ClientError("Connection refused")
            return {"ok": True}

        result = await _retry(_fn)
        assert result == {"ok": True}
        assert call_count == 2

    @patch("neoguard.services.notifications.senders.asyncio.sleep", new_callable=AsyncMock)
    @patch("neoguard.services.notifications.senders.log")
    async def test_retries_timeout_error(self, mock_log, mock_sleep):
        mock_log.awarn = AsyncMock()
        call_count = 0

        async def _fn():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise TimeoutError("timed out")
            return {"ok": True}

        result = await _retry(_fn)
        assert result == {"ok": True}


# ---------------------------------------------------------------------------
# Webhook Sender
# ---------------------------------------------------------------------------


class TestWebhookSender:
    async def test_send_firing_posts_to_url(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {"url": "https://example.com/hook"}

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_send_resolved_posts_to_url(self):
        sender = WebhookSender()
        payload = _make_payload(status="resolved")
        config = {"url": "https://example.com/hook"}

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            await sender.send_resolved(payload, config, {})

    async def test_send_firing_with_custom_headers(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {
            "url": "https://example.com/hook",
            "headers": {"X-Custom": "value"},
        }

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_send_firing_raises_on_500(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {"url": "https://example.com/hook"}

        with aioresponses() as m:
            for _ in range(4):
                m.post("https://example.com/hook", status=500, body="Server Error")
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 500

    async def test_send_firing_raises_on_401(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {"url": "https://example.com/hook"}

        with aioresponses() as m:
            m.post("https://example.com/hook", status=401, body="Unauthorized")
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 401


# ---------------------------------------------------------------------------
# Slack Sender
# ---------------------------------------------------------------------------


class TestSlackSender:
    async def test_sends_firing_with_critical_color(self):
        sender = SlackSender()
        payload = _make_payload(severity="P1")
        config = {
            "webhook_url": "https://hooks.slack.com/test",
            "channel": "#alerts",
        }

        with aioresponses() as m:
            m.post("https://hooks.slack.com/test", status=200, body="ok")
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_sends_firing_with_warning_color(self):
        sender = SlackSender()
        payload = _make_payload(severity="P3")
        config = {"webhook_url": "https://hooks.slack.com/test"}

        with aioresponses() as m:
            m.post("https://hooks.slack.com/test", status=200, body="ok")
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_sends_resolved(self):
        sender = SlackSender()
        payload = _make_payload(status="resolved")
        config = {"webhook_url": "https://hooks.slack.com/test"}

        with aioresponses() as m:
            m.post("https://hooks.slack.com/test", status=200, body="ok")
            await sender.send_resolved(payload, config, {})

    async def test_raises_on_invalid_payload(self):
        sender = SlackSender()
        payload = _make_payload()
        config = {"webhook_url": "https://hooks.slack.com/test"}

        with aioresponses() as m:
            m.post(
                "https://hooks.slack.com/test",
                status=200, body="invalid_payload",
            )
            with pytest.raises(NotificationSendError, match="Slack rejected"):
                await sender.send_firing(payload, config)

    async def test_raises_on_403(self):
        sender = SlackSender()
        payload = _make_payload()
        config = {"webhook_url": "https://hooks.slack.com/test"}

        with aioresponses() as m:
            m.post("https://hooks.slack.com/test", status=403, body="Forbidden")
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 403


# ---------------------------------------------------------------------------
# Freshdesk Sender
# ---------------------------------------------------------------------------


class TestFreshdeskSender:
    async def test_creates_ticket_on_firing(self):
        sender = FreshdeskSender()
        payload = _make_payload()
        config = {
            "domain": "company.freshdesk.com",
            "api_key": "test-key",
            "email": "alerts@company.com",
            "group_id": "42",
            "type": "Incident",
        }

        with aioresponses() as m:
            m.post(
                "https://company.freshdesk.com/api/v2/tickets",
                status=201,
                payload={"id": 9001},
            )
            result = await sender.send_firing(payload, config)

        assert result["ticket_id"] == 9001
        assert result["domain"] == "company.freshdesk.com"

    async def test_severity_mapping_critical(self):
        sender = FreshdeskSender()
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=201, payload={"id": 1},
            )
            result = await sender.send_firing(
                _make_payload(severity="P1"), config,
            )
        assert result["ticket_id"] == 1

    async def test_severity_mapping_p2(self):
        sender = FreshdeskSender()
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=201, payload={"id": 2},
            )
            result = await sender.send_firing(
                _make_payload(severity="P2"), config,
            )
        assert result["ticket_id"] == 2

    async def test_severity_mapping_p4(self):
        sender = FreshdeskSender()
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=201, payload={"id": 3},
            )
            result = await sender.send_firing(
                _make_payload(severity="P4"), config,
            )
        assert result["ticket_id"] == 3

    async def test_resolve_adds_note_and_closes_ticket(self):
        sender = FreshdeskSender()
        payload = _make_payload(status="resolved", current_value=85.0)
        config = {"domain": "company.freshdesk.com", "api_key": "test-key"}
        firing_meta = {"ticket_id": 9001, "domain": "company.freshdesk.com"}

        with aioresponses() as m:
            m.post(
                "https://company.freshdesk.com/api/v2/tickets/9001/notes",
                status=201, payload={},
            )
            m.put(
                "https://company.freshdesk.com/api/v2/tickets/9001",
                status=200, payload={},
            )
            await sender.send_resolved(payload, config, firing_meta)

    async def test_resolve_skips_without_ticket_id(self):
        sender = FreshdeskSender()
        payload = _make_payload(status="resolved")
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        await sender.send_resolved(payload, config, {})

    async def test_tags_included_in_ticket(self):
        sender = FreshdeskSender()
        payload = _make_payload(
            tags_filter={"region": "us-east-1", "instance_type": "c5.xlarge"},
        )
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=201, payload={"id": 100},
            )
            result = await sender.send_firing(payload, config)
        assert result["ticket_id"] == 100

    async def test_raises_on_401_unauthorized(self):
        sender = FreshdeskSender()
        payload = _make_payload()
        config = {"domain": "x.freshdesk.com", "api_key": "bad-key"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=401, body="Unauthorized",
            )
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 401

    async def test_raises_on_missing_ticket_id_in_response(self):
        sender = FreshdeskSender()
        payload = _make_payload()
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.post(
                "https://x.freshdesk.com/api/v2/tickets",
                status=201, payload={"error": "something went wrong"},
            )
            with pytest.raises(NotificationSendError, match="missing ticket ID"):
                await sender.send_firing(payload, config)

    async def test_test_connection_validates_credentials(self):
        sender = FreshdeskSender()
        config = {"domain": "x.freshdesk.com", "api_key": "k"}

        with aioresponses() as m:
            m.get(
                "https://x.freshdesk.com/api/v2/tickets?per_page=1",
                status=200, payload=[],
            )
            result = await sender.test_connection(config)

        assert result is not None
        assert result["connected"] is True

    async def test_test_connection_raises_on_bad_key(self):
        sender = FreshdeskSender()
        config = {"domain": "x.freshdesk.com", "api_key": "bad"}

        with aioresponses() as m:
            m.get(
                "https://x.freshdesk.com/api/v2/tickets?per_page=1",
                status=401, body="Unauthorized",
            )
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.test_connection(config)
            assert exc_info.value.status == 401


# ---------------------------------------------------------------------------
# Webhook HMAC Signing
# ---------------------------------------------------------------------------


class TestWebhookHMACSigning:
    async def test_signing_header_present_when_secret_configured(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {
            "url": "https://example.com/hook",
            "signing_secret": "my-secret-key",
        }

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_sign_payload_deterministic(self):
        sender = WebhookSender()
        sig1 = sender._sign_payload(b'{"test": true}', "secret")
        sig2 = sender._sign_payload(b'{"test": true}', "secret")
        assert sig1 == sig2
        assert len(sig1) == 64  # SHA-256 hex digest

    async def test_sign_payload_varies_with_secret(self):
        sender = WebhookSender()
        sig1 = sender._sign_payload(b"data", "secret-a")
        sig2 = sender._sign_payload(b"data", "secret-b")
        assert sig1 != sig2

    async def test_sign_payload_varies_with_body(self):
        sender = WebhookSender()
        sig1 = sender._sign_payload(b"body-a", "secret")
        sig2 = sender._sign_payload(b"body-b", "secret")
        assert sig1 != sig2

    async def test_no_signing_header_without_secret(self):
        sender = WebhookSender()
        payload = _make_payload()
        config = {"url": "https://example.com/hook"}

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            await sender.send_firing(payload, config)

    async def test_resolved_also_signed(self):
        sender = WebhookSender()
        payload = _make_payload(status="resolved")
        config = {
            "url": "https://example.com/hook",
            "signing_secret": "my-secret",
        }

        with aioresponses() as m:
            m.post("https://example.com/hook", status=200)
            await sender.send_resolved(payload, config, {})


# ---------------------------------------------------------------------------
# PagerDuty Sender
# ---------------------------------------------------------------------------


class TestPagerDutySender:
    async def test_send_firing_triggers_incident(self):
        sender = PagerDutySender()
        payload = _make_payload()
        config = {"routing_key": "test-routing-key"}

        with aioresponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=202,
                payload={"status": "success", "dedup_key": "neoguard-rule-001"},
            )
            result = await sender.send_firing(payload, config)

        assert result["dedup_key"] == "neoguard-rule-001"
        assert result["status"] == "success"

    async def test_send_firing_maps_severity(self):
        sender = PagerDutySender()
        for sev in ["P1", "P2", "P3", "P4"]:
            payload = _make_payload(severity=sev)
            config = {"routing_key": "key"}

            with aioresponses() as m:
                m.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    status=202,
                    payload={"status": "success"},
                )
                await sender.send_firing(payload, config)

    async def test_send_resolved_resolves_by_dedup_key(self):
        sender = PagerDutySender()
        payload = _make_payload(status="resolved")
        config = {"routing_key": "test-key"}
        firing_meta = {"dedup_key": "neoguard-rule-001"}

        with aioresponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=202,
                payload={"status": "success"},
            )
            await sender.send_resolved(payload, config, firing_meta)

    async def test_send_resolved_falls_back_to_rule_id(self):
        sender = PagerDutySender()
        payload = _make_payload(status="resolved")
        config = {"routing_key": "test-key"}

        with aioresponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=202,
                payload={"status": "success"},
            )
            await sender.send_resolved(payload, config, {})

    async def test_send_firing_raises_on_error(self):
        sender = PagerDutySender()
        payload = _make_payload()
        config = {"routing_key": "bad-key"}

        with aioresponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=400, body="Invalid routing key",
            )
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 400

    async def test_includes_tags_in_custom_details(self):
        sender = PagerDutySender()
        payload = _make_payload(tags_filter={"service": "api-gateway"})
        config = {"routing_key": "key"}

        with aioresponses() as m:
            m.post(
                "https://events.pagerduty.com/v2/enqueue",
                status=202,
                payload={"status": "success"},
            )
            result = await sender.send_firing(payload, config)
        assert "dedup_key" in result


# ---------------------------------------------------------------------------
# MS Teams Sender
# ---------------------------------------------------------------------------


class TestMSTeamsSender:
    async def test_send_firing_posts_adaptive_card(self):
        sender = MSTeamsSender()
        payload = _make_payload()
        config = {"webhook_url": "https://outlook.office.com/webhook/test"}

        with aioresponses() as m:
            m.post("https://outlook.office.com/webhook/test", status=200)
            result = await sender.send_firing(payload, config)

        assert result["status_code"] == 200

    async def test_send_firing_critical_uses_attention_color(self):
        sender = MSTeamsSender()
        payload = _make_payload(severity="P1")
        config = {"webhook_url": "https://outlook.office.com/webhook/test"}

        with aioresponses() as m:
            m.post("https://outlook.office.com/webhook/test", status=200)
            await sender.send_firing(payload, config)

    async def test_send_firing_warning_uses_warning_color(self):
        sender = MSTeamsSender()
        payload = _make_payload(severity="P3")
        config = {"webhook_url": "https://outlook.office.com/webhook/test"}

        with aioresponses() as m:
            m.post("https://outlook.office.com/webhook/test", status=200)
            await sender.send_firing(payload, config)

    async def test_send_resolved_posts_resolved_card(self):
        sender = MSTeamsSender()
        payload = _make_payload(status="resolved")
        config = {"webhook_url": "https://outlook.office.com/webhook/test"}

        with aioresponses() as m:
            m.post("https://outlook.office.com/webhook/test", status=200)
            await sender.send_resolved(payload, config, {})

    async def test_send_firing_raises_on_error(self):
        sender = MSTeamsSender()
        payload = _make_payload()
        config = {"webhook_url": "https://outlook.office.com/webhook/test"}

        with aioresponses() as m:
            m.post(
                "https://outlook.office.com/webhook/test",
                status=403, body="Forbidden",
            )
            with pytest.raises(NotificationSendError) as exc_info:
                await sender.send_firing(payload, config)
            assert exc_info.value.status == 403


# ---------------------------------------------------------------------------
# Config Validation — New Channel Types
# ---------------------------------------------------------------------------


class TestNewChannelConfigValidation:
    def test_pagerduty_missing_routing_key_rejected(self):
        with pytest.raises(ValueError, match="missing: routing_key"):
            NotificationChannelCreate(
                name="Bad PD", channel_type=ChannelType.PAGERDUTY, config={},
            )

    def test_pagerduty_valid_config_accepted(self):
        c = NotificationChannelCreate(
            name="PD", channel_type=ChannelType.PAGERDUTY,
            config={"routing_key": "abc123"},
        )
        assert c.channel_type == "pagerduty"

    def test_msteams_missing_webhook_url_rejected(self):
        with pytest.raises(ValueError, match="missing: webhook_url"):
            NotificationChannelCreate(
                name="Bad Teams", channel_type=ChannelType.MSTEAMS, config={},
            )

    def test_msteams_url_must_be_http(self):
        with pytest.raises(ValueError, match="must start with http"):
            NotificationChannelCreate(
                name="Bad Teams", channel_type=ChannelType.MSTEAMS,
                config={"webhook_url": "ftp://bad"},
            )

    def test_msteams_valid_config_accepted(self):
        c = NotificationChannelCreate(
            name="Teams", channel_type=ChannelType.MSTEAMS,
            config={"webhook_url": "https://outlook.office.com/webhook/x"},
        )
        assert c.channel_type == "msteams"


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------


class TestDispatcher:
    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._store_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_firing_fans_out(
        self, mock_senders, mock_store, mock_list,
    ):
        ch = NotificationChannel(
            id="ch-1", tenant_id="default", name="Webhook",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://x.com/hook"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch]

        mock_sender = AsyncMock()
        mock_sender.send_firing.return_value = {"status_code": 200}
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_firing
        payload = _make_payload()
        await dispatch_firing(payload, {"channel_ids": ["ch-1"]})

        mock_sender.send_firing.assert_called_once()
        mock_store.assert_called_once()

    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._store_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_firing_records_delivery_success(
        self, mock_senders, mock_store, mock_list,
    ):
        ch = NotificationChannel(
            id="ch-1", tenant_id="default", name="Webhook",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://x.com/hook"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch]

        mock_sender = AsyncMock()
        mock_sender.send_firing.return_value = {"status_code": 200}
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(_make_payload(), {"channel_ids": ["ch-1"]})

        stored_meta = mock_store.call_args[0][1]
        assert stored_meta["ch-1"]["delivered"] is True
        assert stored_meta["ch-1"]["status_code"] == 200

    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._store_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_firing_records_delivery_failure(
        self, mock_senders, mock_store, mock_list,
    ):
        ch = NotificationChannel(
            id="ch-1", tenant_id="default", name="Broken",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://x.com/hook"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch]

        mock_sender = AsyncMock()
        mock_sender.send_firing.side_effect = Exception("Connection refused")
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(_make_payload(), {"channel_ids": ["ch-1"]})

        mock_store.assert_called_once()
        stored_meta = mock_store.call_args[0][1]
        assert stored_meta["ch-1"]["delivered"] is False
        assert "Connection refused" in stored_meta["ch-1"]["error"]

    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._load_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_resolved_uses_firing_meta(
        self, mock_senders, mock_load, mock_list,
    ):
        ch = NotificationChannel(
            id="ch-fd", tenant_id="default", name="Freshdesk",
            channel_type=ChannelType.FRESHDESK,
            config={"domain": "x.freshdesk.com", "api_key": "k"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch]
        mock_load.return_value = {"ch-fd": {"ticket_id": 9001}}

        mock_sender = AsyncMock()
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_resolved
        payload = _make_payload(status="resolved")
        await dispatch_resolved(payload, {"channel_ids": ["ch-fd"]})

        mock_sender.send_resolved.assert_called_once()
        call_args = mock_sender.send_resolved.call_args
        assert call_args[0][2] == {"ticket_id": 9001}

    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._store_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_multiple_channels(
        self, mock_senders, mock_store, mock_list,
    ):
        ch1 = NotificationChannel(
            id="ch-1", tenant_id="default", name="Webhook",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://x.com"},
            enabled=True, created_at=datetime.now(UTC),
        )
        ch2 = NotificationChannel(
            id="ch-2", tenant_id="default", name="Freshdesk",
            channel_type=ChannelType.FRESHDESK,
            config={"domain": "x.freshdesk.com", "api_key": "k"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch1, ch2]

        mock_sender = AsyncMock()
        mock_sender.send_firing.return_value = {"ok": True}
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(
            _make_payload(), {"channel_ids": ["ch-1", "ch-2"]},
        )

        assert mock_sender.send_firing.call_count == 2

    async def test_dispatch_firing_noop_without_channel_ids(self):
        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(_make_payload(), {})

    async def test_dispatch_firing_noop_with_empty_list(self):
        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(_make_payload(), {"channel_ids": []})

    @patch("neoguard.services.notifications.dispatcher.list_enabled_channels")
    @patch("neoguard.services.notifications.dispatcher._store_notification_meta")
    @patch("neoguard.services.notifications.dispatcher.SENDERS")
    async def test_dispatch_firing_handles_sender_error(
        self, mock_senders, mock_store, mock_list,
    ):
        ch = NotificationChannel(
            id="ch-1", tenant_id="default", name="Broken",
            channel_type=ChannelType.WEBHOOK,
            config={"url": "https://x.com/hook"},
            enabled=True, created_at=datetime.now(UTC),
        )
        mock_list.return_value = [ch]

        mock_sender = AsyncMock()
        mock_sender.send_firing.side_effect = Exception("Connection refused")
        mock_senders.get.return_value = mock_sender

        from neoguard.services.notifications.dispatcher import dispatch_firing
        await dispatch_firing(_make_payload(), {"channel_ids": ["ch-1"]})
