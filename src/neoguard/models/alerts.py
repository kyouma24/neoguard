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


class AlertAggregation(StrEnum):
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    SUM = "sum"
    COUNT = "count"
    LAST = "last"
    P95 = "p95"
    P99 = "p99"


class NoDataAction(StrEnum):
    OK = "ok"
    KEEP = "keep"
    ALERT = "alert"


class AlertSeverity(StrEnum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class AlertStatus(StrEnum):
    OK = "ok"
    PENDING = "pending"
    FIRING = "firing"
    RESOLVED = "resolved"
    NODATA = "nodata"


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
    rule_ids: list[str] | None = None
    matchers: dict[str, str] | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    timezone: str | None = None
    recurring: bool | None = None
    recurrence_days: list[SilenceScheduleDay] | None = None
    recurrence_start_time: str | None = None
    recurrence_end_time: str | None = None
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
    severity: AlertSeverity = AlertSeverity.P3
    notification: dict = Field(default_factory=dict)
    aggregation: AlertAggregation = AlertAggregation.AVG
    cooldown_sec: int = Field(default=300, ge=0, le=86400)
    nodata_action: NoDataAction = NoDataAction.OK


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    metric_name: str | None = None
    tags_filter: dict[str, str] | None = None
    condition: AlertCondition | None = None
    threshold: float | None = None
    duration_sec: int | None = Field(default=None, ge=10, le=3600)
    interval_sec: int | None = Field(default=None, ge=10, le=600)
    severity: AlertSeverity | None = None
    enabled: bool | None = None
    notification: dict | None = None
    aggregation: AlertAggregation | None = None
    cooldown_sec: int | None = Field(default=None, ge=0, le=86400)
    nodata_action: NoDataAction | None = None


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
    aggregation: AlertAggregation
    cooldown_sec: int
    nodata_action: NoDataAction
    created_at: datetime
    updated_at: datetime


class AlertEvent(BaseModel):
    id: str
    tenant_id: str
    rule_id: str
    rule_name: str
    severity: AlertSeverity
    status: AlertStatus
    value: float
    threshold: float
    message: str
    notification_meta: dict = Field(default_factory=dict)
    fired_at: datetime
    resolved_at: datetime | None = None
    acknowledged_at: datetime | None = None
    acknowledged_by: str = ""


class AlertAcknowledge(BaseModel):
    acknowledged_by: str = Field(..., min_length=1, max_length=256)


class AlertRulePreview(BaseModel):
    metric_name: str = Field(..., min_length=1)
    tags_filter: dict[str, str] = Field(default_factory=dict)
    condition: AlertCondition
    threshold: float
    duration_sec: int = Field(default=60, ge=10, le=3600)
    aggregation: AlertAggregation = AlertAggregation.AVG
    lookback_hours: int = Field(default=24, ge=1, le=168)


class AlertPreviewResult(BaseModel):
    would_fire: bool
    current_value: float | None
    datapoints: int
    simulated_events: list[dict]
