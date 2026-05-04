from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

# Regex to strip ASCII control characters (0x00-0x1F, 0x7F) from URLs
# before scheme validation.  Prevents obfuscation like "java\tscript:".
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

_SAFE_URL_PREFIXES = ("https://", "http://", "mailto:", "/")
_BLOCKED_SCHEMES = ("javascript:", "data:", "vbscript:")


class PanelType(StrEnum):
    TIMESERIES = "timeseries"
    AREA = "area"
    STAT = "stat"
    TOP_LIST = "top_list"
    PIE = "pie"
    TEXT = "text"
    GAUGE = "gauge"
    TABLE = "table"
    SCATTER = "scatter"
    HISTOGRAM = "histogram"
    CHANGE = "change"
    STATUS = "status"
    HEXBIN_MAP = "hexbin_map"
    HEATMAP = "heatmap"
    TREEMAP = "treemap"
    GEOMAP = "geomap"
    SANKEY = "sankey"
    TOPOLOGY = "topology"
    SPARKLINE_TABLE = "sparkline_table"
    BAR_GAUGE = "bar_gauge"
    RADAR = "radar"
    CANDLESTICK = "candlestick"
    CALENDAR_HEATMAP = "calendar_heatmap"
    BUBBLE = "bubble"
    WATERFALL = "waterfall"
    BOX_PLOT = "box_plot"
    FUNNEL = "funnel"
    SLO_TRACKER = "slo_tracker"
    ALERT_LIST = "alert_list"
    LOG_STREAM = "log_stream"
    RESOURCE_INVENTORY = "resource_inventory"
    PROGRESS = "progress"
    FORECAST_LINE = "forecast_line"
    DIFF_COMPARISON = "diff_comparison"


class PanelDefinition(BaseModel):
    id: str = Field(..., max_length=64)
    title: str = Field(..., max_length=256)
    panel_type: PanelType
    metric_name: str | None = Field(default=None, max_length=256)
    tags: dict[str, str] = Field(default_factory=dict)
    aggregation: str = Field(default="avg", max_length=32)
    mql_query: str | None = Field(default=None, max_length=2000)
    display_options: dict = Field(default_factory=dict)
    content: str = Field(default="", max_length=65536)
    width: int = Field(default=6, ge=1, le=12)
    height: int = Field(default=4, ge=1, le=12)
    position_x: int = Field(default=0, ge=0, le=11)
    position_y: int = Field(default=0, ge=0)


class VariableType(StrEnum):
    QUERY = "query"
    CUSTOM = "custom"
    TEXTBOX = "textbox"


class DashboardVariable(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    label: str = ""
    type: VariableType = VariableType.QUERY
    tag_key: str | None = None
    values: list[str] = Field(default_factory=list)
    default_value: str = ""
    multi: bool = False
    include_all: bool = False
    depends_on: str | None = None


class PanelGroup(BaseModel):
    id: str
    label: str = ""
    collapsed: bool = False
    panel_ids: list[str] = Field(default_factory=list)


class DashboardLink(BaseModel):
    label: str = Field(..., min_length=1, max_length=128)
    url: str = Field(..., min_length=1, max_length=2048)
    tooltip: str = ""
    include_vars: bool = False
    include_time: bool = False

    @field_validator("url")
    @classmethod
    def reject_unsafe_schemes(cls, v: str) -> str:
        # Strip control characters + surrounding whitespace, then lowercase
        cleaned = _CONTROL_CHARS.sub("", v).strip().lower()

        # Explicit blocklist — catches obfuscated variants too
        for scheme in _BLOCKED_SCHEMES:
            if cleaned.startswith(scheme):
                raise ValueError(f"URL scheme '{scheme}' is not allowed")

        # Allowlist: only safe schemes permitted
        if not any(cleaned.startswith(prefix) for prefix in _SAFE_URL_PREFIXES):
            raise ValueError(
                "URL must start with https://, http://, mailto:, or / (relative path)"
            )

        return _CONTROL_CHARS.sub("", v).strip()


class DashboardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str = Field(default="", max_length=4096)
    panels: list[PanelDefinition] = Field(default_factory=list, max_length=50)
    variables: list[DashboardVariable] = Field(default_factory=list, max_length=20)
    groups: list[PanelGroup] = Field(default_factory=list, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    links: list[DashboardLink] = Field(default_factory=list, max_length=20)
    layout_version: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def _unique_panel_ids(self) -> "DashboardCreate":
        ids = [p.id for p in self.panels]
        if len(ids) != len(set(ids)):
            raise ValueError("Panel IDs must be unique within a dashboard")
        return self


class DashboardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4096)
    panels: list[PanelDefinition] | None = Field(default=None, max_length=50)
    variables: list[DashboardVariable] | None = Field(default=None, max_length=20)
    groups: list[PanelGroup] | None = Field(default=None, max_length=20)
    tags: list[str] | None = Field(default=None, max_length=20)
    links: list[DashboardLink] | None = Field(default=None, max_length=20)
    layout_version: int | None = Field(default=None, ge=1)


class Dashboard(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str
    panels: list[PanelDefinition]
    variables: list[DashboardVariable] = Field(default_factory=list)
    groups: list[PanelGroup] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    links: list[DashboardLink] = Field(default_factory=list)
    layout_version: int = 1
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class DashboardTag(BaseModel):
    tenant_id: str
    dashboard_id: str
    tag: str


class DashboardView(BaseModel):
    id: int
    tenant_id: str
    dashboard_id: str
    user_id: str
    viewed_at: datetime


class DashboardFavorite(BaseModel):
    tenant_id: str
    user_id: str
    dashboard_id: str
    favorited_at: datetime


class DashboardPermissionLevel(StrEnum):
    VIEW = "view"
    EDIT = "edit"
    ADMIN = "admin"


PERMISSION_HIERARCHY = {
    DashboardPermissionLevel.VIEW: 0,
    DashboardPermissionLevel.EDIT: 1,
    DashboardPermissionLevel.ADMIN: 2,
}


class DashboardPermission(BaseModel):
    id: int
    tenant_id: str
    dashboard_id: str
    user_id: UUID
    permission: DashboardPermissionLevel
    granted_by: UUID | None = None
    created_at: datetime


class DashboardPermissionSet(BaseModel):
    user_id: UUID
    permission: DashboardPermissionLevel


class DashboardPermissionResponse(BaseModel):
    id: int
    dashboard_id: str
    user_id: UUID
    user_email: str | None = None
    user_name: str | None = None
    permission: DashboardPermissionLevel
    granted_by: UUID | None = None
    created_at: datetime
