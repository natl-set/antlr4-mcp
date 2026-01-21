# ANTLR4 MCP Server

**Grammar debugging and manipulation toolkit for Claude Desktop**

[![CI](https://github.com/natl-set/antlr4-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/natl-set/antlr4-mcp/actions/workflows/ci.yml)
[![GitHub](https://img.shields.io/badge/github-natl--set%2Fantlr4--mcp-blue)](https://github.com/natl-set/antlr4-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server that gives Claude AI the ability to read, analyze, modify, and debug ANTLR4 grammars. Perfect for working with complex parsers, fixing grammar issues, and understanding large multi-file grammars.


[![GitHub](https://img.shields.io/badge/github-natl--set%2Fantlr4--mcp-blue)](https://github.com/natl-set/antlr4-mcp)

## What is this?

This tool lets Claude AI help you with ANTLR4 grammars by providing 30+ specialized tools. Instead of manually editing grammar files and running the ANTLR compiler repeatedly, Claude can:

- **Find bugs** in your grammar (like using `?` when you need `*`)
- **Understand structure** across multiple imported grammar files
- **Suggest fixes** with context-aware token patterns
- **Make precise edits** with diff output showing only changes
- **Aggregate warnings** - Turn 17,000 warnings into 10 actionable items

## Why use this?

**Traditional ANTLR workflow:**
1. Edit grammar file
2. Run ANTLR compiler
3. See 17,000 warnings
4. Grep through them manually
5. Guess which ones matter
6. Repeat

**With this tool + Claude:**
1. Ask Claude "What's wrong with my grammar?"
2. Claude analyzes and says "You have 9 missing tokens and 8 quantifier bugs"
3. Claude shows you exactly which rules need `*` instead of `?`
4. Claude can fix them all at once or let you pick specific ones
5. Done in 30 minutes instead of hours

## Features

- **29+ specialized grammar tools** for analysis, validation, and modification
- **Smart validation** - Aggregates 17,000+ warnings into 10 actionable items  
- **Multi-file grammar support** - Load and analyze imported grammars
- **Pattern detection** - Finds suspicious quantifiers and anti-patterns
- **Selective bulk fixes** - Fix specific rules or all detected issues
- **Context-aware suggestions** - Smart token pattern recommendations
- **Output limiting** - Handle large grammars without token overflow
- **Diff mode** - See only changes, not full files

## Installation

### Prerequisites

- Node.js 18+ and npm
- Claude Desktop or any MCP-compatible client
- Optional: Java + ANTLR4 for native runtime (100% accurate parsing)

### Setup

1. **Clone and build:**
```bash
git clone https://github.com/natl-set/antlr4-mcp.git
cd antlr4-mcp
npm install
npm run build
```

2. **Configure Claude Desktop:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "antlr4": {
      "command": "node",
      "args": ["/path/to/antlr4-mcp/dist/index.js"]
    }
  }
}
```

3. **Restart Claude Desktop**

## Quick Start

### Example 1: Validate a Large Grammar

```javascript
// Old way: 17,234 individual warnings
await use_mcp_tool("antlr4", "validate-grammar", {
  from_file: "MyGrammar.g4",
  max_issues: 100
});

// New way: Smart validation
await use_mcp_tool("antlr4", "smart-validate", {
  from_file: "MyGrammar.g4",
  load_imports: true
});

// Output:
// 📊 Total: 17,234 issues across 3 categories
// 1. Undefined tokens (15,890 refs, 9 unique)
//    → Add ADDRESS_REGEX (89 refs), EVENT_TYPE (67 refs)
// 2. Suspicious quantifiers (8 rules)
//    → bgpp_export: rule? should be rule*
// 3. Incomplete parsing (3 rules)
//    → ss_ssl_tls_service_profile uses null_rest_of_line
```

### Example 2: Find and Fix Quantifier Issues

```javascript
// Step 1: Detect issues
await use_mcp_tool("antlr4", "detect-quantifier-issues", {
  from_file: "PaloAlto_interface.g4"
});

// Output shows:
// ⚠️  snie_ethernet (line 45)
//    Pattern: )? 
//    Suggestion: Change to )* for multiple occurrences
//
// ⚠️  snie_lacp (line 62)
//    Pattern: )? 
//    Suggestion: Change to )* for multiple occurrences
// 
// ... (15 total issues)

// Step 2: Fix specific rules you want to change
await use_mcp_tool("antlr4", "fix-quantifier-issues", {
  from_file: "PaloAlto_interface.g4",
  rule_names: ["snie_ethernet", "snie_lacp", "snil_units"],
  output_mode: "diff",
  write_to_file: true
});

// Shows diff:
// @@ -49,7 +49,7 @@
//      | snie_layer2
//      | snie_layer3
//      | snie_virtual_wire
// -    )?
// +    )*
//  ;

// Or fix all detected issues at once:
await use_mcp_tool("antlr4", "fix-quantifier-issues", {
  from_file: "PaloAlto_interface.g4",
  write_to_file: true  // Omit rule_names to fix all
});
```

### Example 3: Add and Test a Token

```javascript
// Add token with diff output (see only changes)
await use_mcp_tool("antlr4", "add-rule", {
  from_file: "MyGrammar.g4",
  rule_name: "EQUALS",
  pattern: "'='",
  output_mode: "diff",
  write_to_file: true
});

// Test it
await use_mcp_tool("antlr4", "preview-tokens", {
  from_file: "MyGrammar.g4",
  input: "x = 42"
});
```

## Key Tools

### Smart Validation

- **smart-validate** - Comprehensive analysis with aggregation
- **detect-quantifier-issues** - Find `?` that should be `*`
- **detect-incomplete-parsing** - Find anti-patterns

### Analysis & Validation

- **analyze-grammar** - Structure analysis with `summary_only` option
- **validate-grammar** - Syntax validation with `max_issues` limit
- **find-rule-usages** - Multi-file usage tracking

### Grammar Manipulation

- **add-rule** - Auto-detects lexer/parser from naming
- **update-rule** - Modify existing rules
- **remove-rule** - Delete rules safely
- **rename-rule** - Rename with reference updates
- **move-rule** - Reposition rules
- **sort-rules** - Alphabetical sorting
- **inline-rule** - Inline single-use rules

### Testing & Preview

- **test-parser-rule** - Test parser rules with inputs
- **preview-tokens** - See tokenization results
- **test-lexer-rule** - Test lexer patterns

### Bulk Operations

- **batch-create-tokens** - Generate multiple tokens
- **suggest-tokens-from-errors** - Parse error logs

[See all 29+ tools →](FEATURES.md)

## Real-World Impact

Tested on **Palo Alto firewall configuration grammar** (36 files, 1500+ lines):

**Before smart validation:**
- 17,234 individual warnings
- Hours of manual grep/analysis
- Hard to identify root causes

**After smart validation:**
- 3 issue categories
- 9 missing tokens (with suggested patterns)
- 8 quantifier bugs (with specific fixes)
- 3 incomplete parsing patterns
- **Fixed in 30 minutes**

### Bugs Found

1. **Quantifier bugs** (8 rules)
   ```
   bgpp_export: rule?  // Should be rule*
   ```
   Impact: 1,200+ warnings

2. **Missing tokens** (9 tokens)
   ```
   ADDRESS_REGEX, EVENT_TYPE, USERNAME_REGEX, ...
   ```
   Impact: 15,890 warnings

3. **Incomplete parsing** (3 rules)
   ```
   rule: ... null_rest_of_line  // Discards content
   ```
   Impact: 144 warnings

## Documentation

- [Features Overview](FEATURES.md) - All 29+ tools explained
- [Smart Validation Guide](SMART_VALIDATION.md) - Complete guide with examples
- [Tool Specifications](docs/specs/) - Detailed specs for key features

## Development

### Build
```bash
npm run build
```

### Run Tests
```bash
cd tests
bash run-all-tests.sh
```

### Test Suites
- Data loss prevention
- Output limiting
- Diff output mode  
- Smart validation
- Timeout prevention

All tests passing ✅

## Architecture

- **src/index.ts** - MCP server implementation
- **src/antlrAnalyzer.ts** - Core grammar analysis engine
- **src/antlr4Runtime.ts** - Native ANTLR4 runtime integration

## Contributing

Issues and pull requests welcome at [github.com/natl-set/antlr4-mcp](https://github.com/natl-set/antlr4-mcp)

## License

MIT

## Credits

Built with the Model Context Protocol (MCP) by Anthropic.
