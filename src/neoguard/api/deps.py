from fastapi import HTTPException, Request

from neoguard.core.config import settings

PLATFORM_ADMIN_SCOPE = "platform_admin"


def _is_platform_admin(request: Request) -> bool:
    scopes = getattr(request.state, "scopes", [])
    return PLATFORM_ADMIN_SCOPE in scopes


def get_tenant_id(request: Request) -> str | None:
    """Extract tenant ID from authenticated request state.

    - Regular users: returns their tenant_id from the API key.
    - platform_admin: returns None (all tenants) unless ?tenant_id=X
      query param is provided for scoping.
    - Auth disabled: returns default_tenant_id.
    """
    if _is_platform_admin(request):
        override = request.query_params.get("tenant_id")
        return override or None

    return getattr(request.state, "tenant_id", settings.default_tenant_id)


def get_tenant_id_required(request: Request) -> str:
    """Like get_tenant_id but raises 400 if no tenant can be resolved.

    Use this for write operations where a target tenant is mandatory.
    Platform admins must specify ?tenant_id=X for writes.
    """
    tid = get_tenant_id(request)
    if tid is None:
        raise HTTPException(
            status_code=400,
            detail="tenant_id query parameter is required for this operation",
        )
    return tid


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
