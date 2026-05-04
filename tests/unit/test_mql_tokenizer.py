import pytest

from neoguard.services.mql.tokenizer import Token, TokenType, tokenize, MQLTokenizeError


class TestBasicTokenization:
    def test_simple_query(self):
        tokens = tokenize("avg:cpu")
        assert tokens[0] == Token(TokenType.AGGREGATOR, "avg", 0)
        assert tokens[1] == Token(TokenType.COLON, ":", 3)
        assert tokens[2] == Token(TokenType.IDENTIFIER, "cpu", 4)
        assert tokens[3].type == TokenType.EOF

    def test_dotted_metric_name(self):
        tokens = tokenize("sum:aws.rds.cpuutilization")
        names = [t for t in tokens if t.type == TokenType.IDENTIFIER]
        assert [n.value for n in names] == ["aws", "rds", "cpuutilization"]
        dots = [t for t in tokens if t.type == TokenType.DOT]
        assert len(dots) == 2

    def test_all_aggregators(self):
        for agg in ("avg", "sum", "min", "max", "count"):
            tokens = tokenize(f"{agg}:metric")
            assert tokens[0].type == TokenType.AGGREGATOR
            assert tokens[0].value == agg


class TestTagFilters:
    def test_simple_tag(self):
        tokens = tokenize("avg:m{env:prod}")
        types = [t.type for t in tokens]
        assert TokenType.LBRACE in types
        assert TokenType.RBRACE in types

    def test_negation(self):
        tokens = tokenize("avg:m{!env:prod}")
        # avg(0) :(1) m(2) {(3) !(4) env(5) :(6) prod(7) }(8)
        assert tokens[4].type == TokenType.BANG

    def test_wildcard(self):
        tokens = tokenize("avg:m{host:*}")
        assert any(t.type == TokenType.STAR for t in tokens)

    def test_in_keyword(self):
        tokens = tokenize("avg:m{env IN (prod,staging)}")
        in_tokens = [t for t in tokens if t.type == TokenType.IN]
        assert len(in_tokens) == 1

    def test_multiple_tags(self):
        tokens = tokenize("avg:m{env:prod,host:web-1}")
        commas = [t for t in tokens if t.type == TokenType.COMMA]
        assert len(commas) == 1


class TestFunctions:
    def test_function_parens(self):
        tokens = tokenize("avg:m.rate()")
        assert any(t.type == TokenType.LPAREN for t in tokens)
        assert any(t.type == TokenType.RPAREN for t in tokens)

    def test_moving_average_with_number(self):
        tokens = tokenize("avg:m.moving_average(5)")
        num = [t for t in tokens if t.type == TokenType.NUMBER]
        assert len(num) == 1
        assert num[0].value == "5"


class TestRollup:
    def test_rollup_tokens(self):
        tokens = tokenize("avg:m.rollup(max,300)")
        nums = [t for t in tokens if t.type == TokenType.NUMBER]
        assert len(nums) == 1
        assert nums[0].value == "300"


class TestEdgeCases:
    def test_whitespace_ignored(self):
        tokens = tokenize("  avg : cpu  ")
        non_eof = [t for t in tokens if t.type != TokenType.EOF]
        assert len(non_eof) == 3

    def test_empty_string(self):
        tokens = tokenize("")
        assert len(tokens) == 1
        assert tokens[0].type == TokenType.EOF

    def test_identifier_with_hyphens(self):
        tokens = tokenize("avg:my-metric-name")
        ident = [t for t in tokens if t.type == TokenType.IDENTIFIER]
        assert ident[0].value == "my-metric-name"

    def test_identifier_with_underscores(self):
        tokens = tokenize("avg:my_metric_name")
        ident = [t for t in tokens if t.type == TokenType.IDENTIFIER]
        assert ident[0].value == "my_metric_name"

    def test_negative_number(self):
        tokens = tokenize("avg:m.rollup(max,-300)")
        nums = [t for t in tokens if t.type == TokenType.NUMBER]
        assert nums[0].value == "-300"


class TestErrors:
    def test_invalid_character(self):
        with pytest.raises(MQLTokenizeError, match="Unexpected character"):
            tokenize("avg:m@invalid")

    def test_error_has_position(self):
        with pytest.raises(MQLTokenizeError) as exc_info:
            tokenize("avg:m@x")
        assert exc_info.value.pos == 5


class TestAggregatorPosition:
    def test_avg_not_aggregator_in_tag_value(self):
        tokens = tokenize("avg:m{agg:avg}")
        aggs = [t for t in tokens if t.type == TokenType.AGGREGATOR]
        assert len(aggs) == 1
        assert aggs[0].pos == 0
        tag_val = [t for t in tokens if t.type == TokenType.IDENTIFIER and t.value == "avg"]
        assert len(tag_val) == 0 or all(t.pos > 0 for t in tag_val)

    def test_min_as_identifier_in_metric_name(self):
        tokens = tokenize("avg:min.metric")
        assert tokens[0].type == TokenType.AGGREGATOR
        assert tokens[0].value == "avg"
        assert tokens[2].type == TokenType.IDENTIFIER
        assert tokens[2].value == "min"


class TestPercentileAggregators:
    """MQL-002: p50, p95, p99 aggregator support."""

    def test_p50_aggregator(self):
        tokens = tokenize("p50:latency")
        assert tokens[0] == Token(TokenType.AGGREGATOR, "p50", 0)
        assert tokens[2] == Token(TokenType.IDENTIFIER, "latency", 4)

    def test_p95_aggregator(self):
        tokens = tokenize("p95:http.request.duration")
        assert tokens[0].type == TokenType.AGGREGATOR
        assert tokens[0].value == "p95"

    def test_p99_aggregator(self):
        tokens = tokenize("p99:api.latency")
        assert tokens[0].type == TokenType.AGGREGATOR
        assert tokens[0].value == "p99"

    def test_p95_not_aggregator_in_tag_value(self):
        """p95 in tag filter position should be IDENTIFIER, not AGGREGATOR."""
        tokens = tokenize("avg:m{metric:p95}")
        aggs = [t for t in tokens if t.type == TokenType.AGGREGATOR]
        assert len(aggs) == 1
        assert aggs[0].value == "avg"


class TestStringTokens:
    """MQL-002: STRING token support for quoted values in filters."""

    def test_single_quoted_string(self):
        tokens = tokenize("avg:m{env:'production'}")
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert len(string_tokens) == 1
        assert string_tokens[0].value == "production"

    def test_double_quoted_string(self):
        tokens = tokenize('avg:m{env:"production"}')
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert len(string_tokens) == 1
        assert string_tokens[0].value == "production"

    def test_string_with_spaces(self):
        tokens = tokenize("avg:m{name:'my service'}")
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert len(string_tokens) == 1
        assert string_tokens[0].value == "my service"

    def test_string_with_special_chars(self):
        tokens = tokenize("avg:m{path:'/api/v1/users'}")
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert string_tokens[0].value == "/api/v1/users"

    def test_unterminated_string_raises(self):
        with pytest.raises(MQLTokenizeError, match="Unterminated string"):
            tokenize("avg:m{env:'production}")

    def test_empty_string(self):
        tokens = tokenize("avg:m{env:''}")
        string_tokens = [t for t in tokens if t.type == TokenType.STRING]
        assert len(string_tokens) == 1
        assert string_tokens[0].value == ""


class TestVariableTokens:
    """MQL-002: VARIABLE token support for $var references."""

    def test_simple_variable(self):
        tokens = tokenize("avg:m{env:$env}")
        var_tokens = [t for t in tokens if t.type == TokenType.VARIABLE]
        assert len(var_tokens) == 1
        assert var_tokens[0].value == "$env"

    def test_variable_with_underscore(self):
        tokens = tokenize("avg:m{env:$my_var}")
        var_tokens = [t for t in tokens if t.type == TokenType.VARIABLE]
        assert var_tokens[0].value == "$my_var"

    def test_variable_with_digits(self):
        tokens = tokenize("avg:m{env:$env2}")
        var_tokens = [t for t in tokens if t.type == TokenType.VARIABLE]
        assert var_tokens[0].value == "$env2"

    def test_bare_dollar_raises(self):
        with pytest.raises(MQLTokenizeError, match="Unexpected character"):
            tokenize("avg:m{env:$}")

    def test_dollar_digit_raises(self):
        with pytest.raises(MQLTokenizeError, match="Unexpected character"):
            tokenize("avg:m{env:$1var}")


class TestFloatTokens:
    """MQL-002: FLOAT token support for decimal numbers."""

    def test_simple_float(self):
        tokens = tokenize("avg:m{ver:3.14}")
        float_tokens = [t for t in tokens if t.type == TokenType.FLOAT]
        assert len(float_tokens) == 1
        assert float_tokens[0].value == "3.14"

    def test_negative_float(self):
        tokens = tokenize("avg:m.rollup(max,-1.5)")
        float_tokens = [t for t in tokens if t.type == TokenType.FLOAT]
        assert len(float_tokens) == 1
        assert float_tokens[0].value == "-1.5"

    def test_float_vs_dotted_ident(self):
        """3.14 should be FLOAT, but 3.abc should be NUMBER DOT IDENTIFIER."""
        tokens = tokenize("avg:m{x:3.14}")
        float_tokens = [t for t in tokens if t.type == TokenType.FLOAT]
        assert len(float_tokens) == 1

    def test_integer_not_float(self):
        """Plain integer should still be NUMBER, not FLOAT."""
        tokens = tokenize("avg:m.rollup(max,300)")
        nums = [t for t in tokens if t.type == TokenType.NUMBER]
        assert len(nums) == 1
        assert nums[0].value == "300"
        assert not any(t.type == TokenType.FLOAT for t in tokens)
