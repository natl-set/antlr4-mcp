# Specification: sort-rules

## Overview

Reorder rules in a grammar file according to various sorting strategies: alphabetical, by dependency, or by type. Useful for cleaning up large, messy grammar files.

## API Signature

```typescript
interface SortRulesResult {
  success: boolean;
  modified: string;
  message: string;
  stats: {
    totalRules: number;
    reordered: number;
    strategy: string;
  };
}

static sortRules(
  grammarContent: string,
  strategy: 'alphabetical' | 'dependency' | 'type' | 'usage',
  options?: {
    anchorRule?: string;      // For 'dependency': rules used by this rule
    parserFirst?: boolean;    // For 'type': parser rules before lexer
    preserveGroups?: boolean; // Keep blank-line-separated groups together
    dryRun?: boolean;
  }
): SortRulesResult
```

## Sorting Strategies

### 1. Alphabetical (Default)
Sort all rules alphabetically by name, respecting parser/lexer sections.

```antlr
// Before
grammar Test;
zebra: ID;
apple: NUMBER;
ZEBRA: 'z';
APPLE: 'a';

// After
grammar Test;
apple: NUMBER;
zebra: ID;
APPLE: 'a';
ZEBRA: 'z';
```

### 2. By Type
Group rules by type: parser rules first, then lexer rules (or vice versa).

```antlr
// Before (mixed)
grammar Test;
PLUS: '+';
expression: term PLUS term;
NUMBER: [0-9]+;
term: NUMBER;

// After (parser first)
grammar Test;
expression: term PLUS term;
term: NUMBER;

NUMBER: [0-9]+;
PLUS: '+';
```

### 3. By Dependency
Order rules based on dependencies. Rules used by `anchorRule` appear near it.

```antlr
// Before
grammar Test;
zebra: ID;
term: NUMBER;
expression: term PLUS term;  // anchor
plus_expr: expression;

// After sort by dependency of 'expression'
grammar Test;
term: NUMBER;
expression: term PLUS term;
plus_expr: expression;
zebra: ID;
```

### 4. By Usage
Most-referenced rules first (entry points at top).

```antlr
// Before
helper: ID;          // used 10 times
statement: expr;     // used 2 times
expr: helper PLUS;   // used 5 times

// After
helper: ID;          // 10 references
expr: helper PLUS;   // 5 references
statement: expr;     // 2 references
```

## Implementation Algorithm

### Step 1: Parse Grammar Structure

```typescript
function parseGrammarStructure(grammar: string) {
  const analysis = analyze(grammar);
  const lines = grammar.split('\n');
  
  // Extract header (before first rule)
  let headerEndLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(lines[i].trim())) {
      headerEndLine = i;
      break;
    }
  }
  
  const header = lines.slice(0, headerEndLine).join('\n');
  
  // Extract rules with their full text (including multi-line)
  const rules = [];
  for (const rule of analysis.rules) {
    const ruleText = extractRuleText(grammar, rule);
    rules.push({
      name: rule.name,
      type: rule.type,
      text: ruleText,
      referencedRules: rule.referencedRules,
      lineNumber: rule.lineNumber
    });
  }
  
  return { header, rules };
}
```

### Step 2: Extract Complete Rule Text

```typescript
function extractRuleText(grammar: string, rule: GrammarRule): string {
  const lines = grammar.split('\n');
  const startLine = rule.lineNumber - 1;
  
  // Find end (semicolon)
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    if (lines[i].includes(';')) {
      endLine = i;
      break;
    }
  }
  
  // Include blank lines after rule if present
  while (endLine + 1 < lines.length && lines[endLine + 1].trim() === '') {
    endLine++;
  }
  
  return lines.slice(startLine, endLine + 1).join('\n');
}
```

### Step 3: Sorting Functions

```typescript
// Alphabetical
function sortAlphabetical(rules: Rule[]) {
  const parserRules = rules.filter(r => r.type === 'parser').sort((a, b) => a.name.localeCompare(b.name));
  const lexerRules = rules.filter(r => r.type === 'lexer').sort((a, b) => a.name.localeCompare(b.name));
  return [...parserRules, ...lexerRules];
}

// By Type
function sortByType(rules: Rule[], parserFirst: boolean) {
  const parser = rules.filter(r => r.type === 'parser');
  const lexer = rules.filter(r => r.type === 'lexer');
  return parserFirst ? [...parser, ...lexer] : [...lexer, ...parser];
}

// By Dependency
function sortByDependency(rules: Rule[], anchorRule: string) {
  const graph = buildDependencyGraph(rules);
  const anchor = rules.find(r => r.name === anchorRule);
  
  // Get all rules used by anchor (direct and transitive)
  const dependencies = getTransitiveDependencies(graph, anchorRule);
  
  // Get all rules that use anchor (direct and transitive)
  const dependents = getTransitiveDependents(graph, anchorRule);
  
  // Order: dependencies -> anchor -> dependents -> rest
  const ordered = [];
  
  // Dependencies in topological order
  const depRules = rules.filter(r => dependencies.has(r.name));
  ordered.push(...topologicalSort(depRules));
  
  // Anchor
  ordered.push(anchor);
  
  // Dependents
  const depRules = rules.filter(r => dependents.has(r.name));
  ordered.push(...depRules);
  
  // Rest alphabetically
  const rest = rules.filter(r => !dependencies.has(r.name) && 
                                 !dependents.has(r.name) && 
                                 r.name !== anchorRule);
  ordered.push(...rest.sort((a, b) => a.name.localeCompare(b.name)));
  
  return ordered;
}

// By Usage
function sortByUsage(rules: Rule[]) {
  // Count references for each rule
  const usageCount = new Map<string, number>();
  
  for (const rule of rules) {
    usageCount.set(rule.name, 0);
  }
  
  for (const rule of rules) {
    for (const ref of rule.referencedRules) {
      usageCount.set(ref, (usageCount.get(ref) || 0) + 1);
    }
  }
  
  // Sort by usage count (descending)
  return rules.sort((a, b) => {
    const countA = usageCount.get(a.name) || 0;
    const countB = usageCount.get(b.name) || 0;
    return countB - countA;
  });
}
```

### Step 4: Reconstruct Grammar

```typescript
function reconstructGrammar(header: string, rules: Rule[]): string {
  const parts = [header];
  
  // Add blank line after header
  parts.push('');
  
  // Add rules
  for (const rule of rules) {
    parts.push(rule.text);
  }
  
  return parts.join('\n');
}
```

## Edge Cases to Handle

### 1. Preserve Grammar Header
```antlr
grammar Test;

options {
  language = Java;
}

import CommonLexer;

// Rules start here
rule1: ID;
```

### 2. Multi-line Rules
```antlr
expression
  : term PLUS term
  | term MINUS term
  | NUMBER
  ;
```

### 3. Fragment Rules
```antlr
fragment DIGIT: [0-9];
NUMBER: DIGIT+;
// Fragments should stay with lexer rules
```

### 4. Blank Line Groups
```antlr
// Group 1
rule1: ID;
rule2: NUMBER;

// Group 2
rule3: STRING;
rule4: CHAR;

// preserveGroups: true keeps these groups intact
```

### 5. Comments
```antlr
// This is expression
expression: term;

// Preserve comments with their rules
```

## Testing Strategy

```javascript
// Test 1: Alphabetical
const grammar1 = `grammar Test;
zebra: ID;
apple: NUMBER;
ZEBRA: 'z';
APPLE: 'a';
`;
const result1 = sortRules(grammar1, 'alphabetical');
// Expected: apple, zebra, APPLE, ZEBRA

// Test 2: By type (parser first)
const grammar2 = `grammar Test;
PLUS: '+';
expr: term;
NUMBER: [0-9]+;
term: NUMBER;
`;
const result2 = sortRules(grammar2, 'type', { parserFirst: true });
// Expected: expr, term, NUMBER, PLUS

// Test 3: By dependency
const grammar3 = `grammar Test;
zebra: ID;
term: NUMBER;
expr: term PLUS;
statement: expr SEMI;
`;
const result3 = sortRules(grammar3, 'dependency', { anchorRule: 'expr' });
// Expected: term, expr, statement, zebra

// Test 4: By usage
const grammar4 = `grammar Test;
helper: ID;          // used 3 times
expr: helper PLUS helper;
statement: helper SEMI;
unused: NUMBER;
`;
const result4 = sortRules(grammar4, 'usage');
// Expected: helper (3), expr (0), statement (0), unused (0)
```

## Integration with Existing Code

### Add to src/antlrAnalyzer.ts
```typescript
static sortRules(...) { ... }
private static sortAlphabetical(...) { ... }
private static sortByType(...) { ... }
private static sortByDependency(...) { ... }
private static sortByUsage(...) { ... }
private static buildDependencyGraph(...) { ... }
private static topologicalSort(...) { ... }
```

### Add MCP Tool in src/index.ts
```typescript
{
  name: 'sort-rules',
  description: `Reorder rules in a grammar according to various strategies.

**When to use:** Clean up messy grammar files, organize rules logically.

Strategies:
  - alphabetical: Sort by name (default)
  - type: Group by parser/lexer
  - dependency: Order by relationship to anchor rule
  - usage: Most-referenced rules first

Example usage:
  strategy: "alphabetical"
  // OR
  strategy: "dependency"
  anchor_rule: "expression"
  
Options:
  parser_first: true      // For 'type' strategy
  preserve_groups: true   // Keep blank-line groups together

Returns: Reordered grammar with statistics.`,
  inputSchema: { ... }
}
```

## Success Criteria

- ✅ Preserves grammar semantics (no behavior change)
- ✅ Maintains multi-line rule formatting
- ✅ Handles all rule types (parser, lexer, fragment)
- ✅ Preserves comments with their rules
- ✅ Performance: < 500ms for 1000 rules

## Future Enhancements

1. **Custom Order**: User-specified rule order
2. **Smart Grouping**: Auto-detect logical groups
3. **Diff View**: Show before/after with highlighting
4. **Metrics**: Report complexity/cohesion metrics
5. **Undo**: Revert to previous ordering
