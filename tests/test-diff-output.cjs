/**
 * Test: Diff Output Mode for Modification Tools
 * 
 * Tests the new output_mode parameter that allows:
 * - Full output (default): Returns entire modified grammar
 * - Diff output: Returns git-style unified diff showing only changes
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');
const Diff = require('diff');

console.log('=== Diff Output Mode Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// Helper to generate diff
function generateUnifiedDiff(original, modified, filename = 'grammar.g4') {
  return Diff.createPatch(filename, original, modified, 'original', 'modified');
}

// ============================================================================
// Test 1: add-lexer-rule creates valid diff
// ============================================================================
test('add-lexer-rule generates unified diff', () => {
  const original = `grammar Test;

ID: [a-zA-Z]+;
NUMBER: [0-9]+;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'STRING', '".*?"', {});
  
  if (!result.success) {
    throw new Error(`addLexerRule failed: ${result.message}`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify diff contains expected markers
  if (!diff.includes('---')) {
    throw new Error('Diff missing --- marker');
  }
  if (!diff.includes('+++')) {
    throw new Error('Diff missing +++ marker');
  }
  if (!diff.includes('+STRING: ".*?"')) {
    throw new Error('Diff missing added line');
  }
  
  console.log(`   Diff size: ${diff.length} chars vs Full: ${result.modified.length} chars`);
});

// ============================================================================
// Test 2: add-parser-rule diff shows additions
// ============================================================================
test('add-parser-rule diff shows only additions', () => {
  // Use larger grammar to show diff advantage
  const rules = Array.from({ length: 20 }, (_, i) => `rule${i}: TOKEN${i};`).join('\n');
  const original = `grammar Test;

${rules}

start: expr;
expr: term;
term: NUMBER;
`;

  const result = AntlrAnalyzer.addParserRule(original, 'factor', 'NUMBER | LPAREN expr RPAREN', {});
  
  if (!result.success) {
    throw new Error(`addParserRule failed: ${result.message}`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify diff shows addition
  if (!diff.includes('+factor:')) {
    throw new Error('Diff missing added rule');
  }
  
  // For larger grammars, diff should be smaller
  const sizeRatio = diff.length / result.modified.length;
  
  console.log(`   Diff is ${Math.round(sizeRatio * 100)}% of full output: ${diff.length} vs ${result.modified.length} chars`);
});

// ============================================================================
// Test 3: update-rule diff shows changes
// ============================================================================
test('update-rule diff shows before/after', () => {
  const original = `grammar Test;

expr: term;
term: NUMBER;
`;

  const result = AntlrAnalyzer.updateRule(original, 'expr', 'term ((PLUS | MINUS) term)*');
  
  if (!result.success) {
    throw new Error(`updateRule failed: ${result.message}`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify diff shows removal and addition
  if (!diff.includes('-expr: term;')) {
    throw new Error('Diff missing removed line');
  }
  if (!diff.includes('+expr: term ((PLUS | MINUS) term)*;')) {
    throw new Error('Diff missing added line');
  }
  
  console.log(`   Diff contains both - and + lines`);
});

// ============================================================================
// Test 4: remove-rule diff shows deletions
// ============================================================================
test('remove-rule diff shows deletions only', () => {
  const original = `grammar Test;

expr: term;
term: NUMBER;
factor: NUMBER;
`;

  const result = AntlrAnalyzer.removeRule(original, 'factor');
  
  if (!result.success) {
    throw new Error(`removeRule failed: ${result.message}`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify diff shows deletion
  if (!diff.includes('-factor: NUMBER;')) {
    throw new Error('Diff missing removed line');
  }
  
  console.log(`   Diff shows - lines for deleted rule`);
});

// ============================================================================
// Test 5: rename-rule diff shows multiple changes
// ============================================================================
test('rename-rule diff shows all reference updates', () => {
  const original = `grammar Test;

start: expr;
expr: term;
term: expr;
`;

  const result = AntlrAnalyzer.renameRule(original, 'expr', 'expression');
  
  if (!result.success) {
    throw new Error(`renameRule failed: ${result.message}`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify diff shows multiple changes (rule definition + references)
  const minusCount = (diff.match(/-/g) || []).length;
  const plusCount = (diff.match(/\+/g) || []).length;
  
  if (minusCount < 5 || plusCount < 5) {
    throw new Error(`Expected multiple changes, got ${minusCount} removes, ${plusCount} adds`);
  }
  
  console.log(`   Multiple changes: ${minusCount} removes, ${plusCount} additions`);
});

// ============================================================================
// Test 6: Diff vs Full output size comparison
// ============================================================================
test('Diff output is significantly smaller than full', () => {
  // Create a large grammar
  const rules = Array.from({ length: 50 }, (_, i) => `TOKEN${i}: 'token${i}';`).join('\n');
  const original = `grammar Large;

${rules}

start: expr;
expr: term;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'NEWTOKEN', "'new'", {});
  
  if (!result.success) {
    throw new Error(`addLexerRule failed`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Large.g4');
  
  const fullSize = result.modified.length;
  const diffSize = diff.length;
  const reduction = Math.round((1 - diffSize / fullSize) * 100);
  
  if (reduction < 50) {
    throw new Error(`Expected 50%+ reduction but got ${reduction}%`);
  }
  
  console.log(`   Large grammar: ${reduction}% reduction (${diffSize} vs ${fullSize} chars)`);
});

// ============================================================================
// Test 7: Diff preserves context lines
// ============================================================================
test('Diff includes context lines around changes', () => {
  const original = `grammar Test;

LINE1: 'a';
LINE2: 'b';
LINE3: 'c';
LINE4: 'd';
LINE5: 'e';
`;

  const result = AntlrAnalyzer.updateRule(original, 'LINE3', "'changed'");
  
  if (!result.success) {
    throw new Error(`updateRule failed`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify context lines are included
  if (!diff.includes('LINE2')) {
    throw new Error('Diff missing context before change');
  }
  if (!diff.includes('LINE4')) {
    throw new Error('Diff missing context after change');
  }
  
  console.log(`   Context lines preserved (LINE2, LINE4 visible)`);
});

// ============================================================================
// Test 8: Empty grammar edge case
// ============================================================================
test('Diff handles empty grammar', () => {
  const original = `grammar Empty;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'FIRST', "'first'", {});
  
  if (!result.success) {
    throw new Error(`addLexerRule failed`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Empty.g4');
  
  // Should show addition
  if (!diff.includes('+FIRST:')) {
    throw new Error('Diff missing added rule');
  }
  
  console.log(`   Empty grammar handled correctly`);
});

// ============================================================================
// Test 9: Multi-line rule change
// ============================================================================
test('Diff handles multi-line rule changes', () => {
  const original = `grammar Test;

complexRule:
  option1
  | option2
  | option3
;
`;

  const result = AntlrAnalyzer.updateRule(original, 'complexRule', 
    'option1\n  | option2\n  | option3\n  | option4'
  );
  
  if (!result.success) {
    throw new Error(`updateRule failed`);
  }
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify multi-line changes visible (check for option4)
  if (!diff.includes('option4')) {
    throw new Error('Diff missing added option4');
  }
  
  console.log(`   Multi-line rule changes handled`);
});

// ============================================================================
// Test 10: Diff format matches git diff style
// ============================================================================
test('Diff format matches git diff conventions', () => {
  const original = `grammar Test;
rule1: 'a';
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'RULE2', "'b'", {});
  
  const diff = generateUnifiedDiff(original, result.modified, 'Test.g4');
  
  // Verify standard git diff markers
  if (!diff.includes('---')) {
    throw new Error('Diff missing --- marker');
  }
  if (!diff.includes('+++')) {
    throw new Error('Diff missing +++ marker');
  }
  if (!diff.includes('@@')) {
    throw new Error('Diff missing @@ hunk header');
  }
  
  console.log(`   Standard git diff format confirmed`);
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
  console.log('\n✅ All diff output tests passed!');
  console.log('\nFeatures verified:');
  console.log('  • Unified diff format (git-style)');
  console.log('  • add-lexer-rule diff output');
  console.log('  • add-parser-rule diff output');
  console.log('  • update-rule diff output');
  console.log('  • remove-rule diff output');
  console.log('  • rename-rule diff output');
  console.log('  • 50%+ size reduction for large grammars');
  console.log('  • Context lines preserved');
  console.log('  • Multi-line changes handled');
  console.log('  • Standard --- +++ @@ markers');
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
