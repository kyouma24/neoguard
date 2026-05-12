import sys

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "NEOGUARD_"}

    app_name: str = "NeoGuard"
    debug: bool = False

    db_host: str = "localhost"
    db_port: int = 5433
    db_name: str = "neoguard"
    db_user: str = "neoguard"
    db_password: str = ""
    db_pool_min: int = 5
    db_pool_max: int = 20

    clickhouse_host: str = "localhost"
    clickhouse_port: int = 8123
    clickhouse_database: str = "neoguard"

    default_tenant_id: str = "default"

    metric_batch_size: int = 5000
    metric_flush_interval_ms: int = 200

    log_batch_size: int = 2000
    log_flush_interval_ms: int = 500

    alert_eval_interval_sec: int = 15
    alert_default_cooldown_sec: int = 300
    alert_state_persistence: bool = True
    alert_flap_threshold: int = 6
    alert_flap_window_sec: int = 3600
    alert_max_rules_per_cycle: int = 1000
    alert_rule_eval_timeout_sec: int = 30
    alert_strict_duration_check: bool = False

    # TODO(production): Single Redis instance; needs Sentinel/Cluster for HA
    # Current: localhost single-instance, no failover
    # Cloud: Redis Cluster or ElastiCache with read replicas + Sentinel
    # Migration risk: Medium — redis.asyncio supports cluster mode but connection code needs changes
    # Reference: docs/cloud_migration.md#redis-ha
    redis_url: str = "redis://localhost:6379/0"

    auth_enabled: bool = True
    auth_bootstrap_token: str = ""
    session_secret: str = ""
    session_ttl_seconds: int = 2592000  # 30 days
    super_admin_session_ttl_seconds: int = 14400  # 4 hours — absolute, no sliding
    session_cookie_name: str = "neoguard_session"
    cookie_secure: bool = False
    trust_proxy_headers: bool = False
    frontend_url: str = "http://localhost:5173"

    auth_login_rate_limit: int = 5          # max attempts
    auth_login_rate_window: int = 900       # 15 minutes in seconds
    auth_signup_rate_limit: int = 10        # max attempts
    auth_signup_rate_window: int = 3600     # 1 hour in seconds

    aws_session_ttl: int = 3300  # 55 min — 5-minute margin before 1hr STS expiry

    sse_max_connections_global: int = 100
    sse_max_connections_per_tenant: int = 20
    sse_heartbeat_sec: int = 15
    sse_max_duration_sec: int = 1800

    metric_flush_max_retries: int = 3
    metric_flush_retry_base_sec: float = 1.0
    metric_buffer_max_size: int = 50000

    discovery_max_concurrency: int = 5

    telemetry_enabled: bool = True
    telemetry_interval_sec: int = 15

    # TODO(production): Hardcoded global denylist; needs per-tenant configurable list backed by DB
    # Current: Static config list, same for all tenants
    # Cloud: DB table (tag_cardinality_observations) + admin UI per tenant + adaptive detection
    # Migration risk: Low — add DB lookup alongside static list, merge results
    # Reference: docs/cloud_migration.md#cardinality-denylist
    high_cardinality_tag_denylist: list[str] = [
        "request_id",
        "trace_id",
        "span_id",
        "correlation_id",
        "message_id",
        "session_id",
        "user_id",
    ]
    tag_values_default_lookback_hours: int = 24
    tag_values_default_limit: int = 100
    tag_values_hard_limit: int = 1000
    metric_names_hard_limit: int = 1000

    @model_validator(mode="after")
    def _require_secrets_in_production(self) -> "Settings":
        if self.debug:
            if not self.db_password:
                self.db_password = "neoguard_dev"
            if not self.session_secret:
                self.session_secret = "change-me-in-production"
            return self
        missing: list[str] = []
        if not self.db_password:
            missing.append("NEOGUARD_DB_PASSWORD")
        if not self.session_secret:
            missing.append("NEOGUARD_SESSION_SECRET")
        if missing:
            print(
                f"FATAL: Required environment variables not set: {', '.join(missing)}. "
                "Set NEOGUARD_DEBUG=true for development defaults.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        if self.session_secret == "change-me-in-production":
            print(
                "FATAL: NEOGUARD_SESSION_SECRET must not be the default value in production.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        if not self.auth_enabled:
            print(
                "FATAL: NEOGUARD_AUTH_ENABLED=false is only permitted in debug mode. "
                "Set NEOGUARD_DEBUG=true or remove NEOGUARD_AUTH_ENABLED.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        return self

    @property
    def dsn(self) -> str:
        return (
            f"postgresql+asyncpg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def asyncpg_dsn(self) -> str:
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )


settings = Settings()
