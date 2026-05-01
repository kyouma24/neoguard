"""Unit tests for AuthMiddleware, RateLimitMiddleware, and RequestLoggingMiddleware."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from neoguard.api.middleware.auth import (
    AuthMiddleware,
    RateLimitMiddleware,
    RequestLoggingMiddleware,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_app_with_auth() -> FastAPI:
    """Minimal FastAPI app wrapped with AuthMiddleware."""
    app = FastAPI()
    app.add_middleware(AuthMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/auth/login")
    async def auth_login():
        return {"token": "xyz"}

    @app.get("/api/v1/metrics")
    async def metrics(request: Request):
        return {
            "tenant_id": request.state.tenant_id,
            "scopes": request.state.scopes,
            "api_key_id": request.state.api_key_id,
        }

    return app


def _make_key_info(
    tenant_id: str = "tenant-1",
    scopes: list[str] | None = None,
    key_id: str = "key-abc",
    rate_limit: int = 600,
) -> MagicMock:
    info = MagicMock()
    info.tenant_id = tenant_id
    info.scopes = scopes or ["read", "write"]
    info.id = key_id
    info.rate_limit = rate_limit
    return info


def _make_app_with_rate_limit(default_rpm: int = 5) -> FastAPI:
    """App with Auth + RateLimit middleware.  Auth sets request.state fields."""
    app = FastAPI()
    # Middleware is applied in reverse order (last added = outermost).
    # We want Auth to run first (outermost), then RateLimit.
    app.add_middleware(RateLimitMiddleware, default_rpm=default_rpm)
    app.add_middleware(AuthMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/data")
    async def data():
        return {"data": 1}

    return app


def _make_app_with_logging() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/v1/data")
    async def data():
        return {"data": 1}

    return app


# ---------------------------------------------------------------------------
# AuthMiddleware
# ---------------------------------------------------------------------------


class TestAuthMiddleware:
    """Tests for the AuthMiddleware class."""

    async def test_exempt_path_passes_through(self):
        """Exempt paths (e.g. /health) should pass with admin scopes."""
        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200

    @patch("neoguard.api.middleware.auth.settings")
    async def test_auth_prefix_requires_key(self, mock_settings):
        """Auth routes require authentication when auth is enabled."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/login")
        assert resp.status_code == 401

    @patch("neoguard.api.middleware.auth.settings")
    async def test_auth_disabled_passes_through(self, mock_settings):
        """When auth_enabled is False, all requests pass with admin scopes."""
        mock_settings.auth_enabled = False
        mock_settings.default_tenant_id = "default"

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/metrics")
        assert resp.status_code == 200
        body = resp.json()
        assert body["tenant_id"] == "default"
        assert body["scopes"] == ["admin"]

    @patch("neoguard.api.middleware.auth.settings")
    async def test_bootstrap_token_grants_admin(self, mock_settings):
        """Bootstrap token grants admin access for initial key creation."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = "boot-secret-123"
        mock_settings.default_tenant_id = "default"

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/metrics",
                headers={"Authorization": "Bearer boot-secret-123"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tenant_id"] == "default"
        assert body["scopes"] == ["admin"]

    @patch("neoguard.api.middleware.auth.settings")
    async def test_missing_key_returns_401(self, mock_settings):
        """When auth is enabled and no key is provided, return 401."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/metrics")
        assert resp.status_code == 401
        assert resp.json()["error"] == "missing_api_key"

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_invalid_key_returns_401(self, mock_settings, mock_validate):
        """When validate_api_key returns None, return 401."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = None

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/metrics",
                headers={"Authorization": "Bearer ng_bad_key"},
            )
        assert resp.status_code == 401
        assert resp.json()["error"] == "invalid_api_key"
        mock_validate.assert_awaited_once_with("ng_bad_key")

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_valid_bearer_key_sets_state(self, mock_settings, mock_validate):
        """Valid Bearer key populates request.state correctly."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = _make_key_info(
            tenant_id="acme", scopes=["read"], key_id="key-123", rate_limit=100,
        )

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/metrics",
                headers={"Authorization": "Bearer ng_good_key"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tenant_id"] == "acme"
        assert body["scopes"] == ["read"]
        assert body["api_key_id"] == "key-123"

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_valid_x_api_key_header(self, mock_settings, mock_validate):
        """X-API-Key header is accepted as an alternative to Bearer."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = _make_key_info()

        app = _make_app_with_auth()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/metrics",
                headers={"X-API-Key": "ng_xapi_key"},
            )
        assert resp.status_code == 200
        mock_validate.assert_awaited_once_with("ng_xapi_key")


# ---------------------------------------------------------------------------
# RateLimitMiddleware
# ---------------------------------------------------------------------------


class TestRateLimitMiddleware:
    """Tests for the sliding-window RateLimitMiddleware."""

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_under_limit_passes(self, mock_settings, mock_validate):
        """Requests under the RPM limit succeed."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = _make_key_info(rate_limit=10)

        app = _make_app_with_rate_limit(default_rpm=10)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/v1/data",
                headers={"Authorization": "Bearer ng_key"},
            )
        assert resp.status_code == 200

    @patch("neoguard.api.middleware.auth.log")
    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_at_limit_returns_429(self, mock_settings, mock_validate, mock_log):
        """Exceeding RPM returns 429 with Retry-After header."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = _make_key_info(rate_limit=3)
        mock_log.awarn = AsyncMock()

        app = _make_app_with_rate_limit(default_rpm=3)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # First 3 requests should succeed
            for _ in range(3):
                resp = await client.get(
                    "/api/v1/data",
                    headers={"Authorization": "Bearer ng_key"},
                )
                assert resp.status_code == 200

            # 4th request should be rate-limited
            resp = await client.get(
                "/api/v1/data",
                headers={"Authorization": "Bearer ng_key"},
            )
            assert resp.status_code == 429
            assert resp.json()["error"] == "rate_limit_exceeded"
            assert resp.headers["retry-after"] == "60"

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_exempt_path_bypasses_rate_limit(self, mock_settings, mock_validate):
        """Exempt paths are not rate-limited."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"

        app = _make_app_with_rate_limit(default_rpm=1)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for _ in range(5):
                resp = await client.get("/health")
                assert resp.status_code == 200

    @patch("neoguard.api.middleware.auth.log")
    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_old_timestamps_get_pruned(self, mock_settings, mock_validate, mock_log):
        """Timestamps older than 60s are pruned from the sliding window."""
        mock_settings.auth_enabled = True
        mock_settings.auth_bootstrap_token = ""
        mock_settings.default_tenant_id = "default"
        mock_validate.return_value = _make_key_info(rate_limit=2, key_id="prune-key")
        mock_log.awarn = AsyncMock()

        app = _make_app_with_rate_limit(default_rpm=2)

        # Manually inject old timestamps into the middleware's internal state.
        # The RateLimitMiddleware is the first middleware added, so it's
        # the second in app.middleware_stack resolution. We access it directly.
        rl_middleware = None
        for mw in app.user_middleware:
            if mw.cls is RateLimitMiddleware:
                rl_middleware = mw
                break
        assert rl_middleware is not None

        # Build the middleware stack so _windows is accessible
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Make 2 requests to fill the window
            for _ in range(2):
                resp = await client.get(
                    "/api/v1/data",
                    headers={"Authorization": "Bearer ng_key"},
                )
                assert resp.status_code == 200

            # The 3rd should be blocked
            resp = await client.get(
                "/api/v1/data",
                headers={"Authorization": "Bearer ng_key"},
            )
            assert resp.status_code == 429

            # Now manipulate the internal window to simulate time passing:
            # The actual middleware instance is buried in the middleware stack.
            # We access it via the app's middleware_stack attribute.
            mw_stack = app.middleware_stack
            # Walk the chain to find RateLimitMiddleware
            rl_instance = None
            current = mw_stack
            while current is not None:
                if isinstance(current, RateLimitMiddleware):
                    rl_instance = current
                    break
                current = getattr(current, "app", None)

            assert rl_instance is not None, "Could not find RateLimitMiddleware instance"
            # Set all timestamps to 120 seconds ago (well outside the 60s window)
            old_time = time.monotonic() - 120.0
            for key_id in rl_instance._windows:
                rl_instance._windows[key_id] = [old_time, old_time]

            # Now requests should succeed again since old timestamps are pruned
            resp = await client.get(
                "/api/v1/data",
                headers={"Authorization": "Bearer ng_key"},
            )
            assert resp.status_code == 200

    @patch("neoguard.api.middleware.auth.validate_api_key", new_callable=AsyncMock)
    @patch("neoguard.api.middleware.auth.settings")
    async def test_no_api_key_id_bypasses_rate_limit(self, mock_settings, mock_validate):
        """When auth is disabled, there is no api_key_id, so rate limiting is skipped."""
        mock_settings.auth_enabled = False
        mock_settings.default_tenant_id = "default"

        app = _make_app_with_rate_limit(default_rpm=1)
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Even with rpm=1, these should all pass because auth is disabled
            for _ in range(5):
                resp = await client.get("/api/v1/data")
                assert resp.status_code == 200


# ---------------------------------------------------------------------------
# RequestLoggingMiddleware
# ---------------------------------------------------------------------------


class TestRequestLoggingMiddleware:
    """Tests for the RequestLoggingMiddleware."""

    @patch("neoguard.api.middleware.auth.log")
    async def test_logs_non_exempt_request(self, mock_log):
        """Non-exempt paths are logged with method, path, status, duration_ms."""
        mock_log.ainfo = AsyncMock()

        app = _make_app_with_logging()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/data")

        assert resp.status_code == 200
        mock_log.ainfo.assert_awaited_once()
        call_kwargs = mock_log.ainfo.call_args
        assert call_kwargs[0][0] == "request"
        assert call_kwargs[1]["method"] == "GET"
        assert call_kwargs[1]["path"] == "/api/v1/data"
        assert call_kwargs[1]["status"] == 200
        assert "duration_ms" in call_kwargs[1]

    @patch("neoguard.api.middleware.auth.log")
    async def test_skips_exempt_paths(self, mock_log):
        """Exempt paths (e.g. /health) should NOT be logged."""
        mock_log.ainfo = AsyncMock()

        app = _make_app_with_logging()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/health")

        mock_log.ainfo.assert_not_awaited()

    @patch("neoguard.api.middleware.auth.log")
    async def test_logs_correct_status_on_error(self, mock_log):
        """Logs should reflect the actual response status code."""
        mock_log.ainfo = AsyncMock()

        app = FastAPI()
        app.add_middleware(RequestLoggingMiddleware)

        @app.get("/api/v1/fail")
        async def fail():
            return JSONResponse(status_code=503, content={"error": "down"})

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/fail")

        assert resp.status_code == 503
        call_kwargs = mock_log.ainfo.call_args
        assert call_kwargs[1]["status"] == 503
