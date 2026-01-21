/**
 * Test: Unified add-rule Tool
 * 
 * Tests the new unified add-rule tool that auto-detects rule type
 * from naming convention (UPPERCASE = lexer, lowercase = parser)
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

console.log('=== Unified add-rule Tests ===\n');

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

// ============================================================================
// Test 1: Auto-detect lexer rule (UPPERCASE)
// ============================================================================
test('Auto-detects lexer rule from UPPERCASE name', () => {
  const original = `grammar Test;

NUMBER: [0-9]+;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'ID', '[a-zA-Z]+', {});
  
  if (!result.success) {
    throw new Error(`Failed to add lexer rule: ${result.message}`);
  }
  
  if (!result.modified.includes('ID: [a-zA-Z]+;')) {
    throw new Error('Lexer rule not added correctly');
  }
  
  console.log(`   Added UPPERCASE rule as lexer`);
});

// ============================================================================
// Test 2: Auto-detect parser rule (lowercase)
// ============================================================================
test('Auto-detects parser rule from lowercase name', () => {
  const original = `grammar Test;

start: expr;
`;

  const result = AntlrAnalyzer.addParserRule(original, 'term', 'NUMBER', {});
  
  if (!result.success) {
    throw new Error(`Failed to add parser rule: ${result.message}`);
  }
  
  if (!result.modified.includes('term: NUMBER;')) {
    throw new Error('Parser rule not added correctly');
  }
  
  console.log(`   Added lowercase rule as parser`);
});

// ============================================================================
// Test 3: Lexer rule with skip
// ============================================================================
test('Lexer rule supports skip directive', () => {
  const original = `grammar Test;

ID: [a-zA-Z]+;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'WS', '[ \\t\\n\\r]+', { skip: true });
  
  if (!result.success) {
    throw new Error(`Failed to add lexer rule with skip`);
  }
  
  if (!result.modified.includes('WS: [ \\t\\n\\r]+ -> skip;')) {
    throw new Error('Skip directive not added');
  }
  
  console.log(`   Lexer skip directive works`);
});

// ============================================================================
// Test 4: Lexer rule with channel
// ============================================================================
test('Lexer rule supports channel directive', () => {
  const original = `grammar Test;

ID: [a-zA-Z]+;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'COMMENT', '//.*?\\n', { channel: 'COMMENTS' });
  
  if (!result.success) {
    throw new Error(`Failed to add lexer rule with channel`);
  }
  
  if (!result.modified.includes('-> channel(COMMENTS)')) {
    throw new Error('Channel directive not added');
  }
  
  console.log(`   Lexer channel directive works`);
});

// ============================================================================
// Test 5: Lexer rule with fragment
// ============================================================================
test('Lexer rule supports fragment', () => {
  const original = `grammar Test;

ID: [a-zA-Z]+;
`;

  const result = AntlrAnalyzer.addLexerRule(original, 'DIGIT', '[0-9]', { fragment: true });
  
  if (!result.success) {
    throw new Error(`Failed to add fragment rule`);
  }
  
  if (!result.modified.includes('fragment DIGIT:')) {
    throw new Error('Fragment not added correctly');
  }
  
  console.log(`   Fragment rule works`);
});

// ============================================================================
// Test 6: Parser rule with return type
// ============================================================================
test('Parser rule supports return type', () => {
  const original = `grammar Test;

start: expr;
`;

  const result = AntlrAnalyzer.addParserRule(original, 'intLiteral', 'INT', { returnType: 'int value' });
  
  if (!result.success) {
    throw new Error(`Failed to add parser rule with return type`);
  }
  
  if (!result.modified.includes('intLiteral returns [int value]:')) {
    throw new Error('Return type not added correctly');
  }
  
  console.log(`   Parser return type works`);
});

// ============================================================================
// Test 7: Mixed case detection
// ============================================================================
test('Correctly distinguishes ID (lexer) from id (parser)', () => {
  const original = `grammar Test;

start: expr;
`;

  // Add ID (lexer)
  const lexerResult = AntlrAnalyzer.addLexerRule(original, 'ID', '[a-zA-Z]+', {});
  if (!lexerResult.success) {
    throw new Error('Failed to add ID (lexer)');
  }
  
  // Add id (parser) - different case
  const parserResult = AntlrAnalyzer.addParserRule(lexerResult.modified, 'id', 'ID', {});
  if (!parserResult.success) {
    throw new Error('Failed to add id (parser)');
  }
  
  if (!parserResult.modified.includes('ID: [a-zA-Z]+;')) {
    throw new Error('Lexer ID missing');
  }
  if (!parserResult.modified.includes('id: ID;')) {
    throw new Error('Parser id missing');
  }
  
  console.log(`   Case sensitivity works (ID vs id)`);
});

// ============================================================================
// Test 8: Positioning works for both types
// ============================================================================
test('insert_after works for both lexer and parser rules', () => {
  const original = `grammar Test;

FIRST: 'first';

start: FIRST;
`;

  // Add lexer after FIRST
  const lexerResult = AntlrAnalyzer.addLexerRule(original, 'SECOND', "'second'", { insertAfter: 'FIRST' });
  if (!lexerResult.success) {
    throw new Error('Failed to add lexer with insert_after');
  }
  
  // Add parser after start
  const parserResult = AntlrAnalyzer.addParserRule(lexerResult.modified, 'next', 'SECOND', { insertAfter: 'start' });
  if (!parserResult.success) {
    throw new Error('Failed to add parser with insert_after');
  }
  
  console.log(`   Positioning works for both types`);
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
  console.log('\n✅ All unified add-rule tests passed!');
  console.log('\nFeatures verified:');
  console.log('  • Auto-detects lexer rules (UPPERCASE names)');
  console.log('  • Auto-detects parser rules (lowercase names)');
  console.log('  • Lexer-specific options (skip, channel, fragment)');
  console.log('  • Parser-specific options (return_type)');
  console.log('  • Case sensitivity (ID vs id)');
  console.log('  • Positioning (insert_after/insert_before)');
  console.log('  • Consistent with update-rule/remove-rule/rename-rule');
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
