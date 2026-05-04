/**
 * MQL Tokenizer — TypeScript port of src/neoguard/services/mql/tokenizer.py
 *
 * Mirrors the ANTLR lexer rules in grammar/MQL.g4. Token types match
 * the grammar terminals exactly. The tokenizer is hand-written to avoid
 * the ANTLR Java codegen dependency.
 */

// ─── Token types ─────────────────────────────────────────────────────────

export enum TokenType {
  /** Aggregator keyword: avg, sum, min, max, count, p50, p95, p99 */
  AGGREGATOR = "AGGREGATOR",
  /** Identifier: metric segments, tag keys, function names */
  IDENT = "IDENT",
  /** Colon separator */
  COLON = "COLON",
  /** Dot separator */
  DOT = "DOT",
  /** Comma separator */
  COMMA = "COMMA",
  /** Left brace { */
  LBRACE = "LBRACE",
  /** Right brace } */
  RBRACE = "RBRACE",
  /** Left parenthesis ( */
  LPAREN = "LPAREN",
  /** Right parenthesis ) */
  RPAREN = "RPAREN",
  /** Bang (negation) ! */
  BANG = "BANG",
  /** Integer literal (may be negative) */
  INT = "INT",
  /** Float literal */
  FLOAT = "FLOAT",
  /** String literal (single or double quoted) */
  STRING = "STRING",
  /** Variable reference $name */
  VARIABLE = "VARIABLE",
  /** Wildcard * */
  WILDCARD = "WILDCARD",
  /** IN keyword */
  IN = "IN",
  /** End of input */
  EOF = "EOF",
}

// ─── Token structure ─────────────────────────────────────────────────────

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const AGGREGATORS = new Set([
  "avg", "sum", "min", "max", "count",
  "p50", "p95", "p99",
]);

const SINGLE_CHARS: Record<string, TokenType> = {
  ":": TokenType.COLON,
  "{": TokenType.LBRACE,
  "}": TokenType.RBRACE,
  "(": TokenType.LPAREN,
  ")": TokenType.RPAREN,
  ",": TokenType.COMMA,
  ".": TokenType.DOT,
  "!": TokenType.BANG,
  "*": TokenType.WILDCARD,
};

// ─── Error class ─────────────────────────────────────────────────────────

export class MQLTokenizeError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.name = "MQLTokenizeError";
    this.pos = pos;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function isAlpha(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch);
}

function isDigit(ch: string): boolean {
  return /^[0-9]$/.test(ch);
}

function isAlphaNum(ch: string): boolean {
  return /^[a-zA-Z0-9]$/.test(ch);
}

function isIdentChar(ch: string): boolean {
  return isAlphaNum(ch) || ch === "_" || ch === "-";
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Aggregator is only valid at the very start of the query.
 * Matches Python tokenizer._is_aggregator_position().
 */
function isAggregatorPosition(preceding: Token[]): boolean {
  return preceding.length === 0;
}

// ─── Tokenizer ───────────────────────────────────────────────────────────

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const length = source.length;

  while (i < length) {
    const ch = source[i];

    // Skip whitespace
    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Variable: $ident
    if (ch === "$") {
      const start = i;
      i++; // consume $
      if (i < length && (isAlpha(source[i]) || source[i] === "_")) {
        i++;
        while (i < length && (isAlphaNum(source[i]) || source[i] === "_")) {
          i++;
        }
        tokens.push({ type: TokenType.VARIABLE, value: source.slice(start, i), pos: start });
        continue;
      }
      throw new MQLTokenizeError(`Unexpected character '$'`, start);
    }

    // Single-character tokens
    if (ch in SINGLE_CHARS) {
      tokens.push({ type: SINGLE_CHARS[ch], value: ch, pos: i });
      i++;
      continue;
    }

    // String literals: 'abc' or "abc"
    if (ch === "'" || ch === '"') {
      const start = i;
      const quote = ch;
      i++; // consume opening quote
      while (i < length && source[i] !== quote) {
        i++;
      }
      if (i >= length) {
        throw new MQLTokenizeError(`Unterminated string literal`, start);
      }
      i++; // consume closing quote
      // value is the content without quotes
      tokens.push({ type: TokenType.STRING, value: source.slice(start + 1, i - 1), pos: start });
      continue;
    }

    // Numbers (integer or float, may be negative)
    if (isDigit(ch) || (ch === "-" && i + 1 < length && isDigit(source[i + 1]))) {
      const start = i;
      if (ch === "-") {
        i++;
      }
      while (i < length && isDigit(source[i])) {
        i++;
      }
      // Check for float
      if (i < length && source[i] === "." && i + 1 < length && isDigit(source[i + 1])) {
        i++; // consume .
        while (i < length && isDigit(source[i])) {
          i++;
        }
        tokens.push({ type: TokenType.FLOAT, value: source.slice(start, i), pos: start });
      } else {
        tokens.push({ type: TokenType.INT, value: source.slice(start, i), pos: start });
      }
      continue;
    }

    // Identifiers and keywords
    if (isAlpha(ch) || ch === "_") {
      const start = i;
      while (i < length && isIdentChar(source[i])) {
        i++;
      }
      const word = source.slice(start, i);

      // IN keyword (case-insensitive)
      if (word.toUpperCase() === "IN") {
        tokens.push({ type: TokenType.IN, value: word, pos: start });
        continue;
      }

      // Aggregator — only at query start position
      if (AGGREGATORS.has(word.toLowerCase()) && isAggregatorPosition(tokens)) {
        tokens.push({ type: TokenType.AGGREGATOR, value: word.toLowerCase(), pos: start });
        continue;
      }

      // Regular identifier
      tokens.push({ type: TokenType.IDENT, value: word, pos: start });
      continue;
    }

    throw new MQLTokenizeError(`Unexpected character '${ch}'`, i);
  }

  tokens.push({ type: TokenType.EOF, value: "", pos: i });
  return tokens;
}
