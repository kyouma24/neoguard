from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class LogSeverity(StrEnum):
    TRACE = "trace"
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
    FATAL = "fatal"


class LogEntry(BaseModel):
    timestamp: datetime | None = None
    severity: LogSeverity = LogSeverity.INFO
    service: str = Field(..., min_length=1, max_length=256)
    message: str = Field(..., min_length=1, max_length=65536)
    trace_id: str = ""
    span_id: str = ""
    attributes: dict[str, str] = Field(default_factory=dict)
    resource: dict[str, str] = Field(default_factory=dict)


class LogBatch(BaseModel):
    logs: list[LogEntry] = Field(..., min_length=1, max_length=5000)
    tenant_id: str | None = None


class LogQuery(BaseModel):
    query: str = ""
    service: str | None = None
    severity: LogSeverity | None = None
    start: datetime | None = None
    end: datetime | None = None
    limit: int = Field(default=100, ge=1, le=5000)
    offset: int = Field(default=0, ge=0)
    tenant_id: str | None = None


class LogQueryResult(BaseModel):
    logs: list[LogEntry]
    total: int
    has_more: bool
