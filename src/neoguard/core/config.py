from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "NEOGUARD_"}

    app_name: str = "NeoGuard"
    debug: bool = False

    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "neoguard"
    db_user: str = "neoguard"
    db_password: str = "neoguard_dev"  # noqa: S105
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
    session_secret: str = "change-me-in-production"  # noqa: S105
    session_ttl_seconds: int = 2592000  # 30 days
    super_admin_session_ttl_seconds: int = 14400  # 4 hours — absolute, no sliding
    session_cookie_name: str = "neoguard_session"

    # Auth rate limiting (per IP, Redis-backed)
    auth_login_rate_limit: int = 5          # max attempts
    auth_login_rate_window: int = 900       # 15 minutes in seconds
    auth_signup_rate_limit: int = 10        # max attempts
    auth_signup_rate_window: int = 3600     # 1 hour in seconds

    telemetry_enabled: bool = True
    telemetry_interval_sec: int = 15

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
