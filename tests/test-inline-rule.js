/**
 * Test suite for inline-rule feature
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('='.repeat(60));
console.log('TEST SUITE: inline-rule');
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

// Test 1: Simple pass-through rule
test('Simple pass-through rule', () => {
  const grammar = `grammar Test;
expression: additiveExpression;
additiveExpression: term;
term: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'additiveExpression');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('expression: term;'), 'Should inline rule body');
  assert(!result.modified.includes('additiveExpression:'), 'Should remove original rule');
  assert(result.stats?.referencesReplaced === 1, 'Should replace 1 reference');
});

// Test 2: Rule with multiple references
test('Rule with multiple references', () => {
  const grammar = `grammar Test;
expr1: helper PLUS helper;
expr2: helper TIMES NUMBER;
helper: ID | NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
TIMES: '*';
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'helper');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('expr1: (ID | NUMBER) PLUS (ID | NUMBER);'), 'Should inline with parens');
  assert(result.modified.includes('expr2: (ID | NUMBER) TIMES NUMBER;'), 'Should inline with parens');
  assert(!result.modified.includes('helper:'), 'Should remove original rule');
  assert(result.stats?.referencesReplaced === 3, 'Should replace 3 references');
});

// Test 3: Rule not found
test('Rule not found', () => {
  const grammar = `grammar Test;
statement: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'nonexistent');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('not found'), 'Should have error message');
});

// Test 4: Recursive rule (should fail)
test('Recursive rule', () => {
  const grammar = `grammar Test;
expr: expr PLUS term | term;
term: NUMBER;
NUMBER: [0-9]+;
PLUS: '+';
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'expr');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('recursive'), 'Should indicate recursion');
});

// Test 5: Circular reference (should fail)
test('Circular reference', () => {
  const grammar = `grammar Test;
a: b;
b: c;
c: a;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'b');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('circular'), 'Should indicate circular reference');
});

// Test 6: Unused rule (should fail)
test('Unused rule', () => {
  const grammar = `grammar Test;
statement: ID;
unused: NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'unused');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('not used'), 'Should indicate rule not used');
});

// Test 7: Rule with alternatives needs parentheses
test('Rule with alternatives needs parentheses', () => {
  const grammar = `grammar Test;
assignment: ID ASSIGN value SEMI;
value: NUMBER | STRING | ID;
ID: [a-z]+;
NUMBER: [0-9]+;
STRING: '"' [a-z]* '"';
ASSIGN: '=';
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'value');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('assignment: ID ASSIGN (NUMBER | STRING | ID) SEMI;'), 
    'Should wrap alternatives in parentheses');
});

// Test 8: Simple single-token rule (no parentheses needed)
test('Simple single-token rule', () => {
  const grammar = `grammar Test;
statement: identifier;
identifier: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'identifier');
  assert(result.success, 'Should succeed');
  // Should inline without extra parentheses for single token
  assert(result.modified.includes('statement: ID;') || result.modified.includes('statement: (ID);'),
    'Should inline token (with or without parens)');
});

// Test 9: Dry run mode
test('Dry run mode', () => {
  const grammar = `grammar Test;
expression: helper;
helper: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'helper', { dryRun: true });
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('helper:'), 'Should NOT remove rule in dry run');
  assert(result.message.includes('Would inline'), 'Should indicate dry run');
  assert(result.stats?.referencesReplaced === 1, 'Should report would replace 1 reference');
});

// Test 10: Preserve parentheses option
test('Preserve parentheses option', () => {
  const grammar = `grammar Test;
statement: helper;
helper: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'helper', { preserveParentheses: true });
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('statement: (ID);'), 'Should always add parentheses');
});

// Test 11: Rule with labels (should strip labels)
test('Rule with labels', () => {
  const grammar = `grammar Test;
expression: helper;
helper: name=ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'helper');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('expression: ID;') || result.modified.includes('expression: (ID);'),
    'Should strip labels from inlined body');
});

// Test 12: Multiple alternatives at top level
test('Multiple alternatives', () => {
  const grammar = `grammar Test;
statement: decl | assignment;
decl: TYPE ID SEMI;
assignment: ID ASSIGN expr SEMI;
expr: literal;
literal: NUMBER | STRING;
TYPE: 'int' | 'string';
ID: [a-z]+;
NUMBER: [0-9]+;
STRING: '"' [a-z]* '"';
ASSIGN: '=';
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.inlineRule(grammar, 'literal');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('expr: (NUMBER | STRING);'), 
    'Should inline with parentheses');
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
