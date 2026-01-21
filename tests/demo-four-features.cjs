#!/usr/bin/env node

/**
 * Demo: Four New ANTLR4-MCP Features
 * 
 * This demo showcases all 4 new features:
 * 1. test-parser-rule - Quick validation
 * 2. inline-rule - Safe rule inlining
 * 3. sort-rules - Flexible sorting
 * 4. analyze-ambiguities - Ambiguity detection
 */

const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║   DEMO: Four New ANTLR4-MCP Features                     ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

// Sample grammar for demonstration
const demoGrammar = `grammar Demo;

// Parser rules
program: statement+;
statement: assignment | expression;
assignment: ID ASSIGN expression SEMI;
expression: term ((PLUS | MINUS) term)*;
term: NUMBER | ID;

// Lexer rules
ID: [a-z]+;
NUMBER: [0-9]+;
PLUS: '+';
MINUS: '-';
ASSIGN: '=';
SEMI: ';';
WS: [ \\t\\n\\r]+ -> skip;
`;

// ==============================================================================
// Feature 1: test-parser-rule
// ==============================================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('1️⃣  Feature: test-parser-rule');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📝 Test if input matches parser rules WITHOUT compilation\n');

const testCases = [
  { rule: 'assignment', input: 'x = 42;', expected: true },
  { rule: 'expression', input: 'a + b - c', expected: true },
  { rule: 'term', input: '123', expected: true },
  { rule: 'assignment', input: 'x + 5', expected: false },
];

testCases.forEach(({ rule, input, expected }) => {
  const result = AntlrAnalyzer.testParserRule(demoGrammar, rule, input);
  const icon = result.success ? '✅' : '❌';
  const confidence = result.confidence ? ` (${result.confidence})` : '';
  console.log(`${icon} Rule "${rule}" with input "${input}": ${result.message}${confidence}`);
});

// ==============================================================================
// Feature 2: inline-rule
// ==============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('2️⃣  Feature: inline-rule');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔄 Inline helper rules to simplify grammar\n');

const grammarWithHelper = `grammar Test;
expr: primary;
primary: NUMBER | ID;
NUMBER: [0-9]+;
ID: [a-z]+;
`;

console.log('Before:');
console.log('  expr: primary;');
console.log('  primary: NUMBER | ID;');

const inlineResult = AntlrAnalyzer.inlineRule(grammarWithHelper, 'primary');

if (inlineResult.success) {
  console.log('\n✅ After inlining "primary":');
  console.log('  expr: (NUMBER | ID);');
  console.log(`\nℹ️  ${inlineResult.message}`);
  console.log(`   Referenced in ${inlineResult.stats?.referenceCount || 0} location(s)`);
}

// ==============================================================================
// Feature 3: sort-rules
// ==============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('3️⃣  Feature: sort-rules');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('📊 Sort rules by different strategies\n');

const unsortedGrammar = `grammar Test;
zebra: ID;
apple: NUMBER;
banana: zebra;
ID: [a-z]+;
NUMBER: [0-9]+;
`;

const strategies = ['alphabetical', 'type', 'dependency', 'usage'];

strategies.forEach(strategy => {
  const sortResult = AntlrAnalyzer.sortRules(unsortedGrammar, strategy);
  if (sortResult.success) {
    console.log(`✅ ${strategy.charAt(0).toUpperCase() + strategy.slice(1)} sort: ${sortResult.message}`);
  }
});

console.log('\nℹ️  Example: Alphabetical sort orders rules A-Z');
console.log('   Type sort groups parser rules together, then lexer rules');
console.log('   Dependency sort orders by rule dependencies');
console.log('   Usage sort orders by how often rules are referenced');

// ==============================================================================
// Feature 4: analyze-ambiguities
// ==============================================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('4️⃣  Feature: analyze-ambiguities');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🔍 Detect ambiguity patterns BEFORE compilation\n');

const ambiguousGrammar = `grammar Test;
// Duplicate alternative (ERROR)
expr: ID | NUMBER | ID;

// Overlapping prefix (WARNING)
stmt: IF expr THEN stmt | IF expr THEN stmt ELSE stmt;

// Ambiguous optional (WARNING)
decl: TYPE? TYPE ID;

IF: 'if';
THEN: 'then';
ELSE: 'else';
TYPE: 'int' | 'bool';
ID: [a-z]+;
NUMBER: [0-9]+;
`;

const ambiguityResult = AntlrAnalyzer.analyzeAmbiguities(ambiguousGrammar);

console.log(`Analysis Summary:`);
console.log(`  Rules analyzed: ${ambiguityResult.summary.rulesAnalyzed}`);
console.log(`  🔴 Errors: ${ambiguityResult.summary.errors}`);
console.log(`  ⚠️  Warnings: ${ambiguityResult.summary.warnings}`);
console.log(`  ℹ️  Infos: ${ambiguityResult.summary.infos}\n`);

if (ambiguityResult.issues.length > 0) {
  console.log('Issues detected:');
  
  const errors = ambiguityResult.issues.filter(i => i.severity === 'error');
  const warnings = ambiguityResult.issues.filter(i => i.severity === 'warning');
  
  if (errors.length > 0) {
    console.log('\n🔴 ERRORS (must fix):');
    errors.forEach(issue => {
      console.log(`  • ${issue.rule}: ${issue.description}`);
      if (issue.suggestion) {
        console.log(`    💡 ${issue.suggestion}`);
      }
    });
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (should review):');
    warnings.forEach(issue => {
      console.log(`  • ${issue.rule}: ${issue.description}`);
      if (issue.suggestion) {
        console.log(`    💡 ${issue.suggestion}`);
      }
    });
  }
}

// ==============================================================================
// Summary
// ==============================================================================
console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║   Summary: All 4 Features Demonstrated!                  ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('✅ test-parser-rule: Quick validation without compilation');
console.log('✅ inline-rule: Safe rule inlining with circular detection');
console.log('✅ sort-rules: Flexible sorting (4 strategies)');
console.log('✅ analyze-ambiguities: Comprehensive ambiguity detection\n');

console.log('📚 See FOUR_FEATURES_COMPLETE.md for detailed documentation');
console.log('🧪 Run test suites: node test-*.js / test-*.cjs\n');
