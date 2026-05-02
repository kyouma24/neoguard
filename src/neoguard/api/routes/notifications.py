from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required, require_scope
from neoguard.models.notifications import (
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
)
from neoguard.services.notifications.crud import (
    create_channel,
    delete_channel,
    get_channel,
    get_notification_delivery,
    list_channels,
    list_notification_deliveries,
    update_channel,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.post(
    "/channels",
    status_code=201,
    dependencies=[Depends(require_scope("admin"))],
)
async def create(
    data: NotificationChannelCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> NotificationChannel:
    return await create_channel(tenant_id, data)


@router.get("/channels")
async def list_all(
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[NotificationChannel]:
    return await list_channels(tenant_id, limit=min(limit, 500), offset=offset)


@router.get("/channels/{channel_id}")
async def get_one(
    channel_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> NotificationChannel:
    ch = await get_channel(tenant_id, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    return ch


@router.patch(
    "/channels/{channel_id}",
    dependencies=[Depends(require_scope("admin"))],
)
async def update(
    channel_id: str,
    data: NotificationChannelUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> NotificationChannel:
    try:
        ch = await update_channel(tenant_id, channel_id, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")
    return ch


@router.delete(
    "/channels/{channel_id}",
    status_code=204,
    dependencies=[Depends(require_scope("admin"))],
)
async def delete(
    channel_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_channel(tenant_id, channel_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Channel not found")


@router.post(
    "/channels/{channel_id}/test",
    status_code=200,
    dependencies=[Depends(require_scope("admin"))],
)
async def test_channel(
    channel_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> dict:
    """Send a test notification through a channel to verify configuration."""
    from datetime import UTC, datetime

    from neoguard.models.notifications import AlertPayload, ChannelType
    from neoguard.services.notifications.senders import (
        SENDERS,
        NotificationSendError,
    )

    ch = await get_channel(tenant_id, channel_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    sender = SENDERS.get(ChannelType(ch.channel_type))
    if not sender:
        raise HTTPException(
            status_code=400,
            detail=f"No sender for channel type: {ch.channel_type}",
        )

    try:
        meta = await sender.test_connection(ch.config)
        if meta is not None:
            return {"success": True, "meta": meta}
    except NotificationSendError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Connection test failed (HTTP {e.status}): {e}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Connection test failed: {e}",
        ) from e

    test_payload = AlertPayload(
        event_id="test-000",
        rule_id="test-rule",
        rule_name="Test Alert (NeoGuard)",
        metric_name="system.cpu.utilization",
        condition="gt",
        threshold=90.0,
        current_value=95.5,
        severity="warning",
        status="firing",
        message="This is a test notification from NeoGuard.",
        tenant_id=tenant_id,
        fired_at=datetime.now(UTC),
    )

    try:
        meta = await sender.send_firing(test_payload, ch.config)
        return {"success": True, "meta": meta}
    except NotificationSendError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Test notification failed (HTTP {e.status}): {e}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Test notification failed: {e}",
        ) from e


@router.get("/delivery/{event_id}")
async def get_delivery(
    event_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    """View notification delivery results for a specific alert event."""
    result = await get_notification_delivery(tenant_id, event_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return result


@router.get("/delivery")
async def list_deliveries(
    rule_id: str | None = None,
    limit: int = 50,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[dict]:
    """List recent notification delivery results."""
    return await list_notification_deliveries(
        tenant_id, rule_id=rule_id, limit=min(limit, 200),
    )
