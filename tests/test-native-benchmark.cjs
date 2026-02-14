#!/usr/bin/env node

/**
 * Test suite for native-benchmark and benchmark-parsing tools
 */

const assert = require('assert');
const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

console.log('\n=== Testing Benchmark Tools ===\n');

// Test 1: benchmarkParsing with simple grammar
test('benchmarkParsing works with simple grammar', () => {
  const grammar = `
    grammar Simple;
    start: 'hello' 'world';
    WS: [ \\t]+ -> skip;
  `;
  const input = 'hello world';
  const result = AntlrAnalyzer.benchmarkParsing(grammar, input, { iterations: 3 });
  assert.ok(result.success, 'Should succeed');
  assert.ok(result.metrics.totalTokens > 0, 'Should have tokens');
  assert.ok(result.metrics.avgTimeMs >= 0, 'Should have avg time');
});

// Test 2: benchmarkParsing handles invalid input
test('benchmarkParsing handles invalid input', () => {
  const grammar = `
    grammar Simple;
    start: 'hello';
  `;
  const input = 'goodbye';  // Won't match
  const result = AntlrAnalyzer.benchmarkParsing(grammar, input, { iterations: 3 });
  // Should still succeed (tokenization works) or fail gracefully
  assert.ok(typeof result.success === 'boolean', 'Should return success boolean');
});

// Test 3: benchmarkParsing metrics are reasonable
test('benchmarkParsing returns reasonable metrics', () => {
  const grammar = `
    grammar Test;
    start: expr EOF;
    expr: ID ('+' ID)*;
    ID: [a-z]+;
    WS: [ \\t]+ -> skip;
  `;
  const input = 'a + b + c + d + e';
  const result = AntlrAnalyzer.benchmarkParsing(grammar, input, { iterations: 5 });
  assert.ok(result.success, 'Should succeed');
  assert.ok(result.metrics.minTimeMs <= result.metrics.maxTimeMs, 'Min should be <= max');
  assert.ok(result.metrics.avgTimeMs >= result.metrics.minTimeMs, 'Avg should be >= min');
  assert.ok(result.metrics.avgTimeMs <= result.metrics.maxTimeMs, 'Avg should be <= max');
});

// Test 4: benchmarkParsing performance rating
test('benchmarkParsing returns valid performance rating', () => {
  const grammar = `
    grammar Test;
    start: 'x';
  `;
  const input = 'x';
  const result = AntlrAnalyzer.benchmarkParsing(grammar, input);
  const validRatings = ['excellent', 'good', 'fair', 'slow'];
  assert.ok(validRatings.includes(result.performanceRating), 'Should have valid rating');
});

// Test 5: benchmarkParsing with iterations parameter
test('benchmarkParsing respects iterations parameter', () => {
  const grammar = `
    grammar Test;
    start: NUMBER+;
    NUMBER: [0-9]+;
  `;
  const input = '12345';
  const result = AntlrAnalyzer.benchmarkParsing(grammar, input, { iterations: 7 });
  assert.strictEqual(result.metrics.iterations, 7, 'Should use specified iterations');
});

// Test 6: analyzeBottlenecks returns correct structure
test('analyzeBottlenecks returns correct structure', () => {
  const grammar = `
    grammar Test;
    start: a | b | c;
    a: 'a';
    b: 'b';
    c: 'c';
  `;
  const result = AntlrAnalyzer.analyzeBottlenecks(grammar);
  assert.ok(Array.isArray(result.bottlenecks), 'Should have bottlenecks array');
  assert.ok(typeof result.metrics.totalBottlenecks === 'number', 'Should have totalBottlenecks');
  assert.ok(typeof result.metrics.highSeverity === 'number', 'Should have highSeverity');
  assert.ok(result.metrics.estimatedImprovement, 'Should have estimatedImprovement');
  assert.ok(Array.isArray(result.recommendations), 'Should have recommendations array');
});

// Test 7: analyzeBottlenecks detects high branching
test('analyzeBottlenecks detects high branching', () => {
  const alternatives = Array.from({length: 60}, (_, i) => `r${i}`).join(' | ');
  const grammar = `
    grammar Test;
    big: ${alternatives};
    ${Array.from({length: 60}, (_, i) => `r${i}: 'x';`).join('\n')}
  `;
  const result = AntlrAnalyzer.analyzeBottlenecks(grammar);
  const highBranch = result.bottlenecks.find(b => b.type === 'high-branching' && b.severity === 'high');
  assert.ok(highBranch, 'Should detect high branching');
  assert.ok(highBranch.ruleName === 'big', 'Should identify correct rule');
});

// Test 8: analyzeBottlenecks severity ordering
test('analyzeBottlenecks orders by severity', () => {
  const grammar = `
    grammar Test;
    lexer grammar TestLexer;
    IF: 'if';
    IFS: 'ifs';
    big: ${Array.from({length: 30}, (_, i) => `a${i}`).join(' | ')};
    ${Array.from({length: 30}, (_, i) => `a${i}: 'x';`).join('\n')}
  `;
  const result = AntlrAnalyzer.analyzeBottlenecks(grammar);
  const severities = result.bottlenecks.map(b => b.severity);
  // Check that highs come before mediums, mediums before lows
  let lastLevel = 0;
  const levelMap = { high: 0, medium: 1, low: 2 };
  for (const sev of severities) {
    const level = levelMap[sev];
    assert.ok(level >= lastLevel, 'Should be ordered by severity');
    lastLevel = level;
  }
});

// Test 9: analyzeBottlenecks provides actionable suggestions
test('analyzeBottlenecks provides actionable suggestions', () => {
  const alternatives = Array.from({length: 55}, (_, i) => `r${i}`).join(' | ');
  const grammar = `
    grammar Test;
    big: ${alternatives};
    ${Array.from({length: 55}, (_, i) => `r${i}: 'x';`).join('\n')}
  `;
  const result = AntlrAnalyzer.analyzeBottlenecks(grammar);
  const highBranch = result.bottlenecks.find(b => b.type === 'high-branching' && b.severity === 'high');
  assert.ok(highBranch.suggestion.length > 10, 'Should have meaningful suggestion');
  assert.ok(highBranch.impact.length > 5, 'Should have impact description');
});

// Test 10: analyzeBottlenecks handles empty grammar gracefully
test('analyzeBottlenecks handles minimal grammar', () => {
  const grammar = `
    grammar Empty;
    start: ;
  `;
  const result = AntlrAnalyzer.analyzeBottlenecks(grammar);
  assert.ok(Array.isArray(result.bottlenecks), 'Should return bottlenecks array');
});

// Test 11: Orphan rule detection (via analyzeBottlenecks/check-style)
test('Orphan rules are detected correctly', () => {
  const grammar = `
    grammar Test;
    start: used;
    used: 'a';
    unused: 'b';
  `;
  const metrics = AntlrAnalyzer.calculateGrammarMetrics(grammar);
  assert.ok(metrics.dependencies.orphanRules.includes('unused'), 'Should detect unused rule');
  assert.ok(!metrics.dependencies.orphanRules.includes('used'), 'Should not flag used rule');
});

// Test 12: Comments don't create false rule references
test('Comments do not create false references', () => {
  const grammar = `
    grammar Test;
    // This references FakeRule in a comment
    start: 'x';
  `;
  const analysis = AntlrAnalyzer.analyze(grammar);
  const startRule = analysis.rules.find(r => r.name === 'start');
  assert.ok(!startRule.referencedRules.includes('FakeRule'), 'Should not extract references from comments');
});

// Summary
console.log('\n========================================');
console.log(`  Benchmark Tests: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
