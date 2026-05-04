/**
 * MQL (Metric Query Language) — Client-Side Parser
 *
 * Hand-written recursive descent parser that mirrors the ANTLR grammar
 * in grammar/MQL.g4. Enables instant client-side validation without
 * a server roundtrip.
 *
 * @example
 * ```ts
 * import { validate, parse } from "@/lib/mql";
 *
 * // Safe validation (never throws)
 * const result = validate("avg:cpu{host:web-1}.rate()");
 * if (result.valid) console.log(result.ast);
 *
 * // Direct parse (throws on error)
 * const ast = parse("avg:cpu.rate()");
 * ```
 */

export type {
  MQLQuery,
  TagFilter,
  FunctionCall,
  RollupSpec,
} from "./ast";

export { tokenize, TokenType, MQLTokenizeError } from "./tokenizer";
export type { Token } from "./tokenizer";

export { parse, MQLParseError } from "./parser";

export { validate } from "./validator";
export type { MQLValidationResult } from "./validator";
