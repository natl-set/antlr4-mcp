# Specification: analyze-ambiguities

## Overview

Perform static analysis on ANTLR4 grammars to detect common ambiguity patterns and LL(*) pitfalls before compilation. This helps catch issues early without waiting for the full ANTLR4 compilation cycle.

## API Signature

```typescript
interface AmbiguityIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  rule: string;
  line?: number;
  description: string;
  suggestion?: string;
}

interface AmbiguityAnalysisResult {
  success: boolean;
  issues: AmbiguityIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    rulesAnalyzed: number;
  };
}

static analyzeAmbiguities(
  grammarContent: string,
  options?: {
    checkIdenticalAlternatives?: boolean;    // default: true
    checkOverlappingPrefixes?: boolean;       // default: true
    checkAmbiguousOptionals?: boolean;        // default: true
    checkLeftRecursion?: boolean;             // default: true
    checkLexerConflicts?: boolean;            // default: true
    minPrefixLength?: number;                 // default: 2
  }
): AmbiguityAnalysisResult
```

## Detectable Ambiguity Patterns

### 1. Identical Alternatives (ERROR)
Multiple alternatives that are exactly the same.

```antlr
// DETECTED
expression: ID | ID;  // Duplicate alternatives

// SUGGESTION
expression: ID;       // Remove duplicate
```

### 2. Overlapping Token Prefixes (WARNING)
Lexer tokens with common prefixes that may cause ambiguity.

```antlr
// DETECTED
IF: 'if';
IDENTIFIER: [a-z]+;   // 'if' matches both IF and IDENTIFIER

// SUGGESTION
// Reorder: most specific first, or add lexer modes
IF: 'if' -> mode(KEYWORD);
IDENTIFIER: [a-z]+;
```

### 3. Ambiguous Optional Patterns (WARNING)
Patterns where optionality creates ambiguity.

```antlr
// DETECTED
expression: ID? ID;   // Which ID is optional?

// SUGGESTION
expression: ID ID?;   // More explicit ordering
// OR
expression: (ID ID) | ID;
```

### 4. Repeating Optionals (WARNING)
Optional followed by repetition of same element.

```antlr
// DETECTED
list: item? item*;    // Ambiguous

// SUGGESTION
list: item*;          // * already handles zero
```

### 5. Hidden Left Recursion (ERROR)
Indirect left recursion that ANTLR4 can't handle.

```antlr
// DETECTED
a: b c;
b: a | d;             // Indirect left recursion via b

// SUGGESTION
// Rewrite to eliminate recursion
```

### 6. Ambiguous Alternatives (WARNING)
Alternatives that start with the same prefix.

```antlr
// DETECTED
statement
  : ID '=' expression ';'
  | ID '=' expression '++'
  ;
// Both start with "ID '=' expression"

// SUGGESTION
statement
  : ID '=' expression (';' | '++')
  ;
```

### 7. Lexer Conflicts (WARNING)
Multiple lexer rules matching the same input.

```antlr
// DETECTED
NUMBER: [0-9]+;
HEX: [0-9a-fA-F]+;    // '123' matches both

// SUGGESTION
HEX: '0x' [0-9a-fA-F]+;  // Add prefix
NUMBER: [0-9]+;
```

### 8. Nullable Loops (ERROR)
Loop that can match zero-length input.

```antlr
// DETECTED
list: item*;
item: ;               // Empty alternative

// SUGGESTION
list: item+;          // Require at least one
// OR
item: ID | NUMBER;    // No empty alternative
```

## Implementation Algorithm

### Step 1: Parse and Validate Grammar

```typescript
function analyzeAmbiguities(grammar: string, options: Options): Result {
  const analysis = analyze(grammar);
  const issues: AmbiguityIssue[] = [];
  
  // Run each check
  if (options.checkIdenticalAlternatives) {
    issues.push(...checkIdenticalAlternatives(analysis));
  }
  
  if (options.checkOverlappingPrefixes) {
    issues.push(...checkOverlappingPrefixes(analysis));
  }
  
  if (options.checkAmbiguousOptionals) {
    issues.push(...checkAmbiguousOptionals(analysis));
  }
  
  if (options.checkLeftRecursion) {
    issues.push(...checkLeftRecursion(analysis));
  }
  
  if (options.checkLexerConflicts) {
    issues.push(...checkLexerConflicts(analysis));
  }
  
  // Summarize
  const summary = {
    errors: issues.filter(i => i.severity === 'error').length,
    warnings: issues.filter(i => i.severity === 'warning').length,
    infos: issues.filter(i => i.severity === 'info').length,
    rulesAnalyzed: analysis.rules.length
  };
  
  return {
    success: summary.errors === 0,
    issues,
    summary
  };
}
```

### Step 2: Check Identical Alternatives

```typescript
function checkIdenticalAlternatives(analysis: GrammarAnalysis): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];
  
  for (const rule of analysis.rules) {
    const alternatives = extractAlternatives(rule.definition);
    const seen = new Set<string>();
    
    for (const alt of alternatives) {
      const normalized = normalize(alt);
      if (seen.has(normalized)) {
        issues.push({
          severity: 'error',
          type: 'identical-alternatives',
          rule: rule.name,
          line: rule.lineNumber,
          description: `Rule '${rule.name}' has duplicate alternative: ${alt}`,
          suggestion: `Remove duplicate alternative`
        });
      }
      seen.add(normalized);
    }
  }
  
  return issues;
}

function normalize(alt: string): string {
  // Remove whitespace, labels, actions for comparison
  return alt.replace(/\s+/g, ' ')
            .replace(/[a-z_][a-z0-9_]*=/gi, '')  // labels
            .replace(/\{[^}]*\}/g, '')           // actions
            .trim();
}
```

### Step 3: Check Overlapping Prefixes

```typescript
function checkOverlappingPrefixes(analysis: GrammarAnalysis): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];
  
  for (const rule of analysis.rules) {
    const alternatives = extractAlternatives(rule.definition);
    
    for (let i = 0; i < alternatives.length; i++) {
      for (let j = i + 1; j < alternatives.length; j++) {
        const prefix = commonPrefix(alternatives[i], alternatives[j]);
        
        if (prefix.length >= minPrefixLength) {
          issues.push({
            severity: 'warning',
            type: 'overlapping-prefix',
            rule: rule.name,
            line: rule.lineNumber,
            description: `Alternatives in '${rule.name}' share prefix: ${prefix}`,
            suggestion: `Consider factoring out common prefix`
          });
        }
      }
    }
  }
  
  return issues;
}
```

### Step 4: Check Ambiguous Optionals

```typescript
function checkAmbiguousOptionals(analysis: GrammarAnalysis): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];
  
  for (const rule of analysis.rules) {
    const tokens = tokenize(rule.definition);
    
    // Pattern: A? A
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].endsWith('?')) {
        const base = tokens[i].slice(0, -1);
        if (tokens[i + 1] === base) {
          issues.push({
            severity: 'warning',
            type: 'ambiguous-optional',
            rule: rule.name,
            line: rule.lineNumber,
            description: `Rule '${rule.name}' has ambiguous pattern: ${base}? ${base}`,
            suggestion: `Use ${base}+ or clarify which is optional`
          });
        }
      }
    }
    
    // Pattern: A? A*
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].endsWith('?')) {
        const base = tokens[i].slice(0, -1);
        if (tokens[i + 1] === base + '*') {
          issues.push({
            severity: 'warning',
            type: 'redundant-optional',
            rule: rule.name,
            line: rule.lineNumber,
            description: `Rule '${rule.name}' has redundant pattern: ${base}? ${base}*`,
            suggestion: `Use ${base}* alone (already handles zero occurrences)`
          });
        }
      }
    }
  }
  
  return issues;
}
```

### Step 5: Check Left Recursion

```typescript
function checkLeftRecursion(analysis: GrammarAnalysis): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];
  const graph = buildDependencyGraph(analysis.rules);
  
  // Check for hidden left recursion
  for (const rule of analysis.rules) {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    
    if (hasHiddenLeftRecursion(rule.name, graph, visited, recStack)) {
      issues.push({
        severity: 'error',
        type: 'hidden-left-recursion',
        rule: rule.name,
        line: rule.lineNumber,
        description: `Rule '${rule.name}' has hidden left recursion`,
        suggestion: `Rewrite to eliminate indirect recursion`
      });
    }
  }
  
  return issues;
}
```

### Step 6: Check Lexer Conflicts

```typescript
function checkLexerConflicts(analysis: GrammarAnalysis): AmbiguityIssue[] {
  const issues: AmbiguityIssue[] = [];
  const lexerRules = analysis.rules.filter(r => r.type === 'lexer');
  
  for (let i = 0; i < lexerRules.length; i++) {
    for (let j = i + 1; j < lexerRules.length; j++) {
      const rule1 = lexerRules[i];
      const rule2 = lexerRules[j];
      
      // Check if patterns overlap
      if (patternsOverlap(rule1.pattern, rule2.pattern)) {
        issues.push({
          severity: 'warning',
          type: 'lexer-conflict',
          rule: rule1.name,
          line: rule1.lineNumber,
          description: `Lexer rules '${rule1.name}' and '${rule2.name}' may conflict`,
          suggestion: `ANTLR uses first match; reorder if needed`
        });
      }
    }
  }
  
  return issues;
}
```

## Testing Strategy

```javascript
// Test 1: Identical alternatives
const grammar1 = `grammar Test;
expr: ID | NUMBER | ID;
`;
const result1 = analyzeAmbiguities(grammar1);
// Expected: 1 error - duplicate ID

// Test 2: Overlapping prefix
const grammar2 = `grammar Test;
statement
  : ID '=' expr ';'
  | ID '=' expr '++'
  ;
`;
const result2 = analyzeAmbiguities(grammar2);
// Expected: 1 warning - overlapping prefix "ID '=' expr"

// Test 3: Ambiguous optional
const grammar3 = `grammar Test;
list: item? item*;
`;
const result3 = analyzeAmbiguities(grammar3);
// Expected: 1 warning - redundant optional

// Test 4: Hidden left recursion
const grammar4 = `grammar Test;
a: b c;
b: a | d;
`;
const result4 = analyzeAmbiguities(grammar4);
// Expected: 1 error - hidden left recursion

// Test 5: Lexer conflict
const grammar5 = `grammar Test;
IF: 'if';
IDENTIFIER: [a-z]+;
`;
const result5 = analyzeAmbiguities(grammar5);
// Expected: 1 warning - IF overlaps with IDENTIFIER
```

## Integration with Existing Code

### Add to src/antlrAnalyzer.ts
```typescript
static analyzeAmbiguities(...) { ... }
private static checkIdenticalAlternatives(...) { ... }
private static checkOverlappingPrefixes(...) { ... }
private static checkAmbiguousOptionals(...) { ... }
private static checkLeftRecursion(...) { ... }
private static checkLexerConflicts(...) { ... }
private static hasHiddenLeftRecursion(...) { ... }
private static patternsOverlap(...) { ... }
```

### Add MCP Tool in src/index.ts
```typescript
{
  name: 'analyze-ambiguities',
  description: `Detect common ambiguity patterns in ANTLR4 grammars.

**When to use:** Before compilation, to catch LL(*) pitfalls early.

Checks:
  - Identical alternatives (ERROR)
  - Overlapping prefixes (WARNING)
  - Ambiguous optionals (WARNING)
  - Hidden left recursion (ERROR)
  - Lexer conflicts (WARNING)

Example usage:
  from_file: "MyGrammar.g4"
  
Options:
  check_identical_alternatives: true
  check_overlapping_prefixes: true
  min_prefix_length: 2

Returns: List of issues with severity, descriptions, and suggestions.`,
  inputSchema: { ... }
}
```

## Severity Levels

### ERROR
- Grammar will not compile or will fail at runtime
- Examples: Hidden left recursion, nullable loops, identical alternatives

### WARNING
- Grammar may compile but has ambiguity or performance issues
- Examples: Overlapping prefixes, lexer conflicts, ambiguous optionals

### INFO
- Potential improvements or style suggestions
- Examples: Unusual patterns, potential optimizations

## Success Criteria

- ✅ Detects all major ambiguity patterns
- ✅ Low false positive rate (< 10%)
- ✅ Performance: < 1s for 1000 rules
- ✅ Clear, actionable suggestions
- ✅ Matches ANTLR4's own warnings when possible

## Future Enhancements

1. **ANTLR4 Integration**: Parse ANTLR4's own warning output
2. **Fix Suggestions**: Auto-generate fixes for common patterns
3. **Confidence Scores**: Indicate likelihood of actual ambiguity
4. **Performance Metrics**: Predict parsing performance issues
5. **Interactive Mode**: Step-by-step ambiguity resolution
6. **Custom Rules**: User-defined ambiguity patterns
