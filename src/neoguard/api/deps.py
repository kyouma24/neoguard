from fastapi import HTTPException, Request

from neoguard.core.config import settings

PLATFORM_ADMIN_SCOPE = "platform_admin"


def _is_platform_admin(request: Request) -> bool:
    scopes = getattr(request.state, "scopes", [])
    if PLATFORM_ADMIN_SCOPE in scopes:
        return True
    return getattr(request.state, "is_super_admin", False)


def get_tenant_id(request: Request) -> str | None:
    """Extract tenant ID from authenticated request state.

    - Super admins / platform_admin: returns None (all tenants) unless
      ?tenant_id=X query param is provided for scoping.
    - Regular users: returns their tenant_id from the session or API key.
    - Auth disabled: returns default_tenant_id.
    """
    if _is_platform_admin(request):
        override = request.query_params.get("tenant_id")
        return override or None

    return getattr(request.state, "tenant_id", settings.default_tenant_id)


def get_tenant_id_required(request: Request) -> str:
    """Like get_tenant_id but raises 400 if no tenant can be resolved.

    For super admins / platform_admin: falls back to the session's
    tenant_id if no ?tenant_id= override is given.
    """
    tid = get_tenant_id(request)
    if tid is None:
        session_tid = getattr(request.state, "tenant_id", None)
        if session_tid:
            return session_tid
        raise HTTPException(
            status_code=400,
            detail="tenant_id query parameter is required for this operation",
        )
    return tid


def get_current_user_id(request: Request) -> str:
    """Return the authenticated user's ID from request state."""
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        if not settings.auth_enabled:
            return "system"
        raise HTTPException(status_code=401, detail="Authentication required")
    return str(user_id)


def require_scope(scope: str):
    """FastAPI dependency that checks the API key has a required scope."""
    def checker(request: Request) -> None:
        if not settings.auth_enabled:
            return
        scopes = getattr(request.state, "scopes", [])
        if PLATFORM_ADMIN_SCOPE in scopes:
            return
        if "admin" in scopes:
            return
        if scope not in scopes:
            raise HTTPException(
                status_code=403,
                detail=f"API key missing required scope: {scope}",
            )
    return checker
