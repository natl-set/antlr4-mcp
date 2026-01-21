/**
 * Test test-parser-rule with multi-file grammar support
 */

// Clear require cache to ensure fresh module load
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

console.log('Starting test-parser-rule multi-file tests...\n');

setup();

try {
  // Test 1: Parser grammar with tokenVocab
  runTest('Test 1: Parser grammar with lexer vocabulary', () => {
    const lexerGrammar = `lexer grammar MyLexer;
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
WS: [ \\t\\r\\n]+ -> skip;
`;

    const parserGrammar = `parser grammar MyParser;
options { tokenVocab=MyLexer; }

expression
  : ID
  | NUMBER
  | expression PLUS expression
  ;
`;

    const lexerFile = createTempFile('MyLexer.g4', lexerGrammar);
    const parserFile = createTempFile('MyParser.g4', parserGrammar);

    // Load with imports
    const analysis = AntlrAnalyzer.loadGrammarWithImports(parserFile, tempDir);
    
    // Verify lexer tokens are loaded
    const lexerRules = analysis.rules.filter(r => r.type === 'lexer');
    assert(lexerRules.length > 0, 'Should load lexer rules from tokenVocab');
    
    const idToken = lexerRules.find(r => r.name === 'ID');
    assert(idToken !== undefined, 'Should find ID token from lexer');
  });

  // Test 2: Grammar with imports
  runTest('Test 2: Grammar with imports', () => {
    const baseGrammar = `grammar Base;

baseRule
  : ID
  ;

ID: [a-z]+;
`;

    const mainGrammar = `grammar Main;
import Base;

mainRule
  : baseRule
  | NUMBER
  ;

NUMBER: [0-9]+;
`;

    const baseFile = createTempFile('Base.g4', baseGrammar);
    const mainFile = createTempFile('Main.g4', mainGrammar);

    // Load with imports
    const analysis = AntlrAnalyzer.loadGrammarWithImports(mainFile, tempDir);
    
    // Verify imported rules are loaded
    const parserRules = analysis.rules.filter(r => r.type === 'parser');
    const baseRule = parserRules.find(r => r.name === 'baseRule');
    assert(baseRule !== undefined, 'Should load imported baseRule');
    
    const mainRule = parserRules.find(r => r.name === 'mainRule');
    assert(mainRule !== undefined, 'Should have mainRule from main grammar');
  });

  // Test 3: Test parser rule with loaded imports
  runTest('Test 3: Test parser rule with merged grammar', () => {
    const lexerGrammar = `lexer grammar TestLexer;
HELLO: 'hello';
WORLD: 'world';
WS: [ \\t\\r\\n]+ -> skip;
`;

    const parserGrammar = `parser grammar TestParser;
options { tokenVocab=TestLexer; }

greeting
  : HELLO WORLD
  ;
`;

    const lexerFile = createTempFile('TestLexer.g4', lexerGrammar);
    const parserFile = createTempFile('TestParser.g4', parserGrammar);

    // Use the new multi-file API
    const result = AntlrAnalyzer.testParserRule('', 'greeting', 'hello world', {
      fromFile: parserFile,
      basePath: tempDir,
      loadImports: true
    });
    
    assert(result.success === true, `Should succeed: ${result.message}`);
    assert(result.matched === true, `Result should have matched=true: ${result.message}`);
  });

  // Test 4: Multi-level imports
  runTest('Test 4: Multi-level transitive imports', () => {
    const level1Grammar = `grammar Level1;

level1Rule
  : ID
  ;

ID: [a-z]+;
`;

    const level2Grammar = `grammar Level2;
import Level1;

level2Rule
  : level1Rule
  | NUMBER
  ;

NUMBER: [0-9]+;
`;

    const level3Grammar = `grammar Level3;
import Level2;

level3Rule
  : level2Rule
  | WORD
  ;

WORD: [A-Z]+;
`;

    const level1File = createTempFile('Level1.g4', level1Grammar);
    const level2File = createTempFile('Level2.g4', level2Grammar);
    const level3File = createTempFile('Level3.g4', level3Grammar);

    // Load with transitive imports
    const analysis = AntlrAnalyzer.loadGrammarWithImports(level3File, tempDir);
    
    // Verify all rules are loaded
    const parserRules = analysis.rules.filter(r => r.type === 'parser');
    const level1Rule = parserRules.find(r => r.name === 'level1Rule');
    const level2Rule = parserRules.find(r => r.name === 'level2Rule');
    const level3Rule = parserRules.find(r => r.name === 'level3Rule');
    
    assert(level1Rule !== undefined, 'Should load level1Rule from transitive import');
    assert(level2Rule !== undefined, 'Should load level2Rule');
    assert(level3Rule !== undefined, 'Should load level3Rule');
    
    // Verify all tokens are loaded
    const lexerRules = analysis.rules.filter(r => r.type === 'lexer');
    const idToken = lexerRules.find(r => r.name === 'ID');
    const numberToken = lexerRules.find(r => r.name === 'NUMBER');
    const wordToken = lexerRules.find(r => r.name === 'WORD');
    
    assert(idToken !== undefined, 'Should load ID token from level 1');
    assert(numberToken !== undefined, 'Should load NUMBER token from level 2');
    assert(wordToken !== undefined, 'Should load WORD token from level 3');
  });

  // Test 5: Parser grammar with lexer in imports subdirectory
  runTest('Test 5: Parser grammar with lexer in imports subdirectory', () => {
    const importsDir = path.join(tempDir, 'imports');
    fs.mkdirSync(importsDir, { recursive: true });
    
    const lexerGrammar = `lexer grammar SubLexer;
TOKEN: 'token';
`;

    const parserGrammar = `parser grammar SubParser;
options { tokenVocab=SubLexer; }

rule
  : TOKEN
  ;
`;

    const lexerFile = path.join(importsDir, 'SubLexer.g4');
    fs.writeFileSync(lexerFile, lexerGrammar, 'utf8');
    
    const parserFile = createTempFile('SubParser.g4', parserGrammar);

    // Load with imports (should search imports/ subdirectory)
    const analysis = AntlrAnalyzer.loadGrammarWithImports(parserFile, tempDir);
    
    // Verify lexer is found in imports subdirectory
    const lexerRules = analysis.rules.filter(r => r.type === 'lexer');
    const token = lexerRules.find(r => r.name === 'TOKEN');
    assert(token !== undefined, 'Should find TOKEN from lexer in imports subdirectory');
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
