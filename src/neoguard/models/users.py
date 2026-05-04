from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

import re

import orjson
from pydantic import BaseModel, EmailStr, Field, field_validator


def _check_password_complexity(v: str) -> str:
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one digit")
    return v


class TenantTier(StrEnum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class TenantStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_DELETION = "pending_deletion"
    DELETED = "deleted"


class TenantRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


# --- Request models ---

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=256)
    tenant_name: str = Field(..., min_length=1, max_length=256)

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class ProfileUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=256)
    current_password: str | None = None
    new_password: str | None = Field(None, min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_complexity(cls, v: str | None) -> str | None:
        if v is not None:
            return _check_password_complexity(v)
        return v


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")


class TenantUpdate(BaseModel):
    name: str | None = None


class InviteCreate(BaseModel):
    email: EmailStr
    role: TenantRole = TenantRole.MEMBER


class MemberRoleUpdate(BaseModel):
    role: TenantRole


# --- Response models ---

class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    is_super_admin: bool
    is_active: bool
    email_verified: bool
    created_at: datetime


class TenantResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    tier: TenantTier
    status: TenantStatus
    created_at: datetime


class MembershipResponse(BaseModel):
    user_id: UUID
    tenant_id: UUID
    role: TenantRole
    joined_at: datetime
    user_email: str | None = None
    user_name: str | None = None


class InviteResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    email: str
    role: TenantRole
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse
    tenant: TenantResponse
    role: TenantRole
    is_impersonating: bool = False
    impersonated_by: str | None = None


class SessionInfo(BaseModel):
    user_id: UUID
    tenant_id: UUID
    role: TenantRole
    is_super_admin: bool
    impersonated_by: UUID | None = None


# --- Admin models ---

class AdminTenantResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    tier: TenantTier
    status: TenantStatus
    member_count: int
    created_at: datetime
    updated_at: datetime | None = None


class AdminUserResponse(BaseModel):
    id: UUID
    email: str
    name: str
    is_super_admin: bool
    is_active: bool
    email_verified: bool
    tenant_count: int
    created_at: datetime
    updated_at: datetime | None = None


class AdminCreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=256)
    tenant_id: UUID | None = None
    role: TenantRole = TenantRole.MEMBER

    @field_validator("password")
    @classmethod
    def _password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class AdminCreateTenantRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    owner_id: UUID | None = None


class AdminSetStatusRequest(BaseModel):
    status: TenantStatus


class AdminSetSuperAdminRequest(BaseModel):
    is_super_admin: bool


class AdminSetActiveRequest(BaseModel):
    is_active: bool


class TenantAuditEntry(BaseModel):
    id: UUID
    tenant_id: UUID
    actor_id: UUID | None = None
    actor_email: str | None = None
    actor_name: str | None = None
    actor_type: str = "user"
    action: str
    resource_type: str
    resource_id: str | None = None
    details: dict = {}
    ip_address: str | None = None
    created_at: datetime

    @field_validator("details", mode="before")
    @classmethod
    def _parse_details(cls, v):
        if isinstance(v, str):
            return orjson.loads(v)
        return v


class PlatformAuditEntry(BaseModel):
    id: UUID
    actor_id: UUID
    actor_email: str | None = None
    actor_name: str | None = None
    action: str
    target_type: str
    target_id: str | None = None
    reason: str
    details: dict = {}
    ip_address: str | None = None
    created_at: datetime

    @field_validator("details", mode="before")
    @classmethod
    def _parse_details(cls, v):
        if isinstance(v, str):
            return orjson.loads(v)
        return v


class SecurityLogEntry(BaseModel):
    id: UUID
    user_id: UUID | None = None
    user_email: str | None = None
    user_name: str | None = None
    event_type: str
    success: bool
    ip_address: str | None = None
    user_agent: str | None = None
    details: dict = {}
    created_at: datetime

    @field_validator("details", mode="before")
    @classmethod
    def _parse_details(cls, v):
        if isinstance(v, str):
            return orjson.loads(v)
        return v


class PlatformStatsResponse(BaseModel):
    tenants: dict
    users: dict
    memberships: int
    api_keys_active: int


class ImpersonateRequest(BaseModel):
    user_id: UUID
    reason: str = Field(..., min_length=1, max_length=500)
    duration_minutes: int = Field(default=30, ge=5, le=120)


class ImpersonateResponse(BaseModel):
    message: str
    impersonating: str
    expires_in_minutes: int
