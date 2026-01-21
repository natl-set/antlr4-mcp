#!/usr/bin/env node

/**
 * Comprehensive test suite for update-rule with various formatting styles
 * 
 * Tests:
 * 1. Standard format (colon same line, semicolon same line)
 * 2. Colon on new line, definition same line as colon
 * 3. Colon on new line, definition on separate indented line
 * 4. Semicolon on new line
 * 5. Multi-line definition with alternatives
 * 6. Fragment rules
 * 7. Rules with leading whitespace
 * 8. Complex real-world Palo Alto format
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

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

function runTests() {
  console.log('Starting update-rule formatting tests...\n');

  // Test 1: Standard format (colon same line, semicolon same line)
  console.log('Test 1: Standard format (colon and semicolon same line)');
  const grammar1 = `grammar Test;
expr: term PLUS term;
term: NUMBER;
NUMBER: [0-9]+;
`;
  const result1 = AntlrAnalyzer.updateRule(grammar1, 'expr', 'factor TIMES factor');
  assert(
    result1.success && result1.modified.includes('expr: factor TIMES factor;'),
    'Should preserve standard format',
    result1.modified
  );
  assert(
    !result1.modified.includes('expr:\n'),
    'Colon should stay on same line'
  );

  // Test 2: Colon on new line, definition same line as colon
  console.log('\nTest 2: Colon on new line, definition with colon');
  const grammar2 = `grammar Test;
expr
: term PLUS term;
`;
  const result2 = AntlrAnalyzer.updateRule(grammar2, 'expr', 'factor TIMES factor');
  assert(
    result2.success && result2.modified.includes('expr\n: factor TIMES factor;'),
    'Should preserve colon on new line with definition',
    result2.modified
  );

  // Test 3: Colon on new line, definition on separate indented line
  console.log('\nTest 3: Colon on new line, definition on separate indented line');
  const grammar3 = `grammar Test;
expr
:
    term PLUS term
;
`;
  const result3 = AntlrAnalyzer.updateRule(grammar3, 'expr', 'factor TIMES factor');
  const hasColonOnOwnLine = result3.modified.includes('expr\n:');
  const hasSemicolonOnOwnLine = result3.modified.match(/factor TIMES factor\n;/);
  
  console.log('Result:\n' + result3.modified);
  
  assert(
    result3.success && hasColonOnOwnLine,
    'Should preserve colon on separate line',
    result3.modified
  );
  assert(
    hasSemicolonOnOwnLine,
    'Should preserve semicolon on separate line'
  );

  // Test 4: Palo Alto style (real-world example)
  console.log('\nTest 4: Palo Alto style format');
  const grammar4 = `parser grammar PaloAlto_rulebase;

srs_group_tag
:
    GROUP_TAG variable
;
`;
  const result4 = AntlrAnalyzer.updateRule(grammar4, 'srs_group_tag', 'GROUP_TAG value');
  
  console.log('Result:\n' + result4.modified);
  
  const expectedFormat4 = `parser grammar PaloAlto_rulebase;

srs_group_tag
:
    GROUP_TAG value
;`;
  
  assert(
    result4.success,
    'Should update Palo Alto style rule'
  );
  
  // Check key formatting elements
  const hasRuleName = result4.modified.includes('srs_group_tag\n');
  const hasColonAlone = result4.modified.includes('\n:\n');
  const hasIndentedDef = result4.modified.includes('\n    GROUP_TAG value\n');
  const hasSemicolonAlone = result4.modified.includes('\n;\n');
  
  assert(
    hasRuleName && hasColonAlone && hasIndentedDef && hasSemicolonAlone,
    'Should preserve all formatting elements',
    `hasRuleName=${hasRuleName}, hasColonAlone=${hasColonAlone}, hasIndentedDef=${hasIndentedDef}, hasSemicolonAlone=${hasSemicolonAlone}`
  );

  // Test 5: Fragment rules
  console.log('\nTest 5: Fragment rule');
  const grammar5 = `grammar Test;
fragment DIGIT: [0-9];
`;
  const result5 = AntlrAnalyzer.updateRule(grammar5, 'DIGIT', '[0-9]+');
  assert(
    result5.success && result5.modified.includes('fragment DIGIT: [0-9]+;'),
    'Should preserve fragment keyword',
    result5.modified
  );

  // Test 6: Multi-line alternatives (colon same line)
  console.log('\nTest 6: Rule with alternatives');
  const grammar6 = `grammar Test;
expr: term PLUS term | term MINUS term;
`;
  const result6 = AntlrAnalyzer.updateRule(grammar6, 'expr', 'factor (TIMES | DIVIDE) factor');
  assert(
    result6.success && result6.modified.includes('expr: factor (TIMES | DIVIDE) factor;'),
    'Should update rule with alternatives',
    result6.modified
  );

  // Test 7: Leading whitespace preservation
  console.log('\nTest 7: Indented rule');
  const grammar7 = `grammar Test;

    expr: term;
    term: NUMBER;
`;
  const result7 = AntlrAnalyzer.updateRule(grammar7, 'expr', 'factor');
  assert(
    result7.success && result7.modified.includes('    expr: factor;'),
    'Should preserve leading whitespace',
    result7.modified
  );

  // Test 8: Colon on new line with indentation
  console.log('\nTest 8: Colon on new line with custom indentation');
  const grammar8 = `grammar Test;
expr
  : term
  ;
`;
  const result8 = AntlrAnalyzer.updateRule(grammar8, 'expr', 'factor');
  const hasCustomColon = result8.modified.includes('\n  :');
  const hasCustomSemi = result8.modified.includes('\n  ;');
  
  console.log('Result:\n' + result8.modified);
  
  assert(
    result8.success && hasCustomColon && hasCustomSemi,
    'Should preserve custom colon/semicolon indentation',
    `hasCustomColon=${hasCustomColon}, hasCustomSemi=${hasCustomSemi}`
  );

  // Test 9: No space before colon style
  console.log('\nTest 9: No space before colon');
  const grammar9 = `grammar Test;
expr: term;
`;
  const result9 = AntlrAnalyzer.updateRule(grammar9, 'expr', 'factor');
  assert(
    result9.success && result9.modified.includes('expr: factor;'),
    'Should handle no space before colon',
    result9.modified
  );

  // Test 10: Rule not found
  console.log('\nTest 10: Rule not found error');
  const grammar10 = `grammar Test;
expr: term;
`;
  const result10 = AntlrAnalyzer.updateRule(grammar10, 'nonexistent', 'factor');
  assert(
    !result10.success && result10.message.includes('not found'),
    'Should return error for non-existent rule'
  );

  // Test 11: Preserve blank lines between rules
  console.log('\nTest 11: Preserve blank lines between rules');
  const grammar11 = `grammar Test;

expr: term;

term: NUMBER;
`;
  const result11 = AntlrAnalyzer.updateRule(grammar11, 'expr', 'factor');
  assert(
    result11.success && result11.modified.includes('\n\nexpr: factor;\n\nterm: NUMBER;'),
    'Should preserve blank lines between rules',
    result11.modified
  );

  // Test 12: Complex Palo Alto rule with options
  console.log('\nTest 12: Grammar with options and imports');
  const grammar12 = `parser grammar PaloAlto_rulebase;

import
    PaloAlto_common,
    PaloAlto_nat;

options {
    tokenVocab = PaloAltoLexer;
}

srs_group_tag
:
    GROUP_TAG variable
;

srs_other
:
    OTHER value
;
`;
  const result12 = AntlrAnalyzer.updateRule(grammar12, 'srs_group_tag', 'GROUP_TAG new_value');
  
  assert(
    result12.success,
    'Should handle complex grammar structure'
  );
  assert(
    result12.modified.includes('import'),
    'Should preserve import section'
  );
  assert(
    result12.modified.includes('options'),
    'Should preserve options section'
  );
  assert(
    result12.modified.includes('srs_other'),
    'Should preserve other rules'
  );

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
