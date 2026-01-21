import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';
import fs from 'fs';

console.log('=== MCP Workflow Test: Simulating Real Usage ===\n');

const testFile = '/tmp/nat-grammar.g4';
const initialGrammar = `grammar NAT;

config : rules;
rules : rule+;
rule : RULE_NAME COLON ruleBody SEMI;
ruleBody : PATTERN;

RULE_NAME : [A-Z_][A-Z0-9_]*;
PATTERN : [a-z0-9]+;
COLON : ':';
SEMI : ';';
`;

// Initialize test file
fs.writeFileSync(testFile, initialGrammar, 'utf-8');
console.log('Initial file content:');
console.log(initialGrammar);

// Simulate first MCP call (user adds DYNAMIC_IP_AND_PORT)
console.log('\n=== MCP Call 1: Add DYNAMIC_IP_AND_PORT (with write_to_file=true) ===');
let currentContent = fs.readFileSync(testFile, 'utf-8');
const call1 = AntlrAnalyzer.addLexerRule(
  currentContent,
  'DYNAMIC_IP_AND_PORT',
  '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}:[0-9]+'
);
console.log(`Result: ${call1.message}`);
if (call1.success) {
  fs.writeFileSync(testFile, call1.modified, 'utf-8');
  console.log('✓ Written to file');
}

// Simulate second MCP call (user adds same rule again by mistake)
console.log('\n=== MCP Call 2: Try to add DYNAMIC_IP_AND_PORT again ===');
currentContent = fs.readFileSync(testFile, 'utf-8');
const call2 = AntlrAnalyzer.addLexerRule(
  currentContent,
  'DYNAMIC_IP_AND_PORT',
  '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}:[0-9]+'
);
console.log(`Result: ${call2.message}`);
if (call2.success) {
  fs.writeFileSync(testFile, call2.modified, 'utf-8');
  console.log('✓ Written to file (THIS WOULD BE A BUG!)');
} else {
  console.log('✓ Correctly rejected duplicate');
}

// Simulate third MCP call (user adds STATIC_IP)
console.log('\n=== MCP Call 3: Add STATIC_IP ===');
currentContent = fs.readFileSync(testFile, 'utf-8');
const call3 = AntlrAnalyzer.addLexerRule(
  currentContent,
  'STATIC_IP',
  '[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}'
);
console.log(`Result: ${call3.message}`);
if (call3.success) {
  fs.writeFileSync(testFile, call3.modified, 'utf-8');
  console.log('✓ Written to file');
}

// Final verification
console.log('\n=== Final Grammar Analysis ===');
currentContent = fs.readFileSync(testFile, 'utf-8');
const analysis = AntlrAnalyzer.analyze(currentContent);
console.log(`Total rules: ${analysis.rules.length}`);
analysis.rules.forEach(r => console.log(`  - ${r.name} (${r.type})`));

const names = analysis.rules.map(r => r.name);
const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
if (duplicates.length > 0) {
  console.log(`\n✗ BUG FOUND: Duplicates in grammar: ${duplicates.join(', ')}`);
} else {
  console.log(`\n✓ No duplicates found`);
}

console.log('\n=== Final File Content ===');
console.log(currentContent);

// Cleanup
fs.unlinkSync(testFile);
