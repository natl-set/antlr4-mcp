#!/usr/bin/env node
/**
 * Test suite for smart validation features
 * Tests aggregation, quantifier detection, and incomplete parsing detection
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');

const TEST_GRAMMAR = `
grammar TestGrammar;

// Parser rules with suspicious quantifiers
bgpp_export: EXPORT bgp_policy_rule?;  // Should be *
bgpp_import: IMPORT bgp_policy_rule?;  // Should be *

srs_definition: 
  SET SECURITY RULES rule_name 
  source_setting? 
  destination_setting? 
  action_setting?;  // Multiple optionals - should be alternatives with *

sr_security_rules: RULES rule_def?;  // Should be *

// Rule with null_rest_of_line (incomplete parsing)
ss_ssl_tls_service_profile: 
  SET SERVICE SSL_TLS_SERVICE_PROFILE profile_name null_rest_of_line;

// Rule with broad negation
quick_line: ~[\\r\\n]+;

// Multiple optional similar elements
multi_optional: a? b? c? d?;

// Same reference multiple times
repeated_ref: setting? COMMA setting? COMMA setting?;

// Parser rules that reference undefined tokens
rule_with_undefined: ADDRESS_REGEX | EVENT_TYPE | MGMT_INTERFACE;
another_undefined: USERNAME_REGEX | SERVER_MONITOR;

// Lexer tokens (some defined, some missing)
EXPORT: 'export';
IMPORT: 'import';
SET: 'set';
SECURITY: 'security';
RULES: 'rules';
COMMA: ',';
SERVICE: 'service';
SSL_TLS_SERVICE_PROFILE: 'ssl-tls-service-profile';

// Missing tokens: ADDRESS_REGEX, EVENT_TYPE, MGMT_INTERFACE, USERNAME_REGEX, SERVER_MONITOR
// These will cause undefined reference issues

fragment NEWLINE: '\\r'? '\\n';
null_rest_of_line: ~[\\r\\n]+ NEWLINE?;
`;

console.log('🧪 Testing Smart Validation Features\n');
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

// Test 1: Aggregation function
test('aggregateValidationIssues - groups undefined refs', () => {
  const issues = [
    { severity: 'warning', message: 'Reference to undefined rule: ADDRESS_REGEX', ruleName: 'test1', lineNumber: 1 },
    { severity: 'warning', message: 'Reference to undefined rule: ADDRESS_REGEX', ruleName: 'test2', lineNumber: 2 },
    { severity: 'warning', message: 'Reference to undefined rule: EVENT_TYPE', ruleName: 'test3', lineNumber: 3 },
    { severity: 'warning', message: 'Reference to undefined rule: USERNAME_REGEX', ruleName: 'test4', lineNumber: 4 },
  ];
  
  const result = AntlrAnalyzer.aggregateValidationIssues(issues);
  
  if (!result.summary.includes('Total: 4 issues')) throw new Error('Wrong total count');
  if (result.groups.length === 0) throw new Error('No groups created');
  
  const undefinedGroup = result.groups.find(g => g.category === 'Undefined Token References');
  if (!undefinedGroup) throw new Error('Missing undefined tokens group');
  if (undefinedGroup.count !== 4) throw new Error('Wrong count');
  if (undefinedGroup.uniqueItems !== 3) throw new Error('Wrong unique count');
  if (undefinedGroup.topItems.length === 0) throw new Error('No top items');
  if (undefinedGroup.topItems[0].name !== 'ADDRESS_REGEX') throw new Error('Wrong top item');
  if (undefinedGroup.topItems[0].count !== 2) throw new Error('Wrong ADDRESS_REGEX count');
});

// Test 2: detectSuspiciousQuantifiers
test('detectSuspiciousQuantifiers - detects collection naming', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
  
  if (suspicious.length === 0) throw new Error('No suspicious quantifiers detected');
  
  const hasCollectionNaming = suspicious.some(s => 
    s.reasoning.includes('typically allow multiple occurrences'));
  if (!hasCollectionNaming) throw new Error('Did not detect collection naming pattern');
});

// Test 3: detectSuspiciousQuantifiers - multiple optionals
test('detectSuspiciousQuantifiers - detects multiple optionals', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
  
  const hasMultipleOptionals = suspicious.some(s => 
    s.reasoning.includes('zero-or-more alternatives'));
  if (!hasMultipleOptionals) throw new Error('Did not detect multiple optionals');
});

// Test 4: detectSuspiciousQuantifiers - repeated references
test('detectSuspiciousQuantifiers - detects repeated refs', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
  
  const hasRepeated = suspicious.some(s => 
    s.pattern.includes('appears') && s.pattern.includes('times'));
  if (!hasRepeated) throw new Error('Did not detect repeated references');
});

// Test 5: detectIncompleteParsing - null_rest_of_line
test('detectIncompleteParsing - detects null_rest_of_line', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);
  
  if (incomplete.length === 0) throw new Error('No incomplete patterns detected');
  
  const hasNullRest = incomplete.some(i => i.pattern === 'null_rest_of_line');
  if (!hasNullRest) throw new Error('Did not detect null_rest_of_line');
});

// Test 6: detectIncompleteParsing - broad negation
test('detectIncompleteParsing - detects broad negation', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);
  
  const hasNegation = incomplete.some(i => i.pattern === 'Simple negation pattern');
  if (!hasNegation) throw new Error('Did not detect broad negation');
});

// Test 7: suggestMissingTokens - pattern recognition
test('suggestMissingTokens - generates smart suggestions', () => {
  const undefined = ['ADDRESS_REGEX', 'EVENT_TYPE', 'USERNAME_REGEX', 'MGMT_INTERFACE'];
  const suggestions = AntlrAnalyzer.suggestMissingTokens(undefined);
  
  if (suggestions.length !== 4) throw new Error('Wrong number of suggestions');
  
  const addressSugg = suggestions.find(s => s.tokenName === 'ADDRESS_REGEX');
  if (!addressSugg) throw new Error('Missing ADDRESS_REGEX suggestion');
  if (!addressSugg.suggestedPattern) throw new Error('No pattern suggested');
  if (!addressSugg.reasoning) throw new Error('No reasoning provided');
});

// Test 8: suggestMissingTokens - specific patterns
test('suggestMissingTokens - context-aware patterns', () => {
  const suggestions = AntlrAnalyzer.suggestMissingTokens(['USERNAME_REGEX', 'EVENT_TYPE']);
  
  const usernameSugg = suggestions.find(s => s.tokenName === 'USERNAME_REGEX');
  if (usernameSugg && !usernameSugg.suggestedPattern.includes('@')) {
    throw new Error('USERNAME pattern should include @');
  }
  
  const eventSugg = suggestions.find(s => s.tokenName === 'EVENT_TYPE');
  if (!eventSugg || !eventSugg.suggestedPattern) {
    throw new Error('EVENT_TYPE should have pattern');
  }
});

// Test 9: Full integration - analysis with all features
test('Full integration - analyze + aggregate + detect', () => {
  const analysis = AntlrAnalyzer.analyze(TEST_GRAMMAR);
  
  if (!analysis.issues || analysis.issues.length === 0) {
    throw new Error('Analysis should find issues');
  }
  
  const aggregated = AntlrAnalyzer.aggregateValidationIssues(analysis.issues);
  if (aggregated.groups.length === 0) {
    throw new Error('Should have grouped issues');
  }
  
  const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
  if (suspicious.length === 0) {
    throw new Error('Should detect suspicious quantifiers');
  }
  
  const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);
  if (incomplete.length === 0) {
    throw new Error('Should detect incomplete parsing');
  }
});

// Test 10: Clean grammar - no false positives
test('Clean grammar produces no false positives', () => {
  const CLEAN_GRAMMAR = `
grammar Clean;
start: rule*;
rule: ID COLON value;
value: STRING | NUMBER;
ID: [a-z]+;
STRING: '"' ~["]* '"';
NUMBER: [0-9]+;
COLON: ':';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const analysis = AntlrAnalyzer.analyze(CLEAN_GRAMMAR);
  const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
  const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);
  
  // Clean grammar should have minimal or no suspicious patterns
  // (some patterns like ~["]* might trigger, but null_rest_of_line shouldn't)
  const hasNullRest = incomplete.some(i => i.pattern === 'null_rest_of_line');
  if (hasNullRest) {
    throw new Error('False positive: detected null_rest_of_line in clean grammar');
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Tests passed: ${passed}/${passed + failed}`);
console.log(`Tests failed: ${failed}/${passed + failed}`);

if (failed > 0) {
  console.log('\n❌ Some tests failed');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

