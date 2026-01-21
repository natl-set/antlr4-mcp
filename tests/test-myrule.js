import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const grammar = `grammar Test;

MyRule : 'x';
`;

console.log('Grammar:');
console.log(grammar);
console.log('---');

const analysis = AntlrAnalyzer.analyze(grammar);
console.log(`\nFound ${analysis.rules.length} rules:`);
analysis.rules.forEach((r, i) => {
  console.log(`${i+1}. ${r.name} (${r.type}): ${r.definition}`);
});

console.log('\n=== Checking if "MyRule" exists ===');
const exists = analysis.rules.some(r => r.name === 'MyRule');
console.log(`"MyRule" found: ${exists}`);

if (!exists && analysis.rules.length === 0) {
  console.log('\n❌ BUG: Rule with mixed case not detected!');
  console.log('   "MyRule" should be detected as a lexer rule');
}
