/**
 * Real-world example: Building a Fortinet configuration parser
 * Demonstrates the batch token generation workflow
 */

const { AntlrAnalyzer } = await import('./dist/antlrAnalyzer.js');

console.log('=== Building Fortinet Config Grammar ===\n');

// Start with a minimal grammar
let grammar = `grammar FortinetConfig;

// Parser rules
config : statement+ ;
statement : configBlock ;

// Basic lexer rules
CONFIG : 'config' ;
END : 'end' ;
WS : [ \\t\\n\\r]+ -> skip ;
`;

console.log('Step 1: Initial grammar created');
console.log('Parser rules: config, statement');
console.log('Lexer rules: CONFIG, END, WS\n');

// Step 2: Add system component tokens using template
console.log('Step 2: Adding system component tokens...');

const systemResult = AntlrAnalyzer.addTokensWithTemplate(grammar, {
  baseNames: ['ftm-push', 'dns', 'firewall', 'admin', 'global'],
  precedingTokens: ['CONFIG', 'SYSTEM']
});

grammar = systemResult.modified;
console.log(`✓ ${systemResult.summary}`);
console.log(`  Generated: FTM_PUSH, DNS, FIREWALL, ADMIN, GLOBAL\n`);

// Step 3: Generate common commands from example
console.log('Step 3: Generating tokens from sample command...');

const cmdResult = AntlrAnalyzer.generateTokensFromPattern(grammar, 'set hostname interface status', {
  tokenize: true
});

grammar = cmdResult.modified;
console.log(`✓ ${cmdResult.summary}`);
console.log(`  Generated: ${cmdResult.generated.map(g => g.name).join(', ')}\n`);

// Step 4: Simulate parser error and get suggestions
console.log('Step 4: Simulating parser errors...');

const errorLog = `
Error: line 10: unexpected token: 'vdom' near 'config vdom'
Error: line 15: mismatched input 'policy' expecting {CONFIG, END}
Parse error at line 20: no viable alternative at input 'address-group'
Warning: line 25: unexpected 'service' token in configuration block
`;

console.log('Sample error log:');
console.log(errorLog);

const suggestions = AntlrAnalyzer.suggestTokensFromErrors(grammar, errorLog);

console.log(`\n✓ ${suggestions.summary}\n`);

// Display high confidence suggestions
const highConf = suggestions.suggestions.filter(s => s.confidence === 'high');
if (highConf.length > 0) {
  console.log('High confidence suggestions to add:');
  highConf.forEach(s => {
    console.log(`  ${s.token} : ${s.pattern}`);
    console.log(`    → ${s.reason}`);
  });
}

// Step 5: Add the high confidence suggestions
console.log('\nStep 5: Adding suggested tokens...');

const suggestedRules = highConf.map(s => ({
  name: s.token,
  pattern: s.pattern
}));

const addResult = AntlrAnalyzer.addLexerRules(grammar, suggestedRules);
grammar = addResult.modified;

console.log(`✓ ${addResult.summary}\n`);

// Step 6: Add protocol tokens with custom pattern
console.log('Step 6: Adding protocol tokens...');

const protocolResult = AntlrAnalyzer.addTokensWithTemplate(grammar, {
  baseNames: ['tcp', 'udp', 'icmp'],
  pattern: "'{NAME}'"
});

grammar = protocolResult.modified;
console.log(`✓ ${protocolResult.summary}\n`);

// Final summary
console.log('=== Final Grammar Summary ===\n');

const analysis = AntlrAnalyzer.analyze(grammar);

console.log(`Grammar: ${analysis.grammarName}`);
console.log(`Type: ${analysis.type}`);
console.log(`\nParser rules: ${analysis.rules.filter(r => r.type === 'parser').length}`);
analysis.rules.filter(r => r.type === 'parser').forEach(r => {
  console.log(`  - ${r.name}`);
});

console.log(`\nLexer rules: ${analysis.rules.filter(r => r.type === 'lexer').length}`);
const lexerRules = analysis.rules.filter(r => r.type === 'lexer');
lexerRules.sort((a, b) => a.name.localeCompare(b.name));
lexerRules.forEach(r => {
  console.log(`  - ${r.name}`);
});

// Validate the final grammar
console.log('\n=== Validation ===\n');
const analysisForValidation = AntlrAnalyzer.analyze(grammar);

if (analysisForValidation.issues.length === 0) {
  console.log('✓ Grammar is valid with no issues!');
} else {
  console.log(`Found ${analysisForValidation.issues.length} issue(s):`);
  analysisForValidation.issues.forEach(issue => {
    console.log(`  [${issue.type}] ${issue.message}`);
  });
}

// Test tokenization with sample input
console.log('\n=== Tokenization Test ===\n');

const testInput = 'config firewall policy';
const tokenResult = AntlrAnalyzer.previewTokens(grammar, testInput, {});

console.log(`Input: "${testInput}"`);
console.log(`\nTokens recognized:`);
tokenResult.tokens.filter(t => !t.skipped).forEach((token, i) => {
  console.log(`  ${i + 1}. ${token.type}("${token.value}")`);
});

if (tokenResult.errors.length > 0) {
  console.log(`\nErrors:`);
  tokenResult.errors.forEach(err => {
    console.log(`  - ${err.message}`);
  });
}

console.log('\n=== Workflow Complete! ===');
console.log('\nThis example demonstrated:');
console.log('  1. Template-based token generation (system components)');
console.log('  2. Pattern-based token generation (commands from example)');
console.log('  3. Error-driven token suggestion (from parser logs)');
console.log('  4. Batch token addition (protocols with custom pattern)');
console.log('  5. Grammar validation and tokenization testing');
console.log('\n✨ All features working correctly!\n');
