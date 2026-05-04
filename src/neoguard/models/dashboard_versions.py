from datetime import datetime

from pydantic import BaseModel, Field


class DashboardVersion(BaseModel):
    id: str
    dashboard_id: str
    version_number: int
    data: dict
    change_summary: str = ""
    created_by: str
    created_at: datetime


class DashboardVersionCreate(BaseModel):
    change_summary: str = Field(default="", max_length=256)
