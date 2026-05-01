"""Auth telemetry — structured logs + metrics for all auth/tenant events."""

from __future__ import annotations

from neoguard.core.logging import log
from neoguard.core.telemetry import registry

_signup_attempts = registry.counter("neoguard.auth.signup_attempts", {})
_login_success = registry.counter("neoguard.auth.login_success", {})
_login_failure = registry.counter("neoguard.auth.login_failure", {})
_session_created = registry.counter("neoguard.auth.session_created", {})
_session_revoked = registry.counter("neoguard.auth.session_revoked", {})
_tenant_created = registry.counter("neoguard.auth.tenant_created", {})
_tenant_deleted = registry.counter("neoguard.auth.tenant_deleted", {})
_rls_violations = registry.counter("neoguard.auth.rls_violations", {})
_deprecated_key_used = registry.counter("neoguard.auth.deprecated_key_used", {})


async def emit_signup(user_id: str, tenant_id: str, email: str, correlation_id: str | None = None) -> None:
    _signup_attempts.inc()
    _session_created.inc()
    _tenant_created.inc()
    await log.ainfo(
        "auth.signup",
        user_id=user_id,
        tenant_id=tenant_id,
        email=email,
        action="signup",
        result="success",
        correlation_id=correlation_id,
    )


async def emit_login_success(user_id: str, tenant_id: str, correlation_id: str | None = None) -> None:
    _login_success.inc()
    _session_created.inc()
    await log.ainfo(
        "auth.login",
        user_id=user_id,
        tenant_id=tenant_id,
        action="login",
        result="success",
        correlation_id=correlation_id,
    )


async def emit_login_failure(email: str, correlation_id: str | None = None) -> None:
    _login_failure.inc()
    await log.awarn(
        "auth.login_failed",
        email=email,
        action="login",
        result="failure",
        correlation_id=correlation_id,
    )


async def emit_logout(user_id: str, correlation_id: str | None = None) -> None:
    _session_revoked.inc()
    await log.ainfo(
        "auth.logout",
        user_id=user_id,
        action="logout",
        result="success",
        correlation_id=correlation_id,
    )


async def emit_tenant_created(tenant_id: str, user_id: str, correlation_id: str | None = None) -> None:
    _tenant_created.inc()
    await log.ainfo(
        "tenant.created",
        tenant_id=tenant_id,
        user_id=user_id,
        action="tenant_create",
        result="success",
        correlation_id=correlation_id,
    )


async def emit_tenant_switch(user_id: str, tenant_id: str, correlation_id: str | None = None) -> None:
    await log.ainfo(
        "tenant.switched",
        user_id=user_id,
        tenant_id=tenant_id,
        action="tenant_switch",
        result="success",
        correlation_id=correlation_id,
    )


async def emit_deprecated_key(key_prefix: str, correlation_id: str | None = None) -> None:
    _deprecated_key_used.inc()
    await log.awarn(
        "api_keys.deprecated_version_used",
        key_prefix=key_prefix,
        action="api_key_auth",
        result="deprecated_version",
        correlation_id=correlation_id,
    )
