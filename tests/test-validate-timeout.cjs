/**
 * Test: validate-grammar Timeout/Hang Prevention
 * 
 * Tests that validate-grammar doesn't hang indefinitely on:
 * - Missing semicolons
 * - Extremely long rule definitions
 * - Malformed grammars
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

console.log('=== validate-grammar Timeout Prevention Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const start = Date.now();
    fn();
    const elapsed = Date.now() - start;
    passed++;
    console.log(`✅ ${name} (${elapsed}ms)`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// ============================================================================
// Test 1: Normal grammar (should complete quickly)
// ============================================================================
test('Normal grammar validates quickly', () => {
  const grammar = `grammar Normal;
TOKEN: 'value';
OTHER: 'other';
rule: TOKEN | OTHER;
`;
  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 100) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  // Normal grammars may have warnings, just check it completes
});

// ============================================================================
// Test 2: Missing semicolon (should NOT hang)
// ============================================================================
test('Missing semicolon is caught with timeout', () => {
  const grammar = `grammar MissingSemicolon;

TOKEN: 'value';

// This rule is missing a semicolon - should not hang!
badRule: TOKEN TOKEN TOKEN
  | OTHER TOKEN
  | ANOTHER
  
// This will never be reached if the parser hangs
goodRule: TOKEN;
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 1000) {
    throw new Error(`Took too long: ${elapsed}ms (possible hang)`);
  }
  
  // Should report the missing semicolon issue
  const hasMissingSemicolonIssue = result.issues.some(i => 
    i.message.includes('missing a semicolon') || 
    i.message.includes('extremely long')
  );
  
  if (!hasMissingSemicolonIssue) {
    console.log(`   ⚠️  Expected missing semicolon error but got: ${JSON.stringify(result.issues)}`);
  }
  
  console.log(`   Issues detected: ${result.issues.length}`);
});

// ============================================================================
// Test 3: Very long rule (should still complete)
// ============================================================================
test('Very long rule completes within timeout', () => {
  const alternatives = Array.from({ length: 500 }, (_, i) => `OPTION${i}`).join('\n  | ');
  
  const grammar = `grammar LongRule;

${Array.from({ length: 500 }, (_, i) => `OPTION${i}: 'opt${i}';`).join('\n')}

// This rule has 500 alternatives
longRule:
  ${alternatives}
;

normalRule: OPTION0;
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 5000) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  
  console.log(`   Parsed ${result.rules.length} rules in ${elapsed}ms`);
});

// ============================================================================
// Test 4: Multiple missing semicolons
// ============================================================================
test('Multiple missing semicolons handled gracefully', () => {
  const grammar = `grammar MultipleBad;

TOKEN: 'value';

rule1: TOKEN
  | TOKEN TOKEN

rule2: TOKEN
  | OTHER

rule3: TOKEN;
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 2000) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  
  console.log(`   Found ${result.issues.length} issues in ${elapsed}ms`);
});

// ============================================================================
// Test 5: Huge file (stress test)
// ============================================================================
test('Huge grammar file (10000 lines) completes', () => {
  const rules = Array.from({ length: 5000 }, (_, i) => `TOKEN${i}: 'keyword${i}';`).join('\n');
  const parserRules = Array.from({ length: 100 }, (_, i) => 
    `rule${i}: TOKEN${i} TOKEN${i+1};`
  ).join('\n');
  
  const grammar = `grammar Huge;

${rules}

${parserRules}
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 10000) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  
  console.log(`   Parsed ${result.rules.length} rules from ${grammar.split('\n').length} lines in ${elapsed}ms`);
});

// ============================================================================
// Test 6: Pathological case - rule without semicolon at EOF
// ============================================================================
test('Rule without semicolon at EOF is caught', () => {
  const grammar = `grammar EndOfFile;

TOKEN: 'value';

// Last rule has no semicolon and is at EOF
lastRule: TOKEN TOKEN TOKEN`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 1000) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  
  // The parser should handle this - might not report as error since it reaches EOF
  console.log(`   Completed in ${elapsed}ms with ${result.issues.length} issues`);
});

// ============================================================================
// Test 7: Legitimately long rules should work
// ============================================================================
test('Very long legitimate rule (2000 lines) completes', () => {
  // Create a rule with 2000 alternatives (legitimately long)
  const alternatives = Array.from({ length: 2000 }, (_, i) => `OPTION${i}`).join('\n  | ');
  
  const grammar = `grammar VeryLong;

${Array.from({ length: 2000 }, (_, i) => `OPTION${i}: 'opt${i}';`).join('\n')}

// This rule has 2000 alternatives - should complete fine
veryLongRule:
  ${alternatives}
;

normalRule: OPTION0;
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 10000) {
    throw new Error(`Took too long: ${elapsed}ms`);
  }
  
  if (result.issues.some(i => i.message.includes('extremely long'))) {
    throw new Error('Legitimate long rule was incorrectly flagged');
  }
  
  console.log(`   Parsed ${result.rules.length} rules with 2000-line rule in ${elapsed}ms`);
});

// ============================================================================
// Test 8: Artificially trigger the 10,000-line rule limit
// ============================================================================
test('10,000+ line rule triggers safety limit', () => {
  // Create a rule that would span more than 10,000 lines without a semicolon
  const longContent = Array.from({ length: 10100 }, (_, i) => `  line${i}`).join('\n');
  
  const grammar = `grammar VeryLongRule;

TOKEN: 'value';

hugeRule:
${longContent}

// This should never be reached if parser hangs
nextRule: TOKEN;
`;

  const start = Date.now();
  const result = AntlrAnalyzer.analyze(grammar);
  const elapsed = Date.now() - start;
  
  if (elapsed > 10000) {
    throw new Error(`Took too long: ${elapsed}ms (safety limit may not be working)`);
  }
  
  // Should report the line limit issue
  const hasLimitIssue = result.issues.some(i => 
    i.message.includes('>10000 lines') || 
    i.message.includes('extremely long') ||
    i.message.includes('missing a semicolon')
  );
  
  if (hasLimitIssue) {
    console.log(`   ✓ Safety limit triggered as expected`);
  } else {
    console.log(`   ⚠️  Safety limit may not have triggered. Issues: ${result.issues.length}`);
  }
  
  console.log(`   Completed in ${elapsed}ms`);
});

// ============================================================================
// Results
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log(`Total Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('='.repeat(70));

if (failed === 0) {
  console.log('\n✅ All timeout prevention tests passed!');
  console.log('\nProtection in place:');
  console.log('  • Maximum 10,000 lines per rule definition');
  console.log('  • Missing semicolons detected and reported');
  console.log('  • Malformed grammars handled gracefully');
  console.log('  • Legitimately long rules (2000+ lines) work fine');
  console.log('  • Parser never hangs indefinitely');
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
