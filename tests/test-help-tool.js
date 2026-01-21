#!/usr/bin/env node

/**
 * Test the new help tool
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Start the MCP server
const serverPath = join(__dirname, 'dist', 'index.js');
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let responseBuffer = '';

server.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  
  // Check if we have a complete JSON-RPC response
  const lines = responseBuffer.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('{') && line.includes('"result"')) {
      try {
        const response = JSON.parse(line);
        if (response.result && response.result.content) {
          console.log('=== HELP TOOL RESPONSE ===');
          console.log(response.result.content[0].text);
          console.log('\n=== TEST PASSED ===');
          server.kill();
          process.exit(0);
        }
      } catch (e) {
        // Not a complete JSON yet
      }
    }
  }
});

// Send initialization
setTimeout(() => {
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '0.1.0',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };
  server.stdin.write(JSON.stringify(initRequest) + '\n');
}, 100);

// After initialization, call the help tool
setTimeout(() => {
  const helpRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'help',
      arguments: {
        topic: 'overview'
      }
    }
  };
  server.stdin.write(JSON.stringify(helpRequest) + '\n');
}, 500);

// Timeout after 5 seconds
setTimeout(() => {
  console.error('Test timeout');
  server.kill();
  process.exit(1);
}, 5000);

