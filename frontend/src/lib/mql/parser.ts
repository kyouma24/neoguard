/**
 * MQL Recursive Descent Parser — TypeScript port of src/neoguard/services/mql/parser.py
 *
 * Hand-written parser that mirrors the ANTLR grammar in grammar/MQL.g4 exactly.
 * Produces an AST matching the grammar productions. The Python parser is the
 * reference implementation (150+ tests); this TypeScript parser enables
 * instant client-side validation without a server roundtrip.
 *
 * Grammar (from MQL.g4):
 *   query       : aggregator COLON metricName tagFilter? functionCall* rollup? EOF ;
 *   aggregator  : AGG_AVG | AGG_SUM | AGG_MIN | AGG_MAX | AGG_COUNT | AGG_P50 | AGG_P95 | AGG_P99 ;
 *   metricName  : IDENT (DOT IDENT)* ;
 *   tagFilter   : LBRACE tagExpr (COMMA tagExpr)* RBRACE ;
 *   tagExpr     : BANG? IDENT COLON tagValue | IDENT IN LPAREN tagValue (COMMA tagValue)* RPAREN ;
 *   tagValue    : STRING | IDENT | WILDCARD | VARIABLE | compoundValue ;
 *   functionCall: DOT IDENT LPAREN funcArgs? RPAREN ;
 *   rollup      : DOT ROLLUP LPAREN rollupMethod COMMA INT RPAREN ;
 */

import type { FunctionCall, MQLQuery, RollupSpec, TagFilter } from "./ast";
import { Token, TokenType, tokenize, MQLTokenizeError } from "./tokenizer";

// ─── Known functions and rollup methods ──────────────────────────────────

const FUNCTION_NAMES = new Set([
  "rate", "derivative", "moving_average",
  "as_rate", "as_count", "abs", "log",
]);

const ROLLUP_METHODS = new Set([
  "avg", "sum", "min", "max", "count",
]);

// ─── Error class ─────────────────────────────────────────────────────────

export class MQLParseError extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(`${message} at position ${pos}`);
    this.name = "MQLParseError";
    this.pos = pos;
  }
}

// ─── Parser ──────────────────────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private expect(type: TokenType, context?: string): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      const ctx = context ? ` (${context})` : "";
      throw new MQLParseError(
        `Expected ${type} but got ${tok.type} '${tok.value}'${ctx}`,
        tok.pos,
      );
    }
    return this.advance();
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  // Reserved for future use: match token type AND value
  // private atValue(type: TokenType, value: string): boolean {
  //   const tok = this.peek();
  //   return tok.type === type && tok.value === value;
  // }

  // ─── Productions ─────────────────────────────────────────────────────

  /**
   * query : aggregator COLON metricName tagFilter? functionCall* rollup? EOF
   */
  parse(): MQLQuery {
    const aggregator = this.parseAggregator();
    this.expect(TokenType.COLON, "after aggregator");
    const metric = this.parseMetricName();
    const filters = this.parseTagFilter();
    const { functions, rollup } = this.parseChain();
    this.expect(TokenType.EOF, "end of query");

    return { aggregator, metric, filters, functions, rollup };
  }

  /**
   * aggregator : AGG_AVG | AGG_SUM | ... | AGG_P99
   */
  private parseAggregator(): string {
    const tok = this.expect(TokenType.AGGREGATOR, "query must start with aggregator");
    return tok.value;
  }

  /**
   * metricName : IDENT (DOT IDENT)*
   *
   * Uses 2-token lookahead to distinguish metric segments from function calls.
   * Matches Python parser._parse_metric_name() logic exactly.
   */
  private parseMetricName(): string {
    const parts: string[] = [];
    parts.push(this.expect(TokenType.IDENT, "metric name").value);

    while (this.at(TokenType.DOT)) {
      const nextIdx = this.pos + 1;
      const nextTok = nextIdx < this.tokens.length ? this.tokens[nextIdx] : null;

      if (nextTok && nextTok.type === TokenType.IDENT) {
        // If next identifier is a known function or "rollup", stop metric parsing
        if (FUNCTION_NAMES.has(nextTok.value) || nextTok.value === "rollup") {
          break;
        }
        // If next identifier is followed by '(', it's a function call — stop
        const afterNextIdx = this.pos + 2;
        const afterNext = afterNextIdx < this.tokens.length ? this.tokens[afterNextIdx] : null;
        if (afterNext && afterNext.type === TokenType.LPAREN) {
          break;
        }
      }

      this.advance(); // consume DOT
      parts.push(this.expect(TokenType.IDENT, "metric name segment").value);
    }

    return parts.join(".");
  }

  /**
   * tagFilter : LBRACE tagExpr (COMMA tagExpr)* RBRACE
   */
  private parseTagFilter(): TagFilter[] {
    if (!this.at(TokenType.LBRACE)) {
      return [];
    }
    this.advance(); // consume {

    const filters: TagFilter[] = [];
    if (!this.at(TokenType.RBRACE)) {
      filters.push(this.parseSingleFilter());
      while (this.at(TokenType.COMMA)) {
        this.advance(); // consume ,
        filters.push(this.parseSingleFilter());
      }
    }

    this.expect(TokenType.RBRACE, "closing tag filter");
    return filters;
  }

  /**
   * tagExpr : BANG? IDENT COLON tagValue       (TagEquals)
   *         | IDENT IN LPAREN tagValue (COMMA tagValue)* RPAREN  (TagIn)
   */
  private parseSingleFilter(): TagFilter {
    let negated = false;
    if (this.at(TokenType.BANG)) {
      negated = true;
      this.advance();
    }

    const key = this.expect(TokenType.IDENT, "tag key").value;

    // IN variant
    if (this.at(TokenType.IN)) {
      if (negated) {
        throw new MQLParseError("Negation with IN is not supported", this.peek().pos);
      }
      return this.parseInSet(key);
    }

    // Equals variant
    this.expect(TokenType.COLON, "tag separator");

    // Wildcard-only value: *
    if (this.at(TokenType.WILDCARD)) {
      if (negated) {
        throw new MQLParseError("Negation with wildcard is not supported", this.peek().pos);
      }
      this.advance();
      return { negated: false, key, value: "*", type: "equals" };
    }

    const tagVal = this.parseTagValue();

    // Check if value contains wildcard characters
    if (tagVal.includes("*")) {
      if (negated) {
        throw new MQLParseError("Negation with wildcard is not supported", this.peek().pos);
      }
      return { negated: false, key, value: tagVal, type: "equals" };
    }

    return { negated, key, value: tagVal, type: "equals" };
  }

  /**
   * tagValue : STRING | IDENT | WILDCARD | VARIABLE | compoundValue
   *
   * Compound values consume sequences like "web-1.prod:8080" that span
   * multiple token types. Matches Python parser._parse_tag_value().
   */
  private parseTagValue(): string {
    // Variable
    if (this.at(TokenType.VARIABLE)) {
      return this.advance().value;
    }

    // String literal
    if (this.at(TokenType.STRING)) {
      return this.advance().value;
    }

    // Compound value: consume IDENT, INT, WILDCARD, DOT, COLON tokens
    const parts: string[] = [];
    while (true) {
      const tok = this.peek();
      if (
        tok.type === TokenType.IDENT ||
        tok.type === TokenType.INT ||
        tok.type === TokenType.WILDCARD ||
        tok.type === TokenType.DOT ||
        tok.type === TokenType.COLON
      ) {
        parts.push(this.advance().value);
      } else {
        break;
      }
    }

    if (parts.length === 0) {
      const tok = this.peek();
      throw new MQLParseError(`Expected tag value but got ${tok.type} '${tok.value}'`, tok.pos);
    }

    return parts.join("");
  }

  /**
   * IDENT IN LPAREN tagValue (COMMA tagValue)* RPAREN
   */
  private parseInSet(key: string): TagFilter {
    this.advance(); // consume IN
    this.expect(TokenType.LPAREN, "IN set");
    const values: string[] = [];
    values.push(this.parseTagValue());
    while (this.at(TokenType.COMMA)) {
      this.advance(); // consume ,
      values.push(this.parseTagValue());
    }
    this.expect(TokenType.RPAREN, "closing IN set");
    return { negated: false, key, value: values, type: "in" };
  }

  /**
   * Parse the function chain and optional rollup.
   * functionCall* rollup?
   */
  private parseChain(): { functions: FunctionCall[]; rollup?: RollupSpec } {
    const functions: FunctionCall[] = [];
    let rollup: RollupSpec | undefined;

    while (this.at(TokenType.DOT)) {
      this.advance(); // consume DOT
      const nameTok = this.expect(TokenType.IDENT, "function name");
      const name = nameTok.value;

      if (name === "rollup") {
        rollup = this.parseRollup();
        break; // rollup is always last
      }

      if (!FUNCTION_NAMES.has(name)) {
        const known = [...FUNCTION_NAMES, "rollup"].sort().join(", ");
        throw new MQLParseError(
          `Unknown function '${name}'. Must be one of: ${known}`,
          nameTok.pos,
        );
      }

      functions.push(this.parseFunction(name, nameTok.pos));
    }

    return { functions, rollup };
  }

  /**
   * functionCall : DOT IDENT LPAREN funcArgs? RPAREN
   */
  private parseFunction(name: string, _pos: number): FunctionCall {
    this.expect(TokenType.LPAREN, `opening ${name}()`);

    const args: (string | number)[] = [];

    if (name === "moving_average") {
      const windowTok = this.expect(TokenType.INT, "moving_average window size");
      const window = parseInt(windowTok.value, 10);
      if (window < 1) {
        throw new MQLParseError("moving_average window must be >= 1", windowTok.pos);
      }
      args.push(window);
      this.expect(TokenType.RPAREN, `closing ${name}()`);
      return { name, args };
    }

    this.expect(TokenType.RPAREN, `closing ${name}()`);
    return { name, args };
  }

  /**
   * rollup : DOT ROLLUP LPAREN rollupMethod COMMA INT RPAREN
   */
  private parseRollup(): RollupSpec {
    this.expect(TokenType.LPAREN, "opening rollup()");
    const methodTok = this.expect(TokenType.IDENT, "rollup method");
    if (!ROLLUP_METHODS.has(methodTok.value)) {
      const allowed = [...ROLLUP_METHODS].sort().join(", ");
      throw new MQLParseError(
        `Invalid rollup method '${methodTok.value}'. Must be one of: ${allowed}`,
        methodTok.pos,
      );
    }
    this.expect(TokenType.COMMA, "rollup separator");
    const secondsTok = this.expect(TokenType.INT, "rollup seconds");
    const seconds = parseInt(secondsTok.value, 10);
    if (seconds < 1) {
      throw new MQLParseError("Rollup seconds must be >= 1", secondsTok.pos);
    }
    this.expect(TokenType.RPAREN, "closing rollup()");
    return { method: methodTok.value, interval: seconds };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Parse an MQL query string into an AST.
 *
 * @throws MQLParseError on syntax errors
 * @throws MQLTokenizeError on lexical errors
 */
export function parse(source: string): MQLQuery {
  const tokens = tokenize(source);
  return new Parser(tokens).parse();
}

export { MQLTokenizeError };
