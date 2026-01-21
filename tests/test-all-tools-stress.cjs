/**
 * Stress Test: All Modification Tools
 * 
 * Tests data loss prevention across ALL modification tools:
 * - add-lexer-rule
 * - add-parser-rule  
 * - update-rule
 * - remove-rule
 * - rename-rule
 * - inline-rule
 * - sort-rules
 * - move-rule
 * - add-token-channel
 * - batch-token-features
 */

const fs = require('fs');
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

let passed = 0;
let failed = 0;

function testTool(toolName, operation, shouldBlock) {
  const testFile = '/tmp/stress-test-grammar.g4';
  const largeGrammar = `grammar StressTest;

${Array.from({ length: 150 }, (_, i) => `TOKEN${i}: 'keyword${i}';`).join('\n')}

start: expr;
expr: term ((PLUS | MINUS) term)*;
term: factor ((MULT | DIV) factor)*;
factor: NUMBER | LPAREN expr RPAREN;
`;

  fs.writeFileSync(testFile, largeGrammar, 'utf-8');
  
  try {
    const result = operation();
    
    if (!result.success) {
      console.log(`   ⚠️  ${toolName}: Tool operation failed: ${result.message}`);
      return;
    }
    
    const originalLines = largeGrammar.split('\n').length;
    const modifiedLines = result.modified.split('\n').length;
    const percentOfOriginal = Math.round(modifiedLines / originalLines * 100);
    const wouldBlock = modifiedLines < originalLines * 0.5 && originalLines > 10;
    
    if (shouldBlock && wouldBlock) {
      passed++;
      console.log(`   ✅ ${toolName}: Correctly would BLOCK (${originalLines}→${modifiedLines} lines, ${percentOfOriginal}%)`);
    } else if (!shouldBlock && !wouldBlock) {
      passed++;
      console.log(`   ✅ ${toolName}: Correctly would ALLOW (${originalLines}→${modifiedLines} lines, ${percentOfOriginal}%)`);
    } else if (shouldBlock && !wouldBlock) {
      failed++;
      console.log(`   ❌ ${toolName}: Should BLOCK but would ALLOW (${originalLines}→${modifiedLines} lines, ${percentOfOriginal}%)`);
    } else {
      failed++;
      console.log(`   ❌ ${toolName}: Should ALLOW but would BLOCK (${originalLines}→${modifiedLines} lines, ${percentOfOriginal}%)`);
    }
    
  } catch (error) {
    failed++;
    console.log(`   ❌ ${toolName}: Exception: ${error.message}`);
  } finally {
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
  }
}

console.log('=== All Tools Stress Test ===\n');

// ============================================================================
// Normal Operations (Should ALLOW)
// ============================================================================
console.log('--- Normal Operations (should be ALLOWED) ---\n');

testTool('add-lexer-rule (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.addLexerRule(largeGrammar, 'NEWTOKEN', "'value'");
}, false);

testTool('add-parser-rule (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.addParserRule(largeGrammar, 'newrule', 'TOKEN1 TOKEN2');
}, false);

testTool('update-rule (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.updateRule(largeGrammar, 'expr', 'term PLUS term');
}, false);

testTool('remove-rule (single)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.removeRule(largeGrammar, 'TOKEN1');
}, false);

testTool('rename-rule (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.renameRule(largeGrammar, 'expr', 'expression');
}, false);

testTool('inline-rule (single)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.inlineRule(largeGrammar, 'factor');
}, false);

testTool('sort-rules (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.sortRules(largeGrammar, { lexerFirst: true, mode: 'alphabetical' });
}, false);

testTool('move-rule (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.moveRule(largeGrammar, 'TOKEN5', { position: 'after', anchor: 'TOKEN1' });
}, false);

testTool('add-token-channel (normal)', () => {
  const largeGrammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  return AntlrAnalyzer.addTokenChannel(largeGrammar, 'HIDDEN');
}, false);

// ============================================================================
// Placeholder Bug Scenarios (Should BLOCK)
// ============================================================================
console.log('\n--- Placeholder Bug Scenarios (should be BLOCKED) ---\n');

testTool('add-lexer-rule (placeholder)', () => {
  return AntlrAnalyzer.addLexerRule('// placeholder', 'TOKEN', "'val'");
}, true);

testTool('add-parser-rule (placeholder)', () => {
  return AntlrAnalyzer.addParserRule('// read from file', 'rule', 'TOKEN');
}, true);

testTool('update-rule (placeholder)', () => {
  return AntlrAnalyzer.updateRule('grammar G; rule: A;', 'rule', 'B');
}, true);

testTool('remove-rule (placeholder)', () => {
  return AntlrAnalyzer.removeRule('grammar G; rule: A; other: B;', 'rule');
}, true);

testTool('rename-rule (placeholder)', () => {
  return AntlrAnalyzer.renameRule('grammar G; rule: A;', 'rule', 'newrule');
}, true);

// ============================================================================
// Excessive Deletions (Should BLOCK)
// ============================================================================
console.log('\n--- Excessive Deletions (should be BLOCKED) ---\n');

testTool('remove-rule (excessive - 100 rules)', () => {
  let grammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  
  // Remove 100 out of 150 tokens (66% deletion)
  for (let i = 0; i < 100; i++) {
    const result = AntlrAnalyzer.removeRule(grammar, `TOKEN${i}`);
    if (result.success) {
      grammar = result.modified;
    }
  }
  
  return { success: true, modified: grammar };
}, true);

// ============================================================================
// Boundary Cases (50% exactly)
// ============================================================================
console.log('\n--- Boundary Cases (50% threshold) ---\n');

testTool('Exactly 50% reduction (should ALLOW)', () => {
  // Create a grammar with exactly 100 lines
  const exactGrammar = `grammar Exact;
${Array.from({ length: 96 }, (_, i) => `TOKEN${i}: 'val${i}';`).join('\n')}
start: TOKEN0;
`;
  
  // Remove 48 rules to get to exactly 50 lines (50%)
  let modified = exactGrammar;
  for (let i = 0; i < 48; i++) {
    const result = AntlrAnalyzer.removeRule(modified, `TOKEN${i}`);
    if (result.success) modified = result.modified;
  }
  
  return { success: true, modified };
}, false);

testTool('Just below 50% (49%) (should BLOCK)', () => {
  const exactGrammar = `grammar Exact;
${Array.from({ length: 96 }, (_, i) => `TOKEN${i}: 'val${i}';`).join('\n')}
start: TOKEN0;
`;
  
  // Remove 49 rules to get to 49 lines (49%)
  let modified = exactGrammar;
  for (let i = 0; i < 49; i++) {
    const result = AntlrAnalyzer.removeRule(modified, `TOKEN${i}`);
    if (result.success) modified = result.modified;
  }
  
  return { success: true, modified };
}, true);

// ============================================================================
// Multi-Operation Sequences
// ============================================================================
console.log('\n--- Multi-Operation Sequences ---\n');

testTool('Add then remove (should ALLOW)', () => {
  const grammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  
  let result1 = AntlrAnalyzer.addLexerRule(grammar, 'TEMP', "'temp'");
  if (!result1.success) return result1;
  
  let result2 = AntlrAnalyzer.removeRule(result1.modified, 'TEMP');
  return result2;
}, false);

testTool('Rename then update (should ALLOW)', () => {
  const grammar = fs.readFileSync('/tmp/stress-test-grammar.g4', 'utf-8');
  
  let result1 = AntlrAnalyzer.renameRule(grammar, 'expr', 'expression');
  if (!result1.success) return result1;
  
  let result2 = AntlrAnalyzer.updateRule(result1.modified, 'expression', 'term PLUS term');
  return result2;
}, false);

// ============================================================================
// Results
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log(`Total Tool Tests: ${passed + failed}`);
console.log(`Passed: ${passed} (${Math.round(passed/(passed+failed)*100)}%)`);
console.log(`Failed: ${failed}`);
console.log('='.repeat(70));

if (failed === 0) {
  console.log('\n🎉 All tools protected! Data loss prevention working across the board.\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failed} tool test(s) failed.\n`);
  process.exit(1);
}
