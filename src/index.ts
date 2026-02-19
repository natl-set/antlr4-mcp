import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  TextContent,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';
import { AntlrAnalyzer } from './antlrAnalyzer.js';
import { getRuntime } from './antlr4Runtime.js';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import * as Diff from 'diff';

/**
 * Safely write to a file with data loss protection
 */
function safeWriteFile(
  filePath: string,
  newContent: string
): { success: boolean; message: string } {
  try {
    // Safety check: if file exists, verify the result is reasonable
    if (fs.existsSync(filePath)) {
      const originalContent = fs.readFileSync(filePath, 'utf-8');
      const originalLines = originalContent.split('\n').length;
      const modifiedLines = newContent.split('\n').length;

      // Warn if we're about to drastically reduce the file size (potential data loss)
      if (modifiedLines < originalLines * 0.5 && originalLines > 10) {
        return {
          success: false,
          message: `⚠️  SAFETY CHECK FAILED: Modified content has ${modifiedLines} lines vs original ${originalLines} lines (${Math.round((modifiedLines / originalLines) * 100)}% of original). This looks like potential data loss. File NOT written. If this is intentional, review the modified grammar and use a different tool to write it.`,
        };
      }
    }

    fs.writeFileSync(filePath, newContent, 'utf-8');
    return {
      success: true,
      message: `✓ Changes written to file: ${filePath}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `✗ Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Generate unified diff between original and modified content
 */
function generateUnifiedDiff(
  original: string,
  modified: string,
  filename: string = 'grammar.g4'
): string {
  const patch = Diff.createPatch(filename, original, modified, 'original', 'modified');
  return patch;
}

const server = new Server(
  {
    name: 'antlr4-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

/**
 * Define the tools available in this MCP server
 */
const tools: Tool[] = [
  {
    name: 'help',
    description: `Get comprehensive help about ANTLR4 MCP tools, common workflows, and usage examples.

**USE THIS TOOL FIRST when starting work with ANTLR4 grammars.**

Available topics:
- "overview": Summary of all 27 available tools by category
- "workflows": Common multi-step workflows for typical tasks
- "analysis": Detailed info about analysis and inspection tools
- "authoring": Detailed info about editing and modification tools  
- "refactoring": Detailed info about refactoring and optimization tools
- "examples": Practical examples of tool usage

Returns: Comprehensive documentation for the requested topic.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: {
          type: 'string',
          enum: ['overview', 'workflows', 'analysis', 'authoring', 'refactoring', 'examples'],
          description: 'Help topic to retrieve. Use "overview" for a general introduction.',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'analyze-grammar',
    description: `Analyze an ANTLR4 grammar file and extract its complete structure.

**When to use:** First step when exploring an unfamiliar grammar, understanding architecture, or extracting metadata.

**Multi-file support:** Set load_imports=true to automatically resolve and analyze imported grammars.

Example usage:
  from_file: "examples/MyGrammar.g4"
  
Multi-file example:
  from_file: "PaloAlto_rulebase.g4"
  base_path: "/path/to/grammars"
  load_imports: true

Returns:
- Grammar name and type (parser/lexer/combined)
- All parser rules with definitions and line numbers
- All lexer rules with patterns
- Rule references and dependencies (which rules reference which)
- Import declarations
- Grammar options
- Validation issues (undefined rules, unused rules, recursion)
- **With load_imports=true**: Includes rules from all imported grammars`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description:
            'Optional: path to a grammar file to read (overrides grammar_content). Recommended for file-based workflows.',
        },
        base_path: {
          type: 'string',
          description:
            'Optional: base directory for resolving imports. Defaults to directory of from_file.',
        },
        load_imports: {
          type: 'boolean',
          description:
            'Optional: if true, automatically load and merge imported grammars. Default: true.',
        },
        summary_only: {
          type: 'boolean',
          description:
            'Optional: if true, returns only summary statistics without full rule details. Default: false. Use this for large multi-file grammars.',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'infer-formatting',
    description: `Analyze an ANTLR4 grammar and infer its formatting style.

**When to use:** Understand the formatting conventions used in a grammar, or verify that formatting will be preserved when making changes.

Example usage:
  from_file: "MyGrammar.g4"

Analyzes:
- Colon placement (same-line vs new-line after rule name)
- Semicolon placement (same-line vs new-line after definition)
- Space before colon (e.g., "rule :" vs "rule:")
- Indentation style (spaces or tabs, and how many)
- Blank lines between rules

Returns: Formatting style object with detected patterns.

Note: The update-rule, add-lexer-rule, and add-parser-rule tools automatically use this inference to preserve your grammar's formatting style.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'validate-grammar',
    description: `Validate ANTLR4 grammar syntax and detect common issues.

**When to use:** After making changes to verify correctness, or to diagnose problems in an existing grammar.

Example usage:
  from_file: "MyGrammar.g4"

Detects:
- Undefined rule references (rules used but not defined)
- Unused rules (defined but never referenced)
- Direct left recursion issues
- Fragment rule misuse
- Naming convention violations

Returns: List of issues with severity (error/warning/info), descriptions, line numbers, and affected rule names.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        base_path: {
          type: 'string',
          description:
            'Optional: base directory for resolving imports and tokenVocab. Required for multi-file grammars.',
        },
        load_imports: {
          type: 'boolean',
          description:
            'Optional: if true, automatically load imported grammars and lexer vocabulary. Default: true.',
        },
        max_issues: {
          type: 'number',
          description:
            'Optional: maximum number of issues to return. Default: 100. Use 0 for unlimited.',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'list-rules',
    description: `List all rules in an ANTLR4 grammar with optional filtering.

**When to use:** Get a quick overview of all rules, or filter to see only lexer or parser rules.

Example usage:
  filter_type: "lexer"  // Shows only lexer rules (uppercase)
  filter_type: "parser" // Shows only parser rules (lowercase)
  filter_type: "all"    // Shows all rules (default)

Returns: Alphabetically sorted list of rules with:
- Rule names
- Rule types (lexer/parser)
- Complete definitions
- Line numbers`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        filter_type: {
          type: 'string',
          enum: ['lexer', 'parser', 'all'],
          description: 'Filter rules by type (default: all)',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'find-rule',
    description: `Find rules with multiple matching modes: exact, regex, wildcard, or partial matching.

**When to use:** Locate specific rules, understand rule relationships, or discover rules matching a pattern.

**Matching Modes:**

1. **Exact** (default) - Exact rule name match:
   rule_name: "expression"

2. **Regex** - Regular expression pattern:
   rule_name: "^[A-Z]+$"
   match_mode: "regex"
   (Finds all lexer rules)

3. **Wildcard** - Shell-style wildcards (* and ?):
   rule_name: "expr*"
   match_mode: "wildcard"
   (Finds expression, expr, exprStatement, etc.)
   
   rule_name: "stat?"
   match_mode: "wildcard"
   (Finds stat1, stat2, stats, etc.)

4. **Partial** - Substring/contains search (case-insensitive):
   rule_name: "token"
   match_mode: "partial"
   (Finds tokenList, getToken, TOKEN_TYPE, etc.)

**Examples:**
- All lexer rules: rule_name="^[A-Z]+$", match_mode="regex"
- All parser rules: rule_name="^[a-z]+$", match_mode="regex"
- Rules starting with "expr": rule_name="expr*", match_mode="wildcard"
- Rules containing "statement": rule_name="statement", match_mode="partial"

Returns (exact match):
- Rule definition, type, and line number
- Referenced rules (fan-out: what this rule uses)
- Referencing rules (fan-in: what uses this rule)
- Usage count

Returns (pattern match):
- All matching rules with their details
- Match count`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        rule_name: {
          type: 'string',
          description:
            'Rule name or pattern. For wildcards: * matches any characters, ? matches single character. For regex: use standard regex syntax.',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        match_mode: {
          type: 'string',
          enum: ['exact', 'regex', 'wildcard', 'partial'],
          description:
            'Matching mode: "exact" (default, exact name), "regex" (regex pattern), "wildcard" (* and ?), "partial" (substring search)',
        },
        use_regex: {
          type: 'boolean',
          description:
            'DEPRECATED: Use match_mode="regex" instead. If true, treats rule_name as regex pattern.',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'get-suggestions',
    description: `Get actionable improvement suggestions for an ANTLR4 grammar.

**When to use:** Optimize grammar quality, identify issues, get best practice recommendations.

Analyzes:
- Naming convention compliance (uppercase lexer, lowercase parser)
- Rule complexity and performance concerns
- Unused rules that could be removed
- Undefined references
- Fragment opportunities for code reuse
- Left recursion patterns

Returns: Categorized suggestions with specific recommendations for improvement.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'format-grammar',
    description: `Display a structured summary of the grammar with proper formatting.

**When to use:** Get a high-level overview of grammar organization and structure.

Returns:
- Grammar name and type
- Complete rule list (organized by type)
- Import declarations
- Grammar options
- Issue summary with counts`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The content of the ANTLR4 grammar file',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'compare-grammars',
    description: `Compare two ANTLR4 grammars side-by-side to identify differences.

**When to use:** Understand changes between versions, merge grammars, or analyze variations.

Example usage:
  from_file1: "v1/MyGrammar.g4"
  from_file2: "v2/MyGrammar.g4"

Returns:
- Common rules (unchanged)
- Rules unique to grammar 1
- Rules unique to grammar 2
- Modified rules (exist in both but differ)
- Statistical summary (counts, percentages)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar1_content: {
          type: 'string',
          description: 'Content of the first grammar file (required if from_file1 not provided)',
        },
        grammar2_content: {
          type: 'string',
          description: 'Content of the second grammar file (required if from_file2 not provided)',
        },
        from_file1: {
          type: 'string',
          description: 'Path to first grammar file (overrides grammar1_content)',
        },
        from_file2: {
          type: 'string',
          description: 'Path to second grammar file (overrides grammar2_content)',
        },
      },
      required: [],
    },
  },
  {
    name: 'add-rule',
    description: `Add a new lexer or parser rule with automatic type detection and positioning.

**Auto-detection:** Rule type is determined by naming convention:
- UPPERCASE = lexer rule (e.g., ID, STRING, NUMBER)
- lowercase = parser rule (e.g., expression, statement, term)

**When to use:** Add any rule to your grammar - lexer tokens or parser rules.

Example - Add lexer rule (UPPERCASE):
  rule_name: "ID"
  pattern: "[a-zA-Z_][a-zA-Z0-9_]*"

Example - Add parser rule (lowercase):
  rule_name: "expression"
  definition: "term ((PLUS | MINUS) term)*"

Example - Add lexer with skip:
  rule_name: "WS"
  pattern: "[ \\\\t\\\\n\\\\r]+"
  skip: true

Example - Add lexer with channel:
  rule_name: "COMMENT"
  pattern: "//.*?\\\\n"
  channel: "COMMENTS"

Example - Add fragment:
  rule_name: "DIGIT"
  pattern: "[0-9]"
  fragment: true

Example - Add with positioning:
  rule_name: "STRING"
  pattern: "\\".*?\\""
  insert_after: "ID"

Example - Add parser with return type:
  rule_name: "intLiteral"
  definition: "INT"
  return_type: "int value"

Features:
- Auto-detects lexer vs parser from rule name case
- Default: Alphabetical sorting within rule type
- Optional: Custom positioning with insert_after/insert_before
- Lexer-specific: skip, channel, fragment options
- Parser-specific: return_type option
- Prevents duplicate rule names
- Optional file persistence with write_to_file: true
- Diff output mode for large grammars

Returns: Modified grammar with new rule inserted, success message, position description, file write confirmation if applicable.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rule_name: {
          type: 'string',
          description:
            'Name of the rule. UPPERCASE for lexer rules (ID, STRING), lowercase for parser rules (expression, term)',
        },
        pattern: {
          type: 'string',
          description:
            'For lexer rules: The lexer pattern. Examples: [0-9]+, \\".*?\\", [a-zA-Z_][a-zA-Z0-9_]*',
        },
        definition: {
          type: 'string',
          description:
            'For parser rules: The rule definition. Examples: "ID ASSIGN expr", "term (PLUS term)*"',
        },
        skip: {
          type: 'boolean',
          description: 'Lexer only: If true, adds "-> skip" directive (common for whitespace)',
        },
        channel: {
          type: 'string',
          description: 'Lexer only: Channel name to route tokens (e.g., "COMMENTS")',
        },
        fragment: {
          type: 'boolean',
          description:
            'Lexer only: If true, marks rule as fragment (reusable pattern, not a token)',
        },
        return_type: {
          type: 'string',
          description:
            'Parser only: Return type specification (e.g., "String value", "int result")',
        },
        insert_after: {
          type: 'string',
          description:
            'Optional: Insert this rule immediately after the specified rule name. Overrides alphabetical sorting.',
        },
        insert_before: {
          type: 'string',
          description:
            'Optional: Insert this rule immediately before the specified rule name. Overrides alphabetical sorting.',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description:
            'Output format: "full" returns entire modified grammar, "diff" returns git-style unified diff (default for modification tools), "none" returns no content (useful for write-only operations)',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'remove-rule',
    description: `Remove a rule cleanly from an ANTLR4 grammar.

**When to use:** Delete obsolete rules, clean up unused definitions, or refactor grammar structure.

Example usage:
  rule_name: "oldExpression"
  write_to_file: true

**Warning:** Does not update references to this rule in other rules. Use find-rule-usages first to check impact.

Returns: Modified grammar with rule removed, success message, file write confirmation if applicable.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the rule to remove (case-sensitive)',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'update-rule',
    description: `Update an existing rule definition in place. **Now supports multi-line definitions!**

**When to use:** Modify rule logic, add alternatives, refine patterns, or fix issues.

Example - Simple update:
  rule_name: "expression"
  new_definition: "term ((PLUS | MINUS) term)*"

Example - Multi-line update (string with \\n):
  rule_name: "srp_uuid_null"
  new_definition: "UUID\\n    | ~(\\n        ACTION\\n        | FROM\\n    )"

Example - Multi-line update (JSON array):
  rule_name: "srp_uuid_null"
  new_definition: ["UUID", "    | ~(", "        ACTION", "        | FROM", "    )"]

**Multi-line support:** 
- Pass a string with embedded \\n characters, OR
- Pass an array of strings (one per line) - more readable!
- Formatting is automatically preserved based on grammar style

Preserves rule position in grammar. Use rename-rule if changing the rule name.

Returns: Modified grammar with rule updated, success message, file write confirmation if applicable.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the rule to update (case-sensitive)',
        },
        new_definition: {
          type: 'string',
          description: 'The new rule definition to replace the existing one',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description:
            'Output format: "full" returns entire modified grammar, "diff" returns git-style unified diff (default for modification tools), "none" returns no content (useful for write-only operations)',
        },
      },
      required: ['grammar_content', 'rule_name', 'new_definition'],
    },
  },
  {
    name: 'rename-rule',
    description: `Safely rename a rule and automatically update ALL references throughout the grammar.

**When to use:** Refactor rule names for clarity, fix naming conventions, or improve code readability.

Example usage:
  old_name: "expr"
  new_name: "expression"
  write_to_file: true

Multi-file example:
  from_file: "MyGrammar.g4"
  base_path: "/path/to/grammars"
  load_imports: true
  write_to_file: true

Features:
- Uses whole-word matching (prevents "expr" from matching "subexpr")
- Updates rule definition and ALL references in other rules
- Preserves rule position in grammar
- Reports number of references updated
- Multi-file support: Set load_imports=true to rename across imported grammars

Recommended workflow:
1. find-rule-usages with load_imports=true to see full impact
2. rename-rule with load_imports=true to perform refactoring
3. validate-grammar to verify correctness

Returns: Modified grammar with rule and all references renamed, update count, file write confirmation if applicable.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content (ignored if from_file and load_imports are set)',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file or load_imports.',
        },
        old_name: {
          type: 'string',
          description: 'Current name of the rule (case-sensitive)',
        },
        new_name: {
          type: 'string',
          description:
            'New name for the rule (must follow ANTLR4 naming: uppercase for lexer, lowercase for parser)',
        },
        base_path: {
          type: 'string',
          description: 'Optional: base directory for resolving imports. Required for multi-file grammars.',
        },
        load_imports: {
          type: 'boolean',
          description:
            'If true, loads all imported grammar files and renames the rule across all files. Requires from_file to be set.',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (and all imported files if load_imports is true)',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description:
            'Output format: "full" returns entire modified grammar, "diff" returns git-style unified diff (default for modification tools), "none" returns no content (useful for write-only operations)',
        },
      },
      required: ['old_name', 'new_name'],
    },
  },
  {
    name: 'find-rule-usages',
    description: `Find all locations where a specific rule is referenced with line numbers and context.

**When to use:** Before renaming/removing rules to understand impact, analyze dependencies, or trace rule usage.

Example usage:
  rule_name: "expression"

Returns:
- Total usage count
- Per-usage details: line number, rule context (which rule contains the reference)
- Complete usage report

Multi-file support:
- Set load_imports: true to search across imported grammars
- Useful for finding cross-file dependencies

Use before:
- Renaming rules (to see what will be affected)
- Removing rules (to identify breaking changes)
- Refactoring (to understand dependencies)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_name: {
          type: 'string',
          description: 'The name of the rule to find usages for (case-sensitive)',
        },
        base_path: {
          type: 'string',
          description:
            'Optional: base directory for resolving imports. Required for multi-file grammars.',
        },
        load_imports: {
          type: 'boolean',
          description: 'Optional: if true, search across imported grammars. Default: false.',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'rule-statistics',
    description: `Analyze rule complexity, dependencies, and performance characteristics.

**When to use:** Understand rule complexity, identify bottlenecks, find heavily-used rules, plan refactoring.

Example usage:
  rule_name: "expression"

Returns:
- Rule definition and type
- Complexity metrics: number of alternatives
- Fan-out: rules that this rule references (dependencies)
- Fan-in: rules that reference this rule (dependents)
- Recursion analysis: direct/indirect recursion detection
- Usage statistics

Use cases:
- Identify complex rules for optimization
- Find highly-coupled rules
- Detect recursion issues
- Plan refactoring priorities`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_name: {
          type: 'string',
          description: 'The name of the rule to analyze (case-sensitive)',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'extract-fragment',
    description: `Extract a reusable fragment rule from a pattern to reduce duplication.

**When to use:** Share common patterns, improve maintainability, reduce duplication in lexer rules.

Example - Extract digit pattern:
  fragment_name: "DIGIT"
  pattern: "[0-9]"

Example - Extract letter pattern:
  fragment_name: "LETTER"
  pattern: "[a-zA-Z]"

After extraction, use the fragment in other rules:
  ID: LETTER (LETTER | DIGIT)*

Benefits:
- Single source of truth for common patterns
- Easier maintenance
- Clearer lexer organization
- Fragments are not tokens themselves (helper patterns only)

Returns: Modified grammar with fragment added, original pattern preserved in existing rules.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        fragment_name: {
          type: 'string',
          description:
            'Name for the fragment (must be UPPERCASE, e.g., DIGIT, LETTER, IDENTIFIER_PART)',
        },
        pattern: {
          type: 'string',
          description: 'The pattern to extract as a fragment (e.g., "[0-9]", "[a-zA-Z]")',
        },
      },
      required: ['grammar_content', 'fragment_name', 'pattern'],
    },
  },
  {
    name: 'merge-rules',
    description: `Merge two related rules into one rule with alternatives.

**When to use:** Consolidate similar rules, reduce rule count, group related alternatives.

Example - Merge literal rules:
  rule1_name: "intLiteral"
  rule2_name: "floatLiteral"
  new_rule_name: "numericLiteral"

Result:
  numericLiteral: intLiteral | floatLiteral

Benefits:
- Reduces grammar complexity
- Groups related alternatives logically
- Simplifies parser structure

Note: Original rules are removed; references to them should be updated manually or use rename-rule first.

Returns: Modified grammar with merged rule created and original rules removed.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule1_name: {
          type: 'string',
          description: 'Name of the first rule to merge (will be removed)',
        },
        rule2_name: {
          type: 'string',
          description: 'Name of the second rule to merge (will be removed)',
        },
        new_rule_name: {
          type: 'string',
          description: 'Name for the merged rule (must follow ANTLR4 naming conventions)',
        },
      },
      required: ['grammar_content', 'rule1_name', 'rule2_name', 'new_rule_name'],
    },
  },
  {
    name: 'export-as-markdown',
    description: `Generate comprehensive Markdown documentation for your grammar.

**When to use:** Create README files, generate reference documentation, document grammar structure, share grammar specs.

Example usage:
  from_file: "MyGrammar.g4"

Generated documentation includes:
- Grammar name, type, and metadata
- Overview section with rule counts
- Parser rules section with definitions and references
- Lexer rules section with patterns
- Import declarations
- Grammar options
- Validation issues and warnings
- Summary statistics

Output format: Complete Markdown document ready for use in README.md or documentation sites.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'generate-summary',
    description: `Generate a concise summary of grammar structure and health metrics.

**When to use:** Quick health checks, progress tracking, overview reports, or grammar comparisons.

Example usage:
  from_file: "MyGrammar.g4"

Returns:
- Grammar name and type
- Total rule count (parser/lexer breakdown)
- Import declarations
- Top 5 most referenced rules (indicating key grammar components)
- Issue summary (error/warning/info counts)
- Grammar health assessment
- Complexity indicators

Perfect for: Status reports, quick assessments, tracking changes over time.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'add-lexer-rules-removed',

    description: `Add multiple lexer rules to a grammar in a single operation (bulk add).

**When to use:** Set up initial grammar structure, add multiple related tokens at once, or import rules from another grammar.

Example - Add common tokens:
  rules: [
    { name: "ID", pattern: "[a-zA-Z_][a-zA-Z0-9_]*" },
    { name: "INT", pattern: "[0-9]+" },
    { name: "WS", pattern: "[ \\\\t\\\\n\\\\r]+", skip: true },
    { name: "COMMENT", pattern: "//.*?\\\\n", channel: "COMMENTS" }
  ]
  write_to_file: true

Features:
- All rules inserted in alphabetical order
- Duplicate prevention per rule
- Partial success: some rules can succeed even if others fail
- Per-rule success/failure reporting
- Atomic per-rule operations

Returns:
- Summary: "Added X rules, Y failed"
- Per-rule results with success/failure status
- Modified grammar
- File write confirmation if applicable`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rules: {
          type: 'array',
          description:
            'Array of lexer rules to add. Each rule requires name and pattern properties.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Rule name (must be UPPERCASE)',
              },
              pattern: {
                type: 'string',
                description: 'The lexer pattern (e.g., "[0-9]+", "[a-zA-Z]+")',
              },
              skip: {
                type: 'boolean',
                description: 'If true, adds "-> skip" directive',
              },
              channel: {
                type: 'string',
                description: 'Optional channel name (e.g., "COMMENTS")',
              },
              fragment: {
                type: 'boolean',
                description: 'If true, marks as fragment rule',
              },
            },
            required: ['name', 'pattern'],
          },
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description:
            'Output mode: "full" returns complete grammar, "diff" returns git-style diff (default: diff), "none" returns no content',
        },
      },
      required: ['grammar_content', 'rules'],
    },
  },
  {
    name: 'add-parser-rules',
    description: `Add multiple parser rules to a grammar in a single operation (bulk add).

**When to use:** Set up grammar structure, add multiple related parsing rules, or quickly prototype a grammar.

Example - Add expression rules:
  rules: [
    { name: "program", definition: "statement+" },
    { name: "statement", definition: "assignment | ifStatement | whileStatement" },
    { name: "assignment", definition: "ID ASSIGN expression SEMI" },
    { name: "expression", definition: "term ((PLUS | MINUS) term)*" }
  ]
  write_to_file: true

Features:
- All rules inserted in alphabetical order
- Duplicate prevention per rule
- Partial success: some rules can succeed even if others fail
- Per-rule success/failure reporting
- Atomic per-rule operations

Returns:
- Summary: "Added X rules, Y failed"
- Per-rule results with success/failure status
- Modified grammar
- File write confirmation if applicable`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rules: {
          type: 'array',
          description:
            'Array of parser rules to add. Each rule requires name and definition properties.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Rule name (must be lowercase)',
              },
              definition: {
                type: 'string',
                description: 'The rule definition (e.g., "ID ASSIGN expr", "term (PLUS term)*")',
              },
              return_type: {
                type: 'string',
                description: 'Optional return type specification',
              },
            },
            required: ['name', 'definition'],
          },
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content', 'rules'],
    },
  },
  {
    name: 'add-rules',
    description: `Add multiple mixed parser and lexer rules in a single operation (bulk add).

**When to use:** Set up complete grammar structure, add both tokens and parsing rules together, or quickly prototype.

Example - Add mixed rules:
  rules: [
    { type: "lexer", name: "PLUS", pattern: "'+'" },
    { type: "lexer", name: "MINUS", pattern: "'-'" },
    { type: "parser", name: "expression", definition: "term ((PLUS | MINUS) term)*" },
    { type: "parser", name: "term", definition: "INT | ID" }
  ]
  write_to_file: true

Features:
- Handles both lexer and parser rules in one operation
- Rules sorted alphabetically within their type category
- Duplicate prevention per rule
- Partial success: some rules can succeed even if others fail
- Per-rule success/failure reporting
- Atomic per-rule operations

Returns:
- Summary: "Added X rules, Y failed"
- Per-rule results with success/failure status
- Modified grammar
- File write confirmation if applicable`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rules: {
          type: 'array',
          description:
            'Array of mixed rules to add. Each rule requires type and name. Lexer rules need pattern, parser rules need definition.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['parser', 'lexer'],
                description:
                  'Rule type: "parser" for parsing rules (lowercase names), "lexer" for token rules (uppercase names)',
              },
              name: {
                type: 'string',
                description: 'Rule name (uppercase for lexer, lowercase for parser)',
              },
              definition: {
                type: 'string',
                description: 'Definition for parser rules (e.g., "ID ASSIGN expr")',
              },
              pattern: {
                type: 'string',
                description: 'Pattern for lexer rules (e.g., "[0-9]+", "\'+\'")',
              },
              skip: {
                type: 'boolean',
                description: 'For lexer rules: add "-> skip" directive',
              },
              channel: {
                type: 'string',
                description: 'For lexer rules: optional channel name',
              },
              fragment: {
                type: 'boolean',
                description: 'For lexer rules: mark as fragment',
              },
              return_type: {
                type: 'string',
                description: 'For parser rules: optional return type',
              },
            },
            required: ['type', 'name'],
          },
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content', 'rules'],
    },
  },
  {
    name: 'preview-tokens',
    description: `Preview how input text would be tokenized by lexer rules. Test grammar changes instantly!

**🚀 Native ANTLR4 Support:**
Automatically uses native ANTLR4 runtime if available for 100% accurate tokenization including:
- ✅ Lexer modes (pushMode, popMode)
- ✅ Semantic predicates ({...?})
- ✅ Actions ({...})
- ✅ All ANTLR4 features

Falls back to simulation if ANTLR4 is not installed (works for simple grammars without modes/predicates).

**When to use:** 
- Test if lexer rules match input as expected
- Debug tokenization issues (especially with complex grammars!)
- Verify grammar changes work correctly
- Learn how ANTLR4 tokenizes input

**Setup for 100% accuracy (optional):**
1. Install Java: brew install openjdk
2. Install ANTLR4: wget https://www.antlr.org/download/antlr-4.13.1-complete.jar
3. Set env: export ANTLR4_JAR=/path/to/antlr-4.13.1-complete.jar

**How it works:**
- Native mode: Compiles and executes actual ANTLR4 lexer (100% accurate)
- Simulation mode: Best-effort tokenization (works for ~70% of grammars)

Example - Test basic tokenization:
  input: "x = 42;"
  
Example - Test with complex lexer (Palo Alto):
  from_file: "PaloAlto_lexer.g4"
  load_imports: true
  input: "set user-id-collector enable-mapping-timeout 1"
  
Example - Test specific rules only:
  input: "x + y * 2"
  rules_to_test: ["ID", "PLUS", "TIMES", "INT"]

Returns:
- List of tokens with types and values
- Character positions (start, end, line, column)
- Channel information for channeled tokens
- Errors for unmatched characters
- Mode indicator (🚀 Native or ⚠️ Simulation)
- Feature warnings if simulation used

**Limitations:**
❌ Lexer modes not supported
❌ Semantic predicates not evaluated  
❌ Actions not executed
⚠️  Fragment rules (basic support)
⚠️  Complex patterns (best-effort)

**Alternative:** For complex grammars, use test-parser-rule which tests parser rules without full lexer simulation.

**Note:** This is a simplified simulation. For 100% accuracy, use ANTLR4 tooling.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content with lexer rules',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        input: {
          type: 'string',
          description: 'Input text to tokenize. Can include newlines and special characters.',
        },
        show_positions: {
          type: 'boolean',
          description:
            'If true, show detailed position information (line, column, start, end) for each token',
        },
        rules_to_test: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: Test only specific lexer rules (by name). Useful for focused testing.',
        },
      },
      required: ['grammar_content', 'input'],
    },
  },
  {
    name: 'add-tokens-with-template',
    description: `Add multiple similar lexer tokens at once using template-based generation.

**When to use:** 
- Add multiple tokens that follow a similar pattern
- Generate tokens for command sequences (e.g., "config system X", "set X Y")
- Batch-add tokens with consistent naming conventions

Example - Add tokens for "config system X" patterns:
  base_names: ["ftm-push", "dns", "firewall", "admin"]
  preceding_tokens: ["SYSTEM", "CONFIG"]

Example - Add multiple keyword tokens:
  base_names: ["enable", "disable", "show", "hide"]
  pattern: "'{NAME}'"

Example - Add tokens with custom pattern:
  base_names: ["tcp", "udp", "icmp"]
  pattern: "'protocol-{NAME}'"
  
Features:
- Automatically generates proper token names (uppercase with underscores)
- Supports custom patterns with {NAME} placeholder
- Uses existing bulk add infrastructure for reliability
- All standard options supported (skip, channel, fragment)

Returns:
- Generated rules list
- Per-rule success/failure status
- Modified grammar
- Summary of results`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        base_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Base names for tokens (e.g., ["ftm-push", "dns", "firewall"])',
        },
        preceding_tokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Tokens that precede these (for documentation purposes)',
        },
        pattern: {
          type: 'string',
          description:
            "Optional: Custom pattern template. Use {NAME} as placeholder for base name. Default: '{NAME}'",
        },
        skip: {
          type: 'boolean',
          description: 'If true, adds "-> skip" directive to all generated tokens',
        },
        channel: {
          type: 'string',
          description: 'Optional: Channel name for all generated tokens',
        },
        fragment: {
          type: 'boolean',
          description: 'If true, marks all generated tokens as fragments',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
      },
      required: ['grammar_content', 'base_names'],
    },
  },
  {
    name: 'generate-tokens-from-pattern',
    description: `Generate lexer tokens automatically from natural language input patterns.

**When to use:**
- Quick token generation from sample input text
- Convert configuration snippets into grammar rules
- Generate tokens from command examples
- Prototype grammars from example input

Example - Generate tokens from command:
  input_pattern: "ignore config system ftm-push"
  → Generates: IGNORE, CONFIG, SYSTEM, FTM_PUSH tokens

Example - Generate single compound token:
  input_pattern: "config-system-admin"
  tokenize: false
  → Generates: CONFIG_SYSTEM_ADMIN token

Example - Add prefix to generated tokens:
  input_pattern: "show running-config"
  prefix: "CMD"
  → Generates: CMD_SHOW, CMD_RUNNING_CONFIG tokens

Features:
- Automatic tokenization (splits on whitespace by default)
- Intelligent name generation (uppercase with underscores)
- Optional prefix for token namespacing
- Supports all standard token options (skip, channel, fragment)
- Generates proper ANTLR4 string literal patterns

Returns:
- List of generated tokens with names and patterns
- Per-rule success/failure status  
- Modified grammar
- Summary of results`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        input_pattern: {
          type: 'string',
          description: 'Input text to generate tokens from (e.g., "ignore config system ftm-push")',
        },
        tokenize: {
          type: 'boolean',
          description:
            'If true (default), splits input into individual tokens. If false, creates single token.',
        },
        prefix: {
          type: 'string',
          description: 'Optional: Prefix to add to all generated token names',
        },
        skip: {
          type: 'boolean',
          description: 'If true, adds "-> skip" directive to all generated tokens',
        },
        channel: {
          type: 'string',
          description: 'Optional: Channel name for all generated tokens',
        },
        fragment: {
          type: 'boolean',
          description: 'If true, marks all generated tokens as fragments',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
      },
      required: ['grammar_content', 'input_pattern'],
    },
  },
  {
    name: 'suggest-tokens-from-errors',
    description: `Parse error logs and automatically suggest missing tokens to add to grammar.

**When to use:**
- Debugging parser failures with error logs
- Identifying missing tokens from Batfish errors
- Analyzing ANTLR parse error output
- Incremental grammar development based on test failures

Supported error log formats:
1. Batfish-style: "unexpected token: 'word'"
2. ANTLR-style: "mismatched input 'word'"
3. ANTLR-style: "no viable alternative at input 'word'"
4. Generic: any quoted strings in error context

Example - Analyze Batfish error log:
  error_log: "Error parsing config: unexpected token: 'ftm-push' at line 10"
  → Suggests: FTM_PUSH token with pattern 'ftm-push'

Example - Parse ANTLR errors:
  error_log: "line 5:10 mismatched input 'admin' expecting {CONFIG, SYSTEM}"
  → Suggests: ADMIN token with pattern 'admin'

Features:
- Multi-format error log parsing
- Confidence scoring (high/medium/low)
- Automatic deduplication
- Skips tokens that already exist in grammar
- Provides reasoning for each suggestion
- Handles multiple errors in batch

Returns:
- List of suggested tokens with:
  - Token name (uppercase with underscores)
  - Pattern (string literal)
  - Reason for suggestion
  - Confidence level
- Summary of suggestions found

Note: This tool only suggests tokens. Use add-lexer-rules to actually add them to your grammar.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        error_log: {
          type: 'string',
          description: 'Error log content to analyze (supports Batfish and ANTLR error formats)',
        },
      },
      required: ['grammar_content', 'error_log'],
    },
  },
  {
    name: 'test-parser-rule',
    description: `Test if input text matches a specific parser rule. **Now with native ANTLR4 support!**

**🚀 Native ANTLR4 Support:**
Automatically uses native ANTLR4 runtime if available for 100% accurate parsing including:
- ✅ Lexer modes (pushMode, popMode)
- ✅ Semantic predicates ({...?})
- ✅ Actions ({...})
- ✅ All complex parser patterns
- ✅ Multi-file grammars with imports

Falls back to simulation if ANTLR4 is not installed.

**When to use:** 
- Rapid iteration on rule syntax during development
- Verify if text matches a parser rule structure
- Test rules with complex features (modes, predicates)
- Test rules that reference imported tokens/rules
- Debug parsing issues in complex grammars

**Setup for 100% accuracy (optional):**
1. Install Java: brew install openjdk
2. Install ANTLR4: wget https://www.antlr.org/download/antlr-4.13.1-complete.jar
3. Set env: export ANTLR4_JAR=/path/to/antlr-4.13.1-complete.jar

**How it works:**
- Native mode: Compiles and executes actual ANTLR4 parser (100% accurate)
- Simulation mode: Best-effort matching (~70-90% accuracy)

Example - Test expression rule:
  rule_name: "expression"
  input: "x + y * 2"
  
Example - Test with multi-file grammar:
  from_file: "/path/to/MyParser.g4"
  base_path: "/path/to/grammar/dir"
  load_imports: true
  rule_name: "expression"
  input: "x + y"

Example - Show parse tree:
  rule_name: "statement"
  input: "if (x) y = 1;"
  show_tree: true

Returns:
- Match result (✅ matches or ❌ doesn't match)
- Parse tree (if show_tree enabled)
- Parse errors with line/column information
- Mode indicator (🚀 Native or ⚠️ Simulation)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the parser rule to test (e.g., "expression", "statement")',
        },
        input: {
          type: 'string',
          description: 'Input text to test against the rule',
        },
        base_path: {
          type: 'string',
          description:
            'Optional: base directory for resolving imports and tokenVocab. Required for multi-file grammars.',
        },
        load_imports: {
          type: 'boolean',
          description:
            'Optional: if true, automatically load imported grammars and lexer vocabulary. Default: true.',
        },
        show_tree: {
          type: 'boolean',
          description:
            'Optional: if true, displays the parse tree (native mode only). Default: false.',
        },
      },
      required: ['grammar_content', 'rule_name', 'input'],
    },
  },
  {
    name: 'inline-rule',
    description: `Inline a rule by replacing all references with its definition, then delete the original rule.

**When to use:**
- Remove "pass-through" or helper rules
- Simplify grammar structure
- Clean up unnecessary indirection
- Inverse of extract-fragment refactoring

**How it works:**
1. Validates rule can be inlined (no circular references, not recursive, actually used)
2. Extracts rule body (removes labels, actions preserved)
3. Finds all references to the rule
4. Replaces references with rule body (adds parentheses if needed)
5. Removes original rule definition

Example - Simple pass-through:
  rule_name: "additiveExpression"
  // Before: expression: additiveExpression;
  //         additiveExpression: term ((PLUS | MINUS) term)*;
  // After:  expression: term ((PLUS | MINUS) term)*;

Example - Helper rule:
  rule_name: "value"
  // Before: assignment: ID ASSIGN value SEMI;
  //         value: NUMBER | STRING | ID;
  // After:  assignment: ID ASSIGN (NUMBER | STRING | ID) SEMI;

Features:
- Circular reference detection
- Smart parenthesization
- Multi-reference support
- Dry-run mode available
- Detailed statistics

Returns:
- Modified grammar with rule inlined
- Number of references replaced
- List of affected rules
- Original rule definition

Validates:
- Rule exists
- Not self-recursive
- No circular dependencies
- Actually used somewhere`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the rule to inline (e.g., "helper", "value")',
        },
        preserve_parentheses: {
          type: 'boolean',
          description:
            'If true, always wrap inlined body in parentheses (safer but verbose). Default: auto-detect',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, shows what would change without modifying grammar',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content', 'rule_name'],
    },
  },
  {
    name: 'sort-rules',
    description: `Reorder rules in a grammar according to various sorting strategies.

**When to use:**
- Clean up messy grammar files
- Organize rules logically
- Improve readability and maintenance
- Group related rules together

**Sorting Strategies:**

1. **alphabetical** (default)
   - Sorts parser rules alphabetically
   - Then sorts lexer rules alphabetically
   - Most common for general organization

2. **type**
   - Groups by rule type
   - parser_first: true (default) - parser rules first
   - parser_first: false - lexer rules first

3. **dependency**
   - Orders rules based on relationship to anchor rule
   - Requires anchor_rule option
   - Order: dependencies → anchor → dependents → rest
   - Useful for understanding rule relationships

4. **usage**
   - Most-referenced rules first
   - Helps identify "core" rules
   - Useful for understanding grammar structure

Example - Alphabetical:
  strategy: "alphabetical"

Example - Dependency-based:
  strategy: "dependency"
  anchor_rule: "expression"

Example - Type-based:
  strategy: "type"
  parser_first: false  // Lexer rules first

Features:
- Preserves multi-line rule formatting
- Maintains blank lines after rules
- Preserves header (grammar declaration, imports, options)
- Handles all rule types (parser, lexer, fragment)

Returns:
- Reordered grammar
- Statistics (total rules, strategy used)`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        strategy: {
          type: 'string',
          enum: ['alphabetical', 'type', 'dependency', 'usage'],
          description: 'Sorting strategy: alphabetical (default), type, dependency, or usage',
        },
        anchor_rule: {
          type: 'string',
          description:
            'For dependency strategy: the rule to use as anchor (rules used by this rule come first)',
        },
        parser_first: {
          type: 'boolean',
          description: 'For type strategy: if true (default), parser rules come before lexer rules',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'analyze-ambiguities',
    description: `Analyze grammar for common ambiguity patterns that may cause conflicts at runtime.

**When to use:** Before compiling grammar, after making changes, or when diagnosing parser warnings.

**Detection Capabilities:**

1. **Identical Alternatives** (ERROR)
   - Detects exact duplicate alternatives in rules
   - Example: \`expr: ID | NUMBER | ID\` → duplicate ID alternative

2. **Overlapping Prefixes** (WARNING)
   - Finds alternatives that start with same tokens
   - Example: \`stmt: IF expr THEN stmt | IF expr THEN stmt ELSE stmt\`
   - Suggestion: Factor out common prefix

3. **Ambiguous Optionals** (WARNING)
   - Detects \`A? A\` patterns (should be \`A+\`)
   - Detects \`A? A*\` patterns (A* is sufficient)

4. **Hidden Left Recursion** (ERROR)
   - Detects indirect left recursion via other rules
   - Example: \`expr: term\`, \`term: expr PLUS\` → hidden recursion

5. **Lexer Conflicts** (WARNING)
   - Identifies lexer rules that may overlap
   - Example: \`ID: [a-z]+\` and \`KEYWORD: 'if'\` → keyword is also valid ID

**Options:**
- Selective checks: Enable/disable specific ambiguity patterns
- Minimum prefix length: Set threshold for prefix overlap warnings
- Severity levels: ERROR (must fix), WARNING (should review), INFO (optional)

**Returns:**
- List of issues with severity, type, rule name, line number
- Detailed descriptions and actionable suggestions
- Summary counts (errors, warnings, infos)

**Example usage:**
  from_file: "MyGrammar.g4"
  checkIdenticalAlternatives: true
  checkOverlappingPrefixes: true
  minPrefixLength: 2`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        checkIdenticalAlternatives: {
          type: 'boolean',
          description: 'Check for duplicate alternatives (default: true)',
        },
        checkOverlappingPrefixes: {
          type: 'boolean',
          description: 'Check for alternatives with common prefixes (default: true)',
        },
        checkAmbiguousOptionals: {
          type: 'boolean',
          description: 'Check for ambiguous optional patterns like A? A (default: true)',
        },
        checkLeftRecursion: {
          type: 'boolean',
          description: 'Check for hidden left recursion (default: true)',
        },
        checkLexerConflicts: {
          type: 'boolean',
          description: 'Check for lexer rule conflicts (default: true)',
        },
        minPrefixLength: {
          type: 'number',
          description: 'Minimum prefix length for overlap warnings (default: 2)',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'analyze-lexer-modes',
    description: `Analyze lexer mode structure in ANTLR4 grammars.

**When to use:** Understanding mode-based tokenization, debugging mode transitions, documenting mode structure.

**Lexer modes** allow context-sensitive tokenization by switching between different sets of lexer rules.
Common use cases:
- String interpolation (switching modes inside strings)
- Nested comments
- Template parsing
- Context-specific keywords

**Features:**
- Lists all defined modes with their rules
- Identifies mode entry points (pushMode actions)
- Identifies mode exit points (popMode actions)
- Detects common issues (undefined modes, unreachable modes, popMode in DEFAULT_MODE)

**Returns:**
- modes: List of modes with their rules and line numbers
- entryPoints: Rules that push to each mode
- exitPoints: Rules that pop from each mode
- issues: Problems detected (undefined modes, empty modes, etc.)

**Example usage:**
  from_file: "MyLexer.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'analyze-mode-transitions',
    description: `Analyze mode transition graph and detect issues in ANTLR4 lexer modes.

**When to use:** Debugging mode switching logic, ensuring balanced push/pop, detecting circular transitions.

**Features:**
- Builds complete mode transition graph
- Detects circular mode transitions
- Checks for balanced pushMode/popMode usage
- Identifies modes with no exit points
- Suggests improvements for mode structure

**Returns:**
- transitions: List of all mode transitions (from, to, via action, rule)
- issues: Problems detected (circular transitions, unbalanced push/pop)
- suggestions: Recommendations for improving mode structure

**Example usage:**
  from_file: "MyLexer.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'add-lexer-mode',
    description: `Add a new lexer mode declaration to an ANTLR4 grammar.

**When to use:** Creating new modes for context-sensitive tokenization.

**Features:**
- Adds "mode MODE_NAME;" declaration
- Optional positioning with insert_after
- Validates mode name format
- Prevents duplicate mode names

**Example - Add mode after specific rule:**
  mode_name: "STRING_MODE"
  insert_after: "STRING"
  write_to_file: true

**Example - Add mode at end of grammar:**
  mode_name: "TEMPLATE_MODE"
  write_to_file: true`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        mode_name: {
          type: 'string',
          description: 'Name of the new mode (UPPER_CASE recommended)',
        },
        insert_after: {
          type: 'string',
          description: 'Optional: Insert mode declaration after this rule name',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description: 'Output format: "full", "diff", or "none"',
        },
      },
      required: ['grammar_content', 'mode_name'],
    },
  },
  {
    name: 'add-rule-to-mode',
    description: `Add a lexer rule to a specific mode in an ANTLR4 grammar.

**When to use:** Adding tokens that only apply in specific lexical contexts.

**Features:**
- Places rule in the correct mode section
- Validates mode exists
- Supports all lexer rule options (skip, channel, fragment)
- Auto-sorts within the mode

**Example - Add rule to STRING_MODE:**
  rule_name: "INTERPOLATION_START"
  pattern: "\\\\{"
  mode_name: "STRING_MODE"
  write_to_file: true

**Example - Add with pushMode action:**
  rule_name: "INTERPOLATION_START"
  pattern: "\\\\{"
  mode_name: "STRING_MODE"
  action: "pushMode(EXPRESSION_MODE)"
  write_to_file: true`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read. Required if using write_to_file.',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the lexer rule (UPPER_CASE)',
        },
        pattern: {
          type: 'string',
          description: 'The lexer pattern',
        },
        mode_name: {
          type: 'string',
          description: 'Name of the mode to add the rule to',
        },
        fragment: {
          type: 'boolean',
          description: 'If true, marks rule as fragment',
        },
        skip: {
          type: 'boolean',
          description: 'If true, adds "-> skip" directive',
        },
        channel: {
          type: 'string',
          description: 'Channel name to route tokens',
        },
        action: {
          type: 'string',
          description: 'Lexer action (e.g., "pushMode(MODE)", "popMode", "type(TYPE)")',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description: 'Output format: "full", "diff", or "none"',
        },
      },
      required: ['grammar_content', 'rule_name', 'pattern', 'mode_name'],
    },
  },
  {
    name: 'move-rule-to-mode',
    description: `Move an existing lexer rule to a different mode.

**When to use:** Reorganizing lexer rules, fixing mode placement, refactoring grammar structure.

**Features:**
- Moves lexer rules between modes
- Preserves rule definition exactly
- Validates source rule exists and is a lexer rule
- Validates target mode exists

**Example - Move rule to STRING_MODE:**
  rule_name: "STRING_CONTENT"
  target_mode: "STRING_MODE"
  write_to_file: true

**Note:** Parser rules cannot be moved to modes (they don't have mode context).`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the lexer rule to move',
        },
        target_mode: {
          type: 'string',
          description: 'Name of the mode to move the rule to',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description: 'Output format: "full", "diff", or "none"',
        },
      },
      required: ['grammar_content', 'rule_name', 'target_mode'],
    },
  },
  {
    name: 'list-mode-rules',
    description: `List all lexer rules in a specific mode.

**When to use:** Quick inspection of mode contents, debugging mode issues, understanding mode structure.

**Returns:**
- List of rules with names, patterns, and line numbers
- Total count of rules in the mode

**Example - List rules in STRING_MODE:**
  mode_name: "STRING_MODE"

**Example - List rules in DEFAULT_MODE:**
  mode_name: "DEFAULT_MODE"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        mode_name: {
          type: 'string',
          description: 'Name of the mode to list rules from',
        },
      },
      required: ['grammar_content', 'mode_name'],
    },
  },
  {
    name: 'duplicate-mode',
    description: `Duplicate a lexer mode with all its rules.

**When to use:** Creating similar modes, refactoring mode structure, creating mode templates.

**Features:**
- Copies all rules from source mode to new mode
- Optional prefix for cloned rule names
- Creates new mode declaration automatically

**Example - Duplicate mode without prefix:**
  source_mode: "STRING_MODE"
  new_mode: "TEMPLATE_MODE"

**Example - Duplicate with rule prefix:**
  source_mode: "STRING_MODE"
  new_mode: "INTERPOLATION_MODE"
  prefix_rules: "INTERP_"
  # Rules will be named: INTERP_STRING_CONTENT, etc.`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        source_mode: {
          type: 'string',
          description: 'Name of the mode to duplicate',
        },
        new_mode: {
          type: 'string',
          description: 'Name for the new mode',
        },
        prefix_rules: {
          type: 'string',
          description: 'Optional prefix for cloned rule names',
        },
        write_to_file: {
          type: 'boolean',
          description: 'If true, writes modified grammar back to from_file',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description: 'Output format: "full", "diff", or "none"',
        },
      },
      required: ['grammar_content', 'source_mode', 'new_mode'],
    },
  },
  {
    name: 'create-grammar-template',
    description: `Create a new ANTLR4 grammar from scratch with optional mode structure.

**When to use:** Starting a new grammar project, scaffolding grammar structure, creating grammar templates.

**Features:**
- Creates lexer, parser, or combined grammar
- Optionally includes boilerplate rules (WS, ID, NUMBER, STRING, comments)
- Adds specified modes with placeholder comments
- Ready-to-use structure for common patterns

**Example - Simple lexer grammar:**
  grammar_name: "MyLexer"
  type: "lexer"

**Example - Lexer with modes:**
  grammar_name: "TemplateLexer"
  type: "lexer"
  modes: ["STRING_MODE", "COMMENT_MODE", "INTERPOLATION_MODE"]
  include_boilerplate: true

**Example - Combined grammar:**
  grammar_name: "Calculator"
  type: "combined"
  include_boilerplate: true`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'Placeholder - not required for this tool',
        },
        grammar_name: {
          type: 'string',
          description: 'Name for the new grammar',
        },
        type: {
          type: 'string',
          enum: ['lexer', 'parser', 'combined'],
          description: 'Type of grammar to create (default: lexer)',
        },
        modes: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of mode names to include in the grammar',
        },
        include_boilerplate: {
          type: 'boolean',
          description: 'Include common rules like WS, ID, NUMBER, STRING (default: true)',
        },
      },
      required: ['grammar_name'],
    },
  },
  {
    name: 'grammar-metrics',
    description: `Calculate comprehensive grammar metrics including branching estimation, complexity, and dependencies.

**When to use:** Understanding grammar complexity, identifying optimization opportunities, estimating parsing performance.

**Metrics included:**

**Size Metrics:**
- Total/parser/lexer rule counts
- Fragment counts
- Lines of code, average rule length

**Branching Metrics:**
- Average/max alternatives per rule
- Branching depth (subrule nesting)
- Branching distribution (1-2, 3-5, 6-10, 10+)
- Rules with most branching

**Complexity Metrics:**
- Cyclomatic complexity (per rule and total)
- Recursive rules detection
- Estimated parse complexity (low/medium/high/very-high)

**Dependency Metrics:**
- Fan-in/fan-out averages
- Orphan rules (unused)
- Hub rules (highly referenced)
- Most referenced rules

**Example:**
  from_file: "MyGrammar.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'detect-redos',
    description: `Detect ReDoS (Regular Expression Denial of Service) vulnerabilities in lexer patterns.

**When to use:** Security audit, performance optimization, validating lexer patterns.

**Detects:**
- Nested quantifiers: (a+)+, (a*)*
- Overlapping alternatives: (a|a)+
- Alternatives with common prefix: (ab|ac)
- Unbounded repetition of broad character classes
- Multiple optional elements in sequence

**Returns:**
- List of vulnerabilities with severity (high/medium/low)
- Line numbers and affected rules
- Specific suggestions for each issue

**Example:**
  from_file: "MyLexer.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'check-style',
    description: `Check grammar style and best practices with quality scoring.

**When to use:** Code review, maintaining grammar quality, enforcing conventions.

**Checks:**

**Naming Conventions:**
- Lexer rules should use UPPER_CASE
- Parser rules should use lowerCamelCase

**Best Practices:**
- Missing grammar declaration
- Unused/orphan rules
- Overly complex rules

**Maintainability:**
- Missing documentation on complex rules
- Rule complexity warnings

**Returns:**
- Issues with severity (error/warning/info)
- Style score (0-100)
- Specific suggestions for each issue

**Example:**
  from_file: "MyGrammar.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'analyze-bottlenecks',
    description: `Analyze grammar for performance bottlenecks and optimization opportunities.

**When to use:** Performance optimization, grammar refactoring, large grammar analysis.

**Detects:**
- **High-branching rules**: Rules with many alternatives (10+, 20+, 50+)
- **Tilde negation patterns**: ~NEWLINE, ~[\r\n] that could use lexer modes
- **Missing lexer mode opportunities**: String handling, line-based content, multi-line blocks
- **Greedy loop issues**: Nested quantifiers, reluctant patterns
- **Deep recursion**: Rules with potential stack overflow risk
- **Token prefix collisions**: Keywords that are prefixes of other keywords

**Returns:**
- Bottlenecks with severity (high/medium/low)
- Specific suggestions for each issue
- Estimated performance improvement potential
- Prioritized recommendations

**Example:**
  from_file: "MyGrammar.g4"`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'benchmark-parsing',
    description: `Benchmark grammar parsing performance with sample input.

**When to use:** Performance testing, comparing grammar versions, optimization validation.

**Measures:**
- Total tokens produced
- Average/min/max parse time (ms)
- Tokens per second throughput
- Performance rating (excellent/good/fair/slow)

**Features:**
- Warmup iterations to account for JIT
- Multiple iterations for statistical accuracy
- Performance rating based on parse time
- Optimization suggestions for slow grammars

**Parameters:**
- grammar_content or from_file: The grammar to test
- input: Sample input text to parse
- iterations: Number of timed iterations (default: 10)
- warmup_iterations: Warmup runs before timing (default: 3)

**Example:**
  from_file: "MyGrammar.g4"
  input: "x = 42 + y * 10"
  iterations: 20`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        input: {
          type: 'string',
          description: 'Sample input text to parse',
        },
        iterations: {
          type: 'number',
          description: 'Number of timed iterations (default: 10)',
        },
        warmup_iterations: {
          type: 'number',
          description: 'Warmup runs before timing (default: 3)',
        },
      },
      required: ['grammar_content', 'input'],
    },
  },
  {
    name: 'native-benchmark',
    description: `Benchmark grammar using actual ANTLR4 Java runtime (most accurate).

**When to use:** Final performance testing, comparing grammars, production validation.

**Requirements:**
- Java must be installed
- ANTLR4 JAR must be available (auto-downloads to ~/.local/lib/)

**Features:**
- Uses real ANTLR4 parser (100% accurate)
- Low-overhead Java driver (avoids JVM startup per iteration)
- Warmup iterations for JIT optimization
- Supports multi-file grammars

**Parameters:**
- grammar_files: Object mapping filename to content {"Expr.g4": "grammar Expr..."}
- start_rule: Parser rule to start from
- input: Sample input text
- iterations: Timed iterations (default: 10)
- warmup_iterations: Warmup runs (default: 3)

**Example:**
  grammar_files: {"Expr.g4": "grammar Expr; start: expr EOF; ..."}
  start_rule: "start"
  input: "1 + 2 * 3"
  iterations: 20

**Returns:**
- Avg/min/max parse time
- Throughput (chars/sec, tokens/sec)
- Performance rating (excellent/good/fair/slow)`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_files: {
          type: 'object',
          description: 'Map of filename to grammar content',
          additionalProperties: { type: 'string' },
        },
        start_rule: {
          type: 'string',
          description: 'Parser rule to start parsing from',
        },
        input: {
          type: 'string',
          description: 'Input text to parse',
        },
        iterations: {
          type: 'number',
          description: 'Number of timed iterations (default: 10)',
        },
        warmup_iterations: {
          type: 'number',
          description: 'Warmup runs before timing (default: 3)',
        },
      },
      required: ['grammar_files', 'start_rule', 'input'],
    },
  },
  {
    name: 'profile-parsing',
    description: `Profile grammar parsing with detailed performance metrics.

**When to use:** Deep performance analysis, debugging slow parsing, optimizing grammars.

**Measures:**
- Parse time (ms)
- Token count
- Parse tree depth
- Decision evaluations (ATN transitions)
- Ambiguity count (conflicting alternatives)
- Context sensitivity (SLL→LL fallbacks)
- Rule invocation frequency

**Parameters:**
- grammar_files: Object mapping filename to content
- start_rule: Parser rule to start from
- input: Sample input text

**Returns:**
- Detailed profile metrics
- Most frequently invoked rules
- Optimization suggestions

**Example:**
  grammar_files: {"Expr.g4": "grammar Expr; ..."}
  start_rule: "program"
  input: "x = 1 + 2 * 3"

**Interpretation:**
- ambiguityCount > 0: Grammar has ambiguous alternatives
- contextSensitivityCount > 10: Many SLL→LL fallbacks (slow)
- treeDepth > 100: Excessive nesting`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_files: {
          type: 'object',
          description: 'Map of filename to grammar content',
          additionalProperties: { type: 'string' },
        },
        start_rule: {
          type: 'string',
          description: 'Parser rule to start parsing from',
        },
        input: {
          type: 'string',
          description: 'Input text to parse',
        },
      },
      required: ['grammar_files', 'start_rule', 'input'],
    },
  },
  {
    name: 'visualize-parse-tree',
    description: `Visualize the parse tree structure for a given input.

**When to use:** Understanding parse results, debugging grammar structure, documentation.

**Output formats:**
- **ascii**: Text-based tree with indentation (default)
- **json**: Structured JSON tree representation
- **lisp**: S-expression style (rule child1 child2 ...)

**Parameters:**
- grammar_files: Object mapping filename to content
- start_rule: Parser rule to start from
- input: Sample input text
- format: Output format (ascii, json, lisp)

**Example:**
  grammar_files: {"Expr.g4": "grammar Expr; ..."}
  start_rule: "expr"
  input: "1 + 2 * 3"
  format: "ascii"

**Returns:**
ASCII example:
\`\`\`
expr
├── term
│   └── factor
│       └── NUMBER '1'
├── PLUS '+'
└── term
    ├── factor
    │   └── NUMBER '2'
    ├── TIMES '*'
    └── factor
        └── NUMBER '3'
\`\`\``,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_files: {
          type: 'object',
          description: 'Map of filename to grammar content',
          additionalProperties: { type: 'string' },
        },
        start_rule: {
          type: 'string',
          description: 'Parser rule to start parsing from',
        },
        input: {
          type: 'string',
          description: 'Input text to parse',
        },
        format: {
          type: 'string',
          enum: ['ascii', 'json', 'lisp'],
          description: 'Output format (default: ascii)',
        },
      },
      required: ['grammar_files', 'start_rule', 'input'],
    },
  },
  {
    name: 'generate-stress-test',
    description: `Generate stress test inputs for grammar performance testing.

**When to use:** Testing grammar robustness, identifying performance issues, benchmarking.

**Generation strategies:**
- **nested**: Deep nesting of recursive rules (tests stack depth)
- **wide**: Many alternatives in choice rules (tests branching)
- **repetition**: Repeated sequences (tests loops)
- **mixed**: Combination of all strategies (default)

**Parameters:**
- grammar_content: The grammar to generate tests for
- strategy: Generation strategy (nested, wide, repetition, mixed)
- depth: Nesting depth for nested strategy (default: 50)
- count: Number of alternatives for wide strategy (default: 100)
- repetitions: Repetition count for repetition strategy (default: 100)

**Returns:**
- Generated test input
- Expected characteristics (depth, width, size)
- Warnings if grammar structure can't support requested strategy

**Example:**
  grammar_content: "grammar Expr; ..."
  strategy: "nested"
  depth: 30

  Output: "(((...(1 + 2)...)))"  (30 levels deep)`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        strategy: {
          type: 'string',
          enum: ['nested', 'wide', 'repetition', 'mixed'],
          description: 'Generation strategy (default: mixed)',
        },
        depth: {
          type: 'number',
          description: 'Nesting depth for nested strategy (default: 50)',
        },
        count: {
          type: 'number',
          description: 'Number of alternatives for wide strategy (default: 100)',
        },
        repetitions: {
          type: 'number',
          description: 'Repetition count for repetition strategy (default: 100)',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'compare-profiles',
    description: `Compare two parsing profiles to measure optimization impact.

**When to use:** Validating grammar optimizations, A/B testing changes, regression testing.

**Parameters:**
- profile1: First profile result (from profile-parsing)
- profile2: Second profile result (from profile-parsing)

**Returns:**
- Comparison metrics with % change
- Performance verdict (improved, degraded, unchanged)
- Key differences highlighted
- Recommendations based on changes

**Example:**
  profile1: { parseTimeMs: 150, ambiguityCount: 5, ... }
  profile2: { parseTimeMs: 80, ambiguityCount: 0, ... }

  Output:
  | Metric | Before | After | Change |
  |--------|--------|-------|--------|
  | Parse Time | 150ms | 80ms | -46.7% ✅ |
  | Ambiguities | 5 | 0 | -100% ✅ |

  Verdict: ✅ Improved - Parse time reduced by 46.7%`,
    inputSchema: {
      type: 'object',
      properties: {
        profile1: {
          type: 'object',
          description: 'First profile result (baseline)',
          properties: {
            parseTimeMs: { type: 'number' },
            tokenCount: { type: 'number' },
            treeDepth: { type: 'number' },
            decisionCount: { type: 'number' },
            ambiguityCount: { type: 'number' },
            contextSensitivityCount: { type: 'number' },
          },
        },
        profile2: {
          type: 'object',
          description: 'Second profile result (optimized)',
          properties: {
            parseTimeMs: { type: 'number' },
            tokenCount: { type: 'number' },
            treeDepth: { type: 'number' },
            decisionCount: { type: 'number' },
            ambiguityCount: { type: 'number' },
            contextSensitivityCount: { type: 'number' },
          },
        },
      },
      required: ['profile1', 'profile2'],
    },
  },
  {
    name: 'move-rule',
    description: `Move an existing rule to a new position relative to another rule.

**When to use:** Reorganizing grammar, grouping related rules, fixing rule order.

**Use cases:**
- Move related rules together for better organization
- Position rules before/after their dependencies
- Group similar functionality
- Manual rule ordering (alternative to sort-rules)

**Features:**
- Preserves rule formatting (multi-line, comments)
- Maintains blank lines between rules
- Validates both rule and anchor exist
- Detects if rule is already in target position

**Example usage:**

Move expr rule before term rule:
  rule_name: "expr"
  position: "before"
  anchor_rule: "term"
  
Move NUMBER token after PLUS token:
  rule_name: "NUMBER"
  position: "after"
  anchor_rule: "PLUS"
  write_to_file: true

**Note:** This moves EXISTING rules. To insert NEW rules at specific positions, use add-parser-rule or add-lexer-rule with insert_before/insert_after.`,
    inputSchema: {
      type: 'object',
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_name: {
          type: 'string',
          description: 'Name of the rule to move',
        },
        position: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Move rule before or after the anchor rule',
        },
        anchor_rule: {
          type: 'string',
          description: 'Name of the rule to use as anchor/reference point',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content', 'rule_name', 'position', 'anchor_rule'],
    },
  },
  {
    name: 'smart-validate',
    description: `Smart grammar validation with aggregated, actionable insights.

**When to use:** When validate-grammar returns too many issues and you need to see patterns, not individual warnings.

**Improvements over basic validation:**
- Groups similar issues (e.g., 15,000 undefined refs → "9 missing tokens")
- Prioritizes by impact (most-referenced undefined tokens first)
- Suggests specific fixes with reasoning
- Detects anti-patterns (null_rest_of_line usage)
- Flags suspicious quantifiers (? that should be *)

**Example output:**
Summary: 17,234 issues
  1. Undefined tokens (15,890 refs, 9 unique)
     → Add ADDRESS_REGEX (89 refs), EVENT_TYPE (67 refs), ...
  2. Suspicious quantifiers (8 rules)
     → bgpp_export: bgp_policy_rule? should be *
  3. Incomplete parsing (3 rules)
     → ss_ssl_tls_service_profile uses null_rest_of_line

**Parameters:**
- include_suggestions: Generate smart token suggestions
- detect_quantifiers: Flag suspicious ? patterns
- detect_incomplete: Flag null_rest_of_line usage

Returns: Aggregated summary, grouped issues, and actionable recommendations.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        base_path: {
          type: 'string',
          description: 'Optional: base directory for resolving imports',
        },
        load_imports: {
          type: 'boolean',
          description: 'Optional: if true, automatically load imported grammars. Default: true.',
        },
        include_suggestions: {
          type: 'boolean',
          description: 'Generate smart suggestions for missing tokens (default: true)',
        },
        detect_quantifiers: {
          type: 'boolean',
          description: 'Detect suspicious quantifier patterns (default: true)',
        },
        detect_incomplete: {
          type: 'boolean',
          description: 'Detect incomplete parsing patterns (default: true)',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'detect-quantifier-issues',
    description: `Detect suspicious quantifier patterns that may prevent parsing real configs.

**When to use:** After seeing "unrecognized syntax" warnings or when rules don't match multi-line configs.

**Common patterns detected:**
1. Rule names with _rule, _setting, _property using ? instead of *
   → bgpp_export: EXPORT bgp_policy_rule? should be *
   
2. Multiple optional elements that should be alternatives
   → source? destination? action? should be (source | destination | action)*
   
3. Same optional reference appearing multiple times
   → rule: setting? ... setting? should use setting*

**Real-world example:**
Rule: srs_definition: ... source_setting? destination_setting? action_setting?
Issue: Config has multiple 'set source', 'set destination' lines
Fix: Change to (source_setting | destination_setting | action_setting)*

Returns: List of suspicious patterns with suggestions and reasoning.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'detect-incomplete-parsing',
    description: `Detect incomplete parsing patterns (anti-patterns that discard content).

**When to use:** When grammar parses configs but doesn't capture structure, or uses placeholder patterns.

**Anti-patterns detected:**
1. **null_rest_of_line usage**
   → Discards content instead of parsing it
   → Example: ss_ssl_tls_service_profile: ... null_rest_of_line
   → Problem: Loses protocol-settings, certificates, etc.

2. **Overly broad negation patterns**
   → Example: rule: ~[\\r\\n]+ (matches "anything until newline")
   → Better: Define specific tokens for expected content

**Real-world impact:**
- ss_ssl_tls_service_profile used null_rest_of_line
- Lost: protocol-settings min-version/max-version, certificate options
- Result: Thousands of warnings about unparsed structure

**Recommendations:**
- Replace null_rest_of_line with actual structure
- Define specific lexer tokens instead of broad negations
- Implement proper parser rules for complex structures

Returns: List of incomplete parsing patterns with suggestions.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
      },
      required: ['grammar_content'],
    },
  },
  {
    name: 'fix-quantifier-issues',
    description: `Selectively fix suspicious quantifier patterns - change )? to )* for specific rules.

**When to use:** After detect-quantifier-issues identifies problems.

**Workflow:**
1. Run detect-quantifier-issues to see what's suspicious
2. Review the suggestions
3. Run fix-quantifier-issues with specific rule_names to fix

**What it fixes:**
- Rules with alternatives: (a | b | c)? → (a | b | c)*
- Multiple optional elements that suggest repetition
- Collection-named rules (_rules, _settings) using )?

**Examples:**

// Step 1: Detect issues
detect-quantifier-issues(from_file: "PaloAlto_interface.g4")
→ Shows: snie_ethernet, snie_lacp, sniel_high_availability, snil_units

// Step 2: Fix specific rules
fix-quantifier-issues(
  from_file: "PaloAlto_interface.g4",
  rule_names: ["snie_ethernet", "snie_lacp", "snil_units"]
)
→ Fixes only those 3 rules

// Fix all detected issues
fix-quantifier-issues(from_file: "PaloAlto_interface.g4")
→ Fixes all suspicious patterns

// Preview without changing
fix-quantifier-issues(
  from_file: "PaloAlto_interface.g4",
  dry_run: true
)
→ Shows what would change

**Real-world:**
Palo Alto grammar had 15 rules flagged.
User fixed 12, left 3 as-is (they were correct).

Returns: List of changes with line numbers and reasoning`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        grammar_content: {
          type: 'string',
          description: 'The ANTLR4 grammar file content',
        },
        from_file: {
          type: 'string',
          description: 'Optional: path to a grammar file to read',
        },
        rule_names: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: Array of specific rule names to fix. If omitted, fixes all suspicious patterns',
        },
        dry_run: {
          type: 'boolean',
          description: 'If true, shows what would change without modifying. Default: false',
        },
        output_mode: {
          type: 'string',
          enum: ['full', 'diff', 'none'],
          description:
            'Output mode: "full" returns complete grammar, "diff" returns git-style diff (default: diff), "none" returns no content',
        },
        write_to_file: {
          type: 'boolean',
          description:
            'If true, writes modified grammar back to from_file (requires from_file to be set)',
        },
      },
      required: ['grammar_content'],
    },
  },
];

/**
 * Keep tool schemas consistent with runtime file-loading fallbacks.
 * If a tool supports from_file/from_fileN, grammar content should not be hard-required.
 */
function normalizeToolInputSchemas(toolsList: Tool[]): void {
  for (const tool of toolsList) {
    const inputSchema = tool.inputSchema as
      | { properties?: Record<string, unknown>; required?: string[] }
      | undefined;

    if (!inputSchema || !Array.isArray(inputSchema.required)) {
      continue;
    }

    const properties = inputSchema.properties || {};
    const hasFromFile = Object.prototype.hasOwnProperty.call(properties, 'from_file');
    const hasFromFile1 = Object.prototype.hasOwnProperty.call(properties, 'from_file1');
    const hasFromFile2 = Object.prototype.hasOwnProperty.call(properties, 'from_file2');

    inputSchema.required = inputSchema.required.filter((field) => {
      if (field === 'grammar_content' && hasFromFile) {
        return false;
      }
      if (field === 'grammar1_content' && hasFromFile1) {
        return false;
      }
      if (field === 'grammar2_content' && hasFromFile2) {
        return false;
      }
      return true;
    });
  }
}

normalizeToolInputSchemas(tools);

/**
 * Helper: Reconstruct grammar from merged analysis
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function reconstructGrammarFromAnalysis(analysis: any): string {
  const lines: string[] = [];

  // Add header
  if (analysis.header) {
    lines.push(analysis.header.trim());
    lines.push('');
  }

  // Add parser rules - definition already contains full rule text
  for (const rule of analysis.rules.filter((r: any) => r.type === 'parser')) {
    lines.push(rule.definition);
    lines.push('');
  }

  // Add lexer rules - definition already contains full rule text
  for (const rule of analysis.rules.filter((r: any) => r.type === 'lexer')) {
    lines.push(rule.definition);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { params } = request;
  const name = params.name;
  const args = params.arguments;

  // Debug logging - shows MCP server is being invoked
  console.error(`[ANTLR4-MCP] Tool invoked: ${name}`);
  console.error(`[ANTLR4-MCP] Arguments:`, Object.keys(args || {}).join(', '));

  try {
    let grammarContent = '';
    let grammar2Content = '';

    // Handle file reading
    if (typeof args === 'object' && args !== null) {
      const argsObj = args as Record<string, unknown>;

      // Read grammar 1 - prioritize from_file if grammar_content is empty or looks like a placeholder
      const grammarContentStr = argsObj.grammar_content as string;
      const isPlaceholder =
        grammarContentStr &&
        (/^\/\/\s*(read|from|file|placeholder)/i.test(grammarContentStr.trim()) ||
          grammarContentStr.trim().length < 50); // Very short strings are likely placeholders

      if (
        grammarContentStr &&
        typeof grammarContentStr === 'string' &&
        grammarContentStr.trim() !== '' &&
        !isPlaceholder
      ) {
        grammarContent = grammarContentStr;
        console.error(`[ANTLR4-MCP] Using grammar_content (${grammarContent.length} chars)`);
      } else if (argsObj.from_file && typeof argsObj.from_file === 'string') {
        try {
          grammarContent = fs.readFileSync(argsObj.from_file, 'utf-8');
          console.error(`[ANTLR4-MCP] Read from file: ${argsObj.from_file} (${grammarContent.length} chars)`);
        } catch (readError) {
          console.error(`[ANTLR4-MCP] Failed to read file: ${argsObj.from_file}`, readError);
        }
      } else {
        console.error(`[ANTLR4-MCP] No grammar content available. grammar_content: "${grammarContentStr}", from_file: "${argsObj.from_file}"`);
      }

      // Read grammar 2 (for compare-grammars) - prioritize from_file2 if grammar2_content is empty or placeholder
      const grammar2ContentStr = argsObj.grammar2_content as string;
      const isPlaceholder2 =
        grammar2ContentStr &&
        (/^\/\/\s*(read|from|file|placeholder)/i.test(grammar2ContentStr.trim()) ||
          grammar2ContentStr.trim().length < 50);

      if (
        grammar2ContentStr &&
        typeof grammar2ContentStr === 'string' &&
        grammar2ContentStr.trim() !== '' &&
        !isPlaceholder2
      ) {
        grammar2Content = grammar2ContentStr;
      } else if (argsObj.from_file2 && typeof argsObj.from_file2 === 'string') {
        grammar2Content = fs.readFileSync(argsObj.from_file2, 'utf-8');
      }

      switch (name) {
        case 'help': {
          const topic = (argsObj.topic as string) || 'overview';
          let helpText = '';

          switch (topic) {
            case 'overview':
              helpText = `# ANTLR4 MCP Server - Tool Overview

This server provides 40 specialized tools for working with ANTLR4 grammars, organized into 5 categories:

## 📊 Analysis & Inspection (14 tools)
Extract structure, validate syntax, find rules, compare grammars, detect ambiguities. **Now with metrics and security scanning!**

Tools: analyze-grammar ⭐, validate-grammar ⭐, list-rules, find-rule, format-grammar, get-suggestions, compare-grammars, analyze-ambiguities, analyze-lexer-modes ⭐, analyze-mode-transitions, list-mode-rules, grammar-metrics ⭐, detect-redos ⭐, check-style

**When to use:** Exploring grammars, understanding structure, finding issues, analyzing dependencies, detecting ambiguities, measuring complexity, security auditing. Use load_imports: true for multi-file projects.

## ✏️ Authoring & Modification (16 tools)
Add, remove, update, and rename rules with automatic sorting and duplicate prevention. **Now with lexer mode support!**

Tools: add-lexer-rule, add-parser-rule, remove-rule, update-rule, rename-rule, add-lexer-rules, add-parser-rules, add-rules, add-tokens-with-template, generate-tokens-from-pattern, suggest-tokens-from-errors, add-lexer-mode, add-rule-to-mode, move-rule-to-mode, duplicate-mode, create-grammar-template

**When to use:** Creating new grammars, adding rules, modifying definitions, refactoring names, batch token generation, managing lexer modes, scaffolding grammar structure.

## 🔧 Refactoring & Optimization (7 tools)
Find rule usages, analyze complexity/dependencies, extract fragments, merge/inline/sort/move rules.

Tools: find-rule-usages ⭐, rule-statistics, extract-fragment, merge-rules, inline-rule, sort-rules, move-rule ⭐

**When to use:** Optimizing grammars, reducing duplication, understanding dependencies, safe refactoring, organizing large grammars, repositioning rules.

## 🧪 Testing & Validation (2 tools)
Test lexer tokenization and parser rule matching instantly without compilation! **Supports multi-file grammars!**

Tools: preview-tokens, test-parser-rule ⭐

**When to use:** Quick validation during development, testing grammar changes without full ANTLR build cycle, testing rules across imports.

## 📚 Documentation & Reporting (2 tools)
Generate comprehensive Markdown documentation and grammar metrics summaries.

Tools: export-as-markdown, generate-summary

**When to use:** Creating documentation, generating reports, tracking progress.

---

**🚀 NEW FEATURES (v2.3):**
- **Lexer Mode Support**: Full support for analyzing and editing lexer modes
  - analyze-lexer-modes: Analyze mode structure, entry/exit points, detect issues
  - analyze-mode-transitions: Build transition graph, detect circular transitions
  - list-mode-rules: Quick view of rules in a specific mode
  - add-lexer-mode: Add new mode declarations
  - add-rule-to-mode: Add rules to specific modes
  - move-rule-to-mode: Move existing rules between modes
  - duplicate-mode: Clone a mode with all its rules
- **Grammar Templates**: create-grammar-template scaffolds new grammars with mode structure
- **tokenVocab fix**: validate-grammar now correctly resolves lexer tokens from tokenVocab
- **Multi-file rename**: rename-rule supports load_imports for cross-file renaming
- **from_file fallback**: Tools automatically read from from_file when grammar_content is empty
- move-rule: Reposition rules before/after other rules
- Enhanced find-rule-usages: Context info + multi-file search

**💡 QUICK START:** When exploring an unfamiliar grammar, start with:
1. analyze-grammar - Get complete structure (use load_imports: true for multi-file)
2. validate-grammar - Check for issues (use load_imports: true for multi-file)
3. generate-summary - View health metrics

For help on specific categories, use:
- topic: "analysis" for analysis tool details
- topic: "authoring" for editing tool details
- topic: "refactoring" for optimization tool details
- topic: "workflows" for common multi-step patterns
- topic: "examples" for practical usage examples`;
              break;

            case 'workflows':
              helpText = `# Common ANTLR4 MCP Workflows

## 🔍 Workflow 1: Exploring an Unfamiliar Grammar (Multi-File Support!)
1. **analyze-grammar** with load_imports: true - Extract complete structure across imports
2. **validate-grammar** with load_imports: true - Identify any issues in all files
3. **analyze-ambiguities** - Detect potential ambiguities
4. **generate-summary** - View metrics and health
5. **find-rule** with regex - Discover specific patterns

Example: Analyze multi-file Batfish grammar
  analyze-grammar: from_file="PaloAlto_rulebase.g4", base_path="/path/to/grammars", load_imports=true

## ✏️ Workflow 2: Adding New Rules Safely
1. **list-rules** - See existing rules to avoid conflicts
2. **add-parser-rule** or **add-lexer-rule** - Add new rule (auto-sorted)
3. **validate-grammar** - Verify syntax correctness
4. **test-parser-rule** ⭐ - Quick validation without compilation
5. **find-rule-usages** - Check where new rule is used

For multiple rules: Use **add-lexer-rules**, **add-parser-rules**, or **add-rules** for bulk operations.

## 🔧 Workflow 3: Safe Rule Renaming (Multi-File Support!)
1. **find-rule-usages** with load_imports: true - See all usages across imports
2. **rule-statistics** - Analyze complexity and dependencies
3. **rename-rule** with load_imports: true and write_to_file: true - Rename across all files
4. **validate-grammar** with load_imports: true - Verify no issues introduced

Example: Rename "expr" to "expression"
  find-rule-usages: rule_name="expr", load_imports=true
  rename-rule: old_name="expr", new_name="expression", write_to_file=true

## ⚡ Workflow 4: Grammar Optimization & Cleanup
1. **analyze-ambiguities** - Find potential issues before compilation
2. **rule-statistics** - Find complex rules with high fan-in/fan-out
3. **inline-rule** - Collapse pass-through helper rules
4. **sort-rules** - Organize rules (alphabetical, dependency, usage, or type)
5. **move-rule** ⭐ - Reposition rules for better organization
6. **extract-fragment** - Create reusable patterns from duplicated lexer patterns
7. **merge-rules** - Consolidate similar rules into one with alternatives
8. **generate-summary** - View improvements

Example: Reorganize grammar
  sort-rules: strategy="dependency", anchor_rule="program", write_to_file=true
  move-rule: rule_name="utility", position="after", anchor_rule="common"

## 🧪 Workflow 5: Rapid Development & Testing (Multi-File Support!)
1. **add-parser-rule** - Add new rule to grammar
2. **test-parser-rule** with load_imports: true - Test across imports (no compilation!)
3. **update-rule** - Refine rule definition based on test results
4. **test-parser-rule** - Verify changes work
5. **analyze-ambiguities** - Check for new ambiguities
6. **validate-grammar** - Final syntax check

Example: Test multi-file parser rule
  test-parser-rule: rule_name="srs_group_tag", input="group-tag \"Value\"", from_file="PaloAlto_rulebase.g4", load_imports=true

## 📝 Workflow 6: Documentation Generation
1. **analyze-grammar** - Extract complete structure
2. **export-as-markdown** - Generate comprehensive documentation
3. **generate-summary** - Create metrics summary
4. **compare-grammars** - Highlight differences between versions

## 🔨 Workflow 7: Rule Removal
1. **find-rule-usages** with load_imports: true - Check cross-file references (critical!)
2. **remove-rule** with write_to_file: true - Delete the rule
3. **validate-grammar** - Check for broken references

**Warning:** remove-rule does NOT update references. Check usages first!

## 🚀 Workflow 8: Multi-File Grammar Management
1. **analyze-grammar** with load_imports: true - Get complete view
2. **find-rule-usages** with load_imports: true - Track cross-file dependencies
3. **validate-grammar** with load_imports: true - Validate with lexer imports (tokenVocab resolved)
4. **test-parser-rule** with load_imports: true - Test with full context
5. **rename-rule** with load_imports: true - Rename across all imported files

**New in v2.2:** tokenVocab lexer tokens are correctly resolved during validation!

---

**💡 TIP:** Always use write_to_file: true when you want changes persisted.`;
              break;

            case 'analysis':
              helpText = `# Analysis & Inspection Tools

## analyze-grammar
**Purpose:** Extract complete grammar structure and metadata
**Returns:** Rules, tokens, imports, references, validation issues
**Use when:** First exploration of a grammar

## validate-grammar
**Purpose:** Detect syntax issues and problems
**Detects:** Undefined rules, unused rules, left recursion, naming violations
**Multi-file:** Use load_imports: true to validate with lexer imports (tokenVocab)
**Use when:** After making changes, or diagnosing problems
**Note:** With load_imports=true, lexer tokens from tokenVocab are correctly resolved

## analyze-ambiguities ⭐ NEW
**Purpose:** Static analysis for common ANTLR4 ambiguity patterns
**Detects:**
  1. Identical alternatives (ERROR) - Duplicate alternatives in rules
  2. Overlapping prefixes (WARNING) - Alternatives with common prefixes
  3. Ambiguous optionals (WARNING) - Patterns like A? A and A? A*
  4. Hidden left recursion (ERROR) - Indirect left recursion via other rules
  5. Lexer conflicts (WARNING) - Overlapping lexer patterns
**Returns:** Issues with severity (ERROR/WARNING/INFO), actionable suggestions
**Use when:** Before compilation, after making changes, debugging parser warnings
**Example:**
  - Detect duplicate: expr: ID | NUMBER | ID  →  ERROR
  - Suggest fix: Use ID+ instead of ID? ID  →  WARNING

## list-rules
**Purpose:** List all rules with optional filtering
**Filters:** lexer, parser, or all
**Use when:** Getting overview of available rules

## find-rule
**Purpose:** Locate specific rules or patterns
**Features:** Exact match OR regex pattern matching
**Examples:**
  - Exact: rule_name="expression"
  - All lexer: rule_name="^[A-Z]+$", use_regex=true
  - Contains "token": rule_name=".*token.*", use_regex=true
**Use when:** Searching for specific rules or rule patterns

## format-grammar
**Purpose:** Display structured summary with formatting
**Returns:** Name, type, rules, imports, options, issues
**Use when:** Need high-level overview

## get-suggestions
**Purpose:** Get actionable improvement recommendations
**Analyzes:** Naming, complexity, unused rules, undefined refs, performance
**Use when:** Optimizing grammar quality

## compare-grammars
**Purpose:** Compare two grammars side-by-side
**Returns:** Common rules, unique rules, modified rules, statistics
**Use when:** Understanding changes between versions`;
              break;

            case 'authoring':
              helpText = `# Authoring & Modification Tools

## Single Rule Operations

### add-lexer-rule
**Purpose:** Add single lexer rule (token)
**Features:** Auto-sorting, duplicate prevention, naming validation
**Examples:**
  - ID rule: name="ID", pattern="[a-zA-Z_][a-zA-Z0-9_]*"
  - Whitespace: name="WS", pattern="[ \\t\\n\\r]+", skip=true
  - Fragment: name="DIGIT", pattern="[0-9]", fragment=true

### add-parser-rule
**Purpose:** Add single parser rule
**Features:** Auto-sorting, duplicate prevention, naming validation
**Examples:**
  - Expression: name="expression", definition="term ((PLUS | MINUS) term)*"
  - Statement: name="statement", definition="assignment | ifStatement"

### remove-rule
**Purpose:** Delete a rule
**Warning:** Does NOT update references - use find-rule-usages first!

### update-rule
**Purpose:** Modify existing rule definition
**Preserves:** Rule position in grammar
**Use when:** Changing rule logic without renaming

### rename-rule
**Purpose:** Rename rule and ALL references safely
**Features:** Whole-word matching, complete reference tracking, multi-file support
**Multi-file:** Use load_imports: true to rename across imported grammars
**Recommended workflow:**
  1. find-rule-usages with load_imports=true (check full impact)
  2. rename-rule with load_imports=true (perform refactoring)
  3. validate-grammar with load_imports=true (verify)

## Bulk Operations

### (removed) add-lexer-rules — merged into add-rules
**Purpose:** Add multiple lexer rules at once
**Features:** Partial success, per-rule reporting

### add-parser-rules
**Purpose:** Add multiple parser rules at once
**Features:** Partial success, per-rule reporting

### add-rules
**Purpose:** Add mixed lexer and parser rules
**Most flexible:** Handles both types in one operation

## Advanced Token Generation

### add-tokens-with-template
**Purpose:** Generate multiple similar tokens using templates
**Features:** Pattern-based generation with {NAME} placeholder
**Examples:**
  - Config tokens: base_names=["ftm-push", "dns", "firewall"]
  - Custom pattern: pattern="'protocol-{NAME}'"
**Use when:** Adding related tokens with consistent patterns

### generate-tokens-from-pattern
**Purpose:** Auto-generate tokens from natural language input
**Features:** Automatic tokenization and naming
**Examples:**
  - Input: "ignore config system ftm-push"
  - Generates: IGNORE, CONFIG, SYSTEM, FTM_PUSH
**Use when:** Quick prototyping from sample input

### suggest-tokens-from-errors
**Purpose:** Parse error logs and suggest missing tokens
**Supports:** Batfish errors, ANTLR parse errors
**Features:** Confidence scoring, automatic deduplication
**Use when:** Debugging parser failures
**Note:** Only suggests tokens - use add-rules to add them (add-lexer-rules merged into add-rules)

---

**💡 FILE PERSISTENCE:** All authoring tools support write_to_file: true
Set this parameter to automatically save changes to the grammar file.`;
              break;

            case 'refactoring':
              helpText = `# Refactoring & Optimization Tools

## find-rule-usages ⭐ ENHANCED
**Purpose:** Find all references to a specific rule with context
**Returns:** Total count, line numbers, containing rule, context
**Multi-file:** Use load_imports: true to search across imported grammars
**Use before:** Renaming or removing rules
**Example:** rule_name="expression", load_imports=true
**New features:**
  - Shows which rule contains each usage
  - Skips definition line and comments
  - Helpful messages for unused rules

## move-rule ⭐ NEW
**Purpose:** Reposition a rule before or after another rule
**Parameters:** 
  - rule_name: rule to move
  - position: 'before' or 'after'
  - anchor_rule: target rule for positioning
**Benefits:** Organize grammar, group related rules, enforce conventions
**Example:** rule_name="expression", position="before", anchor_rule="statement"
**Use cases:**
  - Organizing by logical grouping
  - Placing dependencies before dependents
  - Following team style guides
  - Improving readability

## rule-statistics
**Purpose:** Analyze rule complexity and dependencies
**Returns:**
  - Complexity: number of alternatives
  - Fan-out: rules this rule references (dependencies)
  - Fan-in: rules that reference this rule (dependents)
  - Recursion: direct/indirect recursion detection
**Use cases:**
  - Identify complex rules for optimization
  - Find heavily-coupled rules
  - Detect recursion issues
  - Plan refactoring priorities

## inline-rule
**Purpose:** Replace rule references with definition and delete original rule
**Benefits:** Collapse pass-through rules, simplify grammar structure
**Safety:** Automatic circular reference detection, smart parenthesization
**Example:**
  Before: expr: primary; primary: NUMBER | ID;
  After:  expr: (NUMBER | ID);
**Use cases:**
  - Removing unnecessary helper rules
  - Flattening grammar hierarchy
  - Reducing rule clutter

## sort-rules
**Purpose:** Reorder rules using multiple sorting strategies
**Strategies:**
  1. alphabetical - Simple A-Z ordering
  2. type - Group parser rules, then lexer rules
  3. dependency - Order by dependencies (with anchor rule)
  4. usage - Order by reference count (most-used first)
**Example:**
  strategy="dependency", anchor_rule="program"
**Use cases:**
  - Organizing large grammar files
  - Improving readability
  - Grouping related rules

## extract-fragment
**Purpose:** Create reusable fragment from a pattern
**Benefits:** Reduce duplication, improve maintainability
**Example:**
  fragment_name="DIGIT", pattern="[0-9]"
  Then use in other rules: ID: LETTER (LETTER | DIGIT)*

## merge-rules
**Purpose:** Combine two rules into one with alternatives
**Benefits:** Reduce rule count, group related logic
**Example:**
  rule1="intLiteral", rule2="floatLiteral", new="numericLiteral"
  Result: numericLiteral: intLiteral | floatLiteral

---

**💡 SAFE REFACTORING PATTERN:**
1. find-rule-usages - Understand impact
2. rule-statistics - Analyze complexity
3. inline-rule OR rename-rule OR merge-rules - Perform refactoring
4. validate-grammar - Verify correctness
5. analyze-ambiguities ⭐ - Check for new issues`;
              break;

            case 'examples':
              helpText = `# Practical Usage Examples

## Example 1: Creating a Simple Calculator Grammar

Step 1 - Add lexer rules for tokens:
  Tool: add-rules (add-lexer-rules merged)
  rules: [
    { name: "PLUS", pattern: "'+'" },
    { name: "MINUS", pattern: "'-'" },
    { name: "TIMES", pattern: "'*'" },
    { name: "DIVIDE", pattern: "'/'" },
    { name: "NUMBER", pattern: "[0-9]+" },
    { name: "WS", pattern: "[ \\t\\n\\r]+", skip: true }
  ]

Step 2 - Add parser rules for expressions:
  Tool: add-parser-rules
  rules: [
    { name: "expression", definition: "term ((PLUS | MINUS) term)*" },
    { name: "term", definition: "factor ((TIMES | DIVIDE) factor)*" },
    { name: "factor", definition: "NUMBER" }
  ]

Step 3 - Validate:
  Tool: validate-grammar

## Example 2: Finding and Analyzing a Rule

Step 1 - Find all lexer rules:
  Tool: find-rule
  rule_name: "^[A-Z]+$"
  use_regex: true

Step 2 - Analyze specific rule complexity:
  Tool: rule-statistics
  rule_name: "expression"

Step 3 - See where it's used:
  Tool: find-rule-usages
  rule_name: "expression"

## Example 3: Safe Rule Renaming

Step 1 - Check current usages:
  Tool: find-rule-usages
  rule_name: "expr"

Step 2 - Rename with reference updates:
  Tool: rename-rule
  old_name: "expr"
  new_name: "expression"
  write_to_file: true

Step 3 - Verify no issues:
  Tool: validate-grammar

## Example 4: Optimizing with Fragments

Step 1 - Extract common digit pattern:
  Tool: extract-fragment
  fragment_name: "DIGIT"
  pattern: "[0-9]"

Step 2 - Extract letter pattern:
  Tool: extract-fragment
  fragment_name: "LETTER"
  pattern: "[a-zA-Z]"

Step 3 - Update rules to use fragments (manual or update-rule)

## Example 5: Comparing Grammar Versions

Tool: compare-grammars
from_file1: "v1/MyGrammar.g4"
from_file2: "v2/MyGrammar.g4"

Returns: What changed between versions

## Example 6: Quick Testing Without Compilation ⭐ NEW

Step 1 - Add a new parser rule:
  Tool: add-parser-rule
  rule_name: "assignment"
  definition: "ID ASSIGN expression SEMI"

Step 2 - Test it immediately:
  Tool: test-parser-rule
  rule_name: "assignment"
  input: "x = 42;"

Returns: Match result (SUCCESS or specific errors) - no compilation needed!

## Example 7: Organizing Large Grammars ⭐ NEW

Step 1 - Analyze for ambiguities:
  Tool: analyze-ambiguities

Step 2 - Inline unnecessary helper rules:
  Tool: inline-rule
  rule_name: "helperRule"

Step 3 - Sort rules by dependency:
  Tool: sort-rules
  strategy: "dependency"
  anchor_rule: "program"
  write_to_file: true

Result: Clean, organized grammar with no ambiguities

## Example 8: Generating Documentation

Tool: export-as-markdown
from_file: "MyGrammar.g4"

Output: Complete Markdown documentation`;
              break;

            default:
              helpText = `Unknown topic: ${topic}. Available topics: overview, workflows, analysis, authoring, refactoring, examples`;
          }

          return {
            content: [
              {
                type: 'text',
                text: helpText,
              } as TextContent,
            ],
          };
        }

        case 'analyze-grammar': {
          const loadImports = (argsObj.load_imports as boolean) ?? true;
          const basePath = (argsObj.base_path as string) || undefined;
          const fromFile = (argsObj.from_file as string) || undefined;
          const summaryOnly = (argsObj.summary_only as boolean) ?? false;

          let analysis: any;

          if (loadImports && fromFile) {
            // Use multi-file analysis
            analysis = AntlrAnalyzer.loadGrammarWithImports(fromFile, basePath);
          } else {
            // Standard single-file analysis
            analysis = AntlrAnalyzer.analyze(grammarContent);
          }

          let outputData;
          if (summaryOnly) {
            // Return only summary stats for large grammars
            outputData = {
              grammarName: analysis.grammarName,
              grammarType: analysis.grammarType,
              totalRules: analysis.rules.length,
              parserRules: analysis.rules.filter((r: any) => r.type === 'parser').length,
              lexerRules: analysis.rules.filter((r: any) => r.type === 'lexer').length,
              imports: analysis.imports,
              options: analysis.options,
              issueCount: {
                errors: analysis.issues.filter((i: any) => i.type === 'error').length,
                warnings: analysis.issues.filter((i: any) => i.type === 'warning').length,
                info: analysis.issues.filter((i: any) => i.type === 'info').length,
              },
              topReferencedRules: Object.entries(
                analysis.rules.reduce((acc: any, rule: any) => {
                  rule.referencedRules.forEach((ref: string) => {
                    acc[ref] = (acc[ref] || 0) + 1;
                  });
                  return acc;
                }, {})
              )
                .sort(([, a]: any, [, b]: any) => b - a)
                .slice(0, 10)
                .map(([name, count]) => ({ name, references: count })),
            };
          } else {
            outputData = analysis;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(outputData, null, 2),
              } as TextContent,
            ],
          };
        }

        case 'validate-grammar': {
          const argsObj = args as Record<string, unknown>;
          const loadImports = (argsObj.load_imports as boolean) ?? true;
          const basePath = (argsObj.base_path as string) || undefined;
          const fromFile = (argsObj.from_file as string) || undefined;
          const maxIssues = (argsObj.max_issues as number) ?? 100;

          // Use multi-file loading if from_file is provided and load_imports is true
          let analysis;
          if (loadImports && fromFile) {
            analysis = AntlrAnalyzer.loadGrammarWithImports(fromFile, basePath);
          } else {
            analysis = AntlrAnalyzer.analyze(grammarContent);
          }

          const allIssues = analysis.issues;
          const limited = maxIssues > 0 ? allIssues.slice(0, maxIssues) : allIssues;
          const truncated = maxIssues > 0 && allIssues.length > maxIssues;

          const text =
            allIssues.length === 0
              ? 'Grammar is valid with no issues!'
              : 'Grammar validation issues:\n\n' +
                limited
                  .map((issue) => {
                    const line = issue.lineNumber ? ` (line ${issue.lineNumber})` : '';
                    const rule = issue.ruleName ? ` [${issue.ruleName}]` : '';
                    return `[${issue.type.toUpperCase()}] ${issue.message}${rule}${line}`;
                  })
                  .join('\n') +
                (truncated
                  ? `\n\n... and ${allIssues.length - maxIssues} more issues (use max_issues parameter to see more)`
                  : '');

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
          };
        }

        case 'infer-formatting': {
          const formatting = AntlrAnalyzer.inferFormatting(grammarContent);
          const text = `Detected Formatting Style:

• Colon placement: ${formatting.colonPlacement}
  ${formatting.colonPlacement === 'same-line' ? 'Example: ruleName: definition' : 'Example: ruleName\\n  : definition'}

• Semicolon placement: ${formatting.semicolonPlacement}
  ${formatting.semicolonPlacement === 'same-line' ? 'Example: definition;' : 'Example: definition\\n;'}

• Space before colon: ${formatting.spaceAroundColon ? 'yes' : 'no'}
  ${formatting.spaceAroundColon ? 'Example: ruleName : definition' : 'Example: ruleName: definition'}

• Indentation: ${formatting.indentSize} ${formatting.indentStyle.includes('\t') ? 'tab(s)' : 'space(s)'}

• Blank lines between rules: ${formatting.blankLinesBetweenRules ? 'yes' : 'no'}

Note: The update-rule, add-lexer-rule, and add-parser-rule tools automatically preserve this formatting style when making changes.`;

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
          };
        }

        case 'list-rules': {
          const analysis = AntlrAnalyzer.analyze(grammarContent);
          const filterType = (argsObj.filter_type as string) || 'all';

          let rules = analysis.rules;
          if (filterType !== 'all') {
            rules = rules.filter((r) => r.type === filterType);
          }

          const text =
            rules.length === 0
              ? 'No rules found'
              : rules
                  .map((rule) => {
                    const refs =
                      rule.referencedRules.length > 0
                        ? ` → [${rule.referencedRules.join(', ')}]`
                        : '';
                    return `${rule.name} (${rule.type})${refs}`;
                  })
                  .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `${rules.length} rules found:\n\n${text}`,
              } as TextContent,
            ],
          };
        }

        case 'find-rule': {
          const pattern = (argsObj.rule_name as string) || '';
          const useRegex = (argsObj.use_regex as boolean) || false;
          let matchMode = (argsObj.match_mode as string) || 'exact';

          // Support legacy use_regex parameter
          if (useRegex) {
            matchMode = 'regex';
          }

          if (matchMode !== 'exact') {
            // Pattern matching mode: find all rules matching the pattern
            const result = AntlrAnalyzer.findRules(grammarContent, pattern, matchMode as any);

            if (result.error) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Error: ${result.error}`,
                  } as TextContent,
                ],
                isError: true,
              };
            }

            if (result.count === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `No rules found matching pattern: ${pattern} (mode: ${matchMode})`,
                  } as TextContent,
                ],
              };
            }

            const analysis = AntlrAnalyzer.analyze(grammarContent);
            let text = `Found ${result.count} rule(s) matching pattern: ${pattern}\n\n`;

            for (const rule of result.matches) {
              text += `Rule: ${rule.name}\nType: ${rule.type}\nLine: ${rule.lineNumber}\nDefinition: ${rule.definition}\n`;

              if (rule.referencedRules.length > 0) {
                text += `References: ${rule.referencedRules.join(', ')}\n`;
              }

              const referencedBy = analysis.rules
                .filter((r) => r.referencedRules.includes(rule.name))
                .map((r) => r.name);
              if (referencedBy.length > 0) {
                text += `Referenced by: ${referencedBy.join(', ')}\n`;
              }

              text += '\n';
            }

            return {
              content: [
                {
                  type: 'text',
                  text: text.trim(),
                } as TextContent,
              ],
            };
          } else {
            // Exact match mode
            const analysis = AntlrAnalyzer.analyze(grammarContent);
            const rule = analysis.rules.find((r) => r.name === pattern);

            if (!rule) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Rule '${pattern}' not found in grammar`,
                  } as TextContent,
                ],
              };
            }

            let text = `Rule: ${rule.name}\nType: ${rule.type}\nLine: ${rule.lineNumber}\n\nDefinition:\n${rule.definition}`;

            if (rule.referencedRules.length > 0) {
              text += `\n\nReferences:\n${rule.referencedRules.join(', ')}`;
            }

            // Find rules that reference this rule
            const referencedBy = analysis.rules
              .filter((r) => r.referencedRules.includes(pattern))
              .map((r) => r.name);
            if (referencedBy.length > 0) {
              text += `\n\nReferenced by:\n${referencedBy.join(', ')}`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text,
                } as TextContent,
              ],
            };
          }
        }

        case 'get-suggestions': {
          const suggestions = AntlrAnalyzer.getSuggestions(grammarContent);
          const text =
            suggestions.length === 0
              ? 'No suggestions - grammar looks good!'
              : 'Suggestions for improvement:\n\n' +
                suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
          };
        }

        case 'format-grammar': {
          const formatted = AntlrAnalyzer.format(grammarContent);
          return {
            content: [
              {
                type: 'text',
                text: formatted,
              } as TextContent,
            ],
          };
        }

        case 'compare-grammars': {
          // Input validation
          if (!grammarContent || grammarContent.trim() === '') {
            return {
              content: [{ type: 'text', text: 'Error: grammar1_content or from_file1 is required' } as TextContent],
              isError: true,
            };
          }
          if (!grammar2Content || grammar2Content.trim() === '') {
            return {
              content: [{ type: 'text', text: 'Error: grammar2_content or from_file2 is required' } as TextContent],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.compareGrammars(grammarContent, grammar2Content);

          let text = `# Grammar Comparison\n\n`;
          text += `${result.summary}\n\n`;

          text += `## Statistics\n`;
          text += `- Grammar 1: ${result.grammar1.parserRules} parser, ${result.grammar1.lexerRules} lexer (${result.grammar1.totalRules} total)\n`;
          text += `- Grammar 2: ${result.grammar2.parserRules} parser, ${result.grammar2.lexerRules} lexer (${result.grammar2.totalRules} total)\n\n`;

          if (result.differences.added.length > 0) {
            text += `## Added Rules (${result.differences.added.length})\n`;
            text += result.differences.added.join(', ') + '\n\n';
          }
          if (result.differences.removed.length > 0) {
            text += `## Removed Rules (${result.differences.removed.length})\n`;
            text += result.differences.removed.join(', ') + '\n\n';
          }
          if (result.differences.modified.length > 0) {
            text += `## Modified Rules (${result.differences.modified.length})\n`;
            text += result.differences.modified.join(', ') + '\n\n';
          }

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
          };
        }

        case 'add-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const pattern = (argsObj.pattern as string) || undefined;
          const definition = (argsObj.definition as string) || undefined;
          const skip = (argsObj.skip as boolean) || false;
          const channel = (argsObj.channel as string) || undefined;
          const fragment = (argsObj.fragment as boolean) || false;
          const returnType = (argsObj.return_type as string) || undefined;
          const insertAfter = (argsObj.insert_after as string) || undefined;
          const insertBefore = (argsObj.insert_before as string) || undefined;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';
          const outputMode = (argsObj.output_mode as string) || 'diff';

          // Auto-detect rule type from naming convention
          const isLexerRule = ruleName.length > 0 && ruleName[0] === ruleName[0].toUpperCase();

          // Fallback: read from from_file if grammarContent is empty
          let effectiveContent = grammarContent;
          let readError: string | null = null;
          if ((!effectiveContent || effectiveContent.trim() === '') && fromFile) {
            try {
              effectiveContent = fs.readFileSync(fromFile, 'utf-8');
            } catch (err) {
              readError = err instanceof Error ? err.message : String(err);
            }
          }

          // Return error if we couldn't get content
          if (!effectiveContent || effectiveContent.trim() === '') {
            const errorMsg = readError
              ? `✗ Failed to read grammar file '${fromFile}': ${readError}`
              : `✗ No grammar content provided. Use grammar_content or from_file parameter.`;
            return {
              content: [{ type: 'text', text: errorMsg } as TextContent],
              isError: true,
            };
          }

          let result;
          if (isLexerRule) {
            // Lexer rule
            if (!pattern) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `✗ Lexer rules require 'pattern' parameter (rule name '${ruleName}' is UPPERCASE)`,
                  } as TextContent,
                ],
                isError: true,
              };
            }
            result = AntlrAnalyzer.addLexerRule(effectiveContent, ruleName, pattern, {
              skip,
              channel,
              fragment,
              insertAfter,
              insertBefore,
            });
          } else {
            // Parser rule
            if (!definition) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `✗ Parser rules require 'definition' parameter (rule name '${ruleName}' is lowercase)`,
                  } as TextContent,
                ],
                isError: true,
              };
            }
            result = AntlrAnalyzer.addParserRule(effectiveContent, ruleName, definition, {
              returnType,
              insertAfter,
              insertBefore,
            });
          }

          let text = '';
          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(
                grammarContent,
                result.modified,
                fromFile || 'grammar.g4'
              );
              text = `✓ ${result.message}\n\n${diff}`;
            } else if (outputMode === 'full') {
              text = `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`;
            } else {
              // 'none' - only success message
              text = `✓ ${result.message}`;
            }
          } else {
            text = `✗ ${result.message}`;
          }

          // Handle file writing with safety check
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            text += `\n\n${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'remove-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.removeRule(grammarContent, ruleName);

          let text = '';
          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(
                grammarContent,
                result.modified,
                fromFile || 'grammar.g4'
              );
              text = `✓ ${result.message}\n\n${diff}`;
            } else if (outputMode === 'full') {
              text = `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`;
            } else {
              text = `✓ ${result.message}`;
            }
          } else {
            text = `✗ ${result.message}`;
          }

          // Handle file writing
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            text += `\n\n${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'update-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const newDefinition = (argsObj.new_definition as string) || '';
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.updateRule(grammarContent, ruleName, newDefinition);

          let text = '';
          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(
                grammarContent,
                result.modified,
                fromFile || 'grammar.g4'
              );
              text = `✓ ${result.message}\n\n${diff}`;
            } else if (outputMode === 'full') {
              text = `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`;
            } else {
              text = `✓ ${result.message}`;
            }
          } else {
            text = `✗ ${result.message}`;
          }

          // Handle file writing
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            text += `\n\n${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'rename-rule': {
          const oldName = (argsObj.old_name as string) || '';
          const newName = (argsObj.new_name as string) || '';
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';
          const basePath = (argsObj.base_path as string) || undefined;
          const loadImports = (argsObj.load_imports as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';

          // Use multi-file rename if requested
          if (loadImports) {
            if (!fromFile) {
              return {
                content: [
                  {
                    type: 'text',
                    text: '✗ load_imports requires from_file to be specified.',
                  } as TextContent,
                ],
                isError: true,
              };
            }

            const result = AntlrAnalyzer.renameRuleMultiFile(fromFile, oldName, newName, basePath);

            let text = '';
            if (result.success) {
              text = `✓ ${result.message}\n\n`;

              // Show per-file breakdown
              for (const mod of result.modifiedFiles) {
                const relativePath = basePath ? path.relative(basePath, mod.filePath) : mod.filePath;
                text += `📄 ${relativePath}: ${mod.refCount} occurrence(s)\n`;
              }

              // Show diffs if requested
              if (outputMode !== 'none') {
                for (const mod of result.modifiedFiles) {
                  const originalContent = fs.readFileSync(mod.filePath, 'utf-8');
                  const relativePath = basePath ? path.relative(basePath, mod.filePath) : mod.filePath;

                  if (outputMode === 'diff') {
                    const diff = generateUnifiedDiff(originalContent, mod.content, relativePath);
                    text += `\n${diff}\n`;
                  } else if (outputMode === 'full') {
                    text += `\n--- ${relativePath} ---\n${mod.content}\n`;
                  }
                }
              }

              // Handle file writing
              if (writeToFile) {
                for (const mod of result.modifiedFiles) {
                  const writeResult = safeWriteFile(mod.filePath, mod.content);
                  const relativePath = basePath ? path.relative(basePath, mod.filePath) : mod.filePath;
                  text += `\n${writeResult.message} (${relativePath})`;
                }
              }
            } else {
              text = `✗ ${result.message}`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text,
                } as TextContent,
              ],
              isError: !result.success,
            };
          }

          // Single-file rename (original behavior)
          const result = AntlrAnalyzer.renameRule(grammarContent, oldName, newName);

          let text = '';
          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(
                grammarContent,
                result.modified,
                fromFile || 'grammar.g4'
              );
              text = `✓ ${result.message}\n\n${diff}`;
            } else if (outputMode === 'full') {
              text = `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`;
            } else {
              text = `✓ ${result.message}`;
            }
          } else {
            text = `✗ ${result.message}`;
          }

          // Handle file writing
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            text += `\n\n${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'find-rule-usages': {
          const ruleName = (argsObj.rule_name as string) || '';
          const loadImports = (argsObj.load_imports as boolean) ?? false;
          const basePath = (argsObj.base_path as string) || undefined;
          const fromFile = (argsObj.from_file as string) || undefined;

          // Use multi-file loading if requested
          let contentToSearch = grammarContent;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const grammarName = 'grammar';

          if (loadImports && fromFile) {
            const analysis = AntlrAnalyzer.loadGrammarWithImports(fromFile, basePath);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const grammarName = analysis.grammarName;

            // Reconstruct grammar for searching - use rules directly
            const lines = [];
            for (const rule of analysis.rules) {
              lines.push(rule.definition);
              lines.push('');
            }
            contentToSearch = lines.join('\n');
          }

          const usages = AntlrAnalyzer.findRuleUsages(contentToSearch, ruleName);

          let text = `🔍 Found ${usages.count} usage${usages.count !== 1 ? 's' : ''} of '${ruleName}'`;
          if (loadImports) {
            text += ` (including imports)`;
          }
          text += `:\n\n`;

          if (usages.count === 0) {
            text += `No usages found. This rule may be:\n`;
            text += `  • Unused (consider removing if not needed)\n`;
            text += `  • A top-level entry point (intentionally unreferenced)\n`;
          } else {
            for (const loc of usages.locations) {
              text += `📍 Line ${loc.lineNumber}`;
              if (loc.inRule) {
                text += ` (in rule '${loc.inRule}')`;
              }
              text += `:\n   ${loc.context}\n\n`;
            }
          }

          return {
            content: [{ type: 'text', text } as TextContent],
          };
        }

        case 'rule-statistics': {
          const ruleName = (argsObj.rule_name as string) || '';
          const stats = AntlrAnalyzer.getRuleStatistics(grammarContent, ruleName);

          if (!stats) {
            return {
              content: [{ type: 'text', text: `Rule '${ruleName}' not found` } as TextContent],
              isError: true,
            };
          }

          let text = `Rule Statistics: ${stats.name}\n`;
          text += `${'='.repeat(40)}\n\n`;
          text += `Type: ${stats.type}\n`;
          text += `Complexity: ${stats.complexity} alternatives\n`;
          text += `Fan-out: ${stats.fanOut} (rules it references)\n`;
          text += `Fan-in: ${stats.fanIn} (rules that reference it)\n`;
          text += `Recursive: ${stats.isRecursive ? 'Yes' : 'No'}\n\n`;
          text += `Definition:\n${stats.definition}`;

          return {
            content: [{ type: 'text', text } as TextContent],
          };
        }

        case 'extract-fragment': {
          const fragmentName = (argsObj.fragment_name as string) || '';
          const pattern = (argsObj.pattern as string) || '';

          const result = AntlrAnalyzer.extractFragment(grammarContent, fragmentName, pattern);

          return {
            content: [
              {
                type: 'text',
                text: result.success
                  ? `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`
                  : `✗ ${result.message}`,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'merge-rules': {
          const rule1Name = (argsObj.rule1_name as string) || '';
          const rule2Name = (argsObj.rule2_name as string) || '';
          const newRuleName = (argsObj.new_rule_name as string) || '';

          const result = AntlrAnalyzer.mergeRules(
            grammarContent,
            rule1Name,
            rule2Name,
            newRuleName
          );

          return {
            content: [
              {
                type: 'text',
                text: result.success
                  ? `✓ ${result.message}\n\nModified grammar:\n\n${result.modified}`
                  : `✗ ${result.message}`,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'export-as-markdown': {
          const markdown = AntlrAnalyzer.exportAsMarkdown(grammarContent);

          return {
            content: [
              {
                type: 'text',
                text: markdown,
              } as TextContent,
            ],
          };
        }

        case 'generate-summary': {
          const summary = AntlrAnalyzer.generateSummary(grammarContent);

          return {
            content: [
              {
                type: 'text',
                text: summary,
              } as TextContent,
            ],
          };
        }


        case 'add-parser-rules': {
          const rules = argsObj.rules as Array<{
            name: string;
            definition: string;
            return_type?: string;
          }>;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';

          if (!Array.isArray(rules)) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: rules must be an array',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.addParserRules(
            grammarContent,
            rules.map((r) => ({
              name: r.name,
              definition: r.definition,
              options: r.return_type ? { returnType: r.return_type } : undefined,
            }))
          );

          let output = `${result.summary}\n\nDetails:\n${result.results
            .map((r) => `${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`)
            .join('\n')}\n\nModified grammar:\n${result.modified}`;

          const outputMode = (argsObj.output_mode as string) || 'diff';
          // Derive details portion by trimming the Modified grammar section
          const details = output.split('\n\nModified grammar:\n')[0];

          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(grammarContent, result.modified, fromFile || 'grammar.g4');
              output = `${details}\n\n${diff}`;
            } else if (outputMode === 'none') {
              output = details;
            }
            // else full: keep as-is
          }

          // Handle file writing with safety check
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            output += `

${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'add-rules': {
          const rules = argsObj.rules as Array<{
            type: 'parser' | 'lexer';
            name: string;
            pattern?: string;
            definition?: string;
            skip?: boolean;
            channel?: string;
            fragment?: boolean;
            return_type?: string;
          }>;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';

          if (!Array.isArray(rules)) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: rules must be an array',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.addRules(
            grammarContent,
            rules.map((r) => ({
              type: r.type,
              name: r.name,
              pattern: r.pattern,
              definition: r.definition,
              options:
                r.type === 'lexer'
                  ? {
                      skip: r.skip,
                      channel: r.channel,
                      fragment: r.fragment,
                    }
                  : r.return_type
                    ? { returnType: r.return_type }
                    : undefined,
            }))
          );

          let output = `${result.summary}\n\nDetails:\n${result.results
            .map((r) => `${r.success ? '✓' : '✗'} ${r.name} (${r.type}): ${r.message}`)
            .join('\n')}\n\nModified grammar:\n${result.modified}`;

          const outputMode = (argsObj.output_mode as string) || 'diff';
          const details = output.split('\n\nModified grammar:\n')[0];
          if (result.success) {
            if (outputMode === 'diff') {
              const diff = generateUnifiedDiff(grammarContent, result.modified, fromFile || 'grammar.g4');
              output = `${details}\n\n${diff}`;
            } else if (outputMode === 'none') {
              output = details;
            }
          }

          // Handle file writing with safety check
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            output += `

${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'preview-tokens': {
          const input = (argsObj.input as string) || '';
          const showPositions = (argsObj.show_positions as boolean) || false;
          const rulesToTest = (argsObj.rules_to_test as string[]) || undefined;
          const fromFile = (argsObj.from_file as string) || '';
          const loadImports = (argsObj.load_imports as boolean) ?? true;
          const basePath = (argsObj.base_path as string) || undefined;

          // Try native ANTLR4 runtime first
          const runtime = getRuntime();
          const nativeAvailable = await runtime.isAvailable();

          if (nativeAvailable) {
            // Extract grammar name
            const grammarName = grammarContent.match(/(?:lexer\s+)?grammar\s+(\w+)/)?.[1];

            // Use native runtime for 100% accuracy
            const nativeResult = await runtime.tokenize(grammarContent, input, {
              grammarName,
              loadImports: loadImports && fromFile ? true : false,
              basePath: basePath || (fromFile ? require('path').dirname(fromFile) : undefined),
            });

            if (nativeResult.success) {
              // Format native result
              let output = `🚀 Native ANTLR4 Runtime (100% accurate)\n\n`;
              output += `Input: "${input.replace(/\n/g, '\\n')}"\n\n`;

              if (nativeResult.tokens.length > 0) {
                output += `Tokens (${nativeResult.tokens.length}):\n`;
                nativeResult.tokens.forEach((token, index) => {
                  let tokenLine = `  ${index + 1}. ${token.type.padEnd(20)} "${token.text.replace(/\n/g, '\\n')}"`;

                  if (showPositions) {
                    tokenLine += ` [${token.startIndex}:${token.stopIndex}] (${token.line}:${token.column})`;
                  } else {
                    tokenLine += ` (${token.line}:${token.column})`;
                  }

                  if (token.channel && token.channel !== 'DEFAULT_TOKEN_CHANNEL') {
                    tokenLine += ` [${token.channel}]`;
                  }

                  output += tokenLine + '\n';
                });
                output += '\n';
              } else {
                output += 'No tokens matched.\n\n';
              }

              if (nativeResult.errors && nativeResult.errors.length > 0) {
                output += `⚠️  Lexer Errors:\n${nativeResult.errors.map((e) => `  ${e}`).join('\n')}\n\n`;
              }

              output += `✅ All ANTLR4 features supported:\n`;
              output += `  • Lexer modes (pushMode, popMode)\n`;
              output += `  • Semantic predicates ({...?})\n`;
              output += `  • Actions ({...})\n`;
              output += `  • Fragment rules\n`;

              if (nativeResult.compilationTime) {
                output += `\n⏱️  Performance: ${nativeResult.compilationTime}ms compile, ${nativeResult.executionTime}ms execute\n`;
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: output,
                  } as TextContent,
                ],
              };
            } else if (nativeResult.errors && nativeResult.errors.length > 0) {
              // Native runtime failed - fall back to simulation; log errors
              console.error('Native ANTLR4 failed:', nativeResult.errors.join('\n'));
              // Continue to simulation below
            }
          }

          // Fall back to simulation (either no native runtime or it failed)
          const result = AntlrAnalyzer.previewTokens(grammarContent, input, {
            showPositions,
            rulesToTest,
          });

          // Format the output with mode indicator
          let output = '';

          if (!nativeAvailable) {
            output += `⚠️  Using Simulation Mode (ANTLR4 runtime not available)\n\n`;
            output += `💡 For 100% accurate tokenization, install ANTLR4:\n`;
            output +=
              runtime.getInstallInstructions().split('\n').slice(0, 5).join('\n') + '\n...\n\n';
          } else {
            output += `⚠️  Using Simulation Mode (fallback)\n\n`;
          }

          output += `Input: "${input.replace(/\n/g, '\\n')}"\n\n`;

          if (result.warnings.length > 0) {
            output += `⚠️  Warnings:\n${result.warnings.map((w) => `  - ${w}`).join('\n')}\n\n`;
          }

          if (result.tokens.length > 0) {
            output += 'Tokens:\n';
            result.tokens.forEach((token, index) => {
              let tokenLine = `  ${index + 1}. ${token.type}("${token.value.replace(/\n/g, '\\n')}")`;

              if (showPositions) {
                tokenLine += ` [${token.start}:${token.end}] (line ${token.line}, col ${token.column})`;
              }

              if (token.skipped) {
                tokenLine += ' -> skip';
              } else if (token.channel) {
                tokenLine += ` -> channel(${token.channel})`;
              }

              output += tokenLine + '\n';
            });
            output += '\n';
          }

          if (result.errors.length > 0) {
            output += `❌ Errors:\n`;
            result.errors.forEach((error) => {
              output += `  - Position ${error.position}: ${error.message}\n`;
            });
            output += '\n';
          }

          output += result.summary;

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'add-tokens-with-template': {
          const baseNames = (argsObj.base_names as string[]) || [];
          const precedingTokens = (argsObj.preceding_tokens as string[]) || undefined;
          const pattern = (argsObj.pattern as string) || undefined;
          const skip = (argsObj.skip as boolean) || false;
          const channel = (argsObj.channel as string) || undefined;
          const fragment = (argsObj.fragment as boolean) || false;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';

          if (!Array.isArray(baseNames) || baseNames.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: base_names must be a non-empty array',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.addTokensWithTemplate(grammarContent, {
            baseNames,
            precedingTokens,
            pattern,
            options: {
              skip,
              channel,
              fragment,
            },
          });

          let output = `${result.summary}\n\nDetails:\n${result.results
            .map((r) => `${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`)
            .join('\n')}`;

          if (precedingTokens && precedingTokens.length > 0) {
            output = `Context: Tokens preceded by [${precedingTokens.join(', ')}]\n\n${output}`;
          }

          output += `\n\nModified grammar:\n${result.modified}`;

          // Handle file writing with safety check
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            output += `

${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'generate-tokens-from-pattern': {
          const inputPattern = (argsObj.input_pattern as string) || '';
          const tokenize = argsObj.tokenize !== false; // Default to true
          const prefix = (argsObj.prefix as string) || undefined;
          const skip = (argsObj.skip as boolean) || false;
          const channel = (argsObj.channel as string) || undefined;
          const fragment = (argsObj.fragment as boolean) || false;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';

          if (!inputPattern) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: input_pattern is required',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.generateTokensFromPattern(grammarContent, inputPattern, {
            tokenize,
            prefix,
            options: {
              skip,
              channel,
              fragment,
            },
          });

          let output = `Input: "${inputPattern}"\n`;
          output += `Mode: ${tokenize ? 'Split into individual tokens' : 'Single token'}\n\n`;
          output += `Generated tokens:\n${result.generated
            .map((g) => `  ${g.name} : ${g.pattern}`)
            .join('\n')}\n\n`;
          output += `${result.summary}\n\nDetails:\n${result.results
            .map((r) => `${r.success ? '✓' : '✗'} ${r.name}: ${r.message}`)
            .join('\n')}\n\nModified grammar:\n${result.modified}`;

          // Handle file writing with safety check
          if (writeToFile && fromFile && result.success) {
            const writeResult = safeWriteFile(fromFile, result.modified);
            output += `

${writeResult.message}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'suggest-tokens-from-errors': {
          const errorLog = (argsObj.error_log as string) || '';

          if (!errorLog) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: error_log is required',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.suggestTokensFromErrors(grammarContent, errorLog);

          let output = `${result.summary}\n\n`;

          if (result.suggestions.length > 0) {
            output += 'Suggested tokens:\n\n';

            // Group by confidence
            const high = result.suggestions.filter((s) => s.confidence === 'high');
            const medium = result.suggestions.filter((s) => s.confidence === 'medium');
            const low = result.suggestions.filter((s) => s.confidence === 'low');

            if (high.length > 0) {
              output += '🟢 High confidence:\n';
              high.forEach((s) => {
                output += `  ${s.token} : ${s.pattern}\n`;
                output += `    Reason: ${s.reason}\n\n`;
              });
            }

            if (medium.length > 0) {
              output += '🟡 Medium confidence:\n';
              medium.forEach((s) => {
                output += `  ${s.token} : ${s.pattern}\n`;
                output += `    Reason: ${s.reason}\n\n`;
              });
            }

            if (low.length > 0) {
              output += '🔵 Low confidence:\n';
              low.forEach((s) => {
                output += `  ${s.token} : ${s.pattern}\n`;
                output += `    Reason: ${s.reason}\n\n`;
              });
            }

            output +=
              '\nTo add these tokens, use the add-rules tool with the suggested names and patterns.';
          } else {
            output +=
              'No suggestions found. The error log may not contain recognizable token errors.';
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'test-parser-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const input = (argsObj.input as string) || '';
          const loadImports = (argsObj.load_imports as boolean) ?? true;
          const basePath = (argsObj.base_path as string) || undefined;
          const fromFile = (argsObj.from_file as string) || undefined;
          const showTree = (argsObj.show_tree as boolean) || false;

          if (!ruleName) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: rule_name is required',
                } as TextContent,
              ],
              isError: true,
            };
          }

          if (!input) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: input is required',
                } as TextContent,
              ],
              isError: true,
            };
          }

          // Try native ANTLR4 runtime first
          const runtime = getRuntime();
          const nativeAvailable = await runtime.isAvailable();

          if (nativeAvailable) {
            // Extract grammar name
            const grammarName = grammarContent.match(/(?:parser\s+)?grammar\s+(\w+)/)?.[1];

            // Use native runtime for 100% accuracy
            const nativeResult = await runtime.testParserRule(grammarContent, ruleName, input, {
              grammarName,
              loadImports: loadImports && fromFile ? true : false,
              basePath: basePath || (fromFile ? require('path').dirname(fromFile) : undefined),
              showTree,
            });

            if (nativeResult.success) {
              // Format native result
              let output = `🚀 Native ANTLR4 Runtime (100% accurate)\n\n`;

              if (nativeResult.matches) {
                output += `✅ Input matches rule "${ruleName}"\n\n`;
                output += `Input: "${input.replace(/\n/g, '\\n')}"\n\n`;

                if (showTree && nativeResult.tree) {
                  output += `Parse Tree:\n${nativeResult.tree}\n`;
                }
              } else {
                output += `❌ Input does NOT match rule "${ruleName}"\n\n`;
                output += `Input: "${input.replace(/\n/g, '\\n')}"\n\n`;

                if (nativeResult.errors && nativeResult.errors.length > 0) {
                  output += `Parse Errors:\n`;
                  nativeResult.errors.forEach((err) => {
                    output += `  ${err}\n`;
                  });
                  output += '\n';
                }
              }

              output += `✅ All ANTLR4 features supported:\n`;
              output += `  • Lexer modes (pushMode, popMode)\n`;
              output += `  • Semantic predicates ({...?})\n`;
              output += `  • Actions ({...})\n`;
              output += `  • All complex parser patterns\n`;

              return {
                content: [
                  {
                    type: 'text',
                    text: output,
                  } as TextContent,
                ],
              };
            } else if (nativeResult.errors && nativeResult.errors.length > 0) {
              // Native runtime failed - fall back to simulation; log errors
              console.error('Native ANTLR4 failed:', nativeResult.errors.join('\n'));
              // Continue to simulation below
            }
          }

          // Fall back to simulation
          const testGrammar = grammarContent;

          const result = AntlrAnalyzer.testParserRule(testGrammar, ruleName, input, {
            fromFile,
            basePath,
            loadImports,
          });

          let output = '';

          if (!nativeAvailable) {
            output += `⚠️  Using Simulation Mode (ANTLR4 runtime not available)\n\n`;
            output += `💡 For 100% accurate parsing with modes/predicates, install ANTLR4:\n`;
            output +=
              runtime.getInstallInstructions().split('\n').slice(0, 5).join('\n') + '\n...\n\n';
          } else {
            output += `⚠️  Using Simulation Mode (fallback)\n\n`;
          }

          if (!result.success) {
            output += `❌ Error: ${result.message}\n`;
            return {
              content: [
                {
                  type: 'text',
                  text: output,
                } as TextContent,
              ],
              isError: true,
            };
          }

          // Format result
          if (result.matched) {
            output += `✅ Match successful!\n\n`;
            output += `Rule: ${ruleName}\n`;
            output += `Confidence: ${result.confidence}\n`;
            output += `${result.message}\n\n`;

            if (result.details?.matchedAlternative !== undefined) {
              output += `Matched alternative: ${result.details.matchedAlternative + 1}\n`;
            }

            if (result.details?.actualTokens && result.details.actualTokens.length > 0) {
              output += `\nTokens matched:\n`;
              result.details.actualTokens
                .filter((t) => !t.skipped)
                .forEach((token) => {
                  output += `  ${token.type}: "${token.value}"\n`;
                });
            }
          } else {
            output += `❌ No match\n\n`;
            output += `Rule: ${ruleName}\n`;
            output += `Confidence: ${result.confidence}\n`;
            output += `${result.message}\n\n`;

            if (result.details?.partialMatch) {
              output += `⚠️ Partial match detected (input started correctly but incomplete or has extra tokens)\n\n`;
            }

            if (result.details?.expectedTokens && result.details.expectedTokens.length > 0) {
              output += `Expected elements: ${result.details.expectedTokens.join(', ')}\n\n`;
            }

            if (result.details?.actualTokens && result.details.actualTokens.length > 0) {
              output += `Actual tokens:\n`;
              result.details.actualTokens
                .filter((t) => !t.skipped)
                .forEach((token) => {
                  output += `  ${token.type}: "${token.value}"\n`;
                });
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'inline-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const preserveParentheses = (argsObj.preserve_parentheses as boolean) || false;
          const dryRun = (argsObj.dry_run as boolean) || false;
          const writeToFile = (argsObj.write_to_file as boolean) || false;

          if (!ruleName) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: rule_name is required',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.inlineRule(grammarContent, ruleName, {
            preserveParentheses,
            dryRun,
          });

          let output = '';

          if (!result.success) {
            output = `❌ Error: ${result.message}\n`;
            return {
              content: [
                {
                  type: 'text',
                  text: output,
                } as TextContent,
              ],
              isError: true,
            };
          }

          // Format result
          output += dryRun ? `🔍 Dry run: ${result.message}\n\n` : `✅ ${result.message}\n\n`;

          if (result.stats) {
            output += `Statistics:\n`;
            output += `  References replaced: ${result.stats.referencesReplaced}\n`;
            output += `  Affected rules: ${result.stats.referencingRules.join(', ')}\n\n`;

            output += `Original rule definition:\n`;
            output += `  ${result.stats.ruleDefinition}\n\n`;
          }

          if (!dryRun && result.modified) {
            // Handle file writing
            if (writeToFile) {
              const fromFile = (argsObj.from_file as string) || '';

              if (!fromFile) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: 'Error: write_to_file requires from_file to be specified',
                    } as TextContent,
                  ],
                  isError: true,
                };
              }

              const writeResult = safeWriteFile(fromFile, result.modified);
              if (!writeResult.success) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: writeResult.message,
                    } as TextContent,
                  ],
                  isError: true,
                };
              }
              output += `✅ Written to: ${fromFile}
`;
            } else {
              output += `Modified grammar:\n\n${result.modified}`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'sort-rules': {
          const strategy =
            (argsObj.strategy as 'alphabetical' | 'type' | 'dependency' | 'usage') ||
            'alphabetical';
          const anchorRule = (argsObj.anchor_rule as string) || undefined;
          const parserFirst = (argsObj.parser_first as boolean) ?? true;
          const writeToFile = (argsObj.write_to_file as boolean) || false;

          const result = AntlrAnalyzer.sortRules(grammarContent, strategy, {
            anchorRule,
            parserFirst,
          });

          let output = '';

          if (!result.success) {
            output = `❌ Error: ${result.message}\n`;
            return {
              content: [
                {
                  type: 'text',
                  text: output,
                } as TextContent,
              ],
              isError: true,
            };
          }

          // Format result
          output += `✅ ${result.message}\n\n`;

          if (result.stats) {
            output += `Statistics:\n`;
            output += `  Total rules: ${result.stats.totalRules}\n`;
            output += `  Strategy: ${result.stats.strategy}\n\n`;
          }

          if (result.modified) {
            // Handle file writing
            if (writeToFile) {
              const fromFile = (argsObj.from_file as string) || '';

              if (!fromFile) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: 'Error: write_to_file requires from_file to be specified',
                    } as TextContent,
                  ],
                  isError: true,
                };
              }

              const writeResult = safeWriteFile(fromFile, result.modified);
              if (!writeResult.success) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: writeResult.message,
                    } as TextContent,
                  ],
                  isError: true,
                };
              }
              output += `✅ Written to: ${fromFile}
`;
            } else {
              output += `Modified grammar:\n\n${result.modified}`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'analyze-ambiguities': {
          const options = {
            checkIdenticalAlternatives:
              (argsObj.checkIdenticalAlternatives as boolean | undefined) ?? true,
            checkOverlappingPrefixes:
              (argsObj.checkOverlappingPrefixes as boolean | undefined) ?? true,
            checkAmbiguousOptionals:
              (argsObj.checkAmbiguousOptionals as boolean | undefined) ?? true,
            checkLeftRecursion: (argsObj.checkLeftRecursion as boolean | undefined) ?? true,
            checkLexerConflicts: (argsObj.checkLexerConflicts as boolean | undefined) ?? true,
            minPrefixLength: (argsObj.minPrefixLength as number | undefined) ?? 2,
          };

          const result = AntlrAnalyzer.analyzeAmbiguities(grammarContent, options);

          let output = '';

          // Summary header
          if (result.success) {
            output += `✅ No critical ambiguities detected\n\n`;
          } else {
            output += `❌ Found ${result.summary.errors} critical ambiguities\n\n`;
          }

          // Summary statistics
          output += `Summary:\n`;
          output += `  Rules analyzed: ${result.summary.rulesAnalyzed}\n`;
          output += `  Errors: ${result.summary.errors}\n`;
          output += `  Warnings: ${result.summary.warnings}\n`;
          output += `  Infos: ${result.summary.infos}\n\n`;

          // List issues
          if (result.issues.length > 0) {
            output += `Issues:\n\n`;

            // Group by severity
            const errors = result.issues.filter((i) => i.severity === 'error');
            const warnings = result.issues.filter((i) => i.severity === 'warning');
            const infos = result.issues.filter((i) => i.severity === 'info');

            if (errors.length > 0) {
              output += `🔴 ERRORS (must fix):\n`;
              for (const issue of errors) {
                output += `  ${issue.rule}${issue.line ? ` (line ${issue.line})` : ''}: ${issue.description}\n`;
                if (issue.suggestion) {
                  output += `    💡 ${issue.suggestion}\n`;
                }
                output += `\n`;
              }
            }

            if (warnings.length > 0) {
              output += `⚠️  WARNINGS (should review):\n`;
              for (const issue of warnings) {
                output += `  ${issue.rule}${issue.line ? ` (line ${issue.line})` : ''}: ${issue.description}\n`;
                if (issue.suggestion) {
                  output += `    💡 ${issue.suggestion}\n`;
                }
                output += `\n`;
              }
            }

            if (infos.length > 0) {
              output += `ℹ️  INFO (optional):\n`;
              for (const issue of infos) {
                output += `  ${issue.rule}${issue.line ? ` (line ${issue.line})` : ''}: ${issue.description}\n`;
                if (issue.suggestion) {
                  output += `    💡 ${issue.suggestion}\n`;
                }
                output += `\n`;
              }
            }
          } else {
            output += `No ambiguities detected. Grammar looks good! 🎉\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'analyze-lexer-modes': {
          const result = AntlrAnalyzer.analyzeLexerModes(grammarContent);

          let output = '';

          // Summary header
          output += `# Lexer Mode Analysis\n\n`;

          // List modes
          if (result.modes.length > 0) {
            output += `## Modes (${result.modes.length})\n\n`;
            for (const mode of result.modes) {
              output += `### ${mode.name}`;
              if (mode.lineNumber > 0) {
                output += ` (line ${mode.lineNumber})`;
              }
              output += `\n`;
              if (mode.rules.length > 0) {
                output += `Rules: ${mode.rules.join(', ')}\n`;
              } else {
                output += `Rules: (none)\n`;
              }
              output += `\n`;
            }
          } else {
            output += `No lexer modes defined. Grammar uses DEFAULT_MODE only.\n\n`;
          }

          // Entry points
          if (result.entryPoints.length > 0) {
            output += `## Entry Points (pushMode actions)\n\n`;
            // Group by target mode
            const byMode = new Map<string, typeof result.entryPoints>();
            for (const entry of result.entryPoints) {
              if (!byMode.has(entry.mode)) {
                byMode.set(entry.mode, []);
              }
              byMode.get(entry.mode)!.push(entry);
            }
            for (const [mode, entries] of byMode) {
              output += `**${mode}**:\n`;
              for (const entry of entries) {
                output += `  - ${entry.fromRule} → ${entry.action}\n`;
              }
              output += `\n`;
            }
          }

          // Exit points
          if (result.exitPoints.length > 0) {
            output += `## Exit Points (popMode actions)\n\n`;
            // Group by source mode
            const byMode = new Map<string, typeof result.exitPoints>();
            for (const exit of result.exitPoints) {
              if (!byMode.has(exit.mode)) {
                byMode.set(exit.mode, []);
              }
              byMode.get(exit.mode)!.push(exit);
            }
            for (const [mode, exits] of byMode) {
              output += `**${mode}**:\n`;
              for (const exit of exits) {
                output += `  - ${exit.fromRule} → ${exit.action}\n`;
              }
              output += `\n`;
            }
          }

          // Issues
          if (result.issues.length > 0) {
            output += `## Issues\n\n`;
            const errors = result.issues.filter(i => i.type === 'error');
            const warnings = result.issues.filter(i => i.type === 'warning');

            if (errors.length > 0) {
              output += `🔴 ERRORS:\n`;
              for (const issue of errors) {
                output += `  - ${issue.message}`;
                if (issue.ruleName) output += ` (rule: ${issue.ruleName})`;
                output += `\n`;
              }
              output += `\n`;
            }

            if (warnings.length > 0) {
              output += `⚠️  WARNINGS:\n`;
              for (const issue of warnings) {
                output += `  - ${issue.message}`;
                if (issue.ruleName) output += ` (rule: ${issue.ruleName})`;
                output += `\n`;
              }
              output += `\n`;
            }
          } else {
            output += `✅ No issues detected.\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: result.issues.some(i => i.type === 'error'),
          };
        }

        case 'analyze-mode-transitions': {
          const result = AntlrAnalyzer.analyzeModeTransitions(grammarContent);

          let output = '';

          output += `# Mode Transition Analysis\n\n`;

          // Transition graph
          if (result.transitions.length > 0) {
            output += `## Transition Graph\n\n`;
            output += `\`\`\`\n`;
            // Group transitions by source mode
            const byFromMode = new Map<string, typeof result.transitions>();
            for (const t of result.transitions) {
              if (!byFromMode.has(t.from)) {
                byFromMode.set(t.from, []);
              }
              byFromMode.get(t.from)!.push(t);
            }
            for (const [fromMode, transitions] of byFromMode) {
              output += `${fromMode}:\n`;
              for (const t of transitions) {
                output += `  → ${t.to} (via ${t.rule}: ${t.via})\n`;
              }
            }
            output += `\`\`\`\n\n`;
          } else {
            output += `No mode transitions found.\n\n`;
          }

          // Issues
          if (result.issues.length > 0) {
            output += `## Issues\n\n`;
            const errors = result.issues.filter(i => i.type === 'error');
            const warnings = result.issues.filter(i => i.type === 'warning');

            if (errors.length > 0) {
              output += `🔴 ERRORS:\n`;
              for (const issue of errors) {
                output += `  - ${issue.message}\n`;
              }
              output += `\n`;
            }

            if (warnings.length > 0) {
              output += `⚠️  WARNINGS:\n`;
              for (const issue of warnings) {
                output += `  - ${issue.message}\n`;
              }
              output += `\n`;
            }
          } else {
            output += `✅ No issues detected.\n\n`;
          }

          // Suggestions
          if (result.suggestions.length > 0) {
            output += `## Suggestions\n\n`;
            for (const suggestion of result.suggestions) {
              output += `💡 ${suggestion}\n`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: result.issues.some(i => i.type === 'error'),
          };
        }

        case 'add-lexer-mode': {
          const modeName = (argsObj.mode_name as string) || '';
          const insertAfter = (argsObj.insert_after as string) || undefined;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.addLexerMode(grammarContent, modeName, insertAfter);

          let output = result.message + '\n\n';

          // Handle file writing
          if (writeToFile && argsObj.from_file) {
            const writeResult = safeWriteFile(argsObj.from_file as string, result.grammar);
            output += writeResult.message + '\n';
          }

          // Output format
          if (outputMode === 'diff') {
            const diff = generateUnifiedDiff(grammarContent, result.grammar, 'grammar.g4');
            output += `\n${diff}`;
          } else if (outputMode === 'full') {
            output += `\n${result.grammar}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'add-rule-to-mode': {
          const ruleName = (argsObj.rule_name as string) || '';
          const pattern = (argsObj.pattern as string) || '';
          const modeName = (argsObj.mode_name as string) || '';
          const fragment = (argsObj.fragment as boolean) || false;
          const skip = (argsObj.skip as boolean) || false;
          const channel = (argsObj.channel as string) || undefined;
          const action = (argsObj.action as string) || undefined;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.addRuleToMode(
            grammarContent,
            ruleName,
            pattern,
            modeName,
            { fragment, skip, channel, action }
          );

          let output = result.message + '\n\n';

          // Handle file writing
          if (writeToFile && argsObj.from_file) {
            const writeResult = safeWriteFile(argsObj.from_file as string, result.grammar);
            output += writeResult.message + '\n';
          }

          // Output format
          if (outputMode === 'diff') {
            const diff = generateUnifiedDiff(grammarContent, result.grammar, 'grammar.g4');
            output += `\n${diff}`;
          } else if (outputMode === 'full') {
            output += `\n${result.grammar}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'move-rule-to-mode': {
          const ruleName = (argsObj.rule_name as string) || '';
          const targetMode = (argsObj.target_mode as string) || '';
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.moveRuleToMode(grammarContent, ruleName, targetMode);

          let output = result.message + '\n\n';

          if (writeToFile && argsObj.from_file) {
            const writeResult = safeWriteFile(argsObj.from_file as string, result.grammar);
            output += writeResult.message + '\n';
          }

          if (outputMode === 'diff') {
            const diff = generateUnifiedDiff(grammarContent, result.grammar, 'grammar.g4');
            output += `\n${diff}`;
          } else if (outputMode === 'full') {
            output += `\n${result.grammar}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'list-mode-rules': {
          const modeName = (argsObj.mode_name as string) || '';

          const result = AntlrAnalyzer.listModeRules(grammarContent, modeName);

          let output = '';

          if (!result.success) {
            output = `❌ ${result.message}\n`;
            return {
              content: [
                {
                  type: 'text',
                  text: output,
                } as TextContent,
              ],
              isError: true,
            };
          }

          output += `# Mode: ${result.mode}\n\n`;
          output += `${result.message}\n\n`;

          if (result.rules.length > 0) {
            output += `| Rule | Pattern | Line |\n`;
            output += `|------|---------|------|\n`;
            for (const rule of result.rules) {
              output += `| ${rule.name} | \`${rule.pattern}\` | ${rule.lineNumber} |\n`;
            }
          } else {
            output += `No rules in this mode.\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'duplicate-mode': {
          const sourceMode = (argsObj.source_mode as string) || '';
          const newMode = (argsObj.new_mode as string) || '';
          const prefixRules = (argsObj.prefix_rules as string) || undefined;
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';

          const result = AntlrAnalyzer.duplicateMode(grammarContent, sourceMode, newMode, { prefixRules });

          let output = result.message + '\n\n';

          if (writeToFile && argsObj.from_file) {
            const writeResult = safeWriteFile(argsObj.from_file as string, result.grammar);
            output += writeResult.message + '\n';
          }

          if (outputMode === 'diff') {
            const diff = generateUnifiedDiff(grammarContent, result.grammar, 'grammar.g4');
            output += `\n${diff}`;
          } else if (outputMode === 'full') {
            output += `\n${result.grammar}`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'create-grammar-template': {
          const grammarName = (argsObj.grammar_name as string) || '';
          const type = (argsObj.type as 'lexer' | 'parser' | 'combined') || 'lexer';
          const modes = (argsObj.modes as string[]) || [];
          const includeBoilerplate = (argsObj.include_boilerplate as boolean) ?? true;

          const result = AntlrAnalyzer.createGrammarTemplate(grammarName, {
            type,
            modes,
            includeBoilerplate
          });

          let output = result.message + '\n\n';
          output += '```antlr4\n';
          output += result.grammar;
          output += '```\n';

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: !result.success,
          };
        }

        case 'grammar-metrics': {
          const metrics = AntlrAnalyzer.calculateGrammarMetrics(grammarContent);

          let output = '# Grammar Metrics\n\n';

          // Size metrics
          output += `## Size\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Total Rules | ${metrics.size.totalRules} |\n`;
          output += `| Parser Rules | ${metrics.size.parserRules} |\n`;
          output += `| Lexer Rules | ${metrics.size.lexerRules} |\n`;
          output += `| Fragments | ${metrics.size.fragments} |\n`;
          output += `| Total Lines | ${metrics.size.totalLines} |\n`;
          output += `| Avg Rule Length | ${metrics.size.avgRuleLength} lines |\n\n`;

          // Branching metrics
          output += `## Branching\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Avg Alternatives | ${metrics.branching.avgAlternatives} |\n`;
          output += `| Max Alternatives | ${metrics.branching.maxAlternatives} |\n`;
          output += `| Avg Branching Depth | ${metrics.branching.avgBranchingDepth} |\n`;
          output += `| Max Branching Depth | ${metrics.branching.maxBranchingDepth} |\n\n`;

          output += `**Distribution:**\n`;
          for (const [bucket, count] of Object.entries(metrics.branching.branchingDistribution)) {
            output += `- ${bucket} alternatives: ${count} rules\n`;
          }
          output += `\n`;

          if (metrics.branching.rulesWithMostBranching.length > 0) {
            output += `**Top Branching Rules:**\n`;
            for (const rule of metrics.branching.rulesWithMostBranching) {
              output += `- ${rule.name}: ${rule.alternatives} alternatives, depth ${rule.depth}\n`;
            }
            output += `\n`;
          }

          // Complexity metrics
          output += `## Complexity\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Avg Cyclomatic Complexity | ${metrics.complexity.avgCyclomaticComplexity} |\n`;
          output += `| Max Cyclomatic Complexity | ${metrics.complexity.maxCyclomaticComplexity} |\n`;
          output += `| Total Complexity | ${metrics.complexity.totalCyclomaticComplexity} |\n`;
          output += `| Estimated Parse Complexity | **${metrics.complexity.estimatedParseComplexity.toUpperCase()}** |\n\n`;

          if (metrics.complexity.recursiveRules.length > 0) {
            output += `**Recursive Rules:** ${metrics.complexity.recursiveRules.join(', ')}\n\n`;
          }

          // Dependency metrics
          output += `## Dependencies\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Avg Fan-In | ${metrics.dependencies.avgFanIn} |\n`;
          output += `| Avg Fan-Out | ${metrics.dependencies.avgFanOut} |\n\n`;

          if (metrics.dependencies.orphanRules.length > 0) {
            output += `**Orphan Rules:** ${metrics.dependencies.orphanRules.join(', ')}\n\n`;
          }

          if (metrics.dependencies.hubRules.length > 0) {
            output += `**Hub Rules:** ${metrics.dependencies.hubRules.join(', ')}\n\n`;
          }

          if (metrics.dependencies.mostReferenced.length > 0) {
            output += `**Most Referenced:**\n`;
            for (const ref of metrics.dependencies.mostReferenced) {
              output += `- ${ref.name}: ${ref.count} references\n`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'detect-redos': {
          const result = AntlrAnalyzer.detectReDoS(grammarContent);

          let output = '# ReDoS Vulnerability Analysis\n\n';

          output += `**Summary:** `;
          if (result.summary.high > 0) {
            output += `🔴 ${result.summary.high} high, `;
          }
          if (result.summary.medium > 0) {
            output += `🟡 ${result.summary.medium} medium, `;
          }
          if (result.summary.low > 0) {
            output += `🟢 ${result.summary.low} low`;
          }
          if (result.summary.high === 0 && result.summary.medium === 0 && result.summary.low === 0) {
            output += `✅ No vulnerabilities detected`;
          }
          output += `\n\n`;

          if (result.vulnerabilities.length > 0) {
            // Group by severity
            const high = result.vulnerabilities.filter(v => v.severity === 'high');
            const medium = result.vulnerabilities.filter(v => v.severity === 'medium');
            const low = result.vulnerabilities.filter(v => v.severity === 'low');

            if (high.length > 0) {
              output += `## 🔴 High Severity\n\n`;
              for (const v of high) {
                output += `**${v.ruleName}** (line ${v.lineNumber})\n`;
                output += `- Issue: ${v.issue}\n`;
                output += `- Pattern: \`${v.pattern}\`\n`;
                output += `- Suggestion: ${v.suggestion}\n\n`;
              }
            }

            if (medium.length > 0) {
              output += `## 🟡 Medium Severity\n\n`;
              for (const v of medium) {
                output += `**${v.ruleName}** (line ${v.lineNumber})\n`;
                output += `- Issue: ${v.issue}\n`;
                output += `- Suggestion: ${v.suggestion}\n\n`;
              }
            }

            if (low.length > 0) {
              output += `## 🟢 Low Severity\n\n`;
              for (const v of low) {
                output += `**${v.ruleName}** (line ${v.lineNumber})\n`;
                output += `- Issue: ${v.issue}\n`;
                output += `- Suggestion: ${v.suggestion}\n\n`;
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: result.summary.high > 0,
          };
        }

        case 'check-style': {
          const result = AntlrAnalyzer.checkStyle(grammarContent);

          let output = '# Style Check\n\n';

          // Score
          const scoreEmoji = result.score >= 80 ? '✅' : result.score >= 60 ? '⚠️' : '❌';
          output += `**Style Score:** ${scoreEmoji} ${result.score}/100\n\n`;

          output += `**Summary:** `;
          if (result.summary.errors > 0) {
            output += `${result.summary.errors} errors, `;
          }
          if (result.summary.warnings > 0) {
            output += `${result.summary.warnings} warnings, `;
          }
          if (result.summary.infos > 0) {
            output += `${result.summary.infos} info`;
          }
          if (result.summary.errors === 0 && result.summary.warnings === 0 && result.summary.infos === 0) {
            output += `✅ No issues`;
          }
          output += `\n\n`;

          if (result.issues.length > 0) {
            // Group by type
            const errors = result.issues.filter(i => i.severity === 'error');
            const warnings = result.issues.filter(i => i.severity === 'warning');
            const infos = result.issues.filter(i => i.severity === 'info');

            if (errors.length > 0) {
              output += `## ❌ Errors\n\n`;
              for (const issue of errors) {
                output += `- ${issue.message}`;
                if (issue.ruleName) output += ` (${issue.ruleName})`;
                output += `\n`;
                if (issue.suggestion) output += `  💡 ${issue.suggestion}\n`;
              }
              output += `\n`;
            }

            if (warnings.length > 0) {
              output += `## ⚠️ Warnings\n\n`;
              for (const issue of warnings) {
                output += `- ${issue.message}`;
                if (issue.ruleName) output += ` (${issue.ruleName})`;
                output += `\n`;
                if (issue.suggestion) output += `  💡 ${issue.suggestion}\n`;
              }
              output += `\n`;
            }

            if (infos.length > 0) {
              output += `## ℹ️ Info\n\n`;
              for (const issue of infos) {
                output += `- ${issue.message}`;
                if (issue.ruleName) output += ` (${issue.ruleName})`;
                output += `\n`;
                if (issue.suggestion) output += `  💡 ${issue.suggestion}\n`;
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: result.summary.errors > 0,
          };
        }

        case 'analyze-bottlenecks': {
          const result = AntlrAnalyzer.analyzeBottlenecks(grammarContent);

          let output = '# Performance Bottleneck Analysis\n\n';

          // Metrics summary
          output += `**Total Issues:** ${result.metrics.totalBottlenecks}\n`;
          output += `**High Severity:** ${result.metrics.highSeverity}\n`;
          output += `**Estimated Improvement:** ${result.metrics.estimatedImprovement}\n\n`;

          // Recommendations
          if (result.recommendations.length > 0) {
            output += `## 🎯 Top Recommendations\n\n`;
            for (const rec of result.recommendations) {
              output += `${rec}\n`;
            }
            output += `\n`;
          }

          // Group bottlenecks by type
          const byType: Record<string, typeof result.bottlenecks> = {};
          for (const b of result.bottlenecks) {
            if (!byType[b.type]) byType[b.type] = [];
            byType[b.type].push(b);
          }

          const typeLabels: Record<string, string> = {
            'high-branching': '🔀 High Branching',
            'tilde-negation': '📝 Tilde Negation',
            'missing-mode': '🎭 Missing Lexer Mode',
            'greedy-loop': '🔄 Greedy Loop',
            'deep-recursion': '🔁 Deep Recursion',
            'prefix-collision': '🔤 Prefix Collision',
          };

          for (const [type, items] of Object.entries(byType)) {
            output += `## ${typeLabels[type] || type}\n\n`;

            for (const item of items) {
              const severityIcon = item.severity === 'high' ? '🔴' : item.severity === 'medium' ? '🟡' : '🟢';
              output += `### ${severityIcon} ${item.description}\n`;

              if (item.ruleName) {
                output += `- **Rule:** \`${item.ruleName}\``;
                if (item.lineNumber) {
                  output += ` (line ${item.lineNumber})`;
                }
                output += `\n`;
              }

              if (item.currentPattern) {
                output += `- **Pattern:** \`${item.currentPattern.substring(0, 80)}${item.currentPattern.length > 80 ? '...' : ''}\`\n`;
              }

              output += `- **Suggestion:** ${item.suggestion}\n`;
              output += `- **Impact:** ${item.impact}\n\n`;
            }
          }

          if (result.bottlenecks.length === 0) {
            output += `✅ No significant performance bottlenecks detected.\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: false,
          };
        }

        case 'benchmark-parsing': {
          const inputText = (argsObj.input as string) || '';
          const iterations = (argsObj.iterations as number) || 10;
          const warmupIterations = (argsObj.warmup_iterations as number) || 3;

          if (!inputText) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Error: input parameter is required for benchmarking',
                } as TextContent,
              ],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.benchmarkParsing(grammarContent, inputText, {
            iterations,
            warmupIterations
          });

          let output = '# Parsing Benchmark Results\n\n';

          if (!result.success) {
            output += `❌ **Benchmark Failed**\n\n`;
            output += `**Errors:**\n`;
            for (const err of result.errors) {
              output += `- ${err}\n`;
            }
            return {
              content: [{ type: 'text', text: output } as TextContent],
              isError: true,
            };
          }

          // Performance rating with emoji
          const ratingEmoji = {
            excellent: '🚀',
            good: '✅',
            fair: '⚠️',
            slow: '🐌'
          };

          output += `**Performance Rating:** ${ratingEmoji[result.performanceRating]} ${result.performanceRating.toUpperCase()}\n\n`;

          // Metrics table
          output += `## Metrics\n\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Input Length | ${inputText.length} chars |\n`;
          output += `| Total Tokens | ${result.metrics.totalTokens} |\n`;
          output += `| Avg Parse Time | ${result.metrics.avgTimeMs} ms |\n`;
          output += `| Min Parse Time | ${result.metrics.minTimeMs} ms |\n`;
          output += `| Max Parse Time | ${result.metrics.maxTimeMs} ms |\n`;
          output += `| Throughput | ${result.metrics.tokensPerSecond.toLocaleString()} tokens/sec |\n`;
          output += `| Iterations | ${result.metrics.iterations} |\n\n`;

          // Token sample
          if (result.tokens && result.tokens.length > 0) {
            output += `## Token Sample (first 10)\n\n`;
            for (let i = 0; i < Math.min(10, result.tokens.length); i++) {
              const token = result.tokens[i];
              output += `${i + 1}. \`${token.type}\`: "${token.value.substring(0, 30)}${token.value.length > 30 ? '...' : ''}"\n`;
            }
            if (result.tokens.length > 10) {
              output += `\n... and ${result.tokens.length - 10} more tokens\n`;
            }
            output += `\n`;
          }

          // Suggestions
          if (result.suggestions.length > 0) {
            output += `## Optimization Suggestions\n\n`;
            for (const suggestion of result.suggestions) {
              output += `- 💡 ${suggestion}\n`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
            isError: false,
          };
        }

        case 'native-benchmark': {
          const grammarFilesObj = argsObj.grammar_files as Record<string, string>;
          const startRule = (argsObj.start_rule as string) || '';
          const inputText = (argsObj.input as string) || '';
          const iterations = (argsObj.iterations as number) || 10;
          const warmupIterations = (argsObj.warmup_iterations as number) || 3;

          if (!grammarFilesObj || Object.keys(grammarFilesObj).length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: grammar_files parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!startRule) {
            return {
              content: [{ type: 'text', text: 'Error: start_rule parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!inputText) {
            return {
              content: [{ type: 'text', text: 'Error: input parameter is required' } as TextContent],
              isError: true,
            };
          }

          // Convert to Map
          const grammarFiles = new Map(Object.entries(grammarFilesObj));

          // Use native runtime
          const runtime = getRuntime();
          const result = await runtime.benchmark(grammarFiles, startRule, inputText, {
            iterations,
            warmupIterations
          });

          let output = '# Native ANTLR4 Benchmark Results\n\n';

          if (!result.success) {
            output += `❌ **Benchmark Failed**\n\n`;
            if (result.errors) {
              output += `**Errors:**\n`;
              for (const err of result.errors) {
                output += `- ${err}\n`;
              }
            }
            return {
              content: [{ type: 'text', text: output } as TextContent],
              isError: true,
            };
          }

          // Performance rating
          const ratingEmoji = { excellent: '🚀', good: '✅', fair: '⚠️', slow: '🐌' };
          output += `**Performance Rating:** ${ratingEmoji[result.performanceRating]} ${result.performanceRating.toUpperCase()}\n\n`;

          // Metrics table
          output += `## Metrics\n\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Input Size | ${result.metrics.inputSize} chars |\n`;
          output += `| Total Tokens | ${result.metrics.totalTokens} |\n`;
          output += `| Avg Parse Time | ${result.metrics.avgTimeMs} ms |\n`;
          output += `| Min Parse Time | ${result.metrics.minTimeMs} ms |\n`;
          output += `| Max Parse Time | ${result.metrics.maxTimeMs} ms |\n`;
          output += `| Std Deviation | ${result.metrics.stdDevMs} ms |\n`;
          output += `| Throughput | ${result.metrics.throughput.toLocaleString()} chars/sec |\n`;
          output += `| Est. Tokens/sec | ~${Math.round(result.metrics.throughput / 5).toLocaleString()} |\n`;
          output += `| Iterations | ${result.metrics.iterations} |\n\n`;

          // Performance interpretation
          output += `## Interpretation\n\n`;
          if (result.performanceRating === 'excellent') {
            output += `Grammar parses efficiently. No optimization needed.\n`;
          } else if (result.performanceRating === 'good') {
            output += `Grammar performs well. Minor optimizations possible.\n`;
          } else if (result.performanceRating === 'fair') {
            output += `Consider running \`analyze-bottlenecks\` to identify optimization opportunities.\n`;
          } else {
            output += `⚠️ Grammar may have performance issues. Run \`analyze-bottlenecks\` for recommendations.\n`;
          }

          return {
            content: [{ type: 'text', text: output } as TextContent],
            isError: false,
          };
        }

        case 'profile-parsing': {
          const grammarFilesObj = argsObj.grammar_files as Record<string, string>;
          const startRule = (argsObj.start_rule as string) || '';
          const inputText = (argsObj.input as string) || '';

          if (!grammarFilesObj || Object.keys(grammarFilesObj).length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: grammar_files parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!startRule) {
            return {
              content: [{ type: 'text', text: 'Error: start_rule parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!inputText) {
            return {
              content: [{ type: 'text', text: 'Error: input parameter is required' } as TextContent],
              isError: true,
            };
          }

          // Convert to Map
          const grammarFiles = new Map(Object.entries(grammarFilesObj));

          // Use native runtime for profiling
          const runtime = getRuntime();
          const result = await runtime.profileParsing(grammarFiles, startRule, inputText);

          let output = '# Parsing Profile\n\n';

          if (!result.success) {
            output += `❌ **Profiling Failed**\n\n`;
            if (result.errors) {
              output += `**Errors:**\n`;
              for (const err of result.errors) {
                output += `- ${err}\n`;
              }
            }
            return {
              content: [{ type: 'text', text: output } as TextContent],
              isError: true,
            };
          }

          // Profile metrics
          output += `## Performance Metrics\n\n`;
          output += `| Metric | Value |\n`;
          output += `|--------|-------|\n`;
          output += `| Parse Time | ${result.profile.parseTimeMs} ms |\n`;
          output += `| Token Count | ${result.profile.tokenCount} |\n`;
          output += `| Tree Depth | ${result.profile.treeDepth} levels |\n`;
          output += `| Decision Count | ${result.profile.decisionCount} |\n`;
          output += `| Ambiguities | ${result.profile.ambiguityCount} |\n`;
          output += `| Context Sensitivity | ${result.profile.contextSensitivityCount} |\n\n`;

          // Rule frequency
          if (result.rules.byFrequency.length > 0) {
            output += `## Most Invoked Rules\n\n`;
            output += `| Rule | Invocations |\n`;
            output += `|------|------------:|\n`;
            for (const r of result.rules.byFrequency.slice(0, 10)) {
              output += `| ${r.rule} | ${r.count} |\n`;
            }
            output += `\n`;
          }

          // Interpretation
          output += `## Interpretation\n\n`;

          if (result.profile.ambiguityCount > 0) {
            output += `⚠️ **Ambiguities Detected (${result.profile.ambiguityCount})**\n`;
            output += `The parser found multiple valid interpretations. Consider:\n`;
            output += `- Reordering alternatives (most common first)\n`;
            output += `- Using semantic predicates to disambiguate\n`;
            output += `- Left-factoring common prefixes\n\n`;
          }

          if (result.profile.contextSensitivityCount > 10) {
            output += `⚠️ **High Context Sensitivity (${result.profile.contextSensitivityCount})**\n`;
            output += `Many SLL→LL fallbacks detected. This slows parsing. Consider:\n`;
            output += `- Reducing alternative count in rules\n`;
            output += `- Using left-factoring\n`;
            output += `- Avoiding deeply nested structures\n\n`;
          } else if (result.profile.contextSensitivityCount > 0) {
            output += `ℹ️ **Context Sensitivity (${result.profile.contextSensitivityCount})**\n`;
            output += `Some SLL→LL fallbacks occurred. This is normal for complex grammars.\n\n`;
          }

          if (result.profile.treeDepth > 100) {
            output += `⚠️ **Deep Parse Tree (${result.profile.treeDepth} levels)**\n`;
            output += `The parse tree is very deep. This may indicate:\n`;
            output += `- Excessive rule nesting\n`;
            output += `- Recursive structures without proper termination\n\n`;
          }

          if (result.suggestions.length > 0) {
            output += `## Suggestions\n\n`;
            for (const s of result.suggestions) {
              output += `- 💡 ${s}\n`;
            }
          }

          // Performance rating
          let rating = '✅ Good';
          if (result.profile.ambiguityCount > 0 || result.profile.contextSensitivityCount > 10) {
            rating = '⚠️ Needs Optimization';
          }
          if (result.profile.parseTimeMs > 1000) {
            rating = '🐌 Slow';
          }
          output += `\n**Rating:** ${rating}\n`;

          return {
            content: [{ type: 'text', text: output } as TextContent],
            isError: false,
          };
        }

        case 'visualize-parse-tree': {
          const grammarFilesObj = argsObj.grammar_files as Record<string, string>;
          const startRule = (argsObj.start_rule as string) || '';
          const inputText = (argsObj.input as string) || '';
          const format = (argsObj.format as 'ascii' | 'json' | 'lisp') || 'ascii';

          if (!grammarFilesObj || Object.keys(grammarFilesObj).length === 0) {
            return {
              content: [{ type: 'text', text: 'Error: grammar_files parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!startRule) {
            return {
              content: [{ type: 'text', text: 'Error: start_rule parameter is required' } as TextContent],
              isError: true,
            };
          }

          if (!inputText) {
            return {
              content: [{ type: 'text', text: 'Error: input parameter is required' } as TextContent],
              isError: true,
            };
          }

          // Convert to Map
          const grammarFiles = new Map(Object.entries(grammarFilesObj));

          // Use native runtime for visualization
          const runtime = getRuntime();
          const result = await runtime.visualizeParseTree(grammarFiles, startRule, inputText, format);

          let output = '# Parse Tree Visualization\n\n';

          if (!result.success) {
            output += `❌ **Visualization Failed**\n\n`;
            if (result.errors) {
              output += `**Errors:**\n`;
              for (const err of result.errors) {
                output += `- ${err}\n`;
              }
            }
            return {
              content: [{ type: 'text', text: output } as TextContent],
              isError: true,
            };
          }

          output += `**Format:** ${format}\n`;
          output += `**Input:** \`${inputText.substring(0, 50)}${inputText.length > 50 ? '...' : ''}\`\n\n`;
          output += '```\n';
          output += result.tree || '(empty tree)';
          output += '\n```\n';

          return {
            content: [{ type: 'text', text: output } as TextContent],
            isError: false,
          };
        }

        case 'generate-stress-test': {
          const strategy = (argsObj.strategy as 'nested' | 'wide' | 'repetition' | 'mixed') || 'mixed';
          const depth = (argsObj.depth as number) || 50;
          const count = (argsObj.count as number) || 100;
          const repetitions = (argsObj.repetitions as number) || 100;

          const result = AntlrAnalyzer.generateStressTest(grammarContent, strategy, { depth, count, repetitions });

          let output = '# Generated Stress Test\n\n';
          output += `**Strategy:** ${strategy}\n`;
          output += `**Characteristics:**\n`;
          if (result.depth) output += `- Nesting depth: ${result.depth}\n`;
          if (result.width) output += `- Alternatives: ${result.width}\n`;
          if (result.size) output += `- Input size: ${result.size} bytes\n`;
          output += `\n`;

          if (result.warnings && result.warnings.length > 0) {
            output += `**Warnings:**\n`;
            for (const w of result.warnings) {
              output += `- ⚠️ ${w}\n`;
            }
            output += `\n`;
          }

          output += `**Generated Input:**\n\`\`\`\n${result.input}\n\`\`\`\n`;

          return {
            content: [{ type: 'text', text: output } as TextContent],
            isError: false,
          };
        }

        case 'compare-profiles': {
          const profile1 = argsObj.profile1 as {
            parseTimeMs?: number;
            tokenCount?: number;
            treeDepth?: number;
            decisionCount?: number;
            ambiguityCount?: number;
            contextSensitivityCount?: number;
          };
          const profile2 = argsObj.profile2 as {
            parseTimeMs?: number;
            tokenCount?: number;
            treeDepth?: number;
            decisionCount?: number;
            ambiguityCount?: number;
            contextSensitivityCount?: number;
          };

          if (!profile1 || !profile2) {
            return {
              content: [{ type: 'text', text: 'Error: Both profile1 and profile2 are required' } as TextContent],
              isError: true,
            };
          }

          const result = AntlrAnalyzer.compareProfiles(profile1, profile2);

          let output = '# Profile Comparison\n\n';
          output += `## Metrics\n\n`;
          output += `| Metric | Before | After | Change |\n`;
          output += `|--------|--------|-------|--------|\n`;

          for (const metric of result.metrics) {
            const changeIcon = metric.improved ? '✅' : metric.degraded ? '❌' : '➖';
            output += `| ${metric.name} | ${metric.before} | ${metric.after} | ${metric.changePercent > 0 ? '+' : ''}${metric.changePercent}% ${changeIcon} |\n`;
          }

          output += `\n**Verdict:** ${result.verdict}\n`;

          if (result.summary) {
            output += `\n**Summary:** ${result.summary}\n`;
          }

          return {
            content: [{ type: 'text', text: output } as TextContent],
            isError: false,
          };
        }

        case 'move-rule': {
          const ruleName = (argsObj.rule_name as string) || '';
          const position = (argsObj.position as 'before' | 'after') || 'before';
          const anchorRule = (argsObj.anchor_rule as string) || '';
          const writeToFile = (argsObj.write_to_file as boolean) || false;

          const result = AntlrAnalyzer.moveRule(grammarContent, ruleName, position, anchorRule);

          let output = '';

          if (!result.success) {
            output = `❌ Error: ${result.message}\n`;
            return {
              content: [
                {
                  type: 'text',
                  text: output,
                } as TextContent,
              ],
              isError: true,
            };
          }

          // Format result
          output += `✅ ${result.message}\n`;

          if (result.modified) {
            // Handle file writing
            if (writeToFile) {
              const fromFile = (argsObj.from_file as string) || '';

              if (!fromFile) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: 'Error: write_to_file requires from_file to be specified',
                    } as TextContent,
                  ],
                  isError: true,
                };
              }

              const writeResult = safeWriteFile(fromFile, result.modified);
              if (!writeResult.success) {
                return {
                  content: [
                    {
                      type: 'text',
                      text: writeResult.message,
                    } as TextContent,
                  ],
                  isError: true,
                };
              }
              output += `✅ Written to: ${fromFile}
`;
            } else {
              output += `\nModified grammar:\n\n${result.modified}`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'smart-validate': {
          const loadImports = (argsObj.load_imports as boolean) ?? true;
          const basePath = (argsObj.base_path as string) || undefined;
          const fromFile = (argsObj.from_file as string) || undefined;
          const includeSuggestions = (argsObj.include_suggestions as boolean) ?? true;
          const detectQuantifiers = (argsObj.detect_quantifiers as boolean) ?? true;
          const detectIncomplete = (argsObj.detect_incomplete as boolean) ?? true;

          // Load with imports if requested
          let analysis;
          if (loadImports && fromFile) {
            analysis = AntlrAnalyzer.loadGrammarWithImports(fromFile, basePath);
          } else {
            analysis = AntlrAnalyzer.analyze(grammarContent);
          }

          // Get issues from analysis
          const issues = analysis.issues || [];

          // Aggregate issues
          const aggregated = AntlrAnalyzer.aggregateValidationIssues(issues);

          let output = `📊 Smart Validation Results\n\n`;
          output += `${aggregated.summary}\n\n`;

          // Show groups
          output += `## Issue Groups\n\n`;
          for (const group of aggregated.groups) {
            output += `### ${group.category}\n`;
            output += `- Total occurrences: ${group.count}\n`;
            output += `- Unique items: ${group.uniqueItems}\n`;
            if (group.suggestion) {
              output += `- 💡 Suggestion: ${group.suggestion}\n`;
            }
            output += `\nTop items:\n`;
            for (const item of group.topItems.slice(0, 5)) {
              output += `  - ${item.name}`;
              if (item.count > 1) output += ` (${item.count} refs)`;
              output += `\n`;
            }
            output += `\n`;
          }

          // Detect suspicious quantifiers
          if (detectQuantifiers) {
            const suspiciousQuants = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);
            if (suspiciousQuants.length > 0) {
              output += `\n## ⚠️  Suspicious Quantifiers (${suspiciousQuants.length})\n\n`;
              for (const issue of suspiciousQuants.slice(0, 10)) {
                output += `**${issue.ruleName}** (line ${issue.lineNumber})\n`;
                output += `  Pattern: \`${issue.pattern}\`\n`;
                output += `  💡 ${issue.suggestion}\n`;
                output += `  ℹ️  ${issue.reasoning}\n\n`;
              }
              if (suspiciousQuants.length > 10) {
                output += `... and ${suspiciousQuants.length - 10} more\n\n`;
              }
            }
          }

          // Detect incomplete parsing
          if (detectIncomplete) {
            const incompletePatterns = AntlrAnalyzer.detectIncompleteParsing(analysis);
            if (incompletePatterns.length > 0) {
              output += `\n## 🚨 Incomplete Parsing Anti-Patterns (${incompletePatterns.length})\n\n`;
              for (const issue of incompletePatterns) {
                output += `**${issue.ruleName}** (line ${issue.lineNumber})\n`;
                output += `  Pattern: \`${issue.pattern}\`\n`;
                output += `  💡 ${issue.suggestion}\n\n`;
              }
            }
          }

          // Generate token suggestions
          if (includeSuggestions) {
            const undefinedGroup = aggregated.groups.find(
              (g) => g.category === 'Undefined Token References'
            );
            if (undefinedGroup && undefinedGroup.uniqueItems > 0) {
              const undefinedTokens = undefinedGroup.topItems.map((t) => t.name);
              const suggestions = AntlrAnalyzer.suggestMissingTokens(undefinedTokens);

              output += `\n## 💭 Smart Token Suggestions\n\n`;
              for (const sugg of suggestions.slice(0, 10)) {
                output += `**${sugg.tokenName}**\n`;
                output += `  Suggested pattern: \`${sugg.suggestedPattern}\`\n`;
                output += `  Reasoning: ${sugg.reasoning}\n\n`;
              }
              if (suggestions.length > 10) {
                output += `... and ${suggestions.length - 10} more\n\n`;
              }
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'detect-quantifier-issues': {
          const analysis = AntlrAnalyzer.analyze(grammarContent);
          const suspicious = AntlrAnalyzer.detectSuspiciousQuantifiers(analysis);

          let output = `🔍 Suspicious Quantifier Patterns\n\n`;
          output += `Found ${suspicious.length} potential issue(s)\n\n`;

          if (suspicious.length === 0) {
            output += `✅ No suspicious quantifier patterns detected.\n`;
          } else {
            for (const issue of suspicious) {
              output += `## ${issue.ruleName} (line ${issue.lineNumber})\n\n`;
              output += `**Pattern:** \`${issue.pattern}\`\n\n`;
              output += `**Suggestion:** ${issue.suggestion}\n\n`;
              output += `**Reasoning:** ${issue.reasoning}\n\n`;
              output += `---\n\n`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'detect-incomplete-parsing': {
          const analysis = AntlrAnalyzer.analyze(grammarContent);
          const incomplete = AntlrAnalyzer.detectIncompleteParsing(analysis);

          let output = `🚨 Incomplete Parsing Patterns\n\n`;
          output += `Found ${incomplete.length} anti-pattern(s)\n\n`;

          if (incomplete.length === 0) {
            output += `✅ No incomplete parsing patterns detected.\n`;
          } else {
            for (const issue of incomplete) {
              output += `## ${issue.ruleName} (line ${issue.lineNumber})\n\n`;
              output += `**Anti-pattern:** \`${issue.pattern}\`\n\n`;
              output += `**Suggestion:** ${issue.suggestion}\n\n`;
              output += `---\n\n`;
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        case 'fix-quantifier-issues': {
          const ruleNames = (argsObj.rule_names as string[]) || [];
          const dryRun = (argsObj.dry_run as boolean) || false;
          const outputMode = (argsObj.output_mode as string) || 'diff';
          const writeToFile = (argsObj.write_to_file as boolean) || false;
          const fromFile = (argsObj.from_file as string) || '';

          const result = AntlrAnalyzer.fixSuspiciousQuantifiers(grammarContent, {
            ruleNames: ruleNames.length > 0 ? ruleNames : undefined,
            dryRun,
          });

          let output = `🔧 Fix Quantifier Issues\n\n`;
          output += `${result.message}\n\n`;

          if (result.changes.length > 0) {
            output += `## Changes Made\n\n`;
            for (const change of result.changes) {
              output += `**${change.ruleName}** (line ${change.lineNumber})\n`;
              output += `  ${change.oldPattern} → ${change.newPattern}\n`;
              output += `  ℹ️  ${change.reasoning}\n\n`;
            }

            if (!dryRun) {
              if (outputMode === 'diff' && result.modified !== grammarContent) {
                output += `\n## Diff\n\n`;
                const diff = generateUnifiedDiff(
                  grammarContent,
                  result.modified,
                  fromFile || 'grammar.g4'
                );
                output += diff;
              } else if (outputMode === 'full') {
                output += `\n## Modified Grammar\n\n${result.modified}`;
              }

              // Handle file writing
              if (writeToFile && fromFile) {
                const writeResult = safeWriteFile(fromFile, result.modified);
                output += `\n\n${writeResult.message}`;
              }
            }
          } else {
            output += `✅ No changes needed or no suspicious patterns found.\n`;
          }

          return {
            content: [
              {
                type: 'text',
                text: output,
              } as TextContent,
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              } as TextContent,
            ],
            isError: true,
          };
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments',
        } as TextContent,
      ],
      isError: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        } as TextContent,
      ],
      isError: true,
    };
  }
});

/**
 * List available resources (grammar files in examples)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error('[ANTLR4-MCP] Resources requested');

  // Return available grammar files
  const examplesDir = new URL('../examples', import.meta.url).pathname;
  let resources: Resource[] = [];

  try {
    if (fs.existsSync(examplesDir)) {
      const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.g4'));
      resources = files.map((file) => ({
        uri: `file://${examplesDir}/${file}`,
        mimeType: 'text/x-antlr4',
        name: file,
        description: `ANTLR4 Grammar: ${file}`,
      }));
    }
  } catch (err) {
    console.error('[ANTLR4-MCP] Error reading examples directory:', err);
  }

  return { resources };
});

/**
 * Read a specific resource (grammar file)
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { params } = request;
  const uri = params.uri;

  console.error(`[ANTLR4-MCP] Resource read requested: ${uri}`);

  try {
    // Parse file:// URI
    let filePath = uri;
    if (filePath.startsWith('file://')) {
      filePath = filePath.substring(7);
    }

    // Security check: only allow files in examples directory
    const examplesDir = new URL('../examples', import.meta.url).pathname;
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedExamplesDir = examplesDir.replace(/\\/g, '/');

    if (!normalizedPath.startsWith(normalizedExamplesDir)) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Access denied: Can only read files from examples directory',
          },
        ],
      };
    }

    if (!fs.existsSync(filePath)) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `File not found: ${filePath}`,
          },
        ],
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');

    return {
      contents: [
        {
          uri,
          mimeType: 'text/x-antlr4',
          text: content,
        },
      ],
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error reading resource: ${errorMessage}`,
        },
      ],
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const args = process.argv.slice(2);
  const portArg = args.find((arg) => arg.startsWith('--port=') || arg === '--port');

  if (portArg) {
    // SSE Mode
    let port = 3000; // Default
    if (portArg.startsWith('--port=')) {
      port = parseInt(portArg.split('=')[1]);
    } else {
      const portIndex = args.indexOf('--port');
      if (portIndex >= 0 && portIndex < args.length - 1) {
        port = parseInt(args[portIndex + 1]);
      }
    }

    if (isNaN(port)) port = 3000;

    const app = express();
    let transport: SSEServerTransport;

    app.get('/sse', async (req, res) => {
      transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);

      // Display startup message
      console.error('\n🎯 antlr4-mcp v1.0.0 loaded with 40+ tools!');
      console.error('📚 Key capabilities:');
      console.error('  • Smart validation - Aggregate 17,000+ warnings into actionable items');
      console.error('  • Quantifier detection - Find ? that should be *');
      console.error('  • Multi-file analysis - Track imports across grammar files');
      console.error('  • Lexer modes - Full support for context-sensitive tokenization');
      console.error('  • Safe editing - Diff mode, no data loss');
      console.error('\n💡 Tip: Ask for "help" tool to see all capabilities!\n');
    });

    app.post('/messages', async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(404).json({ error: 'No active connection' });
      }
    });

    app.listen(port, () => {
      console.error(`ANTLR4 MCP Server listening on SSE port ${port}`);
    });
  } else {
    // Stdio Mode (Default)
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Display startup message
    console.error('\n🎯 antlr4-mcp v1.0.0 loaded with 40+ tools!');
    console.error('📚 Key capabilities:');
    console.error('  • Smart validation - Aggregate 17,000+ warnings into actionable items');
    console.error('  • Quantifier detection - Find ? that should be *');
    console.error('  • Multi-file analysis - Track imports across grammar files');
    console.error('  • Lexer modes - Full support for context-sensitive tokenization');
    console.error('  • Safe editing - Diff mode, no data loss');
    console.error('\n💡 Tip: Ask for "help" tool to see all capabilities!\n');

    console.error('ANTLR4 MCP Server started (stdio)');
  }
}

main().catch(console.error);
