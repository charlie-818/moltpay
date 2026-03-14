#!/usr/bin/env node
/**
 * MCP Protocol Test
 *
 * Tests the MCP JSON-RPC protocol implementation by simulating
 * what an MCP client (like Claude Desktop) would send.
 */

const { spawn } = require('child_process');
const readline = require('readline');

const TEST_ENCRYPTION_KEY = 'test-mcp-encryption-key-32bytes!';

let messageId = 0;
function nextId() {
  return ++messageId;
}

function sendMessage(proc, message) {
  const json = JSON.stringify(message);
  console.log(`\n→ Sending: ${json.substring(0, 100)}${json.length > 100 ? '...' : ''}`);
  proc.stdin.write(json + '\n');
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MCP Protocol Test');
  console.log('='.repeat(60));
  console.log();

  // Spawn the MCP server
  console.log('Starting MCP server...');
  const serverProc = spawn('node', ['dist/bin/mcp-server.js'], {
    env: {
      ...process.env,
      MOLTPAY_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      MOLTPAY_NETWORK: 'devnet',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Collect responses
  const responses = [];
  let buffer = '';

  serverProc.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          console.log(`← Received: ${JSON.stringify(msg, null, 2).substring(0, 500)}`);
          responses.push(msg);
        } catch (e) {
          console.log(`← Raw: ${line}`);
        }
      }
    }
  });

  serverProc.stderr.on('data', (data) => {
    console.log(`[stderr] ${data.toString().trim()}`);
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 1: Initialize
  console.log('\n--- Test 1: Initialize ---');
  sendMessage(serverProc, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Send initialized notification
  sendMessage(serverProc, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 2: List Tools
  console.log('\n--- Test 2: List Tools ---');
  sendMessage(serverProc, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/list',
    params: {},
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 3: Call create_wallet tool
  console.log('\n--- Test 3: Call create_wallet ---');
  sendMessage(serverProc, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/call',
    params: {
      name: 'create_wallet',
      arguments: {},
    },
  });
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 4: Call get_balance tool
  console.log('\n--- Test 4: Call get_balance ---');
  // Extract wallet from previous response
  const walletResponse = responses.find(r => r.result?.content?.[0]?.text?.includes('publicKey'));
  let publicKey = null;
  if (walletResponse) {
    try {
      const walletData = JSON.parse(walletResponse.result.content[0].text);
      publicKey = walletData.publicKey;
    } catch (e) {}
  }

  if (publicKey) {
    sendMessage(serverProc, {
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: {
        name: 'get_balance',
        arguments: {
          publicKey: publicKey,
        },
      },
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test 5: Ping
  console.log('\n--- Test 5: Ping ---');
  sendMessage(serverProc, {
    jsonrpc: '2.0',
    id: nextId(),
    method: 'ping',
    params: {},
  });
  await new Promise(resolve => setTimeout(resolve, 500));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('PROTOCOL TEST SUMMARY');
  console.log('='.repeat(60));
  console.log();
  console.log(`Total responses received: ${responses.length}`);
  console.log();

  // Check each response
  let passed = 0;
  let failed = 0;

  for (const resp of responses) {
    if (resp.error) {
      console.log(`✗ Error in response ${resp.id}: ${resp.error.message}`);
      failed++;
    } else if (resp.result !== undefined) {
      console.log(`✓ Response ${resp.id}: OK`);
      passed++;
    }
  }

  console.log();
  console.log(`Results: ${passed} passed, ${failed} failed`);

  // Clean up
  serverProc.kill();
  console.log('\nServer stopped.');
}

runTests().catch(console.error);
