/**
 * Test enhanced find-rule-usages with multi-file support
 */

// Clear require cache
delete require.cache[require.resolve('./dist/antlrAnalyzer.js')];

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;
let tempDir;

// Helper: assert
function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

// Helper: create temp file
function createTempFile(filename, content) {
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// Setup: create temp directory
function setup() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-mcp-test-'));
}

// Teardown: remove temp directory
function teardown() {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
}

// Test runner
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

console.log('Starting find-rule-usages tests...\n');

setup();

try {
  // Test 1: Find usages in simple grammar
  runTest('Test 1: Find usages in simple grammar', () => {
    const grammar = `grammar Test;

start: expression;

expression
  : ID
  | NUMBER
  | expression '+' expression
  ;

ID: [a-z]+;
NUMBER: [0-9]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'expression');
    
    assert(usages.count === 3, `Expected 3 usages, got ${usages.count}`);
    assert(usages.locations.length === 3, 'Should have 3 locations');
    
    // Check that definition line is excluded
    const defLine = usages.locations.find(l => l.context.includes('expression:'));
    assert(defLine === undefined, 'Should not include definition line');
  });

  // Test 2: Find usages with context
  runTest('Test 2: Find usages with rule context', () => {
    const grammar = `grammar Test;

start: a b;

a: ID;
b: ID;

ID: [a-z]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'ID');
    
    assert(usages.count === 2, `Expected 2 usages, got ${usages.count}`);
    
    // Check context information
    const inA = usages.locations.find(l => l.inRule === 'a');
    const inB = usages.locations.find(l => l.inRule === 'b');
    
    assert(inA !== undefined, 'Should find usage in rule a');
    assert(inB !== undefined, 'Should find usage in rule b');
  });

  // Test 3: Find lexer token usages
  runTest('Test 3: Find lexer token usages', () => {
    const grammar = `grammar Test;

expression
  : ID
  | PLUS ID
  ;

ID: [a-z]+;
PLUS: '+';
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'ID');
    
    assert(usages.count === 2, `Expected 2 usages, got ${usages.count}`);
    // At least one usage should have context
    assert(usages.locations.length === 2, 'Should have 2 locations');
  });

  // Test 4: Unused rule detection
  runTest('Test 4: Unused rule detection', () => {
    const grammar = `grammar Test;

start: a;

a: ID;
b: NUMBER;  // unused

ID: [a-z]+;
NUMBER: [0-9]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'b');
    
    assert(usages.count === 0, 'Unused rule should have 0 usages');
  });

  // Test 5: Multi-file usage search
  runTest('Test 5: Multi-file usage search', () => {
    const baseGrammar = `grammar Base;

baseRule: ID;

ID: [a-z]+;
`;

    const mainGrammar = `grammar Main;
import Base;

mainRule: baseRule NUMBER;

NUMBER: [0-9]+;
`;

    const baseFile = createTempFile('Base.g4', baseGrammar);
    const mainFile = createTempFile('Main.g4', mainGrammar);

    // Load with imports
    const analysis = AntlrAnalyzer.loadGrammarWithImports(mainFile, tempDir);
    
    // Reconstruct for searching
    const lines = [];
    for (const rule of analysis.rules) {
      lines.push(rule.definition);
      lines.push('');
    }
    const mergedGrammar = lines.join('\n');
    
    // Find usages of ID (from Base grammar)
    const idUsages = AntlrAnalyzer.findRuleUsages(mergedGrammar, 'ID');
    assert(idUsages.count >= 1, 'Should find ID usage from imported grammar');
    
    // Find usages of baseRule (should be in mainRule)
    const baseRuleUsages = AntlrAnalyzer.findRuleUsages(mergedGrammar, 'baseRule');
    assert(baseRuleUsages.count >= 1, 'Should find baseRule usage in mainRule');
  });

  // Test 6: Skip comments
  runTest('Test 6: Skip comment lines', () => {
    const grammar = `grammar Test;

// This is a comment with expression mentioned
start: expression;

expression: ID;

ID: [a-z]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'expression');
    
    // Should only find usage in start rule, not in comment
    assert(usages.count === 1, `Expected 1 usage (not comment), got ${usages.count}`);
  });

  // Test 7: Whole word matching
  runTest('Test 7: Whole word matching', () => {
    const grammar = `grammar Test;

expression: ID;
subexpression: ID;

ID: [a-z]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'expression');
    
    // Should not match 'subexpression'
    assert(usages.count === 0, 'Should only match whole word, not subexpression');
  });

  // Test 8: Multiple usages in one rule
  runTest('Test 8: Multiple usages in one rule', () => {
    const grammar = `grammar Test;

expression
  : ID
  | NUMBER
  | expression '+' expression
  | expression '*' expression
  ;

ID: [a-z]+;
NUMBER: [0-9]+;
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'expression');
    
    // Should find at least 3 usages (may vary based on line detection)
    assert(usages.count >= 3, `Expected at least 3 usages, got ${usages.count}`);
  });

  // Test 9: Fragment rule usage
  runTest('Test 9: Fragment rule usage', () => {
    const grammar = `grammar Test;

ID: LETTER+;

fragment LETTER: [a-z];
`;

    const usages = AntlrAnalyzer.findRuleUsages(grammar, 'LETTER');
    
    // Should find at least one usage
    assert(usages.count >= 1, `Should find at least one usage, got ${usages.count}`);
  });

  // Test 10: Case sensitivity
  runTest('Test 10: Case-sensitive matching', () => {
    const grammar = `grammar Test;

Expression: ID;
expression: ID;

ID: [a-z]+;
`;

    const usagesLower = AntlrAnalyzer.findRuleUsages(grammar, 'expression');
    const usagesUpper = AntlrAnalyzer.findRuleUsages(grammar, 'Expression');
    
    assert(usagesLower.count === 0, 'expression (lower) should have 0 usages');
    assert(usagesUpper.count === 0, 'Expression (upper) should have 0 usages');
  });

} finally {
  teardown();
}

console.log('\n==================================================');
console.log(`Tests passed: ${passed}/${passed + failed}`);
console.log(`Tests failed: ${failed}/${passed + failed}`);

if (failed === 0) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed');
  process.exit(1);
}
