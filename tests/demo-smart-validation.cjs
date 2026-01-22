#!/usr/bin/env node
/**
 * Demo: Smart Validation Tools in Action
 * Shows how the new tools solve real-world problems
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');

// Realistic grammar with the issues found in Palo Alto grammar
const REALISTIC_GRAMMAR = `
grammar PaloAltoSubset;

// BGP Policy Rules - ISSUE: should use * not ?
bgpp_export: EXPORT bgp_policy_rule?;
bgpp_import: IMPORT bgp_policy_rule?;

bgp_policy_rule: rule_name properties;

// Security Rules - ISSUE: multiple optionals should be alternatives with *
srs_definition: 
  SET SECURITY RULES rule_name 
  source_setting? 
  destination_setting? 
  action_setting?
  service_setting?;

sr_security_rules: RULES rule_def?;  // ISSUE: should be *

// SSL/TLS Service Profile - ISSUE: uses null_rest_of_line (discards content)
ss_ssl_tls_service_profile: 
  SET SERVICE SSL_TLS_SERVICE_PROFILE profile_name null_rest_of_line;

// User ID Collector - ISSUE: should use * not ?
s_user_id_collector: 
  SET USER_ID_COLLECTOR collector_name setting?;

// Rules reference undefined tokens (not defined below)
rule_name: WORD | ADDRESS_REGEX | EVENT_TYPE;
properties: WORD+;
source_setting: SOURCE ADDRESS_REGEX;
destination_setting: DESTINATION ADDRESS_REGEX;
action_setting: ACTION (ALLOW | DENY);
service_setting: SERVICE_TYPE USERNAME_REGEX;
setting: MGMT_INTERFACE | SERVER_MONITOR | SYSLOG_PARSE_PROFILE;
profile_name: WORD;
collector_name: WORD;
rule_def: WORD+;

// Defined tokens (some are missing)
EXPORT: 'export';
IMPORT: 'import';
SET: 'set';
SECURITY: 'security';
RULES: 'rules';
SOURCE: 'source';
DESTINATION: 'destination';
ACTION: 'action';
ALLOW: 'allow';
DENY: 'deny';
SERVICE: 'service';
SSL_TLS_SERVICE_PROFILE: 'ssl-tls-service-profile';
USER_ID_COLLECTOR: 'user-id-collector';
SERVICE_TYPE: 'service-type';
WORD: [a-z][a-z0-9_-]*;

// Missing tokens that are referenced above:
// - ADDRESS_REGEX
// - EVENT_TYPE
// - USERNAME_REGEX
// - MGMT_INTERFACE
// - SERVER_MONITOR
// - SYSLOG_PARSE_PROFILE

fragment NEWLINE: '\\r'? '\\n';
null_rest_of_line: ~[\\r\\n]+ NEWLINE?;
WS: [ \\t\\r\\n]+ -> skip;
`;

console.log('═══════════════════════════════════════════════════════════');
console.log('  SMART VALIDATION DEMO - Real-World Grammar Issues');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📝 Grammar Overview:');
console.log('  - Subset of Palo Alto firewall configuration grammar');
console.log('  - Contains real issues found in production grammar');
console.log('  - 6 missing tokens, 5 quantifier issues, 1 incomplete parsing\n');

// Demo 1: Basic validation (the old way - too noisy)
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo 1: Basic Validation (Old Way)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const analysis = AntlrAnalyzer.analyze(REALISTIC_GRAMMAR);
console.log(`Total issues found: ${analysis.issues.length}`);
console.log('\nFirst 10 warnings (truncated for readability):\n');
for (let i = 0; i < Math.min(10, analysis.issues.length); i++) {
  const issue = analysis.issues[i];
  console.log(`  ${i+1}. [${issue.severity}] ${issue.message.substring(0, 80)}...`);
}
console.log(`\n  ... and ${analysis.issues.length - 10} more warnings`);
console.log('\n❌ Problem: Too many similar warnings, hard to prioritize!\n');

// Demo 2: Smart validation aggregation
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo 2: Smart Validation Aggregation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const aggregated = AntlrAnalyzer.aggregateValidationIssues(analysis.issues);
console.log(`${aggregated.summary}\n`);

for (const group of aggregated.groups) {
  console.log(`📊 ${group.category}`);
  console.log(`   Total: ${group.count} occurrences`);
  console.log(`   Unique: ${group.uniqueItems} items`);
  if (group.suggestion) {
    console.log(`   💡 ${group.suggestion}`);
  }
  console.log(`   Top offenders:`);
  for (const item of group.topItems.slice(0, 5)) {
    console.log(`      - ${item.name}${item.count > 1 ? ` (${item.count} refs)` : ''}`);
  }
  console.log('');
}

console.log('✅ Result: Clear priorities! Focus on 6 missing tokens first.\n');

// Demo 3: Quantifier detection
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo 3: Suspicious Quantifier Detection');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
console.log(`Found ${suspicious.length} suspicious quantifier patterns:\n`);

for (const issue of suspicious) {
  console.log(`⚠️  ${issue.ruleName} (line ${issue.lineNumber})`);
  console.log(`   Pattern: ${issue.pattern}`);
  console.log(`   💡 ${issue.suggestion}`);
  console.log(`   📝 ${issue.reasoning}\n`);
}

console.log('✅ Result: Specific fixes for each rule!\n');

// Demo 4: Incomplete parsing detection
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo 4: Incomplete Parsing Detection');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);
console.log(`Found ${incomplete.length} anti-pattern(s):\n`);

for (const issue of incomplete) {
  console.log(`🚨 ${issue.ruleName} (line ${issue.lineNumber})`);
  console.log(`   Anti-pattern: ${issue.pattern}`);
  console.log(`   💡 ${issue.suggestion}\n`);
}

console.log('✅ Result: Know which rules need proper structure!\n');

// Demo 5: Smart token suggestions
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Demo 5: Smart Token Suggestions');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const undefinedGroup = aggregated.groups.find(g => g.category === 'Undefined Token References');
if (undefinedGroup) {
  const undefinedTokens = undefinedGroup.topItems.map(t => t.name);
  const suggestions = AntlrAnalyzer.suggestMissingTokens(undefinedTokens);
  
  console.log(`Generated smart patterns for ${suggestions.length} tokens:\n`);
  
  for (const sugg of suggestions) {
    console.log(`📝 ${sugg.tokenName}`);
    console.log(`   Pattern: ${sugg.suggestedPattern}`);
    console.log(`   Reasoning: ${sugg.reasoning}\n`);
  }
  
  console.log('✅ Result: Copy-paste ready token definitions!\n');
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SUMMARY: Before vs After');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('BEFORE (Basic Validation):');
console.log(`  - ${analysis.issues.length} individual warnings`);
console.log('  - Repetitive "undefined rule" messages');
console.log('  - Hard to identify root causes');
console.log('  - Manual analysis required\n');

console.log('AFTER (Smart Validation):');
console.log(`  - ${aggregated.groups.length} issue categories`);
console.log(`  - ${undefinedGroup ? undefinedGroup.uniqueItems : 0} missing tokens (clear priority)`);
console.log(`  - ${suspicious.length} quantifier issues (with specific fixes)`);
console.log(`  - ${incomplete.length} incomplete parsing patterns`);
console.log('  - Smart suggestions ready to implement\n');

console.log('⏱️  Time to Fix:');
console.log('  - Before: Hours of manual analysis');
console.log('  - After: 30 minutes with clear action items\n');

console.log('✅ Smart validation makes large grammar debugging practical!');
console.log('═══════════════════════════════════════════════════════════\n');
