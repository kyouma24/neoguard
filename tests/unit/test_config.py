
from neoguard.core.config import Settings


class TestConfig:
    def test_default_values(self, monkeypatch):
        monkeypatch.delenv("NEOGUARD_DB_PORT", raising=False)
        monkeypatch.delenv("NEOGUARD_AUTH_ENABLED", raising=False)
        s = Settings()
        assert s.db_host == "localhost"
        assert s.db_port == 5432
        assert s.default_tenant_id == "default"
        assert s.metric_batch_size == 5000
        assert s.auth_enabled is True

    def test_dsn_format(self):
        s = Settings()
        assert s.dsn.startswith("postgresql+asyncpg://")
        assert "neoguard" in s.dsn

    def test_asyncpg_dsn_format(self):
        s = Settings()
        assert s.asyncpg_dsn.startswith("postgresql://")
        assert "neoguard" in s.asyncpg_dsn

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("NEOGUARD_DB_PORT", "5433")
        monkeypatch.setenv("NEOGUARD_AUTH_ENABLED", "true")
        s = Settings()
        assert s.db_port == 5433
        assert s.auth_enabled is True
