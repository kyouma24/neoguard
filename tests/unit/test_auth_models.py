"""Unit tests for auth/user Pydantic models."""

from uuid import UUID

import pytest
from pydantic import ValidationError

from neoguard.models.users import (
    AdminSetActiveRequest,
    AdminSetStatusRequest,
    AdminSetSuperAdminRequest,
    AdminTenantResponse,
    AdminUserResponse,
    AuthResponse,
    InviteCreate,
    LoginRequest,
    MemberRoleUpdate,
    MembershipResponse,
    PlatformAuditEntry,
    PlatformStatsResponse,
    SessionInfo,
    SignupRequest,
    TenantCreate,
    TenantRole,
    TenantStatus,
    TenantTier,
    TenantUpdate,
    UserResponse,
)


class TestTenantEnums:
    def test_tier_values(self):
        assert TenantTier.FREE == "free"
        assert TenantTier.PRO == "pro"
        assert TenantTier.ENTERPRISE == "enterprise"

    def test_status_values(self):
        assert TenantStatus.ACTIVE == "active"
        assert TenantStatus.SUSPENDED == "suspended"
        assert TenantStatus.PENDING_DELETION == "pending_deletion"

    def test_role_values(self):
        assert TenantRole.OWNER == "owner"
        assert TenantRole.ADMIN == "admin"
        assert TenantRole.MEMBER == "member"
        assert TenantRole.VIEWER == "viewer"


class TestSignupRequest:
    def test_valid_signup(self):
        req = SignupRequest(email="test@example.com", password="12345678", name="Test", tenant_name="Acme")
        assert req.email == "test@example.com"

    def test_short_password_rejected(self):
        with pytest.raises(ValidationError):
            SignupRequest(email="test@example.com", password="short", name="Test", tenant_name="Acme")

    def test_invalid_email_rejected(self):
        with pytest.raises(ValidationError):
            SignupRequest(email="not-an-email", password="12345678", name="Test", tenant_name="Acme")

    def test_empty_name_rejected(self):
        with pytest.raises(ValidationError):
            SignupRequest(email="test@example.com", password="12345678", name="", tenant_name="Acme")


class TestLoginRequest:
    def test_valid_login(self):
        req = LoginRequest(email="test@example.com", password="mypassword")
        assert req.password == "mypassword"

    def test_empty_password_rejected(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="test@example.com", password="")


class TestTenantCreate:
    def test_valid_slug(self):
        tc = TenantCreate(name="Acme", slug="acme-corp")
        assert tc.slug == "acme-corp"

    def test_invalid_slug_rejected(self):
        with pytest.raises(ValidationError):
            TenantCreate(name="Acme", slug="UPPER CASE")

    def test_slug_with_leading_hyphen_rejected(self):
        with pytest.raises(ValidationError):
            TenantCreate(name="Acme", slug="-bad-slug")


class TestSessionInfo:
    def test_round_trip(self):
        info = SessionInfo(
            user_id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
            tenant_id=UUID("fedcba98-7654-3210-fedc-ba9876543210"),
            role=TenantRole.OWNER,
            is_super_admin=True,
        )
        assert info.role == TenantRole.OWNER
        assert info.is_super_admin is True


class TestAuthResponse:
    def test_full_response(self):
        resp = AuthResponse(
            user=UserResponse(
                id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
                email="test@example.com",
                name="Test",
                is_super_admin=False,
                is_active=True,
                email_verified=False,
                created_at="2024-01-01T00:00:00Z",
            ),
            tenant={"id": UUID("fedcba98-7654-3210-fedc-ba9876543210"),
                     "slug": "acme", "name": "Acme", "tier": "free",
                     "status": "active", "created_at": "2024-01-01T00:00:00Z"},
            role=TenantRole.OWNER,
        )
        assert resp.role == "owner"
        assert resp.user.email == "test@example.com"


class TestAdminModels:
    def test_admin_tenant_response(self):
        resp = AdminTenantResponse(
            id=UUID("fedcba98-7654-3210-fedc-ba9876543210"),
            slug="acme", name="Acme", tier="free", status="active",
            member_count=5, created_at="2024-01-01T00:00:00Z",
        )
        assert resp.member_count == 5

    def test_admin_user_response(self):
        resp = AdminUserResponse(
            id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
            email="a@b.com", name="A", is_super_admin=False,
            is_active=True, email_verified=False, tenant_count=3,
            created_at="2024-01-01T00:00:00Z",
        )
        assert resp.tenant_count == 3

    def test_admin_set_status_request(self):
        req = AdminSetStatusRequest(status="suspended")
        assert req.status == TenantStatus.SUSPENDED

    def test_admin_set_super_admin_request(self):
        req = AdminSetSuperAdminRequest(is_super_admin=True)
        assert req.is_super_admin is True

    def test_platform_stats_response(self):
        resp = PlatformStatsResponse(
            tenants={"total": 10, "active": 8},
            users={"total": 20, "active": 18},
            memberships=30,
            api_keys_active=5,
        )
        assert resp.memberships == 30

    def test_platform_audit_entry(self):
        entry = PlatformAuditEntry(
            id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
            actor_id=UUID("01234567-89ab-cdef-0123-456789abcdef"),
            action="user.activate",
            target_type="user",
            target_id="abc",
            reason="",
            created_at="2024-01-01T00:00:00Z",
        )
        assert entry.action == "user.activate"


class TestInviteAndMembership:
    def test_invite_default_role(self):
        invite = InviteCreate(email="new@example.com")
        assert invite.role == TenantRole.MEMBER

    def test_member_role_update(self):
        update = MemberRoleUpdate(role="admin")
        assert update.role == TenantRole.ADMIN

    def test_tenant_update(self):
        update = TenantUpdate(name="New Name")
        assert update.name == "New Name"

    def test_admin_set_active(self):
        req = AdminSetActiveRequest(is_active=False)
        assert req.is_active is False
