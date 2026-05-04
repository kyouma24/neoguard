import pytest

from neoguard.core.config import Settings


def _debug_env(monkeypatch):
    """Set NEOGUARD_DEBUG=true so dev defaults are applied."""
    monkeypatch.setenv("NEOGUARD_DEBUG", "true")


class TestConfig:
    def test_default_values(self, monkeypatch):
        _debug_env(monkeypatch)
        monkeypatch.delenv("NEOGUARD_DB_PORT", raising=False)
        monkeypatch.delenv("NEOGUARD_AUTH_ENABLED", raising=False)
        s = Settings()
        assert s.db_host == "localhost"
        assert s.db_port == 5433
        assert s.default_tenant_id == "default"
        assert s.metric_batch_size == 5000
        assert s.auth_enabled is True

    def test_dsn_format(self, monkeypatch):
        _debug_env(monkeypatch)
        s = Settings()
        assert s.dsn.startswith("postgresql+asyncpg://")
        assert "neoguard" in s.dsn

    def test_asyncpg_dsn_format(self, monkeypatch):
        _debug_env(monkeypatch)
        s = Settings()
        assert s.asyncpg_dsn.startswith("postgresql://")
        assert "neoguard" in s.asyncpg_dsn

    def test_env_override(self, monkeypatch):
        _debug_env(monkeypatch)
        monkeypatch.setenv("NEOGUARD_DB_PORT", "5433")
        monkeypatch.setenv("NEOGUARD_AUTH_ENABLED", "true")
        s = Settings()
        assert s.db_port == 5433
        assert s.auth_enabled is True

    def test_production_requires_secrets(self, monkeypatch):
        monkeypatch.setenv("NEOGUARD_DEBUG", "false")
        monkeypatch.delenv("NEOGUARD_DB_PASSWORD", raising=False)
        monkeypatch.delenv("NEOGUARD_SESSION_SECRET", raising=False)
        with pytest.raises(SystemExit):
            Settings()

    def test_production_rejects_default_secret(self, monkeypatch):
        monkeypatch.setenv("NEOGUARD_DEBUG", "false")
        monkeypatch.setenv("NEOGUARD_DB_PASSWORD", "real-password")
        monkeypatch.setenv("NEOGUARD_SESSION_SECRET", "change-me-in-production")
        with pytest.raises(SystemExit):
            Settings()

    def test_production_accepts_real_secrets(self, monkeypatch):
        monkeypatch.setenv("NEOGUARD_DEBUG", "false")
        monkeypatch.setenv("NEOGUARD_DB_PASSWORD", "real-password")
        monkeypatch.setenv("NEOGUARD_SESSION_SECRET", "a-real-secret-key-here")
        s = Settings()
        assert s.db_password == "real-password"
        assert s.session_secret == "a-real-secret-key-here"

    def test_debug_provides_dev_defaults(self, monkeypatch):
        _debug_env(monkeypatch)
        monkeypatch.delenv("NEOGUARD_DB_PASSWORD", raising=False)
        monkeypatch.delenv("NEOGUARD_SESSION_SECRET", raising=False)
        s = Settings()
        assert s.db_password == "neoguard_dev"
        assert s.session_secret == "change-me-in-production"
