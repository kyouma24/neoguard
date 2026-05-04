import pytest

from neoguard.services.mql.ast_nodes import (
    AbsFunc,
    AsCountFunc,
    AsRateFunc,
    DerivativeFunc,
    ExactMatch,
    InSetMatch,
    LogFunc,
    MQLQuery,
    MovingAverageFunc,
    NegationMatch,
    RateFunc,
    Rollup,
    WildcardMatch,
)
from neoguard.services.mql.parser import MQLParseError, parse
from neoguard.services.mql.tokenizer import MQLTokenizeError


class TestBasicParsing:
    def test_simple_query(self):
        q = parse("avg:cpu")
        assert q.aggregator == "avg"
        assert q.metric_name == "cpu"
        assert q.filters == ()
        assert q.functions == ()
        assert q.rollup is None

    def test_dotted_metric(self):
        q = parse("sum:aws.rds.cpuutilization")
        assert q.aggregator == "sum"
        assert q.metric_name == "aws.rds.cpuutilization"

    def test_all_aggregators(self):
        for agg in ("avg", "sum", "min", "max", "count"):
            q = parse(f"{agg}:metric")
            assert q.aggregator == agg

    def test_deeply_nested_metric_name(self):
        q = parse("avg:a.b.c.d.e.f")
        assert q.metric_name == "a.b.c.d.e.f"


class TestTagFilters:
    def test_exact_match(self):
        q = parse("avg:m{env:prod}")
        assert len(q.filters) == 1
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.key == "env"
        assert f.value == "prod"

    def test_multiple_exact_matches(self):
        q = parse("avg:m{env:prod,host:web-1}")
        assert len(q.filters) == 2
        assert isinstance(q.filters[0], ExactMatch)
        assert isinstance(q.filters[1], ExactMatch)
        assert q.filters[0].key == "env"
        assert q.filters[1].key == "host"
        assert q.filters[1].value == "web-1"

    def test_wildcard_star(self):
        q = parse("avg:m{host:*}")
        assert len(q.filters) == 1
        f = q.filters[0]
        assert isinstance(f, WildcardMatch)
        assert f.key == "host"
        assert f.pattern == "*"

    def test_wildcard_pattern(self):
        q = parse("avg:m{host:web-*}")
        f = q.filters[0]
        assert isinstance(f, WildcardMatch)
        assert f.pattern == "web-*"

    def test_negation(self):
        q = parse("avg:m{!status:5xx}")
        f = q.filters[0]
        assert isinstance(f, NegationMatch)
        assert f.key == "status"
        assert f.value == "5xx"

    def test_in_set(self):
        q = parse("avg:m{env IN (prod,staging,dev)}")
        f = q.filters[0]
        assert isinstance(f, InSetMatch)
        assert f.key == "env"
        assert f.values == ("prod", "staging", "dev")

    def test_empty_filters(self):
        q = parse("avg:m{}")
        assert q.filters == ()

    def test_mixed_filters(self):
        q = parse("avg:m{env:prod,!status:5xx,host:web-*}")
        assert len(q.filters) == 3
        assert isinstance(q.filters[0], ExactMatch)
        assert isinstance(q.filters[1], NegationMatch)
        assert isinstance(q.filters[2], WildcardMatch)


class TestFunctions:
    def test_rate(self):
        q = parse("avg:m.rate()")
        assert len(q.functions) == 1
        assert isinstance(q.functions[0], RateFunc)

    def test_derivative(self):
        q = parse("avg:m.derivative()")
        assert isinstance(q.functions[0], DerivativeFunc)

    def test_moving_average(self):
        q = parse("avg:m.moving_average(5)")
        f = q.functions[0]
        assert isinstance(f, MovingAverageFunc)
        assert f.window == 5

    def test_as_rate(self):
        q = parse("sum:m.as_rate()")
        assert isinstance(q.functions[0], AsRateFunc)

    def test_as_count(self):
        q = parse("sum:m.as_count()")
        assert isinstance(q.functions[0], AsCountFunc)

    def test_abs(self):
        q = parse("avg:m.abs()")
        assert isinstance(q.functions[0], AbsFunc)

    def test_log(self):
        q = parse("avg:m.log()")
        assert isinstance(q.functions[0], LogFunc)

    def test_chained_functions(self):
        q = parse("avg:m.rate().abs()")
        assert len(q.functions) == 2
        assert isinstance(q.functions[0], RateFunc)
        assert isinstance(q.functions[1], AbsFunc)

    def test_function_after_filters(self):
        q = parse("avg:m{env:prod}.rate()")
        assert len(q.filters) == 1
        assert len(q.functions) == 1


class TestRollup:
    def test_basic_rollup(self):
        q = parse("avg:m.rollup(max,300)")
        assert q.rollup is not None
        assert q.rollup.method == "max"
        assert q.rollup.seconds == 300

    def test_rollup_after_function(self):
        q = parse("avg:m.rate().rollup(sum,60)")
        assert len(q.functions) == 1
        assert q.rollup is not None
        assert q.rollup.method == "sum"
        assert q.rollup.seconds == 60

    def test_all_rollup_methods(self):
        for method in ("avg", "sum", "min", "max", "count"):
            q = parse(f"avg:m.rollup({method},60)")
            assert q.rollup.method == method


class TestComplexQueries:
    def test_full_query(self):
        q = parse("avg:aws.rds.cpu{db_instance:mydb,env:prod}.rate().rollup(max,300)")
        assert q.aggregator == "avg"
        assert q.metric_name == "aws.rds.cpu"
        assert len(q.filters) == 2
        assert len(q.functions) == 1
        assert q.rollup.method == "max"
        assert q.rollup.seconds == 300

    def test_spec_example_1(self):
        q = parse("avg:aws.rds.cpu{db_instance:mydb,env:prod}")
        assert q.aggregator == "avg"
        assert q.metric_name == "aws.rds.cpu"

    def test_spec_example_2(self):
        q = parse("sum:aws.lambda.invocations{function_name:*}.as_rate()")
        assert q.aggregator == "sum"
        assert q.metric_name == "aws.lambda.invocations"
        assert isinstance(q.filters[0], WildcardMatch)
        assert isinstance(q.functions[0], AsRateFunc)

    def test_spec_example_3(self):
        q = parse("max:system.memory{host:web-*,env:prod}.rollup(max,300)")
        assert q.aggregator == "max"
        assert q.metric_name == "system.memory"
        assert len(q.filters) == 2
        assert q.rollup.seconds == 300

    def test_spec_example_4(self):
        q = parse("avg:http.request.duration{service:api,!status:5xx}.moving_average(5)")
        assert q.aggregator == "avg"
        assert q.metric_name == "http.request.duration"
        assert isinstance(q.filters[0], ExactMatch)
        assert isinstance(q.filters[1], NegationMatch)
        assert isinstance(q.functions[0], MovingAverageFunc)
        assert q.functions[0].window == 5


class TestParseErrors:
    def test_missing_aggregator(self):
        with pytest.raises(MQLParseError, match="AGGREGATOR"):
            parse("cpu")

    def test_missing_colon(self):
        with pytest.raises(MQLParseError, match="COLON"):
            parse("avg cpu")

    def test_missing_metric_name(self):
        with pytest.raises(MQLParseError, match="metric name"):
            parse("avg:{env:prod}")

    def test_unknown_function(self):
        with pytest.raises(MQLParseError, match="Unknown function"):
            parse("avg:m.bogus()")

    def test_invalid_rollup_method(self):
        with pytest.raises(MQLParseError, match="Invalid rollup method"):
            parse("avg:m.rollup(bogus,60)")

    def test_missing_rollup_seconds(self):
        with pytest.raises(MQLParseError, match="rollup separator"):
            parse("avg:m.rollup(max)")

    def test_negation_with_wildcard(self):
        with pytest.raises(MQLParseError, match="Negation with wildcard"):
            parse("avg:m{!host:*}")

    def test_negation_with_in(self):
        with pytest.raises(MQLParseError, match="Negation with IN"):
            parse("avg:m{!env IN (prod,staging)}")

    def test_moving_average_zero(self):
        with pytest.raises(MQLParseError, match="moving_average window must be >= 1"):
            parse("avg:m.moving_average(0)")

    def test_rollup_zero_seconds(self):
        with pytest.raises(MQLParseError, match="Rollup seconds must be >= 1"):
            parse("avg:m.rollup(max,0)")

    def test_error_has_position(self):
        with pytest.raises(MQLParseError) as exc_info:
            parse("avg:m.bogus()")
        assert exc_info.value.pos > 0

    def test_unclosed_brace(self):
        with pytest.raises(MQLParseError, match="RBRACE"):
            parse("avg:m{env:prod")

    def test_unclosed_paren(self):
        with pytest.raises(MQLParseError, match="RPAREN"):
            parse("avg:m.rate(")

    def test_trailing_content(self):
        with pytest.raises(MQLParseError, match="end of query"):
            parse("avg:m extra")


class TestSecurityBoundaries:
    """Injection attempts must fail at parse or tokenize stage."""

    def test_sql_injection_in_tag_key(self):
        with pytest.raises((MQLParseError, MQLTokenizeError)):
            parse("avg:m{'; DROP TABLE metrics;--:val}")

    def test_sql_injection_in_metric_name(self):
        with pytest.raises((MQLParseError, MQLTokenizeError)):
            parse("avg:cpu'; DROP TABLE--")

    def test_tag_value_with_sql_is_safe(self):
        q = parse("avg:m{env:prod-OR-1}")
        assert isinstance(q.filters[0], ExactMatch)
        assert q.filters[0].value == "prod-OR-1"

    def test_backtick_rejected(self):
        with pytest.raises((MQLParseError, MQLTokenizeError)):
            parse("avg:m{env:`exploit`}")

    def test_semicolon_rejected(self):
        with pytest.raises((MQLParseError, MQLTokenizeError)):
            parse("avg:m{env:prod;DROP}")

    def test_double_dash_comment_rejected(self):
        with pytest.raises((MQLParseError, MQLTokenizeError)):
            parse("avg:m{env:prod}--comment")


class TestPercentileAggregators:
    """MQL-002: p50, p95, p99 aggregator support in parser."""

    def test_p50_query(self):
        q = parse("p50:http.request.duration")
        assert q.aggregator == "p50"
        assert q.metric_name == "http.request.duration"

    def test_p95_with_filters(self):
        q = parse("p95:api.latency{env:prod}")
        assert q.aggregator == "p95"
        assert len(q.filters) == 1
        assert isinstance(q.filters[0], ExactMatch)
        assert q.filters[0].value == "prod"

    def test_p99_with_functions(self):
        q = parse("p99:db.query.time.rate()")
        assert q.aggregator == "p99"
        assert len(q.functions) == 1

    def test_p95_rollup_method(self):
        q = parse("avg:m.rollup(p95,60)")
        assert q.rollup is not None
        assert q.rollup.method == "p95"
        assert q.rollup.seconds == 60

    def test_p99_rollup_method(self):
        q = parse("avg:m.rollup(p99,300)")
        assert q.rollup is not None
        assert q.rollup.method == "p99"


class TestStringInFilters:
    """MQL-002: STRING token handling in tag filter values."""

    def test_single_quoted_exact_match(self):
        q = parse("avg:m{env:'production'}")
        assert len(q.filters) == 1
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.key == "env"
        assert f.value == "production"

    def test_double_quoted_exact_match(self):
        q = parse('avg:m{env:"staging"}')
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.value == "staging"

    def test_string_with_spaces_in_filter(self):
        q = parse("avg:m{name:'my service'}")
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.value == "my service"

    def test_string_in_in_set(self):
        q = parse("avg:m{env IN ('prod','staging')}")
        f = q.filters[0]
        assert isinstance(f, InSetMatch)
        assert f.values == ("prod", "staging")

    def test_negated_string_value(self):
        q = parse("avg:m{!env:'test'}")
        f = q.filters[0]
        assert isinstance(f, NegationMatch)
        assert f.value == "test"


class TestVariableInFilters:
    """MQL-002: VARIABLE token handling in tag filter values."""

    def test_variable_in_exact_filter(self):
        q = parse("avg:m{env:$env}")
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.value == "$env"

    def test_variable_in_in_set(self):
        q = parse("avg:m{env IN ($env1,$env2)}")
        f = q.filters[0]
        assert isinstance(f, InSetMatch)
        assert f.values == ("$env1", "$env2")

    def test_negated_variable(self):
        q = parse("avg:m{!env:$excluded}")
        f = q.filters[0]
        assert isinstance(f, NegationMatch)
        assert f.value == "$excluded"


class TestFloatInParser:
    """MQL-002: FLOAT token handling in numeric positions."""

    def test_float_in_tag_value(self):
        q = parse("avg:m{threshold:3.14}")
        f = q.filters[0]
        assert isinstance(f, ExactMatch)
        assert f.value == "3.14"

    def test_float_in_moving_average_truncated(self):
        """Float arg to moving_average should be truncated to int."""
        q = parse("avg:m.moving_average(5.7)")
        assert isinstance(q.functions[0], MovingAverageFunc)
        assert q.functions[0].window == 5
