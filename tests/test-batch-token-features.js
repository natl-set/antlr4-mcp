/**
 * Test the new batch token generation features
 */

const { AntlrAnalyzer } = await import('./dist/antlrAnalyzer.js');

// Test grammar
const testGrammar = `grammar TestGrammar;

// Parser rules
program : statement+ ;
statement : ID ASSIGN expression SEMI ;

// Lexer rules
ASSIGN : '=' ;
ID : [a-zA-Z_][a-zA-Z0-9_]* ;
SEMI : ';' ;
WS : [ \\t\\n\\r]+ -> skip ;
`;

console.log('=== Test 1: Add Tokens With Template ===\n');

const templateResult = AntlrAnalyzer.addTokensWithTemplate(testGrammar, {
  baseNames: ['ftm-push', 'dns', 'firewall', 'admin'],
  precedingTokens: ['SYSTEM', 'CONFIG'],
  options: {}
});

console.log('Summary:', templateResult.summary);
console.log('\nGenerated rules:');
templateResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});

console.log('\n=== Test 2: Generate Tokens From Pattern ===\n');

const patternResult = AntlrAnalyzer.generateTokensFromPattern(testGrammar, 'ignore config system ftm-push', {
  tokenize: true,
  options: {}
});

console.log('Summary:', patternResult.summary);
console.log('\nGenerated tokens:');
patternResult.generated.forEach(g => {
  console.log(`  ${g.name} : ${g.pattern}`);
});

console.log('\n=== Test 3: Generate Single Token ===\n');

const singleTokenResult = AntlrAnalyzer.generateTokensFromPattern(testGrammar, 'show-running-config', {
  tokenize: false,
  prefix: 'CMD',
  options: {}
});

console.log('Summary:', singleTokenResult.summary);
console.log('\nGenerated tokens:');
singleTokenResult.generated.forEach(g => {
  console.log(`  ${g.name} : ${g.pattern}`);
});

console.log('\n=== Test 4: Suggest Tokens From Errors ===\n');

const errorLog = `
Error parsing config line 10: unexpected token: 'ftm-push'
Error at line 15: mismatched input 'admin' expecting {CONFIG, SYSTEM}
Error: no viable alternative at input 'firewall'
Warning: found unexpected 'protocol' token
`;

const suggestResult = AntlrAnalyzer.suggestTokensFromErrors(testGrammar, errorLog);

console.log('Summary:', suggestResult.summary);
console.log('\nSuggestions:');
suggestResult.suggestions.forEach(s => {
  console.log(`  [${s.confidence}] ${s.token} : ${s.pattern}`);
  console.log(`    Reason: ${s.reason}`);
});

console.log('\n=== Test 5: Template With Custom Pattern ===\n');

const customPatternResult = AntlrAnalyzer.addTokensWithTemplate(testGrammar, {
  baseNames: ['tcp', 'udp', 'icmp'],
  pattern: "'protocol-{NAME}'",
  options: {}
});

console.log('Summary:', customPatternResult.summary);
console.log('\nGenerated rules:');
customPatternResult.results.forEach(r => {
  console.log(`  ${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`);
});

console.log('\n=== Test 6: Verify Existing Token Not Suggested ===\n');

const existingTokenError = `
Error: unexpected token: 'ASSIGN'
Error: unexpected token: 'newtoken'
`;

const existingResult = AntlrAnalyzer.suggestTokensFromErrors(testGrammar, existingTokenError);

console.log('Summary:', existingResult.summary);
console.log('\nSuggestions (should only suggest NEWTOKEN, not ASSIGN):');
existingResult.suggestions.forEach(s => {
  console.log(`  [${s.confidence}] ${s.token} : ${s.pattern}`);
});

console.log('\n✅ All tests completed!');
