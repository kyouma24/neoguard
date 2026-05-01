from datetime import datetime

from pydantic import BaseModel, Field


class APIKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    tenant_id: str = "default"
    scopes: list[str] = Field(default_factory=lambda: ["read", "write"])
    rate_limit: int = Field(default=1000, ge=10, le=100000)
    expires_at: datetime | None = None


class APIKeyResponse(BaseModel):
    id: str
    tenant_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    rate_limit: int
    enabled: bool
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class APIKeyCreated(APIKeyResponse):
    """Returned only on creation — includes the full key (shown once, never again)."""
    raw_key: str


class APIKeyUpdate(BaseModel):
    name: str | None = None
    scopes: list[str] | None = None
    rate_limit: int | None = Field(default=None, ge=10, le=100000)
    enabled: bool | None = None
    expires_at: datetime | None = None
