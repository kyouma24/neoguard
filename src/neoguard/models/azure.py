from datetime import datetime

from pydantic import BaseModel, Field

from neoguard.core.regions import AZURE_DEFAULT_REGIONS


class AzureSubscriptionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    subscription_id: str = Field(..., pattern=r"^[0-9a-f-]{36}$")
    tenant_id: str = Field(..., pattern=r"^[0-9a-f-]{36}$")
    client_id: str = Field(..., min_length=1)
    client_secret: str = Field(..., min_length=1)
    regions: list[str] = Field(default_factory=lambda: list(AZURE_DEFAULT_REGIONS))
    collect_config: dict = Field(default_factory=dict)


class AzureSubscriptionUpdate(BaseModel):
    name: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    regions: list[str] | None = None
    enabled: bool | None = None
    collect_config: dict | None = None


class AzureSubscription(BaseModel):
    id: str
    tenant_id: str  # NeoGuard tenant
    name: str
    subscription_id: str
    azure_tenant_id: str
    client_id: str
    regions: list[str]
    enabled: bool
    collect_config: dict
    last_sync_at: datetime | None
    created_at: datetime
    updated_at: datetime
