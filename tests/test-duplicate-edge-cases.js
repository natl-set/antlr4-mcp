import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('=== Testing for Duplicate Rule Edge Cases ===\n');

// Test 1: Try to add a rule that's already there (exact match)
console.log('Test 1: Exact duplicate (should fail)');
const grammar1 = `grammar Test;
expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;
const result1 = AntlrAnalyzer.addLexerRule(grammar1, 'NUMBER', '[0-9]+');
console.log(`  Result: ${result1.success ? '✗ ADDED (BUG!)' : '✓ Rejected'} - ${result1.message}\n`);

// Test 2: Try to add a rule with different case
console.log('Test 2: Different case duplicate (should fail)');
const grammar2 = `grammar Test;
expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;
const result2 = AntlrAnalyzer.addParserRule(grammar2, 'EXPR', 'term');  // uppercase version
console.log(`  Result: ${result2.success ? 'Added' : 'Rejected'} - ${result2.message}\n`);

// Test 3: Fragment rules that aren't being detected
console.log('Test 3: Try to add duplicate fragment (should fail)');
const grammar3 = `grammar Test;
expr : LETTER;
fragment LETTER : [a-zA-Z];
`;
const result3a = AntlrAnalyzer.analyze(grammar3);
console.log(`  Initial analysis: Found ${result3a.rules.length} rules - ${result3a.rules.map(r => r.name).join(', ')}`);
const result3 = AntlrAnalyzer.addLexerRule(grammar3, 'LETTER', '[a-z]');
console.log(`  Result: ${result3.success ? '✗ ADDED (BUG!)' : '✓ Rejected'} - ${result3.message}\n`);

// Test 4: Multi-line rules
console.log('Test 4: Multi-line rule duplicate (should fail)');
const grammar4 = `grammar Test;
expr
  : term
  | expr ADD expr
  ;
term : NUMBER;
NUMBER : [0-9]+;
`;
const result4a = AntlrAnalyzer.analyze(grammar4);
console.log(`  Initial analysis: Found ${result4a.rules.length} rules - ${result4a.rules.map(r => r.name).join(', ')}`);
const result4 = AntlrAnalyzer.addParserRule(grammar4, 'expr', 'term');
console.log(`  Result: ${result4.success ? '✗ ADDED (BUG!)' : '✓ Rejected'} - ${result4.message}\n`);

// Test 5: Rules with leading/trailing whitespace
console.log('Test 5: Rule with whitespace variations');
const grammar5 = `grammar Test;

  expr : term;

term : NUMBER;
NUMBER : [0-9]+;
`;
const result5a = AntlrAnalyzer.analyze(grammar5);
console.log(`  Initial analysis: Found ${result5a.rules.length} rules - ${result5a.rules.map(r => r.name).join(', ')}`);
const result5 = AntlrAnalyzer.addParserRule(grammar5, 'expr', 'term');
console.log(`  Result: ${result5.success ? '✗ ADDED (BUG!)' : '✓ Rejected'} - ${result5.message}\n`);

// Test 6: Lexer vs Parser rules with same name
console.log('Test 6: Lexer and parser rules with same base name');
const grammar6 = `grammar Test;
expr : EXPR;
EXPR : 'e';
`;
const result6a = AntlrAnalyzer.analyze(grammar6);
console.log(`  Initial analysis: Found ${result6a.rules.length} rules - ${result6a.rules.map(r => `${r.name}(${r.type})`).join(', ')}`);
const result6 = AntlrAnalyzer.addLexerRule(grammar6, 'EXPR', 'E');  // same name as parser rule in different case
console.log(`  Result: ${result6.success ? '✗ ADDED (BUG - different types!)' : '✓ Rejected'} - ${result6.message}\n`);

// Test 7: Comments that look like rules
console.log('Test 7: Rule name in comment (should be safe)');
const grammar7 = `grammar Test;
// expr : term;  <-- commented out
expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;
const result7a = AntlrAnalyzer.analyze(grammar7);
console.log(`  Initial analysis: Found ${result7a.rules.length} rules - ${result7a.rules.map(r => r.name).join(', ')}`);
const result7 = AntlrAnalyzer.addParserRule(grammar7, 'expr', 'term');
console.log(`  Result: ${result7.success ? '✗ ADDED (BUG!)' : '✓ Rejected'} - ${result7.message}\n`);

// Test 8: Try all three bulk operations
console.log('Test 8: Bulk add with duplicate');
const grammar8 = `grammar Test;
expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;
const result8 = AntlrAnalyzer.addLexerRules(grammar8, [
  { name: 'ID', pattern: '[a-zA-Z_][a-zA-Z0-9_]*' },
  { name: 'NUMBER', pattern: '[0-9]+' },  // duplicate!
  { name: 'STRING', pattern: '".*?"' }
]);
console.log(`  Summary: ${result8.summary}`);
result8.results.forEach(r => {
  console.log(`    ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});

// Check final result for hidden duplicates
const analysis8 = AntlrAnalyzer.analyze(result8.modified);
const names8 = analysis8.rules.map(r => r.name);
const duplicates8 = names8.filter((name, i) => names8.indexOf(name) !== i);
if (duplicates8.length > 0) {
  console.log(`  ⚠️ WARNING: Duplicates in result: ${duplicates8.join(', ')}`);
} else {
  console.log(`  ✓ No duplicates in result`);
}
