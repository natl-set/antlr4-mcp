import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const grammar = `grammar Test;

expr : term;
term : NUMBER;
NUMBER : [0-9]+;
WS : [ \\t\\n\\r]+ -> skip;
`;

console.log('=== Original Grammar ===');
console.log(grammar);

console.log('\n=== Analyze Original ===');
const analysis1 = AntlrAnalyzer.analyze(grammar);
console.log(`Found ${analysis1.rules.length} rules:`);
analysis1.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

console.log('\n=== Try to Add Duplicate "NUMBER" ===');
const result1 = AntlrAnalyzer.addLexerRule(grammar, 'NUMBER', '[0-9]+');
console.log(`Success: ${result1.success}`);
console.log(`Message: ${result1.message}`);

console.log('\n=== Try to Add Duplicate "expr" ===');
const result2 = AntlrAnalyzer.addParserRule(grammar, 'expr', 'term');
console.log(`Success: ${result2.success}`);
console.log(`Message: ${result2.message}`);

console.log('\n=== Add NEW rule "statement" ===');
const result3 = AntlrAnalyzer.addParserRule(grammar, 'statement', 'expr');
console.log(`Success: ${result3.success}`);
console.log(`Message: ${result3.message}`);

if (result3.success) {
  console.log('\n=== Modified Grammar ===');
  console.log(result3.modified);

  console.log('\n=== Analyze Modified ===');
  const analysis2 = AntlrAnalyzer.analyze(result3.modified);
  console.log(`Found ${analysis2.rules.length} rules:`);
  analysis2.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

  // Check for duplicates
  const names = analysis2.rules.map(r => r.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    console.log(`\n❌ DUPLICATES FOUND: ${duplicates.join(', ')}`);
  } else {
    console.log(`\n✓ No duplicates`);
  }
}
