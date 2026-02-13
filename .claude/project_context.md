# ANTLR4 MCP Server - Project Context

## Purpose

MCP server that provides Claude with specialized tools for reading, analyzing, modifying, validating, and debugging ANTLR4 grammars. Turns grammar debugging from hours of manual work into minutes of automated analysis.

## Key Capabilities

### Smart Validation & Analysis
- **smart-validate** - Aggregates 17,000+ warnings into 10 actionable issues (quantifier bugs, missing tokens, incomplete parsing)
- **detect-quantifier-issues** - Finds suspicious `?` quantifiers that should be `*` or `+`
- **detect-incomplete-parsing** - Identifies anti-patterns like `null_rest_of_line` that discard content
- **analyze-grammar** - Extracts structure, rules, tokens, imports, dependencies with multi-file support
- **validate-grammar** - Syntax validation with output limiting to prevent token overflow

### Grammar Manipulation
- **add-rule / update-rule / remove-rule** - CRUD operations with automatic lexer/parser detection
- **rename-rule** - Rename rules and update all references across files
- **move-rule** - Reposition rules within grammar
- **sort-rules** - Alphabetical organization
- **inline-rule** - Inline single-use rules to reduce complexity

### Bulk Operations
- **add-rules** - Batch create multiple lexer/parser rules
- **add-parser-rules** - Bulk parser rule creation
- **batch-create-tokens** - Generate multiple tokens from patterns
- **suggest-tokens-from-errors** - Parse ANTLR error logs to suggest missing tokens

### Testing & Preview
- **test-parser-rule** - Test parser rules with sample inputs
- **preview-tokens** - Visualize tokenization results
- **test-lexer-rule** - Test individual lexer patterns

### Refactoring & Optimization
- **find-rule-usages** - Track rule references across multiple files
- **rule-statistics** - Complexity analysis and dependency graphs
- **merge-rules** - Combine related rules
- **extract-fragment** - Create reusable fragments
- **analyze-ambiguities** - Detect ambiguous grammar constructs

### Documentation & Comparison
- **export-as-markdown** - Generate documentation
- **generate-summary** - Create metrics summaries
- **compare-grammars** - Side-by-side diff of two grammars
- **infer-formatting** - Extract formatting patterns from existing grammars

## Trigger Words/Phrases

Claude should suggest using this server when users mention:

### Grammar Keywords
- "grammar", "grammar file", ".g4", "ANTLR", "ANTLR4"
- "lexer rule", "parser rule", "token", "terminal"
- "fragment", "quantifier", "parser", "lexer"

### Problem Indicators
- "grammar error", "parsing error", "syntax error"
- "grammar not working", "parser fails", "lexer issue"
- "ambiguous grammar", "left recursion", "precedence"
- "grammar validation", "grammar debugging"

### Action Words
- "add rule", "remove rule", "rename rule", "update rule"
- "fix grammar", "validate grammar", "analyze grammar"
- "test parser", "preview tokens", "tokenize"
- "merge rules", "extract fragment", "inline rule"

### ANTLR Concepts
- "? quantifier", "* quantifier", "+ quantifier"
- "parser rule", "lexer rule", "fragment rule"
- "import grammar", "grammar options", "tokens { }"
- "-> skip", "-> channel", "-> mode"

## Quick Start

### 1. Validate and Debug Large Grammars
```
"Analyze MyGrammar.g4 and find all issues"
"What's wrong with my parser grammar?"
"Why am I getting 17,000 warnings?"
```

### 2. Fix Quantifier Issues
```
"Find rules with suspicious quantifiers"
"Fix all quantifier bugs in PaloAlto.g4"
"Which rules should use * instead of ?"
```

### 3. Add Missing Tokens
```
"Add tokens ADDRESS_REGEX and EVENT_TYPE to grammar"
"Suggest tokens from these ANTLR errors"
"Create lexer rules for =, ==, and !="
```

### 4. Understand Grammar Structure
```
"Show me all rules in MyGrammar.g4"
"Find where 'expression' rule is used"
"Compare Grammar1.g4 and Grammar2.g4"
"What does this grammar file do?"
```

### 5. Refactor and Optimize
```
"Rename rule 'stmt' to 'statement' everywhere"
"Merge these duplicate rules"
"Inline single-use rules"
"Find unused rules I can remove"
```

## Example Prompts

### Debugging Workflow
```
"I'm getting ANTLR warnings in CiscoParser.g4. Can you validate it and
show me what's wrong? Focus on quantifier issues and missing tokens."

"Run smart-validate on my grammar, then fix all the quantifier bugs
you found. Show me the diff before writing to file."
```

### Grammar Creation
```
"Create a simple JSON grammar with rules for object, array, string,
number, boolean, and null. Test it with sample JSON."

"Add lexer rules for SQL keywords: SELECT, FROM, WHERE, ORDER BY, GROUP BY.
Use batch-create-tokens to generate them all at once."
```

### Refactoring Workflow
```
"Find all usages of the 'expr' rule across my imported grammars.
I want to rename it to 'expression' everywhere."

"Analyze my grammar's complexity and identify rules that could be
simplified or inlined."
```

### Testing Workflow
```
"Test the 'statement' rule with input 'x = 42 + y' and show me
the tokenization."

"Preview how 'SELECT * FROM users WHERE id = 1' would be tokenized
by my SQL lexer."
```

### Multi-File Projects
```
"Analyze the main grammar and all its imports. Show me the complete
rule dependency graph."

"Find which grammar file defines the 'command' token that's referenced
in Parser.g4."
```

## Key Benefits Over Manual Work

- **Aggregates warnings**: 17,234 warnings → 3 categories, 20 actionable fixes
- **Context-aware**: Suggests token patterns based on actual usage, not guessing
- **Multi-file aware**: Tracks imports and references across grammar files
- **Safe edits**: Data loss protection prevents accidental file corruption
- **Diff output**: See only what changed, not entire file
- **Bulk operations**: Fix multiple issues at once with selective application

## Real-World Impact

Tested on Palo Alto firewall grammar (36 files, 1500+ lines):
- Before: 17,234 individual warnings, hours of manual grep/analysis
- After: 3 issue categories, fixed in 30 minutes
- Found: 8 quantifier bugs, 9 missing tokens, 3 incomplete parsing patterns
