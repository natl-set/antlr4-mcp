# Smart Validation Features

## Overview

Smart validation addresses the problem of **too many warnings** in large, multi-file grammars by aggregating similar issues and detecting common anti-patterns.

### The Problem

When validating large production grammars:
- **17,000+ individual warnings** from a single grammar
- 15,890 warnings about 9 missing tokens → noise
- Real issues buried in repetitive messages
- Hard to prioritize fixes

### The Solution

Smart validation **aggregates similar issues** and **detects patterns**:
- Groups 17,000 warnings → 10 actionable items
- Identifies root causes (missing tokens, suspicious quantifiers)
- Provides specific suggestions with reasoning
- Flags anti-patterns (null_rest_of_line usage)

## Three New Tools

### 1. smart-validate

**Comprehensive analysis with aggregation, pattern detection, and suggestions**

```javascript
{
  "grammar_content": "...",
  "from_file": "MyGrammar.g4",
  "load_imports": true,
  "base_path": "/path/to/grammars",
  "include_suggestions": true,
  "detect_quantifiers": true,
  "detect_incomplete": true
}
```

**Output format:**

```
📊 Smart Validation Results

Total: 17,234 issues across 3 categories.
Priority: Add 9 missing tokens (ADDRESS_REGEX, EVENT_TYPE, ...)

## Issue Groups

### Undefined Token References
- Total occurrences: 15,890
- Unique items: 9
- 💡 Suggestion: Add 9 missing lexer tokens. Top priority: ADDRESS_REGEX, EVENT_TYPE, MGMT_INTERFACE

Top items:
  - ADDRESS_REGEX (89 refs)
  - EVENT_TYPE (67 refs)
  - MGMT_INTERFACE (45 refs)
  - USERNAME_REGEX (23 refs)
  - SERVER_MONITOR (18 refs)

### Suspicious Quantifiers
- Total occurrences: 8
- Unique items: 8
- 💡 Suggestion: Review 8 rules using '?' that may need '*' for multiple occurrences

Top items:
  - bgpp_export
  - bgpp_import
  - srs_definition
  - sr_security_rules
  - srp_rules

## ⚠️  Suspicious Quantifiers (8)

**bgpp_export** (line 45)
  Pattern: `bgp_policy_rule?`
  💡 Consider using bgp_policy_rule* instead of bgp_policy_rule?
  ℹ️  Names with '_rule' typically allow multiple occurrences

**srs_definition** (line 89)
  Pattern: `source_setting? destination_setting? action_setting?`
  💡 Consider using (element1 | element2 | element3)* instead of element1? element2? element3?
  ℹ️  Multiple optional elements suggest zero-or-more alternatives

## 🚨 Incomplete Parsing Anti-Patterns (3)

**ss_ssl_tls_service_profile** (line 123)
  Pattern: `null_rest_of_line`
  💡 This discards content. Consider implementing proper structure parsing

## 💭 Smart Token Suggestions

**ADDRESS_REGEX**
  Suggested pattern: `[a-zA-Z0-9][a-zA-Z0-9._-]*`
  Reasoning: Addresses can include dots and dashes

**EVENT_TYPE**
  Suggested pattern: `[a-zA-Z][a-zA-Z0-9_-]*`
  Reasoning: Type identifiers typically use alphanumeric with dashes

**USERNAME_REGEX**
  Suggested pattern: `[a-zA-Z][a-zA-Z0-9_@.-]*`
  Reasoning: Usernames may include @ and dots
```

### 2. detect-quantifier-issues

**Standalone quantifier pattern detection**

Finds rules where `?` (zero-or-one) should probably be `*` (zero-or-more).

**Patterns detected:**

1. **Collection naming** - Rules with `_rule`, `_setting`, `_property` using `?`
   ```
   bgpp_export: EXPORT bgp_policy_rule?  // ❌ Should be *
   ```

2. **Multiple optional elements** - Sequence of `a? b? c?`
   ```
   rule: source? destination? action?  // ❌ Should be (source | destination | action)*
   ```

3. **Repeated references** - Same rule with `?` multiple times
   ```
   rule: setting? ... setting?  // ❌ Should be setting*
   ```

**Example:**

```javascript
{
  "grammar_content": "...",
  "from_file": "MyGrammar.g4"
}
```

**Output:**

```
🔍 Suspicious Quantifier Patterns

Found 8 potential issue(s)

## bgpp_export (line 45)

**Pattern:** `bgp_policy_rule?`

**Suggestion:** Rule name suggests multiple items - consider changing ? to *

**Reasoning:** Names with '_rule', '_setting', '_property' typically allow multiple occurrences

---

## srs_definition (line 89)

**Pattern:** `source_setting? destination_setting? action_setting?`

**Suggestion:** Consider using (element1 | element2 | element3)* instead of element1? element2? element3?

**Reasoning:** Multiple optional elements suggest zero-or-more alternatives

---
```

### 3. detect-incomplete-parsing

**Standalone anti-pattern detection**

Finds rules that **discard content** instead of parsing it properly.

**Anti-patterns detected:**

1. **null_rest_of_line usage**
   ```
   ss_ssl_tls_service_profile: ... null_rest_of_line  // ❌ Loses structure
   ```

2. **Overly broad negation**
   ```
   line: ~[\r\n]+  // ❌ Too generic - define specific tokens
   ```

**Example:**

```javascript
{
  "grammar_content": "...",
  "from_file": "MyGrammar.g4"
}
```

**Output:**

```
🚨 Incomplete Parsing Patterns

Found 3 anti-pattern(s)

## ss_ssl_tls_service_profile (line 123)

**Anti-pattern:** `null_rest_of_line`

**Suggestion:** This discards content. Consider implementing proper structure parsing for: ss_ssl_tls_service_profile

---

## quick_line (line 156)

**Anti-pattern:** `Simple negation pattern`

**Suggestion:** Rule uses ~[...] which may be too broad. Consider specific token types.

---
```

## Real-World Impact

### Before Smart Validation

```
validate-grammar output: 17,234 warnings
- Reference to undefined rule: ADDRESS_REGEX (appears 89 times)
- Reference to undefined rule: EVENT_TYPE (appears 67 times)
- Reference to undefined rule: MGMT_INTERFACE (appears 45 times)
... 17,000 more lines ...
```

Result: **Overwhelming, hard to act on**

### After Smart Validation

```
📊 Smart Validation Results

Total: 17,234 issues across 3 categories
Priority: Add 9 missing tokens

1. Undefined tokens (15,890 refs, 9 unique)
   → Add ADDRESS_REGEX, EVENT_TYPE, MGMT_INTERFACE, ...

2. Suspicious quantifiers (8 rules)
   → bgpp_export, srs_definition, sr_security_rules

3. Incomplete parsing (3 rules)
   → ss_ssl_tls_service_profile uses null_rest_of_line
```

Result: **Clear priorities, actionable fixes**

## Common Use Cases

### 1. First-time grammar validation

Use `smart-validate` with all features enabled:

```javascript
{
  "from_file": "MyGrammar.g4",
  "load_imports": true,
  "include_suggestions": true,
  "detect_quantifiers": true,
  "detect_incomplete": true
}
```

Gets you a comprehensive overview with prioritized fixes.

### 2. Debugging "unrecognized syntax" warnings

After seeing thousands of warnings, use `detect-quantifier-issues`:

```javascript
{
  "from_file": "MyGrammar.g4"
}
```

Finds rules where `?` should be `*` (most common cause of parsing failures).

### 3. Improving grammar completeness

Use `detect-incomplete-parsing`:

```javascript
{
  "from_file": "MyGrammar.g4"
}
```

Finds rules that discard content instead of parsing it.

### 4. Incremental validation

Use `validate-grammar` with `max_issues: 100` during development:

```javascript
{
  "from_file": "MyGrammar.g4",
  "max_issues": 100
}
```

Then use `smart-validate` for final comprehensive analysis.

## Benefits

### Aggregation

- **17,000 → 10 items** - Groups similar issues
- **Shows counts** - "89 references to ADDRESS_REGEX"
- **Prioritizes** - Most-referenced tokens first

### Pattern Detection

- **Finds root causes** - Not just symptoms
- **Suggests fixes** - Specific, actionable recommendations
- **Explains reasoning** - Why this pattern is suspicious

### Smart Suggestions

- **Context-aware patterns** - USERNAME includes @, ADDRESS includes dots
- **Reduces guesswork** - Based on naming conventions
- **Saves time** - Don't manually infer token patterns

## Parameters

### smart-validate

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `grammar_content` | string | required | Grammar file content |
| `from_file` | string | optional | Path to grammar file |
| `load_imports` | boolean | true | Load imported grammars |
| `base_path` | string | optional | Base directory for imports |
| `include_suggestions` | boolean | true | Generate token suggestions |
| `detect_quantifiers` | boolean | true | Detect suspicious ? patterns |
| `detect_incomplete` | boolean | true | Detect null_rest_of_line usage |

### detect-quantifier-issues

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `grammar_content` | string | required | Grammar file content |
| `from_file` | string | optional | Path to grammar file |

### detect-incomplete-parsing

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `grammar_content` | string | required | Grammar file content |
| `from_file` | string | optional | Path to grammar file |

## Implementation Details

### Aggregation Algorithm

1. **Group by category**: Undefined refs, quantifiers, null usage
2. **Count occurrences**: Track how many times each item appears
3. **Sort by frequency**: Most-referenced items first
4. **Generate suggestions**: Based on category and patterns

### Quantifier Detection

Checks for three patterns:

1. **Collection naming**: Rule name contains `_rule`, `_setting`, `_property` + uses `?`
2. **Multiple optionals**: Three or more `?` in sequence
3. **Repeated refs**: Same rule reference with `?` appears multiple times

### Token Suggestion Algorithm

Pattern-based heuristics (checked in order):

1. Contains `USERNAME` → includes `@` and `.`
2. Contains `ADDRESS` → includes `.` and `-`
3. Contains `INTERFACE` → includes `/` and `-`
4. Contains `EVENT` → alphanumeric
5. Ends with `_REGEX` → non-whitespace pattern
6. Ends with `_TYPE` → alphanumeric with dashes
7. Ends with `_ID` → identifier pattern
8. Default → generic alphanumeric

## Testing

Run comprehensive tests:

```bash
node test-smart-validation.cjs
```

Tests cover:
- Aggregation with multiple issue types
- Collection naming detection
- Multiple optional detection
- Repeated reference detection
- null_rest_of_line detection
- Broad negation detection
- Smart token suggestions
- Context-aware pattern generation
- Clean grammar validation (no false positives)

## Related Features

- **validate-grammar** - Basic validation with `max_issues` parameter
- **analyze-grammar** - Detailed analysis with `summary_only` parameter
- **suggest-tokens-from-errors** - Parse error logs and suggest tokens

## Best Practices

1. **Start with smart-validate** - Get a comprehensive overview
2. **Fix highest-impact issues first** - Most-referenced undefined tokens
3. **Address quantifier issues** - Most common cause of parse failures
4. **Replace null_rest_of_line** - Implement proper structure parsing
5. **Use specific tokens** - Avoid broad negation patterns
6. **Re-validate incrementally** - After each batch of fixes

## Limitations

- **Heuristic-based** - May have false positives/negatives
- **Pattern matching** - Not semantic analysis
- **Token suggestions** - Based on naming, may need refinement
- **No deep analysis** - Doesn't check for all grammar correctness issues

For comprehensive validation, combine with:
- Native ANTLR4 compiler warnings
- Real-world config testing
- Parser rule testing with actual inputs

## Examples

See `test-smart-validation.cjs` for complete working examples.
