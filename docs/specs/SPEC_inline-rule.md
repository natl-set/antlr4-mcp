# Specification: inline-rule

## Overview

Inline a rule by replacing all references to it with its definition, then delete the original rule. This is the inverse operation of `extract-fragment` and is useful for cleaning up "pass-through" rules.

## API Signature

```typescript
interface InlineRuleResult {
  success: boolean;
  modified: string;
  message: string;
  stats: {
    referencesReplaced: number;
    ruleDefinition: string;
    referencingRules: string[];
  };
}

static inlineRule(
  grammarContent: string,
  ruleName: string,
  options?: {
    preserveParentheses?: boolean;  // Always wrap in parens (safer)
    dryRun?: boolean;                // Show what would change
  }
): InlineRuleResult
```

## Use Cases

### Example 1: Simple Pass-Through Rule
```antlr
// Before
expression: additiveExpression;
additiveExpression: term ((PLUS | MINUS) term)*;

// After inline('additiveExpression')
expression: term ((PLUS | MINUS) term)*;
```

### Example 2: Helper Rule
```antlr
// Before
statement: assignment | ifStatement;
assignment: ID ASSIGN value SEMI;
value: NUMBER | STRING | ID;

// After inline('value')
statement: assignment | ifStatement;
assignment: ID ASSIGN (NUMBER | STRING | ID) SEMI;
```

### Example 3: Multiple References
```antlr
// Before
expr1: helper PLUS helper;
expr2: helper TIMES NUMBER;
helper: ID | NUMBER;

// After inline('helper')
expr1: (ID | NUMBER) PLUS (ID | NUMBER);
expr2: (ID | NUMBER) TIMES NUMBER;
// helper rule deleted
```

## Implementation Algorithm

### Step 1: Validate Rule Can Be Inlined

```typescript
function validateInlining(grammar, ruleName) {
  // 1. Check rule exists
  const rule = findRule(grammar, ruleName);
  if (!rule) {
    return { valid: false, reason: `Rule '${ruleName}' not found` };
  }
  
  // 2. Check for circular references
  if (isCircular(grammar, ruleName)) {
    return { valid: false, reason: `Rule '${ruleName}' has circular references` };
  }
  
  // 3. Check if rule references itself
  if (rule.referencedRules.includes(ruleName)) {
    return { valid: false, reason: `Rule '${ruleName}' is recursive` };
  }
  
  // 4. Find all references
  const usages = findRuleUsages(grammar, ruleName);
  if (usages.count === 0) {
    return { valid: false, reason: `Rule '${ruleName}' is not used anywhere` };
  }
  
  return { valid: true, usages };
}
```

### Step 2: Extract Rule Body

```typescript
function extractRuleBody(ruleDefinition: string) {
  // Remove rule name and colon
  let body = ruleDefinition.replace(/^[a-z_][a-z0-9_]*\s*:/i, '').trim();
  
  // Remove semicolon
  body = body.replace(/;$/, '').trim();
  
  // Remove any labels (name=value -> value)
  body = body.replace(/[a-z_][a-z0-9_]*\s*=/gi, '');
  
  // Remove alternative labels (# label at end)
  body = body.replace(/\s*#\s*[a-z_][a-z0-9_]*/gi, '');
  
  return body.trim();
}
```

### Step 3: Determine Parenthesization

```typescript
function needsParentheses(ruleBody: string, context: string) {
  // Always needs parens if:
  // 1. Contains alternatives (|)
  if (ruleBody.includes('|')) return true;
  
  // 2. Contains multiple tokens/rules in sequence and context has operators
  const hasMultipleElements = ruleBody.split(/\s+/).filter(t => /^[A-Za-z]/.test(t)).length > 1;
  const contextHasOperators = /[?*+|]/.test(context);
  
  if (hasMultipleElements && contextHasOperators) return true;
  
  // 3. Already has parentheses (preserve them)
  if (ruleBody.startsWith('(') && ruleBody.endsWith(')')) return false;
  
  return false;
}
```

### Step 4: Replace All References

```typescript
function replaceReferences(grammar: string, ruleName: string, replacement: string) {
  const lines = grammar.split('\n');
  let replacedCount = 0;
  const affectedRules = new Set<string>();
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip if this is the rule definition itself
    const isRuleDefinition = new RegExp(`^\\s*${ruleName}\\s*:`).test(line);
    if (isRuleDefinition) continue;
    
    // Find whole-word references
    const regex = new RegExp(`\\b${ruleName}\\b`, 'g');
    
    if (regex.test(line)) {
      // Determine if parentheses needed
      const context = line;
      const wrappedReplacement = needsParentheses(replacement, context)
        ? `(${replacement})`
        : replacement;
      
      // Replace
      lines[i] = line.replace(regex, wrappedReplacement);
      replacedCount++;
      
      // Track which rule was modified
      const ruleMatch = line.match(/^\\s*([a-z_][a-z0-9_]*)\\s*:/i);
      if (ruleMatch) {
        affectedRules.add(ruleMatch[1]);
      }
    }
  }
  
  return {
    modified: lines.join('\n'),
    replacedCount,
    affectedRules: Array.from(affectedRules)
  };
}
```

### Step 5: Remove Original Rule

```typescript
function removeInlinedRule(grammar: string, ruleName: string) {
  return AntlrAnalyzer.removeRule(grammar, ruleName);
}
```

## Edge Cases to Handle

### 1. Rule with Labels
```antlr
// Before
helper: ID | NUMBER;
expr: name=helper PLUS value=helper;

// After (labels removed from inlined body)
expr: name=(ID | NUMBER) PLUS value=(ID | NUMBER);
```

### 2. Rule with Alternative Labels
```antlr
// Before
helper: ID # idAlt | NUMBER # numAlt;
expr: helper PLUS helper;

// After (alternative labels removed)
expr: (ID | NUMBER) PLUS (ID | NUMBER);
```

### 3. Rule with Actions
```antlr
// Before
helper: ID {action()};
expr: helper PLUS NUMBER;

// After (action preserved)
expr: (ID {action()}) PLUS NUMBER;
```

### 4. Nested Parentheses
```antlr
// Before
helper: (A | B) C;
expr: helper* PLUS helper+;

// After (don't double-wrap)
expr: ((A | B) C)* PLUS ((A | B) C)+;
```

### 5. Circular Reference Detection
```antlr
// Should FAIL
a: b;
b: a;  // Circular!

// Should FAIL
expr: expr PLUS term | term;  // Self-recursive
```

## Testing Strategy

```javascript
// Test 1: Simple inline
const grammar1 = `grammar Test;
expr: helper;
helper: ID;
`;
const result1 = inlineRule(grammar1, 'helper');
// Expected: expr: ID;
// helper deleted

// Test 2: Multiple references
const grammar2 = `grammar Test;
expr1: helper PLUS helper;
expr2: helper TIMES NUMBER;
helper: ID | NUMBER;
`;
const result2 = inlineRule(grammar2, 'helper');
// Expected: expr1: (ID | NUMBER) PLUS (ID | NUMBER);
//           expr2: (ID | NUMBER) TIMES NUMBER;

// Test 3: Should fail - circular
const grammar3 = `grammar Test;
a: b;
b: a;
`;
const result3 = inlineRule(grammar3, 'a');
// Expected: success=false, "circular references"

// Test 4: Should fail - recursive
const grammar4 = `grammar Test;
expr: expr PLUS term | term;
`;
const result4 = inlineRule(grammar4, 'expr');
// Expected: success=false, "recursive"

// Test 5: With labels
const grammar5 = `grammar Test;
expr: name=helper;
helper: value=ID;
`;
const result5 = inlineRule(grammar5, 'helper');
// Expected: expr: name=ID;
```

## Integration with Existing Code

### Add to src/antlrAnalyzer.ts
```typescript
static inlineRule(...) { ... }
private static validateInlining(...) { ... }
private static extractRuleBody(...) { ... }
private static needsParentheses(...) { ... }
private static isCircular(...) { ... }
```

### Add MCP Tool in src/index.ts
```typescript
{
  name: 'inline-rule',
  description: `Inline a rule by replacing all references with its definition.

**When to use:** Remove "pass-through" or helper rules, simplify grammar structure.

Example usage:
  rule_name: "helper"
  
Options:
  preserve_parentheses: true  // Always wrap in parens for safety
  dry_run: true               // Show changes without modifying

Validates: No circular references, no self-recursion, rule is actually used.

Returns: Modified grammar with rule inlined and original rule deleted.`,
  inputSchema: { ... }
}
```

## Success Criteria

- ✅ Correctly inlines simple pass-through rules
- ✅ Handles multiple references properly
- ✅ Detects and rejects circular references
- ✅ Preserves grammar semantics (no behavior change)
- ✅ Adds parentheses when needed for precedence

## Future Enhancements

1. **Batch Inline**: Inline multiple rules at once
2. **Smart Parentheses**: Minimal parentheses based on ANTLR precedence
3. **Preview**: Show before/after for each affected rule
4. **Undo**: Keep track of inlining for reversal
5. **Metrics**: Report grammar complexity before/after
