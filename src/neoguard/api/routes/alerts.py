from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id, get_tenant_id_required
from neoguard.models.alerts import (
    AlertAcknowledge,
    AlertEvent,
    AlertPreviewResult,
    AlertRule,
    AlertRuleCreate,
    AlertRulePreview,
    AlertRuleUpdate,
    AlertStatus,
    Silence,
    SilenceCreate,
    SilenceUpdate,
)
from neoguard.services.alerts.crud import (
    acknowledge_alert_event,
    create_alert_rule,
    delete_alert_rule,
    get_alert_rule,
    list_alert_events,
    list_alert_rules,
    preview_alert_rule,
    update_alert_rule,
)
from neoguard.services.alerts.silences import (
    create_silence,
    delete_silence,
    get_silence,
    list_silences,
    update_silence,
)

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.post("/rules", status_code=201)
async def create_rule(
    data: AlertRuleCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AlertRule:
    return await create_alert_rule(tenant_id, data)


@router.get("/rules")
async def list_rules(
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[AlertRule]:
    return await list_alert_rules(tenant_id, limit=min(limit, 500), offset=offset)


@router.get("/rules/{rule_id}")
async def get_rule(
    rule_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> AlertRule:
    rule = await get_alert_rule(tenant_id, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    data: AlertRuleUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AlertRule:
    rule = await update_alert_rule(tenant_id, rule_id, data)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_alert_rule(tenant_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert rule not found")


@router.get("/events")
async def list_events(
    rule_id: str | None = None,
    status: AlertStatus | None = None,
    severity: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: int = 50,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[AlertEvent]:
    return await list_alert_events(
        tenant_id, rule_id=rule_id, status=status,
        severity=severity, start=start, end=end, limit=limit,
    )


@router.post("/events/{event_id}/ack")
async def acknowledge_event(
    event_id: str,
    data: AlertAcknowledge,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AlertEvent:
    event = await acknowledge_alert_event(tenant_id, event_id, data.acknowledged_by)
    if not event:
        raise HTTPException(status_code=404, detail="Alert event not found")
    return event


@router.post("/rules/preview")
async def preview_rule(
    data: AlertRulePreview,
    tenant_id: str = Depends(get_tenant_id_required),
) -> AlertPreviewResult:
    return await preview_alert_rule(tenant_id, data)


# ── Silence endpoints ──────────────────────────────────────────────


@router.post("/silences", status_code=201)
async def create_silence_route(
    data: SilenceCreate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> Silence:
    return await create_silence(tenant_id, data)


@router.get("/silences")
async def list_silences_route(
    limit: int = 50,
    offset: int = 0,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[Silence]:
    return await list_silences(tenant_id, limit=min(limit, 500), offset=offset)


@router.get("/silences/{silence_id}")
async def get_silence_route(
    silence_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> Silence:
    silence = await get_silence(tenant_id, silence_id)
    if not silence:
        raise HTTPException(status_code=404, detail="Silence not found")
    return silence


@router.patch("/silences/{silence_id}")
async def update_silence_route(
    silence_id: str,
    data: SilenceUpdate,
    tenant_id: str = Depends(get_tenant_id_required),
) -> Silence:
    silence = await update_silence(tenant_id, silence_id, data)
    if not silence:
        raise HTTPException(status_code=404, detail="Silence not found")
    return silence


@router.delete("/silences/{silence_id}", status_code=204)
async def delete_silence_route(
    silence_id: str,
    tenant_id: str = Depends(get_tenant_id_required),
) -> None:
    deleted = await delete_silence(tenant_id, silence_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Silence not found")
