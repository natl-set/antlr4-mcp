# Specification: test-parser-rule

## Overview

Validate whether input text matches a specific parser rule without full ANTLR4 compilation. Provides two approaches: quick validation and test harness generation.

## API Signature

```typescript
interface TestParserRuleResult {
  success: boolean;
  matched: boolean;
  message: string;
  tokens: TokenInfo[];
  details: {
    ruleStructure: string;
    inputStructure: string;
    mismatchPoint?: string;
    alternativeTried?: number;
  };
  testHarness?: {
    java?: string;
    javascript?: string;
    instructions: string;
  };
}

static testParserRule(
  grammarContent: string,
  ruleName: string,
  input: string,
  options?: {
    generateHarness?: boolean;
    harnessLanguage?: 'java' | 'javascript' | 'both';
    verbose?: boolean;
  }
): TestParserRuleResult
```

## Implementation Approach

### Phase 1: Quick Validation

#### Step 1: Tokenize Input
```typescript
// Reuse existing previewTokens logic
const tokens = this.previewTokens(grammarContent, input);
if (tokens.errors.length > 0) {
  return { 
    success: true, 
    matched: false, 
    message: `Tokenization failed: ${tokens.errors[0]}`,
    tokens: []
  };
}
```

#### Step 2: Parse Rule Definition
```typescript
// Extract rule from grammar
const analysis = this.analyze(grammarContent);
const rule = analysis.rules.find(r => r.name === ruleName);

// Parse rule structure
const structure = this.parseRuleStructure(rule.definition);
/*
Example rule: "s_external_list: EXTERNAL_LIST name=variable TYPE type=external_list_type;"
Parsed structure:
{
  sequence: [
    { type: 'token', name: 'EXTERNAL_LIST' },
    { type: 'rule', name: 'variable', label: 'name' },
    { type: 'token', name: 'TYPE' },
    { type: 'rule', name: 'external_list_type', label: 'type' }
  ]
}
*/
```

#### Step 3: Match Token Sequence

```typescript
function matchSequence(tokens, structure, position = 0) {
  for (const element of structure.sequence) {
    if (element.type === 'token') {
      if (position >= tokens.length || tokens[position].type !== element.name) {
        return { matched: false, position, expected: element.name };
      }
      position++;
    } else if (element.type === 'rule') {
      // Recursively match subrule
      const subruleResult = matchRule(tokens, element.name, position);
      if (!subruleResult.matched) {
        return subruleResult;
      }
      position = subruleResult.position;
    } else if (element.type === 'optional') {
      // Try to match, continue if fails
      const optResult = matchSequence(tokens, element, position);
      if (optResult.matched) {
        position = optResult.position;
      }
    } else if (element.type === 'repetition') {
      // Match 0 or more times
      while (position < tokens.length) {
        const repResult = matchSequence(tokens, element, position);
        if (!repResult.matched) break;
        position = repResult.position;
      }
    } else if (element.type === 'alternative') {
      // Try each alternative
      for (const alt of element.alternatives) {
        const altResult = matchSequence(tokens, alt, position);
        if (altResult.matched) {
          position = altResult.position;
          break;
        }
      }
    }
  }
  
  return { matched: true, position };
}
```

#### Step 4: Structure Parsing Helpers

```typescript
function parseRuleStructure(definition: string) {
  // Remove rule name and colon
  let body = definition.replace(/^[a-z_][a-z0-9_]*\s*:/i, '').trim();
  body = body.replace(/;$/, '').trim();
  
  return parseAlternatives(body);
}

function parseAlternatives(text: string) {
  // Split by | (but not inside parentheses)
  const alternatives = splitByPipe(text);
  
  if (alternatives.length === 1) {
    return parseSequence(alternatives[0]);
  }
  
  return {
    type: 'alternative',
    alternatives: alternatives.map(alt => parseSequence(alt))
  };
}

function parseSequence(text: string) {
  const elements = [];
  const tokens = tokenizeRuleBody(text);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'identifier') {
      // Check if it's a token (uppercase) or rule (lowercase)
      const isToken = /^[A-Z]/.test(token.value);
      
      // Check for label (name=value)
      let label = undefined;
      if (i > 0 && tokens[i-1].value === '=') {
        label = tokens[i-2].value;
        elements.pop(); // Remove '='
        elements.pop(); // Remove label
      }
      
      elements.push({
        type: isToken ? 'token' : 'rule',
        name: token.value,
        label
      });
    } else if (token.type === 'optional') {
      // Handle ? suffix
      const last = elements[elements.length - 1];
      elements[elements.length - 1] = {
        type: 'optional',
        element: last
      };
    } else if (token.type === 'star' || token.type === 'plus') {
      // Handle * or + suffix
      const last = elements[elements.length - 1];
      elements[elements.length - 1] = {
        type: 'repetition',
        element: last,
        min: token.type === 'plus' ? 1 : 0
      };
    }
  }
  
  return { type: 'sequence', elements };
}
```

### Phase 2: Test Harness Generation

#### Java Test Harness Template

```java
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.*;

public class {{GrammarName}}Test {
    public static void main(String[] args) {
        String input = "{{input}}";
        
        // Tokenize
        CharStream charStream = CharStreams.fromString(input);
        {{GrammarName}}Lexer lexer = new {{GrammarName}}Lexer(charStream);
        CommonTokenStream tokens = new CommonTokenStream(lexer);
        
        // Parse
        {{GrammarName}}Parser parser = new {{GrammarName}}Parser(tokens);
        
        // Error handling
        parser.removeErrorListeners();
        parser.addErrorListener(new BaseErrorListener() {
            @Override
            public void syntaxError(Recognizer<?, ?> recognizer, Object offendingSymbol,
                    int line, int charPositionInLine, String msg, RecognitionException e) {
                System.err.println("Parse error at " + line + ":" + charPositionInLine + " - " + msg);
            }
        });
        
        // Parse starting from specific rule
        ParserRuleContext tree = parser.{{ruleName}}();
        
        // Check for errors
        if (parser.getNumberOfSyntaxErrors() == 0) {
            System.out.println("✓ Successfully parsed with rule '{{ruleName}}'");
            System.out.println("\nParse tree:");
            System.out.println(tree.toStringTree(parser));
        } else {
            System.out.println("✗ Parse failed");
            System.exit(1);
        }
    }
}
```

#### JavaScript Test Harness Template

```javascript
import antlr4 from 'antlr4';
import {{GrammarName}}Lexer from './{{GrammarName}}Lexer.js';
import {{GrammarName}}Parser from './{{GrammarName}}Parser.js';

const input = "{{input}}";

// Tokenize
const chars = new antlr4.InputStream(input);
const lexer = new {{GrammarName}}Lexer(chars);
const tokens = new antlr4.CommonTokenStream(lexer);

// Parse
const parser = new {{GrammarName}}Parser(tokens);

// Error handling
class ErrorListener extends antlr4.error.ErrorListener {
    syntaxError(recognizer, offendingSymbol, line, column, msg, e) {
        console.error(`Parse error at ${line}:${column} - ${msg}`);
    }
}

parser.removeErrorListeners();
parser.addErrorListener(new ErrorListener());

// Parse starting from specific rule
const tree = parser.{{ruleName}}();

// Check for errors
if (parser.getNumberOfSyntaxErrors() === 0) {
    console.log("✓ Successfully parsed with rule '{{ruleName}}'");
    console.log("\nParse tree:");
    console.log(tree.toStringTree(parser.ruleNames));
} else {
    console.log("✗ Parse failed");
    process.exit(1);
}
```

## Edge Cases to Handle

1. **Labeled Elements**: `name=variable` should match variable rule
2. **Optional Elements**: `element?` may or may not be present
3. **Repetitions**: `element*` and `element+`
4. **Alternatives**: `a | b | c`
5. **Nested Rules**: Rules calling other rules
6. **Parenthesized Groups**: `(a b | c d)`
7. **Actions and Predicates**: `{action}` and `{predicate}?` - skip these
8. **EOF**: Ensure all input is consumed
9. **Whitespace**: Handle WS tokens correctly
10. **Labels on Alternatives**: `# label` at end of alternatives

## Testing Strategy

```javascript
// Test 1: Simple sequence
testParserRule(grammar, 'rule', 'TOKEN1 TOKEN2');
// Expected: matched=true

// Test 2: With optionals
testParserRule(grammar, 'rule', 'TOKEN1'); // TOKEN2 is optional
// Expected: matched=true

// Test 3: Wrong order
testParserRule(grammar, 'rule', 'TOKEN2 TOKEN1');
// Expected: matched=false, mismatchPoint="Expected TOKEN1, got TOKEN2"

// Test 4: Missing required token
testParserRule(grammar, 'rule', 'TOKEN1');
// Expected: matched=false, mismatchPoint="Expected TOKEN2, got EOF"

// Test 5: Generate harness
testParserRule(grammar, 'rule', 'input', { generateHarness: true });
// Expected: result.testHarness.java contains compilable Java code
```

## Integration with Existing Code

### Add to src/antlrAnalyzer.ts

```typescript
// After existing methods, add:
static testParserRule(...) { ... }
private static parseRuleStructure(...) { ... }
private static matchTokenSequence(...) { ... }
private static generateTestHarness(...) { ... }
```

### Add MCP Tool in src/index.ts

```typescript
{
  name: 'test-parser-rule',
  description: `Test whether input text matches a specific parser rule.
  
**When to use:** Validate rule syntax without full compilation, rapid iteration on rule development.

Example usage:
  rule_name: "s_external_list"
  input: "external-list mylist type ip"
  
Options:
  generate_harness: true  // Generate compilable test code
  harness_language: "java" // "java", "javascript", or "both"

Returns: Match result with detailed feedback, optionally including test harness code.`,
  inputSchema: { ... }
}
```

## Success Criteria

- ✅ Correctly identifies matching inputs (>90% accuracy for common patterns)
- ✅ Provides clear error messages for mismatches
- ✅ Generates compilable test harnesses
- ✅ Handles nested rules and alternatives
- ✅ Performance: < 100ms for typical rules

## Future Enhancements

1. **Caching**: Cache rule structure parsing
2. **Fuzzing**: Generate test inputs for a rule
3. **Coverage**: Track which rule paths were tested
4. **Visual Parse Tree**: Generate graphical representation
5. **Batch Testing**: Test multiple inputs against one rule
