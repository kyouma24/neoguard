import pytest
from datetime import datetime, timezone

from neoguard.services.mql.ast_nodes import (
    ExactMatch,
    InSetMatch,
    MQLQuery,
    NegationMatch,
    RateFunc,
    Rollup,
    WildcardMatch,
)
from neoguard.services.mql.compiler import compile_query, CompiledQuery

START = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
END = datetime(2026, 5, 1, 1, 0, 0, tzinfo=timezone.utc)


def _compile(query: MQLQuery, tenant_id: str | None = "t1", interval: str = "1m") -> CompiledQuery:
    return compile_query(query, tenant_id=tenant_id, start=START, end=END, interval=interval)


class TestBasicCompilation:
    def test_simple_query_generates_sql(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q)
        assert "SELECT" in result.sql
        assert "FROM metrics_1m" in result.sql
        assert "AVG(avg_value)" in result.sql

    def test_metric_name_in_params(self):
        q = MQLQuery(aggregator="avg", metric_name="aws.rds.cpu")
        result = _compile(q)
        assert "aws.rds.cpu" in result.params
        assert result.metric_name == "aws.rds.cpu"

    def test_tenant_id_in_params(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, tenant_id="my-tenant")
        assert "my-tenant" in result.params
        assert "tenant_id =" in result.sql

    def test_no_tenant_id(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, tenant_id=None)
        assert "tenant_id" not in result.sql

    def test_time_range_in_params(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q)
        assert START in result.params
        assert END in result.params


class TestAggregations:
    def test_avg_on_aggregate_table(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q)
        assert "AVG(avg_value)" in result.sql

    def test_min_on_aggregate_table(self):
        q = MQLQuery(aggregator="min", metric_name="cpu")
        result = _compile(q)
        assert "MIN(min_value)" in result.sql

    def test_max_on_aggregate_table(self):
        q = MQLQuery(aggregator="max", metric_name="cpu")
        result = _compile(q)
        assert "MAX(max_value)" in result.sql

    def test_sum_on_aggregate_table(self):
        q = MQLQuery(aggregator="sum", metric_name="cpu")
        result = _compile(q)
        assert "SUM(avg_value * sample_count)" in result.sql

    def test_count_on_aggregate_table(self):
        q = MQLQuery(aggregator="count", metric_name="cpu")
        result = _compile(q)
        assert "SUM(sample_count)" in result.sql

    def test_avg_on_raw_table(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="raw")
        assert "FROM metrics" in result.sql
        assert "AVG(value)" in result.sql


class TestSourceTableSelection:
    def test_raw_interval_uses_metrics(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="raw")
        assert "FROM metrics" in result.sql
        assert "FROM metrics_1m" not in result.sql

    def test_1m_interval_uses_metrics_1m(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="1m")
        assert "FROM metrics_1m" in result.sql

    def test_1h_interval_uses_metrics_1h(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="1h")
        assert "FROM metrics_1h" in result.sql

    def test_long_span_uses_metrics_1h(self):
        start = datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc)
        end = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = compile_query(q, tenant_id="t1", start=start, end=end, interval="5m")
        assert "FROM metrics_1h" in result.sql


class TestTimeBucketing:
    def test_1m_bucket(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="1m")
        # MQL-003: bucket interval is now parameterized as seconds
        assert "time_bucket($1 * interval '1 second'" in result.sql
        assert 60 in result.params

    def test_5m_bucket(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="5m")
        assert "time_bucket($1 * interval '1 second'" in result.sql
        assert 300 in result.params

    def test_raw_no_bucket(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        result = _compile(q, interval="raw")
        assert "time_bucket" not in result.sql


class TestTagFilterCompilation:
    def test_exact_match(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(ExactMatch(key="env", value="prod"),),
        )
        result = _compile(q)
        # MQL-001: tag keys are now parameterized — not interpolated into SQL
        assert "tags->>(" in result.sql
        assert "env" in result.params
        assert "prod" in result.params

    def test_wildcard_match(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(WildcardMatch(key="host", pattern="web-*"),),
        )
        result = _compile(q)
        assert "tags->>(" in result.sql
        assert "LIKE" in result.sql
        assert "host" in result.params
        assert "web-%" in result.params

    def test_negation_match(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(NegationMatch(key="status", value="5xx"),),
        )
        result = _compile(q)
        assert "IS NULL OR tags->>(" in result.sql
        assert "!=" in result.sql
        assert "status" in result.params
        assert "5xx" in result.params

    def test_in_set_match(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(InSetMatch(key="env", values=("prod", "staging")),),
        )
        result = _compile(q)
        assert "tags->>(" in result.sql
        assert "IN" in result.sql
        assert "env" in result.params
        assert "prod" in result.params
        assert "staging" in result.params

    def test_multiple_filters(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(
                ExactMatch(key="env", value="prod"),
                NegationMatch(key="status", value="5xx"),
            ),
        )
        result = _compile(q)
        assert "env" in result.params
        assert "status" in result.params


class TestRollupCompilation:
    def test_rollup_overrides_bucket(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            rollup=Rollup(method="max", seconds=300),
        )
        result = _compile(q)
        # MQL-003: bucket interval is parameterized as seconds
        assert "time_bucket($1 * interval '1 second'" in result.sql
        assert 300 in result.params

    def test_rollup_overrides_aggregation(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            rollup=Rollup(method="max", seconds=300),
        )
        result = _compile(q)
        assert "MAX(max_value)" in result.sql


class TestPostProcessors:
    def test_functions_stored_as_post_processors(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            functions=(RateFunc(),),
        )
        result = _compile(q)
        assert len(result.post_processors) == 1
        assert isinstance(result.post_processors[0], RateFunc)


class TestParameterization:
    def test_params_are_parameterized(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu'; DROP TABLE metrics;--",
            filters=(ExactMatch(key="env", value="prod"),),
        )
        result = _compile(q)
        assert "cpu'; DROP TABLE metrics;--" in result.params
        assert "DROP TABLE" not in result.sql

    def test_param_indices_sequential(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(
                ExactMatch(key="a", value="1"),
                ExactMatch(key="b", value="2"),
            ),
        )
        result = _compile(q)
        for i in range(1, len(result.params) + 1):
            assert f"${i}" in result.sql


class TestTagKeySanitization:
    def test_valid_key_passes(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="env", value="prod"),),
        )
        result = _compile(q)
        # MQL-001: tag key is now a parameter, not in SQL text
        assert "tags->>(" in result.sql
        assert "env" in result.params

    def test_key_with_hyphens_passes(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="my-tag", value="v"),),
        )
        result = _compile(q)
        assert "tags->>(" in result.sql
        assert "my-tag" in result.params

    def test_key_with_underscores_passes(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="my_tag", value="v"),),
        )
        result = _compile(q)
        assert "tags->>(" in result.sql
        assert "my_tag" in result.params

    def test_sql_injection_in_key_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="'; DROP TABLE metrics;--", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_key_with_quotes_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="env'", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_key_with_parens_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="env()", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_key_with_spaces_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="env prod", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_empty_key_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_key_starting_with_digit_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="1env", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_very_long_key_rejected(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(ExactMatch(key="a" * 200, value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_wildcard_filter_key_validated(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(WildcardMatch(key="x' OR 1=1--", pattern="*"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_negation_filter_key_validated(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(NegationMatch(key="x'; --", value="v"),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)

    def test_in_set_filter_key_validated(self):
        q = MQLQuery(
            aggregator="avg", metric_name="cpu",
            filters=(InSetMatch(key="x')", values=("a",)),),
        )
        with pytest.raises(ValueError, match="Invalid tag key"):
            _compile(q)


class TestPercentileAggregationCompilation:
    """MQL-002: p50, p95, p99 aggregator SQL generation."""

    def test_p50_on_raw_table(self):
        q = MQLQuery(aggregator="p50", metric_name="latency")
        result = _compile(q, interval="raw")
        assert "PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value)" in result.sql

    def test_p95_on_raw_table(self):
        q = MQLQuery(aggregator="p95", metric_name="latency")
        result = _compile(q, interval="raw")
        assert "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value)" in result.sql

    def test_p99_on_raw_table(self):
        q = MQLQuery(aggregator="p99", metric_name="latency")
        result = _compile(q, interval="raw")
        assert "PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value)" in result.sql

    def test_p95_on_aggregate_table(self):
        q = MQLQuery(aggregator="p95", metric_name="latency")
        result = _compile(q, interval="1m")
        assert "PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY avg_value)" in result.sql

    def test_p99_on_aggregate_table(self):
        q = MQLQuery(aggregator="p99", metric_name="latency")
        result = _compile(q, interval="1m")
        assert "PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY avg_value)" in result.sql

    def test_p50_on_aggregate_table(self):
        q = MQLQuery(aggregator="p50", metric_name="latency")
        result = _compile(q, interval="1m")
        assert "PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_value)" in result.sql


class TestStringFilterCompilation:
    """MQL-002: STRING values compile to parameterized SQL correctly."""

    def test_string_value_parameterized(self):
        q = MQLQuery(
            aggregator="avg",
            metric_name="cpu",
            filters=(ExactMatch(key="env", value="my service"),),
        )
        result = _compile(q)
        assert "my service" in result.params
        assert "env" in result.params


class TestInvalidInterval:
    def test_invalid_interval_raises(self):
        q = MQLQuery(aggregator="avg", metric_name="cpu")
        with pytest.raises(ValueError, match="Invalid interval"):
            _compile(q, interval="99x")
