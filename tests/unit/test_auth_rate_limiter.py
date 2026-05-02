"""Unit tests for Redis-backed auth rate limiter."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.services.auth.rate_limiter import (
    KEY_PREFIX,
    RateLimitResult,
    RateLimitRule,
    check_rate_limit,
    extract_client_ip,
)


@pytest.fixture()
def mock_redis():
    """Mock Redis with pipeline support for INCR + TTL."""
    redis = AsyncMock()
    pipe = AsyncMock()
    pipe.incr = MagicMock()
    pipe.ttl = MagicMock()
    pipe.execute = AsyncMock(return_value=[1, -1])  # first request, no TTL yet
    redis.pipeline = MagicMock(return_value=pipe)
    redis.expire = AsyncMock()
    with patch("neoguard.services.auth.rate_limiter.get_redis", return_value=redis):
        yield redis, pipe


LOGIN_RULE = RateLimitRule(max_attempts=5, window_seconds=900)
SIGNUP_RULE = RateLimitRule(max_attempts=10, window_seconds=3600)


class TestCheckRateLimitAllowed:
    async def test_first_request_allowed(self, mock_redis):
        redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[1, -1])  # count=1, no TTL

        result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        assert result.allowed is True
        assert result.remaining == 4
        pipe.incr.assert_called_once_with(f"{KEY_PREFIX}:login:192.168.1.1")
        pipe.ttl.assert_called_once_with(f"{KEY_PREFIX}:login:192.168.1.1")
        redis.expire.assert_called_once_with(f"{KEY_PREFIX}:login:192.168.1.1", 900)

    async def test_under_limit_allowed(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[3, 500])  # count=3, 500s left

        result = await check_rate_limit("login", "10.0.0.1", rule=LOGIN_RULE)

        assert result.allowed is True
        assert result.remaining == 2

    async def test_at_limit_still_allowed(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[5, 300])  # count=5 = max

        result = await check_rate_limit("login", "10.0.0.1", rule=LOGIN_RULE)

        assert result.allowed is True
        assert result.remaining == 0

    async def test_signup_under_limit_allowed(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[7, 1800])

        result = await check_rate_limit("signup", "172.16.0.1", rule=SIGNUP_RULE)

        assert result.allowed is True
        assert result.remaining == 3


class TestCheckRateLimitBlocked:
    async def test_over_limit_blocked(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[6, 450])  # count=6 > max=5

        result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        assert result.allowed is False
        assert result.remaining == 0
        assert result.reset_at > 0

    async def test_way_over_limit_blocked(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[100, 200])

        result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        assert result.allowed is False
        assert result.remaining == 0

    async def test_signup_over_limit_blocked(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[11, 2000])

        result = await check_rate_limit("signup", "10.0.0.1", rule=SIGNUP_RULE)

        assert result.allowed is False
        assert result.remaining == 0


class TestEndpointIndependence:
    async def test_different_endpoints_independent_keys(self, mock_redis):
        _redis, pipe = mock_redis

        # Login at limit
        pipe.execute = AsyncMock(return_value=[6, 300])
        login_result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        # Same IP, signup under limit
        pipe.execute = AsyncMock(return_value=[2, 1800])
        signup_result = await check_rate_limit("signup", "192.168.1.1", rule=SIGNUP_RULE)

        assert login_result.allowed is False
        assert signup_result.allowed is True

    async def test_different_ips_independent(self, mock_redis):
        _redis, pipe = mock_redis

        # IP1 at limit
        pipe.execute = AsyncMock(return_value=[6, 300])
        ip1_result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        # IP2 under limit
        pipe.execute = AsyncMock(return_value=[1, -1])
        ip2_result = await check_rate_limit("login", "192.168.1.2", rule=LOGIN_RULE)

        assert ip1_result.allowed is False
        assert ip2_result.allowed is True


class TestIPExtraction:
    def test_extracts_from_x_forwarded_for(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "203.0.113.50, 70.41.3.18, 150.172.238.178"}
        request.client = MagicMock()
        request.client.host = "127.0.0.1"

        ip = extract_client_ip(request)
        assert ip == "203.0.113.50"

    def test_extracts_single_forwarded_ip(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "10.20.30.40"}
        request.client = MagicMock()
        request.client.host = "127.0.0.1"

        ip = extract_client_ip(request)
        assert ip == "10.20.30.40"

    def test_strips_whitespace_from_forwarded(self):
        request = MagicMock()
        request.headers = {"X-Forwarded-For": "  203.0.113.50 , 70.41.3.18"}
        request.client = MagicMock()

        ip = extract_client_ip(request)
        assert ip == "203.0.113.50"

    def test_falls_back_to_client_host(self):
        request = MagicMock()
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "192.168.1.100"

        ip = extract_client_ip(request)
        assert ip == "192.168.1.100"

    def test_returns_unknown_when_no_client(self):
        request = MagicMock()
        request.headers = {}
        request.client = None

        ip = extract_client_ip(request)
        assert ip == "unknown"


class TestFailOpen:
    async def test_allows_request_when_redis_unavailable(self):
        with patch(
            "neoguard.services.auth.rate_limiter.get_redis",
            side_effect=RuntimeError("Redis not initialized"),
        ):
            result = await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        assert result.allowed is True
        assert result.remaining == 999

    async def test_allows_request_when_redis_command_fails(self, mock_redis):
        _redis, pipe = mock_redis
        pipe.execute = AsyncMock(side_effect=ConnectionError("Connection refused"))

        result = await check_rate_limit("login", "10.0.0.1", rule=LOGIN_RULE)

        assert result.allowed is True
        assert result.remaining == 999


class TestUnknownEndpoint:
    async def test_unknown_endpoint_without_rule_allows(self):
        """Unknown endpoint with no rule defaults to allowed."""
        with patch("neoguard.services.auth.rate_limiter.get_redis"):
            result = await check_rate_limit("unknown_endpoint", "192.168.1.1")

        assert result.allowed is True
        assert result.remaining == 999


class TestRateLimitResult:
    def test_result_is_frozen(self):
        result = RateLimitResult(allowed=True, remaining=5, reset_at=1000)
        with pytest.raises(AttributeError):
            result.allowed = False  # type: ignore[misc]

    def test_result_fields(self):
        result = RateLimitResult(allowed=False, remaining=0, reset_at=1717000000)
        assert result.allowed is False
        assert result.remaining == 0
        assert result.reset_at == 1717000000


class TestKeyExpiry:
    async def test_sets_expiry_on_first_request(self, mock_redis):
        redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[1, -1])  # TTL=-1 means no expiry set

        await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        redis.expire.assert_called_once_with(f"{KEY_PREFIX}:login:192.168.1.1", 900)

    async def test_does_not_reset_expiry_on_subsequent_request(self, mock_redis):
        redis, pipe = mock_redis
        pipe.execute = AsyncMock(return_value=[3, 600])  # TTL=600, already set

        await check_rate_limit("login", "192.168.1.1", rule=LOGIN_RULE)

        redis.expire.assert_not_called()
