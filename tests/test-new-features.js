#!/usr/bin/env node

/**
 * Test the new features:
 * 1. Positional insertion (insert_after, insert_before)
 * 2. Multiple match modes for find-rule (exact, regex, wildcard, partial)
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const sampleGrammar = `
grammar Test;

// Parser rules
program : statement+ ;

statement : assignment | expression ;

assignment : ID ASSIGN expression SEMI ;

expression : term ;

term : ID ;

// Lexer rules
ID : [a-zA-Z_][a-zA-Z0-9_]* ;

ASSIGN : '=' ;

SEMI : ';' ;

WS : [ \\t\\n\\r]+ -> skip ;
`;

console.log('=== Testing Positional Insertion ===\n');

// Test 1: Insert after a specific rule
console.log('Test 1: Add PLUS token after ASSIGN');
const result1 = AntlrAnalyzer.addLexerRule(sampleGrammar, 'PLUS', "'+'", { insertAfter: 'ASSIGN' });
console.log(result1.message);
console.log(result1.success ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 2: Insert before a specific rule
console.log('Test 2: Add NUMBER token before ID');
const result2 = AntlrAnalyzer.addLexerRule(sampleGrammar, 'NUMBER', '[0-9]+', { insertBefore: 'ID' });
console.log(result2.message);
console.log(result2.success ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 3: Insert parser rule after another
console.log('Test 3: Add ifstatement after assignment');
const result3 = AntlrAnalyzer.addParserRule(sampleGrammar, 'ifstatement', 'IF LPAREN expression RPAREN statement', { insertAfter: 'assignment' });
console.log(result3.message);
console.log(result3.success ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 4: Error case - insert after non-existent rule
console.log('Test 4: Try to insert after non-existent rule (should fail)');
const result4 = AntlrAnalyzer.addLexerRule(sampleGrammar, 'MINUS', "'-'", { insertAfter: 'NONEXISTENT' });
console.log(result4.message);
console.log(!result4.success ? '✓ PASSED (correctly failed)' : '✗ FAILED (should have failed)');
console.log('');

console.log('=== Testing Find-Rule Match Modes ===\n');

// Test 5: Exact match
console.log('Test 5: Exact match - find "expression"');
const find1 = AntlrAnalyzer.findRules(sampleGrammar, 'expression', 'exact');
console.log(`Found ${find1.count} rule(s): ${find1.matches.map(r => r.name).join(', ')}`);
console.log(find1.count === 1 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 6: Regex match - all lexer rules
console.log('Test 6: Regex match - find all lexer rules (uppercase)');
const find2 = AntlrAnalyzer.findRules(sampleGrammar, '^[A-Z]+$', 'regex');
console.log(`Found ${find2.count} rule(s): ${find2.matches.map(r => r.name).join(', ')}`);
console.log(find2.count === 4 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 7: Regex match - all parser rules
console.log('Test 7: Regex match - find all parser rules (lowercase)');
const find3 = AntlrAnalyzer.findRules(sampleGrammar, '^[a-z]+$', 'regex');
console.log(`Found ${find3.count} rule(s): ${find3.matches.map(r => r.name).join(', ')}`);
console.log(find3.count === 5 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 8: Wildcard match - rules starting with "st"
console.log('Test 8: Wildcard match - find rules starting with "st" (st*)');
const find4 = AntlrAnalyzer.findRules(sampleGrammar, 'st*', 'wildcard');
console.log(`Found ${find4.count} rule(s): ${find4.matches.map(r => r.name).join(', ')}`);
console.log(find4.count === 1 ? '✓ PASSED' : '✗ FAILED');
console.log('');

// Test 9: Wildcard match - single character wildcard
console.log('Test 9: Wildcard match - find 2-letter lexer rules (??)')
const find5 = AntlrAnalyzer.findRules(sampleGrammar, '??', 'wildcard');
console.log(`Found ${find5.count} rule(s): ${find5.matches.map(r => r.name).join(', ')}`);
console.log(find5.count === 2 ? '✓ PASSED' : '✗ FAILED'); // ID and WS
console.log('');

// Test 10: Partial match - contains "sign"
console.log('Test 10: Partial match - find rules containing "sign"');
const find6 = AntlrAnalyzer.findRules(sampleGrammar, 'sign', 'partial');
console.log(`Found ${find6.count} rule(s): ${find6.matches.map(r => r.name).join(', ')}`);
console.log(find6.count === 2 ? '✓ PASSED' : '✗ FAILED'); // assignment, ASSIGN
console.log('');

// Test 11: Partial match - case insensitive
console.log('Test 11: Partial match - case insensitive "STAT"');
const find7 = AntlrAnalyzer.findRules(sampleGrammar, 'STAT', 'partial');
console.log(`Found ${find7.count} rule(s): ${find7.matches.map(r => r.name).join(', ')}`);
console.log(find7.count === 1 ? '✓ PASSED' : '✗ FAILED'); // statement
console.log('');

console.log('=== All Tests Complete ===');
