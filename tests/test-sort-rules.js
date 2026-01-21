/**
 * Test suite for sort-rules feature
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('='.repeat(60));
console.log('TEST SUITE: sort-rules');
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

// Test 1: Alphabetical sort
test('Alphabetical sort', () => {
  const grammar = `grammar Test;
zebra: ID;
apple: NUMBER;
ZEBRA: 'z';
APPLE: 'a';
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'alphabetical');
  assert(result.success, 'Should succeed');
  
  // Check order: parser rules (apple, zebra), then lexer rules (APPLE, ID, NUMBER, ZEBRA)
  const rules = result.modified.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/gm);
  assert(rules, 'Should have rules');
  
  const ruleNames = rules.map(r => r.replace(/\s*:/, ''));
  assert(ruleNames[0] === 'apple', 'First parser rule should be apple');
  assert(ruleNames[1] === 'zebra', 'Second parser rule should be zebra');
  assert(ruleNames[2] === 'APPLE', 'First lexer rule should be APPLE');
});

// Test 2: Type sort (parser first)
test('Type sort - parser first', () => {
  const grammar = `grammar Test;
PLUS: '+';
expr: term;
NUMBER: [0-9]+;
term: NUMBER;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'type', { parserFirst: true });
  assert(result.success, 'Should succeed');
  
  const rules = result.modified.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/gm);
  const ruleNames = rules.map(r => r.replace(/\s*:/, ''));
  
  // All parser rules should come before lexer rules
  let foundLexer = false;
  for (const name of ruleNames) {
    const isLexer = name[0] === name[0].toUpperCase();
    if (isLexer) {
      foundLexer = true;
    } else if (foundLexer) {
      throw new Error('Found parser rule after lexer rule');
    }
  }
});

// Test 3: Type sort (lexer first)
test('Type sort - lexer first', () => {
  const grammar = `grammar Test;
expr: term;
NUMBER: [0-9]+;
term: NUMBER;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'type', { parserFirst: false });
  assert(result.success, 'Should succeed');
  
  const rules = result.modified.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/gm);
  const ruleNames = rules.map(r => r.replace(/\s*:/, ''));
  
  // All lexer rules should come before parser rules
  let foundParser = false;
  for (const name of ruleNames) {
    const isParser = name[0] === name[0].toLowerCase();
    if (isParser) {
      foundParser = true;
    } else if (foundParser) {
      throw new Error('Found lexer rule after parser rule');
    }
  }
});

// Test 4: Dependency sort
test('Dependency sort', () => {
  const grammar = `grammar Test;
zebra: ID;
term: NUMBER;
expr: term PLUS term;
statement: expr SEMI;
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'dependency', { anchorRule: 'expr' });
  assert(result.success, 'Should succeed');
  
  const rules = result.modified.match(/^[a-z][a-zA-Z0-9_]*\s*:/gm);
  const ruleNames = rules.map(r => r.replace(/\s*:/, ''));
  
  // term should come before expr (expr depends on term)
  const termIdx = ruleNames.indexOf('term');
  const exprIdx = ruleNames.indexOf('expr');
  assert(termIdx < exprIdx, 'term should come before expr');
  
  // statement should come after expr (statement depends on expr)
  const stmtIdx = ruleNames.indexOf('statement');
  assert(exprIdx < stmtIdx, 'expr should come before statement');
});

// Test 5: Dependency sort with missing anchor
test('Dependency sort - missing anchor', () => {
  const grammar = `grammar Test;
expr: term;
term: NUMBER;
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'dependency', { anchorRule: 'nonexistent' });
  assert(!result.success, 'Should fail');
  assert(result.message.includes('not found'), 'Should have error about anchor not found');
});

// Test 6: Dependency sort without anchor option
test('Dependency sort - no anchor provided', () => {
  const grammar = `grammar Test;
expr: term;
term: NUMBER;
NUMBER: [0-9]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'dependency');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('anchorRule'), 'Should indicate anchorRule required');
});

// Test 7: Usage sort
test('Usage sort', () => {
  const grammar = `grammar Test;
helper: ID;
expr: helper PLUS helper;
statement: helper SEMI;
unused: NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
SEMI: ';';
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'usage');
  assert(result.success, 'Should succeed');
  
  const rules = result.modified.match(/^[a-z][a-zA-Z0-9_]*\s*:/gm);
  const ruleNames = rules.map(r => r.replace(/\s*:/, ''));
  
  // helper is used 3 times, should be first
  assert(ruleNames[0] === 'helper', 'helper (most used) should be first');
  
  // unused is used 0 times, should be last
  assert(ruleNames[ruleNames.length - 1] === 'unused', 'unused should be last');
});

// Test 8: Preserve grammar header
test('Preserve grammar header', () => {
  const grammar = `grammar Test;

options {
  language = Java;
}

import CommonLexer;

expr: term;
term: ID;
ID: [a-z]+;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'alphabetical');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('options {'), 'Should preserve options');
  assert(result.modified.includes('import CommonLexer;'), 'Should preserve imports');
});

// Test 9: Multi-line rules
test('Multi-line rules', () => {
  const grammar = `grammar Test;
expression
  : term PLUS term
  | term MINUS term
  | NUMBER
  ;
term: NUMBER;
NUMBER: [0-9]+;
PLUS: '+';
MINUS: '-';
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'alphabetical');
  assert(result.success, 'Should succeed');
  assert(result.modified.includes('term PLUS term'), 'Should preserve multi-line format');
});

// Test 10: Empty grammar
test('Empty grammar', () => {
  const grammar = `grammar Test;
`;
  
  const result = AntlrAnalyzer.sortRules(grammar, 'alphabetical');
  assert(!result.success, 'Should fail');
  assert(result.message.includes('No rules'), 'Should indicate no rules found');
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
