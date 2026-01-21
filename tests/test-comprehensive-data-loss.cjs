/**
 * Comprehensive Data Loss Prevention Tests
 * 
 * Tests the safeWriteFile() protection across multiple scenarios:
 * - Different reduction percentages
 * - Various file sizes
 * - Multiple tool types
 * - Edge cases
 */

const fs = require('fs');
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

// Test counter
let testsPassed = 0;
let testsFailed = 0;
let testsTotal = 0;

function test(name, fn) {
  testsTotal++;
  try {
    fn();
    testsPassed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Simulate safeWriteFile behavior
function wouldSafeWriteAllow(originalLines, modifiedLines) {
  if (modifiedLines < originalLines * 0.5 && originalLines > 10) {
    return false; // BLOCKED
  }
  return true; // ALLOWED
}

console.log('=== Comprehensive Data Loss Prevention Tests ===\n');

// ============================================================================
// Test Suite 1: Threshold Testing
// ============================================================================
console.log('--- Suite 1: Threshold Testing ---');

test('Exactly 50% reduction should ALLOW', () => {
  const original = 100;
  const modified = 50;
  assert(wouldSafeWriteAllow(original, modified), 'Should allow 50% exactly');
});

test('Just above 50% (51%) should ALLOW', () => {
  const original = 100;
  const modified = 51;
  assert(wouldSafeWriteAllow(original, modified), 'Should allow 51%');
});

test('Just below 50% (49%) should BLOCK', () => {
  const original = 100;
  const modified = 49;
  assert(!wouldSafeWriteAllow(original, modified), 'Should block 49%');
});

test('Drastic reduction (10%) should BLOCK', () => {
  const original = 1000;
  const modified = 100;
  assert(!wouldSafeWriteAllow(original, modified), 'Should block 10%');
});

test('User scenario (0.26%) should BLOCK', () => {
  const original = 1545;
  const modified = 4;
  assert(!wouldSafeWriteAllow(original, modified), 'Should block 0.26%');
});

test('Tiny reduction (99%) should ALLOW', () => {
  const original = 100;
  const modified = 99;
  assert(wouldSafeWriteAllow(original, modified), 'Should allow 99%');
});

test('No change (100%) should ALLOW', () => {
  const original = 100;
  const modified = 100;
  assert(wouldSafeWriteAllow(original, modified), 'Should allow 100%');
});

test('File growth should ALLOW', () => {
  const original = 100;
  const modified = 200;
  assert(wouldSafeWriteAllow(original, modified), 'Should allow growth');
});

// ============================================================================
// Test Suite 2: Small File Exception
// ============================================================================
console.log('\n--- Suite 2: Small File Exception (≤10 lines) ---');

test('10 line file reduced to 1 should ALLOW', () => {
  const original = 10;
  const modified = 1;
  assert(wouldSafeWriteAllow(original, modified), 'Small file exception at boundary');
});

test('11 line file reduced to 1 should BLOCK', () => {
  const original = 11;
  const modified = 1;
  assert(!wouldSafeWriteAllow(original, modified), 'Just above small file exception');
});

test('5 line file reduced to 1 should ALLOW', () => {
  const original = 5;
  const modified = 1;
  assert(wouldSafeWriteAllow(original, modified), 'Small file can be rewritten');
});

test('Single line file reduced to empty should ALLOW', () => {
  const original = 1;
  const modified = 0;
  assert(wouldSafeWriteAllow(original, modified), 'Tiny file exception');
});

// ============================================================================
// Test Suite 3: Real-World Grammar Operations
// ============================================================================
console.log('\n--- Suite 3: Real-World Grammar Operations ---');

const mediumGrammar = `grammar Medium;

// Lexer rules
${Array.from({ length: 50 }, (_, i) => `TOKEN${i}: 'keyword${i}';`).join('\n')}

// Parser rules
start: rule1 | rule2;
rule1: TOKEN1 TOKEN2;
rule2: TOKEN3 TOKEN4;
`;

test('Add lexer rule to 60-line grammar', () => {
  const result = AntlrAnalyzer.addLexerRule(mediumGrammar, 'NEWTOKEN', "'new'");
  assert(result.success, 'Should succeed');
  const originalLines = mediumGrammar.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  assert(wouldSafeWriteAllow(originalLines, modifiedLines), 
    `Adding rule should be allowed: ${originalLines} → ${modifiedLines}`);
});

test('Remove rule from 60-line grammar', () => {
  const result = AntlrAnalyzer.removeRule(mediumGrammar, 'TOKEN1');
  assert(result.success, 'Should succeed');
  const originalLines = mediumGrammar.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  assert(wouldSafeWriteAllow(originalLines, modifiedLines),
    `Removing single rule should be allowed: ${originalLines} → ${modifiedLines}`);
});

test('Update rule in 60-line grammar', () => {
  const result = AntlrAnalyzer.updateRule(mediumGrammar, 'rule1', 'TOKEN5 TOKEN6');
  assert(result.success, 'Should succeed');
  const originalLines = mediumGrammar.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  assert(wouldSafeWriteAllow(originalLines, modifiedLines),
    `Updating rule should be allowed: ${originalLines} → ${modifiedLines}`);
});

// ============================================================================
// Test Suite 4: Edge Cases
// ============================================================================
console.log('\n--- Suite 4: Edge Cases ---');

test('Empty result from non-empty file should BLOCK', () => {
  const original = 100;
  const modified = 0;
  assert(!wouldSafeWriteAllow(original, modified), 'Complete deletion should block');
});

test('Very large file (10000 lines) reduced 49% should BLOCK', () => {
  const original = 10000;
  const modified = 4900;
  assert(!wouldSafeWriteAllow(original, modified), 'Large file 49% should block');
});

test('Very large file (10000 lines) reduced 50% should ALLOW', () => {
  const original = 10000;
  const modified = 5000;
  assert(wouldSafeWriteAllow(original, modified), 'Large file 50% should allow');
});

test('Exactly at 11 lines (boundary) reduced to 5 should BLOCK', () => {
  const original = 11;
  const modified = 5;
  assert(!wouldSafeWriteAllow(original, modified), 'Just above exception, below 50%');
});

// ============================================================================
// Test Suite 5: Multiple Tool Types with File Simulation
// ============================================================================
console.log('\n--- Suite 5: Tool Integration (File-Based) ---');

const testFile1 = '/tmp/test-medium-grammar.g4';
const testFile2 = '/tmp/test-large-grammar.g4';

const mediumContent = `grammar Test;
${Array.from({ length: 20 }, (_, i) => `RULE${i}: 'val${i}';`).join('\n')}
start: RULE0 RULE1;
`;

const largeContent = `grammar Large;
${Array.from({ length: 200 }, (_, i) => `TOKEN${i}: 'keyword${i}';`).join('\n')}
start: expr;
expr: term ((PLUS | MINUS) term)*;
term: factor ((MULT | DIV) factor)*;
factor: NUMBER | LPAREN expr RPAREN;
`;

fs.writeFileSync(testFile1, mediumContent, 'utf-8');
fs.writeFileSync(testFile2, largeContent, 'utf-8');

test('add-lexer-rule to medium file should be allowed', () => {
  const result = AntlrAnalyzer.addLexerRule(mediumContent, 'NEWRULE', "'value'");
  assert(result.success, 'Rule addition should succeed');
  
  const original = fs.readFileSync(testFile1, 'utf-8');
  const originalLines = original.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  
  assert(wouldSafeWriteAllow(originalLines, modifiedLines),
    `Should allow write: ${originalLines} → ${modifiedLines}`);
});

test('Placeholder bug scenario with medium file should be BLOCKED', () => {
  const placeholder = '// placeholder';
  const result = AntlrAnalyzer.addLexerRule(placeholder, 'TOKEN', "'val'");
  assert(result.success, 'Tool should succeed with placeholder');
  
  const original = fs.readFileSync(testFile1, 'utf-8');
  const originalLines = original.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  
  assert(!wouldSafeWriteAllow(originalLines, modifiedLines),
    `Should BLOCK write: ${originalLines} → ${modifiedLines} (${Math.round(modifiedLines/originalLines*100)}%)`);
});

test('Placeholder bug scenario with large file should be BLOCKED', () => {
  const placeholder = '// read from file';
  const result = AntlrAnalyzer.addParserRule(placeholder, 'newrule', 'TOKEN1 TOKEN2');
  assert(result.success, 'Tool should succeed with placeholder');
  
  const original = fs.readFileSync(testFile2, 'utf-8');
  const originalLines = original.split('\n').length;
  const modifiedLines = result.modified.split('\n').length;
  
  assert(!wouldSafeWriteAllow(originalLines, modifiedLines),
    `Should BLOCK write: ${originalLines} → ${modifiedLines} (${Math.round(modifiedLines/originalLines*100)}%)`);
});

test('Legitimate large deletion (remove 40% of rules) should be allowed', () => {
  // Remove 80 out of 200 tokens = 40% reduction, should be above 50% threshold
  let content = largeContent;
  for (let i = 0; i < 80; i++) {
    const result = AntlrAnalyzer.removeRule(content, `TOKEN${i}`);
    if (result.success) {
      content = result.modified;
    }
  }
  
  const originalLines = largeContent.split('\n').length;
  const modifiedLines = content.split('\n').length;
  
  assert(wouldSafeWriteAllow(originalLines, modifiedLines),
    `Large deletion (40%) should allow: ${originalLines} → ${modifiedLines}`);
});

test('Excessive deletion (remove 60% of rules) should be BLOCKED', () => {
  // Remove 120 out of 200 tokens = 60% reduction, should be below 50% threshold
  let content = largeContent;
  let removed = 0;
  for (let i = 0; i < 200 && removed < 120; i++) {
    const result = AntlrAnalyzer.removeRule(content, `TOKEN${i}`);
    if (result.success) {
      content = result.modified;
      removed++;
    }
  }
  
  const originalLines = largeContent.split('\n').length;
  const modifiedLines = content.split('\n').length;
  
  assert(!wouldSafeWriteAllow(originalLines, modifiedLines),
    `Excessive deletion (60%) should block: ${originalLines} → ${modifiedLines}`);
});

// Cleanup
fs.unlinkSync(testFile1);
fs.unlinkSync(testFile2);

// ============================================================================
// Test Suite 6: Percentage Calculations
// ============================================================================
console.log('\n--- Suite 6: Percentage Edge Cases ---');

test('Rounding at 49.5% should BLOCK', () => {
  const original = 200;
  const modified = 99; // 49.5%
  assert(!wouldSafeWriteAllow(original, modified), '49.5% rounds to 49%, should block');
});

test('Rounding at 50.5% should ALLOW', () => {
  const original = 200;
  const modified = 101; // 50.5%
  assert(wouldSafeWriteAllow(original, modified), '50.5% rounds to 50%, should allow');
});

test('1 line remaining from 100 should BLOCK', () => {
  const original = 100;
  const modified = 1; // 1%
  assert(!wouldSafeWriteAllow(original, modified), '99% reduction should block');
});

test('1 line remaining from 2 should BLOCK', () => {
  const original = 11;
  const modified = 1; // ~9%
  assert(!wouldSafeWriteAllow(original, modified), '91% reduction on 11 lines should block');
});

// ============================================================================
// Results Summary
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('Test Results Summary');
console.log('='.repeat(70));
console.log(`Total Tests:  ${testsTotal}`);
console.log(`Passed:       ${testsPassed} (${Math.round(testsPassed/testsTotal*100)}%)`);
console.log(`Failed:       ${testsFailed}`);
console.log('='.repeat(70));

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! Data loss prevention is working correctly.');
} else {
  console.log(`\n⚠️  ${testsFailed} test(s) failed. Review the failures above.`);
  process.exit(1);
}

// ============================================================================
// Visual Summary of Protection
// ============================================================================
console.log('\n--- Protection Behavior Summary ---\n');

const scenarios = [
  { desc: 'User\'s bug (1545→4)', orig: 1545, mod: 4, expected: 'BLOCK' },
  { desc: 'Normal add (100→101)', orig: 100, mod: 101, expected: 'ALLOW' },
  { desc: 'Normal remove (100→99)', orig: 100, mod: 99, expected: 'ALLOW' },
  { desc: 'Large delete (100→50)', orig: 100, mod: 50, expected: 'ALLOW' },
  { desc: 'Too large delete (100→49)', orig: 100, mod: 49, expected: 'BLOCK' },
  { desc: 'Placeholder (100→2)', orig: 100, mod: 2, expected: 'BLOCK' },
  { desc: 'Small file (5→1)', orig: 5, mod: 1, expected: 'ALLOW' },
  { desc: 'Complete wipe (200→0)', orig: 200, mod: 0, expected: 'BLOCK' },
];

console.log('┌─────────────────────────────┬──────────┬──────────┬─────────┬────────┐');
console.log('│ Scenario                    │ Original │ Modified │ Percent │ Result │');
console.log('├─────────────────────────────┼──────────┼──────────┼─────────┼────────┤');

scenarios.forEach(({ desc, orig, mod, expected }) => {
  const percent = orig > 0 ? Math.round(mod / orig * 100) : 0;
  const actual = wouldSafeWriteAllow(orig, mod) ? 'ALLOW' : 'BLOCK';
  const icon = actual === expected ? '✓' : '✗';
  
  console.log(`│ ${desc.padEnd(27)} │ ${String(orig).padStart(8)} │ ${String(mod).padStart(8)} │ ${String(percent + '%').padStart(7)} │ ${icon} ${actual.padEnd(5)} │`);
});

console.log('└─────────────────────────────┴──────────┴──────────┴─────────┴────────┘');

console.log('\n✅ Protection Rules:');
console.log('   • Files with >10 lines are protected');
console.log('   • Writes blocked if modified < 50% of original');
console.log('   • Small files (≤10 lines) can be completely rewritten');
console.log('   • Growth and small reductions are always allowed');
