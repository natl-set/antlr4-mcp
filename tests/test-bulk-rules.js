import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const grammar = `grammar Test;

expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;

console.log('=== Original Grammar ===');
console.log(grammar);

console.log('\n=== Analyze Original ===');
const analysis1 = AntlrAnalyzer.analyze(grammar);
console.log(`Found ${analysis1.rules.length} rules:`);
analysis1.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

console.log('\n=== Test 1: Add Multiple Lexer Rules ===');
const lexerResult = AntlrAnalyzer.addLexerRules(grammar, [
  { name: 'ID', pattern: '[a-zA-Z_][a-zA-Z0-9_]*' },
  { name: 'STRING', pattern: '".*?"' },
  { name: 'WS', pattern: '[ \\t\\n\\r]+', options: { skip: true } }
]);

console.log(lexerResult.summary);
lexerResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});

if (lexerResult.success) {
  console.log('\n=== Grammar After Adding Lexer Rules ===');
  console.log(lexerResult.modified);

  console.log('\n=== Verify Rules Were Added ===');
  const analysis2 = AntlrAnalyzer.analyze(lexerResult.modified);
  console.log(`Found ${analysis2.rules.length} rules:`);
  analysis2.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));
}

console.log('\n\n=== Test 2: Add Multiple Parser Rules ===');
const parserResult = AntlrAnalyzer.addParserRules(grammar, [
  { name: 'statement', definition: 'expr' },
  { name: 'program', definition: 'statement*' }
]);

console.log(parserResult.summary);
parserResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});

if (parserResult.success) {
  console.log('\n=== Grammar After Adding Parser Rules ===');
  console.log(parserResult.modified);

  console.log('\n=== Verify Rules Were Added ===');
  const analysis3 = AntlrAnalyzer.analyze(parserResult.modified);
  console.log(`Found ${analysis3.rules.length} rules:`);
  analysis3.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));
}

console.log('\n\n=== Test 3: Add Mixed Parser and Lexer Rules ===');
const mixedResult = AntlrAnalyzer.addRules(grammar, [
  { type: 'parser', name: 'statement', definition: 'expr' },
  { type: 'lexer', name: 'ID', pattern: '[a-zA-Z_][a-zA-Z0-9_]*' },
  { type: 'parser', name: 'program', definition: 'statement*' },
  { type: 'lexer', name: 'WS', pattern: '[ \\t\\n\\r]+', options: { skip: true } }
]);

console.log(mixedResult.summary);
mixedResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name} (${r.type}): ${r.message}`);
});

if (mixedResult.success) {
  console.log('\n=== Grammar After Adding Mixed Rules ===');
  console.log(mixedResult.modified);

  console.log('\n=== Verify Rules Were Added ===');
  const analysis4 = AntlrAnalyzer.analyze(mixedResult.modified);
  console.log(`Found ${analysis4.rules.length} rules:`);
  analysis4.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));
}

console.log('\n\n=== Test 4: Try Adding Duplicates (Should Fail) ===');
const duplicateResult = AntlrAnalyzer.addLexerRules(grammar, [
  { name: 'NUMBER', pattern: '[0-9]+' },
  { name: 'ID', pattern: '[a-zA-Z_][a-zA-Z0-9_]*' }
]);

console.log(duplicateResult.summary);
duplicateResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});
