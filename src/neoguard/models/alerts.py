from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class AlertCondition(StrEnum):
    GT = "gt"
    LT = "lt"
    GTE = "gte"
    LTE = "lte"
    EQ = "eq"
    NE = "ne"


class AlertSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(StrEnum):
    OK = "ok"
    PENDING = "pending"
    FIRING = "firing"
    RESOLVED = "resolved"


class AlertRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""
    metric_name: str = Field(..., min_length=1)
    tags_filter: dict[str, str] = Field(default_factory=dict)
    condition: AlertCondition
    threshold: float
    duration_sec: int = Field(default=60, ge=10, le=3600)
    interval_sec: int = Field(default=30, ge=10, le=600)
    severity: AlertSeverity = AlertSeverity.WARNING
    notification: dict = Field(default_factory=dict)


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    threshold: float | None = None
    duration_sec: int | None = Field(default=None, ge=10, le=3600)
    interval_sec: int | None = Field(default=None, ge=10, le=600)
    severity: AlertSeverity | None = None
    enabled: bool | None = None
    notification: dict | None = None


class AlertRule(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str
    metric_name: str
    tags_filter: dict[str, str]
    condition: AlertCondition
    threshold: float
    duration_sec: int
    interval_sec: int
    severity: AlertSeverity
    enabled: bool
    notification: dict
    created_at: datetime
    updated_at: datetime


class AlertEvent(BaseModel):
    id: str
    tenant_id: str
    rule_id: str
    status: AlertStatus
    value: float
    threshold: float
    message: str
    fired_at: datetime
    resolved_at: datetime | None = None
