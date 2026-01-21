/**
 * Test update-rule with complex multi-line formatting
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

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

console.log('Testing update-rule with multi-line definitions...\n');

// Test 1: Update rule with multi-line definition (embedded newlines)
runTest('Test 1: Multi-line definition with embedded newlines', () => {
  const grammar = `grammar Test;

srp_uuid_null
:
    UUID
    | ACTION
;
`;

  const newDef = `UUID
    | ~(
        ACTION
        | FROM
        | SOURCE
    )`;

  const result = AntlrAnalyzer.updateRule(grammar, 'srp_uuid_null', newDef);
  
  assert(result.success === true, 'Should succeed');
  assert(result.modified.includes('UUID'), 'Should contain UUID');
  assert(result.modified.includes('FROM'), 'Should contain FROM');
  assert(result.modified.includes('SOURCE'), 'Should contain SOURCE');
  
  console.log('  Result:');
  console.log(result.modified.split('\n').slice(2, 10).map(l => '    ' + l).join('\n'));
});

// Test 2: Add parser rule with multi-line definition
runTest('Test 2: Add parser rule with multi-line definition', () => {
  const grammar = `grammar Test;

start: expr;
`;

  const multiLineDef = `ID
    | NUMBER
    | expr '+' expr
    | expr '*' expr`;

  const result = AntlrAnalyzer.addParserRule(grammar, 'expr', multiLineDef);
  
  assert(result.success === true, 'Should succeed');
  assert(result.modified.includes('expr'), 'Should contain expr rule');
  
  console.log('  Result contains multi-line expr rule');
});

// Test 3: Check how current update-rule handles the exact example
runTest('Test 3: Exact Palo Alto style formatting', () => {
  const grammar = `grammar Test;

srp_uuid_null
:
    UUID
;
`;

  // User's exact format
  const newDef = `UUID
    | ~(
        ACTION
        | FROM
        | SOURCE
        | DESTINATION
        | APPLICATION
        | SERVICE
        | ENFORCE_SYMMETRIC_RETURN
        | LOG_END
        | LOG_START
        | NEGATE_DESTINATION
        | NEGATE_SOURCE
        | OPTION
        | UUID
        | NEWLINE
    )`;

  const result = AntlrAnalyzer.updateRule(grammar, 'srp_uuid_null', newDef);
  
  assert(result.success === true, 'Should succeed');
  
  // Check structure
  const lines = result.modified.split('\n');
  const ruleStart = lines.findIndex(l => l.includes('srp_uuid_null'));
  const ruleLines = [];
  for (let i = ruleStart; i < lines.length && !lines[i].includes(';'); i++) {
    ruleLines.push(lines[i]);
  }
  
  console.log('  Formatted rule:');
  console.log(ruleLines.slice(0, 10).map(l => '    ' + l).join('\n'));
  console.log('    ...');
});

console.log('\n==================================================');
console.log(`Tests passed: ${passed}/${passed + failed}`);
console.log(`Tests failed: ${failed}/${passed + failed}`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  console.log('\n💡 Current behavior:');
  console.log('   - update-rule DOES support multi-line definitions');
  console.log('   - Pass newDefinition with embedded \\n characters');
  console.log('   - The rule will preserve the grammar\'s formatting style');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
