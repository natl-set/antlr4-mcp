#!/usr/bin/env node

/**
 * Test suite for analyze-ambiguities feature
 * 
 * Tests:
 * 1. Identical alternatives detection
 * 2. Overlapping prefix detection
 * 3. Ambiguous optional patterns (A? A)
 * 4. Redundant optional patterns (A? A*)
 * 5. Hidden left recursion
 * 6. Lexer conflicts
 * 7. Clean grammar (no issues)
 * 8. Multiple issues in same rule
 * 9. Selective checks (disable specific checks)
 * 10. Custom prefix length threshold
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
  console.log('Starting analyze-ambiguities tests...\n');

  // Test 1: Identical alternatives
  console.log('Test 1: Detect identical alternatives');
  const grammar1 = `grammar Test;
expr: ID | NUMBER | ID;
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const result1 = AntlrAnalyzer.analyzeAmbiguities(grammar1);
  assert(
    !result1.success && result1.summary.errors === 1,
    'Should detect identical alternatives',
    `errors: ${result1.summary.errors}, issues: ${result1.issues.length}`
  );
  assert(
    result1.issues[0].type === 'identical-alternatives' && result1.issues[0].rule === 'expr',
    'Should report correct issue type and rule'
  );

  // Test 2: Overlapping prefixes
  console.log('\nTest 2: Detect overlapping prefixes');
  const grammar2 = `grammar Test;
stmt: IF expr THEN stmt | IF expr THEN stmt ELSE stmt;
IF: 'if';
THEN: 'then';
ELSE: 'else';
expr: ID;
ID: [a-z]+;
`;
  const result2 = AntlrAnalyzer.analyzeAmbiguities(grammar2);
  assert(
    result2.summary.warnings >= 1,
    'Should detect overlapping prefix',
    `warnings: ${result2.summary.warnings}`
  );
  const prefixIssue = result2.issues.find(i => i.type === 'overlapping-prefix');
  assert(
    prefixIssue && prefixIssue.rule === 'stmt',
    'Should report overlapping prefix for stmt rule'
  );

  // Test 3: Ambiguous optional (A? A)
  console.log('\nTest 3: Detect ambiguous optional (A? A)');
  const grammar3 = `grammar Test;
expr: ID? ID NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const result3 = AntlrAnalyzer.analyzeAmbiguities(grammar3);
  assert(
    result3.summary.warnings >= 1,
    'Should detect ambiguous optional',
    `warnings: ${result3.summary.warnings}`
  );
  const optionalIssue = result3.issues.find(i => i.type === 'ambiguous-optional');
  assert(
    optionalIssue && optionalIssue.rule === 'expr',
    'Should report ambiguous optional for expr rule'
  );

  // Test 4: Redundant optional (A? A*)
  console.log('\nTest 4: Detect redundant optional (A? A*)');
  const grammar4 = `grammar Test;
expr: ID? ID* NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const result4 = AntlrAnalyzer.analyzeAmbiguities(grammar4);
  assert(
    result4.summary.warnings >= 1,
    'Should detect redundant optional',
    `warnings: ${result4.summary.warnings}`
  );
  const redundantIssue = result4.issues.find(i => i.type === 'redundant-optional');
  assert(
    redundantIssue && redundantIssue.rule === 'expr',
    'Should report redundant optional for expr rule'
  );

  // Test 5: Hidden left recursion
  console.log('\nTest 5: Detect hidden left recursion');
  const grammar5 = `grammar Test;
expr: term PLUS expr | term;
term: expr TIMES NUMBER | NUMBER;
PLUS: '+';
TIMES: '*';
NUMBER: [0-9]+;
`;
  const result5 = AntlrAnalyzer.analyzeAmbiguities(grammar5);
  assert(
    result5.summary.errors >= 1,
    'Should detect hidden left recursion',
    `errors: ${result5.summary.errors}`
  );
  const recursionIssue = result5.issues.find(i => i.type === 'hidden-left-recursion');
  assert(
    recursionIssue && recursionIssue.rule === 'expr',
    'Should report hidden left recursion for expr rule'
  );

  // Test 6: Lexer conflicts
  console.log('\nTest 6: Detect lexer conflicts');
  const grammar6 = `grammar Test;
expr: ID | KEYWORD;
ID: [a-z]+;
KEYWORD: 'if';
`;
  const result6 = AntlrAnalyzer.analyzeAmbiguities(grammar6);
  assert(
    result6.summary.warnings >= 1,
    'Should detect lexer conflict',
    `warnings: ${result6.summary.warnings}`
  );
  const lexerIssue = result6.issues.find(i => i.type === 'lexer-conflict');
  assert(
    lexerIssue && (lexerIssue.rule === 'ID' || lexerIssue.rule === 'KEYWORD'),
    'Should report lexer conflict for ID or KEYWORD'
  );

  // Test 7: Clean grammar (no issues)
  console.log('\nTest 7: Clean grammar with no ambiguities');
  const grammar7 = `grammar Test;
expr: term (PLUS term)*;
term: NUMBER;
PLUS: '+';
NUMBER: [0-9]+;
`;
  const result7 = AntlrAnalyzer.analyzeAmbiguities(grammar7);
  assert(
    result7.success && result7.issues.length === 0,
    'Should detect no issues in clean grammar',
    `success: ${result7.success}, issues: ${result7.issues.length}`
  );

  // Test 8: Multiple issues in same grammar
  console.log('\nTest 8: Multiple issues in same grammar');
  const grammar8 = `grammar Test;
expr: ID | NUMBER | ID;  // duplicate alternative
stmt: ID? ID NUMBER;      // ambiguous optional
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const result8 = AntlrAnalyzer.analyzeAmbiguities(grammar8);
  assert(
    result8.issues.length >= 2,
    'Should detect multiple issues',
    `issues: ${result8.issues.length}`
  );
  assert(
    result8.issues.some(i => i.type === 'identical-alternatives') &&
    result8.issues.some(i => i.type === 'ambiguous-optional'),
    'Should detect both identical alternatives and ambiguous optional'
  );

  // Test 9: Selective checks (disable specific checks)
  console.log('\nTest 9: Selective checks - disable identical alternatives');
  const grammar9 = `grammar Test;
expr: ID | NUMBER | ID;
ID: [a-z]+;
NUMBER: [0-9]+;
`;
  const result9 = AntlrAnalyzer.analyzeAmbiguities(grammar9, {
    checkIdenticalAlternatives: false
  });
  assert(
    result9.issues.filter(i => i.type === 'identical-alternatives').length === 0,
    'Should skip identical alternatives check when disabled'
  );

  // Test 10: Custom prefix length threshold
  console.log('\nTest 10: Custom prefix length threshold');
  const grammar10 = `grammar Test;
stmt: ID NUMBER | ID STRING;  // 1-token prefix
IF: 'if';
ID: [a-z]+;
NUMBER: [0-9]+;
STRING: '"' [a-z]* '"';
`;
  const result10a = AntlrAnalyzer.analyzeAmbiguities(grammar10, { minPrefixLength: 2 });
  const result10b = AntlrAnalyzer.analyzeAmbiguities(grammar10, { minPrefixLength: 1 });
  assert(
    result10a.issues.filter(i => i.type === 'overlapping-prefix').length === 0,
    'Should not detect 1-token prefix with minPrefixLength=2'
  );
  assert(
    result10b.issues.filter(i => i.type === 'overlapping-prefix').length > 0,
    'Should detect 1-token prefix with minPrefixLength=1'
  );

  // Test 11: Direct left recursion (should pass - not hidden)
  console.log('\nTest 11: Direct left recursion should not trigger hidden recursion check');
  const grammar11 = `grammar Test;
expr: expr PLUS term | term;
term: NUMBER;
PLUS: '+';
NUMBER: [0-9]+;
`;
  const result11 = AntlrAnalyzer.analyzeAmbiguities(grammar11);
  // Note: This tests that we don't report hidden recursion for direct recursion
  // ANTLR handles direct left recursion, but not hidden/indirect
  assert(
    !result11.issues.some(i => i.type === 'hidden-left-recursion' && i.rule === 'expr'),
    'Should not report hidden left recursion for direct left recursion'
  );

  // Test 12: No false positive for similar but not identical alternatives
  console.log('\nTest 12: No false positive for similar alternatives');
  const grammar12 = `grammar Test;
expr: ID PLUS NUMBER | ID TIMES NUMBER;
ID: [a-z]+;
PLUS: '+';
TIMES: '*';
NUMBER: [0-9]+;
`;
  const result12 = AntlrAnalyzer.analyzeAmbiguities(grammar12);
  assert(
    !result12.issues.some(i => i.type === 'identical-alternatives'),
    'Should not report identical alternatives for different alternatives'
  );

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests passed: ${passCount}/${passCount + failCount}`);
  console.log(`Tests failed: ${failCount}/${passCount + failCount}`);
  
  if (failCount === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests();
