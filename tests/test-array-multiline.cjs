/**
 * Test update-rule with array input for multi-line definitions
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${err.message}`);
    failed++;
  }
}

console.log('Testing multi-line rule support with ARRAY input...\n');

// Test 1: Update rule with array (convenient!)
runTest('Test 1: Update rule with array of lines', () => {
  const grammar = `grammar Test;

srp_uuid_null
:
    UUID
;
`;

  // Pass definition as an array - much more convenient!
  const newDef = [
    'UUID',
    '    | ~(',
    '        ACTION',
    '        | FROM',
    '        | SOURCE',
    '        | DESTINATION',
    '    )'
  ];

  const result = AntlrAnalyzer.updateRule(grammar, 'srp_uuid_null', newDef);
  
  assert(result.success === true, 'Should succeed');
  assert(result.modified.includes('UUID'), 'Should contain UUID');
  assert(result.modified.includes('FROM'), 'Should contain FROM');
  assert(result.modified.includes('DESTINATION'), 'Should contain DESTINATION');
  
  console.log('  Result (first 12 lines):');
  console.log(result.modified.split('\n').slice(0, 12).map(l => '    ' + l).join('\n'));
});

// Test 2: Add parser rule with array
runTest('Test 2: Add parser rule with array of lines', () => {
  const grammar = `grammar Test;

start: expr;
`;

  const exprDef = [
    'ID',
    '    | NUMBER',
    '    | expr \'+\' expr',
    '    | expr \'*\' expr'
  ];

  const result = AntlrAnalyzer.addParserRule(grammar, 'expr', exprDef);
  
  assert(result.success === true, 'Should succeed');
  assert(result.modified.includes('expr'), 'Should contain expr rule');
  assert(result.modified.includes('ID'), 'Should contain ID');
  assert(result.modified.includes('NUMBER'), 'Should contain NUMBER');
  
  console.log('  ✓ Multi-line expr rule added successfully');
});

// Test 3: Add lexer rule with array
runTest('Test 3: Add lexer rule with array of lines', () => {
  const grammar = `grammar Test;

start: ID;
`;

  const idDef = [
    '[a-z]',
    '    | [A-Z]',
    '    | [\\_]'
  ];

  const result = AntlrAnalyzer.addLexerRule(grammar, 'ID', idDef);
  
  assert(result.success === true, 'Should succeed');
  assert(result.modified.includes('ID'), 'Should contain ID rule');
  
  console.log('  ✓ Multi-line ID rule added successfully');
});

// Test 4: Real-world Palo Alto style rule
runTest('Test 4: Real Palo Alto style with full negation set', () => {
  const grammar = `grammar Test;

srp_uuid_null: UUID;
`;

  const realWorldDef = [
    'UUID',
    '    | ~(',
    '        ACTION',
    '        | FROM',
    '        | SOURCE',
    '        | DESTINATION',
    '        | APPLICATION',
    '        | SERVICE',
    '        | ENFORCE_SYMMETRIC_RETURN',
    '        | LOG_END',
    '        | LOG_START',
    '        | NEGATE_DESTINATION',
    '        | NEGATE_SOURCE',
    '        | OPTION',
    '        | UUID',
    '        | NEWLINE',
    '    )'
  ];

  const result = AntlrAnalyzer.updateRule(grammar, 'srp_uuid_null', realWorldDef);
  
  assert(result.success === true, 'Should succeed');
  
  // Verify all tokens are present
  const tokens = ['ACTION', 'FROM', 'SOURCE', 'DESTINATION', 'APPLICATION', 
                  'SERVICE', 'ENFORCE_SYMMETRIC_RETURN', 'LOG_END', 'LOG_START',
                  'NEGATE_DESTINATION', 'NEGATE_SOURCE', 'OPTION', 'NEWLINE'];
  
  for (const token of tokens) {
    assert(result.modified.includes(token), `Should contain ${token}`);
  }
  
  console.log('  ✓ All 13 negated tokens present');
});

// Test 5: Mixed - string and array both work
runTest('Test 5: Both string and array input work', () => {
  const grammar = `grammar Test;

rule1: A;
rule2: B;
`;

  // String input
  const result1 = AntlrAnalyzer.updateRule(grammar, 'rule1', 'X | Y | Z');
  assert(result1.success === true, 'String input should work');
  
  // Array input
  const result2 = AntlrAnalyzer.updateRule(grammar, 'rule2', ['X', '    | Y', '    | Z']);
  assert(result2.success === true, 'Array input should work');
  
  console.log('  ✓ Both input methods work correctly');
});

console.log('\n==================================================');
console.log(`Tests passed: ${passed}/${passed + failed}`);
console.log(`Tests failed: ${failed}/${passed + failed}`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  console.log('\n🎉 NEW FEATURE: Multi-line rule support with arrays!');
  console.log('\nUsage examples:');
  console.log('  1. String with \\n: "UUID\\n    | ACTION"');
  console.log('  2. Array of lines: ["UUID", "    | ACTION"]');
  console.log('\nThe array method is much more readable and convenient!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
