from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class PanelType(StrEnum):
    TIMESERIES = "timeseries"
    STAT = "stat"
    TABLE = "table"
    LOG = "log"
    ALERT_LIST = "alert_list"


class PanelDefinition(BaseModel):
    id: str
    title: str
    panel_type: PanelType
    metric_name: str | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    aggregation: str = "avg"
    query: str | None = None
    width: int = Field(default=6, ge=1, le=12)
    height: int = Field(default=4, ge=1, le=12)
    position_x: int = Field(default=0, ge=0, le=11)
    position_y: int = Field(default=0, ge=0)


class DashboardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = ""
    panels: list[PanelDefinition] = Field(default_factory=list)


class DashboardUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    panels: list[PanelDefinition] | None = None


class Dashboard(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str
    panels: list[PanelDefinition]
    created_at: datetime
    updated_at: datetime
