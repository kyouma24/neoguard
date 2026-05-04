/**
 * MQL (Metric Query Language) Grammar
 *
 * Source of truth for the MQL grammar. Generates Python + TypeScript parsers.
 * Until ANTLR codegen is available (requires Java), hand-written parsers
 * mirror this grammar exactly:
 *   - Python:     src/neoguard/services/mql/parser.py     (150+ tests)
 *   - TypeScript: frontend/src/lib/mql/parser.ts           (hand-written RD)
 *
 * Grammar synopsis:
 *   avg:aws.ec2.cpu{env:$env,!host:test-*}.rate().rollup(avg,300)
 *   ^   ^            ^                      ^      ^
 *   agg metric       tag filters            funcs  rollup
 *
 * Generate (when Java is available):
 *   antlr4 -Dlanguage=Python3 MQL.g4 -o ../generated/python
 *   antlr4 -Dlanguage=TypeScript MQL.g4 -o ../../../../frontend/src/lib/mql/generated
 */
grammar MQL;

// ─── Parser rules ──────────────────────────────────────────────────────────

query
    : aggregator COLON metricName tagFilter? functionCall* rollup? EOF
    ;

aggregator
    : AGG_AVG
    | AGG_SUM
    | AGG_MIN
    | AGG_MAX
    | AGG_COUNT
    | AGG_P50
    | AGG_P95
    | AGG_P99
    ;

metricName
    : IDENT ( DOT IDENT )*
    ;

tagFilter
    : LBRACE tagExpr ( COMMA tagExpr )* RBRACE
    ;

tagExpr
    : BANG? IDENT COLON tagValue         # TagEquals
    | IDENT IN LPAREN tagValue ( COMMA tagValue )* RPAREN  # TagIn
    ;

tagValue
    : STRING_LITERAL
    | IDENT
    | WILDCARD
    | VARIABLE
    | compoundValue
    ;

// Compound values: sequences like "web-1.prod" that span multiple tokens
// in the hand-written parser (IDENT, DOT, NUMBER, STAR, COLON).
compoundValue
    : ( IDENT | INT | DOT | COLON | WILDCARD )
      ( IDENT | INT | DOT | COLON | WILDCARD )+
    ;

functionCall
    : DOT IDENT LPAREN funcArgs? RPAREN
    ;

funcArgs
    : funcArg ( COMMA funcArg )*
    ;

funcArg
    : INT
    | FLOAT
    | STRING_LITERAL
    | IDENT
    ;

rollup
    : DOT ROLLUP LPAREN rollupMethod COMMA INT RPAREN
    ;

rollupMethod
    : AGG_AVG
    | AGG_SUM
    | AGG_MIN
    | AGG_MAX
    | AGG_COUNT
    | IDENT
    ;

// ─── Lexer rules ───────────────────────────────────────────────────────────

// Keywords (must be before IDENT to take priority)
AGG_AVG   : 'avg'   ;
AGG_SUM   : 'sum'   ;
AGG_MIN   : 'min'   ;
AGG_MAX   : 'max'   ;
AGG_COUNT : 'count' ;
AGG_P50   : 'p50'   ;
AGG_P95   : 'p95'   ;
AGG_P99   : 'p99'   ;
IN        : 'IN' | 'in' ;
ROLLUP    : 'rollup' ;

// Variable reference: $env, $region, $__all
VARIABLE  : '$' [a-zA-Z_] [a-zA-Z0-9_]* ;

// Wildcard
WILDCARD  : '*' ;

// Punctuation
COLON     : ':' ;
COMMA     : ',' ;
DOT       : '.' ;
BANG      : '!' ;
LBRACE    : '{' ;
RBRACE    : '}' ;
LPAREN    : '(' ;
RPAREN    : ')' ;

// Literals
STRING_LITERAL
    : '\'' ( ~['] )* '\''
    | '"'  ( ~["] )* '"'
    ;

FLOAT     : [0-9]+ '.' [0-9]+ ;
INT       : '-'? [0-9]+ ;

// Identifiers (letters, digits, underscore, hyphen — matches Python tokenizer)
IDENT     : [a-zA-Z_] [a-zA-Z0-9_\-]* ;

// Whitespace — skip
WS        : [ \t\r\n]+ -> skip ;
