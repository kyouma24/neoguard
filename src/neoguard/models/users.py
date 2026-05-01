from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class TenantTier(StrEnum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class TenantStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING_DELETION = "pending_deletion"


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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


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


class AdminSetStatusRequest(BaseModel):
    status: TenantStatus


class AdminSetSuperAdminRequest(BaseModel):
    is_super_admin: bool


class AdminSetActiveRequest(BaseModel):
    is_active: bool


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
