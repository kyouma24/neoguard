from fastapi import APIRouter, Depends, HTTPException

from neoguard.api.deps import get_tenant_id
from neoguard.models.alerts import (
    AlertEvent,
    AlertRule,
    AlertRuleCreate,
    AlertRuleUpdate,
    AlertStatus,
)
from neoguard.services.alerts.crud import (
    create_alert_rule,
    delete_alert_rule,
    get_alert_rule,
    list_alert_events,
    list_alert_rules,
    update_alert_rule,
)

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.post("/rules", status_code=201)
async def create_rule(
    data: AlertRuleCreate,
    tenant_id: str = Depends(get_tenant_id),
) -> AlertRule:
    return await create_alert_rule(tenant_id, data)


@router.get("/rules")
async def list_rules(
    tenant_id: str = Depends(get_tenant_id),
) -> list[AlertRule]:
    return await list_alert_rules(tenant_id)


@router.get("/rules/{rule_id}")
async def get_rule(
    rule_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> AlertRule:
    rule = await get_alert_rule(tenant_id, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    data: AlertRuleUpdate,
    tenant_id: str = Depends(get_tenant_id),
) -> AlertRule:
    rule = await update_alert_rule(tenant_id, rule_id, data)
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    tenant_id: str = Depends(get_tenant_id),
) -> None:
    deleted = await delete_alert_rule(tenant_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Alert rule not found")


@router.get("/events")
async def list_events(
    rule_id: str | None = None,
    status: AlertStatus | None = None,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
) -> list[AlertEvent]:
    return await list_alert_events(tenant_id, rule_id=rule_id, status=status, limit=limit)
