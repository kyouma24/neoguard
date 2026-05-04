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

    telemetry_enabled: bool = True
    telemetry_interval_sec: int = 15

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
