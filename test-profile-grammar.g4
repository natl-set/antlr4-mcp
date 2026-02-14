grammar Expr;
program: expr EOF;
expr: expr ('+' | '-') term | term;
term: term ('*' | '/') factor | factor;
factor: NUMBER | '(' expr ')';
NUMBER: [0-9]+;
WS: [ \t\r\n]+ -> skip;
