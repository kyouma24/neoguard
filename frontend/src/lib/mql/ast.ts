/**
 * MQL AST types — mirrors the ANTLR grammar productions in grammar/MQL.g4
 * and the Python ast_nodes.py dataclasses.
 */

/** Top-level query node. */
export interface MQLQuery {
  aggregator: string;
  metric: string;
  filters: TagFilter[];
  functions: FunctionCall[];
  rollup?: RollupSpec;
}

/** A tag filter expression inside { }. */
export interface TagFilter {
  /** Whether this filter is negated with ! */
  negated: boolean;
  /** The tag key (e.g. "env", "host") */
  key: string;
  /** The tag value — a single string for equals, an array for IN */
  value: string | string[];
  /** Discriminator: "equals" for key:value, "in" for key IN (v1, v2) */
  type: "equals" | "in";
}

/** A post-aggregation function call (e.g. .rate(), .moving_average(5)) */
export interface FunctionCall {
  name: string;
  args: (string | number)[];
}

/** A rollup specification (e.g. .rollup(avg, 300)) */
export interface RollupSpec {
  method: string;
  interval: number;
}
