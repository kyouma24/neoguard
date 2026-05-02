"""Pluggable notification senders.

Each sender implements send_firing() and send_resolved() for its channel type.
The dispatcher selects the correct sender based on channel_type and calls it
with the alert payload + channel config.
"""

from __future__ import annotations

import abc
import asyncio
import random
import ssl
from datetime import UTC, datetime
from email.message import EmailMessage

import aiohttp

from neoguard.core.logging import log
from neoguard.models.notifications import AlertPayload, ChannelType
from neoguard.services.notifications.url_validator import SSRFError, validate_outbound_url

_FRESHDESK_SEVERITY_MAP = {
    "P1": 4,  # Urgent
    "P2": 3,  # High
    "P3": 2,  # Medium
    "P4": 1,  # Low
}

_FRESHDESK_STATUS_OPEN = 2
_FRESHDESK_STATUS_RESOLVED = 4

_TIMEOUT_DEFAULT = aiohttp.ClientTimeout(total=10)
_TIMEOUT_FRESHDESK = aiohttp.ClientTimeout(total=15)

_RETRYABLE_STATUSES = frozenset({408, 429, 500, 502, 503, 504})
_MAX_RETRIES = 3
_BASE_DELAY = 1.0
_MAX_DELAY = 10.0


class NotificationSendError(Exception):
    """Raised when a notification HTTP request fails."""

    def __init__(self, status: int, message: str) -> None:
        self.status = status
        super().__init__(f"HTTP {status}: {message}")


async def _check_response(resp: aiohttp.ClientResponse, context: str) -> None:
    if 200 <= resp.status < 300:
        return
    try:
        body = await resp.text()
    except Exception:
        body = "<unreadable>"
    raise NotificationSendError(resp.status, f"{context} failed: {body[:500]}")


async def _retry(fn, *, max_retries: int = _MAX_RETRIES):
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except NotificationSendError as e:
            if e.status not in _RETRYABLE_STATUSES:
                raise
            last_exc = e
        except (aiohttp.ClientError, TimeoutError) as e:
            last_exc = e

        if attempt < max_retries:
            delay = min(_BASE_DELAY * (2 ** attempt), _MAX_DELAY)
            delay *= 0.5 + random.random()  # noqa: S311
            await log.awarn(
                "Retrying notification send",
                attempt=attempt + 1,
                max_retries=max_retries,
                delay=f"{delay:.1f}s",
                error=str(last_exc),
            )
            await asyncio.sleep(delay)

    raise last_exc  # type: ignore[misc]


class BaseSender(abc.ABC):
    @abc.abstractmethod
    async def send_firing(
        self, payload: AlertPayload, config: dict,
    ) -> dict:
        """Send a firing notification. Returns metadata (ticket ID, etc.)."""

    @abc.abstractmethod
    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        """Send a resolution notification. firing_meta has data from send_firing."""

    async def test_connection(self, config: dict) -> dict | None:
        """Optional lightweight connectivity check. Return None to fall through."""
        return None


class WebhookSender(BaseSender):
    """Posts JSON to an arbitrary URL with optional HMAC-SHA256 signing."""

    def _sign_payload(self, body_bytes: bytes, secret: str) -> str:
        import hashlib
        import hmac as _hmac
        return _hmac.new(
            secret.encode(), body_bytes, hashlib.sha256,
        ).hexdigest()

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        url = validate_outbound_url(config["url"])
        headers = {**config.get("headers", {})}
        body = _build_webhook_body(payload)
        import orjson as _orjson
        body_bytes = _orjson.dumps(body)

        signing_secret = config.get("signing_secret")
        if signing_secret:
            headers["X-NeoGuard-Signature"] = self._sign_payload(body_bytes, signing_secret)

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    url, data=body_bytes,
                    headers={**headers, "Content-Type": "application/json"},
                    timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "Webhook POST")
                await log.ainfo(
                    "Webhook sent", url=url, status=resp.status,
                    alert=payload.rule_name,
                )
                return {"status_code": resp.status}

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        url = validate_outbound_url(config["url"])
        headers = {**config.get("headers", {})}
        body = _build_webhook_body(payload)
        import orjson as _orjson
        body_bytes = _orjson.dumps(body)

        signing_secret = config.get("signing_secret")
        if signing_secret:
            headers["X-NeoGuard-Signature"] = self._sign_payload(body_bytes, signing_secret)

        async def _do() -> None:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    url, data=body_bytes,
                    headers={**headers, "Content-Type": "application/json"},
                    timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "Webhook resolved POST")
                await log.ainfo(
                    "Webhook resolved sent", url=url, status=resp.status,
                    alert=payload.rule_name,
                )

        await _retry(_do)


class SlackSender(BaseSender):
    """Posts to a Slack incoming webhook URL."""

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        webhook_url = validate_outbound_url(config["webhook_url"])
        channel = config.get("channel", "")
        color = "#e01e5a" if payload.severity in ("P1", "P2") else "#ecb22e"

        threshold_val = f"{payload.condition} {payload.threshold}"
        slack_body = {
            "channel": channel,
            "attachments": [{
                "color": color,
                "title": f":rotating_light: Alert FIRING: {payload.rule_name}",
                "text": payload.message,
                "fields": [
                    {"title": "Severity", "value": payload.severity.upper(), "short": True},
                    {"title": "Metric", "value": payload.metric_name, "short": True},
                    {
                        "title": "Current",
                        "value": f"{payload.current_value:.2f}",
                        "short": True,
                    },
                    {"title": "Threshold", "value": threshold_val, "short": True},
                ],
                "ts": int(payload.fired_at.timestamp()),
            }],
        }

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    webhook_url, json=slack_body, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                body_text = await resp.text()
                if resp.status == 200 and body_text != "ok":
                    raise NotificationSendError(
                        200, f"Slack rejected payload: {body_text[:200]}",
                    )
                await _check_response(resp, "Slack webhook")
                await log.ainfo(
                    "Slack notification sent", status=resp.status,
                    alert=payload.rule_name,
                )
                return {"status_code": resp.status}

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        webhook_url = validate_outbound_url(config["webhook_url"])
        channel = config.get("channel", "")

        slack_body = {
            "channel": channel,
            "attachments": [{
                "color": "#2eb886",
                "title": f":white_check_mark: Alert RESOLVED: {payload.rule_name}",
                "text": (
                    f"{payload.metric_name} returned to normal "
                    f"(current: {payload.current_value:.2f})"
                ),
                "ts": int(datetime.now(UTC).timestamp()),
            }],
        }

        async def _do() -> None:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    webhook_url, json=slack_body, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                body_text = await resp.text()
                if resp.status == 200 and body_text != "ok":
                    raise NotificationSendError(
                        200, f"Slack rejected payload: {body_text[:200]}",
                    )
                await _check_response(resp, "Slack resolved webhook")
                await log.ainfo(
                    "Slack resolved sent", status=resp.status,
                    alert=payload.rule_name,
                )

        await _retry(_do)


class EmailSender(BaseSender):
    """Sends email via SMTP (async via executor for smtplib)."""

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        subject = f"[{payload.severity.upper()}] Alert FIRING: {payload.rule_name}"
        body = (
            f"Alert: {payload.rule_name}\n"
            f"Status: FIRING\n"
            f"Severity: {payload.severity.upper()}\n\n"
            f"Metric: {payload.metric_name}\n"
            f"Condition: {payload.condition} {payload.threshold}\n"
            f"Current Value: {payload.current_value:.2f}\n\n"
            f"Message: {payload.message}\n"
            f"Fired at: {payload.fired_at.isoformat()}\n"
        )

        async def _do() -> dict:
            await _send_email(config, subject, body)
            return {}

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        subject = f"[RESOLVED] Alert: {payload.rule_name}"
        body = (
            f"Alert: {payload.rule_name}\n"
            f"Status: RESOLVED\n\n"
            f"Metric: {payload.metric_name} returned to normal.\n"
            f"Current Value: {payload.current_value:.2f}\n"
            f"Resolved at: {datetime.now(UTC).isoformat()}\n"
        )

        async def _do() -> None:
            await _send_email(config, subject, body)

        await _retry(_do)


class FreshdeskSender(BaseSender):
    """Creates Freshdesk tickets on fire, resolves them on recovery.

    Config keys:
        domain:   your-company.freshdesk.com (no https://)
        api_key:  Freshdesk API key (used as Basic auth username)
        email:    requester email for the ticket
        group_id: (optional) Freshdesk group to assign
        type:     (optional) ticket type, e.g. "Incident"
    """

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        domain = config["domain"]
        validate_outbound_url(f"https://{domain}/api/v2/tickets")
        api_key = config["api_key"]
        requester_email = config.get("email", "neoguard@alerts.internal")
        group_id = config.get("group_id")
        ticket_type = config.get("type", "Incident")

        priority = _FRESHDESK_SEVERITY_MAP.get(payload.severity, 1)
        tags_str = ", ".join(
            f"{k}={v}" for k, v in payload.tags_filter.items()
        ) if payload.tags_filter else "none"

        ticket_body = {
            "subject": f"[NeoGuard] {payload.severity.upper()}: {payload.rule_name}",
            "description": (
                f"<h3>Alert Firing</h3>"
                f"<p><strong>Rule:</strong> {payload.rule_name}</p>"
                f"<p><strong>Metric:</strong> {payload.metric_name}</p>"
                f"<p><strong>Condition:</strong> {payload.condition} {payload.threshold}</p>"
                f"<p><strong>Current Value:</strong> {payload.current_value:.2f}</p>"
                f"<p><strong>Severity:</strong> {payload.severity.upper()}</p>"
                f"<p><strong>Tags:</strong> {tags_str}</p>"
                f"<p><strong>Fired at:</strong> {payload.fired_at.isoformat()}</p>"
                f"<hr><p>Auto-created by NeoGuard alert engine. "
                f"Event ID: {payload.event_id}</p>"
            ),
            "email": requester_email,
            "priority": priority,
            "status": _FRESHDESK_STATUS_OPEN,
            "type": ticket_type,
            "tags": ["neoguard", f"severity:{payload.severity}", payload.metric_name],
        }
        if group_id:
            ticket_body["group_id"] = int(group_id)

        url = f"https://{domain}/api/v2/tickets"
        auth = aiohttp.BasicAuth(api_key, "X")

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    url, json=ticket_body, auth=auth, timeout=_TIMEOUT_FRESHDESK,
                ) as resp,
            ):
                await _check_response(resp, "Freshdesk create ticket")
                resp_data = await resp.json()
                ticket_id = resp_data.get("id")
                if ticket_id is None:
                    raise NotificationSendError(
                        resp.status, "Freshdesk response missing ticket ID",
                    )
                await log.ainfo(
                    "Freshdesk ticket created",
                    ticket_id=ticket_id, status=resp.status,
                    alert=payload.rule_name,
                )
                return {"ticket_id": ticket_id, "domain": domain}

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        ticket_id = firing_meta.get("ticket_id")
        if not ticket_id:
            await log.awarn(
                "No Freshdesk ticket_id in firing_meta, skipping resolve",
                alert=payload.rule_name,
            )
            return

        domain = firing_meta.get("domain", config["domain"])
        api_key = config["api_key"]
        auth = aiohttp.BasicAuth(api_key, "X")

        note_body = {
            "body": (
                f"<p><strong>Alert RESOLVED</strong></p>"
                f"<p>Metric <code>{payload.metric_name}</code> "
                f"returned to normal (current: {payload.current_value:.2f}).</p>"
                f"<p>Resolved at: {datetime.now(UTC).isoformat()}</p>"
            ),
            "private": False,
        }
        note_url = f"https://{domain}/api/v2/tickets/{ticket_id}/notes"
        update_url = f"https://{domain}/api/v2/tickets/{ticket_id}"

        async def _do() -> None:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    note_url, json=note_body, auth=auth,
                    timeout=_TIMEOUT_FRESHDESK,
                ) as resp:
                    await _check_response(resp, "Freshdesk add note")
                    await log.ainfo(
                        "Freshdesk resolution note added",
                        ticket_id=ticket_id, status=resp.status,
                    )

                async with session.put(
                    update_url,
                    json={"status": _FRESHDESK_STATUS_RESOLVED},
                    auth=auth, timeout=_TIMEOUT_FRESHDESK,
                ) as resp:
                    await _check_response(resp, "Freshdesk resolve ticket")
                    await log.ainfo(
                        "Freshdesk ticket resolved",
                        ticket_id=ticket_id, status=resp.status,
                    )

        await _retry(_do)

    async def test_connection(self, config: dict) -> dict | None:
        domain = config["domain"]
        api_key = config["api_key"]
        auth = aiohttp.BasicAuth(api_key, "X")
        url = f"https://{domain}/api/v2/tickets?per_page=1"

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.get(url, auth=auth, timeout=_TIMEOUT_FRESHDESK) as resp,
            ):
                await _check_response(resp, "Freshdesk connectivity test")
                return {"status_code": resp.status, "connected": True}

        return await _retry(_do)


class PagerDutySender(BaseSender):
    """Creates PagerDuty incidents via Events API v2."""

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        routing_key = config["routing_key"]
        severity_map = {"P1": "critical", "P2": "error", "P3": "warning", "P4": "info"}
        pd_severity = severity_map.get(payload.severity, "warning")

        pd_body = {
            "routing_key": routing_key,
            "event_action": "trigger",
            "dedup_key": f"neoguard-{payload.rule_id}",
            "payload": {
                "summary": payload.message,
                "source": f"neoguard/{payload.metric_name}",
                "severity": pd_severity,
                "component": payload.metric_name,
                "group": payload.tags_filter.get("service", "neoguard"),
                "class": payload.severity,
                "custom_details": {
                    "rule_name": payload.rule_name,
                    "metric_name": payload.metric_name,
                    "condition": f"{payload.condition} {payload.threshold}",
                    "current_value": payload.current_value,
                    "fired_at": payload.fired_at.isoformat(),
                    "event_id": payload.event_id,
                    "tags": payload.tags_filter,
                },
            },
            "links": [],
            "images": [],
        }

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    json=pd_body, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "PagerDuty trigger")
                resp_data = await resp.json()
                await log.ainfo(
                    "PagerDuty incident triggered",
                    dedup_key=pd_body["dedup_key"],
                    status=resp_data.get("status"),
                    alert=payload.rule_name,
                )
                return {
                    "dedup_key": pd_body["dedup_key"],
                    "status": resp_data.get("status"),
                }

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        routing_key = config["routing_key"]
        dedup_key = firing_meta.get("dedup_key", f"neoguard-{payload.rule_id}")

        pd_body = {
            "routing_key": routing_key,
            "event_action": "resolve",
            "dedup_key": dedup_key,
        }

        async def _do() -> None:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    "https://events.pagerduty.com/v2/enqueue",
                    json=pd_body, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "PagerDuty resolve")
                await log.ainfo(
                    "PagerDuty incident resolved",
                    dedup_key=dedup_key, alert=payload.rule_name,
                )

        await _retry(_do)


class MSTeamsSender(BaseSender):
    """Posts adaptive cards to Microsoft Teams incoming webhook."""

    async def send_firing(self, payload: AlertPayload, config: dict) -> dict:
        webhook_url = validate_outbound_url(config["webhook_url"])
        color = "attention" if payload.severity in ("P1", "P2") else "warning"

        card = {
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "size": "large",
                            "weight": "bolder",
                            "color": color,
                            "text": f"🚨 Alert FIRING: {payload.rule_name}",
                        },
                        {
                            "type": "TextBlock",
                            "text": payload.message,
                            "wrap": True,
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {"title": "Severity", "value": payload.severity.upper()},
                                {"title": "Metric", "value": payload.metric_name},
                                {"title": "Current", "value": f"{payload.current_value:.2f}"},
                                {"title": "Threshold", "value": f"{payload.condition} {payload.threshold}"},
                                {"title": "Fired At", "value": payload.fired_at.isoformat()},
                            ],
                        },
                    ],
                },
            }],
        }

        async def _do() -> dict:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    webhook_url, json=card, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "MS Teams webhook")
                await log.ainfo(
                    "MS Teams notification sent", status=resp.status,
                    alert=payload.rule_name,
                )
                return {"status_code": resp.status}

        return await _retry(_do)

    async def send_resolved(
        self, payload: AlertPayload, config: dict, firing_meta: dict,
    ) -> None:
        webhook_url = validate_outbound_url(config["webhook_url"])

        card = {
            "type": "message",
            "attachments": [{
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "size": "large",
                            "weight": "bolder",
                            "color": "good",
                            "text": f"✅ Alert RESOLVED: {payload.rule_name}",
                        },
                        {
                            "type": "TextBlock",
                            "text": (
                                f"{payload.metric_name} returned to normal "
                                f"(current: {payload.current_value:.2f})"
                            ),
                            "wrap": True,
                        },
                    ],
                },
            }],
        }

        async def _do() -> None:
            async with (
                aiohttp.ClientSession() as session,
                session.post(
                    webhook_url, json=card, timeout=_TIMEOUT_DEFAULT,
                ) as resp,
            ):
                await _check_response(resp, "MS Teams resolved webhook")
                await log.ainfo(
                    "MS Teams resolved sent", status=resp.status,
                    alert=payload.rule_name,
                )

        await _retry(_do)


SENDERS: dict[ChannelType, BaseSender] = {
    ChannelType.WEBHOOK: WebhookSender(),
    ChannelType.SLACK: SlackSender(),
    ChannelType.EMAIL: EmailSender(),
    ChannelType.FRESHDESK: FreshdeskSender(),
    ChannelType.PAGERDUTY: PagerDutySender(),
    ChannelType.MSTEAMS: MSTeamsSender(),
}


def _build_webhook_body(payload: AlertPayload) -> dict:
    return {
        "event_id": payload.event_id,
        "rule_id": payload.rule_id,
        "rule_name": payload.rule_name,
        "metric_name": payload.metric_name,
        "condition": payload.condition,
        "threshold": payload.threshold,
        "current_value": payload.current_value,
        "severity": payload.severity,
        "status": payload.status,
        "message": payload.message,
        "fired_at": payload.fired_at.isoformat(),
        "resolved_at": payload.resolved_at.isoformat() if payload.resolved_at else None,
        "tags_filter": payload.tags_filter,
    }


async def _send_email(config: dict, subject: str, body: str) -> None:
    import smtplib

    smtp_host = config["smtp_host"]
    smtp_port = config.get("smtp_port", 587)
    smtp_user = config.get("smtp_user", "")
    smtp_pass = config.get("smtp_pass", "")
    from_addr = config.get("from", smtp_user)
    to_addrs = config["to"]
    if isinstance(to_addrs, str):
        to_addrs = [to_addrs]

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_addrs)
    msg.set_content(body)

    def _blocking_send():
        ctx = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls(context=ctx)
            if smtp_user:
                server.login(smtp_user, smtp_pass)
            server.send_message(msg)

    try:
        await asyncio.get_running_loop().run_in_executor(None, _blocking_send)
    except Exception as e:
        raise NotificationSendError(0, f"SMTP error: {e}") from e
    await log.ainfo("Email sent", subject=subject, to=to_addrs)
