from neoguard.core.config import settings


def get_tenant_id() -> str:
    """Returns the current tenant ID.

    For single-tenant mode, always returns default.
    When multi-tenant is implemented, this will extract tenant from
    API key / JWT token via a FastAPI dependency.
    """
    return settings.default_tenant_id
