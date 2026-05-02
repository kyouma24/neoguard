"""Auth telemetry — structured logs + metrics for all auth/tenant events."""

from __future__ import annotations

from uuid import UUID

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


async def _write_sec(
    event_type: str,
    success: bool,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
) -> None:
    try:
        from neoguard.services.auth.admin import write_security_log
        await write_security_log(
            event_type=event_type,
            success=success,
            user_id=UUID(user_id) if user_id else None,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details,
        )
    except Exception:
        pass


async def emit_signup(
    user_id: str, tenant_id: str, email: str,
    correlation_id: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
) -> None:
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
    await _write_sec("signup", True, user_id=user_id, ip_address=ip_address, user_agent=user_agent)


async def emit_login_success(
    user_id: str, tenant_id: str,
    correlation_id: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
) -> None:
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
    await _write_sec("login", True, user_id=user_id, ip_address=ip_address, user_agent=user_agent)


async def emit_login_failure(
    email: str, correlation_id: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
) -> None:
    _login_failure.inc()
    await log.awarn(
        "auth.login_failed",
        email=email,
        action="login",
        result="failure",
        correlation_id=correlation_id,
    )
    await _write_sec("login", False, ip_address=ip_address, user_agent=user_agent, details={"email": email})


async def emit_logout(
    user_id: str, correlation_id: str | None = None,
    ip_address: str | None = None, user_agent: str | None = None,
) -> None:
    _session_revoked.inc()
    await log.ainfo(
        "auth.logout",
        user_id=user_id,
        action="logout",
        result="success",
        correlation_id=correlation_id,
    )
    await _write_sec("logout", True, user_id=user_id, ip_address=ip_address, user_agent=user_agent)


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
