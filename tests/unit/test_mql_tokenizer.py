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
