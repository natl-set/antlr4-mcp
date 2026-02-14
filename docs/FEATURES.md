# ANTLR4 MCP Server - Complete Feature List

This document provides a comprehensive overview of all 40+ tools available in the ANTLR4 MCP server, organized by functionality.

## 📋 Quick Reference Table

| # | Tool | Type | Key Feature |
|---|------|------|-------------|
| 1 | analyze-grammar | Analysis | Extract grammar structure and metadata |
| 2 | validate-grammar | Analysis | Detect syntax issues and problems |
| 3 | list-rules | Analysis | List all rules with filtering |
| 4 | find-rule | Analysis | Find rules by name or regex pattern |
| 5 | format-grammar | Analysis | Display formatted grammar summary |
| 6 | get-suggestions | Analysis | Get improvement recommendations |
| 7 | compare-grammars | Analysis | Compare two grammars side-by-side |
| 8 | add-lexer-rule | Authoring | Add single lexer rule |
| 9 | add-parser-rule | Authoring | Add single parser rule |
| 10 | remove-rule | Authoring | Delete a rule |
| 11 | update-rule | Authoring | Modify rule definition |
| 12 | rename-rule | Authoring | Rename rule and update references |
| 13 | add-rules | Authoring (Bulk) | Add mixed parser/lexer rules |
| 14 | add-parser-rules | Authoring (Bulk) | Add multiple parser rules |
| 15 | (removed) |  | (add-lexer-rules merged into add-rules; use add-rules with output_mode: 'full'|'diff'|'none') |
| 16 | find-rule-usages | Refactoring | Locate all rule usages |
| 17 | rule-statistics | Refactoring | Analyze complexity & dependencies |
| 18 | extract-fragment | Refactoring | Create reusable fragments |
| 19 | merge-rules | Refactoring | Combine related rules |
| 20 | export-as-markdown | Documentation | Generate Markdown docs |
| 21 | generate-summary | Documentation | Create metrics summary |

---

## 📊 Analysis & Inspection Tools (7)

### 1. **analyze-grammar**
Extract complete grammar structure including all rules, tokens, imports, and options.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar file content
- `from_file` (optional string): Path to grammar file (overrides grammar_content)

**Output:** Grammar name/type, all rules, references, imports, options, validation issues

**Use Cases:** Understanding architecture, extracting metadata, identifying dependencies

---

### 2. **validate-grammar**
Check ANTLR4 syntax and detect issues including undefined rules, unused rules, and recursion.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar file content
- `from_file` (optional string): Path to grammar file

**Output:** List of issues with severity level (error/warning/info), line numbers, rule names

**Detects:** Undefined references, unused rules, direct left recursion, fragment misuse

---

### 3. **list-rules**
Get all rules with optional filtering by type.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `filter_type` (optional): "lexer", "parser", or "all" (default: "all")
- `from_file` (optional string): Path to grammar file

**Output:** Alphabetically sorted rules with types, definitions, and line numbers

---

### 4. **find-rule** ⭐ ENHANCED WITH REGEX
Locate rules by exact name or regex pattern.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Rule name or regex pattern
- `use_regex` (optional boolean): If true, treat rule_name as regex pattern
- `from_file` (optional string): Path to grammar file

**Output (exact match):** Rule definition, referenced rules (fan-out), referencing rules (fan-in), line number

**Output (regex match):** All matching rules with details and counts

**Regex Examples:** `^[a-z]+$` (parser rules), `^[A-Z]+$` (lexer rules), `.*token.*` (contains "token")

---

### 5. **format-grammar**
Display structured summary of grammar with proper formatting.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `from_file` (optional string): Path to grammar file

**Output:** Grammar name/type, complete rule list, imports, options, issue summary

---

### 6. **get-suggestions**
Receive improvement recommendations based on grammar analysis.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `from_file` (optional string): Path to grammar file

**Output:** Actionable suggestions grouped by category

**Checks:** Naming conventions, complexity warnings, unused rules, undefined references, performance concerns

---

### 7. **compare-grammars**
Compare two grammars side-by-side to identify differences.

**Parameters:**
- `grammar1_content` (string): First grammar content
- `grammar2_content` (string): Second grammar content
- `from_file1` (optional string): Path to first grammar file
- `from_file2` (optional string): Path to second grammar file

**Output:** Common rules, unique rules per grammar, modified rules, counts and percentages

---

## ✏️ Authoring & Modification Tools (8)

### 8. **add-lexer-rule** ⭐ FILE PERSISTENCE
Add new lexer rules with automatic alphabetical sorting.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Uppercase rule name (e.g., ID, STRING, WS)
- `pattern` (string): Lexer pattern (e.g., `[0-9]+`, `".*?"`)
- `skip` (optional boolean): If true, adds `-> skip` directive
- `channel` (optional string): Channel name (e.g., "COMMENTS")
- `fragment` (optional boolean): If true, marks as fragment rule
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar, success/failure message, confirmation if written to file

**Features:** Alphabetical sorting, duplicate prevention, naming validation, optional file persistence

---

### 9. **add-parser-rule** ⭐ FILE PERSISTENCE
Add new parser rules with automatic alphabetical sorting.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Lowercase rule name (e.g., expr, statement, term)
- `definition` (string): Rule definition (e.g., `term ((ADD term)*)?`)
- `return_type` (optional string): Return type specification
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar, success/failure message, confirmation if written to file

**Features:** Alphabetical sorting, duplicate prevention, naming validation, optional file persistence

---

### 10. **remove-rule** ⭐ FILE PERSISTENCE
Delete rules cleanly from grammar.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Name of rule to remove
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar with rule removed, success/failure message, confirmation if written to file

---

### 11. **update-rule** ⭐ FILE PERSISTENCE
Modify existing rule definitions in place.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Name of rule to update
- `new_definition` (string): New rule definition
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar with rule updated, success/failure message, confirmation if written to file

---

### 12. **rename-rule** ⭐ REFACTORING + FILE PERSISTENCE
Refactor rule names with automatic reference updates throughout grammar.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `old_name` (string): Current rule name
- `new_name` (string): New rule name
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar with rule and all references renamed, update count, confirmation if written

**Features:** Full-word matching prevents false replacements, complete impact reporting

---

### 13. **add-rules** ⭐ BULK OPERATION + FILE PERSISTENCE (merged)
Add multiple lexer rules in bulk with alphabetical sorting.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rules` (array): Array of lexer rules with name, pattern, and optional skip/channel/fragment
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Summary ("Added X, Y failed"), per-rule results, modified grammar, file confirmation

**Features:** Bulk operation, duplicate prevention, partial success handling, alphabetical sorting

---

### 14. **add-parser-rules** ⭐ BULK OPERATION + FILE PERSISTENCE
Add multiple parser rules in bulk with alphabetical sorting.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rules` (array): Array of parser rules with name, definition, and optional return_type
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Summary ("Added X, Y failed"), per-rule results, modified grammar, file confirmation

**Features:** Bulk operation, duplicate prevention, partial success handling, alphabetical sorting

---

### 15. **add-rules** ⭐ BULK OPERATION + FILE PERSISTENCE
Add mixed parser and lexer rules in bulk with alphabetical sorting per type.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rules` (array): Array of mixed rules with type, name, and type-specific properties
- `write_to_file` (optional boolean): If true, writes changes back to file
- `from_file` (optional string): Path to grammar file

**Output:** Summary ("Added X, Y failed"), per-rule results, modified grammar, file confirmation

**Features:** Mixed bulk operation, duplicate prevention, partial success handling, alphabetical sorting

---

## 🔧 Refactoring & Optimization Tools (4)

### 16. **find-rule-usages** ⭐ REFACTORING
Locate all usages of a specific rule with context.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Name of rule to find usages for
- `from_file` (optional string): Path to grammar file

**Output:** Total usage count, per-usage line numbers and context

**Use Cases:** Impact analysis before renaming, understanding dependencies, refactoring preparation

---

### 17. **rule-statistics** ⭐ REFACTORING
Analyze rule complexity and dependencies in detail.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule_name` (string): Name of rule to analyze
- `from_file` (optional string): Path to grammar file

**Output:** Rule definition, complexity (alternative count), fan-out (rules referenced), fan-in (rules referencing), recursion status

**Use Cases:** Performance bottleneck identification, heavily-used rule discovery, complexity understanding, refactoring planning

---

### 18. **extract-fragment** ⭐ OPTIMIZATION
Create reusable fragments from patterns to reduce duplication.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `pattern` (string): Pattern to extract as fragment
- `fragment_name` (string): Name for new fragment
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar with fragment added, update count, new fragment definition

**Features:** Reduces duplication, improves maintainability, auto-placement, pattern sharing

---

### 19. **merge-rules** ⭐ REFACTORING
Combine related rules into one with alternatives.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `rule1_name` (string): First rule to merge
- `rule2_name` (string): Second rule to merge
- `new_rule_name` (string): Name for merged rule
- `from_file` (optional string): Path to grammar file

**Output:** Modified grammar with merged rule, old rules removed, new rule with combined alternatives

**Features:** Reduces rule count, groups related alternatives, consolidates similar patterns

---

## 📚 Documentation & Reporting Tools (2)

### 20. **export-as-markdown** ⭐ DOCUMENTATION
Generate comprehensive Markdown documentation for grammars.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `from_file` (optional string): Path to grammar file

**Output:** Complete Markdown documentation with:
- Grammar metadata
- Overview section
- Parser rules with definitions and references
- Lexer rules with patterns
- Imports and options
- Validation issue list
- Summary statistics

**Use Cases:** README generation, reference guides, API documentation, specification documents

---

### 21. **generate-summary** ⭐ DOCUMENTATION
Create structured grammar metrics summary.

**Parameters:**
- `grammar_content` (string): ANTLR4 grammar content
- `from_file` (optional string): Path to grammar file

**Output:**
- Grammar name and type
- Total rule count (parser/lexer breakdown)
- Imports list
- Top 5 most referenced rules
- Issue summary (error/warning/info counts)
- Grammar health assessment

**Use Cases:** Quick overview, health checks, summary reports, progress tracking

---

## 🎯 Usage Patterns for Efficient Editing

### Workflow 1: Safe Refactoring
1. **find-rule-usages** - Understand impact
2. **rule-statistics** - Analyze complexity
3. **rename-rule** - Safe global refactoring
4. **validate-grammar** - Verify changes

### Workflow 2: Grammar Optimization
1. **rule-statistics** - Find complex rules
2. **extract-fragment** - Reduce duplication
3. **merge-rules** - Consolidate alternatives
4. **generate-summary** - See improvements

### Workflow 3: Adding New Rules
1. **add-parser-rule** or **add-lexer-rule** - Add rule (auto-sorted)
2. **validate-grammar** - Check syntax
3. **find-rule-usages** - Verify structure
4. **export-as-markdown** - Document changes

### Workflow 4: Grammar Documentation
1. **analyze-grammar** - Extract structure
2. **compare-grammars** - Highlight differences
3. **export-as-markdown** - Full documentation
4. **generate-summary** - Quick reference

---

## ✨ Key Capabilities Across All Tools

### File I/O & Persistence
- Inline grammar content via `grammar_content` parameter
- File reading via `from_file` parameter
- Optional file writing via `write_to_file` parameter (all authoring tools)
- Non-destructive by default (returns modified content, writing is opt-in)

### Error Handling & Validation
- Duplicate rule detection
- Rule name validation (case sensitivity)
- Undefined reference detection
- Fragment rule validation
- Type mismatch detection

### Intelligent Operations
- Alphabetical sorting for rule insertion
- Whole-word matching for safe refactoring
- Full-scope reference updates
- Partial success on bulk operations
- Impact reporting for changes

### Analysis Capabilities
- Fan-out analysis (what each rule references)
- Fan-in analysis (what references each rule)
- Complexity metrics (alternatives, dependencies, recursion)
- Usage tracking with line numbers
- Dependency graphs and relationships

### Pattern Matching
- Exact rule name lookup
- Regex pattern matching for discovery
- Flexible filtering options
- Complex query support

---

## 📊 Implementation Details

- **Static Analysis**: Intelligent text parsing, not full semantic analysis
- **ANTLR4 Compliance**: Full support for ANTLR4 grammar syntax and conventions
- **Performance**: All operations are local with sub-second performance
- **Reliability**: Duplicate detection and validation prevent data loss
- **Production-Ready**: Designed for real-world grammar projects
- **Partial Transactions**: Bulk operations succeed partially on individual rule errors

---

## 🔬 Phase 1 Analysis Tools (3)

### grammar-metrics
Calculate comprehensive grammar metrics including branching estimation and complexity.

**Returns:**
- Size metrics (total rules, parser rules, lexer rules, fragments)
- Branching estimation (alternatives per rule, rules with most branching)
- Complexity score (cyclomatic complexity)
- Dependency analysis (most referenced rules, orphan rules)

### detect-redos
Detect ReDoS (Regular Expression Denial of Service) vulnerabilities in lexer patterns.

**Detects:**
- Nested quantifiers: `(a+)+`, `(a*)*`
- Overlapping alternatives: `(a|a)+`
- Alternatives with common prefix
- Unbounded repetition of broad character classes

### check-style
Check grammar style and best practices with quality scoring.

**Checks:**
- Naming conventions (UPPER_CASE for lexer, lowerCamelCase for parser)
- Missing grammar declaration
- Unused/orphan rules
- Overly complex rules
- Missing documentation on complex rules

**Returns:** Style score (0-100), issues with severity, specific suggestions

---

## 🚀 Performance Analysis Tools (2)

### analyze-bottlenecks
Analyze grammar for performance bottlenecks and optimization opportunities.

**Detects:**
- **High-branching rules**: Rules with many alternatives (10+, 20+, 50+)
- **Tilde negation patterns**: `~NEWLINE`, `~[\r\n]` that could use lexer modes
- **Missing lexer mode opportunities**: String handling, line-based content
- **Greedy loop issues**: Nested quantifiers, reluctant patterns
- **Deep recursion**: Rules with potential stack overflow risk
- **Token prefix collisions**: Keywords that are prefixes of other keywords

**Returns:** Bottlenecks with severity, specific suggestions, estimated improvement potential

### benchmark-parsing
Benchmark grammar parsing performance with sample input.

**Measures:**
- Total tokens produced
- Average/min/max parse time
- Tokens per second throughput
- Performance rating (excellent/good/fair/slow)

**Note:** Uses simulation - for complex grammars, use native ANTLR4 runtime

---

## 🎭 Lexer Mode Tools (8)

### analyze-lexer-modes
Analyze lexer mode structure and rules.

**Returns:** List of modes, their rules, entry/exit points

### analyze-mode-transitions
Detect issues with mode transitions.

**Detects:**
- `pushMode(X)` without corresponding mode X
- `popMode` in DEFAULT_MODE
- Modes with no entry points
- Circular mode transitions

### add-lexer-mode
Add a new lexer mode declaration.

### add-rule-to-mode
Add a rule to a specific lexer mode.

### move-rule-to-mode
Move an existing rule to a different mode.

### list-mode-rules
List all rules in a specific mode.

### duplicate-mode
Clone a mode with all its rules.

### create-grammar-template
Create a new grammar with lexer mode scaffolding.

---

## 📊 Implementation Details

- **Static Analysis**: Intelligent text parsing, not full semantic analysis
- **ANTLR4 Compliance**: Full support for ANTLR4 grammar syntax and conventions
- **Performance**: All operations are local with sub-second performance
- **Reliability**: Duplicate detection and validation prevent data loss
- **Production-Ready**: Designed for real-world grammar projects
- **Partial Transactions**: Bulk operations succeed partially on individual rule errors

---

**Total: 40+ tools** providing comprehensive ANTLR4 grammar analysis, authoring, refactoring, documentation, and performance optimization capabilities.
