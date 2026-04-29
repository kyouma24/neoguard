-- ClickHouse initialization for NeoGuard log storage

CREATE DATABASE IF NOT EXISTS neoguard;

CREATE TABLE IF NOT EXISTS neoguard.logs
(
    timestamp       DateTime64(9, 'UTC'),
    tenant_id       LowCardinality(String) DEFAULT 'default',
    trace_id        String DEFAULT '',
    span_id         String DEFAULT '',
    severity        LowCardinality(String),
    service         LowCardinality(String),
    message         String,
    attributes      Map(String, String),
    resource        Map(String, String),
    INDEX idx_message message TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4,
    INDEX idx_severity severity TYPE set(0) GRANULARITY 1,
    INDEX idx_service service TYPE set(0) GRANULARITY 1
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (tenant_id, service, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;
