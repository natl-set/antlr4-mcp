/**
 * A more complex grammar for demonstrating ANTLR4 MCP analysis
 */
grammar ComplexGrammar;

options {
    language = 'JavaScript';
    tokenVocab = ExprLexer;
}

import CommonLexerRules;

// Parser rules
program : declaration* statement* EOF;

declaration : functionDecl | varDecl;

functionDecl : 'function' ID '(' paramList? ')' '{' statement* '}';

varDecl : 'var' ID ('=' expr)? ';';

paramList : ID (',' ID)*;

statement : exprStmt | ifStmt | whileStmt | blockStmt;

exprStmt : expr ';';

ifStmt : 'if' '(' expr ')' statement ('else' statement)?;

whileStmt : 'while' '(' expr ')' statement;

blockStmt : '{' statement* '}';

expr : assignExpr;

assignExpr : logicalOrExpr (ID '=' assignExpr)?;

logicalOrExpr : logicalAndExpr ('||' logicalAndExpr)*;

logicalAndExpr : equalityExpr ('&&' equalityExpr)*;

equalityExpr : relationalExpr (('==' | '!=') relationalExpr)*;

relationalExpr : additiveExpr (('<' | '>' | '<=' | '>=') additiveExpr)*;

additiveExpr : multiplicativeExpr (('+' | '-') multiplicativeExpr)*;

multiplicativeExpr : unaryExpr (('*' | '/' | '%') unaryExpr)*;

unaryExpr : ('!' | '-') unaryExpr | postfixExpr;

postfixExpr : primaryExpr (postfixOperator)*;

postfixOperator : '[' expr ']' | '(' argList? ')' | '.' ID;

argList : expr (',' expr)*;

primaryExpr : ID | NUMBER | STRING | 'true' | 'false' | 'null' | '(' expr ')' | arrayLiteral;

arrayLiteral : '[' exprList? ']';

exprList : expr (',' expr)*;

// Lexer rules
ID          : [a-zA-Z_][a-zA-Z0-9_]*;
NUMBER      : [0-9]+ ('.' [0-9]+)?;
STRING      : '"' (~["\r\n\\] | '\\' .)* '"';
WS          : [ \t\n\r]+ -> skip;
COMMENT     : '//' ~[\r\n]* -> skip;
BLOCK_COMMENT : '/*' .*? '*/' -> skip;
