# CLAUDE.md

This file provides guidance for Claude Code (claude.ai/code) when working with ANTLR4 grammars using the antlr4-mcp tools.

## Overview

**antlr4-mcp** is an MCP (Model Context Protocol) server that gives Claude AI specialized tools for reading, analyzing, modifying, and debugging ANTLR4 grammars. It transforms the traditional error-prone workflow of manual grammar editing into an intelligent, automated process.

### What it does

- **Analyzes grammar structure** across multiple imported grammar files
- **Detects and fixes bugs** like incorrect quantifiers (`?` vs `*`)
- **Validates grammars** and aggregates thousands of warnings into actionable insights
- **Suggests improvements** with context-aware token patterns
- **Makes precise edits** with diff output showing only changes
- **Tests grammars** by previewing tokenization and parser rule behavior

### Key benefit

Turns 17,234 individual warnings into 10 actionable items in minutes instead of hours.

---

## When to Use

Use antlr4-mcp tools when working with ANTLR4 grammars in these scenarios:

### Validation & Debugging

- You have grammar files with thousands of warnings and need to identify real issues
- You're unsure why certain tokens aren't being recognized
- Your parser fails on specific inputs and you need to understand why
- You need to find quantifier bugs (using `?` when you should use `*`)

### Grammar Development

- You're creating a new grammar from scratch
- You need to add missing tokens or rules
- You want to refactor or reorganize existing rules
- You need to understand the structure of a large, multi-file grammar

### Maintenance & Evolution

- You need to rename rules and update all references
- You want to find where a specific rule is used
- You need to merge similar rules or extract common patterns
- You're documenting a grammar for others

---

## Example Prompts

Here are concrete prompts you can give Claude when working with ANTLR4 grammars:

### Initial Analysis

```
"Analyze my ANTLR4 grammar and identify any issues or potential problems."
```

```
"Validate MyGrammar.g4 and show me what's wrong with it."
```

```
"I'm getting 17,000 warnings when validating my grammar. Can you aggregate these and tell me what actually needs fixing?"
```

### Fixing Issues

```
"Find all the quantifier issues in my grammar and fix the ones related to 'export' and 'import' rules."
```

```
"Add the missing tokens ADDRESS_REGEX and EVENT_TYPE to my grammar with appropriate patterns."
```

```
"Rename the rule 'oldRule' to 'newRule' and update all references."
```

### Understanding Structure

```
"Show me how the 'expression' rule is structured and what other rules it references."
```

```
"Find all places where the 'IDENTIFIER' token is used in this grammar."
```

```
"Compare these two grammar files and tell me what's different."
```

### Testing

```
"Test how 'x = 42 + y' would be tokenized by my grammar."
```

```
"Test if the 'statement' rule can parse 'if (x) { return y; }'"
```

### Bulk Operations

```
"Add these 5 tokens to my lexer: EQUALS='=', PLUS='+', MINUS='-', TIMES='*', DIVIDE='/'"
```

```
"Create Markdown documentation for my grammar that I can use as a README."
```

---

## Key Tools

These are the most frequently used tools. For a complete list, use the `help` tool.

### Smart Validation (Start Here)

#### `smart-validate`
**The best starting point for any grammar analysis.**

Comprehensive validation that aggregates thousands of warnings into actionable categories.

**When to use:**
- First time analyzing a grammar
- Dealing with large numbers of warnings
- Need prioritized fix recommendations

**Key parameters:**
- `from_file`: Path to grammar file
- `load_imports`: Set to `true` to analyze imported grammars
- `include_suggestions`: Get smart token pattern recommendations

**Output:**
- Aggregated issue categories
- Specific rules needing fixes
- Suggested token patterns with reasoning
- Priority rankings

#### `detect-quantifier-issues`
Find rules using `?` (zero-or-one) that should use `*` (zero-or-more).

**When to use:**
- Parser is rejecting valid multi-occurrence inputs
- You see rules with `_rule`, `_setting`, `_list` suffixes using `?`
- Multiple optional elements in sequence (`a? b? c?`)

**Output:**
- Specific rules with issues
- Line numbers and current patterns
- Suggestions for fixes

### Grammar Manipulation

#### `add-rule` / `add-lexer-rule` / `add-parser-rule`
Add new rules to a grammar with automatic alphabetical sorting.

**When to use:**
- Adding missing tokens identified by validation
- Creating new parser rules
- Expanding grammar functionality

**Key parameters:**
- `from_file`: Path to grammar file
- `rule_name`: Name of the rule (UPPERCASE for lexer, lowercase for parser)
- `pattern` (lexer) or `definition` (parser): Rule definition
- `write_to_file`: Set to `true` to save changes
- `output_mode`: Use `"diff"` to see only changes

#### `update-rule`
Modify existing rule definitions.

**When to use:**
- Fixing bugs in rule definitions
- Changing rule behavior
- Adjusting quantifiers

#### `remove-rule`
Delete rules from a grammar.

**When to use:**
- Removing deprecated rules
- Cleaning up unused code

#### `rename-rule`
Rename a rule and update all references throughout the grammar.

**When to use:**
- Improving rule naming
- Following naming conventions
- Large-scale refactoring

### Analysis & Inspection

#### `analyze-grammar`
Extract complete grammar structure.

**When to use:**
- Understanding a new grammar
- Getting overview of all rules and imports
- Identifying dependencies

**Key parameters:**
- `from_file`: Path to grammar file
- `summary_only`: Set to `true` for condensed output

#### `find-rule`
Find rules by exact name or regex pattern.

**When to use:**
- Locating specific rules
- Finding all rules matching a pattern (e.g., `.*_setting`)
- Understanding rule relationships

**Key parameters:**
- `from_file`: Path to grammar file
- `rule_name`: Rule name or regex pattern
- `use_regex`: Set to `true` for pattern matching

#### `find-rule-usages`
Find all places where a specific rule is referenced.

**When to use:**
- Impact analysis before renaming
- Understanding dependencies
- Refactoring preparation

#### `validate-grammar`
Basic syntax validation with issue detection.

**When to use:**
- Quick syntax check
- Finding undefined references
- Identifying unused rules

**Key parameters:**
- `from_file`: Path to grammar file
- `max_issues`: Limit output (e.g., `100` for large grammars)

### Testing & Preview

#### `preview-tokens`
See how input text is tokenized by the lexer.

**When to use:**
- Understanding lexer behavior
- Debugging token recognition issues
- Verifying token patterns

**Example usage:**
```
Preview tokens for "x = 42 + y"
```

#### `test-parser-rule`
Test if a parser rule can parse specific input.

**When to use:**
- Verifying parser rule behavior
- Testing edge cases
- Debugging parse failures

#### `test-lexer-rule`
Test if a lexer rule matches specific input.

**When to use:**
- Verifying lexer patterns
- Testing regex patterns
- Debugging token recognition

### Bulk Operations

#### `add-rules` (mixed) / `add-parser-rules` (parser only)
Add multiple rules at once.

**When to use:**
- Adding many tokens/rules simultaneously
- Bulk grammar expansion
- Setting up new grammars quickly

#### `suggest-tokens-from-errors`
Parse error logs to suggest missing tokens.

**When to use:**
- After ANTLR compiler errors
- Converting error messages to token definitions
- Batch-fixing missing tokens

---

## Common Workflows

### Workflow 1: Fix a Grammar with Thousands of Warnings

**Scenario:** You have a large grammar with 17,000+ warnings and need to identify real issues.

**Step 1: Run smart validation**
```
"Use smart-validate on PaloAlto.g4 with load_imports enabled."
```

**Step 2: Review aggregated issues**
Claude will show you:
- 9 missing tokens causing 15,890 warnings
- 8 quantifier bugs causing 1,200 warnings
- 3 incomplete parsing patterns causing 144 warnings

**Step 3: Fix high-priority issues first**

Add missing tokens:
```
"Add ADDRESS_REGEX with pattern '[a-zA-Z0-9][a-zA-Z0-9._-]*' to my grammar."
```

Fix quantifier issues:
```
"Find quantifier issues and fix the rules bgpp_export and bgpp_import."
```

**Step 4: Verify fixes**
```
"Validate the grammar again to confirm issues are resolved."
```

### Workflow 2: Add Missing Tokens and Test Them

**Scenario:** Your grammar references tokens that don't exist.

**Step 1: Identify missing tokens**
```
"Validate MyGrammar.g4 and show me undefined tokens."
```

**Step 2: Add tokens with diff output**
```
"Add EQUALS with pattern '=' to MyGrammar.g4, use diff mode, and write to file."
```

Claude shows:
```diff
@@ -45,6 +45,7 @@
 PLUS: '+';
 MINUS: '-';
+EQUALS: '=';
 DIVIDE: '/';
```

**Step 3: Test the new token**
```
"Preview tokens for 'x = 42' to verify EQUALS is recognized."
```

### Workflow 3: Debug Quantifier Issues

**Scenario:** Your parser fails when it should accept multiple occurrences.

**Step 1: Detect quantifier issues**
```
"Detect quantifier issues in NetworkConfig.g4."
```

Claude finds:
```
⚠️  snie_ethernet (line 45)
   Pattern: )?
   Suggestion: Change to )* for multiple occurrences
```

**Step 2: Review the specific rule**
```
"Find the rule 'snie_ethernet' and show me its definition."
```

**Step 3: Fix specific issues**
```
"Fix quantifier issues for snie_ethernet and snie_lacp, use diff mode."
```

Claude shows:
```diff
@@ -49,7 +49,7 @@
      | snie_layer2
      | snie_layer3
      | snie_virtual_wire
-    )?
+    )*
 ;
```

**Step 4: Test the fix**
```
"Test the interface_rule with multiple ethernet entries."
```

### Workflow 4: Understand a Large Multi-File Grammar

**Scenario:** You're working with a grammar that imports other files and need to understand the structure.

**Step 1: Analyze with imports**
```
"Analyze MainGrammar.g4 with load_imports enabled."
```

**Step 2: Examine rule relationships**
```
"Find the 'statement' rule and show me what it references."
```

```
"Find all usages of the 'expression' rule across all files."
```

**Step 3: Generate documentation**
```
"Export my grammar as Markdown documentation."
```

### Workflow 5: Refactor Rules

**Scenario:** You need to rename rules and reorganize grammar structure.

**Step 1: Analyze impact**
```
"Find all usages of 'oldRuleName' before I rename it."
```

**Step 2: Rename with reference updates**
```
"Rename 'oldRuleName' to 'newRuleName' and update all references."
```

**Step 3: Merge similar rules**
```
"Merge 'httpMethod' and 'httpMethodV2' into a single 'httpMethod' rule."
```

**Step 4: Extract common patterns**
```
"Extract the pattern '[a-zA-Z][a-zA-Z0-9]*' as a fragment called 'IDENTIFIER'."
```

### Workflow 6: Test Grammar Behavior

**Scenario:** You want to verify how your grammar handles specific inputs.

**Step 1: Test lexer tokenization**
```
"Preview tokens for 'func add(x, y) { return x + y; }'"
```

**Step 2: Test parser rule**
```
"Test if the 'functionDecl' rule can parse 'func add(x, y) { return x + y; }'"
```

**Step 3: Debug failures**
```
"The parser failed. Analyze the 'functionDecl' rule and suggest why."
```

---

## Best Practices

### 1. Always use `from_file` parameter

When working with grammar files, always provide the `from_file` parameter instead of pasting content. This enables:
- Proper import resolution
- Accurate line numbers in error messages
- Direct file writing with `write_to_file`

### 2. Use diff mode for edits

When modifying grammars, use `output_mode: "diff"` to:
- See exactly what will change
- Verify edits before applying
- Reduce output token count

### 3. Validate after changes

After making edits, always validate to:
- Catch new issues introduced
- Confirm original issues are fixed
- Ensure grammar remains valid

### 4. Enable load_imports for multi-file grammars

When working with grammars that import other files:
- Use `load_imports: true`
- Provide `base_path` if grammars are in different directories
- This ensures complete analysis

### 5. Start with smart-validate

For any grammar analysis, start with `smart-validate` to:
- Get comprehensive overview
- See aggregated issues
- Receive prioritized recommendations

---

## Output Modes

Most grammar modification tools support three output modes:

### `full` (default)
Returns the complete modified grammar file.
- Use for: Small grammars, when you need to see everything

### `diff`
Returns only the changes (unified diff format).
- Use for: Large grammars, verifying changes, reducing output

### `none`
Returns only status messages (no grammar content).
- Use for: Bulk operations, when you only care about success/failure

---

## File Persistence

Tools that modify grammars support the `write_to_file` parameter:

### `write_to_file: false` (default)
- Changes are returned but not saved
- Use for: Previewing changes, testing modifications

### `write_to_file: true`
- Changes are written directly to the file
- Use for: Confirmed edits, automated workflows
- Safety: Includes data loss prevention (warns if file size reduces by 50%+)

---

## Getting Help

Use the built-in help tool for detailed information:

```
"Show me the help overview for ANTLR4 MCP tools."
```

```
"Show me help about workflows."
```

```
"Show me help about analysis tools."
```

The help tool provides:
- Complete tool listings by category
- Detailed parameter descriptions
- Practical usage examples
- Common workflow patterns

---

## Quick Reference

### Most Common Tools

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `smart-validate` | Comprehensive validation with aggregation | First step in analyzing any grammar |
| `detect-quantifier-issues` | Find `?` that should be `*` | Parser rejects valid multi-occurrence inputs |
| `add-rule` | Add new token or rule | Adding missing grammar elements |
| `update-rule` | Modify existing rule | Fixing bugs in definitions |
| `find-rule` | Find rules by name or pattern | Locating and understanding rules |
| `find-rule-usages` | Find all references to a rule | Before renaming or refactoring |
| `validate-grammar` | Basic syntax check | Quick validation |
| `preview-tokens` | Test lexer tokenization | Debugging token recognition |
| `analyze-grammar` | Extract grammar structure | Understanding new grammars |
| `export-as-markdown` | Generate documentation | Creating reference docs |

### Tool Categories

- **Smart Validation**: smart-validate, detect-quantifier-issues, detect-incomplete-parsing
- **Analysis**: analyze-grammar, validate-grammar, list-rules, find-rule, find-rule-usages
- **Authoring**: add-rule, add-lexer-rule, add-parser-rule, add-rules, update-rule, remove-rule, rename-rule
- **Refactoring**: merge-rules, extract-fragment, rule-statistics
- **Testing**: preview-tokens, test-parser-rule, test-lexer-rule
- **Documentation**: export-as-markdown, generate-summary
- **Comparison**: compare-grammars
- **Bulk**: add-rules, add-parser-rules, batch-create-tokens, suggest-tokens-from-errors

---

## Architecture Notes

### Project Structure

```
antlr4-mcp/
├── src/
│   ├── index.ts           # MCP server implementation
│   ├── antlrAnalyzer.ts   # Core grammar analysis engine
│   └── antlr4Runtime.ts   # Native ANTLR4 runtime integration
├── dist/                  # Compiled JavaScript
├── docs/
│   ├── FEATURES.md        # Complete tool documentation
│   └── SMART_VALIDATION.md # Smart validation guide
└── tests/                 # Test suites
```

### Key Features

- **Multi-file grammar support**: Load and analyze imported grammars
- **Smart aggregation**: Groups similar issues to reduce noise
- **Context-aware suggestions**: Recommends token patterns based on usage
- **Safety features**: Data loss prevention, diff previews
- **Output limiting**: Handle large grammars without token overflow
- **Pattern detection**: Finds common anti-patterns and bugs

### Integration

The MCP server integrates with Claude Desktop through `claude_desktop_config.json`:

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

---

## Troubleshooting

### Issue: "Too many warnings to analyze"

**Solution:** Use `smart-validate` instead of `validate-grammar`. It aggregates similar issues into categories.

### Issue: "Grammar imports not found"

**Solution:** Use `load_imports: true` and provide `base_path` parameter pointing to the directory containing imported grammar files.

### Issue: "Can't see what changed"

**Solution:** Use `output_mode: "diff"` to see only the changes rather than the full file.

### Issue: "Changes not saved to file"

**Solution:** Add `write_to_file: true` to the tool parameters.

### Issue: "Token output too large"

**Solution:** Use `summary_only: true` for analysis tools or `output_mode: "diff"` for modifications.

---

## Additional Resources

- [README.md](README.md) - Project overview and quick start
- [docs/FEATURES.md](docs/FEATURES.md) - Complete list of all 29+ tools
- [docs/SMART_VALIDATION.md](docs/SMART_VALIDATION.md) - Detailed smart validation guide
- [docs/specs/](docs/specs/) - Detailed specifications for key features

---

## Tips for Claude

When working with antlr4-mcp tools:

1. **Always check if from_file exists** before attempting to read grammar files
2. **Use smart-validate first** for comprehensive analysis before suggesting specific fixes
3. **Prefer diff mode** when modifying large grammars to avoid token overflow
4. **Enable load_imports** when working with multi-file grammars
5. **Validate after changes** to confirm issues are resolved
6. **Suggest testing** with preview-tokens or test-parser-rule after modifications
7. **Use find-rule-usages** before renaming to understand impact
8. **Leverage rule-statistics** to identify complex or heavily-used rules before refactoring

Remember: The goal is to turn grammar debugging from a manual, error-prone process into an efficient, intelligent workflow.
