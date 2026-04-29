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
