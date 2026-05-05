from datetime import datetime

from pydantic import BaseModel, Field

from neoguard.core.regions import AWS_DEFAULT_REGIONS


class AWSAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    account_id: str = Field(..., pattern=r"^\d{12}$")
    role_arn: str = Field(
        default="",
        pattern=r"^$|^arn:aws:iam::\d{12}:role/[\w+=,.@\-/]+$",
    )
    external_id: str = Field(default="", max_length=256)
    regions: list[str] = Field(default_factory=lambda: list(AWS_DEFAULT_REGIONS))
    collect_config: dict = Field(default_factory=dict)


class AWSAccountUpdate(BaseModel):
    name: str | None = None
    role_arn: str | None = None
    external_id: str | None = None
    regions: list[str] | None = None
    enabled: bool | None = None
    collect_config: dict | None = None


class AWSAccount(BaseModel):
    id: str
    tenant_id: str
    name: str
    account_id: str
    role_arn: str
    external_id: str
    regions: list[str]
    enabled: bool
    collect_config: dict
    last_sync_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CollectionJob(BaseModel):
    id: str
    tenant_id: str
    job_type: str
    target_id: str
    status: str
    config: dict
    result: dict
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str
    created_at: datetime
