#!/usr/bin/env node

/**
 * Test Phase 1 Analysis Tools: grammar-metrics, detect-redos, check-style
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    if (details) console.log(`   ${details}`);
    failCount++;
  }
}

function runTests() {
  console.log('Starting Phase 1 analysis tool tests...\n');

  // Test grammar with various features
  const testGrammar = `grammar TestGrammar;

program: statement* EOF;

statement: expression ';' | assignment ';' | ifStatement;

assignment: ID '=' expression;

ifStatement: 'if' '(' expression ')' statement;

expression
  : expression ('*' | '/') expression
  | expression ('+' | '-') expression
  | '(' expression ')'
  | ID
  | NUMBER
  | functionCall
  ;

functionCall: ID '(' argumentList? ')';

argumentList: expression (',' expression)*;

WS: [ \\t\\r\\n]+ -> skip;
ID: [a-zA-Z_] [a-zA-Z0-9_]*;
NUMBER: [0-9]+ ('.' [0-9]+)?;
`;

  // ==========================================
  // grammar-metrics tests
  // ==========================================
  console.log('=== grammar-metrics Tests ===\n');

  // Test 1: Size metrics
  console.log('Test 1: Size metrics');
  const metrics = AntlrAnalyzer.calculateGrammarMetrics(testGrammar);
  assert(
    metrics.size.totalRules >= 10,
    'Should count at least 10 total rules',
    `Got: ${metrics.size.totalRules}`
  );
  assert(
    metrics.size.parserRules >= 6,
    'Should count at least 6 parser rules',
    `Got: ${metrics.size.parserRules}`
  );
  assert(
    metrics.size.lexerRules >= 3,
    'Should count at least 3 lexer rules',
    `Got: ${metrics.size.lexerRules}`
  );

  // Test 2: Branching metrics
  console.log('\nTest 2: Branching metrics');
  assert(
    metrics.branching.maxAlternatives >= 4,
    'Should detect at least 4 alternatives in expression rule',
    `Got: ${metrics.branching.maxAlternatives}`
  );
  assert(
    metrics.branching.rulesWithMostBranching.length > 0,
    'Should identify rules with most branching'
  );
  assert(
    metrics.branching.rulesWithMostBranching[0].name === 'expression',
    'expression should have most alternatives',
    `Got: ${metrics.branching.rulesWithMostBranching[0]?.name}`
  );

  // Test 3: Complexity metrics
  console.log('\nTest 3: Complexity metrics');
  assert(
    metrics.complexity.recursiveRules.includes('expression'),
    'Should detect expression as recursive',
    `Got: ${metrics.complexity.recursiveRules.join(', ')}`
  );
  assert(
    !metrics.complexity.recursiveRules.includes('ID'),
    'Should NOT detect ID (lexer rule) as recursive',
    `Got: ${metrics.complexity.recursiveRules.join(', ')}`
  );
  assert(
    ['low', 'medium', 'high', 'very-high'].includes(metrics.complexity.estimatedParseComplexity),
    'Should estimate parse complexity'
  );

  // Test 4: Dependency metrics
  console.log('\nTest 4: Dependency metrics');
  assert(
    metrics.dependencies.mostReferenced.length > 0,
    'Should identify most referenced rules'
  );
  assert(
    metrics.dependencies.mostReferenced[0].name === 'expression' ||
    metrics.dependencies.mostReferenced[0].count > 0,
    'Most referenced should have valid data'
  );

  // ==========================================
  // detect-redos tests
  // ==========================================
  console.log('\n=== detect-redos Tests ===\n');

  // Test 5: No vulnerabilities
  console.log('Test 5: No vulnerabilities in safe patterns');
  const safeResult = AntlrAnalyzer.detectReDoS(testGrammar);
  // Should have low or medium issues (unbounded repetition), but no high severity
  assert(
    safeResult.summary.high === 0,
    'Should have no high severity issues',
    `Got: ${safeResult.summary.high}`
  );

  // Test 6: Vulnerable patterns
  console.log('\nTest 6: Detect vulnerable patterns');
  const vulnerableGrammar = `lexer grammar Vulnerable;
// Nested quantifiers - HIGH severity
BAD_NESTED: ( [a-z]+ )+;

// Overlapping alternatives - HIGH severity
BAD_OVERLAP: ( 'a' | 'a' )+;

// Common prefix - MEDIUM severity
BAD_PREFIX: ( 'abc' | 'abd' );
`;
  const vulnResult = AntlrAnalyzer.detectReDoS(vulnerableGrammar);
  assert(
    vulnResult.summary.high >= 1,
    'Should detect high severity nested quantifiers',
    `Got: ${vulnResult.summary.high}`
  );
  assert(
    vulnResult.vulnerabilities.some(v => v.issue.includes('Nested quantifiers')),
    'Should identify nested quantifiers issue'
  );

  // ==========================================
  // check-style tests
  // ==========================================
  console.log('\n=== check-style Tests ===\n');

  // Test 7: Good style
  console.log('Test 7: Good style grammar');
  const goodStyleResult = AntlrAnalyzer.checkStyle(testGrammar);
  assert(
    goodStyleResult.score >= 90,
    'Should have high score for well-named grammar',
    `Got: ${goodStyleResult.score}`
  );
  assert(
    goodStyleResult.summary.errors === 0,
    'Should have no errors',
    `Got: ${goodStyleResult.summary.errors}`
  );

  // Test 8: Naming conventions are enforced by ANTLR itself
  // (UPPERCASE = lexer, lowercase = parser), so our check validates style within those bounds
  console.log('\nTest 8: Naming conventions');
  const namingGrammar = `grammar NamingTest;

// Parser rules - should be lowerCamelCase
myParserRule: ID;
anotherRule: NUMBER;

// Lexer rules - should be UPPER_CASE
MY_LEXER: [a-z]+;
ANOTHER_LEXER: [0-9]+;

ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const namingResult = AntlrAnalyzer.checkStyle(namingGrammar);
  assert(
    namingResult.summary.errors === 0,
    'Well-named grammar should have no errors',
    `Got: ${namingResult.summary.errors}`
  );

  // Test 9: Missing grammar declaration
  console.log('\nTest 9: Missing grammar declaration');
  const noDeclGrammar = `ID: [a-z]+;`;
  const noDeclResult = AntlrAnalyzer.checkStyle(noDeclGrammar);
  assert(
    noDeclResult.summary.errors >= 1,
    'Should error on missing grammar declaration',
    `Got: ${noDeclResult.summary.errors}`
  );

  // Test 10: Score calculation
  console.log('\nTest 10: Score calculation');
  const perfectGrammar = `lexer grammar Perfect;
ID: [a-zA-Z]+;
NUMBER: [0-9]+;
`;
  const perfectResult = AntlrAnalyzer.checkStyle(perfectGrammar);
  assert(
    perfectResult.score === 100,
    'Perfect grammar should score 100',
    `Got: ${perfectResult.score}`
  );

  // ==========================================
  // Integration tests
  // ==========================================
  console.log('\n=== Integration Tests ===\n');

  // Test 11: Complex real-world style grammar
  console.log('Test 11: Complex grammar analysis');
  const complexGrammar = `grammar ComplexCalc;

// Entry point
program: (statement | functionDecl)* EOF;

statement
  : varDecl
  | assignment
  | exprStmt
  | ifStmt
  | whileStmt
  | returnStmt
  | block
  ;

varDecl: 'var' ID ('=' expression)? ';';

assignment: ID '=' expression ';';

exprStmt: expression ';';

ifStmt: 'if' '(' expression ')' statement ('else' statement)?;

whileStmt: 'while' '(' expression ')' statement;

returnStmt: 'return' expression? ';';

block: '{' statement* '}';

functionDecl: 'func' ID '(' params? ')' (':' type)? block;

params: param (',' param)*;
param: ID ':' type;

type: 'int' | 'float' | 'string' | 'bool';

expression
  : literal
  | ID
  | functionCall
  | '(' expression ')'
  | expression ('*' | '/') expression
  | expression ('+' | '-') expression
  | expression ('<' | '>' | '<=' | '>=' | '==' | '!=') expression
  | expression '&&' expression
  | expression '||' expression
  | '!' expression
  | '-' expression
  ;

functionCall: ID '(' arguments? ')';

arguments: expression (',' expression)*;

literal: NUMBER | STRING | BOOL;

// Lexer
WS: [ \\t\\r\\n]+ -> skip;
LINE_COMMENT: '//' ~[\\r\\n]* -> skip;
ID: [a-zA-Z_] [a-zA-Z0-9_]*;
NUMBER: [0-9]+ ('.' [0-9]+)?;
STRING: '"' (~["\\\\] | '\\\\' .)* '"';
BOOL: 'true' | 'false';
`;

  const complexMetrics = AntlrAnalyzer.calculateGrammarMetrics(complexGrammar);
  assert(
    complexMetrics.branching.maxAlternatives >= 7,
    'expression should have many alternatives',
    `Got: ${complexMetrics.branching.maxAlternatives}`
  );
  assert(
    complexMetrics.complexity.recursiveRules.includes('expression'),
    'Should detect recursive expression rule'
  );
  assert(
    complexMetrics.dependencies.hubRules.includes('expression'),
    'expression should be a hub rule',
    `Got: ${complexMetrics.dependencies.hubRules.join(', ')}`
  );

  const complexStyle = AntlrAnalyzer.checkStyle(complexGrammar);
  assert(
    complexStyle.score >= 90,
    'Well-structured grammar should score well',
    `Got: ${complexStyle.score}`
  );

  console.log('\n========================================');
  console.log('  Phase 1 Analysis Tools Test Summary');
  console.log('========================================');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('========================================');

  if (failCount === 0) {
    console.log('\n🎉 All Phase 1 analysis tool tests passing!');
  }
}

runTests();
process.exit(failCount > 0 ? 1 : 0);
