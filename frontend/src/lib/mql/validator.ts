/**
 * MQL Client-Side Validator
 *
 * Wraps the parser to provide a safe validation API that never throws.
 * Returns structured results suitable for inline editor feedback.
 * This enables instant client-side validation before the server roundtrip.
 */

import type { MQLQuery } from "./ast";
import { parse, MQLParseError, MQLTokenizeError } from "./parser";

// ─── Result type ─────────────────────────────────────────────────────────

export interface MQLValidationResult {
  /** Whether the query parsed successfully */
  valid: boolean;
  /** Human-readable error message (only when valid=false) */
  error?: string;
  /** Character position of the error in the input (only when valid=false) */
  errorPosition?: number;
  /** The parsed AST (only when valid=true) */
  ast?: MQLQuery;
}

// ─── Validator ───────────────────────────────────────────────────────────

/**
 * Validate an MQL query string.
 *
 * Never throws — all errors are captured in the result object.
 * Use this in the panel editor for instant feedback.
 *
 * @example
 * ```ts
 * const result = validate("avg:cpu{host:web-1}.rate()");
 * if (result.valid) {
 *   console.log(result.ast); // MQLQuery
 * } else {
 *   console.log(result.error, result.errorPosition);
 * }
 * ```
 */
export function validate(query: string): MQLValidationResult {
  // Empty/whitespace-only query
  if (!query || !query.trim()) {
    return {
      valid: false,
      error: "Query cannot be empty",
      errorPosition: 0,
    };
  }

  try {
    const ast = parse(query);
    return { valid: true, ast };
  } catch (err: unknown) {
    if (err instanceof MQLParseError) {
      return {
        valid: false,
        error: err.message,
        errorPosition: err.pos,
      };
    }
    if (err instanceof MQLTokenizeError) {
      return {
        valid: false,
        error: err.message,
        errorPosition: err.pos,
      };
    }
    // Unexpected error — should not happen, but be defensive
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown parse error",
      errorPosition: 0,
    };
  }
}
