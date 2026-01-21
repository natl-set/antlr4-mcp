#!/usr/bin/env node
/**
 * Direct usage example - Works without MCP connection
 * Use this while waiting for MCP to reconnect
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';
import * as fs from 'fs';

// Your FortiOS grammar (replace with actual path if you have one)
const grammarFile = './examples/FortinetConfig.g4'; // adjust path as needed

// Example 1: Generate tokens from Batfish error log
console.log('=== Example 1: Parse Error Log ===\n');

const errorLog = `
Error at line 10: unexpected token: 'ftm-push'
Parse error: mismatched input 'vdom' expecting {CONFIG, END}
Error: no viable alternative at input 'address-group'
`;

let grammar = fs.existsSync(grammarFile) 
  ? fs.readFileSync(grammarFile, 'utf-8')
  : `grammar FortinetConfig;\nconfig : 'config' ;\nWS : [ \\t\\n\\r]+ -> skip ;\n`;

const suggestions = AntlrAnalyzer.suggestTokensFromErrors(grammar, errorLog);
console.log(suggestions.summary);
console.log('\nSuggestions:');
suggestions.suggestions.forEach(s => {
  console.log(`  [${s.confidence}] ${s.token} : ${s.pattern}`);
  console.log(`    → ${s.reason}`);
});

// Example 2: Generate tokens from sample config
console.log('\n=== Example 2: Generate from Sample ===\n');

const result = AntlrAnalyzer.generateTokensFromPattern(
  grammar, 
  'config system global set hostname',
  { tokenize: true }
);

console.log(result.summary);
console.log('\nGenerated:');
result.generated.forEach(g => console.log(`  ${g.name} : ${g.pattern}`));

grammar = result.modified;

// Example 3: Add protocol tokens
console.log('\n=== Example 3: Template Generation ===\n');

const templateResult = AntlrAnalyzer.addTokensWithTemplate(grammar, {
  baseNames: ['tcp', 'udp', 'icmp'],
  pattern: "'{NAME}'"
});

console.log(templateResult.summary);

grammar = templateResult.modified;

// Save the result
const outFile = './FortinetConfig-generated.g4';
fs.writeFileSync(outFile, grammar, 'utf-8');
console.log(`\n✅ Grammar saved to: ${outFile}`);

// Show final statistics
const analysis = AntlrAnalyzer.analyze(grammar);
console.log(`\nFinal stats: ${analysis.rules.length} rules total`);
console.log(`  - Parser: ${analysis.rules.filter(r => r.type === 'parser').length}`);
console.log(`  - Lexer: ${analysis.rules.filter(r => r.type === 'lexer').length}`);
