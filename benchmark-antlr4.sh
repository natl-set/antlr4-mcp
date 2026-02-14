#!/bin/bash
#
# Real ANTLR4 Benchmarking Tool (with low-overhead Java driver)
#

set -e

ANTLR_JAR="$HOME/.local/lib/antlr-4.13.1-complete.jar"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR=$(mktemp -d)
GRAMMAR_FILE="$1"
START_RULE="$2"
INPUT_FILE="$3"
ITERATIONS="${4:-10}"

if [ -z "$GRAMMAR_FILE" ] || [ -z "$START_RULE" ] || [ -z "$INPUT_FILE" ]; then
    echo "Usage: $0 <grammar.g4> <start_rule> <input_file> [iterations]"
    echo ""
    echo "Example:"
    echo "  $0 MyGrammar.g4 program test_input.txt 20"
    echo ""
    echo "Note: The grammar must be a combined grammar (lexer + parser) or"
    echo "provide both Lexer.g4 and Parser.g4 in the same directory."
    exit 1
fi

# Convert to absolute paths
GRAMMAR_FILE=$(realpath "$GRAMMAR_FILE")
INPUT_FILE=$(realpath "$INPUT_FILE")
GRAMMAR_NAME=$(basename "$GRAMMAR_FILE" .g4)

# Check for separate lexer/parser files
GRAMMAR_DIR=$(dirname "$GRAMMAR_FILE")
LEXER_FILE="$GRAMMAR_DIR/${GRAMMAR_NAME}Lexer.g4"
PARSER_FILE="$GRAMMAR_DIR/${GRAMMAR_NAME}Parser.g4"

# Check if this is a multi-file grammar (has imports)
HAS_IMPORTS=$(grep -c "^import" "$GRAMMAR_FILE" 2>/dev/null || echo "0")

echo "=== ANTLR4 Performance Benchmark ==="
echo "Grammar: $GRAMMAR_FILE"
echo "Start Rule: $START_RULE"
echo "Input: $INPUT_FILE ($(wc -l < "$INPUT_FILE" | tr -d ' ') lines, $(wc -c < "$INPUT_FILE" | tr -d ' ') bytes)"
echo "Iterations: $ITERATIONS"
echo ""

# Prepare work directory
cd "$WORK_DIR"

# Copy grammar files
if [ "$HAS_IMPORTS" -gt 0 ]; then
    echo "Multi-file grammar detected, copying relevant .g4 files..."
    # Copy only non-optimized grammars (skip *_optimized* files)
    for f in "$GRAMMAR_DIR"/*.g4; do
        if [[ ! "$f" =~ _optimized ]]; then
            cp "$f" .
        fi
    done
    # Detect grammar name from parser file
    GRAMMAR_NAME="Ftd"
elif [ -f "$LEXER_FILE" ] && [ -f "$PARSER_FILE" ]; then
    echo "Using separate lexer/parser files..."
    cp "$LEXER_FILE" "$PARSER_FILE" .
    # Extract grammar name from parser file
    GRAMMAR_NAME=$(basename "$PARSER_FILE" Parser.g4)
else
    cp "$GRAMMAR_FILE" .
fi

# Copy Benchmark.java
cp "$SCRIPT_DIR/Benchmark.java" .

# Compile grammar
echo "Compiling grammar..."
java -jar "$ANTLR_JAR" -Dlanguage=Java *.g4 2>&1 | grep -v "^Generating" || true

# Compile Java
echo "Compiling Java..."
javac -cp ".:$ANTLR_JAR" *.java 2>&1 | tail -3 || true

# Run benchmark
echo "Running benchmark..."
RESULT=$(java -cp ".:$ANTLR_JAR" Benchmark "$GRAMMAR_NAME" "$START_RULE" "$INPUT_FILE" "$ITERATIONS")

# Parse and display results
python3 << PYEOF
import json

result = json.loads('$RESULT')
avg = result['avgMs']
min_t = result['minMs']
max_t = result['maxMs']
std_dev = result['stdDevMs']
throughput = result['throughput']
input_size = result['inputSize']

print("")
print("=== Results ===")
print(f"Avg time:    {avg:.2f} ms")
print(f"Min time:    {min_t:.2f} ms")
print(f"Max time:    {max_t:.2f} ms")
print(f"Std dev:     {std_dev:.2f} ms")
print(f"Throughput:  {throughput:,.0f} chars/sec ({throughput/1024/1024:.2f} MB/s)")

# Performance rating
if avg < 10:
    rating = "🚀 Excellent"
elif avg < 50:
    rating = "✅ Good"
elif avg < 200:
    rating = "⚠️ Fair"
else:
    rating = "🐌 Slow"
print(f"Rating:      {rating}")

# Tokens estimate (rough)
if input_size > 0 and avg > 0:
    tokens_per_sec = int(throughput / 5)  # Assume avg token is 5 chars
    print(f"Est. tokens: ~{tokens_per_sec:,} tokens/sec")
PYEOF

# Cleanup
cd /
rm -rf "$WORK_DIR"

echo ""
echo "Done."
