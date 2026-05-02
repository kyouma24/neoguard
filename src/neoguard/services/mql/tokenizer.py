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
    IN = auto()
    EOF = auto()


AGGREGATORS = frozenset({"avg", "sum", "min", "max", "count"})

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

        if ch in SINGLE_CHARS:
            tokens.append(Token(SINGLE_CHARS[ch], ch, i))
            i += 1
            continue

        if ch.isdigit() or (ch == "-" and i + 1 < length and source[i + 1].isdigit()):
            start = i
            if ch == "-":
                i += 1
            while i < length and source[i].isdigit():
                i += 1
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
