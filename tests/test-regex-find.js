import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const grammar = `grammar Test;

// Parser rules
expr : term ((ADD | SUB) term)*;
term : factor ((MUL | DIV) factor)*;
factor : NUMBER | '(' expr ')';
statement : expr ';';
program : statement*;

// Lexer rules
ADD : '+';
SUB : '-';
MUL : '*';
DIV : '/';
NUMBER : [0-9]+;
ID : [a-zA-Z_][a-zA-Z0-9_]*;
WS : [ \\t\\n\\r]+ -> skip;
`;

console.log('=== Original Grammar ===');
console.log(grammar);

console.log('\n=== Test 1: Find rule by exact name (no regex) ===');
const exactResult = AntlrAnalyzer.findRulesByRegex(grammar, 'expr');
console.log(`Matches: ${exactResult.count}`);
exactResult.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type}): ${r.definition}`);
});

console.log('\n=== Test 2: Find all lexer rules starting with uppercase (regex) ===');
const regexResult1 = AntlrAnalyzer.findRulesByRegex(grammar, '^[A-Z]+$');
console.log(`Matches: ${regexResult1.count}`);
regexResult1.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type}): ${r.definition}`);
});

console.log('\n=== Test 3: Find rules containing "term" (regex) ===');
const regexResult2 = AntlrAnalyzer.findRulesByRegex(grammar, '.*term.*');
console.log(`Matches: ${regexResult2.count}`);
regexResult2.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type}): ${r.definition}`);
});

console.log('\n=== Test 4: Find parser rules (lowercase pattern) ===');
const regexResult3 = AntlrAnalyzer.findRulesByRegex(grammar, '^[a-z]');
console.log(`Matches: ${regexResult3.count}`);
regexResult3.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type}): ${r.definition}`);
});

console.log('\n=== Test 5: Find rules with 4+ characters ===');
const regexResult4 = AntlrAnalyzer.findRulesByRegex(grammar, '^.{4,}$');
console.log(`Matches: ${regexResult4.count}`);
regexResult4.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type})`);
});

console.log('\n=== Test 6: Find rules ending with "or" ===');
const regexResult5 = AntlrAnalyzer.findRulesByRegex(grammar, 'or$');
console.log(`Matches: ${regexResult5.count}`);
regexResult5.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type})`);
});

console.log('\n=== Test 7: Invalid regex pattern (should show error) ===');
const invalidResult = AntlrAnalyzer.findRulesByRegex(grammar, '[invalid');
if (invalidResult.error) {
  console.log(`Error: ${invalidResult.error}`);
} else {
  console.log(`Matches: ${invalidResult.count}`);
}

console.log('\n=== Test 8: Find rules with vowels ===');
const regexResult6 = AntlrAnalyzer.findRulesByRegex(grammar, '[aeiouAEIOU]');
console.log(`Matches: ${regexResult6.count}`);
regexResult6.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type})`);
});

console.log('\n=== Test 9: Case-insensitive find (regex) ===');
const regexResult7 = AntlrAnalyzer.findRulesByRegex(grammar, '(?i)^add$');
console.log(`Matches: ${regexResult7.count}`);
regexResult7.matches.forEach(r => {
  console.log(`  - ${r.name} (${r.type})`);
});
