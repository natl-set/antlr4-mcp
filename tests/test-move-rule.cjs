#!/usr/bin/env node

/**
 * Test suite for move-rule feature
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
  console.log('Starting move-rule tests...\n');

  // Test 1: Move rule before another
  console.log('Test 1: Move rule before another');
  const grammar1 = `grammar Test;
a: ID;
b: NUMBER;
c: STRING;
ID: [a-z]+;
NUMBER: [0-9]+;
STRING: '"' [a-z]* '"';
`;
  const result1 = AntlrAnalyzer.moveRule(grammar1, 'c', 'before', 'a');
  assert(
    result1.success,
    'Should successfully move rule',
    result1.message
  );
  assert(
    result1.modified.indexOf('c:') < result1.modified.indexOf('a:'),
    'Rule c should now be before rule a'
  );

  // Test 2: Move rule after another
  console.log('\nTest 2: Move rule after another');
  const grammar2 = `grammar Test;
a: ID;
b: NUMBER;
c: STRING;
`;
  const result2 = AntlrAnalyzer.moveRule(grammar2, 'a', 'after', 'c');
  assert(
    result2.success,
    'Should successfully move rule',
    result2.message
  );
  assert(
    result2.modified.indexOf('a:') > result2.modified.indexOf('c:'),
    'Rule a should now be after rule c'
  );

  // Test 3: Rule not found
  console.log('\nTest 3: Rule not found error');
  const grammar3 = `grammar Test;
a: ID;
`;
  const result3 = AntlrAnalyzer.moveRule(grammar3, 'nonexistent', 'before', 'a');
  assert(
    !result3.success && result3.message.includes('not found'),
    'Should return error for non-existent rule'
  );

  // Test 4: Anchor not found
  console.log('\nTest 4: Anchor not found error');
  const grammar4 = `grammar Test;
a: ID;
`;
  const result4 = AntlrAnalyzer.moveRule(grammar4, 'a', 'before', 'nonexistent');
  assert(
    !result4.success && result4.message.includes('not found'),
    'Should return error for non-existent anchor'
  );

  // Test 5: Rule same as anchor
  console.log('\nTest 5: Rule same as anchor error');
  const grammar5 = `grammar Test;
a: ID;
`;
  const result5 = AntlrAnalyzer.moveRule(grammar5, 'a', 'before', 'a');
  assert(
    !result5.success && result5.message.includes('relative to itself'),
    'Should return error when rule and anchor are the same'
  );

  // Test 6: Rule already in position (before)
  console.log('\nTest 6: Rule already before anchor');
  const grammar6 = `grammar Test;
a: ID;
b: NUMBER;
`;
  const result6 = AntlrAnalyzer.moveRule(grammar6, 'a', 'before', 'b');
  assert(
    result6.success && result6.message.includes('already'),
    'Should detect rule is already in target position'
  );

  // Test 7: Multi-line rule preservation
  console.log('\nTest 7: Preserve multi-line rule formatting');
  const grammar7 = `grammar Test;
a: ID;

b
:
    NUMBER
    | STRING
;

c: PLUS;
`;
  const result7 = AntlrAnalyzer.moveRule(grammar7, 'b', 'after', 'c');
  assert(
    result7.success,
    'Should move multi-line rule',
    result7.message
  );
  assert(
    result7.modified.includes('b\n:\n    NUMBER\n    | STRING\n;'),
    'Should preserve multi-line formatting'
  );

  // Test 8: Move lexer rule
  console.log('\nTest 8: Move lexer rule');
  const grammar8 = `grammar Test;
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
`;
  const result8 = AntlrAnalyzer.moveRule(grammar8, 'PLUS', 'before', 'ID');
  assert(
    result8.success,
    'Should move lexer rule',
    result8.message
  );
  assert(
    result8.modified.indexOf('PLUS:') < result8.modified.indexOf('ID:'),
    'PLUS should now be before ID'
  );

  // Test 9: Move fragment rule
  console.log('\nTest 9: Move fragment rule');
  const grammar9 = `grammar Test;
ID: LETTER+;
fragment LETTER: [a-z];
fragment DIGIT: [0-9];
`;
  const result9 = AntlrAnalyzer.moveRule(grammar9, 'DIGIT', 'before', 'LETTER');
  assert(
    result9.success,
    'Should move fragment rule',
    result9.message
  );
  assert(
    result9.modified.indexOf('DIGIT:') < result9.modified.indexOf('LETTER:'),
    'DIGIT should now be before LETTER'
  );

  // Test 10: Preserve blank lines
  console.log('\nTest 10: Preserve blank lines between rules');
  const grammar10 = `grammar Test;

a: ID;

b: NUMBER;

c: STRING;
`;
  const result10 = AntlrAnalyzer.moveRule(grammar10, 'c', 'before', 'a');
  assert(
    result10.success,
    'Should move rule with blank lines',
    result10.message
  );
  // Check that blank lines are maintained
  const lines = result10.modified.split('\n');
  const blankLineCount = lines.filter(l => l.trim() === '').length;
  assert(
    blankLineCount >= 3,
    'Should preserve blank lines',
    `Found ${blankLineCount} blank lines`
  );

  // Test 11: Move to beginning
  console.log('\nTest 11: Move rule to beginning');
  const grammar11 = `grammar Test;
a: ID;
b: NUMBER;
c: STRING;
`;
  const result11 = AntlrAnalyzer.moveRule(grammar11, 'c', 'before', 'a');
  assert(
    result11.success,
    'Should move rule to beginning'
  );
  const firstRule = result11.modified.match(/^[a-z]:/m);
  assert(
    firstRule && firstRule[0] === 'c:',
    'Rule c should be first',
    `First rule: ${firstRule}`
  );

  // Test 12: Move from beginning
  console.log('\nTest 12: Move rule from beginning');
  const grammar12 = `grammar Test;
a: ID;
b: NUMBER;
c: STRING;
`;
  const result12 = AntlrAnalyzer.moveRule(grammar12, 'a', 'after', 'c');
  assert(
    result12.success,
    'Should move rule from beginning'
  );
  assert(
    result12.modified.indexOf('a:') > result12.modified.indexOf('c:'),
    'Rule a should now be after c'
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
