import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';
import fs from 'fs';

// Create a temporary test file
const testFile = '/tmp/test-grammar.g4';
const originalGrammar = `grammar Test;

expr : term;
term : NUMBER;
NUMBER : [0-9]+;
`;

// Write the initial test file
fs.writeFileSync(testFile, originalGrammar, 'utf-8');
console.log('=== Created test file ===');
console.log(`File: ${testFile}`);
console.log('Initial content:\n' + originalGrammar);

// Read the file back and add a rule
console.log('\n=== Adding lexer rule using add-lexer-rule ===');
const grammarContent = fs.readFileSync(testFile, 'utf-8');
const result1 = AntlrAnalyzer.addLexerRule(grammarContent, 'ID', '[a-zA-Z_][a-zA-Z0-9_]*');

if (result1.success) {
  console.log(`Success: ${result1.message}`);
  // Simulate writing to file (like the MCP tool would do)
  fs.writeFileSync(testFile, result1.modified, 'utf-8');
  console.log('✓ File updated with new rule');
}

// Verify the file was updated
const updatedContent1 = fs.readFileSync(testFile, 'utf-8');
console.log('\nUpdated file content:\n' + updatedContent1);

// Add another rule using bulk operation
console.log('\n=== Adding multiple lexer rules using add-lexer-rules ===');
const result2 = AntlrAnalyzer.addLexerRules(updatedContent1, [
  { name: 'STRING', pattern: '".*?"' },
  { name: 'WS', pattern: '[ \\t\\n\\r]+', options: { skip: true } }
]);

console.log(`Summary: ${result2.summary}`);
if (result2.success) {
  console.log('✓ All rules added successfully');
  // Simulate writing to file
  fs.writeFileSync(testFile, result2.modified, 'utf-8');
  console.log('✓ File updated with new rules');
}

// Verify the file was updated
const updatedContent2 = fs.readFileSync(testFile, 'utf-8');
console.log('\nFinal file content:\n' + updatedContent2);

// Verify the rules are actually there
console.log('\n=== Analyzing final grammar ===');
const analysis = AntlrAnalyzer.analyze(updatedContent2);
console.log(`Found ${analysis.rules.length} rules:`);
analysis.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

// Cleanup
fs.unlinkSync(testFile);
console.log(`\n✓ Test complete - temp file cleaned up`);
