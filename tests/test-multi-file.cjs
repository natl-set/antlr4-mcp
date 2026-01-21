#!/usr/bin/env node

/**
 * Test multi-file grammar support
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    if (details) console.log(`   ${details}`);
    failCount++;
  }
}

// Create temporary directory for test files
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr-test-'));

function cleanup() {
  try {
    fs.rmSync(testDir, { recursive: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

function runTests() {
  console.log('Starting multi-file grammar tests...\n');

  try {
    // Test 1: Parse imports
    console.log('Test 1: Parse import statements');
    const grammarWithImports = `grammar Test;
import Common, Tokens;
import Extra;

expr: term;
`;
    const imports = AntlrAnalyzer.parseImports(grammarWithImports);
    assert(
      imports.length === 3 && imports.includes('Common') && imports.includes('Tokens') && imports.includes('Extra'),
      'Should parse all imports',
      `Got: ${JSON.stringify(imports)}`
    );

    // Test 2: Parse tokenVocab
    console.log('\nTest 2: Parse tokenVocab option');
    const grammarWithVocab = `parser grammar Test;
options {
    tokenVocab = MyLexer;
}

expr: term;
`;
    const vocab = AntlrAnalyzer.parseTokenVocab(grammarWithVocab);
    assert(
      vocab === 'MyLexer',
      'Should extract tokenVocab name',
      `Got: ${vocab}`
    );

    // Test 3: Simple import resolution
    console.log('\nTest 3: Load grammar with imports');
    
    // Create test files
    const mainGrammar = `grammar Main;
import Common;

expr: term PLUS term;
`;
    
    const commonGrammar = `grammar Common;

term: NUMBER | ID;
NUMBER: [0-9]+;
ID: [a-z]+;
`;
    
    const mainPath = path.join(testDir, 'Main.g4');
    const commonPath = path.join(testDir, 'Common.g4');
    
    fs.writeFileSync(mainPath, mainGrammar);
    fs.writeFileSync(commonPath, commonGrammar);
    
    const analysis = AntlrAnalyzer.loadGrammarWithImports(mainPath, testDir);
    
    assert(
      analysis.rules.length >= 2,
      'Should include rules from both files',
      `Got ${analysis.rules.length} rules: ${analysis.rules.map(r => r.name).join(', ')}`
    );
    
    const hasExpr = analysis.rules.some(r => r.name === 'expr');
    const hasTerm = analysis.rules.some(r => r.name === 'term');
    
    assert(
      hasExpr && hasTerm,
      'Should have both expr and term rules',
      `hasExpr: ${hasExpr}, hasTerm: ${hasTerm}`
    );

    // Test 4: TokenVocab resolution
    console.log('\nTest 4: Load parser grammar with tokenVocab');
    
    const parserGrammar = `parser grammar MyParser;
options {
    tokenVocab = MyLexer;
}

expr: term;
term: NUMBER;
`;
    
    const lexerGrammar = `lexer grammar MyLexer;

NUMBER: [0-9]+;
PLUS: '+';
WS: [ \\t\\r\\n]+ -> skip;
`;
    
    const parserPath = path.join(testDir, 'MyParser.g4');
    const lexerPath = path.join(testDir, 'MyLexer.g4');
    
    fs.writeFileSync(parserPath, parserGrammar);
    fs.writeFileSync(lexerPath, lexerGrammar);
    
    const analysis2 = AntlrAnalyzer.loadGrammarWithImports(parserPath, testDir);
    
    const hasNumber = analysis2.rules.some(r => r.name === 'NUMBER');
    const hasPlus = analysis2.rules.some(r => r.name === 'PLUS');
    
    assert(
      hasNumber && hasPlus,
      'Should load lexer rules from tokenVocab',
      `hasNumber: ${hasNumber}, hasPlus: ${hasPlus}`
    );

    // Test 5: Transitive imports (A imports B, B imports C)
    console.log('\nTest 5: Transitive imports');
    
    const grammarA = `grammar A;
import B;

a: b;
`;
    
    const grammarB = `grammar B;
import C;

b: c;
`;
    
    const grammarC = `grammar C;

c: ID;
ID: [a-z]+;
`;
    
    const pathA = path.join(testDir, 'A.g4');
    const pathB = path.join(testDir, 'B.g4');
    const pathC = path.join(testDir, 'C.g4');
    
    fs.writeFileSync(pathA, grammarA);
    fs.writeFileSync(pathB, grammarB);
    fs.writeFileSync(pathC, grammarC);
    
    const analysis3 = AntlrAnalyzer.loadGrammarWithImports(pathA, testDir);
    
    const hasA = analysis3.rules.some(r => r.name === 'a');
    const hasB = analysis3.rules.some(r => r.name === 'b');
    const hasC = analysis3.rules.some(r => r.name === 'c');
    const hasID = analysis3.rules.some(r => r.name === 'ID');
    
    assert(
      hasA && hasB && hasC && hasID,
      'Should resolve transitive imports',
      `hasA: ${hasA}, hasB: ${hasB}, hasC: ${hasC}, hasID: ${hasID}`
    );

    // Test 6: Circular import detection
    console.log('\nTest 6: Circular import detection');
    
    const grammarX = `grammar X;
import Y;

x: y;
`;
    
    const grammarY = `grammar Y;
import X;

y: x;
`;
    
    const pathX = path.join(testDir, 'X.g4');
    const pathY = path.join(testDir, 'Y.g4');
    
    fs.writeFileSync(pathX, grammarX);
    fs.writeFileSync(pathY, grammarY);
    
    const analysis4 = AntlrAnalyzer.loadGrammarWithImports(pathX, testDir);
    
    const hasCircularWarning = analysis4.issues.some(i => 
      i.message.includes('Circular import') || i.message.includes('circular')
    );
    
    assert(
      hasCircularWarning,
      'Should detect circular imports',
      `Issues: ${analysis4.issues.map(i => i.message).join(', ')}`
    );

    // Test 7: Missing import handling
    console.log('\nTest 7: Missing import warning');
    
    const grammarWithMissing = `grammar Test;
import NonExistent;

rule: ID;
`;
    
    const testPath = path.join(testDir, 'Test.g4');
    fs.writeFileSync(testPath, grammarWithMissing);
    
    const analysis5 = AntlrAnalyzer.loadGrammarWithImports(testPath, testDir);
    
    const hasMissingWarning = analysis5.issues.some(i => 
      i.message.includes('Cannot resolve import')
    );
    
    assert(
      hasMissingWarning,
      'Should warn about missing imports',
      `Issues: ${analysis5.issues.map(i => i.message).join(', ')}`
    );

  } finally {
    cleanup();
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests passed: ${passCount}/${passCount + failCount}`);
  console.log(`Tests failed: ${failCount}/${passCount + failCount}`);
  
  if (failCount === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests();
