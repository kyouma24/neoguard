"""Notification dispatcher — routes alert events to configured channels.

The alert engine calls dispatch_firing() and dispatch_resolved(). The dispatcher
looks up the rule's notification.channel_ids, fetches enabled channels, and fans
out to the correct sender for each channel type.

Stores per-channel metadata (e.g. Freshdesk ticket IDs) in
alert_events.notification_meta JSONB so resolved notifications can reference
the original firing context.
"""

from __future__ import annotations

import orjson

from neoguard.core.logging import log
from neoguard.db.timescale.connection import get_pool
from neoguard.models.notifications import AlertPayload, ChannelType
from neoguard.services.notifications.crud import list_enabled_channels
from neoguard.services.notifications.senders import SENDERS


async def dispatch_firing(
    payload: AlertPayload, notification_config: dict,
) -> None:
    channel_ids = notification_config.get("channel_ids", [])
    if not channel_ids:
        return

    channels = await list_enabled_channels(payload.tenant_id, channel_ids)
    if not channels:
        await log.awarn(
            "No enabled channels found for alert",
            rule_id=payload.rule_id, channel_ids=channel_ids,
        )
        return

    all_meta: dict[str, dict] = {}

    for ch in channels:
        sender = SENDERS.get(ChannelType(ch.channel_type))
        if not sender:
            await log.awarn("No sender for channel type", channel_type=ch.channel_type)
            continue
        try:
            meta = await sender.send_firing(payload, ch.config)
            all_meta[ch.id] = {**(meta or {}), "delivered": True}
            await log.ainfo(
                "Notification dispatched",
                channel=ch.name, channel_type=ch.channel_type,
                rule=payload.rule_name, meta=meta,
            )
        except Exception as e:
            all_meta[ch.id] = {"delivered": False, "error": str(e)}
            await log.aerror(
                "Notification send failed",
                channel=ch.name, channel_type=ch.channel_type,
                rule=payload.rule_name, error=str(e),
            )

    if all_meta:
        await _store_notification_meta(payload.event_id, all_meta)


async def dispatch_resolved(
    payload: AlertPayload, notification_config: dict,
) -> None:
    channel_ids = notification_config.get("channel_ids", [])
    if not channel_ids:
        return

    channels = await list_enabled_channels(payload.tenant_id, channel_ids)
    if not channels:
        return

    firing_meta = await _load_notification_meta(payload.rule_id, payload.tenant_id)

    for ch in channels:
        sender = SENDERS.get(ChannelType(ch.channel_type))
        if not sender:
            continue
        try:
            ch_meta = firing_meta.get(ch.id, {})
            await sender.send_resolved(payload, ch.config, ch_meta)
            await log.ainfo(
                "Resolution dispatched",
                channel=ch.name, channel_type=ch.channel_type,
                rule=payload.rule_name,
            )
        except Exception as e:
            await log.aerror(
                "Resolution send failed",
                channel=ch.name, channel_type=ch.channel_type,
                rule=payload.rule_name, error=str(e),
            )


async def _store_notification_meta(event_id: str, meta: dict) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE alert_events
            SET notification_meta = $2::jsonb
            WHERE id = $1
            """,
            event_id,
            orjson.dumps(meta).decode(),
        )


async def _load_notification_meta(rule_id: str, tenant_id: str) -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT notification_meta FROM alert_events
            WHERE rule_id = $1 AND tenant_id = $2 AND status = 'firing'
            ORDER BY fired_at DESC LIMIT 1
            """,
            rule_id, tenant_id,
        )
    if not row:
        return {}

    meta = row["notification_meta"]
    if isinstance(meta, str):
        try:
            return orjson.loads(meta)
        except Exception:
            return {}
    return meta if isinstance(meta, dict) else {}
