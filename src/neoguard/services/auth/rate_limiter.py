"""Redis-backed rate limiter for authentication endpoints.

Uses INCR + EXPIRE (atomic pipeline) for sliding-window counting.
Fails open: if Redis is unavailable, requests are allowed through.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from neoguard.core.config import settings
from neoguard.core.logging import log
from neoguard.db.redis.connection import get_redis


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_at: int


@dataclass(frozen=True, slots=True)
class RateLimitRule:
    """Defines a rate limit: max_attempts within window_seconds."""

    max_attempts: int
    window_seconds: int


# Default rules per endpoint — overridable via settings
LOGIN_RULE = RateLimitRule(
    max_attempts=settings.auth_login_rate_limit,
    window_seconds=settings.auth_login_rate_window,
)
SIGNUP_RULE = RateLimitRule(
    max_attempts=settings.auth_signup_rate_limit,
    window_seconds=settings.auth_signup_rate_window,
)

# Map endpoint names to their rules
ENDPOINT_RULES: dict[str, RateLimitRule] = {
    "login": LOGIN_RULE,
    "signup": SIGNUP_RULE,
}

KEY_PREFIX = "rl"


def _rate_limit_key(endpoint: str, ip: str) -> str:
    """Build Redis key: rl:{endpoint}:{ip}."""
    return f"{KEY_PREFIX}:{endpoint}:{ip}"


def extract_client_ip(request) -> str:  # noqa: ANN001 — avoid circular import of Request
    """Extract client IP from direct connection.

    X-Forwarded-For is NOT trusted by default — it's trivially spoofable.
    Only the ASGI server's client.host (set by the transport layer) is
    reliable in a non-proxied deployment. When behind a trusted reverse
    proxy, enable trust via NEOGUARD_TRUST_PROXY_HEADERS=true.
    """
    from neoguard.core.config import settings
    if getattr(settings, "trust_proxy_headers", False):
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def check_rate_limit(endpoint: str, ip: str, rule: RateLimitRule | None = None) -> RateLimitResult:
    """Check and increment rate limit counter for an endpoint+IP pair.

    Returns a RateLimitResult with:
    - allowed: whether the request should proceed
    - remaining: how many attempts are left in the window
    - reset_at: unix timestamp when the window expires

    Fails open: if Redis is unavailable, returns allowed=True.
    """
    if rule is None:
        rule = ENDPOINT_RULES.get(endpoint)
        if rule is None:
            return RateLimitResult(allowed=True, remaining=999, reset_at=0)

    key = _rate_limit_key(endpoint, ip)

    try:
        redis = get_redis()

        # Atomic INCR + conditional EXPIRE via pipeline
        pipe = redis.pipeline(transaction=True)
        pipe.incr(key)
        pipe.ttl(key)
        results = await pipe.execute()

        current_count: int = results[0]
        current_ttl: int = results[1]

        # First request in this window — set expiry
        if current_ttl < 0:
            await redis.expire(key, rule.window_seconds)
            current_ttl = rule.window_seconds

        reset_at = int(time.time()) + max(current_ttl, 0)
        remaining = max(rule.max_attempts - current_count, 0)
        allowed = current_count <= rule.max_attempts

        if not allowed:
            await log.awarn(
                "auth.rate_limited",
                endpoint=endpoint,
                ip=ip,
                count=current_count,
                limit=rule.max_attempts,
                window_seconds=rule.window_seconds,
            )

        return RateLimitResult(allowed=allowed, remaining=remaining, reset_at=reset_at)

    except Exception:
        # Fail open — if Redis is down, allow the request
        await log.aerror(
            "auth.rate_limit_redis_error",
            endpoint=endpoint,
            ip=ip,
            action="fail_open",
        )
        return RateLimitResult(allowed=True, remaining=999, reset_at=0)
