#!/usr/bin/env node

/**
 * Test lexer mode support
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');
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
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr-test-modes-'));

function cleanup() {
  try {
    fs.rmSync(testDir, { recursive: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

function runTests() {
  console.log('Starting lexer mode tests...\n');

  try {
    // Test 1: Parse mode declarations
    console.log('Test 1: Parse mode declarations');
    const grammarWithModes = `lexer grammar TestLexer;

STRING_START : '"' -> pushMode(STRING_MODE);
ID : [a-zA-Z]+;
WS : [ \\t]+ -> skip;

mode STRING_MODE;
STRING_CONTENT : [^"]+;
STRING_END : '"' -> popMode;

mode COMMENT_MODE;
COMMENT_CONTENT : [*]+;
`;
    const analysis = AntlrAnalyzer.analyze(grammarWithModes);
    assert(
      analysis.modes.length === 3,
      'Should detect 3 modes (DEFAULT_MODE, STRING_MODE, COMMENT_MODE)',
      `Got ${analysis.modes.length} modes: ${analysis.modes.map(m => m.name).join(', ')}`
    );

    // Test 2: Track rules per mode
    console.log('\nTest 2: Track rules per mode');
    const defaultMode = analysis.modes.find(m => m.name === 'DEFAULT_MODE');
    const stringMode = analysis.modes.find(m => m.name === 'STRING_MODE');
    const commentMode = analysis.modes.find(m => m.name === 'COMMENT_MODE');

    assert(
      defaultMode && defaultMode.rules.includes('STRING_START') && defaultMode.rules.includes('ID'),
      'DEFAULT_MODE should have STRING_START and ID',
      `Got: ${defaultMode?.rules.join(', ')}`
    );

    assert(
      stringMode && stringMode.rules.includes('STRING_CONTENT') && stringMode.rules.includes('STRING_END'),
      'STRING_MODE should have STRING_CONTENT and STRING_END',
      `Got: ${stringMode?.rules.join(', ')}`
    );

    // Test 3: Rules have mode property
    console.log('\nTest 3: Lexer rules should have mode property');
    const stringStartRule = analysis.rules.find(r => r.name === 'STRING_START');
    const stringContentRule = analysis.rules.find(r => r.name === 'STRING_CONTENT');

    assert(
      stringStartRule && stringStartRule.mode === 'DEFAULT_MODE',
      'STRING_START should belong to DEFAULT_MODE',
      `Got mode: ${stringStartRule?.mode}`
    );

    assert(
      stringContentRule && stringContentRule.mode === 'STRING_MODE',
      'STRING_CONTENT should belong to STRING_MODE',
      `Got mode: ${stringContentRule?.mode}`
    );

    // Test 4: analyzeLexerModes
    console.log('\nTest 4: analyzeLexerModes method');
    const modesAnalysis = AntlrAnalyzer.analyzeLexerModes(grammarWithModes);

    assert(
      modesAnalysis.modes.length === 3,
      'Should analyze 3 modes',
      `Got: ${modesAnalysis.modes.length}`
    );

    assert(
      modesAnalysis.entryPoints.length >= 1,
      'Should find entry points',
      `Got: ${modesAnalysis.entryPoints.map(e => e.action).join(', ')}`
    );

    assert(
      modesAnalysis.exitPoints.length >= 1,
      'Should find exit points',
      `Got: ${modesAnalysis.exitPoints.map(e => e.action).join(', ')}`
    );

    // Test 5: analyzeModeTransitions
    console.log('\nTest 5: analyzeModeTransitions method');
    const transitionsAnalysis = AntlrAnalyzer.analyzeModeTransitions(grammarWithModes);

    assert(
      transitionsAnalysis.transitions.length >= 1,
      'Should find mode transitions',
      `Got ${transitionsAnalysis.transitions.length} transitions`
    );

    // Test 6: Detect undefined mode reference
    console.log('\nTest 6: Detect undefined mode reference');
    const grammarWithUndefinedMode = `lexer grammar Test;
START : '{' -> pushMode(UNDEFINED_MODE);
`;
    const undefinedAnalysis = AntlrAnalyzer.analyzeLexerModes(grammarWithUndefinedMode);
    const hasUndefinedError = undefinedAnalysis.issues.some(
      i => i.type === 'error' && i.message.includes('UNDEFINED_MODE')
    );
    assert(
      hasUndefinedError,
      'Should detect pushMode to undefined mode',
      `Issues: ${undefinedAnalysis.issues.map(i => i.message).join(', ')}`
    );

    // Test 7: Detect mode with no entry points
    console.log('\nTest 7: Detect mode with no entry points');
    const grammarWithUnreachableMode = `lexer grammar Test;
ID : [a-z]+;

mode UNREACHABLE;
SOMETHING : 'x';
`;
    const unreachableAnalysis = AntlrAnalyzer.analyzeLexerModes(grammarWithUnreachableMode);
    const hasUnreachableWarning = unreachableAnalysis.issues.some(
      i => i.type === 'warning' && i.message.includes('no entry points')
    );
    assert(
      hasUnreachableWarning,
      'Should warn about unreachable mode',
      `Issues: ${unreachableAnalysis.issues.map(i => i.message).join(', ')}`
    );

    // Test 8: addLexerMode
    console.log('\nTest 8: addLexerMode method');
    const simpleGrammar = `lexer grammar Simple;
ID : [a-z]+;
NUMBER : [0-9]+;
`;
    const addResult = AntlrAnalyzer.addLexerMode(simpleGrammar, 'NEW_MODE');
    assert(
      addResult.success,
      'Should successfully add mode',
      addResult.message
    );
    assert(
      addResult.grammar.includes('mode NEW_MODE;'),
      'Result should contain mode declaration',
      `Grammar includes: ${addResult.grammar.includes('mode NEW_MODE;')}`
    );

    // Test 9: addRuleToMode
    console.log('\nTest 9: addRuleToMode method');
    const grammarWithAMode = `lexer grammar Test;
ID : [a-z]+;

mode SPECIAL;
SPECIAL_TOKEN : 'special';
`;
    const addRuleResult = AntlrAnalyzer.addRuleToMode(
      grammarWithAMode,
      'NEW_TOKEN',
      "'new'",
      'SPECIAL'
    );
    assert(
      addRuleResult.success,
      'Should successfully add rule to mode',
      addRuleResult.message
    );
    assert(
      addRuleResult.grammar.includes("NEW_TOKEN : 'new';"),
      'Result should contain new rule',
      `Grammar contains: ${addRuleResult.grammar}`
    );

    // Test 10: addRuleToMode with action
    console.log('\nTest 10: addRuleToMode with action');
    const addWithActionResult = AntlrAnalyzer.addRuleToMode(
      grammarWithAMode,
      'PUSH_TOKEN',
      "'push'",
      'DEFAULT_MODE',
      { action: 'pushMode(SPECIAL)' }
    );
    assert(
      addWithActionResult.success,
      'Should successfully add rule with action',
      addWithActionResult.message
    );
    assert(
      addWithActionResult.grammar.includes('pushMode(SPECIAL)'),
      'Result should contain pushMode action',
      `Grammar contains: ${addWithActionResult.grammar}`
    );

    // Test 11: Prevent duplicate mode
    console.log('\nTest 11: Prevent duplicate mode');
    const duplicateResult = AntlrAnalyzer.addLexerMode(grammarWithAMode, 'SPECIAL');
    assert(
      !duplicateResult.success,
      'Should fail to add duplicate mode',
      duplicateResult.message
    );

    // Test 12: Parser rules don't have mode
    console.log('\nTest 12: Parser rules should not have mode property');
    const combinedGrammar = `grammar Combined;
expr : ID | NUMBER;
ID : [a-zA-Z]+;
NUMBER : [0-9]+;

mode STRING;
STRING_START : '"';
`;
    const combinedAnalysis = AntlrAnalyzer.analyze(combinedGrammar);
    const exprRule = combinedAnalysis.rules.find(r => r.name === 'expr');
    assert(
      exprRule && !exprRule.mode,
      'Parser rule should not have mode',
      `expr mode: ${exprRule?.mode}`
    );

    // Test 13: moveRuleToMode
    console.log('\nTest 13: moveRuleToMode method');
    const grammarToMove = `lexer grammar Test;
ID : [a-z]+;
STRING_START : '"' -> pushMode(STRING);

mode STRING;
STRING_CONTENT : [^"]+;
`;
    const moveResult = AntlrAnalyzer.moveRuleToMode(grammarToMove, 'ID', 'STRING');
    assert(
      moveResult.success,
      'Should successfully move rule to mode',
      moveResult.message
    );

    // Test 14: moveRuleToMode - rule already in target mode
    console.log('\nTest 14: moveRuleToMode - rule already in target mode');
    const alreadyInModeResult = AntlrAnalyzer.moveRuleToMode(grammarToMove, 'STRING_CONTENT', 'STRING');
    assert(
      !alreadyInModeResult.success,
      'Should fail when rule is already in target mode',
      alreadyInModeResult.message
    );

    // Test 15: listModeRules
    console.log('\nTest 15: listModeRules method');
    const listResult = AntlrAnalyzer.listModeRules(grammarWithModes, 'STRING_MODE');
    assert(
      listResult.success,
      'Should successfully list mode rules',
      listResult.message
    );
    assert(
      listResult.rules.length === 2,
      'STRING_MODE should have 2 rules',
      `Got: ${listResult.rules.length}`
    );

    // Test 16: listModeRules - mode not found
    console.log('\nTest 16: listModeRules - mode not found');
    const listNotFoundResult = AntlrAnalyzer.listModeRules(grammarWithModes, 'NONEXISTENT');
    assert(
      !listNotFoundResult.success,
      'Should fail for non-existent mode',
      listNotFoundResult.message
    );

    // Test 17: duplicateMode
    console.log('\nTest 17: duplicateMode method');
    const grammarToDuplicate = `lexer grammar Test;
ID : [a-z]+;
STRING_START : '"' -> pushMode(STRING);

mode STRING;
STRING_CONTENT : [^"]+;
STRING_END : '"' -> popMode;
`;
    const duplicateModeResult = AntlrAnalyzer.duplicateMode(grammarToDuplicate, 'STRING', 'TEMPLATE');
    assert(
      duplicateModeResult.success,
      'Should successfully duplicate mode',
      duplicateModeResult.message
    );
    assert(
      duplicateModeResult.grammar.includes('mode TEMPLATE;'),
      'Result should contain new mode declaration',
      `Grammar: ${duplicateModeResult.grammar}`
    );

    // Test 18: duplicateMode with prefix
    console.log('\nTest 18: duplicateMode with prefix');
    const duplicateWithPrefixResult = AntlrAnalyzer.duplicateMode(
      grammarToDuplicate,
      'STRING',
      'INTERPOLATION',
      { prefixRules: 'INTERP_' }
    );
    assert(
      duplicateWithPrefixResult.success,
      'Should successfully duplicate mode with prefix',
      duplicateWithPrefixResult.message
    );
    assert(
      duplicateWithPrefixResult.grammar.includes('INTERP_STRING_CONTENT'),
      'Result should contain prefixed rule names',
      `Grammar includes INTERP_: ${duplicateWithPrefixResult.grammar.includes('INTERP_')}`
    );

    // Test 19: createGrammarTemplate - lexer
    console.log('\nTest 19: createGrammarTemplate - lexer');
    const templateResult = AntlrAnalyzer.createGrammarTemplate('MyLexer', {
      type: 'lexer',
      modes: ['STRING_MODE', 'COMMENT_MODE'],
      includeBoilerplate: true
    });
    assert(
      templateResult.success,
      'Should successfully create lexer template',
      templateResult.message
    );
    assert(
      templateResult.grammar.includes('lexer grammar MyLexer;'),
      'Should contain lexer grammar declaration',
      `Grammar: ${templateResult.grammar}`
    );
    assert(
      templateResult.grammar.includes('mode STRING_MODE;'),
      'Should contain STRING_MODE declaration',
      `Grammar: ${templateResult.grammar}`
    );

    // Test 20: createGrammarTemplate - combined
    console.log('\nTest 20: createGrammarTemplate - combined');
    const combinedTemplateResult = AntlrAnalyzer.createGrammarTemplate('Calculator', {
      type: 'combined',
      includeBoilerplate: true
    });
    assert(
      combinedTemplateResult.success,
      'Should successfully create combined template',
      combinedTemplateResult.message
    );
    assert(
      combinedTemplateResult.grammar.includes('grammar Calculator;'),
      'Should contain combined grammar declaration',
      `Grammar: ${combinedTemplateResult.grammar}`
    );
    assert(
      combinedTemplateResult.grammar.includes('program:'),
      'Should contain parser rules',
      `Grammar: ${combinedTemplateResult.grammar}`
    );

    // Test 21: createGrammarTemplate - without boilerplate
    console.log('\nTest 21: createGrammarTemplate - without boilerplate');
    const minimalTemplateResult = AntlrAnalyzer.createGrammarTemplate('Minimal', {
      type: 'lexer',
      includeBoilerplate: false
    });
    assert(
      minimalTemplateResult.success,
      'Should successfully create minimal template',
      minimalTemplateResult.message
    );
    assert(
      !minimalTemplateResult.grammar.includes('WS:'),
      'Should NOT contain boilerplate rules',
      `Grammar: ${minimalTemplateResult.grammar}`
    );

    console.log('\n========================================');
    console.log('  Lexer Mode Test Summary');
    console.log('========================================');
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log('========================================');

    if (failCount === 0) {
      console.log('\n🎉 All lexer mode tests passing!');
    }
  } finally {
    cleanup();
  }
}

runTests();
process.exit(failCount > 0 ? 1 : 0);
