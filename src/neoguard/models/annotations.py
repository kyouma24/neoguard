from datetime import datetime

from pydantic import BaseModel, Field


class AnnotationCreate(BaseModel):
    dashboard_id: str | None = None
    title: str = Field(..., min_length=1, max_length=256)
    text: str = Field(default="", max_length=4096)
    tags: list[str] = Field(default_factory=list, max_length=20)
    starts_at: datetime
    ends_at: datetime | None = None


class AnnotationUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=256)
    text: str | None = Field(default=None, max_length=4096)
    tags: list[str] | None = Field(default=None, max_length=20)
    ends_at: datetime | None = None


class Annotation(BaseModel):
    id: str
    tenant_id: str
    dashboard_id: str | None = None
    title: str
    text: str
    tags: list[str]
    starts_at: datetime
    ends_at: datetime | None = None
    created_by: str
    created_at: datetime
