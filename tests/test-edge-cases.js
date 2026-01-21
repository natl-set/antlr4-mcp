import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('=== Test 1: Multi-line Rule ===');
const grammar1 = `grammar Test;

expr
  : term
  | expr ADD expr
  ;

term : NUMBER;
NUMBER : [0-9]+;
`;

const analysis1 = AntlrAnalyzer.analyze(grammar1);
console.log(`Found ${analysis1.rules.length} rules:`);
analysis1.rules.forEach(r => console.log(`  - ${r.name}`));

console.log('\n=== Test 2: Try to Add "expr" (multi-line, should fail) ===');
const result1 = AntlrAnalyzer.addParserRule(grammar1, 'expr', 'term');
console.log(`Success: ${result1.success}`);
console.log(`Message: ${result1.message}`);

console.log('\n=== Test 3: Fragment Rules ===');
const grammar3 = `grammar Test;

expr : IDENT;

fragment LETTER : [a-zA-Z];
IDENT : LETTER+;
`;

const analysis3 = AntlrAnalyzer.analyze(grammar3);
console.log(`Found ${analysis3.rules.length} rules:`);
analysis3.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

console.log('\n=== Test 4: Try to Add "LETTER" Fragment (should fail) ===');
const result3 = AntlrAnalyzer.addLexerRule(grammar3, 'LETTER', '[a-z]');
console.log(`Success: ${result3.success}`);
console.log(`Message: ${result3.message}`);

console.log('\n=== Test 5: Case Sensitivity ===');
const grammar5 = `grammar Test;

MyRule : 'x';
`;

const analysis5 = AntlrAnalyzer.analyze(grammar5);
console.log(`Found ${analysis5.rules.length} rules:`);
analysis5.rules.forEach(r => console.log(`  - ${r.name}`));

console.log('\n=== Test 6: Try to Add "myrule" (different case, might duplicate!) ===');
const result5 = AntlrAnalyzer.addLexerRule(grammar5, 'myrule', '[x]');
console.log(`Success: ${result5.success}`);
console.log(`Message: ${result5.message}`);

if (result5.success) {
  const analysis5b = AntlrAnalyzer.analyze(result5.modified);
  console.log(`\nRules after adding "myrule":`);
  analysis5b.rules.forEach(r => console.log(`  - ${r.name}`));
  const names = analysis5b.rules.map(r => r.name);
  const hasDuplicate = names.some((name, i) => names.indexOf(name) !== i);
  if (hasDuplicate) console.log('⚠️  WARNING: Possible case-sensitivity issue!');
}
