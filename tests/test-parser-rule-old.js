/**
 * Test suite for test-parser-rule feature
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('='.repeat(60));
console.log('TEST SUITE: test-parser-rule');
console.log('='.repeat(60));
console.log();

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${error.message}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Simple parser rule with single token
test('Simple rule with single token', () => {
  const grammar = `
grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', 'hello');
  assert(result.success, 'Should succeed');
  assert(result.matched, 'Should match');
  assert(result.confidence === 'high', `Should have high confidence, got ${result.confidence}`);
});

// Test 2: Rule with sequence of tokens
test('Rule with sequence of tokens', () => {
  const grammar = `
grammar Test;
assignment: ID ASSIGN NUMBER SEMI;
ID: [a-z]+;
ASSIGN: '=';
NUMBER: [0-9]+;
SEMI: ';';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'assignment', 'x = 42 ;');
  assert(result.success, 'Should succeed');
  assert(result.matched, 'Should match');
  assert(result.confidence === 'high', `Should have high confidence, got ${result.confidence}`);
});

// Test 3: Rule with alternatives
test('Rule with alternatives', () => {
  const grammar = `
grammar Test;
literal: NUMBER | STRING | BOOL;
NUMBER: [0-9]+;
STRING: '"' [a-z]* '"';
BOOL: 'true' | 'false';
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'literal', '42');
  assert(result1.success && result1.matched, 'Should match NUMBER');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'literal', '"hello"');
  assert(result2.success && result2.matched, 'Should match STRING');
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'literal', 'true');
  assert(result3.success && result3.matched, 'Should match BOOL');
});

// Test 4: Rule with optional element
test('Rule with optional element', () => {
  const grammar = `
grammar Test;
declaration: TYPE ID SEMI?;
TYPE: 'int' | 'string';
ID: [a-z]+;
SEMI: ';';
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'declaration', 'int x ;');
  assert(result1.success && result1.matched, 'Should match with semicolon');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'declaration', 'int x');
  assert(result2.success && result2.matched, 'Should match without semicolon');
});

// Test 5: Rule with repetition (*)
test('Rule with repetition (*)', () => {
  const grammar = `
grammar Test;
list: ID (COMMA ID)*;
ID: [a-z]+;
COMMA: ',';
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a');
  assert(result1.success && result1.matched, 'Should match single element');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a , b , c');
  assert(result2.success && result2.matched, 'Should match multiple elements');
});

// Test 6: Rule with repetition (+)
test('Rule with repetition (+)', () => {
  const grammar = `
grammar Test;
list: ID+;
ID: [a-z]+;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a');
  assert(result1.success && result1.matched, 'Should match single element');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a b c');
  assert(result2.success && result2.matched, 'Should match multiple elements');
});

// Test 7: Nested parser rules
test('Nested parser rules', () => {
  const grammar = `
grammar Test;
expression: term;
term: NUMBER;
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'expression', '42');
  assert(result.success, 'Should succeed');
  assert(result.matched, 'Should match nested rule');
});

// Test 8: Empty input
test('Empty input', () => {
  const grammar = `
grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', '');
  assert(result.success, 'Should succeed');
  assert(!result.matched, 'Should not match empty input');
});

// Test 9: Wrong tokens
test('Wrong tokens', () => {
  const grammar = `
grammar Test;
statement: ID SEMI;
ID: [a-z]+;
SEMI: ';';
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', '123 ;');
  assert(result.success, 'Should succeed');
  assert(!result.matched, 'Should not match wrong token type');
});

// Test 10: Extra tokens
test('Extra tokens at end', () => {
  const grammar = `
grammar Test;
statement: ID SEMI;
ID: [a-z]+;
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', 'x ; extra');
  assert(result.success, 'Should succeed');
  assert(!result.matched, 'Should not match with extra tokens');
  assert(result.details?.partialMatch, 'Should detect partial match');
});

// Test 11: Missing tokens
test('Missing required tokens', () => {
  const grammar = `
grammar Test;
statement: ID SEMI;
ID: [a-z]+;
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', 'x');
  assert(result.success, 'Should succeed');
  assert(!result.matched, 'Should not match with missing tokens');
});

// Test 12: Rule not found
test('Rule not found', () => {
  const grammar = `
grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'nonexistent', 'x');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('not found'), 'Should have error message');
});

// Test 13: Lexer rule (should fail)
test('Lexer rule instead of parser rule', () => {
  const grammar = `
grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'ID', 'x');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('lexer rule'), 'Should indicate it\'s a lexer rule');
});

// Test 14: Complex expression with alternatives and optionals
test('Complex expression', () => {
  const grammar = `
grammar Test;
expression: term ((PLUS | MINUS) term)*;
term: NUMBER | ID;
NUMBER: [0-9]+;
ID: [a-z]+;
PLUS: '+';
MINUS: '-';
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'expression', '5');
  assert(result1.success && result1.matched, 'Should match single term');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'expression', 'x + y');
  assert(result2.success && result2.matched, 'Should match addition');
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'expression', '1 + 2 - 3');
  assert(result3.success && result3.matched, 'Should match complex expression');
});

// Test 15: All-optional rule matching empty input
test('All-optional rule with empty input', () => {
  const grammar = `
grammar Test;
statement: ID? SEMI?;
ID: [a-z]+;
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', '');
  assert(result.success, 'Should succeed');
  assert(result.matched, 'Should match empty input for all-optional rule');
});

// Test 16: Tokenization error
test('Tokenization error', () => {
  const grammar = `
grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.testParserRule(grammar, 'statement', '123');
  assert(result.success, 'Should succeed');
  assert(!result.matched, 'Should not match due to tokenization error');
});

// Print summary
console.log();
console.log('='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total tests: ${passedTests + failedTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log();

if (failedTests === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
