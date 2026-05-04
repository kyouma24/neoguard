/**
 * MQL Client-Side Parser Tests
 *
 * Tests the TypeScript tokenizer, parser, and validator. These mirror
 * the grammar productions in grammar/MQL.g4 and validate parity with
 * the Python parser (src/neoguard/services/mql/parser.py).
 */

import { describe, it, expect } from "vitest";
import { tokenize, TokenType } from "./tokenizer";
import { parse, MQLParseError, MQLTokenizeError } from "./parser";
import { validate } from "./validator";

// ═══════════════════════════════════════════════════════════════════════════
// Tokenizer tests
// ═══════════════════════════════════════════════════════════════════════════

describe("MQL Tokenizer", () => {
  it("tokenizes a simple query", () => {
    const tokens = tokenize("avg:cpu");
    expect(tokens).toHaveLength(4); // AGGREGATOR, COLON, IDENT, EOF
    expect(tokens[0]).toMatchObject({ type: TokenType.AGGREGATOR, value: "avg" });
    expect(tokens[1]).toMatchObject({ type: TokenType.COLON, value: ":" });
    expect(tokens[2]).toMatchObject({ type: TokenType.IDENT, value: "cpu" });
    expect(tokens[3]).toMatchObject({ type: TokenType.EOF });
  });

  it("tokenizes dotted metric name", () => {
    const tokens = tokenize("avg:aws.ec2.cpu");
    const types = tokens.map((t) => t.type);
    expect(types).toEqual([
      TokenType.AGGREGATOR, TokenType.COLON,
      TokenType.IDENT, TokenType.DOT, TokenType.IDENT, TokenType.DOT, TokenType.IDENT,
      TokenType.EOF,
    ]);
  });

  it("tokenizes all aggregator types", () => {
    for (const agg of ["avg", "sum", "min", "max", "count", "p50", "p95", "p99"]) {
      const tokens = tokenize(`${agg}:cpu`);
      expect(tokens[0]).toMatchObject({ type: TokenType.AGGREGATOR, value: agg });
    }
  });

  it("tokenizes tag filter braces", () => {
    const tokens = tokenize("avg:cpu{host:web-1}");
    const types = tokens.map((t) => t.type);
    expect(types).toContain(TokenType.LBRACE);
    expect(types).toContain(TokenType.RBRACE);
  });

  it("tokenizes variable references", () => {
    const tokens = tokenize("avg:cpu{env:$env}");
    const varToken = tokens.find((t) => t.type === TokenType.VARIABLE);
    expect(varToken).toBeDefined();
    expect(varToken!.value).toBe("$env");
  });

  it("tokenizes wildcard", () => {
    const tokens = tokenize("avg:cpu{host:*}");
    const wildcard = tokens.find((t) => t.type === TokenType.WILDCARD);
    expect(wildcard).toBeDefined();
    expect(wildcard!.value).toBe("*");
  });

  it("tokenizes IN keyword (case insensitive)", () => {
    for (const keyword of ["IN", "in"]) {
      const tokens = tokenize(`avg:cpu{env ${keyword} (prod,staging)}`);
      const inToken = tokens.find((t) => t.type === TokenType.IN);
      expect(inToken).toBeDefined();
    }
  });

  it("tokenizes negative numbers", () => {
    const tokens = tokenize("avg:cpu.rollup(avg,-5)");
    const numToken = tokens.find((t) => t.type === TokenType.INT && t.value === "-5");
    expect(numToken).toBeDefined();
  });

  it("tokenizes bang (negation)", () => {
    const tokens = tokenize("avg:cpu{!env:dev}");
    const bang = tokens.find((t) => t.type === TokenType.BANG);
    expect(bang).toBeDefined();
  });

  it("tokenizes string literals (single quotes)", () => {
    const tokens = tokenize("avg:cpu{host:'web-1'}");
    const str = tokens.find((t) => t.type === TokenType.STRING);
    expect(str).toBeDefined();
    expect(str!.value).toBe("web-1");
  });

  it("tokenizes string literals (double quotes)", () => {
    const tokens = tokenize('avg:cpu{host:"web-1"}');
    const str = tokens.find((t) => t.type === TokenType.STRING);
    expect(str).toBeDefined();
    expect(str!.value).toBe("web-1");
  });

  it("tokenizes float literals", () => {
    const tokens = tokenize("avg:cpu.moving_average(3.14)");
    // 3.14 won't actually be used by moving_average, but tokenizer should handle it
    const floatToken = tokens.find((t) => t.type === TokenType.FLOAT);
    expect(floatToken).toBeDefined();
    expect(floatToken!.value).toBe("3.14");
  });

  it("preserves token positions", () => {
    const tokens = tokenize("avg:cpu");
    expect(tokens[0].pos).toBe(0); // avg at 0
    expect(tokens[1].pos).toBe(3); // : at 3
    expect(tokens[2].pos).toBe(4); // cpu at 4
  });

  it("skips whitespace", () => {
    const tokens = tokenize("  avg : cpu  ");
    expect(tokens.filter((t) => t.type !== TokenType.EOF)).toHaveLength(3);
  });

  it("throws on unexpected character", () => {
    expect(() => tokenize("avg:cpu@")).toThrow(MQLTokenizeError);
  });

  it("throws on unterminated string", () => {
    expect(() => tokenize("avg:cpu{host:'web")).toThrow(MQLTokenizeError);
  });

  it("throws on bare $", () => {
    expect(() => tokenize("avg:cpu{env:$}")).toThrow(MQLTokenizeError);
  });

  it("treats identifier-position aggregator words as IDENT", () => {
    // "avg" after the colon is a metric name, not an aggregator
    const tokens = tokenize("avg:avg");
    expect(tokens[0].type).toBe(TokenType.AGGREGATOR);
    expect(tokens[2].type).toBe(TokenType.IDENT);
    expect(tokens[2].value).toBe("avg");
  });

  it("tokenizes identifiers with hyphens", () => {
    const tokens = tokenize("avg:aws.ec2.cpu-utilization");
    const ident = tokens.find((t) => t.value === "cpu-utilization");
    expect(ident).toBeDefined();
    expect(ident!.type).toBe(TokenType.IDENT);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Parser tests
// ═══════════════════════════════════════════════════════════════════════════

describe("MQL Parser", () => {
  // ─── Simple queries ────────────────────────────────────────────────

  it("parses simple query: avg:cpu", () => {
    const ast = parse("avg:cpu");
    expect(ast.aggregator).toBe("avg");
    expect(ast.metric).toBe("cpu");
    expect(ast.filters).toEqual([]);
    expect(ast.functions).toEqual([]);
    expect(ast.rollup).toBeUndefined();
  });

  it("parses dotted metric: avg:aws.ec2.cpu", () => {
    const ast = parse("avg:aws.ec2.cpu");
    expect(ast.metric).toBe("aws.ec2.cpu");
  });

  it("parses all aggregator types", () => {
    for (const agg of ["avg", "sum", "min", "max", "count", "p50", "p95", "p99"]) {
      const ast = parse(`${agg}:metric`);
      expect(ast.aggregator).toBe(agg);
    }
  });

  // ─── Tag filters ──────────────────────────────────────────────────

  it("parses single tag filter: avg:cpu{host:web-1}", () => {
    const ast = parse("avg:cpu{host:web-1}");
    expect(ast.filters).toHaveLength(1);
    expect(ast.filters[0]).toEqual({
      negated: false,
      key: "host",
      value: "web-1",
      type: "equals",
    });
  });

  it("parses multiple tag filters", () => {
    const ast = parse("avg:cpu{host:web-1,env:prod}");
    expect(ast.filters).toHaveLength(2);
    expect(ast.filters[0].key).toBe("host");
    expect(ast.filters[1].key).toBe("env");
  });

  it("parses negated tag filter: avg:cpu{!env:dev}", () => {
    const ast = parse("avg:cpu{!env:dev}");
    expect(ast.filters).toHaveLength(1);
    expect(ast.filters[0]).toEqual({
      negated: true,
      key: "env",
      value: "dev",
      type: "equals",
    });
  });

  it("parses IN filter: avg:cpu{env IN (prod,staging)}", () => {
    const ast = parse("avg:cpu{env IN (prod,staging)}");
    expect(ast.filters).toHaveLength(1);
    expect(ast.filters[0]).toEqual({
      negated: false,
      key: "env",
      value: ["prod", "staging"],
      type: "in",
    });
  });

  it("parses case-insensitive IN: avg:cpu{env in (prod)}", () => {
    const ast = parse("avg:cpu{env in (prod)}");
    expect(ast.filters[0].type).toBe("in");
  });

  it("parses variable in tag value: avg:cpu{env:$env}", () => {
    const ast = parse("avg:cpu{env:$env}");
    expect(ast.filters[0]).toEqual({
      negated: false,
      key: "env",
      value: "$env",
      type: "equals",
    });
  });

  it("parses wildcard tag value: avg:cpu{host:*}", () => {
    const ast = parse("avg:cpu{host:*}");
    expect(ast.filters[0]).toEqual({
      negated: false,
      key: "host",
      value: "*",
      type: "equals",
    });
  });

  it("parses wildcard pattern: avg:cpu{host:web-*}", () => {
    const ast = parse("avg:cpu{host:web-*}");
    expect(ast.filters[0].value).toBe("web-*");
  });

  it("parses empty tag filter: avg:cpu{}", () => {
    const ast = parse("avg:cpu{}");
    expect(ast.filters).toEqual([]);
  });

  // ─── Functions ────────────────────────────────────────────────────

  it("parses rate function: avg:cpu.rate()", () => {
    const ast = parse("avg:cpu.rate()");
    expect(ast.functions).toHaveLength(1);
    expect(ast.functions[0]).toEqual({ name: "rate", args: [] });
  });

  it("parses derivative function", () => {
    const ast = parse("avg:cpu.derivative()");
    expect(ast.functions[0].name).toBe("derivative");
  });

  it("parses moving_average with arg", () => {
    const ast = parse("avg:cpu.moving_average(5)");
    expect(ast.functions[0]).toEqual({ name: "moving_average", args: [5] });
  });

  it("parses chained functions", () => {
    const ast = parse("avg:cpu.rate().abs()");
    expect(ast.functions).toHaveLength(2);
    expect(ast.functions[0].name).toBe("rate");
    expect(ast.functions[1].name).toBe("abs");
  });

  it("parses all known functions", () => {
    for (const fn of ["rate", "derivative", "as_rate", "as_count", "abs", "log"]) {
      const ast = parse(`avg:cpu.${fn}()`);
      expect(ast.functions[0].name).toBe(fn);
    }
  });

  // ─── Rollup ───────────────────────────────────────────────────────

  it("parses rollup: avg:cpu.rollup(avg,60)", () => {
    const ast = parse("avg:cpu.rollup(avg,60)");
    expect(ast.rollup).toEqual({ method: "avg", interval: 60 });
  });

  it("parses rollup with all methods", () => {
    for (const method of ["avg", "sum", "min", "max", "count"]) {
      const ast = parse(`avg:cpu.rollup(${method},300)`);
      expect(ast.rollup!.method).toBe(method);
    }
  });

  // ─── Complex queries ──────────────────────────────────────────────

  it("parses complex query with all features", () => {
    const ast = parse("avg:aws.ec2.cpu{env:$env,!host:test-box}.rate().rollup(avg,300)");
    expect(ast.aggregator).toBe("avg");
    expect(ast.metric).toBe("aws.ec2.cpu");
    expect(ast.filters).toHaveLength(2);
    expect(ast.filters[0]).toEqual({ negated: false, key: "env", value: "$env", type: "equals" });
    expect(ast.filters[1]).toEqual({ negated: true, key: "host", value: "test-box", type: "equals" });
    expect(ast.functions).toHaveLength(1);
    expect(ast.functions[0].name).toBe("rate");
    expect(ast.rollup).toEqual({ method: "avg", interval: 300 });
  });

  it("parses query with filters + functions + rollup", () => {
    const ast = parse("sum:network.bytes{region:us-east-1}.rate().moving_average(3).rollup(sum,60)");
    expect(ast.aggregator).toBe("sum");
    expect(ast.metric).toBe("network.bytes");
    expect(ast.filters).toHaveLength(1);
    expect(ast.functions).toHaveLength(2);
    expect(ast.rollup).toEqual({ method: "sum", interval: 60 });
  });

  it("parses query with IN and function", () => {
    const ast = parse("max:cpu{env IN (prod,staging,dev)}.abs()");
    expect(ast.filters[0].type).toBe("in");
    expect(ast.filters[0].value).toEqual(["prod", "staging", "dev"]);
    expect(ast.functions[0].name).toBe("abs");
  });

  // ─── Whitespace tolerance ─────────────────────────────────────────

  it("handles whitespace in query", () => {
    const ast = parse("  avg : cpu  ");
    expect(ast.aggregator).toBe("avg");
    expect(ast.metric).toBe("cpu");
  });

  // ─── Error cases ──────────────────────────────────────────────────

  it("errors on missing colon", () => {
    expect(() => parse("avg cpu")).toThrow(MQLParseError);
    try {
      parse("avg cpu");
    } catch (e) {
      expect((e as MQLParseError).pos).toBe(4);
    }
  });

  it("errors on missing aggregator", () => {
    expect(() => parse(":cpu")).toThrow(MQLParseError);
  });

  it("errors on empty string", () => {
    expect(() => parse("")).toThrow(MQLParseError);
  });

  it("errors on unclosed brace", () => {
    expect(() => parse("avg:cpu{host:web-1")).toThrow(MQLParseError);
  });

  it("errors on unclosed parenthesis", () => {
    expect(() => parse("avg:cpu.rate(")).toThrow(MQLParseError);
  });

  it("errors on unknown function", () => {
    expect(() => parse("avg:cpu.foobar()")).toThrow(MQLParseError);
    try {
      parse("avg:cpu.foobar()");
    } catch (e) {
      expect((e as MQLParseError).message).toContain("Unknown function");
    }
  });

  it("errors on invalid rollup method", () => {
    expect(() => parse("avg:cpu.rollup(foobar,60)")).toThrow(MQLParseError);
  });

  it("errors on rollup seconds < 1", () => {
    expect(() => parse("avg:cpu.rollup(avg,0)")).toThrow(MQLParseError);
  });

  it("errors on moving_average window < 1", () => {
    expect(() => parse("avg:cpu.moving_average(0)")).toThrow(MQLParseError);
  });

  it("errors on negation with IN", () => {
    expect(() => parse("avg:cpu{!env IN (prod)}")).toThrow(MQLParseError);
    try {
      parse("avg:cpu{!env IN (prod)}");
    } catch (e) {
      expect((e as MQLParseError).message).toContain("Negation with IN");
    }
  });

  it("errors on negation with wildcard", () => {
    expect(() => parse("avg:cpu{!host:*}")).toThrow(MQLParseError);
  });

  it("errors on trailing garbage", () => {
    expect(() => parse("avg:cpu garbage")).toThrow(MQLParseError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validator tests
// ═══════════════════════════════════════════════════════════════════════════

describe("MQL Validator", () => {
  it("returns valid=true for correct query", () => {
    const result = validate("avg:cpu");
    expect(result.valid).toBe(true);
    expect(result.ast).toBeDefined();
    expect(result.ast!.aggregator).toBe("avg");
    expect(result.ast!.metric).toBe("cpu");
    expect(result.error).toBeUndefined();
  });

  it("returns valid=true for complex query", () => {
    const result = validate("avg:aws.ec2.cpu{env:prod,!host:test-box}.rate().rollup(avg,300)");
    expect(result.valid).toBe(true);
    expect(result.ast!.filters).toHaveLength(2);
    expect(result.ast!.functions).toHaveLength(1);
    expect(result.ast!.rollup).toBeDefined();
  });

  it("returns valid=false for empty query", () => {
    const result = validate("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Query cannot be empty");
    expect(result.errorPosition).toBe(0);
    expect(result.ast).toBeUndefined();
  });

  it("returns valid=false for whitespace-only query", () => {
    const result = validate("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Query cannot be empty");
  });

  it("returns valid=false with parse error details", () => {
    const result = validate("avg cpu");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Expected COLON");
    expect(result.errorPosition).toBe(4);
  });

  it("returns valid=false for tokenize errors", () => {
    const result = validate("avg:cpu@host");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unexpected character");
    expect(result.errorPosition).toBe(7);
  });

  it("returns valid=false for unclosed brace", () => {
    const result = validate("avg:cpu{host:web-1");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Expected RBRACE");
  });

  it("never throws", () => {
    // Even with pathological input, validate() should not throw
    const inputs = ["", " ", "!!!", "avg:", ":cpu", "avg:cpu{{{", "avg:cpu.rollup(,)", "$$$"];
    for (const input of inputs) {
      expect(() => validate(input)).not.toThrow();
      const result = validate(input);
      expect(typeof result.valid).toBe("boolean");
    }
  });
});
