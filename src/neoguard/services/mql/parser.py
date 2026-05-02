from __future__ import annotations

from neoguard.services.mql.ast_nodes import (
    AbsFunc,
    AsCountFunc,
    AsRateFunc,
    DerivativeFunc,
    ExactMatch,
    InSetMatch,
    LogFunc,
    MQLFunction,
    MQLQuery,
    MovingAverageFunc,
    NegationMatch,
    RateFunc,
    Rollup,
    TagFilter,
    WildcardMatch,
)
from neoguard.services.mql.tokenizer import Token, TokenType, tokenize


class MQLParseError(Exception):
    def __init__(self, message: str, pos: int) -> None:
        self.pos = pos
        super().__init__(f"{message} at position {pos}")


FUNCTION_NAMES = frozenset({
    "rate", "derivative", "moving_average",
    "as_rate", "as_count", "abs", "log",
})

ROLLUP_METHODS = frozenset({"avg", "sum", "min", "max", "count"})


class _Parser:
    def __init__(self, tokens: list[Token]) -> None:
        self._tokens = tokens
        self._pos = 0

    def _peek(self) -> Token:
        return self._tokens[self._pos]

    def _advance(self) -> Token:
        tok = self._tokens[self._pos]
        self._pos += 1
        return tok

    def _expect(self, tt: TokenType, context: str = "") -> Token:
        tok = self._peek()
        if tok.type != tt:
            ctx = f" ({context})" if context else ""
            raise MQLParseError(
                f"Expected {tt.name} but got {tok.type.name} '{tok.value}'{ctx}",
                tok.pos,
            )
        return self._advance()

    def _at(self, tt: TokenType) -> bool:
        return self._peek().type == tt

    def _at_value(self, tt: TokenType, value: str) -> bool:
        tok = self._peek()
        return tok.type == tt and tok.value == value

    def parse(self) -> MQLQuery:
        aggregator = self._parse_aggregator()
        self._expect(TokenType.COLON, "after aggregator")
        metric_name = self._parse_metric_name()
        filters = self._parse_filters()
        functions, rollup = self._parse_chain()
        self._expect(TokenType.EOF, "end of query")
        return MQLQuery(
            aggregator=aggregator,
            metric_name=metric_name,
            filters=tuple(filters),
            functions=tuple(functions),
            rollup=rollup,
        )

    def _parse_aggregator(self) -> str:
        tok = self._expect(TokenType.AGGREGATOR, "query must start with aggregator")
        return tok.value

    def _parse_metric_name(self) -> str:
        parts: list[str] = []
        parts.append(self._expect(TokenType.IDENTIFIER, "metric name").value)
        while self._at(TokenType.DOT):
            next_tok = self._tokens[self._pos + 1] if self._pos + 1 < len(self._tokens) else None
            if next_tok and next_tok.type == TokenType.IDENTIFIER:
                if next_tok.value in FUNCTION_NAMES or next_tok.value == "rollup":
                    break
                after_next = self._tokens[self._pos + 2] if self._pos + 2 < len(self._tokens) else None
                if after_next and after_next.type == TokenType.LPAREN:
                    break
            self._advance()
            parts.append(self._expect(TokenType.IDENTIFIER, "metric name segment").value)
        return ".".join(parts)

    def _parse_filters(self) -> list[TagFilter]:
        if not self._at(TokenType.LBRACE):
            return []
        self._advance()
        filters: list[TagFilter] = []
        if not self._at(TokenType.RBRACE):
            filters.append(self._parse_single_filter())
            while self._at(TokenType.COMMA):
                self._advance()
                filters.append(self._parse_single_filter())
        self._expect(TokenType.RBRACE, "closing tag filter")
        return filters

    def _parse_single_filter(self) -> TagFilter:
        negated = False
        if self._at(TokenType.BANG):
            negated = True
            self._advance()

        key = self._expect(TokenType.IDENTIFIER, "tag key").value

        if self._at(TokenType.IN):
            if negated:
                raise MQLParseError("Negation with IN is not supported", self._peek().pos)
            return self._parse_in_set(key)

        self._expect(TokenType.COLON, "tag separator")

        if self._at(TokenType.STAR):
            if negated:
                raise MQLParseError("Negation with wildcard is not supported", self._peek().pos)
            self._advance()
            return WildcardMatch(key=key, pattern="*")

        value = self._parse_tag_value()

        if "*" in value:
            if negated:
                raise MQLParseError("Negation with wildcard is not supported", self._peek().pos)
            return WildcardMatch(key=key, pattern=value)

        if negated:
            return NegationMatch(key=key, value=value)

        return ExactMatch(key=key, value=value)

    def _parse_tag_value(self) -> str:
        parts: list[str] = []
        while True:
            tok = self._peek()
            if tok.type == TokenType.IDENTIFIER:
                parts.append(self._advance().value)
            elif tok.type == TokenType.NUMBER:
                parts.append(self._advance().value)
            elif tok.type == TokenType.STAR:
                parts.append(self._advance().value)
            elif tok.type == TokenType.DOT:
                parts.append(self._advance().value)
            elif tok.type == TokenType.COLON:
                parts.append(self._advance().value)
            else:
                break
        if not parts:
            raise MQLParseError(f"Expected tag value but got {tok.type.name}", tok.pos)
        return "".join(parts)

    def _parse_in_set(self, key: str) -> InSetMatch:
        self._advance()  # consume IN
        self._expect(TokenType.LPAREN, "IN set")
        values: list[str] = []
        values.append(self._parse_tag_value())
        while self._at(TokenType.COMMA):
            self._advance()
            values.append(self._parse_tag_value())
        self._expect(TokenType.RPAREN, "closing IN set")
        return InSetMatch(key=key, values=tuple(values))

    def _parse_chain(self) -> tuple[list[MQLFunction], Rollup | None]:
        functions: list[MQLFunction] = []
        rollup: Rollup | None = None

        while self._at(TokenType.DOT):
            self._advance()
            name_tok = self._expect(TokenType.IDENTIFIER, "function name")
            name = name_tok.value

            if name == "rollup":
                rollup = self._parse_rollup()
                break

            if name not in FUNCTION_NAMES:
                raise MQLParseError(
                    f"Unknown function '{name}'. Must be one of: {', '.join(sorted(FUNCTION_NAMES | {'rollup'}))}",
                    name_tok.pos,
                )

            func = self._parse_function(name, name_tok.pos)
            functions.append(func)

        return functions, rollup

    def _parse_function(self, name: str, pos: int) -> MQLFunction:
        self._expect(TokenType.LPAREN, f"opening {name}()")

        if name == "moving_average":
            window_tok = self._expect(TokenType.NUMBER, "moving_average window size")
            window = int(window_tok.value)
            if window < 1:
                raise MQLParseError("moving_average window must be >= 1", window_tok.pos)
            self._expect(TokenType.RPAREN, f"closing {name}()")
            return MovingAverageFunc(window=window)

        self._expect(TokenType.RPAREN, f"closing {name}()")

        match name:
            case "rate":
                return RateFunc()
            case "derivative":
                return DerivativeFunc()
            case "as_rate":
                return AsRateFunc()
            case "as_count":
                return AsCountFunc()
            case "abs":
                return AbsFunc()
            case "log":
                return LogFunc()
            case _:
                raise MQLParseError(f"Unknown function '{name}'", pos)

    def _parse_rollup(self) -> Rollup:
        self._expect(TokenType.LPAREN, "opening rollup()")
        method_tok = self._expect(TokenType.IDENTIFIER, "rollup method")
        if method_tok.value not in ROLLUP_METHODS:
            raise MQLParseError(
                f"Invalid rollup method '{method_tok.value}'. Must be one of: {', '.join(sorted(ROLLUP_METHODS))}",
                method_tok.pos,
            )
        self._expect(TokenType.COMMA, "rollup separator")
        seconds_tok = self._expect(TokenType.NUMBER, "rollup seconds")
        seconds = int(seconds_tok.value)
        if seconds < 1:
            raise MQLParseError("Rollup seconds must be >= 1", seconds_tok.pos)
        self._expect(TokenType.RPAREN, "closing rollup()")
        return Rollup(method=method_tok.value, seconds=seconds)


def parse(source: str) -> MQLQuery:
    tokens = tokenize(source)
    return _Parser(tokens).parse()
