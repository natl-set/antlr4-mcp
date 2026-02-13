#!/bin/bash

# Test multi-file rename functionality

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANTLR_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "Testing multi-file rename..."
echo

# Build the project first
cd "$ANTLR_DIR"
npm run build > /dev/null 2>&1

# Create test files
TEST_DIR="$SCRIPT_DIR"
BASE_DIR="$TEST_DIR"

echo "=== Test 1: Rename 'expr' to 'expression' ==="
echo

# Backup original files
cp "$TEST_DIR/MainGrammar.g4" "$TEST_DIR/MainGrammar.g4.bak"

# Run the rename
node -e "
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');
const result = AntlrAnalyzer.renameRuleMultiFile(
  '$TEST_DIR/MainGrammar.g4',
  'expr',
  'expression',
  '$BASE_DIR'
);
console.log('Success:', result.success);
console.log('Message:', result.message);
console.log('Files modified:', result.modifiedFiles.length);
for (const f of result.modifiedFiles) {
  console.log('  -', f.filePath, '(' + f.refCount + ' refs)');
}
"

echo
echo "MainGrammar.g4 after rename:"
cat "$TEST_DIR/MainGrammar.g4"

# Restore original file
mv "$TEST_DIR/MainGrammar.g4.bak" "$TEST_DIR/MainGrammar.g4"

echo
echo "=== Test 2: Rename 'ID' to 'IDENTIFIER' ==="
echo

# Backup original files
cp "$TEST_DIR/CommonRules.g4" "$TEST_DIR/CommonRules.g4.bak"
cp "$TEST_DIR/MainGrammar.g4" "$TEST_DIR/MainGrammar.g4.bak"

# Run the rename
node -e "
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');
const result = AntlrAnalyzer.renameRuleMultiFile(
  '$TEST_DIR/MainGrammar.g4',
  'ID',
  'IDENTIFIER',
  '$BASE_DIR'
);
console.log('Success:', result.success);
console.log('Message:', result.message);
console.log('Files modified:', result.modifiedFiles.length);
for (const f of result.modifiedFiles) {
  console.log('  -', f.filePath, '(' + f.refCount + ' refs)');
}
"

echo
echo "CommonRules.g4 after rename:"
cat "$TEST_DIR/CommonRules.g4"
echo
echo "MainGrammar.g4 after rename:"
cat "$TEST_DIR/MainGrammar.g4"

# Restore original files
mv "$TEST_DIR/CommonRules.g4.bak" "$TEST_DIR/CommonRules.g4"
mv "$TEST_DIR/MainGrammar.g4.bak" "$TEST_DIR/MainGrammar.g4"

echo
echo "=== Test 3: Error handling - duplicate rule name ==="
node -e "
const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');
const result = AntlrAnalyzer.renameRuleMultiFile(
  '$TEST_DIR/MainGrammar.g4',
  'expr',
  'statement',
  '$BASE_DIR'
);
console.log('Success:', result.success);
console.log('Message:', result.message);
"

echo
echo "All tests completed!"
