/**
 * Comprehensive test suite for test-parser-rule feature
 * Focus on grouped repetitions and edge cases
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('='.repeat(60));
console.log('COMPREHENSIVE TEST SUITE: test-parser-rule');
console.log('='.repeat(60));
console.log();

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   ${error.message}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Simple grouped repetition with literals
test('Simple grouped repetition (COMMA WORD)*', () => {
  const grammar = `
grammar Test;
statement: WORD (COMMA WORD)*;
WORD: [a-z]+;
COMMA: ',';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'statement', 'hello');
  assert(result1.success && result1.matched, 'Should match single word');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'statement', 'hello , world');
  assert(result2.success && result2.matched, `Should match two words. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'statement', 'a , b , c');
  assert(result3.success && result3.matched, `Should match three words. Message: ${result3.message}`);
});

// Test 2: Grouped alternatives without repetition
test('Grouped alternatives (PLUS | MINUS)', () => {
  const grammar = `
grammar Test;
expression: NUMBER (PLUS | MINUS) NUMBER;
NUMBER: [0-9]+;
PLUS: '+';
MINUS: '-';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'expression', '1 + 2');
  assert(result1.success && result1.matched, `Should match addition. Message: ${result1.message}`);
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'expression', '5 - 3');
  assert(result2.success && result2.matched, `Should match subtraction. Message: ${result2.message}`);
});

// Test 3: Optional grouped elements
test('Optional grouped elements (ASSIGN NUMBER)?', () => {
  const grammar = `
grammar Test;
declaration: TYPE ID (ASSIGN NUMBER)?;
TYPE: 'int' | 'string';
ID: [a-z]+;
ASSIGN: '=';
NUMBER: [0-9]+;
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'declaration', 'int x');
  assert(result1.success && result1.matched, 'Should match without assignment');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'declaration', 'int x = 42');
  assert(result2.success && result2.matched, `Should match with assignment. Message: ${result2.message}`);
});

// Test 4: String literals in groups
test('String literals in grouped repetition', () => {
  const grammar = `
grammar Test;
list: ID (',' ID)*;
ID: [a-z]+;
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a');
  assert(result1.success && result1.matched, 'Should match single element');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a , b');
  assert(result2.success && result2.matched, `Should match two elements. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a , b , c , d');
  assert(result3.success && result3.matched, `Should match four elements. Message: ${result3.message}`);
});

// Test 5: Multiple alternatives with repetition
test('Multiple alternatives ((ADD | SUB | MUL | DIV) term)*', () => {
  const grammar = `
grammar Test;
expression: term ((ADD | SUB | MUL | DIV) term)*;
term: NUMBER;
NUMBER: [0-9]+;
ADD: '+';
SUB: '-';
MUL: '*';
DIV: '/';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'expression', '5');
  assert(result1.success && result1.matched, 'Should match single term');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'expression', '1 + 2');
  assert(result2.success && result2.matched, `Should match addition. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'expression', '1 + 2 - 3');
  assert(result3.success && result3.matched, `Should match two operators. Message: ${result3.message}`);
  
  const result4 = AntlrAnalyzer.testParserRule(grammar, 'expression', '1 + 2 * 3 / 4');
  assert(result4.success && result4.matched, `Should match complex. Message: ${result4.message}`);
});

// Test 6: Parser rule in grouped repetition
test('Parser rule in group (COMMA element)*', () => {
  const grammar = `
grammar Test;
list: element (COMMA element)*;
element: ID | NUMBER;
ID: [a-z]+;
NUMBER: [0-9]+;
COMMA: ',';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'list', 'x');
  assert(result1.success && result1.matched, 'Should match single element');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'list', 'x , 5');
  assert(result2.success && result2.matched, `Should match mixed elements. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'list', 'a , b , 1 , 2');
  assert(result3.success && result3.matched, `Should match multiple mixed. Message: ${result3.message}`);
});

// Test 7: Required group with +
test('Required grouped repetition (ID SEMI)+', () => {
  const grammar = `
grammar Test;
rule: (ID SEMI)+;
ID: [a-z]+;
SEMI: ';';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a ;');
  assert(result1.success && result1.matched, 'Should match single pair');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a ; b ;');
  assert(result2.success && result2.matched, `Should match two pairs. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'rule', '');
  assert(result3.success && !result3.matched, 'Should not match empty (requires +)');
});

// Test 8: Nested groups
test('Nested groups ((COMMA | SEMI) ID)*', () => {
  const grammar = `
grammar Test;
rule: ID ((COMMA | SEMI) ID)*;
ID: [a-z]+;
COMMA: ',';
SEMI: ';';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a');
  assert(result1.success && result1.matched, 'Should match single ID');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a , b');
  assert(result2.success && result2.matched, `Should match with comma. Message: ${result2.message}`);
  
  const result3 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a ; b');
  assert(result3.success && result3.matched, `Should match with semi. Message: ${result3.message}`);
  
  const result4 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a , b ; c');
  assert(result4.success && result4.matched, `Should match mixed. Message: ${result4.message}`);
});

// Test 9: Multiple consecutive groups
test('Multiple consecutive groups', () => {
  const grammar = `
grammar Test;
rule: (ID COMMA)+ (NUMBER SEMI)+;
ID: [a-z]+;
NUMBER: [0-9]+;
COMMA: ',';
SEMI: ';';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a , 1 ;');
  assert(result1.success && result1.matched, 'Should match minimal');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a , b , 1 ; 2 ;');
  assert(result2.success && result2.matched, `Should match both groups. Message: ${result2.message}`);
});

// Test 10: Group with only optional elements
test('Group with all optional elements', () => {
  const grammar = `
grammar Test;
rule: ID (COMMA? SEMI?)*;
ID: [a-z]+;
COMMA: ',';
SEMI: ';';
WS: [ \\t\\r\\n]+ -> skip;
`;
  
  const result1 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a');
  assert(result1.success && result1.matched, 'Should match ID only');
  
  const result2 = AntlrAnalyzer.testParserRule(grammar, 'rule', 'a , ;');
  assert(result2.success && result2.matched, `Should match with optionals. Message: ${result2.message}`);
});

// Print summary
console.log();
console.log('='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total tests: ${passedTests + failedTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);
console.log();

if (failedTests === 0) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
