/**
 * TemplateLexer.g4 - A realistic example demonstrating lexer modes
 *
 * This lexer handles template strings with:
 * - String interpolation: ${expression}
 * - Comments: {{!-- comment --}}
 * - Raw text
 * - Multiple nested modes
 */
lexer grammar TemplateLexer;

// ============================================
// DEFAULT_MODE - Template directives
// ============================================

// Whitespace handling
WS: [ \t\r\n]+ -> skip;

// Comments
LINE_COMMENT: '//' ~[\r\n]* -> skip;
BLOCK_COMMENT: '/*' .*? '*/' -> skip;

// Template delimiters
OPEN_TAG: '<%' -> pushMode(TAG_MODE);
OPEN_TAG_EXPR: '<%=' -> pushMode(TAG_MODE);

// Raw text content
TEXT: ~[<]+;

// Single character fallback
CHAR: .;

// ============================================
// TAG_MODE - Inside template tags
// ============================================
mode TAG_MODE;

// Exit tag mode
TAG_WS: [ \t\r\n]+ -> skip;
CLOSE_TAG: '%>' -> popMode;

// String literals (can contain interpolation)
DOUBLE_QUOTE: '"' -> pushMode(STRING_MODE);
SINGLE_QUOTE: '\'' -> pushMode(STRING_MODE);

// Keywords
IF: 'if';
ELSE: 'else';
FOR: 'for';
IN: 'in';
END: 'end';
PRINT: 'print';

// Operators
ASSIGN: '=';
EQ: '==';
NEQ: '!=';
LT: '<';
GT: '>';
LTE: '<=';
GTE: '>=';

// Punctuation
LPAREN: '(';
RPAREN: ')';
LBRACKET: '[';
RBRACKET: ']';
COMMA: ',';
DOT: '.';

// Identifiers and literals
TAG_ID: [a-zA-Z_] [a-zA-Z0-9_]*;
TAG_NUMBER: [0-9]+ ('.' [0-9]+)?;

// ============================================
// STRING_MODE - Inside string literals
// ============================================
mode STRING_MODE;

// Exit string mode
STRING_CLOSE_DOUBLE: '"' -> popMode;
STRING_CLOSE_SINGLE: '\'' -> popMode;

// String interpolation
INTERP_START: '${' -> pushMode(TAG_MODE);

// Escape sequences
STRING_ESCAPE: '\\' .;

// String content
STRING_TEXT: ~["$\\']+;

// ============================================
// COMMENT_MODE - Example of additional mode
// ============================================
mode COMMENT_MODE;

COMMENT_TEXT: ~['-]+;
COMMENT_END: '-->' -> popMode;
DASH: '-';
