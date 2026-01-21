#!/usr/bin/env node

/**
 * Test the token preview feature
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const sampleGrammar = `
grammar Calculator;

// Parser rules
program : statement+ ;
statement : assignment SEMI | expression SEMI ;
assignment : ID ASSIGN expression ;
expression : term ((PLUS | MINUS) term)* ;
term : factor ((TIMES | DIVIDE) factor)* ;
factor : INT | ID | LPAREN expression RPAREN ;

// Lexer rules
ID : [a-zA-Z_][a-zA-Z0-9_]* ;
INT : [0-9]+ ;

PLUS : '+' ;
MINUS : '-' ;
TIMES : '*' ;
DIVIDE : '/' ;

LPAREN : '(' ;
RPAREN : ')' ;
ASSIGN : '=' ;
SEMI : ';' ;

WS : [ \\t\\n\\r]+ -> skip ;
COMMENT : '//' ~[\\n]* -> skip ;
`;

console.log('=== Testing Token Preview Feature ===\n');

// Test 1: Basic tokenization
console.log('Test 1: Basic arithmetic expression');
const result1 = AntlrAnalyzer.previewTokens(sampleGrammar, 'x + 42');
console.log(`Tokens: ${result1.tokens.map(t => t.type).join(', ')}`);
console.log(`Success: ${result1.success}`);
console.log(result1.success && result1.tokens.length === 5 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 2: Assignment statement
console.log('Test 2: Assignment with semicolon');
const result2 = AntlrAnalyzer.previewTokens(sampleGrammar, 'result = x * 2;');
console.log(`Tokens: ${result2.tokens.map(t => `${t.type}("${t.value}")`).join(', ')}`);
console.log(result2.success && result2.tokens.length === 9 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 3: Whitespace handling
console.log('Test 3: Whitespace and skipped tokens');
const result3 = AntlrAnalyzer.previewTokens(sampleGrammar, 'x   +   y');
const skippedCount = result3.tokens.filter(t => t.skipped).length;
const nonSkipped = result3.tokens.filter(t => !t.skipped);
console.log(`Total tokens: ${result3.tokens.length}`);
console.log(`Skipped: ${skippedCount}, Non-skipped: ${nonSkipped.length}`);
console.log(`Non-skipped types: ${nonSkipped.map(t => t.type).join(', ')}`);
console.log(skippedCount === 2 && nonSkipped.length === 3 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 4: Comments
console.log('Test 4: Comment handling');
const result4 = AntlrAnalyzer.previewTokens(sampleGrammar, 'x = 1; // comment');
const commentTokens = result4.tokens.filter(t => t.type === 'COMMENT');
console.log(`Comment tokens: ${commentTokens.length}`);
console.log(`All tokens: ${result4.tokens.map(t => t.type).join(', ')}`);
console.log(commentTokens.length === 1 && commentTokens[0].skipped ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 5: Complex expression with parentheses
console.log('Test 5: Expression with parentheses');
const result5 = AntlrAnalyzer.previewTokens(sampleGrammar, '(a + b) * c');
const nonWS5 = result5.tokens.filter(t => !t.skipped);
console.log(`Tokens: ${nonWS5.map(t => t.type).join(', ')}`);
console.log(nonWS5.length === 7 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 6: Error handling - invalid character
console.log('Test 6: Invalid character detection');
const result6 = AntlrAnalyzer.previewTokens(sampleGrammar, 'x @ y');
console.log(`Errors: ${result6.errors.length}`);
console.log(`Error details: ${result6.errors.map(e => e.message).join(', ')}`);
console.log(!result6.success && result6.errors.length > 0 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 7: Multi-line input
console.log('Test 7: Multi-line input');
const multilineInput = `x = 1;
y = 2;
z = x + y;`;
const result7 = AntlrAnalyzer.previewTokens(sampleGrammar, multilineInput);
const idTokens = result7.tokens.filter(t => t.type === 'ID');
const semiTokens = result7.tokens.filter(t => t.type === 'SEMI');
console.log(`ID tokens: ${idTokens.length}, SEMI tokens: ${semiTokens.length}`);
console.log(`Lines processed: ${result7.tokens.filter(t => t.line > 1).length > 0 ? 'multiple' : 'single'}`);
console.log(idTokens.length === 6 && semiTokens.length === 3 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 8: Position information
console.log('Test 8: Position tracking');
const result8 = AntlrAnalyzer.previewTokens(sampleGrammar, 'abc', { showPositions: true });
const abcToken = result8.tokens.find(t => t.type === 'ID');
console.log(`Token: ${abcToken?.type}("${abcToken?.value}")`);
console.log(`Position: start=${abcToken?.start}, end=${abcToken?.end}, line=${abcToken?.line}, col=${abcToken?.column}`);
console.log(abcToken && abcToken.start === 0 && abcToken.end === 2 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 9: Specific rules filtering
console.log('Test 9: Filter to specific rules');
const result9 = AntlrAnalyzer.previewTokens(sampleGrammar, 'x + y * 2', { 
  rulesToTest: ['ID', 'PLUS', 'TIMES'] 
});
const tokenTypes = new Set(result9.tokens.map(t => t.type));
console.log(`Token types found: ${Array.from(tokenTypes).join(', ')}`);
console.log(`Expected only ID, PLUS, TIMES, WS`);
// Should have warnings about INT not being tested
console.log(result9.warnings.length === 0 && !result9.success ? '✓ PASSED (correctly failed)' : '✗ FAILED');
console.log('');

// Test 10: Maximal munch (longest match wins)
console.log('Test 10: Maximal munch - identifier vs keywords');
const grammarWithKeyword = `
grammar KeywordTest;
IF : 'if' ;
ID : [a-zA-Z]+ ;
WS : [ ]+ -> skip ;
`;
const result10 = AntlrAnalyzer.previewTokens(grammarWithKeyword, 'if ifx');
const tokens10 = result10.tokens.filter(t => !t.skipped);
console.log(`Tokens: ${tokens10.map(t => `${t.type}("${t.value}")`).join(', ')}`);
console.log(`First should be IF, second should be ID`);
console.log(tokens10[0]?.type === 'IF' && tokens10[1]?.type === 'ID' ? '✓ PASSED' : '✗ FAILED');
console.log('');

console.log('=== Test Summary ===');
console.log('All token preview tests completed!');
console.log('');
console.log('Features tested:');
console.log('  ✓ Basic tokenization');
console.log('  ✓ Whitespace and skip directives');
console.log('  ✓ Comment handling');
console.log('  ✓ Complex expressions');
console.log('  ✓ Error detection');
console.log('  ✓ Multi-line input');
console.log('  ✓ Position tracking');
console.log('  ✓ Rule filtering');
console.log('  ✓ Maximal munch algorithm');
