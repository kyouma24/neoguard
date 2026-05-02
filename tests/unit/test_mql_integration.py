"""End-to-end tests: MQL string → parse → compile → verify SQL + params."""

from datetime import datetime, timezone

import pytest

from neoguard.services.mql.parser import parse
from neoguard.services.mql.compiler import compile_query

START = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
END = datetime(2026, 5, 1, 1, 0, 0, tzinfo=timezone.utc)


def _e2e(mql: str, tenant_id: str | None = "t1", interval: str = "1m"):
    ast = parse(mql)
    return compile_query(ast, tenant_id=tenant_id, start=START, end=END, interval=interval)


class TestE2ESpecExamples:
    def test_simple_avg(self):
        c = _e2e("avg:aws.rds.cpu{db_instance:mydb,env:prod}")
        assert "aws.rds.cpu" in c.params
        assert "mydb" in c.params
        assert "prod" in c.params
        assert "AVG(avg_value)" in c.sql
        assert "tags->>'db_instance'" in c.sql
        assert "tags->>'env'" in c.sql

    def test_sum_with_wildcard_and_function(self):
        c = _e2e("sum:aws.lambda.invocations{function_name:*}.as_rate()")
        assert "SUM(avg_value * sample_count)" in c.sql
        assert "tags->>'function_name' LIKE" in c.sql
        assert "%" in c.params
        assert len(c.post_processors) == 1

    def test_max_with_rollup(self):
        c = _e2e("max:system.memory{host:web-*,env:prod}.rollup(max,300)")
        assert "time_bucket('300 seconds'" in c.sql
        assert "MAX(max_value)" in c.sql
        assert "web-%" in c.params

    def test_negation_filter(self):
        c = _e2e("avg:http.request.duration{service:api,!status:5xx}.moving_average(5)")
        assert "tags->>'service' =" in c.sql
        assert "tags->>'status' IS NULL OR tags->>'status' !=" in c.sql
        assert len(c.post_processors) == 1


class TestE2ETenantIsolation:
    def test_tenant_id_injected(self):
        c = _e2e("avg:cpu", tenant_id="tenant-abc")
        assert "tenant_id =" in c.sql
        assert "tenant-abc" in c.params

    def test_super_admin_no_tenant(self):
        c = _e2e("avg:cpu", tenant_id=None)
        assert "tenant_id" not in c.sql

    def test_tenant_id_not_injectable(self):
        c = _e2e("avg:cpu{env:prod}", tenant_id="'; DROP TABLE metrics;--")
        assert "'; DROP TABLE metrics;--" in c.params
        assert "DROP TABLE" not in c.sql


class TestE2ESourceTableSelection:
    def test_raw_interval(self):
        c = _e2e("avg:cpu", interval="raw")
        assert "FROM metrics" in c.sql
        assert "metrics_1" not in c.sql

    def test_1m_interval(self):
        c = _e2e("avg:cpu", interval="1m")
        assert "FROM metrics_1m" in c.sql

    def test_1h_interval(self):
        c = _e2e("avg:cpu", interval="1h")
        assert "FROM metrics_1h" in c.sql


class TestE2EInSetFilter:
    def test_in_set(self):
        c = _e2e("avg:cpu{env IN (prod,staging,dev)}")
        assert "tags->>'env' IN" in c.sql
        assert "prod" in c.params
        assert "staging" in c.params
        assert "dev" in c.params


class TestE2EParameterCount:
    def test_all_params_bound(self):
        c = _e2e("avg:cpu{a:1,b:2,c:3}", tenant_id="t1")
        expected_count = 1 + 1 + 2 + 3  # tenant + name + start/end + 3 tags
        assert len(c.params) == expected_count
        for i in range(1, expected_count + 1):
            assert f"${i}" in c.sql


class TestE2EChainedFunctions:
    def test_rate_then_abs(self):
        c = _e2e("avg:cpu.rate().abs()")
        assert len(c.post_processors) == 2

    def test_function_with_rollup(self):
        c = _e2e("avg:cpu.rate().rollup(sum,60)")
        assert len(c.post_processors) == 1
        assert "time_bucket('60 seconds'" in c.sql
        assert "SUM(avg_value * sample_count)" in c.sql
