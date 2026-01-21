# Move-Rule Feature Specification

## Purpose

Move an existing rule to a new position relative to another rule.

## Use Cases

1. **Reorganizing grammar**: Move related rules together
2. **Fixing rule order**: Move rules before/after their dependencies
3. **Improving readability**: Group similar rules
4. **Manual sorting**: Alternative to automatic sort-rules

## API Design

### Tool Name: `move-rule`

### Parameters:

- `grammar_content` (required): Grammar file content
- `from_file` (optional): Path to grammar file
- `rule_name` (required): Name of rule to move
- `position` (required): "before" or "after"
- `anchor_rule` (required): Name of rule to use as anchor
- `write_to_file` (optional): Write changes to file

### Examples:

```javascript
// Move expr rule before term rule
{
  "from_file": "Calculator.g4",
  "rule_name": "expr",
  "position": "before",
  "anchor_rule": "term",
  "write_to_file": true
}

// Move NUMBER token after PLUS token
{
  "from_file": "Calculator.g4",
  "rule_name": "NUMBER",
  "position": "after",
  "anchor_rule": "PLUS",
  "write_to_file": true
}
```

## Implementation

### Method: `AntlrAnalyzer.moveRule()`

```typescript
static moveRule(
  grammarContent: string,
  ruleName: string,
  position: 'before' | 'after',
  anchorRule: string
): {
  success: boolean;
  modified: string;
  message: string;
}
```

### Algorithm:

1. Validate rule and anchor exist
2. Check rule and anchor are not the same
3. Check rule is not already in target position
4. Extract complete rule text (including blank lines)
5. Remove rule from current position
6. Find anchor rule position
7. Insert rule at target position (before/after anchor)
8. Preserve blank lines and formatting

### Error Cases:

- Rule not found
- Anchor rule not found
- Rule and anchor are the same
- Rule already in target position (info, not error)

## Testing

Test cases:
1. Move rule before another
2. Move rule after another
3. Move rule to beginning (before first rule)
4. Move rule to end (after last rule)
5. Move lexer rule before/after lexer rule
6. Move parser rule before/after parser rule
7. Preserve blank lines
8. Preserve multi-line rules
9. Error: rule not found
10. Error: anchor not found
11. Info: rule already in position

## Integration

This complements existing features:
- `add-parser-rule` with `insert_before`/`insert_after` - for NEW rules
- `move-rule` - for EXISTING rules
- `sort-rules` - for automatic ordering
