"""Unit tests for CSRF middleware."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from neoguard.api.middleware.csrf import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    CSRFMiddleware,
    generate_csrf_token,
)


def _create_app(auth_enabled: bool = True) -> FastAPI:
    app = FastAPI()

    @app.post("/api/v1/test")
    async def test_endpoint():
        return {"ok": True}

    @app.get("/api/v1/test")
    async def test_get():
        return {"ok": True}

    @app.post("/auth/login")
    async def login():
        return {"ok": True}

    with patch("neoguard.api.middleware.csrf.settings") as mock_settings:
        mock_settings.auth_enabled = auth_enabled
        mock_settings.session_cookie_name = "neoguard_session"
        app.add_middleware(CSRFMiddleware)

    return app


class TestCSRFMiddleware:
    async def test_get_request_passes_without_csrf(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.get("/api/v1/test")
        assert resp.status_code == 200

    async def test_post_without_session_cookie_passes(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post("/api/v1/test")
        assert resp.status_code == 200

    async def test_post_with_session_and_valid_csrf_passes(self):
        app = _create_app()
        token = generate_csrf_token()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/test",
                cookies={"neoguard_session": "fake_session", CSRF_COOKIE_NAME: token},
                headers={CSRF_HEADER_NAME: token},
            )
        assert resp.status_code == 200

    async def test_post_with_session_missing_csrf_returns_403(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/test",
                cookies={"neoguard_session": "fake_session"},
            )
        assert resp.status_code == 403
        assert resp.json()["error"] == "csrf_validation_failed"

    async def test_post_with_session_mismatched_csrf_returns_403(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/api/v1/test",
                cookies={"neoguard_session": "fake_session", CSRF_COOKIE_NAME: "token_a"},
                headers={CSRF_HEADER_NAME: "token_b"},
            )
        assert resp.status_code == 403

    async def test_exempt_path_passes_without_csrf(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.post(
                "/auth/login",
                cookies={"neoguard_session": "fake_session"},
            )
        assert resp.status_code == 200

    async def test_auth_disabled_skips_csrf(self):
        app = _create_app(auth_enabled=False)
        with patch("neoguard.api.middleware.csrf.settings") as mock_settings:
            mock_settings.auth_enabled = False
            mock_settings.session_cookie_name = "neoguard_session"
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
                resp = await c.post(
                    "/api/v1/test",
                    cookies={"neoguard_session": "fake_session"},
                )
        assert resp.status_code == 200

    async def test_options_request_passes(self):
        app = _create_app()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            resp = await c.options("/api/v1/test")
        assert resp.status_code in (200, 405)

    async def test_generate_csrf_token_uniqueness(self):
        tokens = {generate_csrf_token() for _ in range(100)}
        assert len(tokens) == 100
