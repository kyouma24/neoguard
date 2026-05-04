"""Dashboard observability metrics (spec Part K).

Registers dashboard-specific counters using the shared MetricsRegistry
and exposes helper functions for recording events from routes and services.
"""

from __future__ import annotations

from neoguard.core.telemetry import registry

# ---------------------------------------------------------------------------
# Counters — registered eagerly at import time
# ---------------------------------------------------------------------------

_page_load_count = registry.counter("neoguard.dashboards.page.load_count")
_widget_error_count_cache: dict[tuple[str, str], object] = {}
_cache_hit = registry.counter("neoguard.dashboards.query.cache_hit")
_cache_miss = registry.counter("neoguard.dashboards.query.cache_miss")
_layout_saves = registry.counter("neoguard.dashboards.layout.saves")
_context_missing = registry.counter("neoguard.dashboards.tenant_context_missing")
_cross_tenant_reject = registry.counter("neoguard.dashboards.cross_tenant_reject")
_quota_blocked = registry.counter("neoguard.dashboards.quota_blocked")


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def record_page_load(tenant_id: str | None) -> None:
    """Record a dashboard page load."""
    _page_load_count.inc()
    if tenant_id:
        registry.counter(
            "neoguard.dashboards.page.load_count",
            {"tenant_id": tenant_id},
        ).inc()


def record_widget_error(tenant_id: str | None, widget_type: str, error_code: str) -> None:
    """Record a widget rendering/query error, labelled by type and error code."""
    tags = {"widget_type": widget_type, "error_code": error_code}
    if tenant_id:
        tags["tenant_id"] = tenant_id
    registry.counter("neoguard.dashboards.widget.error_count", tags).inc()


def record_cache_hit(tenant_id: str | None) -> None:
    """Record an MQL query cache hit."""
    _cache_hit.inc()
    if tenant_id:
        registry.counter(
            "neoguard.dashboards.query.cache_hit",
            {"tenant_id": tenant_id},
        ).inc()


def record_cache_miss(tenant_id: str | None) -> None:
    """Record an MQL query cache miss."""
    _cache_miss.inc()
    if tenant_id:
        registry.counter(
            "neoguard.dashboards.query.cache_miss",
            {"tenant_id": tenant_id},
        ).inc()


def record_layout_save(tenant_id: str | None) -> None:
    """Record a dashboard layout save."""
    _layout_saves.inc()
    if tenant_id:
        registry.counter(
            "neoguard.dashboards.layout.saves",
            {"tenant_id": tenant_id},
        ).inc()


def record_context_missing() -> None:
    """Record a request where tenant context was expected but missing."""
    _context_missing.inc()


def record_cross_tenant_reject(tenant_id: str | None) -> None:
    """Record a cross-tenant access rejection."""
    tags = {}
    if tenant_id:
        tags["tenant_id"] = tenant_id
    registry.counter("neoguard.dashboards.cross_tenant_reject", tags).inc()


def record_quota_blocked(tenant_id: str | None) -> None:
    """Record a quota-blocked request."""
    _quota_blocked.inc()
    if tenant_id:
        registry.counter(
            "neoguard.dashboards.quota_blocked",
            {"tenant_id": tenant_id},
        ).inc()
