from neoguard.core.config import Settings


class TestConfig:
    def test_default_values(self):
        s = Settings()
        assert s.db_host == "localhost"
        assert s.db_port == 5432
        assert s.default_tenant_id == "default"
        assert s.metric_batch_size == 5000

    def test_dsn_format(self):
        s = Settings()
        assert s.dsn.startswith("postgresql+asyncpg://")
        assert "neoguard" in s.dsn

    def test_asyncpg_dsn_format(self):
        s = Settings()
        assert s.asyncpg_dsn.startswith("postgresql://")
        assert "neoguard" in s.asyncpg_dsn
