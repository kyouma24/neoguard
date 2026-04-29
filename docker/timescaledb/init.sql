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
    status          TEXT NOT NULL,  -- 'firing', 'resolved'
    value           DOUBLE PRECISION NOT NULL,
    threshold       DOUBLE PRECISION NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_events_tenant_rule
    ON alert_events (tenant_id, rule_id, fired_at DESC);

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
    channel_type    TEXT NOT NULL,  -- 'webhook', 'email', 'slack'
    config          JSONB NOT NULL DEFAULT '{}',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
