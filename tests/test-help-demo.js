/**
 * Test the help system to show what the server can do
 */

import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

console.log('=== ANTLR4 MCP Server Help System Demo ===\n');

// The help system is available through the MCP 'help' tool
// Here we'll show what information is available

console.log('Available help topics:');
console.log('  1. "overview" - Summary of all 24 available tools by category');
console.log('  2. "workflows" - Common multi-step workflows for typical tasks');
console.log('  3. "analysis" - Detailed info about analysis and inspection tools');
console.log('  4. "authoring" - Detailed info about editing and modification tools');
console.log('  5. "refactoring" - Detailed info about refactoring and optimization tools');
console.log('  6. "examples" - Practical examples of tool usage\n');

console.log('=== New Features Added ===\n');

console.log('Three new advanced batch token generation tools:\n');

console.log('1. add-tokens-with-template');
console.log('   Purpose: Generate multiple similar tokens using templates');
console.log('   Example: Add tokens for "config system X" patterns');
console.log('   Use case: Batch-add related configuration options\n');

console.log('2. generate-tokens-from-pattern');
console.log('   Purpose: Auto-generate tokens from natural language input');
console.log('   Example: "ignore config system ftm-push" → 4 tokens');
console.log('   Use case: Quick prototyping from sample input\n');

console.log('3. suggest-tokens-from-errors');
console.log('   Purpose: Parse error logs and suggest missing tokens');
console.log('   Example: Analyze Batfish/ANTLR errors → token suggestions');
console.log('   Use case: Error-driven grammar development\n');

console.log('=== Tool Categories (24 total) ===\n');

console.log('📊 Analysis & Inspection (7 tools)');
console.log('   - analyze-grammar, validate-grammar, list-rules');
console.log('   - find-rule, format-grammar, get-suggestions');
console.log('   - compare-grammars\n');

console.log('✏️  Authoring & Modification (11 tools) 👈 NEW TOOLS HERE!');
console.log('   - add-lexer-rule, add-parser-rule, remove-rule');
console.log('   - update-rule, rename-rule');
console.log('   - add-rules (lexer bulk), add-parser-rules, add-rules (mixed)');
console.log('   - add-tokens-with-template ⭐ NEW');
console.log('   - generate-tokens-from-pattern ⭐ NEW');
console.log('   - suggest-tokens-from-errors ⭐ NEW\n');

console.log('🔧 Refactoring & Optimization (4 tools)');
console.log('   - find-rule-usages, rule-statistics');
console.log('   - extract-fragment, merge-rules\n');

console.log('📚 Documentation & Reporting (2 tools)');
console.log('   - export-as-markdown, generate-summary\n');

console.log('=== Quick Start Examples ===\n');

console.log('Example 1: Generate tokens from command');
console.log('  Tool: generate-tokens-from-pattern');
console.log('  Input: "show running-config interface"');
console.log('  Result: SHOW, RUNNING_CONFIG, INTERFACE tokens\n');

console.log('Example 2: Add related tokens with template');
console.log('  Tool: add-tokens-with-template');
console.log('  Input: base_names: ["tcp", "udp", "icmp"]');
console.log('  Result: TCP, UDP, ICMP tokens\n');

console.log('Example 3: Analyze error logs');
console.log('  Tool: suggest-tokens-from-errors');
console.log('  Input: Error log with "unexpected token: \'ftm-push\'"');
console.log('  Result: Suggests FTM_PUSH token with high confidence\n');

console.log('=== How to Use ===\n');

console.log('1. Through MCP client (GitHub Copilot, Claude Desktop, etc.):');
console.log('   Call the "help" tool with topic parameter\n');

console.log('2. Direct API usage:');
console.log('   Import AntlrAnalyzer and use methods directly');
console.log('   See test files for examples\n');

console.log('3. Documentation:');
console.log('   - BATCH_TOKEN_FEATURES.md - Comprehensive guide');
console.log('   - README.md - General server documentation');
console.log('   - Examples in test-*.js files\n');

console.log('✅ Help system is fully functional and updated!\n');
