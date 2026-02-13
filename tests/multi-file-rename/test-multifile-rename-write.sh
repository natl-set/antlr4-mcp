#!/bin/bash

# Test multi-file rename functionality with actual file writing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANTLR_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "Testing multi-file rename with file writing..."
echo

# Build the project first
cd "$ANTLR_DIR"
npm run build > /dev/null 2>&1

# Create test files
TEST_DIR="$SCRIPT_DIR"
BASE_DIR="$TEST_DIR"

# Create fresh test files at the start
cat > "$TEST_DIR/CommonRules.g4" << 'EOF'
lexer grammar CommonRules;

// Common lexer rules
WS: [ \t\r\n]+ -> skip;
ID: [a-zA-Z_][a-zA-Z0-9_]*;
NUMBER: [0-9]+;
STRING: '"' ~["]* '"';
COMMENT: '//' ~[\r\n]* -> skip;
EOF

cat > "$TEST_DIR/MainGrammar.g4" << 'EOF'
parser grammar MainGrammar;

import CommonRules;

// Parser rules
program: statement* EOF;

statement: exprStmt | ifStmt;

exprStmt: expr ';';

ifStmt: 'if' expr statement;

expr: ID | NUMBER | STRING | '(' expr ')';
EOF

# Cleanup function
cleanup() {
  # Restore original files
  if [ -f "$TEST_DIR/CommonRules.g4.bak" ]; then
    mv "$TEST_DIR/CommonRules.g4.bak" "$TEST_DIR/CommonRules.g4" 2>/dev/null
  fi
  if [ -f "$TEST_DIR/MainGrammar.g4.bak" ]; then
    mv "$TEST_DIR/MainGrammar.g4.bak" "$TEST_DIR/MainGrammar.g4" 2>/dev/null
  fi
}

# Trap to ensure cleanup runs even on error
trap cleanup EXIT

echo "=== Test: Rename 'ID' to 'IDENTIFIER' across files ==="
echo

# Backup original files
cp "$TEST_DIR/CommonRules.g4" "$TEST_DIR/CommonRules.g4.bak"
cp "$TEST_DIR/MainGrammar.g4" "$TEST_DIR/MainGrammar.g4.bak"

echo "Original CommonRules.g4:"
grep -n "ID:" "$TEST_DIR/CommonRules.g4" || echo "  (no ID rule found)"
echo

echo "Original MainGrammar.g4:"
grep -n "ID" "$TEST_DIR/MainGrammar.g4" || echo "  (no ID references found)"
echo

# Run the rename with file writing
node -e "
const fs = require('fs');
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

const result = AntlrAnalyzer.renameRuleMultiFile(
  '$TEST_DIR/MainGrammar.g4',
  'ID',
  'IDENTIFIER',
  '$BASE_DIR'
);

console.log('Success:', result.success);
console.log('Message:', result.message);
console.log('Files to modify:', result.modifiedFiles.length);

if (result.success) {
  for (const f of result.modifiedFiles) {
    fs.writeFileSync(f.filePath, f.content);
    console.log('  Written:', f.filePath);
  }
}
"

echo
echo "Modified CommonRules.g4:"
grep -n "IDENTIFIER:" "$TEST_DIR/CommonRules.g4" || echo "  (no IDENTIFIER rule found)"
echo

echo "Modified MainGrammar.g4:"
grep -n "IDENTIFIER" "$TEST_DIR/MainGrammar.g4" || echo "  (no IDENTIFIER references found)"
echo

# Restore original files from backup
cp "$TEST_DIR/CommonRules.g4.bak" "$TEST_DIR/CommonRules.g4"
cp "$TEST_DIR/MainGrammar.g4.bak" "$TEST_DIR/MainGrammar.g4"
rm -f "$TEST_DIR/CommonRules.g4.bak" "$TEST_DIR/MainGrammar.g4.bak"

echo "=== Test: Rename 'expr' to 'expression' ==="
echo

# Backup original files
cp "$TEST_DIR/MainGrammar.g4" "$TEST_DIR/MainGrammar.g4.bak"

echo "Original MainGrammar.g4 (expr rule and references):"
grep -n "expr" "$TEST_DIR/MainGrammar.g4" || echo "  (no expr found)"
echo

# Run the rename
node -e "
const fs = require('fs');
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

const result = AntlrAnalyzer.renameRuleMultiFile(
  '$TEST_DIR/MainGrammar.g4',
  'expr',
  'expression',
  '$BASE_DIR'
);

console.log('Success:', result.success);
console.log('Message:', result.message);

if (result.success) {
  for (const f of result.modifiedFiles) {
    fs.writeFileSync(f.filePath, f.content);
    console.log('  Written:', f.filePath);
  }
}
"

echo
echo "Modified MainGrammar.g4:"
grep -n "expression" "$TEST_DIR/MainGrammar.g4" | head -5
COUNT=$(grep -c "expression" "$TEST_DIR/MainGrammar.g4")
if [ "$COUNT" -gt 5 ]; then
  echo "  ... (more matches)"
fi
echo

# Restore original file from backup
cp "$TEST_DIR/MainGrammar.g4.bak" "$TEST_DIR/MainGrammar.g4"
rm -f "$TEST_DIR/MainGrammar.g4.bak"

echo "All tests completed!"
