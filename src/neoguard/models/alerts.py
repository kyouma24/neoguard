from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


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


class SilenceScheduleDay(StrEnum):
    MON = "mon"
    TUE = "tue"
    WED = "wed"
    THU = "thu"
    FRI = "fri"
    SAT = "sat"
    SUN = "sun"


class SilenceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    comment: str = ""
    rule_ids: list[str] = Field(default_factory=list)
    matchers: dict[str, str] = Field(default_factory=dict)
    starts_at: datetime
    ends_at: datetime
    timezone: str = "Asia/Kolkata"
    recurring: bool = False
    recurrence_days: list[SilenceScheduleDay] = Field(default_factory=list)
    recurrence_start_time: str | None = None
    recurrence_end_time: str | None = None

    @model_validator(mode="after")
    def validate_silence(self) -> "SilenceCreate":
        if not self.recurring and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at for one-time silences")
        if self.recurring:
            if not self.recurrence_days:
                raise ValueError("recurrence_days required for recurring silences")
            if not self.recurrence_start_time or not self.recurrence_end_time:
                raise ValueError("recurrence_start_time and recurrence_end_time required for recurring silences")
        if not self.rule_ids and not self.matchers:
            raise ValueError("At least one of rule_ids or matchers is required")
        return self


class SilenceUpdate(BaseModel):
    name: str | None = None
    comment: str | None = None
    ends_at: datetime | None = None
    enabled: bool | None = None


class Silence(BaseModel):
    id: str
    tenant_id: str
    name: str
    comment: str
    rule_ids: list[str]
    matchers: dict[str, str]
    starts_at: datetime
    ends_at: datetime
    timezone: str
    recurring: bool
    recurrence_days: list[str]
    recurrence_start_time: str | None
    recurrence_end_time: str | None
    enabled: bool
    created_by: str
    created_at: datetime
    updated_at: datetime


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
    notification_meta: dict = Field(default_factory=dict)
    fired_at: datetime
    resolved_at: datetime | None = None
