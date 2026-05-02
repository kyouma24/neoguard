"""Initial schema — mirrors docker/timescaledb/init.sql.

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-05-01

All statements use IF NOT EXISTS / exception guards for idempotency.
This allows running against databases already initialized via init.sql.
"""
from alembic import op

revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- TimescaleDB extension -----
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    # ----- Metrics hypertable -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS metrics (
            time        TIMESTAMPTZ     NOT NULL,
            tenant_id   TEXT            NOT NULL DEFAULT 'default',
            name        TEXT            NOT NULL,
            tags        JSONB           NOT NULL DEFAULT '{}',
            value       DOUBLE PRECISION NOT NULL,
            metric_type TEXT            NOT NULL DEFAULT 'gauge'
        )
    """)
    op.execute("""
        SELECT create_hypertable('metrics', 'time',
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_metrics_tenant_name_time ON metrics (tenant_id, name, time DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_metrics_tags ON metrics USING GIN (tags)")

    op.execute("""
        ALTER TABLE metrics SET (
            timescaledb.compress,
            timescaledb.compress_segmentby = 'tenant_id, name',
            timescaledb.compress_orderby = 'time DESC'
        )
    """)
    op.execute("SELECT add_compression_policy('metrics', INTERVAL '24 hours', if_not_exists => TRUE)")

    # ----- Continuous aggregates -----
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', time) AS bucket,
            tenant_id, name, tags,
            AVG(value) AS avg_value,
            MIN(value) AS min_value,
            MAX(value) AS max_value,
            COUNT(*) AS sample_count
        FROM metrics
        GROUP BY bucket, tenant_id, name, tags
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('metrics_1m',
            start_offset => INTERVAL '1 hour',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute',
            if_not_exists => TRUE
        )
    """)
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1h
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 hour', time) AS bucket,
            tenant_id, name, tags,
            AVG(value) AS avg_value,
            MIN(value) AS min_value,
            MAX(value) AS max_value,
            COUNT(*) AS sample_count
        FROM metrics
        GROUP BY bucket, tenant_id, name, tags
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('metrics_1h',
            start_offset => INTERVAL '3 hours',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '1 hour',
            if_not_exists => TRUE
        )
    """)
    op.execute("SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE)")

    # ----- Alert rules -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_rules (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            metric_name     TEXT NOT NULL,
            tags_filter     JSONB NOT NULL DEFAULT '{}',
            condition       TEXT NOT NULL,
            threshold       DOUBLE PRECISION NOT NULL,
            duration_sec    INTEGER NOT NULL DEFAULT 60,
            interval_sec    INTEGER NOT NULL DEFAULT 30,
            severity        TEXT NOT NULL DEFAULT 'P3',
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            notification    JSONB NOT NULL DEFAULT '{}',
            aggregation     TEXT NOT NULL DEFAULT 'avg',
            cooldown_sec    INTEGER NOT NULL DEFAULT 300,
            nodata_action   TEXT NOT NULL DEFAULT 'ok',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant ON alert_rules (tenant_id, enabled)")

    # ----- Alert events -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_events (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            rule_id         TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
            rule_name       TEXT NOT NULL DEFAULT '',
            severity        TEXT NOT NULL DEFAULT 'P3',
            status          TEXT NOT NULL,
            value           DOUBLE PRECISION NOT NULL,
            threshold       DOUBLE PRECISION NOT NULL,
            message         TEXT NOT NULL DEFAULT '',
            notification_meta JSONB NOT NULL DEFAULT '{}',
            fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at     TIMESTAMPTZ,
            acknowledged_at TIMESTAMPTZ,
            acknowledged_by TEXT NOT NULL DEFAULT ''
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_alert_events_tenant_rule ON alert_events (tenant_id, rule_id, fired_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events (tenant_id, status, fired_at DESC)")

    # ----- Alert rule states -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_rule_states (
            rule_id         TEXT PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
            status          TEXT NOT NULL DEFAULT 'ok',
            entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_value      DOUBLE PRECISION,
            last_fired_at   TIMESTAMPTZ,
            transition_count INTEGER NOT NULL DEFAULT 0,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ----- Dashboards -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboards (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            panels          JSONB NOT NULL DEFAULT '[]',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_dashboards_tenant ON dashboards (tenant_id)")

    # ----- Notification channels -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS notification_channels (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            channel_type    TEXT NOT NULL,
            config          JSONB NOT NULL DEFAULT '{}',
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # ----- Resources -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS resources (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            resource_type   TEXT NOT NULL,
            provider        TEXT NOT NULL,
            region          TEXT NOT NULL DEFAULT '',
            account_id      TEXT NOT NULL DEFAULT '',
            name            TEXT NOT NULL,
            external_id     TEXT NOT NULL DEFAULT '',
            tags            JSONB NOT NULL DEFAULT '{}',
            metadata        JSONB NOT NULL DEFAULT '{}',
            status          TEXT NOT NULL DEFAULT 'active',
            last_seen_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_resources_tenant_type ON resources (tenant_id, resource_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resources_provider_account ON resources (tenant_id, provider, account_id)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_external ON resources (tenant_id, provider, external_id) WHERE external_id != ''")
    op.execute("CREATE INDEX IF NOT EXISTS idx_resources_tags ON resources USING GIN (tags)")

    # ----- AWS accounts -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS aws_accounts (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            account_id      TEXT NOT NULL,
            role_arn        TEXT NOT NULL DEFAULT '',
            external_id     TEXT NOT NULL DEFAULT '',
            regions         JSONB NOT NULL DEFAULT '["ap-south-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","us-east-1","us-east-2","us-west-2","eu-west-1","eu-central-1"]',
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            collect_config  JSONB NOT NULL DEFAULT '{}',
            last_sync_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_aws_accounts_tenant_account ON aws_accounts (tenant_id, account_id)")

    # ----- Azure subscriptions -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS azure_subscriptions (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            subscription_id TEXT NOT NULL,
            azure_tenant_id TEXT NOT NULL,
            client_id       TEXT NOT NULL,
            client_secret   TEXT NOT NULL DEFAULT '',
            regions         JSONB NOT NULL DEFAULT '["centralindia","southindia","westindia","southeastasia","eastasia","japaneast","australiaeast","eastus","eastus2","westus2","centralus","westeurope","northeurope","uksouth"]',
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            collect_config  JSONB NOT NULL DEFAULT '{}',
            last_sync_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_azure_subs_tenant_sub ON azure_subscriptions (tenant_id, subscription_id)")

    # ----- Alert silences -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_silences (
            id                      TEXT PRIMARY KEY,
            tenant_id               TEXT NOT NULL DEFAULT 'default',
            name                    TEXT NOT NULL,
            comment                 TEXT NOT NULL DEFAULT '',
            rule_ids                JSONB NOT NULL DEFAULT '[]',
            matchers                JSONB NOT NULL DEFAULT '{}',
            starts_at               TIMESTAMPTZ NOT NULL,
            ends_at                 TIMESTAMPTZ NOT NULL,
            timezone                TEXT NOT NULL DEFAULT 'Asia/Kolkata',
            recurring               BOOLEAN NOT NULL DEFAULT FALSE,
            recurrence_days         JSONB NOT NULL DEFAULT '[]',
            recurrence_start_time   TEXT,
            recurrence_end_time     TEXT,
            enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
            created_by              TEXT NOT NULL DEFAULT '',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_alert_silences_tenant_enabled ON alert_silences (tenant_id, enabled)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_alert_silences_time_range ON alert_silences (starts_at, ends_at) WHERE enabled = TRUE")

    # ----- Collection jobs -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS collection_jobs (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            job_type        TEXT NOT NULL,
            target_id       TEXT NOT NULL DEFAULT '',
            status          TEXT NOT NULL DEFAULT 'pending',
            config          JSONB NOT NULL DEFAULT '{}',
            result          JSONB NOT NULL DEFAULT '{}',
            started_at      TIMESTAMPTZ,
            completed_at    TIMESTAMPTZ,
            error_message   TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_collection_jobs_status ON collection_jobs (tenant_id, status, created_at DESC)")

    # ----- API keys -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL DEFAULT 'default',
            name            TEXT NOT NULL,
            key_hash        TEXT NOT NULL,
            key_prefix      TEXT NOT NULL,
            hash_version    INTEGER NOT NULL DEFAULT 1,
            scopes          JSONB NOT NULL DEFAULT '["read","write"]',
            rate_limit      INTEGER NOT NULL DEFAULT 1000,
            enabled         BOOLEAN NOT NULL DEFAULT TRUE,
            expires_at      TIMESTAMPTZ,
            last_used_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys (tenant_id, enabled)")

    # ----- Users -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              UUID PRIMARY KEY,
            email           TEXT NOT NULL,
            name            TEXT NOT NULL,
            password_hash   TEXT NOT NULL,
            is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email))")

    # ----- Tenants -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id              UUID PRIMARY KEY,
            slug            TEXT NOT NULL,
            name            TEXT NOT NULL,
            tier            TEXT NOT NULL DEFAULT 'free',
            status          TEXT NOT NULL DEFAULT 'active',
            quotas          JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug)")

    # ----- Tenant memberships -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant_memberships (
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            role            TEXT NOT NULL DEFAULT 'member',
            invited_by      UUID REFERENCES users(id),
            joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, tenant_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON tenant_memberships (tenant_id, role)")

    # ----- User invites -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_invites (
            id              UUID PRIMARY KEY,
            tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            email           TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'member',
            invited_by      UUID NOT NULL REFERENCES users(id),
            token_hash      TEXT NOT NULL,
            expires_at      TIMESTAMPTZ NOT NULL,
            accepted_at     TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_invites_tenant ON user_invites (tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_invites_token ON user_invites (token_hash)")

    # ----- Audit log (tenant-scoped) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id              UUID PRIMARY KEY,
            tenant_id       UUID NOT NULL,
            actor_id        UUID,
            actor_type      TEXT NOT NULL DEFAULT 'user',
            action          TEXT NOT NULL,
            resource_type   TEXT NOT NULL,
            resource_id     TEXT,
            details         JSONB NOT NULL DEFAULT '{}',
            ip_address      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_log (tenant_id, created_at DESC)")

    # ----- Platform audit log -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS platform_audit_log (
            id              UUID PRIMARY KEY,
            actor_id        UUID NOT NULL,
            action          TEXT NOT NULL,
            target_type     TEXT NOT NULL,
            target_id       TEXT,
            reason          TEXT NOT NULL DEFAULT '',
            details         JSONB NOT NULL DEFAULT '{}',
            ip_address      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_platform_audit_time ON platform_audit_log (created_at DESC)")

    # ----- Security log -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS security_log (
            id              UUID PRIMARY KEY,
            user_id         UUID,
            event_type      TEXT NOT NULL,
            success         BOOLEAN NOT NULL,
            ip_address      TEXT,
            user_agent      TEXT,
            details         JSONB NOT NULL DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_security_log_user ON security_log (user_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_security_log_type ON security_log (event_type, created_at DESC)")

    # ----- Helper role -----
    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neoguard_app') THEN
                CREATE ROLE neoguard_app;
            END IF;
        END $$
    """)

    # ----- Row-Level Security policies -----
    _rls_tables_text = [
        "alert_rules", "alert_events", "dashboards", "notification_channels",
        "resources", "aws_accounts", "azure_subscriptions", "alert_silences",
        "collection_jobs", "api_keys", "metrics",
    ]
    for table in _rls_tables_text:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            DO $$ BEGIN
                CREATE POLICY tenant_isolation ON {table}
                    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)

    # alert_rule_states: RLS via subquery on alert_rules
    op.execute("ALTER TABLE alert_rule_states ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$ BEGIN
            CREATE POLICY tenant_isolation ON alert_rule_states
                FOR ALL USING (rule_id IN (
                    SELECT id FROM alert_rules WHERE tenant_id = current_setting('app.current_tenant_id', true)
                ));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # audit_log: UUID tenant_id cast to text
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$ BEGIN
            CREATE POLICY tenant_isolation ON audit_log
                FOR ALL USING (tenant_id::text = current_setting('app.current_tenant_id', true));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)


def downgrade() -> None:
    _rls_tables = [
        "audit_log", "alert_rule_states", "metrics", "api_keys", "collection_jobs",
        "alert_silences", "azure_subscriptions", "aws_accounts", "resources",
        "notification_channels", "dashboards", "alert_events", "alert_rules",
    ]
    for table in _rls_tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("DROP TABLE IF EXISTS security_log")
    op.execute("DROP TABLE IF EXISTS platform_audit_log")
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS user_invites")
    op.execute("DROP TABLE IF EXISTS tenant_memberships")
    op.execute("DROP TABLE IF EXISTS tenants")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS api_keys")
    op.execute("DROP TABLE IF EXISTS collection_jobs")
    op.execute("DROP TABLE IF EXISTS alert_silences")
    op.execute("DROP TABLE IF EXISTS azure_subscriptions")
    op.execute("DROP TABLE IF EXISTS aws_accounts")
    op.execute("DROP TABLE IF EXISTS notification_channels")
    op.execute("DROP TABLE IF EXISTS dashboards")
    op.execute("DROP TABLE IF EXISTS alert_rule_states")
    op.execute("DROP TABLE IF EXISTS alert_events")
    op.execute("DROP TABLE IF EXISTS alert_rules")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS metrics_1h")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS metrics_1m")
    op.execute("DROP TABLE IF EXISTS metrics")
