-- TimescaleDB initialization for NeoGuard
-- This runs on first container start only

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Metrics hypertable: the core time-series store
CREATE TABLE IF NOT EXISTS metrics (
    time        TIMESTAMPTZ     NOT NULL,
    tenant_id   TEXT            NOT NULL DEFAULT 'default',
    name        TEXT            NOT NULL,
    tags        JSONB           NOT NULL DEFAULT '{}',
    value       DOUBLE PRECISION NOT NULL,
    metric_type TEXT            NOT NULL DEFAULT 'gauge'
);

SELECT create_hypertable('metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_metrics_tenant_name_time
    ON metrics (tenant_id, name, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_tags
    ON metrics USING GIN (tags);

-- Enable compression on chunks older than 24 hours
ALTER TABLE metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'tenant_id, name',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('metrics', INTERVAL '24 hours', if_not_exists => TRUE);

-- 1-minute rollup continuous aggregate
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    tenant_id,
    name,
    tags,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM metrics
GROUP BY bucket, tenant_id, name, tags
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_1m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- 1-hour rollup continuous aggregate
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) AS bucket,
    tenant_id,
    name,
    tags,
    AVG(value) AS avg_value,
    MIN(value) AS min_value,
    MAX(value) AS max_value,
    COUNT(*) AS sample_count
FROM metrics
GROUP BY bucket, tenant_id, name, tags
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_1h',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Retention policy: drop raw data older than 30 days
SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);

-- Alert rules table
CREATE TABLE IF NOT EXISTS alert_rules (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    metric_name     TEXT NOT NULL,
    tags_filter     JSONB NOT NULL DEFAULT '{}',
    condition       TEXT NOT NULL,  -- 'gt', 'lt', 'gte', 'lte', 'eq', 'ne'
    threshold       DOUBLE PRECISION NOT NULL,
    duration_sec    INTEGER NOT NULL DEFAULT 60,
    interval_sec    INTEGER NOT NULL DEFAULT 30,
    severity        TEXT NOT NULL DEFAULT 'warning',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    notification    JSONB NOT NULL DEFAULT '{}',
    aggregation     TEXT NOT NULL DEFAULT 'avg',
    cooldown_sec    INTEGER NOT NULL DEFAULT 300,
    nodata_action   TEXT NOT NULL DEFAULT 'ok',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant
    ON alert_rules (tenant_id, enabled);

-- Alert events (history of alert firings)
CREATE TABLE IF NOT EXISTS alert_events (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    rule_id         TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    rule_name       TEXT NOT NULL DEFAULT '',
    severity        TEXT NOT NULL DEFAULT 'warning',
    status          TEXT NOT NULL,  -- 'firing', 'resolved', 'nodata'
    value           DOUBLE PRECISION NOT NULL,
    threshold       DOUBLE PRECISION NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    notification_meta JSONB NOT NULL DEFAULT '{}',
    fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_alert_events_tenant_rule
    ON alert_events (tenant_id, rule_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_status
    ON alert_events (tenant_id, status, fired_at DESC);

-- Alert rule state persistence (survives restart)
CREATE TABLE IF NOT EXISTS alert_rule_states (
    rule_id         TEXT PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'ok',
    entered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_value      DOUBLE PRECISION,
    last_fired_at   TIMESTAMPTZ,
    transition_count INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dashboard definitions
CREATE TABLE IF NOT EXISTS dashboards (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    panels          JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_tenant
    ON dashboards (tenant_id);

-- Notification channels
CREATE TABLE IF NOT EXISTS notification_channels (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    channel_type    TEXT NOT NULL,  -- 'webhook', 'email', 'slack', 'freshdesk'
    config          JSONB NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- Resource registry: every monitored thing is a resource
-- =====================================================================
CREATE TABLE IF NOT EXISTS resources (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    resource_type   TEXT NOT NULL,        -- 'ec2', 'rds', 'lambda', 'elb', 'server', etc.
    provider        TEXT NOT NULL,        -- 'aws', 'local', 'gcp', 'azure'
    region          TEXT NOT NULL DEFAULT '',
    account_id      TEXT NOT NULL DEFAULT '',
    name            TEXT NOT NULL,
    external_id     TEXT NOT NULL DEFAULT '',  -- e.g. EC2 instance-id, RDS cluster-id
    tags            JSONB NOT NULL DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'stopped', 'terminated', 'unknown'
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resources_tenant_type
    ON resources (tenant_id, resource_type);

CREATE INDEX IF NOT EXISTS idx_resources_provider_account
    ON resources (tenant_id, provider, account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_external
    ON resources (tenant_id, provider, external_id)
    WHERE external_id != '';

CREATE INDEX IF NOT EXISTS idx_resources_tags
    ON resources USING GIN (tags);

-- =====================================================================
-- AWS account configuration
-- =====================================================================
CREATE TABLE IF NOT EXISTS aws_accounts (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    account_id      TEXT NOT NULL,       -- AWS account number (12 digits)
    role_arn        TEXT NOT NULL DEFAULT '',
    external_id     TEXT NOT NULL DEFAULT '',
    regions         JSONB NOT NULL DEFAULT '["ap-south-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","us-east-1","us-east-2","us-west-2","eu-west-1","eu-central-1"]',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    collect_config  JSONB NOT NULL DEFAULT '{}',
    last_sync_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aws_accounts_tenant_account
    ON aws_accounts (tenant_id, account_id);

-- =====================================================================
-- Azure subscription configuration
-- =====================================================================
CREATE TABLE IF NOT EXISTS azure_subscriptions (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    subscription_id TEXT NOT NULL,       -- Azure subscription UUID
    azure_tenant_id TEXT NOT NULL,       -- Azure AD tenant UUID
    client_id       TEXT NOT NULL,       -- Service principal app ID
    client_secret   TEXT NOT NULL DEFAULT '',  -- Service principal secret
    regions         JSONB NOT NULL DEFAULT '["centralindia","southindia","westindia","southeastasia","eastasia","japaneast","australiaeast","eastus","eastus2","westus2","centralus","westeurope","northeurope","uksouth"]',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    collect_config  JSONB NOT NULL DEFAULT '{}',
    last_sync_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_azure_subs_tenant_sub
    ON azure_subscriptions (tenant_id, subscription_id);

-- =====================================================================
-- Alert silences: suppress notifications for rules/matchers
-- =====================================================================
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
);

CREATE INDEX IF NOT EXISTS idx_alert_silences_tenant_enabled
    ON alert_silences (tenant_id, enabled);

CREATE INDEX IF NOT EXISTS idx_alert_silences_time_range
    ON alert_silences (starts_at, ends_at)
    WHERE enabled = TRUE;

-- =====================================================================
-- Collection jobs: track what's being collected and when
-- =====================================================================
CREATE TABLE IF NOT EXISTS collection_jobs (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    job_type        TEXT NOT NULL,        -- 'cloudwatch', 'discovery', 'os_metrics'
    target_id       TEXT NOT NULL DEFAULT '',  -- resource or account id
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending','running','completed','failed'
    config          JSONB NOT NULL DEFAULT '{}',
    result          JSONB NOT NULL DEFAULT '{}',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_jobs_status
    ON collection_jobs (tenant_id, status, created_at DESC);

-- =====================================================================
-- API keys: authentication tokens scoped to a tenant
-- =====================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id              TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL DEFAULT 'default',
    name            TEXT NOT NULL,
    key_hash        TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    hash_version    INTEGER NOT NULL DEFAULT 1,    -- 1=SHA-256, 2=Argon2id (ADR-0006)
    scopes          JSONB NOT NULL DEFAULT '["read","write"]',
    rate_limit      INTEGER NOT NULL DEFAULT 1000,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at      TIMESTAMPTZ,
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
    ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
    ON api_keys (tenant_id, enabled);

-- =====================================================================
-- Auth: Users (UUIDv7 PKs from here on — ADR-0004)
-- =====================================================================
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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users (LOWER(email));

-- =====================================================================
-- Auth: Tenants
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id              UUID PRIMARY KEY,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    tier            TEXT NOT NULL DEFAULT 'free',
    status          TEXT NOT NULL DEFAULT 'active',
    quotas          JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug
    ON tenants (slug);

-- =====================================================================
-- Auth: Tenant memberships (user <-> tenant with role)
-- =====================================================================
CREATE TABLE IF NOT EXISTS tenant_memberships (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'member',
    invited_by      UUID REFERENCES users(id),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_tenant
    ON tenant_memberships (tenant_id, role);

-- =====================================================================
-- Auth: User invites
-- =====================================================================
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
);

CREATE INDEX IF NOT EXISTS idx_invites_tenant
    ON user_invites (tenant_id);

CREATE INDEX IF NOT EXISTS idx_invites_token
    ON user_invites (token_hash);

-- =====================================================================
-- Audit: Tenant-scoped audit log
-- =====================================================================
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
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
    ON audit_log (tenant_id, created_at DESC);

-- =====================================================================
-- Audit: Platform-level audit log (super admin actions)
-- =====================================================================
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
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_time
    ON platform_audit_log (created_at DESC);

-- =====================================================================
-- Audit: Security log (auth events — login, logout, password changes)
-- =====================================================================
CREATE TABLE IF NOT EXISTS security_log (
    id              UUID PRIMARY KEY,
    user_id         UUID,
    event_type      TEXT NOT NULL,
    success         BOOLEAN NOT NULL,
    ip_address      TEXT,
    user_agent      TEXT,
    details         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_log_user
    ON security_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_log_type
    ON security_log (event_type, created_at DESC);

-- =====================================================================
-- Row-Level Security policies on ALL tenant-scoped tables
-- Enforced via: SET app.current_tenant_id = '<tenant_id>' at connection checkout
-- =====================================================================

-- Helper: allow neoguard superuser to bypass RLS (for migrations, admin ops)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neoguard_app') THEN
        CREATE ROLE neoguard_app;
    END IF;
END $$;

-- Existing tables (tenant_id is TEXT)
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_rules
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_events
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE alert_rule_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_rule_states
    FOR ALL USING (rule_id IN (
        SELECT id FROM alert_rules WHERE tenant_id = current_setting('app.current_tenant_id', true)
    ));

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dashboards
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_channels
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON resources
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE aws_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON aws_accounts
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE azure_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON azure_subscriptions
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE alert_silences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_silences
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE collection_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON collection_jobs
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON api_keys
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- New tables (tenant_id is UUID)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_log
    FOR ALL USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Metrics hypertable: RLS on hypertables works but we set the GUC before queries
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON metrics
    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));

-- =====================================================================
-- Auth: Password reset tokens
-- =====================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
    ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens (user_id, created_at DESC);

-- Tables NOT RLS-enforced (platform-level):
-- users, tenants, tenant_memberships, user_invites, platform_audit_log, security_log, password_reset_tokens
-- These are accessed cross-tenant by auth/admin middleware

-- The neoguard DB owner bypasses RLS by default (table owner).
-- For the app connection pool, we rely on setting the GUC before each request.
