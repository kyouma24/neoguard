from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto


class TokenType(Enum):
    AGGREGATOR = auto()
    COLON = auto()
    IDENTIFIER = auto()
    LBRACE = auto()
    RBRACE = auto()
    LPAREN = auto()
    RPAREN = auto()
    COMMA = auto()
    DOT = auto()
    BANG = auto()
    STAR = auto()
    NUMBER = auto()
    FLOAT = auto()
    STRING = auto()
    VARIABLE = auto()
    IN = auto()
    EOF = auto()


AGGREGATORS = frozenset({"avg", "sum", "min", "max", "count", "p50", "p95", "p99"})

SINGLE_CHARS: dict[str, TokenType] = {
    ":": TokenType.COLON,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    ",": TokenType.COMMA,
    ".": TokenType.DOT,
    "!": TokenType.BANG,
    "*": TokenType.STAR,
}


@dataclass(frozen=True, slots=True)
class Token:
    type: TokenType
    value: str
    pos: int


class MQLTokenizeError(Exception):
    def __init__(self, message: str, pos: int) -> None:
        self.pos = pos
        super().__init__(f"{message} at position {pos}")


def tokenize(source: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    length = len(source)

    while i < length:
        ch = source[i]

        if ch in " \t\n\r":
            i += 1
            continue

        # Variable: $ident
        if ch == "$":
            start = i
            i += 1  # consume $
            if i < length and (source[i].isalpha() or source[i] == "_"):
                i += 1
                while i < length and (source[i].isalnum() or source[i] == "_"):
                    i += 1
                tokens.append(Token(TokenType.VARIABLE, source[start:i], start))
                continue
            raise MQLTokenizeError("Unexpected character '$'", start)

        if ch in SINGLE_CHARS:
            tokens.append(Token(SINGLE_CHARS[ch], ch, i))
            i += 1
            continue

        # String literals: 'abc' or "abc"
        if ch in ("'", '"'):
            start = i
            quote = ch
            i += 1  # consume opening quote
            while i < length and source[i] != quote:
                i += 1
            if i >= length:
                raise MQLTokenizeError("Unterminated string literal", start)
            i += 1  # consume closing quote
            # value is content without quotes
            tokens.append(Token(TokenType.STRING, source[start + 1 : i - 1], start))
            continue

        if ch.isdigit() or (ch == "-" and i + 1 < length and source[i + 1].isdigit()):
            start = i
            if ch == "-":
                i += 1
            while i < length and source[i].isdigit():
                i += 1
            # Check for float: digits followed by '.' and more digits
            if i < length and source[i] == "." and i + 1 < length and source[i + 1].isdigit():
                i += 1  # consume '.'
                while i < length and source[i].isdigit():
                    i += 1
                tokens.append(Token(TokenType.FLOAT, source[start:i], start))
            else:
                tokens.append(Token(TokenType.NUMBER, source[start:i], start))
            continue

        if ch.isalpha() or ch == "_":
            start = i
            while i < length and (source[i].isalnum() or source[i] in "_-"):
                i += 1
            word = source[start:i]

            if word.upper() == "IN":
                tokens.append(Token(TokenType.IN, word, start))
            elif word.lower() in AGGREGATORS and _is_aggregator_position(tokens):
                tokens.append(Token(TokenType.AGGREGATOR, word.lower(), start))
            else:
                tokens.append(Token(TokenType.IDENTIFIER, word, start))
            continue

        raise MQLTokenizeError(f"Unexpected character '{ch}'", i)

    tokens.append(Token(TokenType.EOF, "", i))
    return tokens


def _is_aggregator_position(preceding: list[Token]) -> bool:
    """Aggregator only valid at the very start of the query."""
    return len(preceding) == 0
