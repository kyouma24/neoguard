from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class MetricType(StrEnum):
    GAUGE = "gauge"
    COUNTER = "counter"
    HISTOGRAM = "histogram"


class MetricPoint(BaseModel):
    name: str = Field(..., min_length=1, max_length=512, pattern=r"^[a-zA-Z_][a-zA-Z0-9_.]*$")
    value: float
    timestamp: datetime | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    metric_type: MetricType = MetricType.GAUGE


class MetricBatch(BaseModel):
    metrics: list[MetricPoint] = Field(..., min_length=1, max_length=10000)
    tenant_id: str | None = None


class MetricQuery(BaseModel):
    name: str
    tags: dict[str, str] = Field(default_factory=dict)
    start: datetime
    end: datetime
    interval: str = "1m"
    aggregation: str = "avg"
    tenant_id: str | None = None


class MetricQueryResult(BaseModel):
    name: str
    tags: dict[str, str]
    datapoints: list[tuple[datetime, float | None]]


class AggregationFunc(StrEnum):
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    SUM = "sum"
    COUNT = "count"
    P50 = "p50"
    P95 = "p95"
    P99 = "p99"
