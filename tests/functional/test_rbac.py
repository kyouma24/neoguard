"""
NeoGuard RBAC Functional Test Suite
====================================

Comprehensive tests for Role-Based Access Control:
- 4 roles: owner > admin > member > viewer
- Super admin bypass (platform-wide access)
- Tenant isolation (cross-tenant data must be invisible)
- Admin panel RBAC (create user with role/tenant, manage memberships)
- Scope enforcement (read/write/admin per role)
- Role change, removal, and escalation protection

Run: NEOGUARD_DEBUG=true NEOGUARD_DB_PORT=5433 python -m pytest tests/functional/test_rbac.py -v --tb=short

Prerequisites:
  - TimescaleDB running on :5433
  - Redis running on :6379
  - ClickHouse running on :8123
  - API server running on :8000
  - Super admin bootstrapped (admin@neoguard.dev / SuperAdmin1!)
"""

from __future__ import annotations

import secrets
from uuid import UUID

import httpx
import pytest
import redis as redis_lib


BASE = "http://localhost:8000"

SUPER_ADMIN_EMAIL = "admin@neoguard.dev"
SUPER_ADMIN_PASSWORD = "SuperAdmin1!"


def _clear_rate_limits():
    try:
        r = redis_lib.Redis(host="localhost", port=6379, decode_responses=True)
        for k in r.keys("rl:*"):
            r.delete(k)
        r.close()
    except Exception:
        pass


def _login(email: str, password: str) -> dict:
    _clear_rate_limits()
    resp = httpx.post(
        f"{BASE}/auth/login",
        json={"email": email, "password": password},
        timeout=15.0,
    )
    assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
    cookies = dict(resp.cookies)
    return {
        "session": cookies.get("neoguard_session", ""),
        "csrf": cookies.get("neoguard_csrf", ""),
        "data": resp.json(),
    }


def _signup(email: str, password: str, name: str, tenant_name: str) -> dict:
    _clear_rate_limits()
    resp = httpx.post(
        f"{BASE}/auth/signup",
        json={"email": email, "password": password, "name": name, "tenant_name": tenant_name},
        timeout=15.0,
    )
    assert resp.status_code == 201, f"Signup failed for {email}: {resp.text}"
    cookies = dict(resp.cookies)
    return {
        "session": cookies.get("neoguard_session", ""),
        "csrf": cookies.get("neoguard_csrf", ""),
        "data": resp.json(),
    }


def _req(auth: dict, method: str, path: str, **kwargs) -> httpx.Response:
    return httpx.request(
        method,
        f"{BASE}{path}",
        timeout=15.0,
        cookies={
            "neoguard_session": auth["session"],
            "neoguard_csrf": auth["csrf"],
        },
        headers={"X-CSRF-Token": auth["csrf"]},
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Fixtures: create a full RBAC test environment
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def super_admin():
    """Login as the bootstrapped super admin."""
    return _login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def tenant_a():
    """Signup creates Tenant A with its owner."""
    _clear_rate_limits()
    email = f"owner_a_{secrets.token_hex(4)}@rbactest.com"
    auth = _signup(email, "OwnerA1pass", "Owner A", "Tenant Alpha")
    return {
        **auth,
        "email": email,
        "password": "OwnerA1pass",
        "user_id": auth["data"]["user"]["id"],
        "tenant_id": auth["data"]["tenant"]["id"],
        "tenant_name": auth["data"]["tenant"]["name"],
    }


@pytest.fixture(scope="module")
def tenant_b():
    """Signup creates Tenant B with its owner."""
    _clear_rate_limits()
    email = f"owner_b_{secrets.token_hex(4)}@rbactest.com"
    auth = _signup(email, "OwnerB1pass", "Owner B", "Tenant Bravo")
    return {
        **auth,
        "email": email,
        "password": "OwnerB1pass",
        "user_id": auth["data"]["user"]["id"],
        "tenant_id": auth["data"]["tenant"]["id"],
        "tenant_name": auth["data"]["tenant"]["name"],
    }


@pytest.fixture(scope="module")
def admin_user(super_admin, tenant_a):
    """Create a user with admin role in Tenant A via super admin API."""
    _clear_rate_limits()
    email = f"admin_{secrets.token_hex(4)}@rbactest.com"
    r = _req(super_admin, "POST", "/api/v1/admin/users", json={
        "email": email,
        "password": "AdminU1pass",
        "name": "Admin User",
        "tenant_id": tenant_a["tenant_id"],
        "role": "admin",
    })
    assert r.status_code == 201, f"Create admin user failed: {r.text}"
    auth = _login(email, "AdminU1pass")
    return {
        **auth,
        "email": email,
        "password": "AdminU1pass",
        "user_id": r.json()["id"],
        "tenant_id": tenant_a["tenant_id"],
    }


@pytest.fixture(scope="module")
def member_user(super_admin, tenant_a):
    """Create a user with member role in Tenant A via super admin API."""
    _clear_rate_limits()
    email = f"member_{secrets.token_hex(4)}@rbactest.com"
    r = _req(super_admin, "POST", "/api/v1/admin/users", json={
        "email": email,
        "password": "MemberU1pass",
        "name": "Member User",
        "tenant_id": tenant_a["tenant_id"],
        "role": "member",
    })
    assert r.status_code == 201, f"Create member user failed: {r.text}"
    auth = _login(email, "MemberU1pass")
    return {
        **auth,
        "email": email,
        "password": "MemberU1pass",
        "user_id": r.json()["id"],
        "tenant_id": tenant_a["tenant_id"],
    }


@pytest.fixture(scope="module")
def viewer_user(super_admin, tenant_a):
    """Create a user with viewer role in Tenant A via super admin API."""
    _clear_rate_limits()
    email = f"viewer_{secrets.token_hex(4)}@rbactest.com"
    r = _req(super_admin, "POST", "/api/v1/admin/users", json={
        "email": email,
        "password": "ViewerU1pass",
        "name": "Viewer User",
        "tenant_id": tenant_a["tenant_id"],
        "role": "viewer",
    })
    assert r.status_code == 201, f"Create viewer user failed: {r.text}"
    auth = _login(email, "ViewerU1pass")
    return {
        **auth,
        "email": email,
        "password": "ViewerU1pass",
        "user_id": r.json()["id"],
        "tenant_id": tenant_a["tenant_id"],
    }


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: SUPER ADMIN — PLATFORM-WIDE ACCESS
# ═══════════════════════════════════════════════════════════════════════════

class TestSuperAdminAccess:
    """Super admin must have unrestricted access to everything."""

    def test_super_admin_can_list_all_tenants(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/admin/tenants")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_super_admin_can_list_all_users(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/admin/users")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_super_admin_can_view_platform_stats(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/admin/stats")
        assert r.status_code == 200
        body = r.json()
        assert "tenants" in body
        assert "users" in body

    def test_super_admin_can_view_audit_log(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/admin/audit-log")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_super_admin_can_view_security_log(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/admin/security-log")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_super_admin_can_view_any_tenant_members(self, super_admin, tenant_a):
        r = _req(super_admin, "GET", f"/api/v1/admin/tenants/{tenant_a['tenant_id']}/members")
        assert r.status_code == 200
        members = r.json()
        assert isinstance(members, list)
        assert len(members) >= 1

    def test_super_admin_can_view_any_user_tenants(self, super_admin, tenant_a):
        r = _req(super_admin, "GET", f"/api/v1/admin/users/{tenant_a['user_id']}/tenants")
        assert r.status_code == 200
        tenants = r.json()
        assert isinstance(tenants, list)
        assert len(tenants) >= 1
        assert any(t["id"] == tenant_a["tenant_id"] for t in tenants)

    def test_super_admin_sees_cross_tenant_dashboards(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/dashboards")
        assert r.status_code == 200

    def test_super_admin_sees_cross_tenant_alerts(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/alerts/rules")
        assert r.status_code == 200

    def test_super_admin_sees_cross_tenant_resources(self, super_admin):
        r = _req(super_admin, "GET", "/api/v1/resources")
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: ADMIN CREATE USER WITH ROLE + TENANT
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminCreateUserWithRole:
    """Super admin can create users and assign them to tenants with specific roles."""

    def test_create_user_without_tenant(self, super_admin):
        _clear_rate_limits()
        email = f"no_tenant_{secrets.token_hex(4)}@rbactest.com"
        r = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "NoTenant1pass",
            "name": "No Tenant User",
        })
        assert r.status_code == 201
        body = r.json()
        assert body["email"] == email
        assert body["tenant_count"] == 0

    def test_create_user_as_owner_in_tenant(self, super_admin, tenant_a):
        _clear_rate_limits()
        email = f"new_owner_{secrets.token_hex(4)}@rbactest.com"
        r = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "NewOwner1pass",
            "name": "New Owner",
            "tenant_id": tenant_a["tenant_id"],
            "role": "owner",
        })
        assert r.status_code == 201
        assert r.json()["tenant_count"] == 1

        # Verify membership exists with correct role
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{r.json()['id']}/tenants")
        assert ut.status_code == 200
        memberships = ut.json()
        assert len(memberships) >= 1
        match = [m for m in memberships if m["id"] == tenant_a["tenant_id"]]
        assert len(match) == 1
        assert match[0]["role"] == "owner"

    def test_create_user_as_viewer_in_tenant(self, super_admin, tenant_b):
        _clear_rate_limits()
        email = f"new_viewer_{secrets.token_hex(4)}@rbactest.com"
        r = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "NewViewer1pass",
            "name": "New Viewer",
            "tenant_id": tenant_b["tenant_id"],
            "role": "viewer",
        })
        assert r.status_code == 201

        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{r.json()['id']}/tenants")
        assert ut.status_code == 200
        match = [m for m in ut.json() if m["id"] == tenant_b["tenant_id"]]
        assert len(match) == 1
        assert match[0]["role"] == "viewer"

    def test_create_duplicate_email_409(self, super_admin, tenant_a):
        _clear_rate_limits()
        r = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": tenant_a["email"],
            "password": "Duplicate1pass",
            "name": "Dup",
        })
        assert r.status_code == 409

    def test_create_user_weak_password_422(self, super_admin):
        _clear_rate_limits()
        r = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": f"weak_{secrets.token_hex(4)}@rbactest.com",
            "password": "nodigits",
            "name": "Weak Pwd",
        })
        assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: ADMIN MEMBERSHIP MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

class TestAdminMembershipManagement:
    """Super admin can add/remove users from tenants and change roles."""

    def test_add_user_to_tenant(self, super_admin, tenant_b):
        _clear_rate_limits()
        email = f"add_to_tenant_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "AddTenant1pass",
            "name": "Add Tenant User",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        r = _req(super_admin, "POST", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}", json={
            "role": "member",
        })
        assert r.status_code == 201
        assert r.json()["role"] == "member"

        # Verify membership
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{uid}/tenants")
        assert ut.status_code == 200
        assert any(t["id"] == tenant_b["tenant_id"] and t["role"] == "member" for t in ut.json())

    def test_add_user_to_tenant_duplicate_409(self, super_admin, tenant_a):
        """Cannot add a user to a tenant they're already in."""
        r = _req(super_admin, "POST", f"/api/v1/admin/users/{tenant_a['user_id']}/tenants/{tenant_a['tenant_id']}", json={
            "role": "admin",
        })
        assert r.status_code == 409

    def test_change_user_role_in_tenant(self, super_admin, tenant_b):
        _clear_rate_limits()
        email = f"role_change_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "RoleChange1pass",
            "name": "Role Change User",
            "tenant_id": tenant_b["tenant_id"],
            "role": "viewer",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        # Change from viewer to admin
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}/role", json={
            "role": "admin",
        })
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

        # Verify role changed
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{uid}/tenants")
        match = [t for t in ut.json() if t["id"] == tenant_b["tenant_id"]]
        assert match[0]["role"] == "admin"

    def test_remove_user_from_tenant(self, super_admin, tenant_b):
        _clear_rate_limits()
        email = f"remove_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "RemoveU1pass",
            "name": "Remove User",
            "tenant_id": tenant_b["tenant_id"],
            "role": "member",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        r = _req(super_admin, "DELETE", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}")
        assert r.status_code == 200

        # Verify removed
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{uid}/tenants")
        assert not any(t["id"] == tenant_b["tenant_id"] for t in ut.json())

    def test_list_tenant_members_shows_all_roles(self, super_admin, tenant_a):
        r = _req(super_admin, "GET", f"/api/v1/admin/tenants/{tenant_a['tenant_id']}/members")
        assert r.status_code == 200
        members = r.json()
        assert len(members) >= 1
        for m in members:
            assert "user_id" in m
            assert "role" in m
            assert m["role"] in ("owner", "admin", "member", "viewer")

    def test_membership_actions_audited(self, super_admin):
        """Admin actions should appear in the platform audit log."""
        r = _req(super_admin, "GET", "/api/v1/admin/audit-log?limit=50")
        assert r.status_code == 200
        actions = [e["action"] for e in r.json()]
        assert any("user.created" in a for a in actions)


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: ROLE-BASED SCOPE ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════

class TestOwnerPermissions:
    """Owner has full control: read, write, admin, manage members."""

    def test_owner_can_read_dashboards(self, tenant_a):
        r = _req(tenant_a, "GET", "/api/v1/dashboards")
        assert r.status_code == 200

    def test_owner_can_create_dashboard(self, tenant_a):
        r = _req(tenant_a, "POST", "/api/v1/dashboards", json={
            "name": f"Owner Dashboard {secrets.token_hex(3)}",
            "panels": [],
        })
        assert r.status_code == 201

    def test_owner_can_create_alert_rule(self, tenant_a):
        r = _req(tenant_a, "POST", "/api/v1/alerts/rules", json={
            "name": f"Owner Alert {secrets.token_hex(3)}",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90,
            "aggregation": "avg",
        })
        assert r.status_code == 201

    def test_owner_can_list_members(self, tenant_a):
        r = _req(tenant_a, "GET", f"/api/v1/tenants/{tenant_a['tenant_id']}/members")
        assert r.status_code == 200

    def test_owner_can_invite_member(self, tenant_a):
        email = f"invite_{secrets.token_hex(4)}@rbactest.com"
        r = _req(tenant_a, "POST", f"/api/v1/tenants/{tenant_a['tenant_id']}/invite", json={
            "email": email,
            "role": "viewer",
        })
        assert r.status_code == 201

    def test_owner_can_update_tenant(self, tenant_a):
        r = _req(tenant_a, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}", json={
            "name": tenant_a["tenant_name"],
        })
        assert r.status_code == 200

    def test_owner_can_create_api_key(self, tenant_a):
        r = _req(tenant_a, "POST", "/api/v1/auth/keys", json={
            "name": f"Owner Key {secrets.token_hex(3)}",
            "scopes": ["read"],
        })
        assert r.status_code == 201

    def test_owner_can_view_tenant_audit_log(self, tenant_a):
        r = _req(tenant_a, "GET", f"/api/v1/tenants/{tenant_a['tenant_id']}/audit-log")
        assert r.status_code == 200


class TestAdminRolePermissions:
    """Admin role: read + write + admin scopes, can manage members."""

    def test_admin_can_read_dashboards(self, admin_user):
        r = _req(admin_user, "GET", "/api/v1/dashboards")
        assert r.status_code == 200

    def test_admin_can_create_dashboard(self, admin_user):
        r = _req(admin_user, "POST", "/api/v1/dashboards", json={
            "name": f"Admin Dashboard {secrets.token_hex(3)}",
            "panels": [],
        })
        assert r.status_code == 201

    def test_admin_can_create_alert_rule(self, admin_user):
        r = _req(admin_user, "POST", "/api/v1/alerts/rules", json={
            "name": f"Admin Alert {secrets.token_hex(3)}",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90,
            "aggregation": "avg",
        })
        assert r.status_code == 201

    def test_admin_can_create_api_key(self, admin_user):
        r = _req(admin_user, "POST", "/api/v1/auth/keys", json={
            "name": f"Admin Key {secrets.token_hex(3)}",
            "scopes": ["read"],
        })
        assert r.status_code == 201

    def test_admin_can_list_members(self, admin_user, tenant_a):
        r = _req(admin_user, "GET", f"/api/v1/tenants/{tenant_a['tenant_id']}/members")
        assert r.status_code == 200

    def test_admin_can_invite_member(self, admin_user, tenant_a):
        email = f"admin_invite_{secrets.token_hex(4)}@rbactest.com"
        r = _req(admin_user, "POST", f"/api/v1/tenants/{tenant_a['tenant_id']}/invite", json={
            "email": email,
            "role": "viewer",
        })
        assert r.status_code == 201

    def test_admin_cannot_change_roles(self, admin_user, tenant_a, viewer_user):
        """Only owners can change roles — admin should be denied."""
        r = _req(admin_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}/members/{viewer_user['user_id']}/role", json={
            "role": "member",
        })
        assert r.status_code == 403

    def test_admin_cannot_access_admin_panel(self, admin_user):
        """Tenant admin is NOT platform super admin."""
        r = _req(admin_user, "GET", "/api/v1/admin/stats")
        assert r.status_code == 403


class TestMemberPermissions:
    """Member role: read + write scopes, cannot manage members or keys."""

    def test_member_can_read_dashboards(self, member_user):
        r = _req(member_user, "GET", "/api/v1/dashboards")
        assert r.status_code == 200

    def test_member_can_create_dashboard(self, member_user):
        r = _req(member_user, "POST", "/api/v1/dashboards", json={
            "name": f"Member Dashboard {secrets.token_hex(3)}",
            "panels": [],
        })
        assert r.status_code == 201

    def test_member_can_create_alert_rule(self, member_user):
        r = _req(member_user, "POST", "/api/v1/alerts/rules", json={
            "name": f"Member Alert {secrets.token_hex(3)}",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90,
            "aggregation": "avg",
        })
        assert r.status_code == 201

    def test_member_can_query_mql(self, member_user):
        r = _req(member_user, "POST", "/api/v1/mql/query", json={
            "query": "avg:test.metric{region:us-east-1}",
            "start": "2026-05-01T00:00:00Z",
            "end": "2026-05-02T00:00:00Z",
            "interval": "5m",
        })
        assert r.status_code == 200

    def test_member_cannot_invite(self, member_user, tenant_a):
        email = f"member_invite_{secrets.token_hex(4)}@rbactest.com"
        r = _req(member_user, "POST", f"/api/v1/tenants/{tenant_a['tenant_id']}/invite", json={
            "email": email,
            "role": "viewer",
        })
        assert r.status_code == 403

    def test_member_cannot_create_api_key(self, member_user):
        r = _req(member_user, "POST", "/api/v1/auth/keys", json={
            "name": "Member Key",
            "scopes": ["read"],
        })
        assert r.status_code == 403

    def test_member_cannot_access_admin_panel(self, member_user):
        r = _req(member_user, "GET", "/api/v1/admin/stats")
        assert r.status_code == 403

    def test_member_cannot_update_tenant(self, member_user, tenant_a):
        r = _req(member_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}", json={
            "name": "Hacked Name",
        })
        assert r.status_code == 403


class TestViewerPermissions:
    """Viewer role: read-only, cannot create or modify anything."""

    def test_viewer_can_read_dashboards(self, viewer_user):
        r = _req(viewer_user, "GET", "/api/v1/dashboards")
        assert r.status_code == 200

    def test_viewer_can_read_alerts(self, viewer_user):
        r = _req(viewer_user, "GET", "/api/v1/alerts/rules")
        assert r.status_code == 200

    def test_viewer_can_read_resources(self, viewer_user):
        r = _req(viewer_user, "GET", "/api/v1/resources")
        assert r.status_code == 200

    def test_viewer_can_query_mql(self, viewer_user):
        r = _req(viewer_user, "POST", "/api/v1/mql/query", json={
            "query": "avg:test.metric{region:us-east-1}",
            "start": "2026-05-01T00:00:00Z",
            "end": "2026-05-02T00:00:00Z",
            "interval": "5m",
        })
        assert r.status_code == 200

    def test_viewer_cannot_create_dashboard(self, viewer_user):
        r = _req(viewer_user, "POST", "/api/v1/dashboards", json={
            "name": "Viewer Dashboard",
            "panels": [],
        })
        assert r.status_code == 403

    def test_viewer_cannot_create_alert(self, viewer_user):
        r = _req(viewer_user, "POST", "/api/v1/alerts/rules", json={
            "name": "Viewer Alert",
            "metric_name": "test.metric",
            "condition": "gt",
            "threshold": 90,
            "aggregation": "avg",
        })
        assert r.status_code == 403

    def test_viewer_cannot_ingest_metrics(self, viewer_user):
        r = _req(viewer_user, "POST", "/api/v1/metrics/ingest", json={
            "metrics": [{"name": "hack.metric", "value": 1, "tags": {}}],
        })
        assert r.status_code == 403

    def test_viewer_cannot_create_api_key(self, viewer_user):
        r = _req(viewer_user, "POST", "/api/v1/auth/keys", json={
            "name": "Viewer Key",
            "scopes": ["read"],
        })
        assert r.status_code == 403

    def test_viewer_cannot_invite(self, viewer_user, tenant_a):
        email = f"viewer_invite_{secrets.token_hex(4)}@rbactest.com"
        r = _req(viewer_user, "POST", f"/api/v1/tenants/{tenant_a['tenant_id']}/invite", json={
            "email": email,
            "role": "viewer",
        })
        assert r.status_code == 403

    def test_viewer_cannot_update_tenant(self, viewer_user, tenant_a):
        r = _req(viewer_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}", json={
            "name": "Hacked Name",
        })
        assert r.status_code == 403

    def test_viewer_cannot_access_admin_panel(self, viewer_user):
        r = _req(viewer_user, "GET", "/api/v1/admin/stats")
        assert r.status_code == 403

    def test_viewer_cannot_delete_dashboard(self, viewer_user, tenant_a):
        """Create a dashboard as owner, then try to delete as viewer."""
        cr = _req(tenant_a, "POST", "/api/v1/dashboards", json={
            "name": f"Delete Test {secrets.token_hex(3)}",
            "panels": [],
        })
        assert cr.status_code == 201
        dash_id = cr.json()["id"]

        r = _req(viewer_user, "DELETE", f"/api/v1/dashboards/{dash_id}")
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: TENANT ISOLATION
# ═══════════════════════════════════════════════════════════════════════════

class TestTenantIsolation:
    """Users in Tenant A must NOT see data from Tenant B."""

    def test_tenant_a_cannot_see_tenant_b_dashboards(self, tenant_a, tenant_b):
        """Create a dashboard in Tenant B, verify Tenant A owner can't see it."""
        cr = _req(tenant_b, "POST", "/api/v1/dashboards", json={
            "name": f"TenantB Secret {secrets.token_hex(3)}",
            "panels": [],
        })
        assert cr.status_code == 201
        b_dash_id = cr.json()["id"]

        # Tenant A tries to GET the dashboard by ID
        r = _req(tenant_a, "GET", f"/api/v1/dashboards/{b_dash_id}")
        assert r.status_code == 404

    def test_tenant_a_cannot_see_tenant_b_alerts(self, tenant_a, tenant_b):
        cr = _req(tenant_b, "POST", "/api/v1/alerts/rules", json={
            "name": f"TenantB Alert {secrets.token_hex(3)}",
            "metric_name": "secret.metric",
            "condition": "gt",
            "threshold": 50,
            "aggregation": "avg",
        })
        assert cr.status_code == 201
        b_alert_id = cr.json()["id"]

        r = _req(tenant_a, "GET", f"/api/v1/alerts/rules/{b_alert_id}")
        assert r.status_code == 404

    def test_tenant_a_cannot_modify_tenant_b_dashboard(self, tenant_a, tenant_b):
        cr = _req(tenant_b, "POST", "/api/v1/dashboards", json={
            "name": f"TenantB Modify {secrets.token_hex(3)}",
            "panels": [],
        })
        assert cr.status_code == 201
        b_dash_id = cr.json()["id"]

        r = _req(tenant_a, "PATCH", f"/api/v1/dashboards/{b_dash_id}", json={
            "name": "Hacked by Tenant A",
        })
        assert r.status_code in (404, 403, 500)

    def test_tenant_a_cannot_delete_tenant_b_dashboard(self, tenant_a, tenant_b):
        cr = _req(tenant_b, "POST", "/api/v1/dashboards", json={
            "name": f"TenantB Delete {secrets.token_hex(3)}",
            "panels": [],
        })
        assert cr.status_code == 201
        b_dash_id = cr.json()["id"]

        r = _req(tenant_a, "DELETE", f"/api/v1/dashboards/{b_dash_id}")
        assert r.status_code in (404, 403)

    def test_tenant_a_cannot_see_tenant_b_members(self, tenant_a, tenant_b):
        """Tenant A owner cannot list members of Tenant B."""
        r = _req(tenant_a, "GET", f"/api/v1/tenants/{tenant_b['tenant_id']}/members")
        assert r.status_code == 403

    def test_tenant_a_cannot_invite_to_tenant_b(self, tenant_a, tenant_b):
        r = _req(tenant_a, "POST", f"/api/v1/tenants/{tenant_b['tenant_id']}/invite", json={
            "email": "hack@test.com",
            "role": "admin",
        })
        assert r.status_code == 403

    def test_dashboard_list_only_shows_own_tenant(self, tenant_a, tenant_b):
        """Each tenant's dashboard list must only contain their own dashboards."""
        dashboards_a = _req(tenant_a, "GET", "/api/v1/dashboards").json()
        dashboards_b = _req(tenant_b, "GET", "/api/v1/dashboards").json()

        a_ids = {d["id"] for d in dashboards_a}
        b_ids = {d["id"] for d in dashboards_b}

        # No overlap
        assert a_ids.isdisjoint(b_ids), f"Cross-tenant leak: {a_ids & b_ids}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6: NON-ADMIN CANNOT ACCESS ADMIN PANEL
# ═══════════════════════════════════════════════════════════════════════════

class TestNonAdminCannotAccessAdminPanel:
    """Regular users (any role) must NOT be able to use admin endpoints."""

    def test_owner_cannot_access_admin_stats(self, tenant_a):
        r = _req(tenant_a, "GET", "/api/v1/admin/stats")
        assert r.status_code == 403

    def test_owner_cannot_list_all_tenants(self, tenant_a):
        r = _req(tenant_a, "GET", "/api/v1/admin/tenants")
        assert r.status_code == 403

    def test_owner_cannot_list_all_users(self, tenant_a):
        r = _req(tenant_a, "GET", "/api/v1/admin/users")
        assert r.status_code == 403

    def test_owner_cannot_create_user_via_admin(self, tenant_a):
        r = _req(tenant_a, "POST", "/api/v1/admin/users", json={
            "email": "hack@test.com",
            "password": "HackPass1",
            "name": "Hacker",
        })
        assert r.status_code == 403

    def test_owner_cannot_grant_super_admin(self, tenant_a):
        r = _req(tenant_a, "PATCH", f"/api/v1/admin/users/{tenant_a['user_id']}/super-admin", json={
            "is_super_admin": True,
        })
        assert r.status_code == 403

    def test_viewer_cannot_access_admin_endpoints(self, viewer_user):
        endpoints = [
            ("GET", "/api/v1/admin/stats"),
            ("GET", "/api/v1/admin/tenants"),
            ("GET", "/api/v1/admin/users"),
            ("GET", "/api/v1/admin/audit-log"),
            ("GET", "/api/v1/admin/security-log"),
        ]
        for method, path in endpoints:
            r = _req(viewer_user, method, path)
            assert r.status_code == 403, f"{method} {path} should be 403, got {r.status_code}"

    def test_member_cannot_access_admin_endpoints(self, member_user):
        endpoints = [
            ("GET", "/api/v1/admin/stats"),
            ("GET", "/api/v1/admin/tenants"),
            ("GET", "/api/v1/admin/users"),
            ("GET", "/api/v1/admin/audit-log"),
            ("GET", "/api/v1/admin/security-log"),
        ]
        for method, path in endpoints:
            r = _req(member_user, method, path)
            assert r.status_code == 403, f"{method} {path} should be 403, got {r.status_code}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 7: SUPER ADMIN PRIVILEGE ESCALATION PROTECTION
# ═══════════════════════════════════════════════════════════════════════════

class TestPrivilegeEscalationProtection:
    """Prevent users from escalating their own privileges."""

    def test_super_admin_cannot_revoke_own_super_admin(self, super_admin):
        me = _req(super_admin, "GET", "/auth/me").json()
        uid = me["user"]["id"]
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/super-admin", json={
            "is_super_admin": False,
        })
        assert r.status_code == 400

    def test_super_admin_cannot_deactivate_self(self, super_admin):
        me = _req(super_admin, "GET", "/auth/me").json()
        uid = me["user"]["id"]
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/active", json={
            "is_active": False,
        })
        assert r.status_code == 400

    def test_regular_user_cannot_grant_self_super_admin(self, tenant_a):
        r = _req(tenant_a, "PATCH", f"/api/v1/admin/users/{tenant_a['user_id']}/super-admin", json={
            "is_super_admin": True,
        })
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 8: SUPER ADMIN GRANT/REVOKE LIFECYCLE
# ═══════════════════════════════════════════════════════════════════════════

class TestSuperAdminGrantRevoke:
    """Test the full lifecycle of granting and revoking super admin status."""

    def test_grant_super_admin_then_access_then_revoke(self, super_admin, tenant_a):
        _clear_rate_limits()
        # Create a fresh user with a tenant (login requires tenant membership)
        email = f"sa_lifecycle_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "SALifecycle1pass",
            "name": "SA Lifecycle User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "viewer",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        # Grant super admin
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/super-admin", json={
            "is_super_admin": True,
        })
        assert r.status_code == 200
        assert r.json()["is_super_admin"] is True

        # Login as the new super admin
        auth = _login(email, "SALifecycle1pass")

        # Should now be able to access admin panel
        r2 = _req(auth, "GET", "/api/v1/admin/stats")
        assert r2.status_code == 200

        # Revoke super admin
        r3 = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/super-admin", json={
            "is_super_admin": False,
        })
        assert r3.status_code == 200
        assert r3.json()["is_super_admin"] is False

        # Re-login — new session should NOT be super admin
        _clear_rate_limits()
        auth2 = _login(email, "SALifecycle1pass")
        r4 = _req(auth2, "GET", "/api/v1/admin/stats")
        assert r4.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 9: USER ACTIVATE/DEACTIVATE
# ═══════════════════════════════════════════════════════════════════════════

class TestUserActivateDeactivate:
    """Test activating and deactivating users."""

    def test_deactivate_user_blocks_login(self, super_admin, tenant_a):
        _clear_rate_limits()
        email = f"deactivate_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "Deactivate1pass",
            "name": "Deactivate User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "viewer",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        # Deactivate
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/active", json={
            "is_active": False,
        })
        assert r.status_code == 200
        assert r.json()["is_active"] is False

        # Try to login — should fail
        _clear_rate_limits()
        login_r = httpx.post(f"{BASE}/auth/login", json={
            "email": email,
            "password": "Deactivate1pass",
        }, timeout=15.0)
        assert login_r.status_code == 401

    def test_reactivate_user_allows_login(self, super_admin, tenant_a):
        _clear_rate_limits()
        email = f"reactivate_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "Reactivate1pass",
            "name": "Reactivate User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "viewer",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        # Deactivate
        _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/active", json={"is_active": False})

        # Reactivate
        r = _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/active", json={
            "is_active": True,
        })
        assert r.status_code == 200
        assert r.json()["is_active"] is True

        # Login should work again
        _clear_rate_limits()
        login_r = httpx.post(f"{BASE}/auth/login", json={
            "email": email,
            "password": "Reactivate1pass",
        }, timeout=15.0)
        assert login_r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 10: TENANT STATUS MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

class TestTenantStatusManagement:
    """Super admin can suspend and activate tenants."""

    def test_suspend_and_activate_tenant(self, super_admin):
        _clear_rate_limits()
        # Create a tenant
        ct = _req(super_admin, "POST", "/api/v1/admin/tenants", json={
            "name": f"Suspend Test {secrets.token_hex(3)}",
        })
        assert ct.status_code == 201
        tid = ct.json()["id"]

        # Suspend
        r = _req(super_admin, "PATCH", f"/api/v1/admin/tenants/{tid}/status", json={
            "status": "suspended",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "suspended"

        # Activate
        r2 = _req(super_admin, "PATCH", f"/api/v1/admin/tenants/{tid}/status", json={
            "status": "active",
        })
        assert r2.status_code == 200
        assert r2.json()["status"] == "active"

    def test_delete_tenant(self, super_admin):
        _clear_rate_limits()
        ct = _req(super_admin, "POST", "/api/v1/admin/tenants", json={
            "name": f"Delete Test {secrets.token_hex(3)}",
        })
        assert ct.status_code == 201
        tid = ct.json()["id"]

        r = _req(super_admin, "DELETE", f"/api/v1/admin/tenants/{tid}")
        assert r.status_code == 200

    def test_regular_user_cannot_manage_tenant_status(self, tenant_a):
        r = _req(tenant_a, "PATCH", f"/api/v1/admin/tenants/{tenant_a['tenant_id']}/status", json={
            "status": "suspended",
        })
        assert r.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 11: UNAUTHENTICATED ACCESS DENIED
# ═══════════════════════════════════════════════════════════════════════════

class TestUnauthenticatedAccess:
    """All protected endpoints must reject unauthenticated requests."""

    @pytest.mark.parametrize("path", [
        "/api/v1/dashboards",
        "/api/v1/alerts/rules",
        "/api/v1/resources",
        "/api/v1/metrics/names",
        "/api/v1/auth/keys",
        "/api/v1/tenants",
        "/api/v1/admin/stats",
        "/api/v1/admin/tenants",
        "/api/v1/admin/users",
        "/api/v1/mql/functions",
    ])
    def test_unauthenticated_get_returns_401(self, path):
        r = httpx.get(f"{BASE}{path}", timeout=10.0)
        assert r.status_code == 401, f"GET {path} should be 401, got {r.status_code}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 12: IMPERSONATION RBAC
# ═══════════════════════════════════════════════════════════════════════════

class TestImpersonationRBAC:
    """Impersonation constraints."""

    def test_non_super_admin_cannot_impersonate(self, tenant_a, tenant_b):
        r = _req(tenant_a, "POST", "/api/v1/admin/impersonate", json={
            "user_id": tenant_b["user_id"],
            "reason": "Testing",
        })
        assert r.status_code == 403

    def test_super_admin_cannot_impersonate_self(self, super_admin):
        me = _req(super_admin, "GET", "/auth/me").json()
        uid = me["user"]["id"]
        r = _req(super_admin, "POST", "/api/v1/admin/impersonate", json={
            "user_id": uid,
            "reason": "Self test",
        })
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 13: ROLE HIERARCHY VALIDATION
# ═══════════════════════════════════════════════════════════════════════════

class TestRoleHierarchyValidation:
    """Verify that the 4-role model (owner > admin > member > viewer) is enforced correctly."""

    def test_role_scopes_owner(self, tenant_a):
        me = _req(tenant_a, "GET", "/auth/me").json()
        assert me["role"] == "owner"

    def test_role_scopes_admin(self, admin_user):
        me = _req(admin_user, "GET", "/auth/me").json()
        assert me["role"] == "admin"

    def test_role_scopes_member(self, member_user):
        me = _req(member_user, "GET", "/auth/me").json()
        assert me["role"] == "member"

    def test_role_scopes_viewer(self, viewer_user):
        me = _req(viewer_user, "GET", "/auth/me").json()
        assert me["role"] == "viewer"

    def test_only_owner_can_change_roles(self, tenant_a, admin_user, member_user, viewer_user):
        """Owner can change roles, admin/member/viewer cannot."""
        # Admin cannot change roles
        r1 = _req(admin_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}/members/{viewer_user['user_id']}/role", json={
            "role": "member",
        })
        assert r1.status_code == 403

        # Member cannot change roles
        r2 = _req(member_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}/members/{viewer_user['user_id']}/role", json={
            "role": "admin",
        })
        assert r2.status_code == 403

        # Viewer cannot change roles
        r3 = _req(viewer_user, "PATCH", f"/api/v1/tenants/{tenant_a['tenant_id']}/members/{member_user['user_id']}/role", json={
            "role": "owner",
        })
        assert r3.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 14: MULTI-TENANT USER MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

class TestMultiTenantUser:
    """A single user can belong to multiple tenants with different roles."""

    def test_user_in_multiple_tenants(self, super_admin, tenant_a, tenant_b):
        _clear_rate_limits()
        email = f"multi_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "MultiTenant1pass",
            "name": "Multi Tenant User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "admin",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        # Add to Tenant B as viewer
        r = _req(super_admin, "POST", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}", json={
            "role": "viewer",
        })
        assert r.status_code == 201

        # Verify both memberships
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{uid}/tenants")
        assert ut.status_code == 200
        tenants = ut.json()
        assert len(tenants) == 2

        roles_by_tenant = {t["id"]: t["role"] for t in tenants}
        assert roles_by_tenant[tenant_a["tenant_id"]] == "admin"
        assert roles_by_tenant[tenant_b["tenant_id"]] == "viewer"

    def test_tenant_switch(self, super_admin, tenant_a, tenant_b):
        """User can switch between tenants and see different data."""
        _clear_rate_limits()
        email = f"switcher_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "Switcher1pass",
            "name": "Switcher User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "member",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        _req(super_admin, "POST", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}", json={
            "role": "member",
        })

        # Login (starts in first tenant)
        auth = _login(email, "Switcher1pass")

        # List tenants — should see both
        tenants = _req(auth, "GET", "/api/v1/tenants")
        assert tenants.status_code == 200
        assert len(tenants.json()) == 2

        # Switch to Tenant B
        switch = _req(auth, "POST", f"/api/v1/tenants/{tenant_b['tenant_id']}/switch")
        assert switch.status_code == 200

    def test_role_upgrade_in_one_tenant_doesnt_affect_other(self, super_admin, tenant_a, tenant_b):
        _clear_rate_limits()
        email = f"iso_role_{secrets.token_hex(4)}@rbactest.com"
        cu = _req(super_admin, "POST", "/api/v1/admin/users", json={
            "email": email,
            "password": "IsoRole1pass",
            "name": "Iso Role User",
            "tenant_id": tenant_a["tenant_id"],
            "role": "viewer",
        })
        assert cu.status_code == 201
        uid = cu.json()["id"]

        _req(super_admin, "POST", f"/api/v1/admin/users/{uid}/tenants/{tenant_b['tenant_id']}", json={
            "role": "viewer",
        })

        # Upgrade to admin in Tenant A
        _req(super_admin, "PATCH", f"/api/v1/admin/users/{uid}/tenants/{tenant_a['tenant_id']}/role", json={
            "role": "admin",
        })

        # Verify Tenant B is still viewer
        ut = _req(super_admin, "GET", f"/api/v1/admin/users/{uid}/tenants")
        roles_by_tenant = {t["id"]: t["role"] for t in ut.json()}
        assert roles_by_tenant[tenant_a["tenant_id"]] == "admin"
        assert roles_by_tenant[tenant_b["tenant_id"]] == "viewer"
