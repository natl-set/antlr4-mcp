#!/bin/bash

echo "========================================"
echo "  ANTLR4-MCP - Complete Test Suite"
echo "========================================"
echo ""

total=0
passed=0
failed=0

run_test() {
    local name="$1"
    local file="$2"
    echo "Running: $name"
    if node "tests/$file" > /dev/null 2>&1; then
        echo "  ✅ PASSED"
        passed=$((passed + 1))
    else
        echo "  ❌ FAILED"
        failed=$((failed + 1))
    fi
    total=$((total + 1))
    echo ""
}

run_test "Data Loss Prevention (Basic)" "test-data-loss-prevention.cjs"
run_test "Data Loss Prevention (Comprehensive)" "test-comprehensive-data-loss.cjs"
run_test "Timeout Prevention" "test-validate-timeout.cjs"
run_test "Output Limiting Features" "test-output-limiting.cjs"
run_test "Diff Output Mode" "test-diff-output.cjs"
run_test "Multi-File Rename" "multi-file-rename/test-multifile-rename.cjs"
run_test "Lexer Modes" "test-lexer-modes.cjs"
run_test "Analysis Tools" "test-analysis-tools.cjs"
run_test "Bottleneck Analysis" "test-bottlenecks.cjs"

echo "========================================"
echo "  Test Summary"
echo "========================================"
echo "Total Test Suites: $total"
echo "Passed: $passed"
echo "Failed: $failed"
echo "========================================"

if [ $failed -eq 0 ]; then
    echo ""
    echo "🎉 All test suites passing!"
    echo ""
    exit 0
else
    echo ""
    echo "⚠️  Some test suites failed"
    echo ""
    exit 1
fi
