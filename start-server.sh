#!/bin/bash
# Wrapper script to start ANTLR4 MCP server with proper environment

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Ensure unbuffered output
export NODE_NO_WARNINGS=1

# Start the server
exec node dist/index.js
